// src/components/ContractWriterPage/ContractWriterPage.tsx
// 근로계약서 작성 페이지 · 2026-08-04 · 11차 정정 종합 재구현
//
// 핵심 원칙:
//   "src/images/근로계약서1.jpg · 근로계약서2.jpg 이미지 그대로 구현"
//   앱 사용자 = 오산메가타운 대표 강남성 · 코스트팜 원본은 참고 양식
//
// 11가지 반영:
//   A. 완전 텍스트 (임금 8항목·정계 13사유·임금 단서 5조항·휴일 4조항·개인정보 4분류)
//   B. 자동계산 (기본급/연장/휴일/연차/4대보험/소득세/실수령 실시간)
//   C. 역산 로직 (포괄 → 실수령 · 목표 → 시급 · 실 근무시간 → 월급)
//   D. WageSummaryDualPanel (좌우 산정 비교 · 포괄임금 vs 실 근무시간)
//   E. SplitPanel 좌우 폭 조정 (기존 재사용 · localStorage)
//   F. 서명 재정비 (근로계약기간·퇴직금 제거 · 임금단서 3·4 추가)
//   G. 별도 서명 pad 섹션 완전 제거 · 인라인 spot + 서명 모달 UX
//   H. 도장 자동 (강남성 → sungstamp · 강남규 → kyustamp)
//   I. DEFAULT_EMPLOYER · 오산메가타운
//   J. 좌측 폼 · 컴팩트 표 형식 (2컬럼 grid · 옵션 접기)
//   K. 주 근무일수 자동 계산 (요일 체크박스 → 개수)

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NotePencil, User, ClipboardText, CalendarBlank, ClockClockwise, Money,
  Coffee, Notepad, Eraser, DownloadSimple, Warning, Check,
  Signature, ClockCounterClockwise, X as XIcon, Calculator, CaretDown,
} from "@phosphor-icons/react";
import SignaturePad from "react-signature-canvas";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";

import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import type { AuthSession, Employee } from "../../types";
import {
  loadContractSettings,
  DEFAULT_CONTRACT_SETTINGS,
  type ContractCategory,
} from "../ContractSettingsPage/ContractSettingsPage";
import SplitPanel from "../common/SplitPanel";
import sungstampUrl from "../../images/sungstamp.png";
import { useSettings, defaultWageForPosition, type WageRate } from "../../hooks/useSettings";
import kyustampUrl from "../../images/kyustamp.png";

type SignatureCanvasType = SignaturePad;

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────

interface ContractWriterPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  embedded?: boolean;
}

type DayKey = "월" | "화" | "수" | "목" | "금" | "토" | "일";

// 임금 8항목 · 이미지 표 그대로 · fixedAnnualLeave 신설
export interface WageComponentEntry {
  hours: number;    // 월평균 시간 (정수부)
  minutes: number;  // 분 (0~59)
  amount: number;   // 금액 (원)
}
export interface WageComponents {
  basicSalary: WageComponentEntry;         // 1. 기본급 (주휴수당 포함)
  fixedOvertime: WageComponentEntry;       // 2. (고정)연장근로수당 (1.5배)
  fixedHoliday: WageComponentEntry;        // 3. (고정)휴일근로수당 (1.5배)
  fixedHolidayOvertime: WageComponentEntry;// 4. (고정)휴일연장근로수당 (0.5배)
  fixedNight: WageComponentEntry;          // 5. (고정)야간근로수당 (0.5배)
  fixedAnnualLeave: WageComponentEntry;    // 6. (고정)연차휴가수당 (신설)
  mealAllowance: number;                   // 7. 식대 (비과세)
  vehicleAllowance: number;                // 8. 차량유지비 (비과세)
}

export interface PrivacyConsent {
  recipientName: string;
  recipientAddress: string;
  agreedCollection: boolean;
  agreedCCTV: boolean;
}

// 서명 지점 keys (근로계약기간·퇴직금 제거 · 임금단서 3·4 추가)
// T-D (2026-08-05): T6 카테고리 이해·동의 3개에 서명 pad 추가 (wageAck·workTimeAck·etcAck)
type SignKey =
  | "employer"        // 사업주 (갑) · 하단
  | "employee"        // 근로자 (을) · 하단
  | "privacy"         // 개인정보/CCTV
  | "specialWork"     // 소정근로시간 특별 사용 동의 (레거시 · 미사용 · 데이터 하위호환)
  | "breakChange"     // 휴게시간 변경 동의 (레거시 · 미사용 · 데이터 하위호환)
  | "wageClause3"     // 임금단서 3번 (레거시 · 미사용 · 데이터 하위호환)
  | "wageClause4"     // 임금단서 4번 (레거시 · 미사용 · 데이터 하위호환)
  | "etc5"            // 기타사항 5번 (레거시 · 미사용 · 데이터 하위호환)
  | "receipt"         // 수령자 확인 (계약서 교부)
  | "wageAck"         // T-D 임금 조항 카테고리 이해·동의 (T6 pad)
  | "workTimeAck"     // T-D 근로시간·휴게 카테고리 이해·동의 (T6 pad)
  | "etcAck"          // T-D 기타사항 카테고리 이해·동의 (T6 pad)
  ;

// 활성 서명 지점 · 승인 검증에 카운트되는 것만 (레거시 5개 제외 · T-D 3개 신규)
const SIGN_KEYS: SignKey[] = [
  "employer", "employee", "privacy",
  "wageAck", "workTimeAck", "etcAck",
  "receipt",
];

const SIGN_LABEL: Record<SignKey, string> = {
  employer:     "사업주 (갑) 하단",
  employee:     "근로자 (을) 하단",
  privacy:      "개인정보 · CCTV 동의",
  specialWork:  "소정근로시간 특별 사용 동의",
  breakChange:  "휴게시간 변경 동의",
  wageClause3:  "임금단서 3 (연차 포괄)",
  wageClause4:  "임금단서 4 (공휴일 포괄)",
  etc5:         "기타사항 5 (퇴직 시 연차 공제)",
  receipt:      "수령자 확인 (계약서 교부)",
  wageAck:      "임금 조항 이해·동의",
  workTimeAck:  "근로시간·휴게 조항 이해·동의",
  etcAck:       "기타사항 이해·동의",
};

interface ContractForm {
  // 근로자
  employeeId: number | null;
  employeeName: string;
  employeePhone: string;
  employeeAddress: string;
  employeeBirth: string;
  employeeBankAccount: string;
  // T-Q (2026-08-05) · 은행 · 계좌번호 · 통장사본 분리 (하위호환 · employeeBankAccount 유지)
  bankName: string;
  bankAccountNumber: string;
  bankbookImageUrl: string;
  employeeEmail: string;

  // 계약 유형
  contractType: string;
  contractMonths: string;

  // 근무 요일 (체크박스 7개) · weeklyDays 는 자동 파생
  workDays: Record<DayKey, boolean>;

  // 근무 시간
  startTime: string;
  endTime: string;
  breakMinutes: string;
  // 휴게시간 시작·종료 (선택 · 미입력 시 breakMinutes 기반 중간점 파생) · 법정 필수 표기 (근기법 §54)
  breakStart: string;
  breakEnd: string;

  // 시급 (실 근무 기반 · 역산 시 사용)
  weekdayHourly: string;
  weekendHourly: string;

  // 계약 기간
  startDate: string;
  endDate: string;
  indefinite: boolean;

  // 업무
  jobDuty: string;

  // 4대보험
  socialInsurance: boolean;

  // 추가 내용
  additionalContent: string;

  // 연차
  annualLeaveDays: string;

  // 직원 카테고리
  employeeCategory: "약사" | "매장" | "창고" | "기타";
  employeeCategoryCustom: string;
  primaryFocus: "매장" | "창고" | null;
  primaryFocusPercent: number;

  // 사업주 (편집 가능)
  employerName: string;
  companyName: string;
  companyAddress: string;
  companyRegNo: string;

  // 임금 세분화 (8항목)
  useWageComponents: boolean;
  wageComponents: WageComponents;

  // 개인정보/CCTV
  privacyConsent: PrivacyConsent;

  // 임금 지급일 자유 입력
  paymentDayText: string;

  // 계약체결일 (기본 = 시작일)
  contractSignDate: string;

  // T-A (2026-08-05) · 희망 월 세후 수령액 (원 단위 · 입력 즉시 8항목 역산)
  targetNetInput: string;

  // T6 · 카테고리별 이해·동의 (개별 조항 서명 대신 카테고리 하나씩)
  // - wage: 임금 조항 (단서 5개 전체)
  // - workTime: 근로시간·휴게 조항 (소정근로·휴게 변경)
  // - etc: 기타사항 5개 (5번 퇴직 시 연차 공제 포함)
  clauseAcks: {
    wage: boolean;
    workTime: boolean;
    etc: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────

const DAYS: DayKey[] = ["월", "화", "수", "목", "금", "토", "일"];
const WEEKDAYS: DayKey[] = ["월", "화", "수", "목", "금"];
const WEEKEND: DayKey[] = ["토", "일"];

const CONTRACT_TYPES = ["정규직", "계약직", "알바", "일용", "인턴"];
const START_TIMES = ["08:00", "09:00", "09:30", "10:00", "11:00", "12:00", "13:00", "14:00"];
const END_TIMES  = ["15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];

const CUSTOM_OPTION = "__custom__";

// T-Q (2026-08-05) · 은행 목록 (드롭다운) · "기타" 선택 시 자유 텍스트 fallback
const BANK_LIST: string[] = [
  "국민", "신한", "하나", "우리", "NH농협", "기업", "SC제일", "씨티", "카카오뱅크", "토스뱅크", "기타",
];

// T-S (2026-08-05) · 휴게 시간대 드롭다운 옵션 · 1시간 간격 (근무시간 커버 · 8~22시)
const BREAK_TIME_OPTIONS: string[] = [
  "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00",
  "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00",
];

// 회사 기본값 (오산 메가타운 약국)
const DEFAULT_EMPLOYER: Partial<ContractForm> = {
  employerName: "강남성",
  companyName: "오산 메가타운 약국",
  companyAddress: "경기도 오산시 경기대로 868-4 2층",
  companyRegNo: "",
};

// 시간 상수 (포괄임금 산정 · 스펙 · 계약서 이미지 원본)
// 중요: OVERTIME(55.94) · HOLIDAY(22.00) 은 "이미 1.5배 가산이 반영된 시간"
//   · 실 연장 = 55.94 ÷ 1.5 = 37.29h · 주 8.58h
//   · 실 휴일 = 22 ÷ 1.5 = 14.67h · 월 1.83일
//   · 계산식에서 × 1.5 를 곱하면 안 됨 (2중 가산)
const WAGE_HOURS = {
  BASIC: 209,        // 기본급 (주40 + 주휴 8) × 4.3452 ≈ 209
  OVERTIME: 55.94,   // 연장 (월평균) · 1.5배 가산 반영됨
  HOLIDAY: 22.00,    // 휴일 (월평균) · 1.5배 가산 반영됨
  ANNUAL_LEAVE: 10.00, // 연차 (월평균 · 가산 없음)
} as const;

// T-P (2026-08-05) · 세전 총액 divisor · 통상시급 하나로 모든 항목 계산
//   세전 = 통상시급 × (209 + 55.94 + 22 + 10) = 통상시급 × 296.94
const WAGE_DIVISOR = WAGE_HOURS.BASIC + WAGE_HOURS.OVERTIME + WAGE_HOURS.HOLIDAY + WAGE_HOURS.ANNUAL_LEAVE;

// 4대보험 요율 (근로자 부담)
const INSURANCE_RATES = {
  PENSION: 0.045,      // 국민연금 4.5%
  HEALTH: 0.03545,     // 건강보험 3.545%
  LTC_RATIO: 0.1295,   // 장기요양 = 건강 × 12.95%
  EMPLOYMENT: 0.009,   // 고용보험 0.9%
} as const;

// 정계 및 근로계약 해지 사유 (13개 · 이미지 원본 문구)
const DISCIPLINE_REASONS: string[] = [
  "부정 및 허위 등의 방법으로 채용된 자",
  "업무상 비밀 및 기밀을 누설하여 회사에 피해를 입힌 자",
  "회사의 명예 또는 신용에 손상을 입힌 자",
  "회사의 영업을 방해하는 언행을 한 자",
  "회사의 규율과 상사의 정당한 지시를 어겨 질서를 문란하게 한 자",
  "정당한 이유 없이 회사의 물품 및 금품을 반출한 자",
  "직무를 이용하여 부당한 이익을 취한 자",
  "회사가 정한 복무규정을 위반한 자",
  "직장 내 성희롱 행위를 한 자",
  "직장 내 괴롭힘 행위를 한 자",
  "무단으로 결근한 자",
  "근무태도나 근무성적이 극히 불량하고 개선의 여지가 없다고 판단되는 자",
  "기타 이에 준하는 행위로 징계 및 근로계약 해지가 필요하다고 판단되는 행위를 한 경우",
];

// 휴일 및 휴무 (4조항)
const HOLIDAY_CLAUSES: string[] = [
  "1주 동안 소정근로일을 개근한 경우에는 주 1회의 유급주휴일을 부여하되, 주휴일은 일요일로 한다. 다만, 1주일의 소정근로시간이 15시간 미만인 경우와 해당 주에 결근 시에는 주휴수당을 지급하지 아니한다.",
  "근로자의 날은 유급휴일로 한다.",
  "토요일은 무급휴무일로 한다.",
  "「관공서의 공휴일에 관한 규정」 제2조 각 호(제1호는 제외한다)에 따른 공휴일 및 같은 영 제3조에 따른 대체공휴일은 유급휴일로 한다. 다만, 근로자대표와 서면으로 합의한 경우 특정한 근로일로 대체할 수 있으며, 보상 휴가 부여도 가능합니다. (상시 근로자 수가 5인 미만인 경우에는 적용을 제외한다.)",
];

// 임금 단서 조항 5개
const WAGE_CLAUSES: string[] = [
  "상기 월 급여 총액에는 (고정)연장·휴일시간에 대한 (고정)연장·휴일근로수당이 포함되어 있으며, 추가 연장 및 휴일근무는 근무일 및 휴무일(휴일) 상황에 맞게 수행할 수 있고, 매달 수행 가능한 연장 및 휴일 근무의 범위는 상기에 기재된 연장 및 휴일근로시간으로 한다.",
  "약국의 업무 특성상 불규칙한 근무로 인해 월 급여 총액에는 월간 기본근로일, 기본 근로시간 외 추가근무를 고려하여 책정한 상기의 연장, 휴일, 야간 근로시간에 대한 수당의 사전 산입에 을은 자유로운 의사로 동의한다.",
  "\"을\"은 연차휴가수당을 월 지급액에 포괄하여 지급받음에 동의하고, \"갑\"은 \"을\"의 자유로운 연차휴가사용을 보장하되 \"을\"이 연차유급휴가를 사용할 경우 기 지급된 수당을 차감하여 정산한다. 또한, 연차휴가수당은 해당 월에 회사가 정한 징계사유에 해당하지 않아서 만근한 경우에 지급한다.",
  "\"을\"은 관공서 공휴일 및 근로자의 날 근무로 발생하는 휴일근로 수당을 연봉에 포괄하여 (年 22일 근로에 가산을 반영한 휴일근로수당) 매달 임금으로 지급 받음에 자유로운 의사로 동의한다.",
  "관리 편의상 사전에 책정한 상기의 (고정) 근로시간을 상회하여 연장·휴일근로를 한 경우에는 상기 총액과는 별도로 추가수당(상시 근로자가 5인 미만인 경우 근로기준법 제56조의 적용을 제외한다.)을 지급한다. 단, 추가수당을 인정하는 경우는 회사의 사전 지시나 승인이 있는 경우에 한한다.",
];

const WAGE_CLAUSE_EXTRA = "지각, 조퇴 시에는 해당 시간 분을 공제하며, 결근 및 해당 월에 중간 입·퇴사의 경우 일할 계산하여 임금을 지급한다.";

// 기타 사항 (5개)
const ETC_ITEMS: string[] = [
  "임금 지급방법 : '을'에게 직접 지급 또는 '을'이 지정한 예금 통장에 입금한다.",
  "'갑'과 '을'은 상기 임금내역을 회사 내의 타 근로자에게 누설하지 아니한다.",
  "임의 퇴사하고자 하는 경우에는 30일 전에 미리 회사에 알려야 하며, 사직서 제출 후 사용자의 수리가 있기 전까지는 '갑'이 지정하는 자에게 인수인계를 하는 등 제반업무를 수행하여야 한다.",
  "'갑'과 '을'은 성실한 근로관계가 형성되도록 노력하며 본 계약 이외의 사항에 대하여는 노동관계법, 취업규칙, 기타 회사가 정한 방침에 따른다.",
  "'을'은 퇴직 시 과다 부여된 연차휴가 및 수당에 대해 '갑'이 '을'의 임금 및 퇴직금에 공제하여 지급하는 것에 동의한다.",
];

// 개인정보 항목 (4분류)
const PRIVACY_ITEMS: string[] = [
  "성명, 주민번호, 피부양자정보, 주소, 이메일, 휴대전화번호 등 연락처",
  "학력, 근무경력과 계좌번호 등 금융정보",
  "기타 근로와 관련된 개인정보",
  "사진, 화상영상(CCTV)",
];

// ─────────────────────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────────────────────

const fmtWon = (v: string | number): string => {
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9-]/g, ""));
  if (!Number.isFinite(n) || n === 0) return "0";
  return n.toLocaleString("ko-KR");
};

const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmtKoreanDate = (iso: string): string => {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
};

// 임금 세분화 · 총액 산출 (8항목 합)
function computeWageTotal(w: WageComponents): number {
  return (
    (w.basicSalary?.amount ?? 0) +
    (w.fixedOvertime?.amount ?? 0) +
    (w.fixedHoliday?.amount ?? 0) +
    (w.fixedHolidayOvertime?.amount ?? 0) +
    (w.fixedNight?.amount ?? 0) +
    (w.fixedAnnualLeave?.amount ?? 0) +
    (w.mealAllowance ?? 0) +
    (w.vehicleAllowance ?? 0)
  );
}

