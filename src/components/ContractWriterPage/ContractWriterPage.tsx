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
  Coffee, Notepad, Eraser, DownloadSimple, ArrowsClockwise, Warning, Check,
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
type SignKey =
  | "employer"        // 사업주 (갑) · 하단
  | "employee"        // 근로자 (을) · 하단
  | "privacy"         // 개인정보/CCTV
  | "specialWork"     // 소정근로시간 특별 사용 동의
  | "breakChange"     // 휴게시간 변경 동의
  | "wageClause3"     // 임금단서 3번 (연차 포괄)
  | "wageClause4"     // 임금단서 4번 (공휴일 포괄)
  | "etc5"            // 기타사항 5번 (퇴직 시 연차 공제)
  | "receipt"         // 수령자 확인 (계약서 교부)
  ;

const SIGN_KEYS: SignKey[] = [
  "employer", "employee", "privacy",
  "specialWork", "breakChange",
  "wageClause3", "wageClause4",
  "etc5", "receipt",
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
};

interface ContractForm {
  // 근로자
  employeeId: number | null;
  employeeName: string;
  employeePhone: string;
  employeeAddress: string;
  employeeBirth: string;
  employeeBankAccount: string;
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

// 회사 기본값 (오산 메가타운 약국)
const DEFAULT_EMPLOYER: Partial<ContractForm> = {
  employerName: "강남성",
  companyName: "오산 메가타운 약국",
  companyAddress: "경기도 오산시 경기대로 868-4 2층",
  companyRegNo: "",
};

// 시간 상수 (포괄임금 산정 · 스펙)
const WAGE_HOURS = {
  BASIC: 209,        // 기본급 (주40 + 주휴 8) × 4.345
  OVERTIME: 55.94,   // 연장 (월평균)
  HOLIDAY: 22.00,    // 휴일 (월평균)
  ANNUAL_LEAVE: 10.00, // 연차 (월평균)
} as const;

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
 * 시급 → 포괄임금 4항목 (기본급/연장/휴일/연차) · 각 금액 산출
 *   기본급 = BASIC × 주중시급
 *   연장   = OVERTIME × 주중시급 × 1.5
 *   휴일   = HOLIDAY × 주말시급 × 1.5
 *   연차   = ANNUAL_LEAVE × 주중시급
 */
function computeWageFromHourly(weekdayHourly: number, weekendHourly: number): {
  basicAmount: number;
  overtimeAmount: number;
  holidayAmount: number;
  annualLeaveAmount: number;
  total: number;
} {
  const wd = Math.max(0, weekdayHourly);
  const we = Math.max(0, weekendHourly);
  const basicAmount = Math.round(WAGE_HOURS.BASIC * wd);
  const overtimeAmount = Math.round(WAGE_HOURS.OVERTIME * wd * 1.5);
  const holidayAmount = Math.round(WAGE_HOURS.HOLIDAY * we * 1.5);
  const annualLeaveAmount = Math.round(WAGE_HOURS.ANNUAL_LEAVE * wd);
  return {
    basicAmount, overtimeAmount, holidayAmount, annualLeaveAmount,
    total: basicAmount + overtimeAmount + holidayAmount + annualLeaveAmount,
  };
}

/**
 * 목표 월급 → 필요 주중 시급 (주말 시급도 동일하다고 가정)
 *   총액 ≈ 시급 × (BASIC + OVERTIME×1.5 + HOLIDAY×1.5 + ANNUAL_LEAVE)
 *        = 시급 × (209 + 83.91 + 33 + 10)
 *        = 시급 × 335.91
 *   * 주말 시급 == 주중 시급 (단순 역산)
 */
function computeHourlyFromTarget(targetTotal: number): number {
  const divisor = WAGE_HOURS.BASIC + WAGE_HOURS.OVERTIME * 1.5 + WAGE_HOURS.HOLIDAY * 1.5 + WAGE_HOURS.ANNUAL_LEAVE;
  if (divisor <= 0) return 0;
  return Math.round(Math.max(0, targetTotal) / divisor);
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
  employeeEmail: "",
  contractType: "정규직",
  contractMonths: "2",
  workDays: { "월": true, "화": true, "수": true, "목": true, "금": true, "토": false, "일": false },
  startTime: "10:00",
  endTime: "19:00",
  breakMinutes: "60",
  weekdayHourly: "12000",
  weekendHourly: "13500",
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

// 세로 라벨 (좌측 세로 텍스트)
const VerticalLabel: React.FC<{ children: string; minH?: number }> = ({ children, minH = 60 }) => (
  <div
    className="flex items-center justify-center bg-slate-100 border-r border-slate-400 text-slate-800 font-black text-[13px] tracking-widest select-none"
    style={{
      writingMode: "vertical-rl",
      minHeight: minH,
      width: 28,
      letterSpacing: "0.25em",
    }}
  >
    {children}
  </div>
);

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
}

const WageComponentsForm: React.FC<WageComponentsFormProps> = ({ wage, onChange }) => {
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

  const rows: Array<{
    key: keyof Pick<WageComponents, "basicSalary" | "fixedOvertime" | "fixedHoliday" | "fixedHolidayOvertime" | "fixedNight" | "fixedAnnualLeave">;
    label: string;
    note: string;
  }> = [
    { key: "basicSalary",          label: "기본급",             note: "주휴 포함" },
    { key: "fixedOvertime",        label: "(고정)연장",         note: "1.5배" },
    { key: "fixedHoliday",         label: "(고정)휴일",         note: "1.5배" },
    { key: "fixedHolidayOvertime", label: "(고정)휴일연장",     note: "0.5배" },
    { key: "fixedNight",           label: "(고정)야간",         note: "0.5배" },
    { key: "fixedAnnualLeave",     label: "(고정)연차",         note: "" },
  ];

  const total = computeWageTotal(wage);

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-2 flex flex-col gap-1">
      <div className="text-[11px] font-black text-indigo-800 flex items-center gap-1">
        <Money size={11} weight="fill" />
        임금 구성표 (표 형식)
      </div>

      {/* 헤더 */}
      <div className="grid grid-cols-[1fr,72px,1fr] gap-1 text-[10px] font-black text-slate-500 uppercase pl-1">
        <div>항목</div>
        <div className="text-center">시간</div>
        <div className="text-right pr-1">금액 (원)</div>
      </div>

      {rows.map(r => (
        <div key={r.key} className="grid grid-cols-[1fr,72px,1fr] gap-1 items-center">
          <div className="text-[11px] font-bold text-slate-700 leading-tight">
            {r.label}
            {r.note && <span className="text-[9px] text-slate-500 font-semibold ml-1">({r.note})</span>}
          </div>
          <div className="flex items-center gap-0.5">
            <input
              type="number"
              min={0}
              value={wage[r.key].hours}
              onChange={(e) => updEntry(r.key, "hours", Number(e.target.value) || 0)}
              className="w-8 bg-white border border-slate-200 rounded px-1 py-0.5 text-[11px] text-slate-800 font-semibold text-right focus:outline-none focus:border-indigo-500 transition"
              placeholder="0"
            />
            <span className="text-[9px] text-slate-500 font-semibold">h</span>
            <input
              type="number"
              min={0}
              max={59}
              value={wage[r.key].minutes}
              onChange={(e) => updEntry(r.key, "minutes", Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
              className="w-7 bg-white border border-slate-200 rounded px-1 py-0.5 text-[11px] text-slate-800 font-semibold text-right focus:outline-none focus:border-indigo-500 transition"
              placeholder="0"
            />
            <span className="text-[9px] text-slate-500 font-semibold">m</span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            value={String(wage[r.key].amount)}
            onChange={(e) => updEntry(r.key, "amount", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
            className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-slate-800 font-black text-right focus:outline-none focus:border-indigo-500 transition"
            placeholder="0"
          />
        </div>
      ))}

      {/* 옵션 항목 · 식대·차량 */}
      <details className="mt-1">
        <summary className="text-[10px] font-bold text-slate-500 cursor-pointer hover:text-indigo-700 flex items-center gap-1">
          <CaretDown size={9} weight="bold" /> 옵션 (식대·차량유지비)
        </summary>
        <div className="mt-1 flex flex-col gap-1">
          <div className="grid grid-cols-[1fr,72px,1fr] gap-1 items-center">
            <div className="text-[11px] font-bold text-slate-700">식대 <span className="text-[9px] text-slate-500 font-semibold">(비과세)</span></div>
            <div className="text-[9px] text-slate-500 text-center">해당자</div>
            <input
              type="text"
              inputMode="numeric"
              value={String(wage.mealAllowance)}
              onChange={(e) => updFlat("mealAllowance", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
              className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-slate-800 font-black text-right focus:outline-none focus:border-indigo-500 transition"
              placeholder="0"
            />
          </div>
          <div className="grid grid-cols-[1fr,72px,1fr] gap-1 items-center">
            <div className="text-[11px] font-bold text-slate-700">차량유지비 <span className="text-[9px] text-slate-500 font-semibold">(비과세)</span></div>
            <div className="text-[9px] text-slate-500 text-center">해당자</div>
            <input
              type="text"
              inputMode="numeric"
              value={String(wage.vehicleAllowance)}
              onChange={(e) => updFlat("vehicleAllowance", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
              className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-slate-800 font-black text-right focus:outline-none focus:border-indigo-500 transition"
              placeholder="0"
            />
          </div>
        </div>
      </details>

      <div className="mt-1 pt-1 border-t border-indigo-200 flex items-center justify-between text-[12px]">
        <span className="text-emerald-800 font-black">월급여총액 (세전)</span>
        <span className="text-emerald-800 font-black tabular-nums">{fmtWon(total)} 원</span>
      </div>
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

  // Mode 1: forward (시급 → 포괄임금 산정)
  const forwardCalc = useMemo(() => {
    const wd = Number(form.weekdayHourly) || 0;
    const we = Number(form.weekendHourly) || 0;
    return computeWageFromHourly(wd, we);
  }, [form.weekdayHourly, form.weekendHourly]);

  // Mode 2: target (목표 월급 → 시급 역산)
  const targetHourly = useMemo(() => computeHourlyFromTarget(Number(targetTotal) || 0), [targetTotal]);

  // Mode 3: actual (실 근무시간 기반)
  const actualCalc = useMemo(() => computeActualPay(
    form.startTime, form.endTime, Number(form.breakMinutes) || 0,
    weeklyWeekdayDays, weeklyWeekendDays,
    Number(form.weekdayHourly) || 0, Number(form.weekendHourly) || 0,
  ), [form.startTime, form.endTime, form.breakMinutes, weeklyWeekdayDays, weeklyWeekendDays, form.weekdayHourly, form.weekendHourly]);

  const applyForwardToWage = () => {
    const c = forwardCalc;
    onApplyToWageComponents({
      ...form.wageComponents,
      basicSalary:      { ...form.wageComponents.basicSalary,      hours: WAGE_HOURS.BASIC, minutes: 0, amount: c.basicAmount },
      fixedOvertime:    { ...form.wageComponents.fixedOvertime,    hours: Math.floor(WAGE_HOURS.OVERTIME), minutes: Math.round((WAGE_HOURS.OVERTIME % 1) * 60), amount: c.overtimeAmount },
      fixedHoliday:     { ...form.wageComponents.fixedHoliday,     hours: WAGE_HOURS.HOLIDAY, minutes: 0, amount: c.holidayAmount },
      fixedAnnualLeave: { ...form.wageComponents.fixedAnnualLeave, hours: WAGE_HOURS.ANNUAL_LEAVE, minutes: 0, amount: c.annualLeaveAmount },
    });
  };

  const applyTargetToHourly = () => {
    onApplyHourly(targetHourly, targetHourly);
  };

  const applyActualToBasic = () => {
    if (!actualCalc) return;
    // 실 근무 총액을 기본급으로 (약사 실무 스타일)
    onApplyToWageComponents({
      ...form.wageComponents,
      basicSalary: {
        ...form.wageComponents.basicSalary,
        hours: Math.floor(actualCalc.weekdayMonthlyHours + actualCalc.weekendMonthlyHours),
        minutes: Math.round(((actualCalc.weekdayMonthlyHours + actualCalc.weekendMonthlyHours) % 1) * 60),
        amount: actualCalc.total,
      },
    });
  };

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
              (÷{(WAGE_HOURS.BASIC + WAGE_HOURS.OVERTIME * 1.5 + WAGE_HOURS.HOLIDAY * 1.5 + WAGE_HOURS.ANNUAL_LEAVE).toFixed(2)})
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
            <button
              type="button"
              onClick={applyActualToBasic}
              className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 text-white text-[10.5px] font-black hover:bg-emerald-700 transition-colors cursor-pointer"
            >
              기본급에 반영
            </button>
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

  // 휴게 시작~종료 (관례상 정오 12:00~13:00 · 8시간+휴게 케이스)
  const breakDisplay = (() => {
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

  return (
    <div
      ref={ref}
      className="bg-white text-slate-900 border border-slate-300 rounded-sm shadow-sm p-4 sm:p-6 mx-auto"
      style={{
        width: "100%",
        maxWidth: "820px",
        fontFamily: "'Noto Sans KR', 'Malgun Gothic', system-ui, -apple-system, 'Segoe UI', sans-serif",
        lineHeight: 1.55,
        color: "#0f172a",
      }}
    >
      {/* 상단 · 제목 + 근로자명 · 우측 상단 */}
      <div className="flex items-center justify-center border-b-2 border-slate-800 pb-2 mb-3 relative">
        <h2 className="text-[22px] font-black tracking-[0.3em] text-slate-900 text-center">
          근 로 계 약 서
        </h2>
        <div className="absolute right-0 top-0 bottom-0 flex items-center text-[15px] font-black text-slate-800">
          ( <span className="mx-1 min-w-[60px] text-center border-b border-slate-500 px-2">{form.employeeName || " "}</span> )
        </div>
      </div>

      {/* 서두 */}
      <p className="text-[12px] text-slate-800 mb-3 leading-relaxed">
        사용자(이하 '갑'이라 함)와 근로자(이하 '을'이라 함)는 다음과 같이 근로계약을 체결하고 신의에 따라 이를 성실히 이행할 것을 약정한다.
      </p>

      {/* ── 표 1 ── */}
      <table className="w-full border-collapse border-2 border-slate-800 text-[12px]">
        <tbody>
          {/* 근무장소 · 담당업무 */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0 w-[32px]">
              <VerticalLabel minH={54}>근무장소</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <div>
                <b className="font-bold">코스트팜(Costpharm) 社內 및 관계 현장</b>
              </div>
              <div className="text-[11px] text-slate-700 mt-0.5">
                담당업무: <b className="text-slate-900">{form.jobDuty || "-"}</b>
              </div>
              <div className="text-[10.5px] text-slate-600 mt-1">
                단, '갑'의 사정에 따라 근무 장소와 담당 업무를 변경할 수 있으며 '을'은 정당한 사유 없이 이를 거부할 수 없다.
              </div>
            </td>
          </tr>

          {/* 근로계약기간 (근로계약기간 우측 서명 제거) */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={80}>근로계약기간</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <div className="flex items-center gap-2 mb-1">
                <SpanBox checked={form.indefinite} />
                <span className="font-bold">기간의 정함이 없음.</span>
                <span className="text-[11px] text-slate-600">(근로개시일: <b>{fmtKoreanDate(form.startDate) || "-"}</b>)</span>
              </div>
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
              {!form.indefinite && (
                <div className="text-[10.5px] text-slate-600 mt-1">
                  계약기간 만료일에 별도의 통보 없이 근로계약은 자동 해지되는 것으로 한다.
                </div>
              )}
            </td>
          </tr>

          {/* 임금 */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={340}>임금</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
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

              {/* 임금 단서 조항 5개 · 3·4번 옆 서명 */}
              <ol className="mt-2 space-y-1 text-[11px] text-slate-700 leading-snug list-decimal list-inside pl-1">
                {WAGE_CLAUSES.map((clause, i) => {
                  const isThird = i === 2;
                  const isFourth = i === 3;
                  return (
                    <li key={i}>
                      <span className="align-middle">{clause}</span>
                      {isThird && (
                        <span className="ml-1">
                          <InlineSignSpot
                            signKey="wageClause3"
                            signUrl={signUrls.wageClause3}
                            onOpen={onOpenSign}
                            onClear={onClearSign}
                            width={110}
                            height={28}
                            placeholder="(연차 포괄 서명)"
                          />
                        </span>
                      )}
                      {isFourth && (
                        <span className="ml-1">
                          <InlineSignSpot
                            signKey="wageClause4"
                            signUrl={signUrls.wageClause4}
                            onOpen={onOpenSign}
                            onClear={onClearSign}
                            width={110}
                            height={28}
                            placeholder="(공휴일 포괄 서명)"
                          />
                        </span>
                      )}
                    </li>
                  );
                })}
                <li className="text-slate-600 list-none pl-0 mt-1 text-[10.5px]">
                  <b>별도:</b> {WAGE_CLAUSE_EXTRA}
                </li>
              </ol>

              {/* 임금 지급일 */}
              <div className="mt-2 rounded-sm bg-amber-50/60 border border-amber-300 px-2 py-1 text-[11.5px]">
                <b>2. 임금지급일:</b> {form.paymentDayText}
              </div>
            </td>
          </tr>

          {/* 근로일 · 근로시간 */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={220}>근로일 근로시간</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <div className="text-[11.5px] font-bold mb-1">
                1. 기본 근로일: <b className="text-slate-900">{workDayText}</b>
              </div>
              <div className="text-[10.5px] text-slate-600 mb-2 leading-snug">
                ※ 소정근로일은 주40시간제 내에서 당사자가 정하는 근로일을 의미하며, 무급 휴무일인 토요일에 근로할 경우 연장근로로 보고, 주휴일인 일요일에 근로할 경우 휴일근로로 본다.
              </div>

              <div className="text-[11.5px] font-bold mb-1">2. 기본 근로시간:</div>
              <table className="w-full border-collapse border border-slate-500 text-[11.5px] mb-1">
                <thead>
                  <tr className="bg-slate-100 font-black">
                    <th className="border border-slate-400 px-2 py-1 text-center w-[35%]">구분</th>
                    <th className="border border-slate-400 px-2 py-1 text-center w-[35%]">기본 근로시간</th>
                    <th className="border border-slate-400 px-2 py-1 text-center w-[30%]">휴게시간(무급)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-slate-400 px-2 py-1 text-center font-bold">{workDayText}</td>
                    <td className="border border-slate-400 px-2 py-1 text-center tabular-nums">
                      {form.startTime || "--:--"} ~ {form.endTime || "--:--"}
                    </td>
                    <td className="border border-slate-400 px-2 py-1 text-center tabular-nums">
                      {breakDisplay ?? "-"}
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        ({form.breakMinutes || 0}분)
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 소정근로시간 안내 + 서명 */}
              <div className="mt-2 rounded-sm border border-amber-300 bg-amber-50/50 px-2 py-1.5">
                <div className="text-[11px] text-slate-800 leading-snug">
                  ※ 소정근로시간은 휴게시간을 제외한 일단위 법정근로시간(8시간) 내에서 당사자가 정하는 시간이며, '을'은 '갑'의 사정에 따라 필요 시 상기 근로시간 이외에 추가로 연장, 야간, 휴일근로를 수행할 수 있으며 자유로운 의사로 동의한다.
                </div>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <span className="text-[11px] font-bold text-slate-800">{form.employeeName || "(근로자)"}</span>
                  <InlineSignSpot
                    signKey="specialWork"
                    signUrl={signUrls.specialWork}
                    onOpen={onOpenSign}
                    onClear={onClearSign}
                    width={130}
                    height={30}
                    placeholder="(특별근로 서명)"
                  />
                </div>
              </div>

              {/* 휴게시간 변경 동의 + 서명 */}
              <div className="mt-2 rounded-sm border border-amber-300 bg-amber-50/50 px-2 py-1.5">
                <div className="text-[11px] text-slate-800 leading-snug">
                  ※ 업무형편상 부득이한 경우 상기 휴게 시간을 변경할 수 있고, 제대로 사용하지 못한 휴게시간은 다른 시간 내에서 보충 사용하는 것에 동의한다.
                </div>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <span className="text-[11px] font-bold text-slate-800">{form.employeeName || "(근로자)"}</span>
                  <InlineSignSpot
                    signKey="breakChange"
                    signUrl={signUrls.breakChange}
                    onOpen={onOpenSign}
                    onClear={onClearSign}
                    width={130}
                    height={30}
                    placeholder="(휴게변경 서명)"
                  />
                </div>
              </div>
            </td>
          </tr>

          {/* 퇴직금 (서명 제거) */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={40}>퇴직금</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <div className="text-[11.5px]">
                퇴직급여보장법에 따라 퇴직연금제도, 퇴직제도를 설정 및 운영해 법정기준으로 지급한다.
              </div>
            </td>
          </tr>

          {/* 연차유급휴가 */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={44}>연차휴가</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <div className="text-[11.5px]">
                연차유급휴가는 근로기준법에 따른다. 다만, 근로기준법 제62조에 따라 근로자대표와의 서면합의로 연차유급휴가를 갈음하여 특정 근로일에 휴무시킬 수 있다. (상시 근로자 수가 5인 미만인 경우에는 적용을 제외한다.)
                기본 부여 연차: <b>연 {form.annualLeaveDays || "15"}일</b>
              </div>
            </td>
          </tr>

          {/* 휴일 및 휴무 (4조항) */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={140}>휴일 휴무</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] text-slate-800 pl-1">
                {HOLIDAY_CLAUSES.map((c, i) => <li key={i} className="leading-snug">{c}</li>)}
              </ol>
            </td>
          </tr>

          {/* 정계 및 근로계약 해지 사유 (13개) */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={260}>정계 해지 사유</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <div className="text-[11px] font-bold text-slate-800 mb-1">
                다음 각 호의 어느 하나에 해당하는 경우 사업주는 근로자를 징계 또는 근로계약 해지할 수 있다.
              </div>
              <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] text-slate-800 pl-1">
                {DISCIPLINE_REASONS.map((r, i) => (
                  <li key={i} className="leading-snug">{r}</li>
                ))}
              </ol>
            </td>
          </tr>

          {/* 기타사항 5항목 · 5번 옆 서명 */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={140}>기타사항</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] text-slate-800 pl-1">
                {ETC_ITEMS.map((r, i) => {
                  const isFive = i === 4;
                  return (
                    <li key={i} className="leading-snug">
                      <span className="align-middle">{r}</span>
                      {isFive && (
                        <span className="ml-1">
                          <InlineSignSpot
                            signKey="etc5"
                            signUrl={signUrls.etc5}
                            onOpen={onOpenSign}
                            onClear={onClearSign}
                            width={110}
                            height={28}
                            placeholder="(연차 공제 서명)"
                          />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              {form.additionalContent.trim() && (
                <div className="mt-2 rounded-sm border border-slate-300 bg-slate-50/70 px-2 py-1">
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
            </td>
          </tr>
        </tbody>
      </table>

      {/* 본 계약서 교부 확인 · 수령자 서명 (인라인) */}
      <div className="mt-3 border border-slate-500 rounded-sm px-3 py-2 text-[11.5px] flex flex-wrap items-center gap-2">
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
      <div className="mt-3 flex items-center justify-center gap-3 text-[18px] font-black tracking-widest text-slate-900">
        <span className="tabular-nums">{csY || "20__"}</span>
        <span>년</span>
        <span className="tabular-nums">{typeof csM === "number" ? csM : "__"}</span>
        <span>월</span>
        <span className="tabular-nums">{typeof csD === "number" ? csD : "__"}</span>
        <span>일</span>
      </div>

      {/* 사업주 (갑) · 근로자 (을) · 하단 */}
      <table className="w-full border-collapse border-2 border-slate-800 text-[11.5px] mt-3">
        <tbody>
          {/* 사업주 (갑) */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0 w-[32px]">
              <VerticalLabel minH={72}>사용자 갑</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-2 py-1.5 align-top">
              <div className="grid grid-cols-[70px,1fr,70px,1fr,90px] gap-1 items-center">
                <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">상호</div>
                <div className="border-b border-slate-400 px-2 py-0.5 font-semibold">{form.companyName || "-"}</div>
                <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">대표</div>
                <div className="border-b border-slate-400 px-2 py-0.5 font-semibold">{form.employerName || "-"}</div>
                <div className="relative flex items-center justify-center h-[46px]">
                  <InlineSignSpot
                    signKey="employer"
                    signUrl={signUrls.employer}
                    stampUrl={employerStampUrl}
                    onOpen={onOpenSign}
                    onClear={onClearSign}
                    width={84}
                    height={44}
                    placeholder="(도장)"
                  />
                </div>
              </div>
              <div className="grid grid-cols-[70px,1fr] gap-1 items-center mt-1">
                <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">주소</div>
                <div className="border-b border-slate-400 px-2 py-0.5 font-semibold">{form.companyAddress || "-"}</div>
              </div>
              {form.companyRegNo && (
                <div className="grid grid-cols-[110px,1fr] gap-1 items-center mt-1">
                  <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">사업자등록번호</div>
                  <div className="border-b border-slate-400 px-2 py-0.5 font-semibold">{form.companyRegNo}</div>
                </div>
              )}
            </td>
          </tr>
          {/* 근로자 (을) */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={130}>근로자 을</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-2 py-1.5 align-top">
              <div className="grid grid-cols-[70px,1fr,70px,1fr,90px] gap-1 items-center">
                <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">주민번호</div>
                <div className="border-b border-slate-400 px-2 py-0.5 font-semibold tabular-nums">{form.employeeBirth || "-"}</div>
                <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">성명</div>
                <div className="border-b border-slate-400 px-2 py-0.5 font-semibold">{form.employeeName || "-"}</div>
                <div className="flex items-center justify-center h-[46px]">
                  <InlineSignSpot
                    signKey="employee"
                    signUrl={signUrls.employee}
                    stampUrl={employeeStampUrl}
                    onOpen={onOpenSign}
                    onClear={onClearSign}
                    width={84}
                    height={44}
                    placeholder="(서명)"
                  />
                </div>
              </div>
              <div className="grid grid-cols-[70px,1fr,70px,1fr] gap-1 items-center mt-1">
                <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">주소</div>
                <div className="border-b border-slate-400 px-2 py-0.5 font-semibold">{form.employeeAddress || "-"}</div>
                <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">전화번호</div>
                <div className="border-b border-slate-400 px-2 py-0.5 font-semibold tabular-nums">{form.employeePhone || "-"}</div>
              </div>
              <div className="grid grid-cols-[110px,1fr,70px,1fr] gap-1 items-center mt-1">
                <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">은행/계좌번호</div>
                <div className="border-b border-slate-400 px-2 py-0.5 font-semibold">{form.employeeBankAccount || "-"}</div>
                <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">이메일</div>
                <div className="border-b border-slate-400 px-2 py-0.5 font-semibold">{form.employeeEmail || "-"}</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 개인정보/CCTV 동의 · 4분류 */}
      <table className="w-full border-collapse border-2 border-slate-800 text-[11px] mt-3">
        <tbody>
          <tr>
            <td className="border-b border-r border-slate-500 p-0 w-[32px]" rowSpan={5}>
              <VerticalLabel minH={280}>개인정보 CCTV 설치 동의</VerticalLabel>
            </td>
            <td className="border-b border-r border-slate-500 bg-slate-100 px-2 py-1 text-center font-black w-[22%]">
              정보의 수집·이용 목적<br /><span className="text-[10px] text-slate-600">(CCTV 설치 목적)</span>
            </td>
            <td className="border-b border-r border-slate-500 px-2 py-1 text-slate-800 align-top">
              당사의 인적자원관리, 방범 및 화재예방, 시설안전관리, 사업장내 사고예방 및 범죄예방
            </td>
            <td className="border-b border-r border-slate-500 bg-slate-100 px-2 py-1 text-center font-black w-[18%]">
              정보 보유 및 이용기간
            </td>
            <td className="border-b border-slate-500 px-2 py-1 text-slate-800 align-top">
              근로관계가 유지되는 기간. 단, CCTV 화상영상 정보의 경우 일정기간 후 기존 영상정보에서 삭제
            </td>
          </tr>
          <tr>
            <td className="border-b border-r border-slate-500 bg-slate-100 px-2 py-1 text-center font-black">
              개인정보의 항목
            </td>
            <td className="border-b border-slate-500 px-2 py-1 text-slate-800 align-top" colSpan={3}>
              <ol className="list-decimal list-inside space-y-0.5 text-[10.5px]">
                {PRIVACY_ITEMS.map((p, i) => <li key={i}>{p}</li>)}
              </ol>
            </td>
          </tr>
          <tr>
            <td className="border-b border-r border-slate-500 bg-slate-100 px-2 py-1 text-center font-black">
              CCTV 촬영시간 및 범위
            </td>
            <td className="border-b border-slate-500 px-2 py-1 text-slate-800 align-top" colSpan={3}>
              촬영시간: 24시간 연속 촬영 및 녹화 · 촬영범위: 출입구 및 복도, 사업장 내 등 건물 내 주요 시설
            </td>
          </tr>
          <tr>
            <td className="border-b border-slate-500 bg-amber-50/40 px-2 py-1 text-slate-800 align-top text-[10.5px]" colSpan={4}>
              회사는 개인정보를 인사관리업무와 관련된 업무(기관)외 다른 목적으로 이용하거나 제3자에게 제공하지 않으며, CCTV 설치도 상기 목적외 다른 목적으로 이용하지 않습니다.
              <br />
              위 내용을 충분히 숙지하고 개인정보의 수집 및 CCTV 설치 이용에 대하여 동의합니다.
            </td>
          </tr>
          <tr>
            <td className="border-slate-500 px-2 py-1 align-middle text-[11px]" colSpan={4}>
              <div className="flex flex-wrap items-center gap-3">
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
            </td>
          </tr>
        </tbody>
      </table>
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

const ContractWriterPage: React.FC<ContractWriterPageProps> = ({ authSession, onBack, onNavigate, onLogout, embedded = false }) => {
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

  // ── 서명 URL · 9 지점 ──
  const [signUrls, setSignUrls] = useState<Record<SignKey, string | null>>(() => ({
    employer: null, employee: null, privacy: null,
    specialWork: null, breakChange: null,
    wageClause3: null, wageClause4: null,
    etc5: null, receipt: null,
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
        };
      });
      localStorage.removeItem("contract-writer-prefill");
    } catch { /* silent */ } finally {
      setPrefillConsumed(true);
    }
  }, [prefillConsumed]);

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

  // 폼 리셋
  const handleReset = () => {
    if (!window.confirm("입력한 모든 내용과 서명을 초기화합니다. 계속하시겠습니까?")) return;
    setForm(emptyForm());
    clearAllSignatures();
    setNotice(null);
  };

  // PDF 빌드
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
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgW = pdfW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pdfH) {
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH, undefined, "FAST");
    } else {
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

  const canApprove = signatureStatus.filled === signatureStatus.total;

  // ────────────────────────────────────────────────────────────────
  // 좌측 폼 · 컴팩트 표 형식 (J)
  // ────────────────────────────────────────────────────────────────

  const leftFormNode = (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-col gap-2 h-full overflow-y-auto">
      <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-100">
        <ClipboardText size={15} weight="fill" className="text-emerald-600" />
        <h2 className="text-[13px] font-black text-slate-800">계약 조건 입력</h2>
      </div>

      {/* ═══ 섹션 1 · 근로자 정보 (이름·주민번호·주소·연락처·계좌) ═══ */}
      <section className="flex flex-col gap-1.5">
        <SectionHeader icon={<User size={13} weight="fill" />}>근로자 정보</SectionHeader>
        {empError && <div className="text-[12px] text-rose-600">{empError}</div>}
        <div className="grid md:grid-cols-2 gap-1.5">
          <div className="relative">
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
              placeholder={empLoading ? "직원 불러오는 중..." : "성명 → 검색"}
              autoComplete="off"
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
            />
            {empSearchOpen && form.employeeName.trim() && (() => {
              const q = form.employeeName.trim().toLowerCase();
              const matches = employees.filter(e => (e.name ?? "").toLowerCase().includes(q)).slice(0, 8);
              if (matches.length === 0) return (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-[12px] text-slate-400 text-center">
                  일치 없음 · 직접 입력
                </div>
              );
              return (
                <ul className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {matches.map(e => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => { onSelectEmployee(String(e.id)); setEmpSearchOpen(false); }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-emerald-50 transition-colors flex items-center gap-2"
                      >
                        <span className="text-[13px] font-bold text-slate-800">{e.name}</span>
                        {e.position && <span className="text-[11px] text-slate-500">{e.position}</span>}
                        {e.phone && <span className="text-[11px] text-slate-400 ml-auto tabular-nums">{e.phone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
          <input type="text" value={form.employeeBirth} onChange={(e) => upd("employeeBirth", e.target.value)}
            placeholder="주민번호 (970302-2002227)"
            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition placeholder:text-slate-400 placeholder:text-[12px]"
          />
        </div>
        <div className="grid md:grid-cols-2 gap-1.5">
          <input type="text" value={form.employeePhone} onChange={(e) => upd("employeePhone", e.target.value)}
            placeholder="연락처 (010-1234-5678)"
            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition placeholder:text-slate-400 placeholder:text-[12px]"
          />
          <input type="text" value={form.employeeAddress} onChange={(e) => upd("employeeAddress", e.target.value)}
            placeholder="주소"
            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition placeholder:text-slate-400 placeholder:text-[12px]"
          />
        </div>
        <details className="text-[11px]">
          <summary className="text-slate-500 font-bold cursor-pointer hover:text-emerald-700 inline-flex items-center gap-1">
            <CaretDown size={9} weight="bold" /> 선택 (은행·이메일)
          </summary>
          <div className="grid md:grid-cols-2 gap-1.5 mt-1">
            <input type="text" value={form.employeeBankAccount} onChange={(e) => upd("employeeBankAccount", e.target.value)}
              placeholder="은행 / 계좌번호"
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
            />
            <input type="text" value={form.employeeEmail} onChange={(e) => upd("employeeEmail", e.target.value)}
              placeholder="이메일"
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
            />
          </div>
        </details>

        {/* 카테고리 + 연차 */}
        <div className="flex items-center gap-1 flex-wrap">
          {(["약사", "매장", "창고", "기타"] as const).map(cat => {
            const active = form.employeeCategory === cat;
            const activeColor =
              cat === "약사" ? "bg-violet-500 text-white border-violet-500" :
              cat === "매장" ? "bg-emerald-500 text-white border-emerald-500" :
              cat === "창고" ? "bg-orange-500 text-white border-orange-500" :
                               "bg-slate-600 text-white border-slate-600";
            return (
              <button key={cat} type="button" onClick={() => upd("employeeCategory", cat)}
                className={`px-2 py-1 rounded-lg border text-[12px] font-bold transition-colors cursor-pointer ${
                  active ? activeColor : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >{cat}</button>
            );
          })}
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[11px] text-slate-400 font-semibold shrink-0">연차</span>
            <input type="number" min={0} value={form.annualLeaveDays} onChange={(e) => upd("annualLeaveDays", e.target.value)} placeholder="15"
              className="w-14 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[13px] text-slate-800 font-semibold text-right focus:outline-none focus:border-emerald-500 transition"
            />
            <span className="text-[11px] text-slate-400 font-semibold">일</span>
          </div>
        </div>
        {form.employeeCategory === "기타" && (
          <input type="text" value={form.employeeCategoryCustom} onChange={(e) => upd("employeeCategoryCustom", e.target.value)}
            placeholder="기타 직군 (예: 인턴약사 · 청소 · 배송)"
            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition placeholder:text-slate-400 placeholder:text-[12px]"
          />
        )}
        {(form.employeeCategory === "매장" || form.employeeCategory === "창고") && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-2 py-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-black text-indigo-700 shrink-0">우선업무</span>
            <div className="flex items-center gap-1">
              {(["매장", "창고"] as const).map(f => {
                const active = form.primaryFocus === f;
                const activeCls = f === "매장" ? "bg-emerald-500 text-white border-emerald-600" : "bg-orange-500 text-white border-orange-600";
                return (
                  <button key={f} type="button" onClick={() => upd("primaryFocus", active ? null : f)}
                    className={`px-2 py-0.5 rounded-md border text-[12px] font-bold transition-colors cursor-pointer ${
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
                className="w-14 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-[12px] text-slate-800 font-black text-right focus:outline-none focus:border-indigo-500 transition disabled:bg-slate-100 disabled:text-slate-400"
              />
              <span className="text-[11px] text-indigo-700 font-bold">%</span>
            </div>
          </div>
        )}
      </section>

      {/* ═══ 섹션 2 · 근무 조건 (요일·근무시간·계약기간·담당업무) ═══ */}
      <section className="flex flex-col gap-2 mt-3">
        <SectionHeader icon={<ClockClockwise size={13} weight="fill" />}>근무 조건</SectionHeader>

        {/* 계약 유형 + 근무 요일 */}
        <div className="grid md:grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <FieldLabel required>계약 유형</FieldLabel>
          <SelectOrCustom value={form.contractType} options={CONTRACT_TYPES} onChange={(v) => upd("contractType", v)} placeholder="예: 프리랜서" />
          {form.contractType === "계약직" && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-semibold shrink-0">개월수</span>
              <div className="flex-1">
                <SelectOrCustom value={form.contractMonths} options={["2", "3", "6", "12"]} onChange={(v) => upd("contractMonths", v)} placeholder="예: 9" suffix="개월" />
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel icon={<CalendarBlank size={12} weight="fill" className="text-slate-400" />} required>근무 요일 (자동 주{weeklyDays}일)</FieldLabel>
          <div className="flex flex-wrap gap-0.5">
            {DAYS.map(d => {
              const on = form.workDays[d];
              const isWeekend = d === "토" || d === "일";
              return (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={[
                    "min-w-[30px] px-1.5 py-1 rounded-lg text-[12px] font-black transition-colors cursor-pointer border",
                    on
                      ? isWeekend
                        ? "bg-rose-500 text-white border-rose-600"
                        : "bg-emerald-500 text-white border-emerald-600"
                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50",
                  ].join(" ")}
                >{d}</button>
              );
            })}
          </div>
          <div className="text-[10.5px] text-slate-500 font-semibold">
            {workDaysSummary} · 주중 {weeklyWeekdayDays}일 · 주말 {weeklyWeekendDays}일
          </div>
        </div>
      </div>

      {/* 근무 시간 (한 줄 표시) */}
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="text-[12px] font-bold text-slate-600 flex items-center gap-1 shrink-0">
              <ClockClockwise size={12} weight="fill" className="text-slate-400" />
              <span>근무시간<span className="text-rose-500 ml-0.5">*</span></span>
            </label>
            <div className="w-20">
              <SelectOrCustom value={form.startTime} options={START_TIMES} onChange={(v) => upd("startTime", v)} placeholder="HH:MM" />
            </div>
            <span className="text-[12px] text-slate-500 font-bold">~</span>
            <div className="w-20">
              <SelectOrCustom value={form.endTime} options={END_TIMES} onChange={(v) => upd("endTime", v)} placeholder="HH:MM" />
            </div>
            <span className="text-[11.5px] text-slate-500 font-semibold inline-flex items-center gap-0.5 ml-0.5">
              <Coffee size={12} className="text-slate-400" />
              (휴게
            </span>
            <input type="number" min={0} value={form.breakMinutes} onChange={(e) => upd("breakMinutes", e.target.value)}
              className="w-16 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-[13px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition text-right"
            />
            <span className="text-[11.5px] text-slate-500 font-semibold">분)</span>
          </div>
          {monthlyCalc && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-2 py-1 flex items-center gap-2 text-[11px]">
              <Calculator size={12} weight="fill" className="text-emerald-700" />
              <span className="text-emerald-800 font-black">월 근로시간</span>
              <span className="tabular-nums text-emerald-900 font-black">
                {monthlyCalc.monthlyHoursInt}h {monthlyCalc.monthlyMinutesRem}m
              </span>
              <button type="button" onClick={applyMonthlyHoursToBasic}
                className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10.5px] font-black hover:bg-emerald-700 transition-colors cursor-pointer"
                title="계산된 월 근로시간을 임금표의 기본급 시간에 반영"
              >
                기본급 반영
              </button>
            </div>
          )}
        </div>

        {/* 계약 기간 + 계약체결일 */}
        <div className="grid md:grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <FieldLabel required>계약 기간</FieldLabel>
            <div className="grid grid-cols-[50px,1fr] gap-1 items-center">
              <span className="text-[11px] text-slate-500 font-semibold">시작</span>
              <input type="date" value={form.startDate} onChange={(e) => upd("startDate", e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12.5px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
              />
              <span className="text-[11px] text-slate-500 font-semibold">종료</span>
              <input type="date" value={form.endDate} onChange={(e) => upd("endDate", e.target.value)} disabled={form.indefinite}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12.5px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
              />
            </div>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.indefinite} onChange={(e) => upd("indefinite", e.target.checked)}
                className="w-4 h-4 accent-emerald-600" />
              <span className="text-[11.5px] font-semibold text-slate-700">무기한 (정규직)</span>
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>계약체결일</FieldLabel>
            <input type="date" value={form.contractSignDate} onChange={(e) => upd("contractSignDate", e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
            />
          </div>
        </div>

        {/* 담당 업무 */}
        <div className="flex flex-col gap-1">
          <FieldLabel required>담당 업무</FieldLabel>
          <input type="text" value={form.jobDuty} onChange={(e) => upd("jobDuty", e.target.value)}
            placeholder="예: 약국 카운터 · OTC 판매"
            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition placeholder:text-slate-400 placeholder:text-[12px]"
          />
        </div>
      </section>

      {/* ═══ 섹션 3 · 시급 / 임금 (자동) ═══ */}
      <section className="flex flex-col gap-1 mt-3">
        <SectionHeader
          icon={<Money size={13} weight="fill" />}
          sub={
            <label className="inline-flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" checked={form.useWageComponents} onChange={(e) => upd("useWageComponents", e.target.checked)}
                className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer" />
              <span className="text-[11px] font-black text-indigo-700">임금 구성표</span>
            </label>
          }
        >
          시급 / 임금 (자동)
        </SectionHeader>
        <div className="grid md:grid-cols-2 gap-1.5">
          <div>
            <div className="text-[10.5px] text-slate-400 font-semibold mb-0.5">주중 시급</div>
            <div className="relative">
              <input type="text" inputMode="numeric" value={form.weekdayHourly}
                onChange={(e) => upd("weekdayHourly", e.target.value.replace(/[^0-9]/g, ""))}
                className="w-full bg-white border border-slate-200 rounded-lg pl-2 pr-6 py-1.5 text-[12px] text-slate-800 font-black focus:outline-none focus:border-emerald-500 transition text-right"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] text-slate-400 font-semibold pointer-events-none">원</span>
            </div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-400 font-semibold mb-0.5">주말 시급</div>
            <div className="relative">
              <input type="text" inputMode="numeric" value={form.weekendHourly}
                onChange={(e) => upd("weekendHourly", e.target.value.replace(/[^0-9]/g, ""))}
                className="w-full bg-white border border-slate-200 rounded-lg pl-2 pr-6 py-1.5 text-[12px] text-slate-800 font-black focus:outline-none focus:border-emerald-500 transition text-right"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] text-slate-400 font-semibold pointer-events-none">원</span>
            </div>
          </div>
        </div>
        {form.useWageComponents && (
          <WageComponentsForm wage={form.wageComponents} onChange={(next) => upd("wageComponents", next)} />
        )}

        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10.5px] text-slate-500 font-semibold shrink-0">지급일</span>
          <input type="text" value={form.paymentDayText} onChange={(e) => upd("paymentDayText", e.target.value)}
            placeholder="예: 당월 01일 ~ 당월 말일, 당월 말일 지급"
            className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11.5px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
      </section>

      {/* ═══ 섹션 4 · 산정 비교 (역산 + 좌우 산정) ═══ */}
      <section className="flex flex-col gap-1 mt-3">
        <SectionHeader icon={<Calculator size={13} weight="fill" />}>산정 비교</SectionHeader>
        {/* 역산 계산기 (C) */}
        <WageCalcModePanel
          form={form}
          weeklyWeekdayDays={weeklyWeekdayDays}
          weeklyWeekendDays={weeklyWeekendDays}
          onApplyToWageComponents={(nextWage) => upd("wageComponents", nextWage)}
          onApplyHourly={(wd, we) => setForm(prev => ({ ...prev, weekdayHourly: String(wd), weekendHourly: String(we) }))}
        />
        {/* 임금 산정 비교 (D) · 임금 구성표 활성 시 */}
        {form.useWageComponents && (
          <WageSummaryDualPanel
            form={form}
            weeklyWeekdayDays={weeklyWeekdayDays}
            weeklyWeekendDays={weeklyWeekendDays}
          />
        )}
        {!form.useWageComponents && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5 text-[10.5px] text-slate-500 font-semibold text-center">
            임금 구성표 체크 시 · 포괄임금 vs 실 근무시간 좌우 비교 활성화
          </div>
        )}
      </section>

      {/* ═══ 섹션 5 · 옵션 (접기) · 사업주 · 4대보험 · 추가특약 · CCTV ═══ */}
      <details className="rounded-lg border border-slate-200 bg-slate-50/40 px-2 py-1.5 mt-3">
        <summary className="text-[11.5px] font-black text-slate-600 cursor-pointer hover:text-emerald-700 flex items-center gap-1">
          <CaretDown size={10} weight="bold" /> 사업주 정보 · 4대보험 · 추가 특약 · CCTV
        </summary>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {/* 사업주 */}
          <div className="grid md:grid-cols-2 gap-1.5">
            <input type="text" value={form.employerName} onChange={(e) => upd("employerName", e.target.value)}
              placeholder="대표자 (강남성)"
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
            />
            <input type="text" value={form.companyName} onChange={(e) => upd("companyName", e.target.value)}
              placeholder="상호 (오산 메가타운 약국)"
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
            />
            <input type="text" value={form.companyAddress} onChange={(e) => upd("companyAddress", e.target.value)}
              placeholder="사업장 주소"
              className="md:col-span-2 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
            />
            <input type="text" value={form.companyRegNo} onChange={(e) => upd("companyRegNo", e.target.value)}
              placeholder="사업자등록번호 (선택)"
              className="md:col-span-2 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          {/* 4대보험 */}
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={form.socialInsurance} onChange={(e) => upd("socialInsurance", e.target.checked)}
              className="w-4 h-4 accent-emerald-600" />
            <span className="text-[12px] font-bold text-slate-700">4대보험 가입 (고용·산재·국민연금·건강보험)</span>
          </label>

          {/* 추가 특약 */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Notepad size={11} weight="fill" className="text-slate-400" /> 추가 특약
            </span>
            <textarea value={form.additionalContent} onChange={(e) => upd("additionalContent", e.target.value)} rows={2}
              placeholder="예: 수습기간 3개월 · 명절 상여 별도"
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition resize-y"
            />
          </div>

          {/* CCTV/개인정보 */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-1.5 flex flex-col gap-1">
            <div className="text-[11px] font-black text-amber-800 flex items-center gap-1">
              <Warning size={11} weight="fill" />
              개인정보 · CCTV 동의
            </div>
            <div className="grid md:grid-cols-2 gap-1.5">
              <input type="text" value={form.privacyConsent.recipientName}
                onChange={(e) => upd("privacyConsent", { ...form.privacyConsent, recipientName: e.target.value })}
                placeholder="수령자 성명 (미입력 시 근로자명)"
                className="bg-white border border-slate-200 rounded-md px-2 py-1 text-[12px] text-slate-800 font-semibold focus:outline-none focus:border-amber-500 transition"
              />
              <input type="text" value={form.privacyConsent.recipientAddress}
                onChange={(e) => upd("privacyConsent", { ...form.privacyConsent, recipientAddress: e.target.value })}
                placeholder="수령자 주소 (미입력 시 근로자 주소)"
                className="bg-white border border-slate-200 rounded-md px-2 py-1 text-[12px] text-slate-800 font-semibold focus:outline-none focus:border-amber-500 transition"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={form.privacyConsent.agreedCollection}
                  onChange={(e) => upd("privacyConsent", { ...form.privacyConsent, agreedCollection: e.target.checked })}
                  className="w-3.5 h-3.5 accent-amber-600 cursor-pointer" />
                <span className="text-[11px] font-bold text-slate-700">개인정보 수집·이용</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={form.privacyConsent.agreedCCTV}
                  onChange={(e) => upd("privacyConsent", { ...form.privacyConsent, agreedCCTV: e.target.checked })}
                  className="w-3.5 h-3.5 accent-amber-600 cursor-pointer" />
                <span className="text-[11px] font-bold text-slate-700">CCTV 촬영·이용</span>
              </label>
            </div>
          </div>
        </div>
      </details>
    </section>
  );

  // ────────────────────────────────────────────────────────────────
  // 우측 · 프리뷰 (인라인 서명 spot 포함)
  // ────────────────────────────────────────────────────────────────

  const rightPreviewNode = (
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
            <button type="button" onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-colors cursor-pointer"
              title="초기화"
            >
              <ArrowsClockwise size={14} />
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