// 시간 문자열 (HH:MM) 파싱
function parseHM(s: string): { h: number; m: number } | null {
  const mm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!mm) return null;
  const h = Number(mm[1]);
  const m = Number(mm[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { h, m };
}

// 근무시간 → 월 근로시간 계산 (근기법 표준 · 주당 × 4.345)
// 근로자 이익 보호 · Math.ceil 로 올림 (반내림 시 임금 손실 방지)
function computeMonthlyHours(startTime: string, endTime: string, breakMinutes: number, weeklyDays: number): {
  dailyMinutes: number;
  weeklyMinutes: number;
  monthlyMinutes: number;
  monthlyHours: number;
  monthlyHoursInt: number;
  monthlyMinutesRem: number;
} | null {
  const s = parseHM(startTime);
  const e = parseHM(endTime);
  if (!s || !e) return null;
  const rawMin = (e.h * 60 + e.m) - (s.h * 60 + s.m);
  if (rawMin <= 0) return null;
  const dailyMinutes = Math.max(0, rawMin - Math.max(0, breakMinutes));
  const weeklyMinutes = dailyMinutes * Math.max(0, weeklyDays);
  // 근로자 이익 보호 · 올림 (반내림 시 임금 손실 방지)
  const monthlyMinutes = Math.ceil(weeklyMinutes * 4.345);
  const monthlyHours = monthlyMinutes / 60;
  const monthlyHoursInt = Math.floor(monthlyMinutes / 60);
  const monthlyMinutesRem = monthlyMinutes % 60;
  return { dailyMinutes, weeklyMinutes, monthlyMinutes, monthlyHours, monthlyHoursInt, monthlyMinutesRem };
}

// #220 · 개월수 산출 (연장 baseline)
function contractPeriodMonthsClient(startIso?: string | null, endIso?: string | null): number | null {
  if (!startIso || !endIso) return null;
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (e.getTime() < s.getTime()) return null;
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() >= s.getDate() - 1) months += 1;
  return months > 0 ? months : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 자동계산 (B/C/D)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * T-P (2026-08-05) · 시급 → 포괄임금 4항목 · 계약서 이미지 원본 스펙
 *   · 통상시급 = 주중시급 (표준 · 약국 관례)
 *   · 기본급 = 통상시급 × 209                (주휴 포함)
 *   · 연장   = 통상시급 × 55.94              (이미 1.5배 가산 반영된 시간)
 *   · 휴일   = 통상시급 × 22                 (이미 1.5배 가산 반영된 시간)
 *   · 연차   = 통상시급 × 10                 (가산 없음)
 *   · we 인자는 하위호환 유지 (사용 안 함)
 */
function computeWageFromHourly(weekdayHourly: number, _weekendHourly: number): {
  basicAmount: number;
  overtimeAmount: number;
  holidayAmount: number;
  annualLeaveAmount: number;
  total: number;
} {
  const w = Math.max(0, weekdayHourly); // 통상시급 = 주중시급
  const basicAmount = Math.round(WAGE_HOURS.BASIC * w);
  const overtimeAmount = Math.round(WAGE_HOURS.OVERTIME * w);
  const holidayAmount = Math.round(WAGE_HOURS.HOLIDAY * w);
  const annualLeaveAmount = Math.round(WAGE_HOURS.ANNUAL_LEAVE * w);
  return {
    basicAmount, overtimeAmount, holidayAmount, annualLeaveAmount,
    total: basicAmount + overtimeAmount + holidayAmount + annualLeaveAmount,
  };
}

/**
 * T-P (2026-08-05) · 시급 + 각 항목 시간·분 → 임금구성 6항목 금액 산출 · 계약서 이미지 원본 스펙
 *   · 통상시급 = 주중시급 (표준 · 약국 관례 · UI 는 두 시급 입력 유지)
 *   · 기본급              = 통상시급 × basicH                  (배수 1.0 · 주휴 포함)
 *   · (고정)연장근로수당  = 통상시급 × overtimeH                (배수 X · 시간에 이미 반영)
 *   · (고정)휴일근로수당  = 통상시급 × holidayH                 (배수 X · 시간에 이미 반영)
 *   · (고정)휴일연장근로수당 = 통상시급 × holidayOvertimeH × 0.5 (0.5배 가산 · 심야/연장 할증)
 *   · (고정)야간근로수당   = 통상시급 × nightH × 0.5           (0.5배 가산)
 *   · (고정)연차휴가수당   = 통상시급 × annualH                 (배수 없음)
 *   · 식대·차량유지비 · 사용자 입력 유지 (별도)
 *   · 각 항목 시간·분 · WageComponents 에서 그대로 사용 (사용자 미세 조정 반영)
 *   · weekendHourly 인자는 하위호환 유지 (통상시급 계산에는 사용 안 함)
 */
function computeWageFromHourlyDual(
  weekdayHourly: number,
  _weekendHourly: number,
  wage: WageComponents,
): {
  basicAmount: number;
  overtimeAmount: number;
  holidayAmount: number;
  holidayOvertimeAmount: number;
  nightAmount: number;
  annualLeaveAmount: number;
  total: number;
} {
  const w = Math.max(0, weekdayHourly); // 통상시급 = 주중시급
  const hoursOf = (e: WageComponentEntry) => Math.max(0, e.hours) + Math.max(0, e.minutes) / 60;
  const basicH = hoursOf(wage.basicSalary);
  const overtimeH = hoursOf(wage.fixedOvertime);
  const holidayH = hoursOf(wage.fixedHoliday);
  const holidayOtH = hoursOf(wage.fixedHolidayOvertime);
  const nightH = hoursOf(wage.fixedNight);
  const annualH = hoursOf(wage.fixedAnnualLeave);
  const basicAmount           = Math.round(basicH     * w);
  const overtimeAmount        = Math.round(overtimeH  * w);
  const holidayAmount         = Math.round(holidayH   * w);
  const holidayOvertimeAmount = Math.round(holidayOtH * w * 0.5);
  const nightAmount           = Math.round(nightH     * w * 0.5);
  const annualLeaveAmount     = Math.round(annualH    * w);
  return {
    basicAmount, overtimeAmount, holidayAmount, holidayOvertimeAmount, nightAmount, annualLeaveAmount,
    total: basicAmount + overtimeAmount + holidayAmount + holidayOvertimeAmount + nightAmount + annualLeaveAmount,
  };
}

/**
 * T-P (2026-08-05) · 목표 월급 → 통상시급 · 계약서 이미지 원본 스펙
 *   총액 = 통상시급 × (BASIC + OVERTIME + HOLIDAY + ANNUAL_LEAVE)
 *        = 통상시급 × (209 + 55.94 + 22 + 10)
 *        = 통상시급 × 296.94
 *   * OVERTIME·HOLIDAY 는 이미 1.5배 가산 반영된 시간이므로 배수 곱하지 않음
 */
function computeHourlyFromTarget(targetTotal: number): number {
  if (WAGE_DIVISOR <= 0) return 0;
  return Math.round(Math.max(0, targetTotal) / WAGE_DIVISOR);
}

/**
 * 실 근무시간 기반 월급 (약사 실무)
 *   월 실근무 (주중) × 주중시급 + 월 실근무 (주말) × 주말시급
 *   * weeklyWeekdayDays · 주중 근무일수 (0~5)
 *   * weeklyWeekendDays · 주말 근무일수 (0~2)
 */
function computeActualPay(
  startTime: string,
  endTime: string,
  breakMinutes: number,
  weeklyWeekdayDays: number,
  weeklyWeekendDays: number,
  weekdayHourly: number,
  weekendHourly: number,
): {
  dailyHours: number;
  weekdayMonthlyHours: number;
  weekendMonthlyHours: number;
  weekdayPay: number;
  weekendPay: number;
  total: number;
} | null {
  const s = parseHM(startTime);
  const e = parseHM(endTime);
  if (!s || !e) return null;
  const rawMin = (e.h * 60 + e.m) - (s.h * 60 + s.m);
  if (rawMin <= 0) return null;
  const dailyMin = Math.max(0, rawMin - Math.max(0, breakMinutes));
  const dailyHours = dailyMin / 60;
  // 근로자 이익 보호 · 월 근로시간 올림 · 분 단위 ceil 후 시간 환산
  const weekdayMonthlyMinutes = Math.ceil(dailyMin * Math.max(0, weeklyWeekdayDays) * 4.345);
  const weekendMonthlyMinutes = Math.ceil(dailyMin * Math.max(0, weeklyWeekendDays) * 4.345);
  const weekdayMonthlyHours = weekdayMonthlyMinutes / 60;
  const weekendMonthlyHours = weekendMonthlyMinutes / 60;
  const weekdayPay = Math.round(weekdayMonthlyHours * Math.max(0, weekdayHourly));
  const weekendPay = Math.round(weekendMonthlyHours * Math.max(0, weekendHourly));
  return {
    dailyHours,
    weekdayMonthlyHours,
    weekendMonthlyHours,
    weekdayPay,
    weekendPay,
    total: weekdayPay + weekendPay,
  };
}

/** 4대보험 · 근로자 부담 */
function computeInsurance(gross: number): {
  pension: number;   // 국민연금
  health: number;    // 건강보험
  ltc: number;       // 장기요양
  employment: number;// 고용보험
  total: number;
} {
  const g = Math.max(0, gross);
  const pension = Math.round(g * INSURANCE_RATES.PENSION);
  const health = Math.round(g * INSURANCE_RATES.HEALTH);
  const ltc = Math.round(health * INSURANCE_RATES.LTC_RATIO);
  const employment = Math.round(g * INSURANCE_RATES.EMPLOYMENT);
  return { pension, health, ltc, employment, total: pension + health + ltc + employment };
}

/** 소득세 근사 (부양가족 1인) + 지방소득세 */
function computeIncomeTax(gross: number): { incomeTax: number; localTax: number; total: number } {
  const incomeTax = Math.max(0, Math.round((gross - 1_500_000) * 0.08));
  const localTax = Math.round(incomeTax * 0.1);
  return { incomeTax, localTax, total: incomeTax + localTax };
}

/** 실수령액 = 세전 - 4대보험 - 소득세 - 지방소득세 */
function computeNetPay(gross: number): {
  insurance: ReturnType<typeof computeInsurance>;
  tax: ReturnType<typeof computeIncomeTax>;
  net: number;
} {
  const insurance = computeInsurance(gross);
  const tax = computeIncomeTax(gross);
  return { insurance, tax, net: Math.max(0, gross - insurance.total - tax.total) };
}

/**
 * T-O (2026-08-05) · 세후 목표 → 세전 총액 역산 (사용자 실무 기준)
 *   · 4대보험 근로자 부담 9.09% 만 반영 (소득세·지방소득세 제외)
 *   · 임금구성 표시 실무 관례: 원천징수는 별도 · 세전/세후 표시엔 4대보험만
 *   · 예: 세후 6,000,000 → 세전 6,600,660 (사용자 기대치 660만원)
 *   · 예: 세후 5,000,000 → 세전 5,500,550
 */
function reverseGrossFromNet(targetNet: number): number {
  if (targetNet <= 0) return 0;
  const insuranceRate = 0.0909; // 4대보험 근로자 부담 합계 근사
  return Math.round(targetNet / (1 - insuranceRate));
}

/**
 * T-P (2026-08-05) · 세후 목표 → 통상시급 · 4항목 임금구성 역산 · 계약서 이미지 원본 스펙
 *   1) 세후 → 세전 (reverseGrossFromNet · 4대보험만)
 *   2) 세전 → 통상시급: w = 세전 / 296.94  (296.94 = 209 + 55.94 + 22 + 10)
 *   3) 4항목: basic 209h·연장 55.94h·휴일 22h·연차 10h (모두 통상시급 × 시간 · 배수 없음)
 *      · OVERTIME·HOLIDAY 시간은 이미 1.5배 가산 반영됨
 */
function reverseWageFromNet(
  targetNet: number,
  prevWage: WageComponents,
): { hourly: number; gross: number; wage: WageComponents } {
  const gross = reverseGrossFromNet(targetNet);
  const hourly = WAGE_DIVISOR > 0 ? Math.round(gross / WAGE_DIVISOR) : 0;
  const basicAmount        = Math.round(WAGE_HOURS.BASIC * hourly);
  const overtimeAmount     = Math.round(WAGE_HOURS.OVERTIME * hourly);
  const holidayAmount      = Math.round(WAGE_HOURS.HOLIDAY * hourly);
  const annualLeaveAmount  = Math.round(WAGE_HOURS.ANNUAL_LEAVE * hourly);
  const wage: WageComponents = {
    ...prevWage,
    basicSalary:      { hours: 209, minutes: 0,  amount: basicAmount },
    fixedOvertime:    { hours: 55,  minutes: 56, amount: overtimeAmount },
    fixedHoliday:     { hours: 22,  minutes: 0,  amount: holidayAmount },
    fixedAnnualLeave: { hours: 10,  minutes: 0,  amount: annualLeaveAmount },
    // 식대·차량·야간·휴일연장 · 사용자 입력 유지
  };
  return { hourly, gross, wage };
}

/**
 * T-N (2026-08-05) · 세후 목표 → 주중/주말 시급 · 6항목 임금구성 역산 (약국 실무)
 *   · 두 시급 비율 유지 · 스케일 팩터 방식
 *   · 각 항목 시간·분 (기본 209/55.94/22/0/0/10) · 유지 (사용자 미세 조정 반영)
 *
 * 알고리즘:
 *   1) 세후 → 세전 목표 (reverseGrossFromNet · 4대보험+소득세 근사)
 *   2) 현재 시급 (주중·주말) · 임금구성 시간 · 로 세전 총액 계산 (currentGross)
 *   3) 스케일 팩터 = 세전 목표 / currentGross
 *   4) 두 시급 · 각각 스케일 팩터 적용 · 비율 유지 · 반올림
 *   5) 조정된 두 시급 · 임금구성 각 항목 금액 재계산
 *
 * · 사용자가 세후만 입력한 초기 상태 (시급 0) 는 default 시급 (약사 35000/40000) 사용
 * · 사용자 미세 조정 (야간·휴일연장·식대·차량) 은 유지
 */
function reverseWageFromNetDual(
  targetNet: number,
  currentWeekdayHourly: number,
  currentWeekendHourly: number,
  prevWage: WageComponents,
): {
  weekdayHourly: number;
  weekendHourly: number;
  gross: number;
  wage: WageComponents;
} {
  const gross = reverseGrossFromNet(targetNet);

  // 기준 시급 · 사용자 입력 있으면 그대로, 없으면 default (약사 35000/40000 · 비율 7:8 근사)
  const wdBase = currentWeekdayHourly > 0 ? currentWeekdayHourly : 35000;
  const weBase = currentWeekendHourly > 0 ? currentWeekendHourly : 40000;

  // 현재 시급 기반 세전 총액 계산 (6항목 · 식대·차량 제외)
  const baseCalc = computeWageFromHourlyDual(wdBase, weBase, prevWage);
  const currentGross = baseCalc.total;

  // 스케일 팩터 · 세전 목표 / 현재 세전
  const scale = currentGross > 0 ? gross / currentGross : 0;
  const weekdayHourly = Math.round(wdBase * scale);
  const weekendHourly = Math.round(weBase * scale);

  // 조정 후 재계산 · 반올림 오차 반영
  const finalCalc = computeWageFromHourlyDual(weekdayHourly, weekendHourly, prevWage);

  const wage: WageComponents = {
    ...prevWage,
    basicSalary:          { ...prevWage.basicSalary,          amount: finalCalc.basicAmount },
    fixedOvertime:        { ...prevWage.fixedOvertime,        amount: finalCalc.overtimeAmount },
    fixedHoliday:         { ...prevWage.fixedHoliday,         amount: finalCalc.holidayAmount },
    fixedHolidayOvertime: { ...prevWage.fixedHolidayOvertime, amount: finalCalc.holidayOvertimeAmount },
    fixedNight:           { ...prevWage.fixedNight,           amount: finalCalc.nightAmount },
    fixedAnnualLeave:     { ...prevWage.fixedAnnualLeave,     amount: finalCalc.annualLeaveAmount },
    // 식대·차량 · 사용자 입력 유지
  };
  return { weekdayHourly, weekendHourly, gross, wage };
}

// ─────────────────────────────────────────────────────────────────────────────
// 기본 폼
// ─────────────────────────────────────────────────────────────────────────────

const emptyForm = (): ContractForm => ({
  employeeId: null,
  employeeName: "",
  employeePhone: "",
  employeeAddress: "",
  employeeBirth: "",
  employeeBankAccount: "",
  bankName: "",
  bankAccountNumber: "",
  bankbookImageUrl: "",
  employeeEmail: "",
  contractType: "정규직",
  contractMonths: "2",
  workDays: { "월": true, "화": true, "수": true, "목": true, "금": true, "토": false, "일": false },
  startTime: "10:00",
  endTime: "19:00",
  breakMinutes: "60",
  // T-G (2026-08-05) · 휴게시간 default 12:00-13:00 (근기법 §54 4시간당 30분 · 8시간당 1시간)
  breakStart: "12:00",
  breakEnd: "13:00",
  // T-I (2026-08-05) · 시급 default · 약사 기본 (실제로는 useSettings 훅으로 자동 로드됨)
  //   · 이전: "12000"/"13500" → 자동 로드 감지 조건에 사용되어 초기 상태 fallback 만 담당
  //   · 신규: 약사 기본 (35000/40000) · 자동 로드 조건과 함께 갱신
  weekdayHourly: "35000",
  weekendHourly: "40000",
  startDate: todayIso(),
  endDate: "",
  indefinite: true,
  jobDuty: "약국 카운터 · OTC 판매 · 재고 관리",
  socialInsurance: true,
  additionalContent: "",
  annualLeaveDays: "15",
  employeeCategory: "매장",
  employeeCategoryCustom: "",
  primaryFocus: "매장",
  primaryFocusPercent: 70,
  employerName: (DEFAULT_EMPLOYER.employerName as string) ?? "",
  companyName:  (DEFAULT_EMPLOYER.companyName as string) ?? "",
  companyAddress: (DEFAULT_EMPLOYER.companyAddress as string) ?? "",
  companyRegNo: (DEFAULT_EMPLOYER.companyRegNo as string) ?? "",
  useWageComponents: true,
  wageComponents: {
    basicSalary:          { hours: 209, minutes: 0,  amount: 4671298 },
    fixedOvertime:        { hours: 55,  minutes: 56, amount: 1250408 },
    fixedHoliday:         { hours: 22,  minutes: 0,  amount: 491716  },
    fixedHolidayOvertime: { hours: 0,   minutes: 0,  amount: 0       },
    fixedNight:           { hours: 0,   minutes: 0,  amount: 0       },
    fixedAnnualLeave:     { hours: 10,  minutes: 0,  amount: 223508  },
    mealAllowance:        0,
    vehicleAllowance:     0,
  },
  privacyConsent: {
    recipientName: "",
    recipientAddress: "",
    agreedCollection: true,
    agreedCCTV: true,
  },
  paymentDayText: "당월 01일부터 당월 말일 까지 근로한 부분에 대하여 당월 말일에 '을' 본인 명의의 통장으로 지급한다.",
  contractSignDate: todayIso(),
  targetNetInput: "",
  clauseAcks: { wage: false, workTime: false, etc: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// 공통 소형 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

const SelectOrCustom: React.FC<{
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  className?: string;
}> = ({ value, options, onChange, placeholder, suffix, className = "" }) => {
  const inList = options.includes(value);
  const [mode, setMode] = useState<"select" | "custom">(inList ? "select" : "custom");

  useEffect(() => {
    setMode(options.includes(value) ? "select" : "custom");
  }, [value, options]);

  return (
    <div className={`flex items-stretch gap-1 ${className}`}>
      {mode === "select" ? (
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === CUSTOM_OPTION) {
              setMode("custom");
              onChange("");
            } else {
              onChange(e.target.value);
            }
          }}
          className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[13px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition cursor-pointer"
        >
          {options.map(o => (
            <option key={o} value={o}>{o}{suffix ? ` ${suffix}` : ""}</option>
          ))}
          <option value={CUSTOM_OPTION}>직접 입력...</option>
        </select>
      ) : (
        <>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[13px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
          />
          <button
            type="button"
            onClick={() => {
              setMode("select");
              if (!options.includes(value)) onChange(options[0] ?? "");
            }}
            className="shrink-0 px-1.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-[11px] font-bold transition-colors cursor-pointer"
            title="드롭박스로 전환"
          >
            목록
          </button>
        </>
      )}
    </div>
  );
};

const FieldLabel: React.FC<{ icon?: React.ReactNode; children: React.ReactNode; required?: boolean }> = ({ icon, children, required }) => (
  <label className="text-[12px] font-bold text-slate-600 flex items-center gap-1.5 mb-1">
    {icon}
    <span>{children}{required && <span className="text-rose-500 ml-0.5">*</span>}</span>
  </label>
);

// 좌측 폼 · 섹션 헤더 (근로자·근무조건·시급·산정·옵션)
const SectionHeader: React.FC<{ icon: React.ReactNode; children: React.ReactNode; sub?: React.ReactNode }> = ({ icon, children, sub }) => (
  <div className="text-[13px] font-black text-slate-700 flex items-center gap-1.5 border-b border-slate-100 pb-1 mb-2">
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-slate-100 text-slate-600">{icon}</span>
    <span>{children}</span>
    {sub && <span className="ml-auto text-[10.5px] font-semibold text-slate-400">{sub}</span>}
  </div>
);

// 사각형 체크박스 (PDF 안정 렌더)
const SpanBox: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span
    className={`inline-flex items-center justify-center w-4 h-4 border-2 text-[10px] font-black ${checked ? "border-emerald-600 text-emerald-600" : "border-slate-400 text-transparent"}`}
    style={{ lineHeight: "1" }}
  >
    {checked ? "V" : ""}
  </span>
);

// (VerticalLabel 제거 · 하이브리드 재디자인 · 2026-08-05)

// ─────────────────────────────────────────────────────────────────────────────
// InlineSignSpot · 프리뷰 안에 있는 서명 spot (클릭 → 서명 모달)
// ─────────────────────────────────────────────────────────────────────────────

interface InlineSignSpotProps {
  signKey: SignKey;
  signUrl: string | null;
  stampUrl?: string | null;
  width?: number;
  height?: number;
  placeholder?: string;
  onOpen: (key: SignKey) => void;
  onClear: (key: SignKey) => void;
}

const InlineSignSpot: React.FC<InlineSignSpotProps> = ({
  signKey, signUrl, stampUrl, width = 130, height = 36, placeholder = "(서명 또는 도장)", onOpen, onClear,
}) => {
  const has = !!signUrl;
  return (
    <span
      className="inline-flex items-center gap-1 align-middle"
    >
      <span
        onClick={() => onOpen(signKey)}
        className={`relative inline-flex items-end justify-center border-b-2 cursor-pointer transition-colors ${
          has ? "border-emerald-400 bg-emerald-50/30" : "border-slate-400 bg-amber-50/40 hover:bg-amber-100"
        }`}
        style={{ width, height }}
        title={has ? "서명 재작성 (클릭)" : `${placeholder} 클릭하여 서명`}
      >
        {stampUrl && (
          <img
            src={stampUrl}
            alt="도장"
            className="absolute right-0 top-1/2 -translate-y-1/2 opacity-80 pointer-events-none"
            style={{ width: Math.round(height * 1.1), height: Math.round(height * 1.1) }}
          />
        )}
        {has ? (
          <img
            src={signUrl!}
            alt="서명"
            className="max-h-full max-w-full object-contain relative z-10"
          />
        ) : (
          <span className="text-[10px] font-bold text-slate-500 relative z-10 pb-0.5">
            {placeholder}
          </span>
        )}
      </span>
      {has && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear(signKey); }}
          className="text-[9px] font-bold text-rose-500 hover:text-rose-700 cursor-pointer px-0.5"
          title="서명 지우기"
        >
          ✕
        </button>
      )}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SignatureModal · 서명 그리기 모달
// ─────────────────────────────────────────────────────────────────────────────

interface SignatureModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (dataUrl: string) => void;
}

const SignatureModal: React.FC<SignatureModalProps> = ({ open, title, onClose, onSubmit }) => {
  const padRef = useRef<SignatureCanvasType | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 400, h: 180 });
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    if (!open) return;
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(240, Math.floor(e.contentRect.width) - 2);
        setSize({ w, h: 180 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (open) {
      padRef.current?.clear();
      setEmpty(true);
    }
  }, [open]);

  if (!open) return null;

  const clear = () => {
    padRef.current?.clear();
    setEmpty(true);
  };
  const submit = () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      alert("서명이 비어있습니다.");
      return;
    }
    const url = padRef.current.toDataURL("image/png");
    onSubmit(url);
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-indigo-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-indigo-500 flex items-center justify-center shadow-sm">
              <Signature size={13} weight="fill" className="text-white" />
            </div>
            <span className="text-sm font-black text-slate-800">서명 · {title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 w-7 h-7 rounded-md hover:bg-white/70 cursor-pointer flex items-center justify-center"
            title="닫기 (ESC)"
          >
            <XIcon size={13} weight="bold" />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-2">
          <div
            ref={wrapperRef}
            className="relative bg-white border-2 border-dashed border-emerald-300 rounded-lg overflow-hidden"
            style={{ height: size.h + 2 }}
          >
            <SignaturePad
              ref={(el) => { padRef.current = el; }}
              canvasProps={{
                width: size.w,
                height: size.h,
                className: "block bg-white touch-none",
                style: { width: `${size.w}px`, height: `${size.h}px` },
              }}
              penColor="#0f172a"
              onEnd={() => setEmpty(padRef.current?.isEmpty() ?? true)}
              onBegin={() => setEmpty(false)}
            />
            {empty && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-300 text-sm font-bold select-none">
                여기에 서명해 주세요
              </span>
            )}
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[12px] font-bold transition-colors cursor-pointer"
          >
            <Eraser size={12} />
            지우기
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-[12px] font-bold text-slate-600 bg-white border border-slate-300 rounded-md h-8 px-3 hover:bg-slate-50 cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={empty}
              className="text-[12px] font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-md h-8 px-4 cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
            >
              <Check size={12} weight="bold" />
              서명 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// WageComponentsTable (프리뷰 · 8항목 이미지 재현)
// ─────────────────────────────────────────────────────────────────────────────

const WageComponentsTable: React.FC<{ wage: WageComponents }> = ({ wage }) => {
  type Row = { label: string; note?: string; entry?: WageComponentEntry; flatAmount?: number; optional?: boolean };
  const rows: Row[] = [
    { label: "기본급",                 note: "주휴수당 포함", entry: wage.basicSalary },
    { label: "(고정)연장근로수당",     note: "1.5배 가산 포함", entry: wage.fixedOvertime },
    { label: "(고정)휴일근로수당",     note: "1.5배 가산 포함", entry: wage.fixedHoliday },
    { label: "(고정)휴일연장근로수당", note: "0.5배 가산 포함", entry: wage.fixedHolidayOvertime },
    { label: "(고정)야간근로수당",     note: "0.5배 가산 포함", entry: wage.fixedNight },
    { label: "(고정)연차휴가수당",     note: "",              entry: wage.fixedAnnualLeave },
    { label: "식대",                  note: "비과세", flatAmount: wage.mealAllowance, optional: true },
    { label: "차량유지비",             note: "비과세", flatAmount: wage.vehicleAllowance, optional: true },
  ];
  const total = computeWageTotal(wage);

  return (
    <div className="border border-slate-500 rounded-sm overflow-hidden text-[11.5px]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-100 text-slate-800 font-black text-[11.5px]">
            <th className="border-b border-r border-slate-400 px-2 py-1 text-left w-[34%]">구성 항목</th>
            <th className="border-b border-r border-slate-400 px-2 py-1 text-left w-[40%]">내용</th>
            <th className="border-b border-slate-400 px-2 py-1 text-right w-[26%]">금액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const isEmpty = r.entry
              ? (r.entry.hours === 0 && r.entry.minutes === 0 && r.entry.amount === 0)
              : (!r.flatAmount || r.flatAmount === 0);
            const amount = r.entry ? r.entry.amount : (r.flatAmount ?? 0);
            return (
              <tr key={idx} className="bg-white">
                <td className="border-b border-r border-slate-300 px-2 py-1 align-middle">
                  <div className="font-bold text-slate-800">{r.label}</div>
                  {r.note && <div className="text-[10px] text-slate-500 leading-tight">({r.note})</div>}
                </td>
                <td className="border-b border-r border-slate-300 px-2 py-1 align-middle">
                  {r.optional ? (
                    <span className={isEmpty ? "text-slate-400" : "text-slate-800"}>해당자에 한함</span>
                  ) : (
                    <span className={isEmpty ? "text-slate-400" : "text-slate-800"}>
                      월평균 <b className="tabular-nums">{(r.entry?.hours ?? 0).toString().padStart(1, "0")}</b> 시간{" "}
                      <b className="tabular-nums">{(r.entry?.minutes ?? 0).toString().padStart(2, "0")}</b> 분
                    </span>
                  )}
                </td>
                <td className="border-b border-slate-300 px-2 py-1 text-right tabular-nums align-middle">
                  {isEmpty
                    ? (r.optional ? <span className="text-slate-400">해당자에 한함</span> : <span className="text-slate-300">-</span>)
                    : <span className="text-slate-900 font-semibold">{fmtWon(amount)} 원</span>}
                </td>
              </tr>
            );
          })}
          <tr className="bg-amber-50">
            <td className="px-2 py-1.5 font-black text-slate-800 border-r border-slate-400">월급여총액 (세전)</td>
            <td className="border-r border-slate-400 px-2 py-1.5 text-[10.5px] text-slate-600">(포괄임금)</td>
            <td className="px-2 py-1.5 text-right tabular-nums font-black text-slate-900">
              {fmtWon(total)} 원
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// WageComponentsForm (좌측 폼 · 표 형식 · 컴팩트)
//   컬럼: 항목 · 시간 · 금액
//   시급 입력 시 자동 계산 결과 반영 (read-only)
// ─────────────────────────────────────────────────────────────────────────────

interface WageComponentsFormProps {
  wage: WageComponents;
  onChange: (next: WageComponents) => void;
  // T-V (2026-08-05) · 통상시급 · 수식 표시용 (내용 컬럼에 = 시급 × N 표기)
  weekdayHourly?: number;
}

// T-K (2026-08-05) · 이미지 레이아웃 3열 재구성 (구성 항목 · 내용 · 금액)
//   좌측 폼도 우측 프리뷰와 동일한 배치 · 금액 없으면 "-" · 하단 월급여총액 (포괄임금) 강조
// T-V (2026-08-05) · 내용 컬럼에 수식 표시 (= 시급 × N · 배수 반영됨)
const WageComponentsForm: React.FC<WageComponentsFormProps> = ({ wage, onChange, weekdayHourly = 0 }) => {
  const updEntry = (
    key: keyof Pick<WageComponents, "basicSalary" | "fixedOvertime" | "fixedHoliday" | "fixedHolidayOvertime" | "fixedNight" | "fixedAnnualLeave">,
    field: keyof WageComponentEntry,
    val: number,
  ) => {
    onChange({ ...wage, [key]: { ...wage[key], [field]: val } });
  };
  const updFlat = (key: "mealAllowance" | "vehicleAllowance", val: number) => {
    onChange({ ...wage, [key]: val });
  };

  // T-K · 8항목 rows (이미지 원본 순서)
  // T-V · formulaMul · 시급에 곱할 계수 (배수 이미 반영 항목 = 1 · 0.5배 항목 = 0.5)
  type ComponentKey = keyof Pick<WageComponents, "basicSalary" | "fixedOvertime" | "fixedHoliday" | "fixedHolidayOvertime" | "fixedNight" | "fixedAnnualLeave">;
  const rows: Array<{ key: ComponentKey; label: string; note: string; formulaMul: number; formulaHint?: string }> = [
    { key: "basicSalary",          label: "기본급",                   note: "주휴수당 포함",     formulaMul: 1,   formulaHint: "주40+주휴8 × 4.3452" },
    { key: "fixedOvertime",        label: "(고정)연장근로수당",       note: "1.5배 가산 포함",   formulaMul: 1,   formulaHint: "시간에 1.5배 반영됨" },
    { key: "fixedHoliday",         label: "(고정)휴일근로수당",       note: "1.5배 가산 포함",   formulaMul: 1,   formulaHint: "시간에 1.5배 반영됨" },
    { key: "fixedHolidayOvertime", label: "(고정)휴일연장근로수당",   note: "0.5배 가산 포함",   formulaMul: 0.5 },
    { key: "fixedNight",           label: "(고정)야간근로수당",       note: "0.5배 가산 포함",   formulaMul: 0.5 },
    { key: "fixedAnnualLeave",     label: "(고정)연차휴가수당",       note: "",                  formulaMul: 1 },
  ];

  const total = computeWageTotal(wage);
  const w = Math.max(0, weekdayHourly);

  return (
    <div className="rounded-lg border border-indigo-200 bg-white flex flex-col overflow-hidden">
      {/* 상단 라벨 */}
      <div className="text-[11px] font-black text-indigo-800 flex items-center gap-1 px-2 py-1 border-b border-indigo-100 bg-indigo-50/50">
        <Money size={11} weight="fill" />
        임금 구성표 (편집 가능 · 이미지 레이아웃)
      </div>

      {/* 이미지 형식 · 3열 테이블 · 구성 항목 · 내용 (월평균 시간) · 금액 (원) */}
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black text-[10.5px]">
            <th className="border-b border-slate-300 px-1.5 py-1 text-left w-[42%]">구성 항목</th>
            <th className="border-b border-slate-300 px-1.5 py-1 text-center w-[30%]">내용</th>
            <th className="border-b border-slate-300 px-1.5 py-1 text-right w-[28%]">금액 (원)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const entry = wage[r.key];
            const isEmpty = entry.hours === 0 && entry.minutes === 0 && entry.amount === 0;
            return (
              <tr key={r.key} className="border-b border-slate-100 last:border-b-0">
                <td className="px-1.5 py-1 align-middle">
                  <div className="text-[11px] font-bold text-slate-800 leading-tight">
                    {r.label}
                  </div>
                  {r.note && (
                    <div className="text-[9px] text-slate-500 font-semibold leading-tight">
                      ({r.note})
                    </div>
                  )}
                </td>
                {/* 내용 · 월평균 시간·분 입력 + T-V 수식 표시 */}
                <td className="px-1.5 py-1 align-middle">
                  <div className="flex items-center justify-center gap-0.5 text-[10px] text-slate-500 font-semibold">
                    <span>월평균</span>
                    <input
                      type="number"
                      min={0}
                      value={entry.hours}
                      onChange={(e) => updEntry(r.key, "hours", Number(e.target.value) || 0)}
                      className="w-8 bg-white border border-slate-200 rounded px-0.5 py-0.5 text-[11px] text-slate-800 font-semibold text-right focus:outline-none focus:border-indigo-500 transition"
                      placeholder="0"
                    />
                    <span>h</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={entry.minutes}
                      onChange={(e) => updEntry(r.key, "minutes", Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                      className="w-7 bg-white border border-slate-200 rounded px-0.5 py-0.5 text-[11px] text-slate-800 font-semibold text-right focus:outline-none focus:border-indigo-500 transition"
                      placeholder="0"
                    />
                    <span>m</span>
                  </div>
                  {/* T-V · 수식 (시급 × 시간 · 배수 표기) */}
                  {(() => {
                    const totalH = (entry.hours || 0) + (entry.minutes || 0) / 60;
                    if (totalH === 0 && r.key !== "basicSalary" && r.key !== "fixedAnnualLeave") return null;
                    const mulText = r.formulaMul === 0.5 ? " × 0.5" : "";
                    return (
                      <div className="text-[9px] text-slate-400 font-semibold text-center mt-0.5 leading-tight">
                        = 시급 × <span className="tabular-nums text-slate-500">{totalH.toFixed(2).replace(/\.?0+$/, "")}</span>{mulText}
                        {r.formulaHint && (
                          <span className="text-[9px] text-slate-400 ml-1 italic">({r.formulaHint})</span>
                        )}
                        {w > 0 && (
                          <div className="text-[9px] text-emerald-600 font-black tabular-nums">
                            = {fmtWon(Math.round(w * totalH * r.formulaMul))}원
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </td>
                {/* 금액 · 없으면 "-" placeholder · 입력 시 값 표시 */}
                <td className="px-1.5 py-1 align-middle text-right">
                  <div className="relative inline-block w-full">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={entry.amount === 0 ? "" : String(entry.amount)}
                      onChange={(e) => updEntry(r.key, "amount", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                      className={`w-full bg-white border rounded px-1 py-0.5 text-[11px] font-black text-right focus:outline-none focus:border-indigo-500 transition ${
                        isEmpty ? "border-slate-100 text-slate-300" : "border-slate-200 text-slate-800"
                      }`}
                      placeholder="-"
                    />
                  </div>
                </td>
              </tr>
            );
          })}

          {/* 식대 (비과세) · flat amount · 체크박스로 활성화 · 2026-08-05 T-R */}
          {(() => {
            const enabled = wage.mealAllowance > 0;
            return (
              <tr className="border-b border-slate-100">
                <td className="px-1.5 py-1 align-middle">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // 체크 시 · 최소값 1로 활성화 (사용자가 즉시 실제 금액 입력)
                          if (wage.mealAllowance === 0) updFlat("mealAllowance", 1);
                        } else {
                          updFlat("mealAllowance", 0);
                        }
                      }}
                      className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer shrink-0"
                      title="식대 비과세 · 해당자만 체크"
                    />
                    <span>
                      <div className="text-[11px] font-bold text-slate-800 leading-tight">식대</div>
                      <div className="text-[9px] text-slate-500 font-semibold leading-tight">(비과세)</div>
                    </span>
                  </label>
                </td>
                <td className="px-1.5 py-1 align-middle text-center text-[10px] text-slate-500 font-semibold italic">
                  {enabled ? "비과세" : "해당자에 한함"}
                </td>
                <td className="px-1.5 py-1 align-middle text-right">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={!enabled ? "" : String(wage.mealAllowance)}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^0-9]/g, "")) || 0;
                      updFlat("mealAllowance", n);
                    }}
                    disabled={!enabled}
                    className={`w-full bg-white border rounded px-1 py-0.5 text-[11px] font-black text-right focus:outline-none focus:border-indigo-500 transition ${
                      !enabled
                        ? "border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed"
                        : "border-slate-200 text-slate-800"
                    }`}
                    placeholder={enabled ? "금액 입력" : "해당자에 한함"}
                  />
                </td>
              </tr>
            );
          })()}

          {/* 차량유지비 (비과세) · 체크박스로 활성화 · 2026-08-05 T-R */}
          {(() => {
            const enabled = wage.vehicleAllowance > 0;
            return (
              <tr className="border-b border-slate-200">
                <td className="px-1.5 py-1 align-middle">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => {
                        if (e.target.checked) {
                          if (wage.vehicleAllowance === 0) updFlat("vehicleAllowance", 1);
                        } else {
                          updFlat("vehicleAllowance", 0);
                        }
                      }}
                      className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer shrink-0"
                      title="차량유지비 비과세 · 해당자만 체크"
                    />
                    <span>
                      <div className="text-[11px] font-bold text-slate-800 leading-tight">차량유지비</div>
                      <div className="text-[9px] text-slate-500 font-semibold leading-tight">(비과세)</div>
                    </span>
                  </label>
                </td>
                <td className="px-1.5 py-1 align-middle text-center text-[10px] text-slate-500 font-semibold italic">
                  {enabled ? "비과세" : "해당자에 한함"}
                </td>
                <td className="px-1.5 py-1 align-middle text-right">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={!enabled ? "" : String(wage.vehicleAllowance)}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^0-9]/g, "")) || 0;
                      updFlat("vehicleAllowance", n);
                    }}
                    disabled={!enabled}
                    className={`w-full bg-white border rounded px-1 py-0.5 text-[11px] font-black text-right focus:outline-none focus:border-indigo-500 transition ${
                      !enabled
                        ? "border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed"
                        : "border-slate-200 text-slate-800"
                    }`}
                    placeholder={enabled ? "금액 입력" : "해당자에 한함"}
                  />
                </td>
              </tr>
            );
          })()}

          {/* 하단 · 월급여총액 (세전) · (포괄임금) · 강조 */}
          <tr className="bg-amber-50">
            <td className="px-1.5 py-1.5 text-left text-[11.5px] font-black text-slate-900">
              월급여총액 (세전)
            </td>
            <td className="px-1.5 py-1.5 text-center text-[10.5px] font-bold text-slate-600">
              (포괄임금)
            </td>
            <td className="px-1.5 py-1.5 text-right text-[12px] font-black text-slate-900 tabular-nums">
              {fmtWon(total)} 원
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// WageCalcModePanel · 역산 로직 (3 모드)
// ─────────────────────────────────────────────────────────────────────────────

interface WageCalcModePanelProps {
  form: ContractForm;
  weeklyWeekdayDays: number;
  weeklyWeekendDays: number;
  onApplyToWageComponents: (nextWage: WageComponents) => void;
  onApplyHourly: (weekdayHourly: number, weekendHourly: number) => void;
}

type CalcMode = "forward" | "target" | "actual";

const WageCalcModePanel: React.FC<WageCalcModePanelProps> = ({
  form, weeklyWeekdayDays, weeklyWeekendDays, onApplyToWageComponents, onApplyHourly,
}) => {
  const [mode, setMode] = useState<CalcMode>("forward");
  const [targetTotal, setTargetTotal] = useState<string>("3000000");

  // Mode 1: forward (시급 → 포괄임금 산정) · T-N (2026-08-05) · 각 항목 시간·분 기준
  const forwardCalc = useMemo(() => {
    const wd = Number(form.weekdayHourly) || 0;
    const we = Number(form.weekendHourly) || 0;
    return computeWageFromHourlyDual(wd, we, form.wageComponents);
  }, [form.weekdayHourly, form.weekendHourly, form.wageComponents]);

  // Mode 2: target (목표 월급 → 시급 역산)
  const targetHourly = useMemo(() => computeHourlyFromTarget(Number(targetTotal) || 0), [targetTotal]);

  // Mode 3: actual (실 근무시간 기반)
  const actualCalc = useMemo(() => computeActualPay(
    form.startTime, form.endTime, Number(form.breakMinutes) || 0,
    weeklyWeekdayDays, weeklyWeekendDays,
    Number(form.weekdayHourly) || 0, Number(form.weekendHourly) || 0,
  ), [form.startTime, form.endTime, form.breakMinutes, weeklyWeekdayDays, weeklyWeekendDays, form.weekdayHourly, form.weekendHourly]);

  const applyForwardToWage = () => {
    // T-N (2026-08-05) · 6항목 반영 · 각 항목 시간·분 유지 (사용자 미세 조정 반영)
    const c = forwardCalc;
    onApplyToWageComponents({
      ...form.wageComponents,
      basicSalary:          { ...form.wageComponents.basicSalary,          amount: c.basicAmount },
      fixedOvertime:        { ...form.wageComponents.fixedOvertime,        amount: c.overtimeAmount },
      fixedHoliday:         { ...form.wageComponents.fixedHoliday,         amount: c.holidayAmount },
      fixedHolidayOvertime: { ...form.wageComponents.fixedHolidayOvertime, amount: c.holidayOvertimeAmount },
      fixedNight:           { ...form.wageComponents.fixedNight,           amount: c.nightAmount },
      fixedAnnualLeave:     { ...form.wageComponents.fixedAnnualLeave,     amount: c.annualLeaveAmount },
    });
  };

  const applyTargetToHourly = () => {
    onApplyHourly(targetHourly, targetHourly);
  };

  // T-J (2026-08-05) · applyActualToBasic 제거 · 계산기는 참고용으로만 유지

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Calculator size={12} weight="fill" className="text-emerald-700" />
        <span className="text-[11px] font-black text-emerald-800">역산 계산기 (3 모드)</span>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {(["forward", "target", "actual"] as const).map(m => {
          const on = mode === m;
          const label = m === "forward" ? "포괄 → 실수령" : m === "target" ? "목표 월급 → 시급" : "실 근무시간 → 월급";
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-2 py-1 rounded-md border text-[10.5px] font-black transition-colors cursor-pointer ${
                on ? "bg-emerald-600 text-white border-emerald-700 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {mode === "forward" && (
        <div className="text-[11px] text-slate-700 leading-relaxed">
          <div>주중시급 <b className="tabular-nums">{fmtWon(form.weekdayHourly)}</b> · 주말시급 <b className="tabular-nums">{fmtWon(form.weekendHourly)}</b></div>
          <div>· 기본급 <b className="tabular-nums">{fmtWon(forwardCalc.basicAmount)}</b></div>
          <div>· 연장수당 <b className="tabular-nums">{fmtWon(forwardCalc.overtimeAmount)}</b></div>
          <div>· 휴일수당 <b className="tabular-nums">{fmtWon(forwardCalc.holidayAmount)}</b></div>
          {forwardCalc.holidayOvertimeAmount > 0 && (
            <div>· 휴일연장수당 <b className="tabular-nums">{fmtWon(forwardCalc.holidayOvertimeAmount)}</b></div>
          )}
          {forwardCalc.nightAmount > 0 && (
            <div>· 야간수당 <b className="tabular-nums">{fmtWon(forwardCalc.nightAmount)}</b></div>
          )}
          <div>· 연차수당 <b className="tabular-nums">{fmtWon(forwardCalc.annualLeaveAmount)}</b></div>
          <div className="mt-1 font-black text-emerald-800">세전 총액 <span className="tabular-nums">{fmtWon(forwardCalc.total)}</span> 원</div>
          <button
            type="button"
            onClick={applyForwardToWage}
            className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 text-white text-[10.5px] font-black hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            임금표에 반영
          </button>
        </div>
      )}

      {mode === "target" && (
        <div className="text-[11px] text-slate-700 leading-relaxed">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0">목표 월급</span>
            <input
              type="text"
              inputMode="numeric"
              value={targetTotal}
              onChange={(e) => setTargetTotal(e.target.value.replace(/[^0-9]/g, ""))}
              className="flex-1 min-w-0 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[12px] text-slate-800 font-black text-right focus:outline-none focus:border-emerald-500 transition"
            />
            <span className="text-[10px] font-bold">원</span>
          </div>
          <div className="mt-1 font-black text-emerald-800">
            필요 시급 <span className="tabular-nums">{fmtWon(targetHourly)}</span> 원
            <span className="text-[9.5px] text-slate-500 font-semibold ml-1">
              (÷{WAGE_DIVISOR.toFixed(2)})
            </span>
          </div>
          <button
            type="button"
            onClick={applyTargetToHourly}
            className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 text-white text-[10.5px] font-black hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            시급에 반영 (주중/주말 동일)
          </button>
        </div>
      )}

      {mode === "actual" && (
        actualCalc ? (
          <div className="text-[11px] text-slate-700 leading-relaxed">
            <div>일 근무 <b className="tabular-nums">{actualCalc.dailyHours.toFixed(2)}h</b> · 주중 <b>{weeklyWeekdayDays}일</b> · 주말 <b>{weeklyWeekendDays}일</b></div>
            <div>월 주중근무 <b className="tabular-nums">{actualCalc.weekdayMonthlyHours.toFixed(1)}h</b> × <b className="tabular-nums">{fmtWon(form.weekdayHourly)}</b> = <b className="tabular-nums">{fmtWon(actualCalc.weekdayPay)}</b></div>
            <div>월 주말근무 <b className="tabular-nums">{actualCalc.weekendMonthlyHours.toFixed(1)}h</b> × <b className="tabular-nums">{fmtWon(form.weekendHourly)}</b> = <b className="tabular-nums">{fmtWon(actualCalc.weekendPay)}</b></div>
            <div className="mt-1 font-black text-emerald-800">실 근무 총액 <span className="tabular-nums">{fmtWon(actualCalc.total)}</span> 원</div>
            {/* T-J (2026-08-05) · 기본급에 반영 버튼 제거 · 참고용 계산기로 유지 */}
            <div className="mt-1 text-[9.5px] text-slate-500 italic">
              * 계산 결과는 참고용입니다. 세후 목표 역산은 상단 "희망 월 세후 수령액" 을 사용하세요.
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-rose-600">근무 시간을 입력하세요.</div>
        )
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// WageSummaryDualPanel · 포괄 vs 실 근무 산정 좌우 비교
// ─────────────────────────────────────────────────────────────────────────────

interface WageSummaryDualPanelProps {
  form: ContractForm;
  weeklyWeekdayDays: number;
  weeklyWeekendDays: number;
}

const WageSummaryDualPanel: React.FC<WageSummaryDualPanelProps> = ({
  form, weeklyWeekdayDays, weeklyWeekendDays,
}) => {
  // 좌측 · 포괄임금 (근로계약서 기준)
  const leftGross = computeWageTotal(form.wageComponents);
  const leftNet = useMemo(() => computeNetPay(leftGross), [leftGross]);

  // 우측 · 실 근무시간 기반 (약사 실무)
  const actualCalc = useMemo(() => computeActualPay(
    form.startTime, form.endTime, Number(form.breakMinutes) || 0,
    weeklyWeekdayDays, weeklyWeekendDays,
    Number(form.weekdayHourly) || 0, Number(form.weekendHourly) || 0,
  ), [form.startTime, form.endTime, form.breakMinutes, weeklyWeekdayDays, weeklyWeekendDays, form.weekdayHourly, form.weekendHourly]);
  const rightGross = actualCalc?.total ?? 0;
  const rightNet = useMemo(() => computeNetPay(rightGross), [rightGross]);

  const diff = leftNet.net - rightNet.net;
  const diffAbs = Math.abs(diff);
  const diffPct = rightNet.net > 0 ? Math.round((diff / rightNet.net) * 100) : 0;

  const row = (label: string, value: number, bold = false) => (
    <div className={`flex items-center justify-between text-[11px] ${bold ? "font-black text-slate-900" : "text-slate-700"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{fmtWon(value)} 원</span>
    </div>
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Calculator size={12} weight="fill" className="text-indigo-700" />
        <span className="text-[11px] font-black text-indigo-800">임금 산정 비교 · 포괄 vs 실 근무</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* 좌측 · 포괄임금 */}
        <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2 flex flex-col gap-0.5">
          <div className="text-[10px] font-black text-emerald-800 uppercase tracking-wider mb-0.5">
            A. 포괄임금 (계약서 기준)
          </div>
          {row(`기본급 ${form.wageComponents.basicSalary.hours}h`,       form.wageComponents.basicSalary.amount)}
          {row(`연장 ${form.wageComponents.fixedOvertime.hours}h ×1.5`,   form.wageComponents.fixedOvertime.amount)}
          {row(`휴일 ${form.wageComponents.fixedHoliday.hours}h ×1.5`,    form.wageComponents.fixedHoliday.amount)}
          {row(`연차 ${form.wageComponents.fixedAnnualLeave.hours}h`,     form.wageComponents.fixedAnnualLeave.amount)}
          <div className="border-t border-emerald-200 mt-0.5 pt-0.5">
            {row("세전 총액", leftGross, true)}
            {row("- 4대보험", -leftNet.insurance.total)}
            {row("- 소득세 합", -leftNet.tax.total)}
            <div className="border-t border-emerald-300 mt-0.5 pt-0.5">
              {row("실수령 A", leftNet.net, true)}
            </div>
          </div>
        </div>

        {/* 우측 · 실 근무시간 */}
        <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-2 flex flex-col gap-0.5">
          <div className="text-[10px] font-black text-indigo-800 uppercase tracking-wider mb-0.5">
            B. 실 근무시간 (약사 실무)
          </div>
          {actualCalc ? (
            <>
              <div className="text-[10px] text-slate-600">일 <b className="tabular-nums">{actualCalc.dailyHours.toFixed(2)}h</b> · 주중 {weeklyWeekdayDays}일 · 주말 {weeklyWeekendDays}일</div>
              {row(`주중 ${actualCalc.weekdayMonthlyHours.toFixed(1)}h × ${fmtWon(form.weekdayHourly)}`, actualCalc.weekdayPay)}
              {row(`주말 ${actualCalc.weekendMonthlyHours.toFixed(1)}h × ${fmtWon(form.weekendHourly)}`, actualCalc.weekendPay)}
              <div className="border-t border-indigo-200 mt-0.5 pt-0.5">
                {row("세전 총액", rightGross, true)}
                {row("- 4대보험", -rightNet.insurance.total)}
                {row("- 소득세 합", -rightNet.tax.total)}
                <div className="border-t border-indigo-300 mt-0.5 pt-0.5">
                  {row("실수령 B", rightNet.net, true)}
                </div>
              </div>
            </>
          ) : (
            <div className="text-[11px] text-rose-600">근무 시간을 입력하세요.</div>
          )}
        </div>
      </div>

      {/* 하단 · 비교 요약 */}
      {actualCalc && rightNet.net > 0 && (
        <div className={`rounded-md border px-2 py-1.5 text-[11px] font-bold ${
          diffAbs < 50000 ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
          diff > 0        ? "border-amber-200 bg-amber-50 text-amber-800" :
                            "border-rose-200 bg-rose-50 text-rose-800"
        }`}>
          {diff === 0 ? "실수령 A = B · 산정 일치" :
           diff > 0    ? `포괄임금이 실 근무 대비 +${fmtWon(diffAbs)} 원 (${diffPct}%) 높음 · 근로자 유리` :
                        `포괄임금이 실 근무 대비 -${fmtWon(diffAbs)} 원 (${Math.abs(diffPct)}%) 낮음 · 계약서 수당 재검토 필요`}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ContractPreview · 이미지 재현 프리뷰 (인라인 서명 spot 포함)
// ─────────────────────────────────────────────────────────────────────────────

interface ContractPreviewProps {
  form: ContractForm;
  signUrls: Record<SignKey, string | null>;
  employerStampUrl: string | null;
  employeeStampUrl: string | null;
  onOpenSign: (key: SignKey) => void;
  onClearSign: (key: SignKey) => void;
}

const ContractPreview = React.forwardRef<HTMLDivElement, ContractPreviewProps>(({
  form, signUrls, employerStampUrl, employeeStampUrl, onOpenSign, onClearSign,
}, ref) => {
  const workDayText = DAYS.filter(d => form.workDays[d]).join("·") || "(선택 안 됨)";

  // 계약체결일 · 년/월/일 분리
  const csDate = form.contractSignDate ? form.contractSignDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const csY = csDate ? csDate[1] : "";
  const csM = csDate ? Number(csDate[2]) : "";
  const csD = csDate ? Number(csDate[3]) : "";

  const stDate = form.startDate ? form.startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const enDate = form.endDate   ? form.endDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;

  // 휴게 시작~종료 · 명시적 입력 우선 · 없으면 파생 (중간점)
  const breakDisplay = (() => {
    // 명시적 입력 (T16 · 근기법 §54 별도 조항 필요)
    if (form.breakStart && form.breakEnd) return `${form.breakStart} ~ ${form.breakEnd}`;
    const s = parseHM(form.startTime);
    const bMin = Number(form.breakMinutes) || 0;
    if (!s || bMin <= 0) return null;
    const startMin = s.h * 60 + s.m;
    const e = parseHM(form.endTime);
    if (!e) return null;
    const endMin = e.h * 60 + e.m;
    const midpoint = Math.floor((startMin + endMin - bMin) / 2);
    const bs = midpoint;
    const be = midpoint + bMin;
    const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    return `${hm(bs)} ~ ${hm(be)}`;
  })();


  // 하이브리드 재디자인 · 2026-08-05
  // 색상 fixed hex (PDF · html2canvas 안정)
  const HEX = {
    indigoBg:  "#eef2ff",   // indigo-50
    indigoBd:  "#c7d2fe",   // indigo-200 → 300 근사
    amberBg:   "#fef3c7",   // amber-100 (약간 부드러운)
    amberSoft: "#fffbeb",   // amber-50
    amberBd:   "#fcd34d",   // amber-300
    slateBd:   "#94a3b8",   // slate-400
    slateSoft: "#f8fafc",   // slate-50
    slateHead: "#e2e8f0",   // slate-200
  } as const;

  // 섹션 헤딩 · 좌측 3px 세로바 + 소캡스 라벨
  const Section: React.FC<{ label: string; children: React.ReactNode; avoidBreak?: boolean }> = ({ label, children, avoidBreak }) => (
    <section
      className="mt-4"
      style={avoidBreak ? { pageBreakInside: "avoid", breakInside: "avoid" } : undefined}
    >
      <div className="border-l-[3px] border-slate-700 pl-3">
        <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-1.5">
          {label}
        </h3>
        <div className="text-[12px] text-slate-800 leading-relaxed">
          {children}
        </div>
      </div>
    </section>
  );

  // 하단 서명 · 갑/을 셀 (grid grid-cols-2)
  const PartyCell: React.FC<{
    partyLabel: string;
    children: React.ReactNode;
  }> = ({ partyLabel, children }) => (
    <div className="border border-slate-400 rounded-sm p-3 flex flex-col gap-1.5 bg-white">
      <div className="text-[10.5px] font-black uppercase tracking-[0.24em] text-slate-500 pb-1 border-b border-slate-200">
        {partyLabel}
      </div>
      {children}
    </div>
  );

  const FieldRow: React.FC<{ label: string; value: React.ReactNode; wide?: boolean }> = ({ label, value }) => (
    <div className="flex items-baseline gap-2 text-[11.5px]">
      <span
        className="min-w-[68px] text-slate-600 font-bold text-[10.5px] tracking-wide"
      >
        {label}
      </span>
      <span className="flex-1 border-b border-slate-300 pb-0.5 text-slate-900 font-semibold">
        {value ?? "-"}
      </span>
    </div>
  );

  return (
    <div
      ref={ref}
      className="bg-white text-slate-900 shadow-sm p-5 sm:p-8 mx-auto"
      style={{
        width: "100%",
        maxWidth: "820px",
        fontFamily: "'Noto Sans KR', 'Malgun Gothic', system-ui, -apple-system, 'Segoe UI', sans-serif",
        lineHeight: 1.55,
        color: "#0f172a",
      }}
    >
      {/* 상단 · 제목 + 근로자명 · 우측 상단 · 바깥 테두리 제거 · 상단 2px 구분선만 */}
      <header
        className="flex items-center justify-center pb-3 mb-3 relative"
        style={{ borderBottom: "2px solid #1e293b" }}
      >
        <h2 className="text-[24px] font-black tracking-[0.32em] text-slate-900 text-center">
          근 로 계 약 서
        </h2>
        <div className="absolute right-0 top-0 bottom-0 flex items-center text-[14px] font-black text-slate-800">
          ( <span className="mx-1 min-w-[80px] text-center border-b border-slate-500 px-2">{form.employeeName || " "}</span> )
        </div>
      </header>

      {/* 서두 */}
      <p className="text-[12px] text-slate-700 mb-2 leading-relaxed">
        사용자(이하 '갑'이라 함)와 근로자(이하 '을'이라 함)는 다음과 같이 근로계약을 체결하고 신의에 따라 이를 성실히 이행할 것을 약정한다.
      </p>

      {/* 1. 근무장소 · 담당업무 · T-H (2026-08-05) · 사업주 정보 동적 반영 */}
      <Section label="근무장소 · 담당업무">
        <div className="font-bold text-slate-900">
          {form.companyName || "코스트팜(Costpharm)"}
          {form.companyAddress && (
            <span className="text-slate-700 font-semibold"> ({form.companyAddress})</span>
          )}
          <span className="ml-1">社內 및 관계 현장</span>
        </div>
        <div className="mt-1">
          담당업무: <b className="text-slate-900">{form.jobDuty || "-"}</b>
        </div>
        <div className="text-[10.5px] text-slate-600 mt-1">
          단, '갑'의 사정에 따라 근무 장소와 담당 업무를 변경할 수 있으며 '을'은 정당한 사유 없이 이를 거부할 수 없다.
        </div>
      </Section>

      {/* 2. 근로계약기간 · T-B (2026-08-05) · 배지 제거 · grid 균등 정렬 */}
      <Section label="근로계약기간">
        {/* 계약체결일 · 근무시작일 · (계약종료일 · 정규직 시 숨김) · 균등 grid */}
        <div
          className={`grid gap-x-4 gap-y-0.5 text-[11.5px] mb-1.5 ${
            form.indefinite ? "grid-cols-2" : "grid-cols-3"
          }`}
        >
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">계약체결일</span>
            <span className="font-bold text-slate-900 tabular-nums">
              {fmtKoreanDate(form.contractSignDate) || "-"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">근무시작일</span>
            <span className="font-bold text-slate-900 tabular-nums">
              {fmtKoreanDate(form.startDate) || "-"}
            </span>
          </div>
          {!form.indefinite && (
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">계약종료일</span>
              <span className="font-bold text-slate-900 tabular-nums">
                {fmtKoreanDate(form.endDate) || "-"}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mb-1">
          <SpanBox checked={form.indefinite} />
          <span className="font-bold">기간의 정함이 없음.</span>
          <span className="text-[11px] text-slate-600">(근로개시일: <b>{fmtKoreanDate(form.startDate) || "-"}</b>)</span>
        </div>
        {/* 정규직(indefinite) 이면 계약종료일 라인 완전 숨김 */}
        {!form.indefinite && (
          <>
            <div className="flex items-center flex-wrap gap-1 text-[12px]">
              <SpanBox checked={!form.indefinite} />
              <span className="tabular-nums">
                <b>{stDate ? stDate[1] : "20__"}</b>년{" "}
                <b>{stDate ? Number(stDate[2]) : "__"}</b>월{" "}
                <b>{stDate ? Number(stDate[3]) : "__"}</b>일{" "}
                ~ <b>{enDate ? enDate[1] : "20__"}</b>년{" "}
                <b>{enDate ? Number(enDate[2]) : "__"}</b>월{" "}
                <b>{enDate ? Number(enDate[3]) : "__"}</b>일까지
              </span>
              <span className="text-[10.5px] text-slate-600 ml-1">(근로개시일: {fmtKoreanDate(form.startDate) || "-"})</span>
            </div>
            <div className="text-[10.5px] text-slate-600 mt-1">
              계약기간 만료일에 별도의 통보 없이 근로계약은 자동 해지되는 것으로 한다.
            </div>
          </>
        )}
      </Section>

      {/* 3. 임금 (표 유지 · avoidBreak) */}
      <Section label="임금" avoidBreak>
        <div className="text-[11.5px] text-slate-800 mb-1.5 font-semibold">
          1. '을'의 구체적인 임금 구성항목은 아래와 같다.
        </div>
        {form.useWageComponents ? (
          <WageComponentsTable wage={form.wageComponents} />
        ) : (
          <div className="border border-slate-400 rounded-sm p-2 text-[12px]">
            <div>· 시간급 (주중): <b>{fmtWon(form.weekdayHourly)} 원</b></div>
            <div>· 시간급 (주말): <b>{fmtWon(form.weekendHourly)} 원</b></div>
          </div>
        )}

        {/* 임금 단서 조항 5개 · 문단형 */}
        <ol className="mt-2 space-y-1 text-[11px] text-slate-700 leading-snug list-decimal list-inside pl-1">
          {WAGE_CLAUSES.map((clause, i) => (
            <li key={i}><span className="align-middle">{clause}</span></li>
          ))}
        </ol>
        <div className="mt-1 text-[10.5px] text-slate-600 leading-snug">
          <b>별도:</b> {WAGE_CLAUSE_EXTRA}
        </div>

        {/* T6 · 임금 조항 카테고리별 이해·동의 · T-D (2026-08-05) · 이름 자동 + 서명 pad */}
        <div
          className="mt-2 rounded-sm px-2 py-1.5 flex flex-wrap items-center gap-2"
          style={{ backgroundColor: HEX.indigoBg, border: `1px solid ${HEX.indigoBd}` }}
        >
          <SpanBox checked={form.clauseAcks.wage} />
          <span className="text-[11.5px] font-semibold text-slate-800">
            위의 임금 조항 전체 내용을 이해하고 동의함
          </span>
          <span className="ml-auto flex items-center gap-1">
            <span className="text-[11px] font-black text-slate-800 border-b border-slate-500 px-2 min-w-[70px] text-center">
              {form.employeeName || " "}
            </span>
            <InlineSignSpot
              signKey="wageAck"
              signUrl={signUrls.wageAck}
              onOpen={onOpenSign}
              onClear={onClearSign}
              width={110}
              height={28}
              placeholder="(서명)"
            />
          </span>
        </div>

        {/* 임금 지급일 · amber fixed hex */}
        <div
          className="mt-2 rounded-sm px-2 py-1 text-[11.5px]"
          style={{ backgroundColor: HEX.amberSoft, border: `1px solid ${HEX.amberBd}` }}
        >
          <b>2. 임금지급일:</b> {form.paymentDayText}
        </div>
      </Section>

      {/* 4. 근로일 · 근로시간 (표 유지 · avoidBreak) */}
      <Section label="근로일 · 근로시간" avoidBreak>
        <div className="text-[11.5px] font-bold mb-1">
          1. 기본 근로일: <b className="text-slate-900">{workDayText}</b>
        </div>
        {/* T-E (2026-08-05) · 근무요일 변경 가능 안내 · 근무장소 유사 스타일 */}
        <div className="text-[10.5px] text-slate-600 mb-1 leading-snug">
          ※ 갑의 사정에 따라 근무요일은 변경될 수 있으며, 을은 정당한 사유 없이 이를 거부할 수 없다.
        </div>
        <div className="text-[10.5px] text-slate-600 mb-2 leading-snug">
          ※ 소정근로일은 주40시간제 내에서 당사자가 정하는 근로일을 의미하며, 무급 휴무일인 토요일에 근로할 경우 연장근로로 보고, 주휴일인 일요일에 근로할 경우 휴일근로로 본다.
        </div>

        <div className="text-[11.5px] font-bold mb-1">2. 기본 근로시간:</div>
        <table className="w-full border-collapse border border-slate-400 text-[11.5px] mb-1 rounded-sm overflow-hidden">
          <thead>
            <tr style={{ backgroundColor: HEX.slateHead }} className="font-black">
              <th className="border border-slate-300 px-2 py-1 text-center w-[35%]">구분</th>
              <th className="border border-slate-300 px-2 py-1 text-center w-[35%]">기본 근로시간</th>
              <th className="border border-slate-300 px-2 py-1 text-center w-[30%]">휴게시간(무급)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-300 px-2 py-1 text-center font-bold">{workDayText}</td>
              <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                {form.startTime || "--:--"} ~ {form.endTime || "--:--"}
              </td>
              <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                {breakDisplay ?? "-"}
                <div className="text-[10px] text-slate-500 mt-0.5">
                  ({form.breakMinutes || 0}분)
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* 소정근로시간 안내 · amber fixed hex */}
        <div
          className="mt-2 rounded-sm px-2 py-1.5"
          style={{ backgroundColor: HEX.amberSoft, border: `1px solid ${HEX.amberBd}` }}
        >
          <div className="text-[11px] text-slate-800 leading-snug">
            ※ 소정근로시간은 휴게시간을 제외한 일단위 법정근로시간(8시간) 내에서 당사자가 정하는 시간이며, '을'은 '갑'의 사정에 따라 필요 시 상기 근로시간 이외에 추가로 연장, 야간, 휴일근로를 수행할 수 있으며 자유로운 의사로 동의한다.
          </div>
        </div>

        {/* 휴게시간 변경 · amber fixed hex · T-G (2026-08-05) · 근기법 §54 문구 강화 */}
        <div
          className="mt-2 rounded-sm px-2 py-1.5"
          style={{ backgroundColor: HEX.amberSoft, border: `1px solid ${HEX.amberBd}` }}
        >
          <div className="text-[11px] text-slate-800 leading-snug">
            ※ 업무형편상 부득이한 경우 상기 휴게 시간을 변경할 수 있고, 제대로 사용하지 못한 휴게시간은 다른 시간 내에서 보충 사용하는 것에 동의한다.
          </div>
          <div className="text-[11px] text-slate-800 leading-snug mt-1">
            ※ 휴게시간은 갑과 을의 협의에 따라 변경할 수 있다.
          </div>
        </div>

        {/* T6 · 근로시간 조항 카테고리별 이해·동의 · T-D (2026-08-05) · 이름 자동 + 서명 pad */}
        <div
          className="mt-2 rounded-sm px-2 py-1.5 flex flex-wrap items-center gap-2"
          style={{ backgroundColor: HEX.indigoBg, border: `1px solid ${HEX.indigoBd}` }}
        >
          <SpanBox checked={form.clauseAcks.workTime} />
          <span className="text-[11.5px] font-semibold text-slate-800">
            위의 근로시간·휴게 조항 전체 내용을 이해하고 동의함
          </span>
          <span className="ml-auto flex items-center gap-1">
            <span className="text-[11px] font-black text-slate-800 border-b border-slate-500 px-2 min-w-[70px] text-center">
              {form.employeeName || " "}
            </span>
            <InlineSignSpot
              signKey="workTimeAck"
              signUrl={signUrls.workTimeAck}
              onOpen={onOpenSign}
              onClear={onClearSign}
              width={110}
              height={28}
              placeholder="(서명)"
            />
          </span>
        </div>
      </Section>

      {/* 5. 퇴직금 */}
      <Section label="퇴직금">
        <div className="text-[11.5px]">
          퇴직급여보장법에 따라 퇴직연금제도, 퇴직제도를 설정 및 운영해 법정기준으로 지급한다.
        </div>
      </Section>

      {/* 6. 연차유급휴가 */}
      <Section label="연차유급휴가">
        <div className="text-[11.5px]">
          연차유급휴가는 근로기준법에 따른다. 다만, 근로기준법 제62조에 따라 근로자대표와의 서면합의로 연차유급휴가를 갈음하여 특정 근로일에 휴무시킬 수 있다. (상시 근로자 수가 5인 미만인 경우에는 적용을 제외한다.)
          <br />
          기본 부여 연차: <b>연 {form.annualLeaveDays || "15"}일</b>
        </div>
      </Section>

      {/* 7. 휴일 및 휴무 (4조항) */}
      <Section label="휴일 및 휴무">
        <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] text-slate-800 pl-1">
          {HOLIDAY_CLAUSES.map((c, i) => <li key={i} className="leading-snug">{c}</li>)}
        </ol>
      </Section>

      {/* 8. 징계 및 근로계약 해지 사유 (13개) */}
      <Section label="징계 및 근로계약 해지 사유">
        <div className="text-[11px] font-bold text-slate-800 mb-1">
          다음 각 호의 어느 하나에 해당하는 경우 사업주는 근로자를 징계 또는 근로계약 해지할 수 있다.
        </div>
        <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] text-slate-800 pl-1">
          {DISCIPLINE_REASONS.map((r, i) => (
            <li key={i} className="leading-snug">{r}</li>
          ))}
        </ol>
      </Section>

      {/* 9. 기타사항 5항목 */}
      <Section label="기타사항">
        <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] text-slate-800 pl-1">
          {ETC_ITEMS.map((r, i) => (
            <li key={i} className="leading-snug"><span className="align-middle">{r}</span></li>
          ))}
        </ol>
        {/* T6 · 기타사항 카테고리별 이해·동의 · T-D (2026-08-05) · 이름 자동 + 서명 pad */}
        <div
          className="mt-2 rounded-sm px-2 py-1.5 flex flex-wrap items-center gap-2"
          style={{ backgroundColor: HEX.indigoBg, border: `1px solid ${HEX.indigoBd}` }}
        >
          <SpanBox checked={form.clauseAcks.etc} />
          <span className="text-[11.5px] font-semibold text-slate-800">
            위의 기타사항 전체 내용을 이해하고 동의함
          </span>
          <span className="ml-auto flex items-center gap-1">
            <span className="text-[11px] font-black text-slate-800 border-b border-slate-500 px-2 min-w-[70px] text-center">
              {form.employeeName || " "}
            </span>
            <InlineSignSpot
              signKey="etcAck"
              signUrl={signUrls.etcAck}
              onOpen={onOpenSign}
              onClear={onClearSign}
              width={110}
              height={28}
              placeholder="(서명)"
            />
          </span>
        </div>
        {form.additionalContent.trim() && (
          <div
            className="mt-2 rounded-sm px-2 py-1"
            style={{ backgroundColor: HEX.slateSoft, border: "1px solid #cbd5e1" }}
          >
            <div className="text-[10.5px] font-bold text-slate-600 mb-0.5">추가 특약 사항</div>
            <div className="text-[11.5px] whitespace-pre-wrap text-slate-800">{form.additionalContent}</div>
          </div>
        )}
        {form.socialInsurance && (
          <div className="mt-1.5 text-[11px] text-slate-700">
            · 4대보험 가입: <SpanBox checked /> 고용보험 <SpanBox checked /> 산재보험 <SpanBox checked /> 국민연금 <SpanBox checked /> 건강보험
          </div>
        )}
        {form.primaryFocus && (form.employeeCategory === "매장" || form.employeeCategory === "창고") && (
          <div className="mt-1 text-[11px] text-slate-700">
            · 담당 업무의 우선순위: <b>{form.primaryFocus}</b> 관련 업무에 근무시간의 <b>{form.primaryFocusPercent}%</b> 비중.
          </div>
        )}
      </Section>

      {/* 본 계약서 교부 확인 · 수령자 서명 (인라인) */}
      <div
        className="mt-4 rounded-sm px-3 py-2 text-[11.5px] flex flex-wrap items-center gap-2"
        style={{ backgroundColor: HEX.slateSoft, border: "1px solid #cbd5e1", pageBreakInside: "avoid", breakInside: "avoid" }}
      >
        <div className="flex-1 min-w-[280px] leading-snug">
          본 계약은 당사자 간의 자유로운 의사에 의해 작성되었으며, 을은 작성된 근로계약서 1부를 교부받았음을 확인합니다.
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-bold text-slate-800">수령자 성명:</span>
          <span className="text-[11.5px] font-black text-slate-900 border-b border-slate-500 px-2 min-w-[70px] text-center">
            {form.employeeName || " "}
          </span>
          <InlineSignSpot
            signKey="receipt"
            signUrl={signUrls.receipt}
            onOpen={onOpenSign}
            onClear={onClearSign}
            width={120}
            height={32}
            placeholder="(수령자 서명)"
          />
        </div>
      </div>

      {/* 계약일 (년/월/일) */}
      <div className="mt-4 flex items-center justify-center gap-3 text-[18px] font-black tracking-widest text-slate-900">
        <span className="tabular-nums">{csY || "20__"}</span>
        <span>년</span>
        <span className="tabular-nums">{typeof csM === "number" ? csM : "__"}</span>
        <span>월</span>
        <span className="tabular-nums">{typeof csD === "number" ? csD : "__"}</span>
        <span>일</span>
      </div>

      {/* 하단 서명 · 갑/을 · grid grid-cols-2 · avoidBreak · 상단 2px 구분선 */}
      <div
        className="mt-3 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3"
        style={{ borderTop: "2px solid #1e293b", pageBreakInside: "avoid", breakInside: "avoid" }}
      >
        {/* 사용자 (갑) */}
        <PartyCell partyLabel="사용자 · 갑">
          <FieldRow label="상호" value={form.companyName || "-"} />
          <FieldRow label="대표" value={form.employerName || "-"} />
          <FieldRow label="주소" value={form.companyAddress || "-"} />
          {form.companyRegNo && (
            <FieldRow label="사업자등록번호" value={form.companyRegNo} />
          )}
          <div className="flex items-center justify-end mt-1">
            <span className="text-[10.5px] text-slate-500 font-bold mr-2">(도장)</span>
            <InlineSignSpot
              signKey="employer"
              signUrl={signUrls.employer}
              stampUrl={employerStampUrl}
              onOpen={onOpenSign}
              onClear={onClearSign}
              width={96}
              height={48}
              placeholder="(도장)"
            />
          </div>
        </PartyCell>

        {/* 근로자 (을) */}
        <PartyCell partyLabel="근로자 · 을">
          <FieldRow label="성명" value={form.employeeName || "-"} />
          <FieldRow label="주민번호" value={<span className="tabular-nums">{form.employeeBirth || "-"}</span>} />
          <FieldRow label="주소" value={form.employeeAddress || "-"} />
          <FieldRow label="전화번호" value={<span className="tabular-nums">{form.employeePhone || "-"}</span>} />
          <FieldRow
            label="은행/계좌"
            value={
              (form.bankName || form.bankAccountNumber)
                ? `${form.bankName ?? ""} ${form.bankAccountNumber ?? ""}`.trim() || "-"
                : (form.employeeBankAccount || "-")
            }
          />
          <FieldRow label="이메일" value={form.employeeEmail || "-"} />
          <div className="flex items-center justify-end mt-1">
            <span className="text-[10.5px] text-slate-500 font-bold mr-2">(서명)</span>
            <InlineSignSpot
              signKey="employee"
              signUrl={signUrls.employee}
              stampUrl={employeeStampUrl}
              onOpen={onOpenSign}
              onClear={onClearSign}
              width={96}
              height={48}
              placeholder="(서명)"
            />
          </div>
        </PartyCell>
      </div>

      {/* 개인정보/CCTV 동의 · 4분류 표 유지 · avoidBreak */}
      <div
        className="mt-5"
        style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
      >
        <div className="border-l-[3px] border-slate-700 pl-3 mb-2">
          <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
            개인정보 · CCTV 설치 동의
          </h3>
        </div>
        <table className="w-full border-collapse border border-slate-400 text-[11px] rounded-sm overflow-hidden">
          <tbody>
            <tr>
              <td
                className="border border-slate-300 px-2 py-1 text-center font-black w-[22%]"
                style={{ backgroundColor: HEX.slateHead }}
              >
                정보의 수집·이용 목적<br /><span className="text-[10px] text-slate-600">(CCTV 설치 목적)</span>
              </td>
              <td className="border border-slate-300 px-2 py-1 text-slate-800 align-top">
                당사의 인적자원관리, 방범 및 화재예방, 시설안전관리, 사업장내 사고예방 및 범죄예방
              </td>
              <td
                className="border border-slate-300 px-2 py-1 text-center font-black w-[18%]"
                style={{ backgroundColor: HEX.slateHead }}
              >
                정보 보유 및 이용기간
              </td>
              <td className="border border-slate-300 px-2 py-1 text-slate-800 align-top">
                근로관계가 유지되는 기간. 단, CCTV 화상영상 정보의 경우 일정기간 후 기존 영상정보에서 삭제
              </td>
            </tr>
            <tr>
              <td
                className="border border-slate-300 px-2 py-1 text-center font-black"
                style={{ backgroundColor: HEX.slateHead }}
              >
                개인정보의 항목
              </td>
              <td className="border border-slate-300 px-2 py-1 text-slate-800 align-top" colSpan={3}>
                <ol className="list-decimal list-inside space-y-0.5 text-[10.5px]">
                  {PRIVACY_ITEMS.map((p, i) => <li key={i}>{p}</li>)}
                </ol>
              </td>
            </tr>
            <tr>
              <td
                className="border border-slate-300 px-2 py-1 text-center font-black"
                style={{ backgroundColor: HEX.slateHead }}
              >
                CCTV 촬영시간 및 범위
              </td>
              <td className="border border-slate-300 px-2 py-1 text-slate-800 align-top" colSpan={3}>
                촬영시간: 24시간 연속 촬영 및 녹화 · 촬영범위: 출입구 및 복도, 사업장 내 등 건물 내 주요 시설
              </td>
            </tr>
            <tr>
              <td
                className="border border-slate-300 px-2 py-1 text-slate-800 align-top text-[10.5px]"
                colSpan={4}
                style={{ backgroundColor: HEX.amberSoft }}
              >
                회사는 개인정보를 인사관리업무와 관련된 업무(기관)외 다른 목적으로 이용하거나 제3자에게 제공하지 않으며, CCTV 설치도 상기 목적외 다른 목적으로 이용하지 않습니다.
                <br />
                위 내용을 충분히 숙지하고 개인정보의 수집 및 CCTV 설치 이용에 대하여 동의합니다.
              </td>
            </tr>
          </tbody>
        </table>
        {/* 동의/서명 행 · flex */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
          <label className="inline-flex items-center gap-1">
            <SpanBox checked={form.privacyConsent.agreedCollection && form.privacyConsent.agreedCCTV} />
            <span>동의</span>
          </label>
          <label className="inline-flex items-center gap-1">
            <SpanBox checked={!(form.privacyConsent.agreedCollection && form.privacyConsent.agreedCCTV)} />
            <span>동의하지 않음</span>
          </label>
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[11px] text-slate-700 font-bold">성명:</span>
            <span className="text-[11.5px] font-black text-slate-900 border-b border-slate-500 px-2 min-w-[70px] text-center">
              {form.privacyConsent.recipientName || form.employeeName || " "}
            </span>
            <InlineSignSpot
              signKey="privacy"
              signUrl={signUrls.privacy}
              onOpen={onOpenSign}
              onClear={onClearSign}
              width={120}
              height={30}
              placeholder="(서명)"
            />
          </div>
        </div>
      </div>
    </div>
  );
});
ContractPreview.displayName = "ContractPreview";

// ─────────────────────────────────────────────────────────────────────────────
// 연장 모달 (기존 유지)
// ─────────────────────────────────────────────────────────────────────────────

const ExtendContractModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  months: string;
  setMonths: (v: string) => void;
  existingEnd: string | null | undefined;
  hireDateReference: string | null;
}> = ({ open, onClose, onConfirm, months, setMonths, existingEnd, hireDateReference }) => {
  const preview = useMemo(() => {
    if (!existingEnd) return null;
    const baseEnd = new Date(existingEnd);
    if (Number.isNaN(baseEnd.getTime())) return null;
    const n = Number(months);
    if (!Number.isFinite(n) || n <= 0) return null;
    const newStart = new Date(baseEnd);
    newStart.setDate(newStart.getDate() + 1);
    const newEnd = new Date(newStart);
    newEnd.setMonth(newEnd.getMonth() + n);
    newEnd.setDate(newEnd.getDate() - 1);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { start: iso(newStart), end: iso(newEnd) };
  }, [existingEnd, months]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-emerald-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center shadow-sm">
              <ClockCounterClockwise size={13} weight="fill" className="text-white" />
            </div>
            <span className="text-sm font-black text-slate-800">근로계약 연장</span>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 w-7 h-7 rounded-md hover:bg-white/70 cursor-pointer flex items-center justify-center" title="닫기">
            <XIcon size={13} weight="bold" />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="text-[12px] text-slate-700 leading-relaxed">
            현재 계약 종료일 <b className="text-slate-900">{existingEnd ?? "-"}</b> 다음 날부터 지정한 개월수만큼 자동으로 신규 계약서를 작성합니다.
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-bold text-slate-600 flex items-center gap-1">연장 개월수 <span className="text-rose-500">*</span></label>
            <div className="flex flex-wrap gap-1.5">
              {["1", "3", "6", "12", "24"].map(m => {
                const active = months === m;
                return (
                  <button key={m} type="button" onClick={() => setMonths(m)}
                    className={`px-3 py-1.5 rounded-lg border text-[13px] font-black transition-colors cursor-pointer ${
                      active ? "bg-indigo-500 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {m}개월
                  </button>
                );
              })}
              <div className="flex items-center gap-1 ml-1">
                <input type="number" min={1} max={120} value={months} onChange={(e) => setMonths(e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-800 font-black text-right focus:outline-none focus:border-indigo-500 focus:shadow-sm transition" placeholder="직접" />
                <span className="text-[11px] font-semibold text-slate-500">개월</span>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 px-3 py-2 text-[12px] flex flex-col gap-1">
            <div className="font-black text-indigo-800 flex items-center gap-1">
              <CalendarBlank size={12} weight="fill" />신규 계약 기간
            </div>
            {preview ? (
              <div className="text-slate-800">
                <b className="font-black">{preview.start}</b><span className="mx-1 text-slate-400">~</span><b className="font-black">{preview.end}</b>
              </div>
            ) : <div className="text-rose-600 font-semibold">개월수를 입력하면 신규 기간이 계산됩니다.</div>}
            {hireDateReference && <div className="text-[11px] text-slate-500 mt-0.5">· 입사일 <b className="text-slate-700">{hireDateReference}</b> 은 변경되지 않고 유지됩니다 (근속 산정용).</div>}
          </div>
          <div className="text-[11px] text-amber-700 bg-amber-50/70 border border-amber-200 rounded-lg px-2.5 py-1.5">
            확정 시 현재 폼에 신규 계약 기간이 반영되고 · 서명 상태가 초기화됩니다. 서명 후 [계약완료 승인] 을 눌러 저장하세요.
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[12px] font-bold text-slate-600 bg-white border border-slate-300 rounded-md h-8 px-3 hover:bg-slate-50 cursor-pointer">취소</button>
          <button type="button" onClick={onConfirm} disabled={!preview}
            className="text-[12px] font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-md h-8 px-4 cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm">
            <Check size={12} weight="bold" />연장 확정
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────────────────────────────────────

const DRAFT_STORAGE_KEY = "megatown_contract_writer_draft";
const DRAFT_TIMESTAMP_KEY = "megatown_contract_writer_draft_ts";

// T-W (2026-08-05) · 좌측 카드 접기/펴기 · localStorage 저장 · 기본 모두 펼침
const CARD_COLLAPSE_STORAGE_KEY = "contractWriter:cardCollapsed";
type CardKey = "employee" | "workCondition" | "wage" | "period" | "wageCompare" | "employerEtc";
type CardCollapsedMap = Partial<Record<CardKey, boolean>>;

function loadCardCollapsedMap(): CardCollapsedMap {
  try {
    const raw = localStorage.getItem(CARD_COLLAPSE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as CardCollapsedMap;
  } catch { /* silent */ }
  return {};
}

function saveCardCollapsedMap(map: CardCollapsedMap): void {
  try { localStorage.setItem(CARD_COLLAPSE_STORAGE_KEY, JSON.stringify(map)); }
  catch { /* silent */ }
}

const ContractWriterPage: React.FC<ContractWriterPageProps> = ({ authSession, onBack, onNavigate, onLogout, embedded = false }) => {
  // ── T14/Phase B · 직급별 기본 시급 로드 (useSettings) · 사용자 편집 가능 유지
  const settings = useSettings();

  // ── draft 로드 · 마이그레이션 (신규 필드 default) ──
  const [form, setForm] = useState<ContractForm>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const base = emptyForm();
          const wageMerged: WageComponents = {
            ...base.wageComponents,
            ...(parsed.wageComponents ?? {}),
            // fixedAnnualLeave 신규 · 없으면 default
            fixedAnnualLeave: parsed.wageComponents?.fixedAnnualLeave ?? base.wageComponents.fixedAnnualLeave,
            // fixedHolidayOvertime (구 fixedHolidayNight 를 대체) · 없으면 default
            fixedHolidayOvertime: parsed.wageComponents?.fixedHolidayOvertime
              ?? parsed.wageComponents?.fixedHolidayNight
              ?? base.wageComponents.fixedHolidayOvertime,
          };
          // workDays 없으면 기본 (구 draft 는 workDays 있음)
          const workDaysMerged = parsed.workDays ?? base.workDays;
          return {
            ...base,
            ...parsed,
            wageComponents: wageMerged,
            workDays: workDaysMerged,
            privacyConsent: { ...base.privacyConsent, ...(parsed.privacyConsent ?? {}) },
          } as ContractForm;
        }
      }
    } catch { /* silent */ }
    return emptyForm();
  });

  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(() => {
    try { return localStorage.getItem(DRAFT_TIMESTAMP_KEY); } catch { return null; }
  });

  // T-Q (2026-08-05) · 실수령액 상세 · 소득세 포함 토글 · default OFF (참고 표시만)
  const [includeIncomeTax, setIncludeIncomeTax] = useState<boolean>(false);
  // T-Q · 실수령액 상세 카드 접기/펼치기 · default 펼침
  const [netDetailOpen, setNetDetailOpen] = useState<boolean>(true);

  // T-W (2026-08-05) · 좌측 카드 접기/펴기 상태 · localStorage 지속
  const [cardCollapsed, setCardCollapsed] = useState<CardCollapsedMap>(() => loadCardCollapsedMap());
  const toggleCard = useCallback((key: CardKey) => {
    setCardCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveCardCollapsedMap(next);
      return next;
    });
  }, []);
  const isCardCollapsed = useCallback((key: CardKey) => Boolean(cardCollapsed[key]), [cardCollapsed]);

  // T-R (2026-08-05) · 작성 방식 · [여기서 작성] vs [PDF 업로드]
  const [writeMode, setWriteMode] = useState<"form" | "upload">("form");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState<boolean>(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
      const ts = new Date().toISOString();
      localStorage.setItem(DRAFT_TIMESTAMP_KEY, ts);
      setDraftSavedAt(ts);
    } catch {
      alert("임시저장 실패 · 브라우저 저장공간 부족");
    }
  }, [form]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
        const ts = new Date().toISOString();
        localStorage.setItem(DRAFT_TIMESTAMP_KEY, ts);
        setDraftSavedAt(ts);
      } catch { /* silent */ }
    }, 30_000);
    return () => window.clearTimeout(t);
  }, [form]);
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      localStorage.removeItem(DRAFT_TIMESTAMP_KEY);
      setDraftSavedAt(null);
    } catch { /* silent */ }
  }, []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);
  const [empSearchOpen, setEmpSearchOpen] = useState(false);

  // ── 서명 URL · 7 활성 지점 (레거시 5 유지 · null 로) ──
  const [signUrls, setSignUrls] = useState<Record<SignKey, string | null>>(() => ({
    employer: null, employee: null, privacy: null,
    specialWork: null, breakChange: null,
    wageClause3: null, wageClause4: null,
    etc5: null, receipt: null,
    wageAck: null, workTimeAck: null, etcAck: null,
  }));

  // ── 서명 모달 상태 ──
  const [signModal, setSignModal] = useState<{ open: boolean; key: SignKey | null }>({ open: false, key: null });
  const openSign = useCallback((key: SignKey) => setSignModal({ open: true, key }), []);
  const closeSign = useCallback(() => setSignModal({ open: false, key: null }), []);
  const submitSign = useCallback((dataUrl: string) => {
    setSignUrls(prev => (signModal.key ? { ...prev, [signModal.key]: dataUrl } : prev));
    setSignModal({ open: false, key: null });
  }, [signModal.key]);
  const clearSign = useCallback((key: SignKey) => {
    setSignUrls(prev => ({ ...prev, [key]: null }));
  }, []);

  // 도장 자동 (H)
  const employerStampUrl = useMemo(() =>
    form.employerName?.trim() === "강남성" ? sungstampUrl : null,
    [form.employerName]);

  const employeeStampUrl = useMemo(() => {
    const n = form.employeeName?.trim();
    if (n === "강남규") return kyustampUrl;
    return null;
  }, [form.employeeName]);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // #220 · 연장 기능
  interface ExistingContract {
    id?: number;
    contract_type?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    created_at?: string | null;
    pdf_url?: string | null;
  }
  const [existingContract, setExistingContract] = useState<ExistingContract | null>(null);
  const [existingLoading, setExistingLoading] = useState(false);
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendMonths, setExtendMonths] = useState<string>("3");
  const [hireDateReference, setHireDateReference] = useState<string | null>(null);

  // 직원 목록
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEmpLoading(true);
      setEmpError(null);
      try {
        const now = new Date();
        const y = now.getFullYear(), m = now.getMonth() + 1;
        const res = await fetch(`/api/schedules?year=${y}&month=${m}`);
        if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data?.employees) ? data.employees : [];
        setEmployees(list);
      } catch (err: any) {
        if (!cancelled) setEmpError(err?.message ?? "직원 목록 불러오기 실패");
      } finally {
        if (!cancelled) setEmpLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // prefill (직원목록 [작성] 버튼)
  const [prefillConsumed, setPrefillConsumed] = useState(false);

  // 2026-08-05 · 시급 자동 로드 상태 · 사용자 직접 입력 vs 자동 로드 구분
  const wageAutoLoadedRef = useRef(false);
  const lastAutoWageRef = useRef<{ wd: string; we: string } | null>(null);
  const wageAutoInitRef = useRef(false);
  useEffect(() => {
    if (prefillConsumed) return;
    try {
      const raw = localStorage.getItem("contract-writer-prefill");
      if (!raw) { setPrefillConsumed(true); return; }
      const p = JSON.parse(raw);
      if (!p || typeof p !== "object") { setPrefillConsumed(true); return; }

      const mapCategory = (pos: string): { cat: ContractForm["employeeCategory"]; custom: string } => {
        const t = String(pos ?? "").trim();
        if (t === "약사") return { cat: "약사", custom: "" };
        if (t === "매장") return { cat: "매장", custom: "" };
        if (t === "창고") return { cat: "창고", custom: "" };
        if (["물류", "캐셔", "진열"].includes(t)) return { cat: "매장", custom: "" };
        if (!t) return { cat: "기타", custom: "" };
        return { cat: "기타", custom: t };
      };
      const mapContractType = (et: string, fallback: string): string => {
        const t = String(et ?? "").trim();
        if (!t) return fallback;
        if (t.includes("정")) return "정규직";
        if (t.includes("계약")) return "계약직";
        if (t.includes("알바") || t.includes("파트")) return "알바";
        return fallback;
      };

      setForm(prev => {
        const { cat, custom } = mapCategory(typeof p.position === "string" ? p.position : "");
        const nextAnnual =
          p.annualLeaveDays != null && p.annualLeaveDays !== ""
            ? String(p.annualLeaveDays)
            : prev.annualLeaveDays;
        // T14/Phase B · 직급별 default 시급 자동 로드 (개인별 override 우선)
        //   · 사용자 편집 가능 유지 · 기존 값이 default 이면만 덮어씀
        //   2026-08-05 · settings 미설정 시 defaultWageForPosition fallback (약사=35000/40000 · 그외=10030/12000)
        //   T-I (2026-08-05) · default 변경: 12000/13500 → 35000/40000 (약사 기본) · 10030/12000 (사원 기본) 도 자동 로드 감지
        const isDefaultWage = (
          (prev.weekdayHourly === "35000" && prev.weekendHourly === "40000") ||
          (prev.weekdayHourly === "10030" && prev.weekendHourly === "12000") ||
          (prev.weekdayHourly === "12000" && prev.weekendHourly === "13500") ||
          (!prev.weekdayHourly && !prev.weekendHourly)
        );
        let wd = prev.weekdayHourly;
        let we = prev.weekendHourly;
        if (isDefaultWage) {
          const rawPos = typeof p.position === "string" ? p.position : "";
          const empId = typeof p.employeeId === "number" ? p.employeeId : null;
          const override = empId != null ? settings.employeeWageOverrides?.[empId] : undefined;
          const positionRate = rawPos ? settings.wageRates?.[rawPos] : undefined;
          const rate = override ?? positionRate ?? (rawPos ? defaultWageForPosition(rawPos) : null);
          if (rate) {
            wd = String(rate.weekday);
            we = String(rate.weekend);
            wageAutoLoadedRef.current = true;
            lastAutoWageRef.current = { wd, we };
          }
        }
        return {
          ...prev,
          employeeId: typeof p.employeeId === "number" ? p.employeeId : prev.employeeId,
          employeeName: typeof p.employeeName === "string" && p.employeeName ? p.employeeName : prev.employeeName,
          employeePhone: typeof p.employeePhone === "string" && p.employeePhone ? p.employeePhone : prev.employeePhone,
          employeeAddress: typeof p.employeeAddress === "string" && p.employeeAddress ? p.employeeAddress : prev.employeeAddress,
          annualLeaveDays: nextAnnual,
          employeeCategory: cat,
          employeeCategoryCustom: custom || prev.employeeCategoryCustom,
          contractType: mapContractType(typeof p.employmentType === "string" ? p.employmentType : "", prev.contractType),
          startDate: typeof p.hireDate === "string" && p.hireDate ? p.hireDate : prev.startDate,
          weekdayHourly: wd,
          weekendHourly: we,
        };
      });
      localStorage.removeItem("contract-writer-prefill");
    } catch { /* silent */ } finally {
      setPrefillConsumed(true);
    }
  }, [prefillConsumed, settings.wageRates, settings.employeeWageOverrides]);

  // T14/Phase B · 직급 기본 시급 재적용 · 사용자 액션
  //   폼의 employeeCategory 기반 · settings 에서 값 로드 · 개인별 override 있으면 그 값 우선
  //   2026-08-05 · settings 에 저장된 값이 없으면 defaultWageForPosition (약사=35000/40000 · 그외=10030/12000) 을 자동 fallback
  const resolveWageForCategory = useCallback((cat: ContractForm["employeeCategory"], custom: string, empId: number | null): WageRate & { posKey: string } => {
    const catToPositionKey = (c: ContractForm["employeeCategory"]): string => {
      if (c === "약사") return "약사";
      if (c === "매장") return "매장";
      if (c === "창고") return "창고";
      return "";
    };
    const posKey = catToPositionKey(cat) || custom || "사원";
    const override = empId != null ? settings.employeeWageOverrides?.[empId] : undefined;
    const positionRate = posKey ? settings.wageRates?.[posKey] : undefined;
    const rate = override ?? positionRate ?? defaultWageForPosition(posKey);
    return { weekday: rate.weekday, weekend: rate.weekend, posKey };
  }, [settings.wageRates, settings.employeeWageOverrides]);

  const applyDefaultHourly = useCallback(() => {
    const { weekday, weekend } = resolveWageForCategory(form.employeeCategory, form.employeeCategoryCustom, form.employeeId);
    setForm(prev => ({ ...prev, weekdayHourly: String(weekday), weekendHourly: String(weekend) }));
    // 자동 로드 마킹 · 이후 카테고리 변경 시 재로드 허용
    wageAutoLoadedRef.current = true;
    lastAutoWageRef.current = { wd: String(weekday), we: String(weekend) };
  }, [form.employeeCategory, form.employeeCategoryCustom, form.employeeId, resolveWageForCategory]);

  // 2026-08-05 · form.employeeCategory 변경 시 자동 재로드
  //   조건: (a) 최초 진입 default (12000/13500) · (b) 빈 값 · (c) 이전에 자동 로드한 값과 정확히 일치
  //   → 사용자가 직접 입력한 값이면 덮어쓰지 않음
  useEffect(() => {
    // 첫 렌더 skip (mount 시엔 default 값 유지)
    if (!wageAutoInitRef.current) {
      wageAutoInitRef.current = true;
      return;
    }
    const wd = form.weekdayHourly;
    const we = form.weekendHourly;
    // T-I (2026-08-05) · 초기 default 감지: 약사 기본 (35000/40000) · 사원 기본 (10030/12000) · 구 default (12000/13500) · 빈 값
    const isInitialDefault =
      (wd === "35000" && we === "40000") ||
      (wd === "10030" && we === "12000") ||
      (wd === "12000" && we === "13500") ||
      (wd === "" && we === "");
    const last = lastAutoWageRef.current;
    const isPreviousAuto = last && wd === last.wd && we === last.we;
    if (!isInitialDefault && !isPreviousAuto) return; // 사용자가 직접 입력한 값 → 유지
    const { weekday, weekend } = resolveWageForCategory(form.employeeCategory, form.employeeCategoryCustom, form.employeeId);
    const nextWd = String(weekday);
    const nextWe = String(weekend);
    if (nextWd === wd && nextWe === we) return; // 이미 동일
    setForm(prev => ({ ...prev, weekdayHourly: nextWd, weekendHourly: nextWe }));
    wageAutoLoadedRef.current = true;
    lastAutoWageRef.current = { wd: nextWd, we: nextWe };
  }, [form.employeeCategory, form.employeeCategoryCustom, form.employeeId, resolveWageForCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // 계약 이력 조회
  useEffect(() => {
    const empId = form.employeeId;
    if (empId == null) {
      setExistingContract(null);
      setHireDateReference(null);
      setExistingLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setExistingLoading(true);
      try {
        const res = await fetch(`/api/employee-contracts?employeeId=${empId}`);
        if (res.ok) {
          const rows = await res.json();
          if (!cancelled) {
            const first = Array.isArray(rows) && rows.length > 0 ? (rows[0] as ExistingContract) : null;
            setExistingContract(first);
          }
        } else if (!cancelled) {
          setExistingContract(null);
        }
        const emp = employees.find(e => e.id === empId);
        const hd = (emp as any)?.hire_date ?? null;
        if (!cancelled) setHireDateReference(typeof hd === "string" && hd ? hd : null);
      } catch {
        if (!cancelled) {
          setExistingContract(null);
          setHireDateReference(null);
        }
      } finally {
        if (!cancelled) setExistingLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [form.employeeId, employees]);

  // 계약 유형 · 정규직 → 무기한 · 계약직 → 유기
  useEffect(() => {
    if (form.contractType === "정규직" && !form.indefinite) {
      setForm(prev => ({ ...prev, indefinite: true, endDate: "" }));
    } else if (form.contractType === "계약직" && form.indefinite) {
      setForm(prev => ({ ...prev, indefinite: false }));
    }
  }, [form.contractType]); // eslint-disable-line react-hooks/exhaustive-deps

  // 계약직 · N개월 → endDate 자동
  useEffect(() => {
    if (form.contractType !== "계약직") return;
    if (form.indefinite) return;
    const months = Number(form.contractMonths);
    if (!Number.isFinite(months) || months <= 0) return;
    if (!form.startDate) return;
    const start = new Date(form.startDate);
    if (isNaN(start.getTime())) return;
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);
    end.setDate(end.getDate() - 1);
    const iso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    if (iso !== form.endDate) {
      setForm(prev => ({ ...prev, endDate: iso }));
    }
  }, [form.contractType, form.contractMonths, form.startDate, form.indefinite]); // eslint-disable-line react-hooks/exhaustive-deps

  // 카테고리 → 업무 기본값
  useEffect(() => {
    const settings = loadContractSettings();
    const defaults: Record<ContractCategory, string> = {
      "약사": settings.약사 || DEFAULT_CONTRACT_SETTINGS.약사,
      "매장": settings.매장 || DEFAULT_CONTRACT_SETTINGS.매장,
      "창고": settings.창고 || DEFAULT_CONTRACT_SETTINGS.창고,
      "기타": settings.기타 || DEFAULT_CONTRACT_SETTINGS.기타,
    };
    const key = form.employeeCategory;
    const nextDuty = form.employeeCategory === "기타" && form.employeeCategoryCustom
      ? `${form.employeeCategoryCustom} 관련 업무`
      : defaults[key];
    const knownDefaults = new Set<string>([
      ...Object.values(defaults),
      ...Object.values(DEFAULT_CONTRACT_SETTINGS).filter((v): v is string => typeof v === "string" && v.length > 0),
    ]);
    const isDefault = !form.jobDuty || knownDefaults.has(form.jobDuty);
    if (isDefault && nextDuty && nextDuty !== form.jobDuty) {
      setForm(prev => ({ ...prev, jobDuty: nextDuty }));
    }
  }, [form.employeeCategory, form.employeeCategoryCustom]); // eslint-disable-line react-hooks/exhaustive-deps

  // 매장/창고 → primaryFocus 자동
  useEffect(() => {
    setForm(prev => {
      if (prev.employeeCategory === "매장" || prev.employeeCategory === "창고") {
        if (prev.primaryFocus == null) {
          return { ...prev, primaryFocus: prev.employeeCategory };
        }
        return prev;
      }
      if (prev.primaryFocus !== null) {
        return { ...prev, primaryFocus: null };
      }
      return prev;
    });
  }, [form.employeeCategory]);

  // 계약체결일 = 시작일 (초기)
  useEffect(() => {
    setForm(prev => (prev.contractSignDate ? prev : { ...prev, contractSignDate: prev.startDate || todayIso() }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // K. 주 근무일수 자동 계산 (요일 체크박스 → 개수)
  const weeklyDays = useMemo(() => DAYS.filter(d => form.workDays[d]).length, [form.workDays]);
  const weeklyWeekdayDays = useMemo(() => WEEKDAYS.filter(d => form.workDays[d]).length, [form.workDays]);
  const weeklyWeekendDays = useMemo(() => WEEKEND.filter(d => form.workDays[d]).length, [form.workDays]);
  const workDaysSummary = useMemo(() => {
    const active = DAYS.filter(d => form.workDays[d]);
    if (active.length === 0) return "선택 안 됨";
    return `${active.join("·")} (주 ${active.length}일)`;
  }, [form.workDays]);

  const upd = useCallback(<K extends keyof ContractForm>(key: K, val: ContractForm[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
  }, []);

  const toggleDay = (d: DayKey) => {
    setForm(prev => ({ ...prev, workDays: { ...prev.workDays, [d]: !prev.workDays[d] } }));
  };

  // 근무시간 → 월 근로시간 계산 (실시간)
  const monthlyCalc = useMemo(() => {
    return computeMonthlyHours(
      form.startTime,
      form.endTime,
      Number(form.breakMinutes) || 0,
      weeklyDays,
    );
  }, [form.startTime, form.endTime, form.breakMinutes, weeklyDays]);

  // 자동계산 적용 → 기본급 시간·분 세팅
  const applyMonthlyHoursToBasic = useCallback(() => {
    if (!monthlyCalc) {
      setNotice({ tone: "err", text: "근무시간을 먼저 입력하세요." });
      return;
    }
    setForm(prev => ({
      ...prev,
      useWageComponents: true,
      wageComponents: {
        ...prev.wageComponents,
        basicSalary: {
          ...prev.wageComponents.basicSalary,
          hours: monthlyCalc.monthlyHoursInt,
          minutes: monthlyCalc.monthlyMinutesRem,
        },
      },
    }));
    setNotice({
      tone: "ok",
      text: `월 근로시간 ${monthlyCalc.monthlyHoursInt}시간 ${monthlyCalc.monthlyMinutesRem}분 을 기본급 항목에 반영했습니다.`,
    });
  }, [monthlyCalc]);

  // T-U (2026-08-05) · workDays·근무시간·시급 변경 시 임금구성표 자동 재계산
  //   · 시급 (통상시급) × 각 항목 시간 = 각 항목 금액
  //   · 기본급 시간 · monthlyCalc 기준 자동 조정 (주말 추가 시 반영)
  //     - 단, 사용자가 수동으로 변경한 basic hours 는 유지 (default 값 209 또는 이전 monthlyCalc 값일 때만 자동 갱신)
  //   · 연장·휴일·연차 시간 · 그대로 유지 (사용자가 조정한 항목)
  //   · 금액은 각 항목 시간 × 시급 (또는 야간·휴일연장은 × 0.5) 로 재산정
  const lastAutoBasicHoursRef = useRef<{ h: number; m: number } | null>(null);
  useEffect(() => {
    setForm(prev => {
      const wd = Number(prev.weekdayHourly) || 0;
      const we = Number(prev.weekendHourly) || 0;
      if (wd <= 0) return prev; // 시급 미입력 시 skip

      let nextWage = prev.wageComponents;

      // 1) basic hours 자동 갱신 · monthlyCalc 있고 · 사용자가 수동 조정 안 한 경우
      //    (조건: 현재 basic hours = 최근 자동 반영값 OR default 209h OR 0)
      if (monthlyCalc) {
        const cur = prev.wageComponents.basicSalary;
        const last = lastAutoBasicHoursRef.current;
        const isDefaultBasic =
          (cur.hours === 209 && cur.minutes === 0) ||
          (cur.hours === 0 && cur.minutes === 0) ||
          (last != null && cur.hours === last.h && cur.minutes === last.m);
        if (isDefaultBasic) {
          const nextH = monthlyCalc.monthlyHoursInt;
          const nextM = monthlyCalc.monthlyMinutesRem;
          if (cur.hours !== nextH || cur.minutes !== nextM) {
            nextWage = {
              ...nextWage,
              basicSalary: { ...cur, hours: nextH, minutes: nextM },
            };
            lastAutoBasicHoursRef.current = { h: nextH, m: nextM };
          } else {
            lastAutoBasicHoursRef.current = { h: nextH, m: nextM };
          }
        }
      }

      // 2) 각 항목 시간 × 시급 재계산 (배수 · 야간/휴일연장 0.5)
      const calc = computeWageFromHourlyDual(wd, we, nextWage);
      const nextComp: WageComponents = {
        ...nextWage,
        basicSalary:          { ...nextWage.basicSalary,          amount: calc.basicAmount },
        fixedOvertime:        { ...nextWage.fixedOvertime,        amount: calc.overtimeAmount },
        fixedHoliday:         { ...nextWage.fixedHoliday,         amount: calc.holidayAmount },
        fixedHolidayOvertime: { ...nextWage.fixedHolidayOvertime, amount: calc.holidayOvertimeAmount },
        fixedNight:           { ...nextWage.fixedNight,           amount: calc.nightAmount },
        fixedAnnualLeave:     { ...nextWage.fixedAnnualLeave,     amount: calc.annualLeaveAmount },
      };

      // 변화 감지 (basic hours 갱신 · 또는 6항목 금액 갱신)
      const changed =
        nextWage !== prev.wageComponents ||
        nextComp.basicSalary.amount          !== prev.wageComponents.basicSalary.amount ||
        nextComp.fixedOvertime.amount        !== prev.wageComponents.fixedOvertime.amount ||
        nextComp.fixedHoliday.amount         !== prev.wageComponents.fixedHoliday.amount ||
        nextComp.fixedHolidayOvertime.amount !== prev.wageComponents.fixedHolidayOvertime.amount ||
        nextComp.fixedNight.amount           !== prev.wageComponents.fixedNight.amount ||
        nextComp.fixedAnnualLeave.amount     !== prev.wageComponents.fixedAnnualLeave.amount;
      if (!changed) return prev;
      return { ...prev, wageComponents: nextComp };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.workDays,
    form.startTime,
    form.endTime,
    form.breakMinutes,
    form.weekdayHourly,
    form.weekendHourly,
    form.wageComponents.basicSalary.hours,
    form.wageComponents.basicSalary.minutes,
    form.wageComponents.fixedOvertime.hours,
    form.wageComponents.fixedOvertime.minutes,
    form.wageComponents.fixedHoliday.hours,
    form.wageComponents.fixedHoliday.minutes,
    form.wageComponents.fixedHolidayOvertime.hours,
    form.wageComponents.fixedHolidayOvertime.minutes,
    form.wageComponents.fixedNight.hours,
    form.wageComponents.fixedNight.minutes,
    form.wageComponents.fixedAnnualLeave.hours,
    form.wageComponents.fixedAnnualLeave.minutes,
    monthlyCalc,
  ]);

  // 직원 선택
  const onSelectEmployee = (empIdRaw: string) => {
    if (!empIdRaw) { upd("employeeId", null); return; }
    const empId = Number(empIdRaw);
    const emp = employees.find(e => e.id === empId);
    if (!emp) { upd("employeeId", empId); return; }
    setForm(prev => ({
      ...prev,
      employeeId: emp.id,
      employeeName: emp.name || prev.employeeName,
      employeePhone: emp.phone || prev.employeePhone,
      employeeAddress: emp.address || prev.employeeAddress,
      annualLeaveDays: emp.annual_leave_days != null ? String(emp.annual_leave_days) : prev.annualLeaveDays,
      employeeCategory: (() => {
        const pos = String(emp.position || "").trim();
        if (pos === "약사")  return "약사" as const;
        if (pos === "매장")  return "매장" as const;
        if (pos === "창고")  return "창고" as const;
        if (["물류", "캐셔", "진열"].includes(pos)) return "매장" as const;
        return "기타" as const;
      })(),
      employeeCategoryCustom: (() => {
        const pos = String(emp.position || "").trim();
        return pos && pos !== "약사" ? pos : prev.employeeCategoryCustom;
      })(),
      contractType: (() => {
        const et = (emp.employmentType || "").trim();
        if (et.includes("정")) return "정규직";
        if (et.includes("계약")) return "계약직";
        if (et.includes("알바") || et.includes("파트")) return "알바";
        return prev.contractType;
      })(),
      primaryFocus: (emp.primary_focus === "매장" || emp.primary_focus === "창고")
        ? emp.primary_focus
        : prev.primaryFocus,
      primaryFocusPercent: (typeof emp.primary_focus_percent === "number" && emp.primary_focus_percent > 0)
        ? emp.primary_focus_percent
        : prev.primaryFocusPercent,
    }));
  };

  // 서명 전체 초기화
  const clearAllSignatures = useCallback(() => {
    setSignUrls({
      employer: null, employee: null, privacy: null,
      specialWork: null, breakChange: null,
      wageClause3: null, wageClause4: null,
      etc5: null, receipt: null,
      wageAck: null, workTimeAck: null, etcAck: null,
    });
  }, []);

  // #220 · 연장 확정
  const handleExtendConfirm = () => {
    const months = Number(extendMonths);
    if (!Number.isFinite(months) || months <= 0) {
      setNotice({ tone: "err", text: "연장 개월수를 올바르게 입력하세요." });
      return;
    }
    const baseEnd = existingContract?.end_date;
    if (!baseEnd) {
      setNotice({ tone: "err", text: "기존 계약서에 종료일이 없어 연장할 수 없습니다." });
      return;
    }
    const baseEndDate = new Date(baseEnd);
    if (Number.isNaN(baseEndDate.getTime())) {
      setNotice({ tone: "err", text: "기존 계약서 종료일이 유효하지 않습니다." });
      return;
    }
    const newStart = new Date(baseEndDate);
    newStart.setDate(newStart.getDate() + 1);
    const newStartIso = `${newStart.getFullYear()}-${String(newStart.getMonth() + 1).padStart(2, "0")}-${String(newStart.getDate()).padStart(2, "0")}`;
    const newEnd = new Date(newStart);
    newEnd.setMonth(newEnd.getMonth() + months);
    newEnd.setDate(newEnd.getDate() - 1);
    const newEndIso = `${newEnd.getFullYear()}-${String(newEnd.getMonth() + 1).padStart(2, "0")}-${String(newEnd.getDate()).padStart(2, "0")}`;

    setForm(prev => ({
      ...prev,
      contractType: "계약직",
      contractMonths: String(months),
      indefinite: false,
      startDate: newStartIso,
      endDate: newEndIso,
      contractSignDate: newStartIso,
    }));

    clearAllSignatures();
    setExtendModalOpen(false);
    setNotice({
      tone: "ok",
      text: `${months}개월 연장 초안이 작성되었습니다. 신규 기간 ${newStartIso} ~ ${newEndIso} · 입사일 ${hireDateReference ?? "(정보 없음)"} 은 유지됩니다. 서명 후 [계약완료 승인] 을 눌러 저장하세요.`,
    });
  };

  // 폼 리셋 · T-N (2026-08-05) · 임시저장(localStorage) 도 함께 삭제
  const handleReset = () => {
    if (!window.confirm("입력한 모든 내용 · 서명 · 임시저장까지 전체 초기화합니다.\n계속하시겠습니까?")) return;
    setForm(emptyForm());
    clearAllSignatures();
    clearDraft();
    setNotice({ tone: "ok", text: "전체 초기화되었습니다." });
  };

  // PDF 빌드 · T-M (2026-08-05) · A4 2장 자동 분할 (210mm × 297mm × 2)
  //   - 컨텐츠가 1장 이내면 1페이지
  //   - 1장 초과 ~ 2장 이내면 정확히 2페이지에 분할 (contentSection 단위 pageBreakInside: avoid 존중)
  //   - 2장 초과 시 자연 분할 계속 (안전장치)
  const buildPdfFromPreview = async (): Promise<{ pdf: jsPDF; filename: string }> => {
    const node = previewRef.current;
    if (!node) throw new Error("계약서 프리뷰를 찾을 수 없습니다.");

    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: node.scrollWidth,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pdfW = pdf.internal.pageSize.getWidth();   // A4 = 210mm
    const pdfH = pdf.internal.pageSize.getHeight();  // A4 = 297mm
    const imgW = pdfW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pdfH) {
      // 1장 이내 · 1페이지
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH, undefined, "FAST");
    } else if (imgH <= pdfH * 2) {
      // T-M · A4 2장 이내 → 정확히 2페이지에 균등 배분 (컨텐츠 높이의 절반씩)
      // 상반부 · 페이지 1
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH, undefined, "FAST");
      // 하반부 · 페이지 2 (기존 image 를 -pdfH offset 하여 하단만 보임)
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, -pdfH, imgW, imgH, undefined, "FAST");
    } else {
      // 안전장치 · 2장 초과 시 자연 분할 (기존 로직 유지)
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgW, imgH, undefined, "FAST");
      heightLeft -= pdfH;
      while (heightLeft > 0) {
        position -= pdfH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgW, imgH, undefined, "FAST");
        heightLeft -= pdfH;
      }
    }

    const safeName = (form.employeeName || "근로자").replace(/[\\/:*?"<>|]/g, "_");
    const safeDate = (form.startDate || todayIso()).replace(/-/g, "");
    const filename = `근로계약서_${safeName}_${safeDate}.pdf`;
    return { pdf, filename };
  };

  // 서명 상태 (9 지점)
  const signatureStatus = useMemo(() => {
    const filled = SIGN_KEYS.filter(k => !!signUrls[k]).length;
    return { filled, total: SIGN_KEYS.length };
  }, [signUrls]);

  // 검증
  const validateBeforeAction = (opts: { requireAllSignatures: boolean }): boolean => {
    if (!form.employeeName.trim()) {
      setNotice({ tone: "err", text: "근로자 성명을 입력하세요." });
      return false;
    }
    if (!form.startDate) {
      setNotice({ tone: "err", text: "계약 시작일을 입력하세요." });
      return false;
    }
    if (!form.indefinite && !form.endDate) {
      setNotice({ tone: "err", text: "계약 종료일을 입력하거나 '무기한'을 선택하세요." });
      return false;
    }
    const missing = SIGN_KEYS.filter(k => !signUrls[k]);
    if (missing.length > 0) {
      const names = missing.map(k => SIGN_LABEL[k]);
      if (opts.requireAllSignatures) {
        setNotice({ tone: "err", text: `서명 누락 (${missing.length}/${SIGN_KEYS.length}): ${names.join(" · ")}` });
        return false;
      } else {
        if (!window.confirm(`서명이 ${missing.length}/${SIGN_KEYS.length} 비어있습니다:\n${names.join(" · ")}\n\n서명 없이 PDF를 생성하시겠습니까?`)) return false;
      }
    }
    return true;
  };

  // 계약 완료 → PDF 로컬 저장
  const handleComplete = async () => {
    setNotice(null);
    if (!validateBeforeAction({ requireAllSignatures: false })) return;
    setGenerating(true);
    await new Promise(r => setTimeout(r, 60));
    try {
      const { pdf, filename } = await buildPdfFromPreview();
      pdf.save(filename);
      setNotice({ tone: "ok", text: "PDF 다운로드가 시작되었습니다." });
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message ?? "PDF 생성에 실패했습니다." });
    } finally {
      setGenerating(false);
    }
  };

  // 계약완료 승인 · DB 저장
  const handleApproveAndSave = async () => {
    setNotice(null);
    if (!validateBeforeAction({ requireAllSignatures: true })) return;
    setGenerating(true);
    await new Promise(r => setTimeout(r, 60));
    try {
      const { pdf, filename } = await buildPdfFromPreview();
      const pdfDataUrl = pdf.output("datauristring");
      const body = {
        employee_id: form.employeeId,
        employee_name: form.employeeName,
        contract_type: form.contractType || null,
        start_date: form.startDate || null,
        end_date: form.indefinite ? null : (form.endDate || null),
        pdf_data_url: pdfDataUrl,
        approved_by: authSession?.employeeName ?? null,
        approved_by_id: authSession?.employeeId ?? null,
      };
      const resp = await fetch("/api/employee-contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const saved = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = saved?.error ?? `저장 실패 (HTTP ${resp.status})`;
        pdf.save(filename);
        setNotice({ tone: "err", text: `${msg} · 로컬 다운로드만 진행되었습니다.` });
        return;
      }
      pdf.save(filename);
      const pdfUrl: string | undefined = saved?.pdf_url;
      setNotice({
        tone: "ok",
        text: pdfUrl ? `계약이 승인되어 저장되었습니다. 다운로드 링크: ${pdfUrl}` : "계약이 승인되어 저장되었습니다.",
      });
      clearDraft();
      if (saved && (saved.start_date || saved.end_date)) {
        setExistingContract({
          id: saved.id,
          contract_type: saved.contract_type,
          start_date: saved.start_date,
          end_date: saved.end_date,
          created_at: saved.created_at,
          pdf_url: saved.pdf_url,
        });
      }
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message ?? "계약 승인·저장에 실패했습니다." });
    } finally {
      setGenerating(false);
    }
  };

  // T-R (2026-08-05) · PDF 업로드 방식 · Google Drive (contract 폴더) 저장
  const handleUploadContract = async () => {
    setNotice(null);
    if (!uploadFile) {
      setNotice({ tone: "err", text: "업로드할 PDF 파일을 선택하세요." });
      return;
    }
    if (!form.employeeName.trim()) {
      setNotice({ tone: "err", text: "근로자 성명을 입력하세요 (왼쪽 폼)." });
      return;
    }
    if (!/pdf$/i.test(uploadFile.name) && uploadFile.type !== "application/pdf") {
      setNotice({ tone: "err", text: "PDF 파일만 업로드 가능합니다." });
      return;
    }
    if (uploadFile.size > 20 * 1024 * 1024) {
      setNotice({ tone: "err", text: `파일 크기 초과 (${(uploadFile.size / 1024 / 1024).toFixed(1)}MB > 20MB)` });
      return;
    }

    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append("contract", uploadFile);
      if (form.employeeId != null) fd.append("employee_id", String(form.employeeId));
      fd.append("employee_name", form.employeeName);
      if (form.contractType) fd.append("contract_type", form.contractType);
      if (form.startDate) fd.append("start_date", form.startDate);
      if (!form.indefinite && form.endDate) fd.append("end_date", form.endDate);
      if (authSession?.employeeName) fd.append("approved_by", authSession.employeeName);
      if (authSession?.employeeId != null) fd.append("approved_by_id", String(authSession.employeeId));

      const resp = await fetch("/api/employee-contracts/upload", { method: "POST", body: fd });
      const saved = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = saved?.error ?? `업로드 실패 (HTTP ${resp.status})`;
        setNotice({ tone: "err", text: msg });
        return;
      }
      setNotice({
        tone: "ok",
        text: saved?.pdf_url
          ? `Google Drive 업로드 완료 · 링크: ${saved.pdf_url}`
          : "Google Drive 업로드 완료",
      });
      clearDraft();
      setUploadFile(null);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      if (saved && (saved.start_date || saved.end_date)) {
        setExistingContract({
          id: saved.id,
          contract_type: saved.contract_type,
          start_date: saved.start_date,
          end_date: saved.end_date,
          created_at: saved.created_at,
          pdf_url: saved.pdf_url,
        });
      }
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message ?? "업로드 실패" });
    } finally {
      setUploadBusy(false);
    }
  };

  const canApprove = signatureStatus.filled === signatureStatus.total;

  // ────────────────────────────────────────────────────────────────
  // 좌측 폼 · 재디자인 (2026-08-05) · BambooHR/Rippling/Notion 벤치마크
  //   · 라벨 상단 · 필드 그룹핑 · slate+indigo+emerald 팔레트
  //   · 11px uppercase tracking-wider 라벨 · 13px 값 텍스트
  // ────────────────────────────────────────────────────────────────

  // 폼 내 공용 스타일 토큰
  const fldInput = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition placeholder:text-slate-400 placeholder:font-normal";
  const fldLabel = "block text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1";
  const cardBase = "rounded-xl border border-slate-200 bg-white p-3 flex flex-col gap-3 shadow-sm";
  const cardInner = "rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 flex flex-col gap-2";
  const cardGroupLabel = "text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-0.5";

  const leftFormNode = (
    <section className="bg-slate-50 flex flex-col gap-3 h-full overflow-y-auto p-0.5">

      {/* ── 폼 헤더 ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
          <ClipboardText size={16} weight="fill" className="text-indigo-600" />
        </div>
        <div>
          <h2 className="text-[13px] font-black text-slate-800 leading-tight">계약 조건 입력</h2>
          <p className="text-[10.5px] text-slate-400 font-semibold mt-0.5">근로자 정보와 근무조건을 입력하세요</p>
        </div>
      </div>

      {/* ── T-R (2026-08-05) · 작성 방식 토글 ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2">
        <div className="grid grid-cols-2 gap-1">
          {([
            { key: "form" as const,   label: "여기서 작성", desc: "폼 입력 → 미리보기 → PDF 생성" },
            { key: "upload" as const, label: "PDF 업로드",  desc: "이미 작성된 PDF 를 Drive 에 저장" },
          ]).map(m => {
            const active = writeMode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setWriteMode(m.key)}
                className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                  active
                    ? "bg-gradient-to-br from-indigo-50 to-emerald-50 border-indigo-400 shadow-sm"
                    : "bg-white border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className={`text-[12px] font-black ${active ? "text-indigo-700" : "text-slate-600"}`}>
                  {m.label}
                </span>
                <span className={`text-[10px] font-semibold ${active ? "text-slate-600" : "text-slate-400"}`}>
                  {m.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── T-R · PDF 업로드 모드 ── */}
      {writeMode === "upload" && (
        <div className={cardBase}>
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center shrink-0">
              <DownloadSimple size={13} weight="fill" className="text-indigo-600" />
            </div>
            <span className="text-[12px] font-black text-slate-700">PDF 업로드 (Google Drive)</span>
          </div>

          <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 px-3 py-2 text-[11px] text-slate-600 leading-relaxed">
            이미 작성한 근로계약서 PDF 를 선택 후 [Google Drive 업로드] 를 누르세요. <br />
            · 저장 위치: Google Drive · <b>contract</b> 폴더 <br />
            · 이력: employee_contracts 테이블 · 링크 (Drive URL) 로 저장 <br />
            · 하단 근로자 정보 · 계약 유형 · 기간 · 입력 후 업로드 필수
          </div>

          {/* 근로자 기본 정보 · 업로드 필수 필드 */}
          <div className={cardInner}>
            <div className={cardGroupLabel}>
              <User size={10} weight="bold" />
              근로자 기본 정보 (업로드용)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 relative">
                <label className={fldLabel}>성명 *</label>
                <input
                  type="text"
                  value={form.employeeName}
                  onChange={(e) => {
                    const val = e.target.value;
                    upd("employeeName", val);
                    setEmpSearchOpen(true);
                    if (form.employeeId != null) upd("employeeId", null);
                  }}
                  onFocus={() => setEmpSearchOpen(true)}
                  onBlur={() => setTimeout(() => setEmpSearchOpen(false), 200)}
                  placeholder={empLoading ? "직원 불러오는 중..." : "성명 입력 또는 검색"}
                  autoComplete="off"
                  className={fldInput}
                />
                {empSearchOpen && form.employeeName.trim() && (() => {
                  const q = form.employeeName.trim().toLowerCase();
                  const matches = employees.filter(e => (e.name ?? "").toLowerCase().includes(q)).slice(0, 8);
                  if (matches.length === 0) return null;
                  return (
                    <ul className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto divide-y divide-slate-100">
                      {matches.map(e => (
                        <li key={e.id}>
                          <button
                            type="button"
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => { onSelectEmployee(String(e.id)); setEmpSearchOpen(false); }}
                            className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors flex items-center gap-2"
                          >
                            <span className="text-[13px] font-bold text-slate-800">{e.name}</span>
                            {e.position && <span className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">{e.position}</span>}
                            {e.phone && <span className="text-[11px] text-slate-400 ml-auto tabular-nums">{e.phone}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
              <div>
                <label className={fldLabel}>계약 유형</label>
                <SelectOrCustom value={form.contractType} options={CONTRACT_TYPES} onChange={(v) => upd("contractType", v)} placeholder="예: 프리랜서" />
              </div>
              <div>
                <label className={fldLabel}>시작일</label>
                <input type="date" value={form.startDate} onChange={(e) => upd("startDate", e.target.value)}
                  className={fldInput}
                />
              </div>
              {!form.indefinite && (
                <div className="col-span-2">
                  <label className={fldLabel}>종료일</label>
                  <input type="date" value={form.endDate} onChange={(e) => upd("endDate", e.target.value)}
                    className={fldInput}
                  />
                </div>
              )}
              <label className="col-span-2 inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.indefinite} onChange={(e) => upd("indefinite", e.target.checked)}
                  className="w-4 h-4 rounded accent-indigo-600" />
                <span className="text-[12px] font-semibold text-slate-700">무기한 (정규직) · 종료일 없음</span>
              </label>
            </div>
          </div>

          {/* 파일 선택 */}
          <div className={cardInner}>
            <div className={cardGroupLabel}>PDF 파일 선택</div>
            <input
              ref={uploadInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="w-full text-[12px] text-slate-700 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[12px] file:font-black file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 file:cursor-pointer cursor-pointer"
            />
            {uploadFile && (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                <ClipboardText size={12} weight="fill" className="text-indigo-500 shrink-0" />
                <span className="truncate flex-1 font-semibold">{uploadFile.name}</span>
                <span className="tabular-nums text-[10px] text-slate-400 shrink-0">
                  {(uploadFile.size / 1024).toFixed(1)} KB
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setUploadFile(null);
                    if (uploadInputRef.current) uploadInputRef.current.value = "";
                  }}
                  className="text-rose-500 hover:text-rose-700 shrink-0 cursor-pointer"
                  title="선택 취소"
                >
                  <XIcon size={11} weight="bold" />
                </button>
              </div>
            )}
          </div>

          {/* 업로드 버튼 */}
          <button
            type="button"
            onClick={handleUploadContract}
            disabled={!uploadFile || uploadBusy || !form.employeeName.trim()}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-[13px] font-black shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed ${
              uploadFile && !uploadBusy && form.employeeName.trim()
                ? "bg-gradient-to-r from-indigo-500 to-emerald-500 hover:brightness-110"
                : "bg-slate-300 text-slate-500"
            }`}
            title="Google Drive contract 폴더에 저장 · employee_contracts 이력 insert"
          >
            <DownloadSimple size={13} weight="bold" className="rotate-180" />
            {uploadBusy ? "업로드 중..." : "Google Drive 업로드"}
          </button>
        </div>
      )}

      {/* ── T-R · 여기서 작성 모드 · 기존 폼 전체 ── */}
      {writeMode === "form" && (<>

      {/* ═══════════════════════════════════════════════════
          카드 1 · 근로자 정보 (collapsible · T-W)
      ═══════════════════════════════════════════════════ */}
      <div className={cardBase}>
        {/* 카드 헤더 (클릭 · 접기/펴기) */}
        <button
          type="button"
          onClick={() => toggleCard("employee")}
          className="flex items-center gap-2 pb-2 border-b border-slate-100 cursor-pointer hover:opacity-80 transition-opacity w-full text-left"
          aria-expanded={!isCardCollapsed("employee")}
        >
          <div className="w-6 h-6 rounded-md bg-violet-100 flex items-center justify-center shrink-0">
            <User size={13} weight="fill" className="text-violet-600" />
          </div>
          <span className="text-[12px] font-black text-slate-700">근로자 정보</span>
          <CaretDown size={11} weight="bold" className={`ml-auto text-slate-400 transition-transform ${isCardCollapsed("employee") ? "-rotate-90" : ""}`} />
        </button>

        {!isCardCollapsed("employee") && (<>

        {empError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5 text-[12px] text-rose-700 font-semibold">
            {empError}
          </div>
        )}

        {/* 그룹 A · 기본 식별 */}
        <div className={cardInner}>
          <div className={cardGroupLabel}>
            <User size={10} weight="bold" />
            기본 정보
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* 성명 · 검색 (주민번호와 나란히 · 2026-08-05) */}
            <div className="relative">
              <label className={fldLabel}>성명</label>
              <input
                type="text"
                value={form.employeeName}
                onChange={(e) => {
                  const val = e.target.value;
                  upd("employeeName", val);
                  setEmpSearchOpen(true);
                  if (form.employeeId != null) upd("employeeId", null);
                }}
                onFocus={() => setEmpSearchOpen(true)}
                onBlur={() => setTimeout(() => setEmpSearchOpen(false), 200)}
                placeholder={empLoading ? "직원 불러오는 중..." : "성명 입력 또는 검색"}
                autoComplete="off"
                className={fldInput}
              />
              {empSearchOpen && form.employeeName.trim() && (() => {
                const q = form.employeeName.trim().toLowerCase();
                const matches = employees.filter(e => (e.name ?? "").toLowerCase().includes(q)).slice(0, 8);
                if (matches.length === 0) return (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 text-[12px] text-slate-400 text-center">
                    일치하는 직원 없음 · 직접 입력
                  </div>
                );
                return (
                  <ul className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto divide-y divide-slate-100">
                    {matches.map(e => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => { onSelectEmployee(String(e.id)); setEmpSearchOpen(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors flex items-center gap-2"
                        >
                          <span className="text-[13px] font-bold text-slate-800">{e.name}</span>
                          {e.position && <span className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">{e.position}</span>}
                          {e.phone && <span className="text-[11px] text-slate-400 ml-auto tabular-nums">{e.phone}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>

            {/* 주민번호 */}
            <div>
              <label className={fldLabel}>주민번호</label>
              <input type="text" value={form.employeeBirth} onChange={(e) => upd("employeeBirth", e.target.value)}
                placeholder="970302-2002227"
                className={fldInput}
              />
            </div>

            {/* 직군 + 연차 · 한 줄에 · 반응형 wrap (2026-08-05) */}
            <div className="col-span-2 flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
              {/* 직군 · flex-1 */}
              <div className="flex-1 min-w-0">
                <label className={fldLabel}>직군</label>
                <div className="flex gap-1">
                  {(["약사", "매장", "창고", "기타"] as const).map(cat => {
                    const active = form.employeeCategory === cat;
                    const activeCls =
                      cat === "약사"  ? "bg-violet-500 text-white border-violet-500" :
                      cat === "매장"  ? "bg-emerald-500 text-white border-emerald-500" :
                      cat === "창고"  ? "bg-orange-500 text-white border-orange-500" :
                                        "bg-slate-600 text-white border-slate-600";
                    return (
                      <button key={cat} type="button" onClick={() => upd("employeeCategory", cat)}
                        className={`flex-1 min-w-[36px] py-1.5 rounded-lg border text-[11.5px] font-bold transition-colors cursor-pointer ${
                          active ? activeCls : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                        }`}
                      >{cat}</button>
                    );
                  })}
                </div>
              </div>
              {/* 연차 일수 · 직군 옆 · 좁게 */}
              <div className="shrink-0 sm:w-[110px]">
                <label className={fldLabel}>연차</label>
                <div className="relative">
                  <input type="number" min={0} value={form.annualLeaveDays} onChange={(e) => upd("annualLeaveDays", e.target.value)}
                    placeholder="15"
                    className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-[13px] text-slate-800 font-semibold text-right focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-semibold pointer-events-none">일</span>
                </div>
              </div>
            </div>
          </div>

          {form.employeeCategory === "기타" && (
            <input type="text" value={form.employeeCategoryCustom} onChange={(e) => upd("employeeCategoryCustom", e.target.value)}
              placeholder="직군 명칭 (예: 인턴약사 · 청소 · 배송)"
              className={fldInput}
            />
          )}

          {/* 우선업무 */}
          {(form.employeeCategory === "매장" || form.employeeCategory === "창고") && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-2.5 py-2 flex flex-wrap items-center gap-2">
              <span className="text-[10.5px] font-black text-indigo-700 shrink-0">우선업무</span>
              <div className="flex items-center gap-1">
                {(["매장", "창고"] as const).map(f => {
                  const active = form.primaryFocus === f;
                  const activeCls = f === "매장" ? "bg-emerald-500 text-white border-emerald-600" : "bg-orange-500 text-white border-orange-600";
                  return (
                    <button key={f} type="button" onClick={() => upd("primaryFocus", active ? null : f)}
                      className={`px-2.5 py-1 rounded-md border text-[11.5px] font-bold transition-colors cursor-pointer ${
                        active ? activeCls : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >{f}</button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <input type="number" min={0} max={100} value={form.primaryFocusPercent}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    upd("primaryFocusPercent", Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 70);
                  }}
                  disabled={form.primaryFocus == null}
                  className="w-14 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12px] text-slate-800 font-black text-right focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition disabled:bg-slate-100 disabled:text-slate-400"
                />
                <span className="text-[11px] text-indigo-700 font-bold">%</span>
              </div>
            </div>
          )}
        </div>

        {/* 그룹 B · 연락처 · 금융 통합 */}
        <div className={cardInner}>
          <div className={cardGroupLabel}>연락처 · 금융</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={fldLabel}>전화번호</label>
              <input type="text" value={form.employeePhone} onChange={(e) => upd("employeePhone", e.target.value)}
                placeholder="010-1234-5678"
                className={fldInput}
              />
            </div>
            <div>
              <label className={fldLabel}>이메일</label>
              <input type="text" value={form.employeeEmail} onChange={(e) => upd("employeeEmail", e.target.value)}
                placeholder="email@example.com"
                className={fldInput}
              />
            </div>
            <div className="col-span-2">
              <label className={fldLabel}>주소</label>
              <input type="text" value={form.employeeAddress} onChange={(e) => upd("employeeAddress", e.target.value)}
                placeholder="경기도 오산시 ..."
                className={fldInput}
              />
            </div>
            {/* T-Q (2026-08-05) · 은행 · 계좌번호 · 통장사본 업로드 (분리) */}
            <div className="col-span-2 grid grid-cols-[130px_1fr_auto] gap-2 items-end">
              <div>
                <label className={fldLabel}>은행</label>
                <select
                  value={form.bankName}
                  onChange={(e) => {
                    const v = e.target.value;
                    upd("bankName", v);
                    // 하위호환: employeeBankAccount 도 동기화 (표시용)
                    const acct = form.bankAccountNumber;
                    upd("employeeBankAccount", [v, acct].filter(Boolean).join(" ").trim());
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-[13px] text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition cursor-pointer"
                >
                  <option value="">선택</option>
                  {BANK_LIST.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className={fldLabel}>계좌번호</label>
                <input
                  type="text"
                  value={form.bankAccountNumber}
                  onChange={(e) => {
                    const v = e.target.value;
                    upd("bankAccountNumber", v);
                    // 하위호환 · 결합 표시
                    upd("employeeBankAccount", [form.bankName, v].filter(Boolean).join(" ").trim());
                  }}
                  placeholder="3333-12-3456789"
                  className={fldInput}
                />
              </div>
              <div className="shrink-0">
                <label className={fldLabel}>통장사본</label>
                <label
                  className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border font-black text-[11.5px] transition-colors cursor-pointer ${
                    form.bankbookImageUrl
                      ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                  title={form.bankbookImageUrl ? "다시 업로드하려면 클릭" : "통장사본 이미지 업로드 (jpg/png)"}
                >
                  <DownloadSimple size={12} weight="bold" className="rotate-180" />
                  {form.bankbookImageUrl ? "업로드됨" : "파일 선택"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      // 5MB 제한
                      if (f.size > 5 * 1024 * 1024) {
                        setNotice({ tone: "err", text: `파일 크기 초과 (${(f.size / 1024 / 1024).toFixed(1)}MB > 5MB)` });
                        return;
                      }
                      // base64 로 저장 (별도 업로드 API 없이 폼에 첨부 · Drive 저장은 향후)
                      const reader = new FileReader();
                      reader.onload = () => {
                        const url = String(reader.result || "");
                        upd("bankbookImageUrl", url);
                        setNotice({ tone: "ok", text: `통장사본이 첨부되었습니다 (${(f.size / 1024).toFixed(0)}KB)` });
                      };
                      reader.onerror = () => {
                        setNotice({ tone: "err", text: "통장사본 읽기 실패" });
                      };
                      reader.readAsDataURL(f);
                      // input 리셋 (같은 파일 재선택 허용)
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {form.bankbookImageUrl && (
                <div className="col-span-3 flex items-center gap-2 mt-1">
                  <img
                    src={form.bankbookImageUrl}
                    alt="통장사본"
                    className="h-14 border border-slate-200 rounded-md object-contain bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => upd("bankbookImageUrl", "")}
                    className="text-[11px] font-bold text-rose-500 hover:text-rose-700 cursor-pointer"
                    title="첨부한 통장사본 제거"
                  >
                    ✕ 제거
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </>)}
      </div>
      {/* /카드 1 */}

      {/* ═══════════════════════════════════════════════════
          카드 2 · 근무조건 (T-S 통합 · 계약유형 + 근무요일 + 근무시간 + 휴게)
      ═══════════════════════════════════════════════════ */}
      <div className={cardBase}>
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <button
            type="button"
            onClick={() => toggleCard("workCondition")}
            className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity text-left"
            aria-expanded={!isCardCollapsed("workCondition")}
          >
            <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center shrink-0">
              <ClipboardText size={13} weight="fill" className="text-indigo-600" />
            </div>
            <span className="text-[12px] font-black text-slate-700">근무조건</span>
            <CaretDown size={11} weight="bold" className={`text-slate-400 transition-transform ${isCardCollapsed("workCondition") ? "-rotate-90" : ""}`} />
          </button>
          {monthlyCalc && (
            <span
              className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800"
              title="선택한 근무요일·시간 기준 · 근기법 4.345주"
            >
              <Calculator size={11} weight="fill" className="text-emerald-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">월 근로</span>
              <span className="tabular-nums text-[12px] font-black text-emerald-900">
                {monthlyCalc.monthlyHoursInt}h {monthlyCalc.monthlyMinutesRem}m
              </span>
              <button type="button" onClick={applyMonthlyHoursToBasic}
                className="ml-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9.5px] font-black hover:bg-emerald-700 transition-colors cursor-pointer"
                title="계산된 월 근로시간을 임금표의 기본급 시간에 반영"
              >
                반영
              </button>
            </span>
          )}
        </div>

        {!isCardCollapsed("workCondition") && (<>

        {/* 1행 · 계약 유형 · 근무 요일 */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start">
          {/* 계약 유형 */}
          <div>
            <label className={fldLabel}>계약 유형</label>
            <SelectOrCustom value={form.contractType} options={CONTRACT_TYPES} onChange={(v) => upd("contractType", v)} placeholder="예: 프리랜서" />
            {form.contractType === "계약직" && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10.5px] text-slate-400 font-semibold shrink-0">계약 기간</span>
                <div className="flex-1">
                  <SelectOrCustom value={form.contractMonths} options={["2", "3", "6", "12"]} onChange={(v) => upd("contractMonths", v)} placeholder="예: 9" suffix="개월" />
                </div>
              </div>
            )}
          </div>

          {/* 근무 요일 */}
          <div>
            <label className={fldLabel}>
              근무 요일 <span className="text-indigo-600 font-black">주{weeklyDays}일</span>
              <span className="text-slate-400 font-semibold normal-case tracking-normal ml-1">
                (주중 {weeklyWeekdayDays}일 · 주말 {weeklyWeekendDays}일)
              </span>
            </label>
            <div className="flex flex-wrap gap-1">
              {DAYS.map(d => {
                const on = form.workDays[d];
                const isWeekend = d === "토" || d === "일";
                return (
                  <button key={d} type="button" onClick={() => toggleDay(d)}
                    className={[
                      "w-7 h-7 rounded-md text-[11.5px] font-black transition-colors cursor-pointer border",
                      on
                        ? isWeekend
                          ? "bg-rose-500 text-white border-rose-600 shadow-sm"
                          : "bg-indigo-500 text-white border-indigo-600 shadow-sm"
                        : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300",
                    ].join(" ")}
                  >{d}</button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2행 · 근무시간 + 휴게분 */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[80px]">
            <label className={fldLabel}>
              <ClockClockwise size={10} className="inline mr-0.5 text-emerald-600" />출근
            </label>
            <SelectOrCustom value={form.startTime} options={START_TIMES} onChange={(v) => upd("startTime", v)} placeholder="HH:MM" />
          </div>
          <span className="text-[13px] text-slate-400 font-black pb-2">~</span>
          <div className="flex-1 min-w-[80px]">
            <label className={fldLabel}>퇴근</label>
            <SelectOrCustom value={form.endTime} options={END_TIMES} onChange={(v) => upd("endTime", v)} placeholder="HH:MM" />
          </div>
          <div className="w-20">
            <label className={fldLabel}>
              <Coffee size={10} className="inline mr-0.5" />휴게
            </label>
            <div className="relative">
              <input type="number" min={0} value={form.breakMinutes} onChange={(e) => upd("breakMinutes", e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-2 pr-6 py-1.5 text-[13px] text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition text-right"
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-semibold pointer-events-none">분</span>
            </div>
          </div>
        </div>

        {/* 3행 · 휴게시간대 (드롭다운) · default 12:00~13:00 */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[80px]">
            <label className={fldLabel}>휴게시간대 시작</label>
            <select
              value={form.breakStart}
              onChange={(e) => upd("breakStart", e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition cursor-pointer"
            >
              {BREAK_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <span className="text-[13px] text-slate-400 font-black pb-2">~</span>
          <div className="flex-1 min-w-[80px]">
            <label className={fldLabel}>종료</label>
            <select
              value={form.breakEnd}
              onChange={(e) => upd("breakEnd", e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition cursor-pointer"
            >
              {BREAK_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        </>)}
      </div>
      {/* /카드 2 (통합) */}

      {/* ═══════════════════════════════════════════════════
          카드 3 · 임금 계산 · T-V (2026-08-05) · 카드 순서 재배치 (근무조건 → 임금 → 계약기간)
      ═══════════════════════════════════════════════════ */}
      <div className="rounded-xl border border-emerald-200 bg-white p-3 flex flex-col gap-3 shadow-sm">
        <div className="flex items-center gap-2 pb-2 border-b border-emerald-100">
          <button
            type="button"
            onClick={() => toggleCard("wage")}
            className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity text-left"
            aria-expanded={!isCardCollapsed("wage")}
          >
            <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center shrink-0">
              <Money size={13} weight="fill" className="text-emerald-600" />
            </div>
            <span className="text-[12px] font-black text-slate-700">임금 계산</span>
            <CaretDown size={11} weight="bold" className={`text-slate-400 transition-transform ${isCardCollapsed("wage") ? "-rotate-90" : ""}`} />
          </button>
          <label className="ml-auto inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={form.useWageComponents} onChange={(e) => upd("useWageComponents", e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-600 cursor-pointer" />
            <span className="text-[11px] font-bold text-indigo-700">임금 구성표</span>
          </label>
        </div>

        {!isCardCollapsed("wage") && (<>

        {/* T-W (2026-08-05) · 희망 세후 수령액 → 임금구성 자동 역산 (사용자 요청 3번 복원) */}
        {(() => {
          const wd = Number(form.weekdayHourly) || 0;
          const currentGross = computeWageFromHourlyDual(wd, wd, form.wageComponents).total
            + (form.wageComponents.mealAllowance || 0)
            + (form.wageComponents.vehicleAllowance || 0);
          const currentIns = computeInsurance(currentGross);
          const currentTax = computeIncomeTax(currentGross);
          const currentNet = includeIncomeTax
            ? Math.max(0, currentGross - currentIns.total - currentTax.total)
            : Math.max(0, currentGross - currentIns.total);
          const monthlyHours = form.wageComponents.basicSalary.hours
            + form.wageComponents.basicSalary.minutes / 60;

          const applyTargetNet = () => {
            const targetNet = Number(form.targetNetInput.replace(/[^0-9]/g, "")) || 0;
            if (targetNet <= 0) {
              setNotice({ tone: "err", text: "희망 세후 수령액을 입력하세요." });
              return;
            }
            const gross = reverseGrossFromNet(targetNet);
            const hourly = computeHourlyFromTarget(gross);
            const calc = computeWageFromHourly(hourly, hourly);
            setForm(prev => ({
              ...prev,
              weekdayHourly: String(hourly),
              weekendHourly: String(hourly),
              wageComponents: {
                ...prev.wageComponents,
                basicSalary:      { ...prev.wageComponents.basicSalary,      hours: 209, minutes: 0,  amount: calc.basicAmount },
                fixedOvertime:    { ...prev.wageComponents.fixedOvertime,    hours: 55,  minutes: 56, amount: calc.overtimeAmount },
                fixedHoliday:     { ...prev.wageComponents.fixedHoliday,     hours: 22,  minutes: 0,  amount: calc.holidayAmount },
                fixedAnnualLeave: { ...prev.wageComponents.fixedAnnualLeave, hours: 10,  minutes: 0,  amount: calc.annualLeaveAmount },
              },
            }));
            setNotice({ tone: "ok", text: `역산 완료 · 시급 ${hourly.toLocaleString()}원 · 세전 ${gross.toLocaleString()}원 · 임금구성 8항목에 반영` });
          };

          return (
            <div className="rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50/40 to-emerald-50/40 p-3 flex flex-col gap-2">
              <div className="text-[10.5px] font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                <Calculator size={11} weight="fill" />
                희망 세후 수령액 (역산 입력)
                <span className="ml-auto text-[9.5px] font-semibold text-indigo-400 normal-case">
                  입력 · [반영] · 임금구성표 자동 채움
                </span>
              </div>
              <div className="flex items-stretch gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.targetNetInput}
                    onChange={(e) => upd("targetNetInput", e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="예: 3000000"
                    className="w-full bg-white border border-indigo-200 rounded-lg pl-3 pr-8 py-2 text-[14px] text-slate-800 font-black text-right focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-semibold pointer-events-none">원</span>
                </div>
                <button
                  type="button"
                  onClick={applyTargetNet}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-emerald-500 text-white text-[12px] font-black shadow-sm hover:brightness-110 transition-all cursor-pointer whitespace-nowrap"
                  title="희망세후 → 세전 (÷0.9091) → 시급 (÷296.94) → 임금구성 8항목 채움"
                >
                  반영
                </button>
              </div>
              {/* 4-col 요약 (실시간) */}
              <div className="grid grid-cols-4 gap-1.5 mt-1">
                <div className="rounded-md bg-white border border-slate-200 px-2 py-1.5 flex flex-col gap-0.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">월근로</span>
                  <span className="tabular-nums text-[11.5px] font-black text-slate-800">{monthlyHours.toFixed(1)}h</span>
                </div>
                <div className="rounded-md bg-white border border-slate-200 px-2 py-1.5 flex flex-col gap-0.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">시급</span>
                  <span className="tabular-nums text-[11.5px] font-black text-indigo-700">{fmtWon(wd)}</span>
                </div>
                <div className="rounded-md bg-white border border-slate-200 px-2 py-1.5 flex flex-col gap-0.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">세전</span>
                  <span className="tabular-nums text-[11.5px] font-black text-slate-800">{fmtWon(currentGross)}</span>
                </div>
                <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1.5 flex flex-col gap-0.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600">예상세후</span>
                  <span className="tabular-nums text-[11.5px] font-black text-emerald-800">{fmtWon(currentNet)}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 실수령액 상세 */}
        {(() => {
          const wd = Number(form.weekdayHourly) || 0;
          const we = Number(form.weekendHourly) || 0;
          const gross = computeWageFromHourlyDual(wd, we, form.wageComponents).total
            + (form.wageComponents.mealAllowance || 0)
            + (form.wageComponents.vehicleAllowance || 0);
          const ins = computeInsurance(gross);
          const tax = computeIncomeTax(gross);
          const netFinal = includeIncomeTax
            ? Math.max(0, gross - ins.total - tax.total)
            : Math.max(0, gross - ins.total);
          const row = (label: string, amount: number, opts?: { minus?: boolean; sub?: boolean; hint?: string }) => (
            <div className={`flex items-baseline justify-between gap-2 ${opts?.sub ? "pl-3" : ""}`}>
              <span className={`${opts?.sub ? "text-[10.5px] text-slate-500 font-semibold" : "text-[11.5px] text-slate-700 font-bold"}`}>
                {label}
                {opts?.hint && <span className="ml-1 text-[9.5px] text-slate-400 font-medium">{opts.hint}</span>}
              </span>
              <span className={`tabular-nums ${opts?.sub ? "text-[10.5px] text-slate-600 font-bold" : "text-[12px] text-slate-900 font-black"}`}>
                {opts?.minus ? "−" : ""}{fmtWon(amount)} 원
              </span>
            </div>
          );
          return (
            <details className="rounded-lg border border-slate-200 bg-white px-3 py-2" open={netDetailOpen} onToggle={(e) => setNetDetailOpen((e.currentTarget as HTMLDetailsElement).open)}>
              <summary className="text-[11.5px] font-black text-slate-700 cursor-pointer hover:text-emerald-700 flex items-center gap-1.5 list-none select-none">
                <CaretDown size={11} weight="bold" className={`transition-transform ${netDetailOpen ? "" : "-rotate-90"}`} />
                <Calculator size={12} weight="fill" className="text-emerald-600" />
                실수령액 상세
                <label className="ml-auto inline-flex items-center gap-1.5 cursor-pointer select-none" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={includeIncomeTax}
                    onChange={(e) => setIncludeIncomeTax(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-[10.5px] font-bold text-slate-600">소득세 포함</span>
                </label>
              </summary>
              <div className="mt-2.5 flex flex-col gap-1.5">
                {row("월 세전 총액", gross)}
                <div className="border-t border-slate-100 my-0.5" />
                <div className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider mt-0.5">공제 항목</div>
                {row("국민연금", ins.pension, { minus: true, sub: true, hint: "(4.5%)" })}
                {row("건강보험", ins.health, { minus: true, sub: true, hint: "(3.545%)" })}
                {row("장기요양", ins.ltc, { minus: true, sub: true, hint: "(건보×12.95%)" })}
                {row("고용보험", ins.employment, { minus: true, sub: true, hint: "(0.9%)" })}
                <div className="flex items-baseline justify-between gap-2 pl-3 border-t border-slate-100 pt-1">
                  <span className="text-[10.5px] text-slate-600 font-black">4대보험 합계</span>
                  <span className="tabular-nums text-[11px] text-rose-600 font-black">−{fmtWon(ins.total)} 원</span>
                </div>
                <div className={`mt-0.5 ${includeIncomeTax ? "" : "opacity-50"}`}>
                  {row("소득세", tax.incomeTax, { minus: true, sub: true, hint: "(간이 근사·부양 1인)" })}
                  {row("지방소득세", tax.localTax, { minus: true, sub: true, hint: "(소득세×10%)" })}
                  <div className="flex items-baseline justify-between gap-2 pl-3 border-t border-slate-100 pt-1">
                    <span className="text-[10.5px] text-slate-600 font-black">소득세 합계</span>
                    <span className="tabular-nums text-[11px] text-rose-600 font-black">−{fmtWon(tax.total)} 원</span>
                  </div>
                  {!includeIncomeTax && (
                    <div className="text-[9.5px] text-slate-400 italic pl-3 mt-0.5">
                      참고용 · "소득세 포함" 체크 시 실수령액에 반영
                    </div>
                  )}
                </div>
                <div className="mt-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-black text-emerald-900 flex items-center gap-1.5">
                    <Money size={13} weight="fill" />
                    월 실수령액
                    <span className="text-[9.5px] font-semibold text-emerald-600">
                      ({includeIncomeTax ? "4대보험+소득세" : "4대보험만"})
                    </span>
                  </span>
                  <span className="tabular-nums text-[18px] font-black text-emerald-800">{fmtWon(netFinal)} 원</span>
                </div>
              </div>
            </details>
          );
        })()}

        {/* 시급 조정 · 지급일 통합 */}
        <div className={cardInner}>
          <div className={cardGroupLabel}>시급 조정 · 지급일</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">주중 시급</label>
                <button
                  type="button"
                  onClick={applyDefaultHourly}
                  className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 hover:underline cursor-pointer"
                  title="설정 > 시급 설정 에서 등록한 직급 기본 시급 로드"
                >
                  직급 기본
                </button>
              </div>
              <div className="relative">
                <input type="text" inputMode="numeric" value={form.weekdayHourly}
                  onChange={(e) => upd("weekdayHourly", e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-7 py-2 text-[13px] text-slate-800 font-black focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition text-right"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-semibold pointer-events-none">원</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">주말 시급</label>
              <div className="relative">
                <input type="text" inputMode="numeric" value={form.weekendHourly}
                  onChange={(e) => upd("weekendHourly", e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-7 py-2 text-[13px] text-slate-800 font-black focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition text-right"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-semibold pointer-events-none">원</span>
              </div>
            </div>
          </div>
          <div>
            <label className={fldLabel}>지급일</label>
            <input type="text" value={form.paymentDayText} onChange={(e) => upd("paymentDayText", e.target.value)}
              placeholder="예: 당월 01일 ~ 당월 말일, 당월 말일 지급"
              className={fldInput}
            />
          </div>
        </div>

        {/* 임금 구성표 · T-V (2026-08-05) · 항상 표시 · weekdayHourly 로 수식 계산 */}
        <WageComponentsForm
          wage={form.wageComponents}
          onChange={(next) => upd("wageComponents", next)}
          weekdayHourly={Number(form.weekdayHourly) || 0}
        />

        </>)}
      </div>
      {/* /카드 3 (임금 · T-V 재배치) */}

      {/* ═══════════════════════════════════════════════════
          카드 4 · 계약 기간 · 담당업무 · 4대보험 · 특약 (맨 아래)
      ═══════════════════════════════════════════════════ */}
      <div className={cardBase}>
        <button
          type="button"
          onClick={() => toggleCard("period")}
          className="flex items-center gap-2 pb-2 border-b border-slate-100 cursor-pointer hover:opacity-80 transition-opacity w-full text-left"
          aria-expanded={!isCardCollapsed("period")}
        >
          <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center shrink-0">
            <CalendarBlank size={13} weight="fill" className="text-amber-600" />
          </div>
          <span className="text-[12px] font-black text-slate-700">계약 기간 · 담당업무</span>
          <CaretDown size={11} weight="bold" className={`ml-auto text-slate-400 transition-transform ${isCardCollapsed("period") ? "-rotate-90" : ""}`} />
        </button>

        {!isCardCollapsed("period") && (<>

        {/* 계약 기간 */}
        <div className={cardInner}>
          <div className="flex items-center justify-between mb-0.5">
            <div className={cardGroupLabel}><CalendarBlank size={10} weight="bold" /> 계약 기간</div>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.indefinite} onChange={(e) => upd("indefinite", e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-indigo-600" />
              <span className="text-[11px] font-semibold text-slate-600">무기한</span>
            </label>
          </div>
          <div className={`grid gap-2 ${form.indefinite ? "grid-cols-2" : "grid-cols-3"}`}>
            <div>
              <label className={fldLabel}>근무 시작일</label>
              <input type="date" value={form.startDate} onChange={(e) => upd("startDate", e.target.value)}
                className={fldInput}
              />
            </div>
            <div>
              <label className={fldLabel}>계약 체결일</label>
              <input type="date" value={form.contractSignDate} onChange={(e) => upd("contractSignDate", e.target.value)}
                className={fldInput}
              />
            </div>
            {!form.indefinite && (
              <div>
                <label className={fldLabel}>계약 종료일</label>
                <input type="date" value={form.endDate} onChange={(e) => upd("endDate", e.target.value)}
                  className={fldInput}
                />
              </div>
            )}
          </div>
        </div>

        {/* 담당 업무 · 4대보험 한 그룹 */}
        <div className={cardInner}>
          <div className={cardGroupLabel}>담당업무 · 보험</div>
          <input type="text" value={form.jobDuty} onChange={(e) => upd("jobDuty", e.target.value)}
            placeholder="예: 약국 카운터 · OTC 판매 · 재고 관리"
            className={fldInput}
          />
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.socialInsurance} onChange={(e) => upd("socialInsurance", e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-600" />
            <span className="text-[12px] font-semibold text-slate-700">4대보험 가입</span>
            <span className="text-[10.5px] text-slate-400 font-semibold ml-1">고용·산재·국민연금·건강보험</span>
          </label>
        </div>

        {/* 특약 */}
        <div>
          <label className={fldLabel}>
            <Notepad size={10} weight="fill" className="inline mr-0.5" />추가 특약 (선택)
          </label>
          <textarea value={form.additionalContent} onChange={(e) => upd("additionalContent", e.target.value)} rows={2}
            placeholder="예: 수습기간 3개월 · 명절 상여 별도"
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition resize-y placeholder:text-slate-400 placeholder:font-normal"
          />
        </div>

        </>)}
      </div>
      {/* /카드 4 (계약기간 · 맨 아래) */}

      {/* ═══════════════════════════════════════════════════
          접기 · 임금 산정 비교 (심층)
      ═══════════════════════════════════════════════════ */}
      <details className="rounded-xl border border-slate-200 bg-white shadow-sm px-3 py-2.5">
        <summary className="text-[11.5px] font-black text-slate-600 cursor-pointer hover:text-indigo-700 flex items-center gap-1.5 select-none list-none">
          <CaretDown size={10} weight="bold" />
          임금 산정 비교 · 3가지 모드 계산기
        </summary>
        <div className="flex flex-col gap-2 mt-2">
          <WageCalcModePanel
            form={form}
            weeklyWeekdayDays={weeklyWeekdayDays}
            weeklyWeekendDays={weeklyWeekendDays}
            onApplyToWageComponents={(nextWage) => upd("wageComponents", nextWage)}
            onApplyHourly={(wd, we) => setForm(prev => ({ ...prev, weekdayHourly: String(wd), weekendHourly: String(we) }))}
          />
          {form.useWageComponents && (
            <WageSummaryDualPanel
              form={form}
              weeklyWeekdayDays={weeklyWeekdayDays}
              weeklyWeekendDays={weeklyWeekendDays}
            />
          )}
          {!form.useWageComponents && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-[10.5px] text-slate-500 font-semibold text-center">
              임금 구성표 체크 시 포괄임금 vs 실 근무시간 비교 활성화
            </div>
          )}
        </div>
      </details>

      {/* ═══════════════════════════════════════════════════
          접기 · 사업주 정보 · 이해·동의 · CCTV
      ═══════════════════════════════════════════════════ */}
      <details className="rounded-xl border border-slate-200 bg-white shadow-sm px-3 py-2.5">
        <summary className="text-[11.5px] font-black text-slate-600 cursor-pointer hover:text-indigo-700 flex items-center gap-1.5 select-none list-none">
          <CaretDown size={10} weight="bold" />
          사업주 정보 · 카테고리 이해·동의 · CCTV
        </summary>
        <div className="mt-3 flex flex-col gap-3">

          {/* 사업주 */}
          <div className={cardInner}>
            <div className={cardGroupLabel}>사업주 정보</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={fldLabel}>대표자</label>
                <input type="text" value={form.employerName} onChange={(e) => upd("employerName", e.target.value)}
                  placeholder="강남성"
                  className={fldInput}
                />
              </div>
              <div>
                <label className={fldLabel}>상호</label>
                <input type="text" value={form.companyName} onChange={(e) => upd("companyName", e.target.value)}
                  placeholder="오산 메가타운 약국"
                  className={fldInput}
                />
              </div>
              <div className="col-span-2">
                <label className={fldLabel}>사업장 주소</label>
                <input type="text" value={form.companyAddress} onChange={(e) => upd("companyAddress", e.target.value)}
                  placeholder="경기도 오산시 경기대로 868-4 2층"
                  className={fldInput}
                />
              </div>
              <div className="col-span-2">
                <label className={fldLabel}>사업자등록번호 (선택)</label>
                <input type="text" value={form.companyRegNo} onChange={(e) => upd("companyRegNo", e.target.value)}
                  placeholder="000-00-00000"
                  className={fldInput}
                />
              </div>
            </div>
          </div>

          {/* 이해·동의 */}
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-3 flex flex-col gap-2">
            <div className="text-[10.5px] font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
              카테고리별 이해·동의
              <span className="font-semibold text-[9.5px] text-indigo-400 normal-case">(계약서 미리보기 반영)</span>
            </div>
            {([
              { key: "wage" as const,     label: "임금 조항 이해·동의 (단서 5개 전체)" },
              { key: "workTime" as const, label: "근로시간·휴게 조항 이해·동의" },
              { key: "etc" as const,      label: "기타사항 이해·동의 (5개 항목 전체)" },
            ]).map(({ key, label }) => (
              <label key={key} className="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.clauseAcks[key]}
                  onChange={(e) => upd("clauseAcks", { ...form.clauseAcks, [key]: e.target.checked })}
                  className="w-4 h-4 rounded accent-indigo-600" />
                <span className="text-[12px] font-semibold text-slate-700">{label}</span>
              </label>
            ))}
          </div>

          {/* CCTV/개인정보 */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 flex flex-col gap-2">
            <div className="text-[10.5px] font-black uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
              <Warning size={11} weight="fill" />
              개인정보 · CCTV 동의
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={fldLabel}>수령자 성명</label>
                <input type="text" value={form.privacyConsent.recipientName}
                  onChange={(e) => upd("privacyConsent", { ...form.privacyConsent, recipientName: e.target.value })}
                  placeholder="미입력 시 근로자명"
                  className={fldInput}
                />
              </div>
              <div>
                <label className={fldLabel}>수령자 주소</label>
                <input type="text" value={form.privacyConsent.recipientAddress}
                  onChange={(e) => upd("privacyConsent", { ...form.privacyConsent, recipientAddress: e.target.value })}
                  placeholder="미입력 시 근로자 주소"
                  className={fldInput}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-0.5">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.privacyConsent.agreedCollection}
                  onChange={(e) => upd("privacyConsent", { ...form.privacyConsent, agreedCollection: e.target.checked })}
                  className="w-4 h-4 rounded accent-amber-600 cursor-pointer" />
                <span className="text-[12px] font-semibold text-slate-700">개인정보 수집·이용</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.privacyConsent.agreedCCTV}
                  onChange={(e) => upd("privacyConsent", { ...form.privacyConsent, agreedCCTV: e.target.checked })}
                  className="w-4 h-4 rounded accent-amber-600 cursor-pointer" />
                <span className="text-[12px] font-semibold text-slate-700">CCTV 촬영·이용</span>
              </label>
            </div>
          </div>

        </div>
      </details>

      </>)}
      {/* /T-R · 여기서 작성 모드 */}

    </section>
  );

  // ────────────────────────────────────────────────────────────────
  // 우측 · 프리뷰 (인라인 서명 spot 포함)
  // ────────────────────────────────────────────────────────────────

  const rightPreviewNode = writeMode === "upload" ? (
    <section className="flex flex-col gap-3 h-full overflow-y-auto p-3 bg-slate-100 rounded-xl">
      <div className="flex items-center gap-1.5 pb-1">
        <DownloadSimple size={16} weight="fill" className="text-indigo-600 rotate-180" />
        <h2 className="text-sm font-black text-slate-800">PDF 업로드 안내</h2>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2 text-[12px] text-slate-700 leading-relaxed">
        <div className="text-[13px] font-black text-slate-800">Google Drive · contract 폴더 저장</div>
        <ol className="list-decimal pl-5 space-y-1">
          <li>왼쪽 폼에서 근로자 성명 · 계약 유형 · 기간을 입력합니다.</li>
          <li>PDF 파일 선택 후 [Google Drive 업로드] 클릭.</li>
          <li>저장 후 · employees.contract_file_url 갱신 · 직원관리 [보기] 활성화.</li>
          <li>이력은 employee_contracts 테이블에 저장 (storage="drive").</li>
        </ol>
        <div className="mt-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-[11px] font-semibold text-indigo-700">
          팁 · [여기서 작성] 으로 전환하면 폼 입력 → 미리보기 → PDF 자동생성 방식으로 계약서를 만듭니다.
        </div>
      </div>
    </section>
  ) : (
    <section className="flex flex-col gap-2 h-full overflow-y-auto p-2 bg-slate-100 rounded-xl">
      <div className="flex items-center gap-1.5 pb-1">
        <NotePencil size={16} weight="fill" className="text-emerald-600" />
        <h2 className="text-sm font-black text-slate-800">계약서 미리보기</h2>
        <span className="text-[10.5px] text-slate-400 font-semibold ml-1">(클릭하여 서명 · PDF 그대로 저장)</span>
      </div>

      {/* 서명 진행률 (프리뷰 상단 유지) */}
      <div className={`rounded-lg border px-3 py-1.5 flex items-center gap-2 ${
        canApprove ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"
      }`}>
        <div className="flex items-center gap-1.5 shrink-0">
          {canApprove ? <Check size={13} weight="bold" className="text-emerald-600" /> : <Signature size={13} weight="fill" className="text-slate-500" />}
          <span className={`text-[11.5px] font-black ${canApprove ? "text-emerald-700" : "text-slate-700"}`}>
            서명 {signatureStatus.filled} / {signatureStatus.total}
          </span>
        </div>
        <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div className={`h-full transition-all ${canApprove ? "bg-emerald-500" : "bg-indigo-400"}`}
            style={{ width: `${Math.round((signatureStatus.filled / signatureStatus.total) * 100)}%` }}
          />
        </div>
        <button type="button" onClick={clearAllSignatures}
          className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 text-[10.5px] font-bold transition-colors cursor-pointer"
          title="모든 서명 지우기"
        >
          <Eraser size={11} /> 전체
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-2 sm:p-3">
        <ContractPreview
          ref={previewRef}
          form={form}
          signUrls={signUrls}
          employerStampUrl={employerStampUrl}
          employeeStampUrl={employeeStampUrl}
          onOpenSign={openSign}
          onClearSign={clearSign}
        />
      </div>

      {/* 완료 버튼 (하단 유지 · 서명 pad 섹션 제거) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="flex-1 flex flex-col gap-1">
          <button type="button" onClick={handleApproveAndSave} disabled={generating || !canApprove}
            className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-white text-[14px] font-black shadow-md transition-all cursor-pointer disabled:cursor-not-allowed
              ${canApprove && !generating
                ? "bg-gradient-to-r from-rose-500 via-fuchsia-500 to-emerald-500 hover:brightness-110 hover:shadow-lg"
                : "bg-slate-300 text-slate-500"}`}
            title={canApprove ? "계약 승인 · DB 저장 + PDF 다운" : `${signatureStatus.total} 지점 서명을 모두 채워야 활성화됩니다`}
          >
            <Check size={15} weight="bold" />
            <span>{generating ? "저장 중..." : "계약완료 승인 (DB 저장)"}</span>
          </button>
          {!canApprove && (
            <span className="text-[10.5px] text-slate-500 font-semibold text-center sm:text-left">
              프리뷰 안의 서명 spot 을 클릭하여 {signatureStatus.total} 지점 서명 후 승인 활성화
            </span>
          )}
        </div>
        <button type="button" onClick={saveDraft}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[11.5px] font-black shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          title="현재 작성 내용을 브라우저에 저장"
        >
          임시저장
          {draftSavedAt && (
            <span className="text-[10px] font-normal text-emerald-600 ml-1">
              · {new Date(draftSavedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </button>
        <button type="button" onClick={handleComplete} disabled={generating}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-[12px] font-bold shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          title="PDF 로컬 다운로드"
        >
          <DownloadSimple size={13} weight="bold" />
          <span>{generating ? "생성 중..." : "PDF"}</span>
        </button>
      </div>
    </section>
  );

  // ────────────────────────────────────────────────────────────────
  // 렌더 · SplitPanel 감싸기 (E)
  // ────────────────────────────────────────────────────────────────

  return (
    <div className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-slate-50 flex flex-col"}>
      {!embedded && (
        <AppNavHeader
          activePage={"business-manage" as AppNavPage}
          authSession={authSession}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      )}

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-3 sm:px-5 py-4 flex flex-col gap-3 min-h-0">
        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <NotePencil size={20} weight="fill" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-800 leading-none">근로계약서 작성</h1>
              <p className="text-xs text-slate-500 mt-1">좌측 폼 · 우측 이미지 재현 · 프리뷰 내 서명 spot 클릭하여 서명 입력</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {existingContract && existingContract.end_date && (
              <button type="button"
                onClick={() => {
                  const prevMonths = contractPeriodMonthsClient(existingContract.start_date, existingContract.end_date);
                  setExtendMonths(prevMonths != null && prevMonths > 0 ? String(prevMonths) : "3");
                  setExtendModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-sm font-bold transition-colors cursor-pointer shadow-sm"
                title={`기존 계약 (${existingContract.start_date ?? "-"} ~ ${existingContract.end_date}) 연장`}
              >
                <ClockCounterClockwise size={14} weight="fill" />
                <span>연장</span>
              </button>
            )}
            {/* T-N (2026-08-05) · 초기화 버튼 · outline 세련화 · rose hover · confirm dialog */}
            <button type="button" onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 text-sm font-semibold transition-colors cursor-pointer shadow-sm"
              title="입력 내용·서명·임시저장 · 전체 초기화"
            >
              <Eraser size={14} weight="bold" />
              <span className="hidden sm:inline">초기화</span>
            </button>
          </div>
        </div>

        {existingContract && form.employeeId != null && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-[12px] text-indigo-800 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 font-black">
              <ClockCounterClockwise size={13} weight="fill" />
              기존 계약서
            </span>
            <span>
              기간 <b className="font-black">{existingContract.start_date ?? "-"}</b> ~ <b className="font-black">{existingContract.end_date ?? "-"}</b>
            </span>
            {existingContract.contract_type && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white/70 border border-indigo-200 px-1.5 py-0.5 text-[11px] font-bold">
                {existingContract.contract_type}
              </span>
            )}
            {hireDateReference && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white/70 border border-indigo-200 px-1.5 py-0.5 text-[11px] font-bold">
                입사일 {hireDateReference} · 유지
              </span>
            )}
            {existingContract.pdf_url && (
              <a href={existingContract.pdf_url} target="_blank" rel="noopener noreferrer"
                className="ml-auto underline text-[11px] font-bold text-indigo-700 hover:text-indigo-900"
              >
                기존 계약서 PDF 보기
              </a>
            )}
          </div>
        )}
        {existingLoading && form.employeeId != null && !existingContract && (
          <div className="text-[11px] text-slate-400">기존 계약 이력 조회 중...</div>
        )}

        {notice && (
          <div className={`rounded-lg border px-3 py-2 text-sm font-semibold flex items-center gap-2 ${
            notice.tone === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"
          }`}>
            {notice.tone === "ok" ? <Check size={14} weight="bold" /> : <Warning size={14} weight="fill" />}
            {notice.text}
          </div>
        )}

        {/* ─── E. SplitPanel · 좌우 폭 조정 ─── */}
        <SplitPanel
          storageKey="contract-writer.leftWidth"
          defaultWidth={460}
          minWidth={340}
          maxWidth={760}
          dividerColor="emerald"
          mobileRightAsModal={false}
          wrapLeft={false}
          wrapRight={false}
          style={{ minHeight: "70vh" }}
          left={leftFormNode}
          right={rightPreviewNode}
        />
      </main>

      <ExtendContractModal
        open={extendModalOpen}
        onClose={() => setExtendModalOpen(false)}
        onConfirm={handleExtendConfirm}
        months={extendMonths}
        setMonths={setExtendMonths}
        existingEnd={existingContract?.end_date ?? null}
        hireDateReference={hireDateReference}
      />

      {/* 서명 모달 (G · 인라인 클릭 시 팝업) */}
      <SignatureModal
        open={signModal.open}
        title={signModal.key ? SIGN_LABEL[signModal.key] : ""}
        onClose={closeSign}
        onSubmit={submitSign}
      />
    </div>
  );
};

export default ContractWriterPage;
