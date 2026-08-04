// src/components/ContractWriterPage/ContractWriterPage.tsx
// 근로계약서 작성 페이지 · 2026-08-04 · 사용자 최우선 명령
// - 이미지 (src/images/근로계약서1,2.jpg · 코스트팜 실제 양식) 픽셀 재현
// - 임금 구성 표 7행 · 각 항목 월평균 시간·분·금액 · 사용자 편집 · 일급여총액 자동합계
// - 근무시간 (시작/종료/휴게분/주근무일수) → 월 근로시간 자동계산 → "기본급 시간" 자동 반영
// - 서명 지점 7개만 · 각 조항의 마이크로 서명 pad 전부 제거
//   1. 계약체결일 옆 (contractDate) · 2. 특별근로 동의 (specialWork) · 3. 퇴직급 동의 (severance)
//   4. 수령자 확인 (receipt)          · 5. 근로자 최종 (employee) · 6. CCTV/개인정보 (privacy)
//   7. 사업주 (employer)
// - 정계·해고 11사유 · 기타 5항목 · CCTV/개인정보 동의 표 모두 재현
// - html2canvas-pro + jsPDF PDF 생성 · Supabase Storage 저장 · localStorage 임시저장 유지
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NotePencil, User, ClipboardText, CalendarBlank, ClockClockwise, Money,
  Coffee, Notepad, Eraser, DownloadSimple, ArrowsClockwise, Warning, Check,
  Signature, ClockCounterClockwise, X as XIcon, Calculator,
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

// 이미지 · 임금 구성 표 (7행) · 시간·분·금액 세분화
// - 기본급(주휴수당 포함) · (고정)연장·휴일·휴일야간·야간 · 식대·차량유지비
export interface WageComponentEntry {
  hours: number;    // 월평균 시간 (정수부)
  minutes: number;  // 분 (0~59)
  amount: number;   // 금액 (원)
}
export interface WageComponents {
  basicSalary: WageComponentEntry;       // 기본급 (주휴수당 포함)
  fixedOvertime: WageComponentEntry;     // (고정)연장근로수당 (1.5배 가산)
  fixedHoliday: WageComponentEntry;      // (고정)휴일근로수당 (1.5배 가산)
  fixedHolidayNight: WageComponentEntry; // (고정)휴일야간근로수당 (0.5배 가산)
  fixedNight: WageComponentEntry;        // (고정)야간근로수당 (0.5배 가산)
  mealAllowance: number;                 // 식대 (비과세 · 해당자에 한함)
  vehicleAllowance: number;              // 차량유지비 (비과세 · 해당자에 한함)
}

export interface PrivacyConsent {
  recipientName: string;
  recipientAddress: string;
  agreedCollection: boolean;
  agreedCCTV: boolean;
}

interface ContractForm {
  // 근로자
  employeeId: number | null;
  employeeName: string;
  employeePhone: string;
  employeeAddress: string;
  employeeBirth: string;
  employeeBankAccount: string;   // 은행/계좌 (이미지 하단 · 옵션)
  employeeEmail: string;         // 이메일 (이미지 하단 · 옵션)

  // 계약 유형
  contractType: string;
  contractMonths: string;

  // 근무 요일 (체크박스) + 주 근무일수 (자동/수동)
  workDays: Record<DayKey, boolean>;
  weeklyDays: string;

  // 근무 시간
  startTime: string;
  endTime: string;
  breakMinutes: string;

  // 시급 (하위 호환 · useWageComponents=false 인 경우)
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

  // 임금 세분화
  useWageComponents: boolean;
  wageComponents: WageComponents;

  // 개인정보/CCTV
  privacyConsent: PrivacyConsent;

  // 임금 지급일 자유 입력
  paymentDayText: string;

  // 이미지 재현 · 계약체결일 (기본 = 시작일)
  contractSignDate: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────

const DAYS: DayKey[] = ["월", "화", "수", "목", "금", "토", "일"];

const CONTRACT_TYPES = ["정규직", "계약직", "알바", "일용", "인턴"];
const WEEKLY_DAYS = ["3", "4", "5", "6"];
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

// 인·정계·해고 11사유 (코스트팜 원본 문구 · 오타 보정)
const DISCIPLINE_REASONS: string[] = [
  "부정 또는 부실한 방법으로 채용된 자",
  "업무상 명령 또는 시설물 훼손·손상이 있는 자",
  "회사의 명예 또는 이익을 훼손시킨 자",
  "회사의 규칙·관리규정에 대한 정당한 지시나 질서를 문란하게 한 자",
  "정당한 이유 없이 회사의 물품·금품을 반출한 자",
  "직무를 이용하여 부당한 이익을 취한 자",
  "회사가 정한 복무규정을 위반한 자",
  "직장 내 성희롱 행위를 한 자",
  "이유 없이 결근한 자",
  "근무태만 및 근무 불성실로 개선의 여지가 없다고 판단되는 자",
  "기타 이에 준하는 행위로 징계·해고할 필요가 있다고 판단되는 자",
];

// 기타사항 5항목 (코스트팜 원본)
const ETC_ITEMS: string[] = [
  "임금 지급일: '을'에게 지정 지급 및 '을'이 지정한 예금 통장에 입금한다.",
  "'갑'과 '을'은 상기 임금지급을 최소 1주일 근로기간에 관련하여 지급하는 방법이 아니다.",
  "임의 퇴사 시에는 사유가 발생한 후 30일 이상 회사에 알리며, 사직서 제출 후 사용자의 수리가 있기 전에는 '갑'이 지정한 임의 퇴사자에 대한 인수인계를 수행해야 한다. (퇴사 30일 전 통보) · 노동관계법령, 취업규칙, 기타 회사가 정한 지침에 위배된다.",
  "'갑'과 '을'이 성립한 근로관계 형성상 노력에도 불구하고 본 계약 이외의 사항에 대해 단체 및 회사에 손해가 발생 시 지급되지 아니한다. (계약 해지 시 손해)",
  "'을'의 퇴직 시 미사용 부여한 휴가에 대한 수당은 '갑'이 상여금 및 상계에 공제하여 지급되지 아니한다.",
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

// 임금 세분화 · 총액 산출 (7항목 합)
function computeWageTotal(w: WageComponents): number {
  return (
    (w.basicSalary?.amount ?? 0) +
    (w.fixedOvertime?.amount ?? 0) +
    (w.fixedHoliday?.amount ?? 0) +
    (w.fixedHolidayNight?.amount ?? 0) +
    (w.fixedNight?.amount ?? 0) +
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

// 근무시간 → 월 근로시간 계산 (근기법 표준 · 주당 * 4.345)
function computeMonthlyHours(startTime: string, endTime: string, breakMinutes: number, weeklyDays: number): {
  dailyMinutes: number;
  weeklyMinutes: number;
  monthlyMinutes: number;
  monthlyHours: number;   // 소수점 2자리
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
  // 월평균 = 주 × 4.345 (근기법 209시간의 근거)
  const monthlyMinutes = Math.round(weeklyMinutes * 4.345);
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
  weeklyDays: "5",
  startTime: "09:00",
  endTime: "18:00",
  breakMinutes: "60",
  weekdayHourly: "12000",
  weekendHourly: "13500",
  startDate: todayIso(),
  endDate: "",
  indefinite: true,
  jobDuty: "약국 카운터 · OTC 판매 · 재고 관리",
  socialInsurance: true,
  additionalContent: "",
  annualLeaveDays: "12",
  employeeCategory: "매장",
  employeeCategoryCustom: "",
  primaryFocus: "매장",
  primaryFocusPercent: 70,
  employerName: (DEFAULT_EMPLOYER.employerName as string) ?? "",
  companyName:  (DEFAULT_EMPLOYER.companyName as string) ?? "",
  companyAddress: (DEFAULT_EMPLOYER.companyAddress as string) ?? "",
  companyRegNo: (DEFAULT_EMPLOYER.companyRegNo as string) ?? "",
  useWageComponents: false,
  wageComponents: {
    basicSalary:       { hours: 209, minutes: 0, amount: 4671298 },
    fixedOvertime:     { hours: 55,  minutes: 56, amount: 1250408 },
    fixedHoliday:      { hours: 22,  minutes: 0,  amount: 491716  },
    fixedHolidayNight: { hours: 0,   minutes: 0,  amount: 0       },
    fixedNight:        { hours: 10,  minutes: 0,  amount: 223508  },
    mealAllowance:     0,
    vehicleAllowance:  0,
  },
  privacyConsent: {
    recipientName: "",
    recipientAddress: "",
    agreedCollection: false,
    agreedCCTV: false,
  },
  paymentDayText: "매월 1일부터 당월 말일까지의 급여는 익월 5일에 '을' 본인의 통장에 지급된다.",
  contractSignDate: todayIso(),
});

// ─────────────────────────────────────────────────────────────────────────────
// SelectOrCustom · FieldLabel · SignArea (재사용 컴포넌트)
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
          className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition cursor-pointer"
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
            className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
          />
          <button
            type="button"
            onClick={() => {
              setMode("select");
              if (!options.includes(value)) onChange(options[0] ?? "");
            }}
            className="shrink-0 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-[11px] font-bold transition-colors cursor-pointer"
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
  <label className="text-[12px] font-bold text-slate-600 flex items-center gap-1.5 mb-1.5">
    {icon}
    <span>{children}{required && <span className="text-rose-500 ml-0.5">*</span>}</span>
  </label>
);

const SignArea: React.FC<{
  label: string;
  padRef: React.MutableRefObject<SignatureCanvasType | null>;
  color?: "emerald" | "indigo" | "amber" | "rose";
  height?: number;
  compact?: boolean;
}> = ({ label, padRef, color = "emerald", height = 110, compact = false }) => {
  const [empty, setEmpty] = useState(true);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 300, h: height });

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(180, Math.floor(e.contentRect.width) - 2);
        setSize({ w, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  const handleEnd = () => {
    if (padRef.current) setEmpty(padRef.current.isEmpty());
  };
  const handleClear = () => {
    padRef.current?.clear();
    setEmpty(true);
  };

  const palettes: Record<string, { border: string; text: string; btn: string }> = {
    emerald: { border: "border-emerald-200", text: "text-emerald-700", btn: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200" },
    indigo:  { border: "border-indigo-200",  text: "text-indigo-700",  btn: "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200" },
    amber:   { border: "border-amber-200",   text: "text-amber-700",   btn: "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200" },
    rose:    { border: "border-rose-200",    text: "text-rose-700",    btn: "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200" },
  };
  const p = palettes[color];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-black flex items-center gap-1 ${p.text}`}>
          <Signature size={12} weight="fill" />
          {label}
        </span>
        <button
          type="button"
          onClick={handleClear}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold transition-colors cursor-pointer ${p.btn}`}
          title="서명 지우기"
        >
          <Eraser size={10} />
          지우기
        </button>
      </div>

      <div
        ref={wrapperRef}
        className={`relative bg-white border-2 border-dashed ${p.border} rounded-lg overflow-hidden`}
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
          onEnd={handleEnd}
          onBegin={() => setEmpty(false)}
        />
        {empty && (
          <span className={`pointer-events-none absolute inset-0 flex items-center justify-center text-slate-300 ${compact ? "text-[10px]" : "text-xs"} font-bold select-none`}>
            {compact ? "서명" : "여기에 서명해 주세요"}
          </span>
        )}
      </div>
    </div>
  );
};

// 사각형 체크박스 (PDF 안정 렌더)
const SpanBox: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span
    className={`inline-flex items-center justify-center w-4 h-4 border-2 text-[10px] font-black ${checked ? "border-emerald-600 text-emerald-600" : "border-slate-400 text-transparent"}`}
    style={{ lineHeight: "1" }}
  >
    {checked ? "V" : ""}
  </span>
);

// 세로 라벨 (좌측 세로 텍스트 · 이미지의 "근·무·장·소" 스타일)
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
// 임금 구성 표 (프리뷰 · 이미지 재현)
// ─────────────────────────────────────────────────────────────────────────────
const WageComponentsTable: React.FC<{ wage: WageComponents }> = ({ wage }) => {
  type Row = { label: string; note?: string; entry?: WageComponentEntry; flatAmount?: number; optional?: boolean };
  const rows: Row[] = [
    { label: "기본급", note: "주휴수당 포함", entry: wage.basicSalary },
    { label: "(고정)연장근로수당", note: "1.5배 가산 포함", entry: wage.fixedOvertime },
    { label: "(고정)휴일근로수당", note: "1.5배 가산 포함", entry: wage.fixedHoliday },
    { label: "(고정)휴일야간근로수당", note: "0.5배 가산 포함", entry: wage.fixedHolidayNight },
    { label: "(고정)야간근로수당", note: "0.5배 가산 포함", entry: wage.fixedNight },
    { label: "식대", note: "비과세", flatAmount: wage.mealAllowance, optional: true },
    { label: "차량유지비", note: "비과세", flatAmount: wage.vehicleAllowance, optional: true },
  ];
  const total = computeWageTotal(wage);

  return (
    <div className="border border-slate-500 rounded-sm overflow-hidden text-[11.5px]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-100 text-slate-800 font-black text-[11.5px]">
            <th className="border-b border-r border-slate-400 px-2 py-1 text-left w-[36%]">구성 항목</th>
            <th className="border-b border-r border-slate-400 px-2 py-1 text-left w-[38%]">내용</th>
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
            <td className="px-2 py-1.5 font-black text-slate-800 border-r border-slate-400">일급여총액</td>
            <td className="border-r border-slate-400 px-2 py-1.5 text-[10.5px] text-slate-600">(약칭)</td>
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
// 임금 구성 입력 폼 (좌측 폼)
// ─────────────────────────────────────────────────────────────────────────────
const WageComponentsForm: React.FC<{
  wage: WageComponents;
  onChange: (next: WageComponents) => void;
}> = ({ wage, onChange }) => {
  const updEntry = (
    key: keyof Pick<WageComponents, "basicSalary" | "fixedOvertime" | "fixedHoliday" | "fixedHolidayNight" | "fixedNight">,
    field: keyof WageComponentEntry,
    val: number,
  ) => {
    onChange({ ...wage, [key]: { ...wage[key], [field]: val } });
  };
  const updFlat = (key: "mealAllowance" | "vehicleAllowance", val: number) => {
    onChange({ ...wage, [key]: val });
  };

  const rows: Array<{
    key: keyof Pick<WageComponents, "basicSalary" | "fixedOvertime" | "fixedHoliday" | "fixedHolidayNight" | "fixedNight">;
    label: string;
    note: string;
  }> = [
    { key: "basicSalary",       label: "기본급",                 note: "주휴수당 포함" },
    { key: "fixedOvertime",     label: "(고정)연장근로수당",     note: "1.5배" },
    { key: "fixedHoliday",      label: "(고정)휴일근로수당",     note: "1.5배" },
    { key: "fixedHolidayNight", label: "(고정)휴일야간근로수당", note: "0.5배" },
    { key: "fixedNight",        label: "(고정)야간근로수당",     note: "0.5배" },
  ];

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-2 flex flex-col gap-1.5">
      <div className="text-[11px] font-black text-indigo-800 flex items-center gap-1">
        <Money size={11} weight="fill" />
        임금 구성 (월평균 시간·분 · 금액)
      </div>

      <div className="grid grid-cols-[110px,1fr,50px,1fr] gap-1 text-[10px] font-bold text-slate-500 uppercase pl-1">
        <div>항목</div>
        <div className="text-center">시간</div>
        <div className="text-center">분</div>
        <div className="text-right pr-1">금액 (원)</div>
      </div>

      {rows.map(r => (
        <div key={r.key} className="grid grid-cols-[110px,1fr,50px,1fr] gap-1 items-center">
          <div className="text-[11px] font-bold text-slate-700 leading-tight">
            {r.label}
            <div className="text-[9px] text-slate-500 font-semibold">({r.note})</div>
          </div>
          <input
            type="number"
            min={0}
            value={wage[r.key].hours}
            onChange={(e) => updEntry(r.key, "hours", Number(e.target.value) || 0)}
            className="bg-white border border-slate-200 rounded-md px-1.5 py-1 text-[12px] text-slate-800 font-semibold text-right focus:outline-none focus:border-indigo-500 transition"
            placeholder="0"
          />
          <input
            type="number"
            min={0}
            max={59}
            value={wage[r.key].minutes}
            onChange={(e) => updEntry(r.key, "minutes", Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
            className="bg-white border border-slate-200 rounded-md px-1.5 py-1 text-[12px] text-slate-800 font-semibold text-right focus:outline-none focus:border-indigo-500 transition"
            placeholder="0"
          />
          <input
            type="text"
            inputMode="numeric"
            value={String(wage[r.key].amount)}
            onChange={(e) => updEntry(r.key, "amount", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
            className="bg-white border border-slate-200 rounded-md px-1.5 py-1 text-[12px] text-slate-800 font-black text-right focus:outline-none focus:border-indigo-500 transition"
            placeholder="0"
          />
        </div>
      ))}
      <div className="grid grid-cols-[110px,1fr,1fr] gap-1 items-center">
        <div className="text-[11px] font-bold text-slate-700 leading-tight">
          식대
          <div className="text-[9px] text-slate-500 font-semibold">(비과세)</div>
        </div>
        <div className="text-[10px] text-slate-500 font-semibold text-center">해당자에 한함</div>
        <input
          type="text"
          inputMode="numeric"
          value={String(wage.mealAllowance)}
          onChange={(e) => updFlat("mealAllowance", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
          className="bg-white border border-slate-200 rounded-md px-1.5 py-1 text-[12px] text-slate-800 font-black text-right focus:outline-none focus:border-indigo-500 transition"
          placeholder="0"
        />
      </div>
      <div className="grid grid-cols-[110px,1fr,1fr] gap-1 items-center">
        <div className="text-[11px] font-bold text-slate-700 leading-tight">
          차량유지비
          <div className="text-[9px] text-slate-500 font-semibold">(비과세)</div>
        </div>
        <div className="text-[10px] text-slate-500 font-semibold text-center">해당자에 한함</div>
        <input
          type="text"
          inputMode="numeric"
          value={String(wage.vehicleAllowance)}
          onChange={(e) => updFlat("vehicleAllowance", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
          className="bg-white border border-slate-200 rounded-md px-1.5 py-1 text-[12px] text-slate-800 font-black text-right focus:outline-none focus:border-indigo-500 transition"
          placeholder="0"
        />
      </div>

      <div className="mt-1 pt-1 border-t border-indigo-200 flex items-center justify-between text-[12px]">
        <span className="text-emerald-800 font-black">일급여총액 (자동합)</span>
        <span className="text-emerald-800 font-black tabular-nums">{fmtWon(computeWageTotal(wage))} 원</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 이미지 재현 프리뷰
// ─────────────────────────────────────────────────────────────────────────────
const ContractPreview = React.forwardRef<HTMLDivElement, {
  form: ContractForm;
  employerSignUrl: string | null;
  employeeSignUrl: string | null;
  privacySignUrl: string | null;
  contractDateSignUrl: string | null;
  specialWorkSignUrl: string | null;
  severanceSignUrl: string | null;
  receiptSignUrl: string | null;
}>(({
  form, employerSignUrl, employeeSignUrl, privacySignUrl,
  contractDateSignUrl, specialWorkSignUrl, severanceSignUrl, receiptSignUrl,
}, ref) => {
  const workDayText = DAYS.filter(d => form.workDays[d]).join("·") || "(선택 안 됨)";
  const startD = fmtKoreanDate(form.startDate);
  const endD = form.indefinite ? "" : fmtKoreanDate(form.endDate);

  // 계약체결일 · 년/월/일 분리 표시
  const csDate = form.contractSignDate ? form.contractSignDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const csY = csDate ? csDate[1] : "";
  const csM = csDate ? Number(csDate[2]) : "";
  const csD = csDate ? Number(csDate[3]) : "";

  // 시작일 년/월/일 (기간 있음 케이스)
  const stDate = form.startDate ? form.startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const enDate = form.endDate   ? form.endDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;

  // 근무시간 요약
  const hoursCalc = (() => {
    const s = parseHM(form.startTime);
    const e = parseHM(form.endTime);
    if (!s || !e) return null;
    const rawMin = (e.h * 60 + e.m) - (s.h * 60 + s.m);
    if (rawMin <= 0) return null;
    const breakMin = Number(form.breakMinutes) || 0;
    const paidMin = Math.max(0, rawMin - breakMin);
    const fmt = (min: number) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
    };
    return { rawText: fmt(rawMin), paidText: fmt(paidMin), breakText: fmt(breakMin), paidHours: paidMin / 60 };
  })();

  // 휴게 시작·종료 표시용 (start~end 사이에서 breakMinutes 만큼 · 이미지 예: 12:00 ~ 13:00)
  const breakDisplay = (() => {
    const s = parseHM(form.startTime);
    const bMin = Number(form.breakMinutes) || 0;
    if (!s || bMin <= 0) return null;
    // 관례상 정오 12:00~13:00 · 8시간+휴게 케이스 · 그 외엔 중간 시간대
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
      {/* 상단 · 제목 + 근로자명 · 우측 상단 (이미지 재현) */}
      <div className="flex items-center justify-center border-b-2 border-slate-800 pb-2 mb-3 relative">
        <h2 className="text-[22px] font-black tracking-[0.3em] text-slate-900 text-center">
          근 로 계 약 서
        </h2>
        <div className="absolute right-0 top-0 bottom-0 flex items-center text-[15px] font-black text-slate-800">
          ( <span className="mx-1 min-w-[60px] text-center border-b border-slate-500 px-2">{form.employeeName || " "}</span> )
        </div>
      </div>

      {/* 서두 · 한 줄 */}
      <p className="text-[12px] text-slate-800 mb-3 leading-relaxed">
        <b>사용자 '갑'(회사)와 근로자 '을'</b> (이하 '을'이라 한다) 은 다음과 같이 근로계약을 체결하고 신의에 따라 성실히 이행할 것을 약정한다.
      </p>

      {/* ── 표 1 · 근무장소 / 근로계약기간 / 임금 / 근로일·근무시간 / 퇴직급 / 연차 ── */}
      <table className="w-full border-collapse border-2 border-slate-800 text-[12px]">
        <tbody>
          {/* 근무장소 */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0 w-[32px]" rowSpan={1}>
              <VerticalLabel minH={54}>근무장소</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <div>
                <b className="font-bold">코스트팜(Costpharm)</b> 회사 및 관계 현장 · <b>담당업무</b> {form.jobDuty || "-"}
              </div>
              <div className="text-[11px] text-slate-700 mt-1">
                '갑', '을'의 사정에 따라 근무 장소 및 업무를 변경할 수 있으며, '을'은 정당한 사유 없이 이를 거부할 수 없다.
              </div>
            </td>
          </tr>

          {/* 근로계약기간 */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0" rowSpan={1}>
              <VerticalLabel minH={80}>근로계약기간</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <div className="flex items-center gap-2 mb-1">
                <SpanBox checked={form.indefinite} />
                <span className="font-bold">기간의 정함이 없음.</span>
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
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                (근로계약일: <b>{fmtKoreanDate(form.contractSignDate) || "-"}</b>)
              </div>
              {!form.indefinite && (
                <div className="text-[10.5px] text-slate-600 mt-1">
                  기간의 정함이 있는 기간제 근로의 경우 계약기간 만료일에 별도의 통보 없이 근로계약은 자동 해지된다.
                </div>
              )}
              {/* 계약체결일 · 서명 · 우측 (이미지 재현) */}
              <div className="mt-2 flex items-end justify-end gap-2">
                <span className="text-[11px] text-slate-700 font-bold">
                  (계약체결일 경우 서명)
                </span>
                <div className="w-[140px] h-[38px] border-b-2 border-slate-500 flex items-end justify-center">
                  {contractDateSignUrl && (
                    <img src={contractDateSignUrl} alt="계약체결일 서명" className="max-h-[38px] max-w-full object-contain" />
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-semibold pb-1">(서명 또는 도장)</span>
              </div>
            </td>
          </tr>

          {/* 임금 (표 + 조항 + 지급일) */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0" rowSpan={1}>
              <VerticalLabel minH={340}>임금</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <div className="text-[11.5px] text-slate-800 mb-1.5 font-semibold">
                1. '을'의 구체적인 임금 구성항목은 아래와 같다.
              </div>
              {form.useWageComponents ? (
                <WageComponentsTable wage={form.wageComponents} />
              ) : (
                // 하위 호환 · 시급 기반 텍스트 렌더 (사용자가 상세임금구성 OFF 인 경우)
                <div className="border border-slate-400 rounded-sm p-2 text-[12px]">
                  <div>· 시간급 (주중): <b>{fmtWon(form.weekdayHourly)} 원</b></div>
                  <div>· 시간급 (주말): <b>{fmtWon(form.weekendHourly)} 원</b></div>
                </div>
              )}

              {/* 조항 (이미지 재현) */}
              <div className="mt-2 space-y-1 text-[11px] text-slate-700 leading-snug">
                <div>
                  ※ 상기 월 급여 총액에는 (고정)연장·휴일근로수당에 대한 (고정)연장·휴일수당이 포함되어 있으므로,
                  추가 연장 및 휴일 근무 등 휴무일 상시 발생 가능한 연장 및 휴일 근무의 통상 발생하는 급여의 대가로 포함되었다.
                </div>
                <div>
                  ※ 약국의 업무 특성상 불규칙한 근로 및 급여 총액에는 통상 기본 근로 시,
                  기본 근로시간, 연장·야간 등의 통상적 상기 연장/휴일 근무의 대가로 지원되었다.
                </div>
                <div>
                  ※ '을'은 상기 급여 총액에 대하여 급여 지급방식에 개별별 신청에 대해 연차유급휴가·유급 사용할 경우
                  지 지급이 상실 차기에 의 청산·해지된다. 연차유급휴가수당 및 회사에 정한 정계사유에 해당하는 경우에만 지 지급된다.
                </div>
              </div>

              {/* 임금 지급일 */}
              <div className="mt-2 rounded-sm bg-amber-50/60 border border-amber-300 px-2 py-1 text-[11.5px]">
                <b>2. 임금지급일:</b> {form.paymentDayText}
              </div>
            </td>
          </tr>

          {/* 근로일 · 근무시간 · 휴게시간 */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0" rowSpan={1}>
              <VerticalLabel minH={180}>근로일 근무시간</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <div className="text-[11.5px] font-bold mb-1">
                1. 기본 근로일: <b className="text-slate-900">{workDayText}</b>
              </div>
              <div className="text-[10.5px] text-slate-600 mb-2 leading-snug">
                · 소정근로시간 주 40시간 이내에서 당사자가 정하는 시간을 의미하며, 무급 휴게시간을 제외한 실 근로시간을 근로시간으로 하며,
                주휴일은 유급일로 근무한 경우 유급휴일로 인정한다.
              </div>

              <div className="text-[11.5px] font-bold mb-1">1. 기본 근로시간:</div>
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
                      {hoursCalc && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          (실근무 {hoursCalc.paidText})
                        </div>
                      )}
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

              <div className="text-[10.5px] text-slate-600 leading-snug mb-2">
                ※ 소정근로시간과 휴게시간을 제외한 일자별 법정근로시간 (초과분) 을 초과할 당사자가 정하는 시간에 근로하며,
                상기 시간 이외에도 자유롭게 동의한다.
                <br />
                ※ 업무형편상 부득이 상기 휴게시간을 재조정하여 사용해야 할 경우에는 재조정에 정하거나 사용할 수 있다.
              </div>

              {/* 특별근로 동의 · 서명 (이미지 재현) */}
              <div className="mt-1 rounded-sm border border-amber-300 bg-amber-50/50 px-2 py-1.5">
                <div className="text-[11px] text-slate-800 leading-snug">
                  ※ 사업주 및 근로자를 특별히 사용하는 근무의 경우에 '을'은 소정근로시간을 특별히 사용하는 경우의 근로에 본인의 자유의사로 동의한다. <b>(해당시 서명)</b>
                </div>
                <div className="mt-1 flex items-end justify-end gap-2">
                  <span className="text-[11px] font-bold text-slate-800">{form.employeeName || "(근로자)"}</span>
                  <div className="w-[140px] h-[36px] border-b-2 border-slate-500 flex items-end justify-center">
                    {specialWorkSignUrl && (
                      <img src={specialWorkSignUrl} alt="특별근로 동의 서명" className="max-h-[36px] max-w-full object-contain" />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-semibold pb-1">(서명)</span>
                </div>
              </div>
            </td>
          </tr>

          {/* 퇴직급 */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={54}>퇴직급</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <div className="text-[11.5px]">
                퇴직급여보장법 및 퇴직연금제도 등, 정과금 관련하여 정하고 있는 법정기준에 따라 지급한다.
              </div>
              <div className="mt-1 flex items-end justify-end gap-2">
                <span className="text-[11px] font-bold text-slate-800">{form.employeeName || "(근로자)"}</span>
                <div className="w-[140px] h-[32px] border-b-2 border-slate-500 flex items-end justify-center">
                  {severanceSignUrl && (
                    <img src={severanceSignUrl} alt="퇴직급 동의 서명" className="max-h-[32px] max-w-full object-contain" />
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-semibold pb-1">(서명)</span>
              </div>
            </td>
          </tr>

          {/* 연차유급휴가 */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={44}>연차유급휴가</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <div className="text-[11.5px]">
                연차유급휴가는 근로기준법 제60조에 따라 <b>연 {form.annualLeaveDays || "12"}일</b> 부여하며,
                근로자대표와의 서면합의로 연차유급휴가일을 갈음하여 정한 근로일에 휴무시킬 수 있다
                (상시 근로자 5인 미만 사업장의 경우에는 적용을 제외한다).
              </div>
            </td>
          </tr>

          {/* 유급 관련 (뒷면 상단) */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={80}>유급</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] text-slate-800">
                <li>15일 이상 소정근로일수를 계산한 경우에도 시간이 15시간 미만인 경우에 해당하여 개근 시에는 <b>주휴수당을 지급한다.</b></li>
                <li>공휴일은 유급휴일로 한다.</li>
                <li>퇴직자는 무급휴가를 부여한다.</li>
                <li>급요와 공휴일에 관련 규정, 제3조 (휴게시간을 제외한다) 따른 근무일 등 같은 조 제3조에 따라 대체근무 등의 요일에 대체근무 사용자간 부여할 수 있으며 · 보상 휴가 부여도 가능하다. (상시 근로자 수가 5인 이상)</li>
              </ol>
            </td>
          </tr>

          {/* 인·정계·해고 사유 (11개) */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={220}>인정계 해고 사유</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <div className="text-[11px] font-bold text-slate-800 mb-1">
                인·정계·해고에 관련 처벌 방법 (다음 각 호의 어느 하나에 해당하는 경우 사업주는 근로자를 징계 또는 해고할 수 있다)
              </div>
              <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] text-slate-800 pl-1">
                {DISCIPLINE_REASONS.map((r, i) => (
                  <li key={i} className="leading-snug">{r}</li>
                ))}
              </ol>
            </td>
          </tr>

          {/* 기타사항 5항목 */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0">
              <VerticalLabel minH={140}>기타사항</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-3 py-2 align-top">
              <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] text-slate-800 pl-1">
                {ETC_ITEMS.map((r, i) => (
                  <li key={i} className="leading-snug">{r}</li>
                ))}
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

      {/* 본 계약서 교부 확인 · 수령자 서명 */}
      <div className="mt-3 border border-slate-500 rounded-sm px-3 py-2 text-[11.5px] flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[280px] leading-snug">
          본 계약은 당사자 간의 자유로운 의사에 의해 작성되었으며, '을'은 작성된 근로계약서 1부를 교부받았음을 확인합니다.
        </div>
        <div className="flex items-end gap-1">
          <span className="text-[11px] font-bold text-slate-800">수령자 성명:</span>
          <span className="text-[11.5px] font-black text-slate-900 border-b border-slate-500 px-2 min-w-[70px] text-center">
            {form.employeeName || " "}
          </span>
          <div className="w-[120px] h-[32px] border-b-2 border-slate-500 flex items-end justify-center">
            {receiptSignUrl && (
              <img src={receiptSignUrl} alt="수령자 서명" className="max-h-[32px] max-w-full object-contain" />
            )}
          </div>
          <span className="text-[10px] text-slate-500 font-semibold pb-1">(서명)</span>
        </div>
      </div>

      {/* 계약일 (년/월/일) 크게 · 도장 위치 */}
      <div className="mt-3 flex items-center justify-center gap-3 text-[18px] font-black tracking-widest text-slate-900">
        <span className="tabular-nums">{csY || "20__"}</span>
        <span>년</span>
        <span className="tabular-nums">{typeof csM === "number" ? csM : "__"}</span>
        <span>월</span>
        <span className="tabular-nums">{typeof csD === "number" ? csD : "__"}</span>
        <span>일</span>
      </div>

      {/* 사업주 (갑) · 근로자 (을) 정보 · 하단 2열 (이미지 재현) */}
      <table className="w-full border-collapse border-2 border-slate-800 text-[11.5px] mt-3">
        <tbody>
          {/* 사업주 (갑) */}
          <tr>
            <td className="border-b border-r border-slate-500 p-0 w-[32px]">
              <VerticalLabel minH={72}>사용자 갑</VerticalLabel>
            </td>
            <td className="border-b border-slate-500 px-2 py-1.5 align-top">
              <div className="grid grid-cols-[70px,1fr,70px,1fr,80px] gap-1 items-center">
                <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">상호</div>
                <div className="border-b border-slate-400 px-2 py-0.5 font-semibold">{form.companyName || "-"}</div>
                <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">대표</div>
                <div className="border-b border-slate-400 px-2 py-0.5 font-semibold">{form.employerName || "-"}</div>
                <div className="relative flex items-center justify-center h-[42px]">
                  {employerSignUrl ? (
                    <img src={employerSignUrl} alt="사업주 도장/서명" className="max-h-[40px] max-w-[76px] object-contain" />
                  ) : (
                    <span className="inline-flex items-center justify-center w-[42px] h-[42px] rounded-full border-2 border-rose-500 text-rose-500 text-[10px] font-black">
                      (도장)
                    </span>
                  )}
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
              <div className="grid grid-cols-[70px,1fr,70px,1fr,80px] gap-1 items-center">
                <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">주민번호</div>
                <div className="border-b border-slate-400 px-2 py-0.5 font-semibold tabular-nums">{form.employeeBirth || "-"}</div>
                <div className="bg-slate-100 border border-slate-300 px-1 py-0.5 text-center font-black">성명</div>
                <div className="border-b border-slate-400 px-2 py-0.5 font-semibold">{form.employeeName || "-"}</div>
                <div className="flex items-end justify-center h-[42px]">
                  {employeeSignUrl ? (
                    <img src={employeeSignUrl} alt="근로자 서명" className="max-h-[40px] max-w-[76px] object-contain" />
                  ) : (
                    <span className="inline-flex items-center justify-center w-[42px] h-[42px] rounded-full border-2 border-slate-400 text-slate-400 text-[10px] font-black">
                      (서명)
                    </span>
                  )}
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

      {/* CCTV/개인정보 동의 · 이미지 재현 (별도 표) */}
      <table className="w-full border-collapse border-2 border-slate-800 text-[11px] mt-3">
        <tbody>
          <tr>
            <td className="border-b border-r border-slate-500 p-0 w-[32px]" rowSpan={5}>
              <VerticalLabel minH={220}>개인정보 CCTV 설치 이용 대한 동의</VerticalLabel>
            </td>
            <td className="border-b border-r border-slate-500 bg-slate-100 px-2 py-1 text-center font-black w-[22%]">
              정보의 수집·이용 목적 <br /><span className="text-[10px] text-slate-600">(CCTV 설치 포함)</span>
            </td>
            <td className="border-b border-r border-slate-500 px-2 py-1 text-slate-800 align-top">
              당사자 인적사항관리 · 회사 안전관리 · 사업장 사고예방 및 범죄예방
            </td>
            <td className="border-b border-r border-slate-500 bg-slate-100 px-2 py-1 text-center font-black w-[18%]">
              정보 보유 및 이용기간
            </td>
            <td className="border-b border-slate-500 px-2 py-1 text-slate-800 align-top">
              근로계약이 유지되는 기간 · CCTV 화상영상 정보인 경우 90일 정기간, 기존 영상정보에서 삭제
            </td>
          </tr>
          <tr>
            <td className="border-b border-r border-slate-500 bg-slate-100 px-2 py-1 text-center font-black">
              개인정보의 항목
            </td>
            <td className="border-b border-slate-500 px-2 py-1 text-slate-800 align-top" colSpan={3}>
              성명, 주민번호, 주소, 생년월일, 이메일, 휴대전화번호 등 연락처 · 기타, 근로계약 관련 개인정보
            </td>
          </tr>
          <tr>
            <td className="border-b border-r border-slate-500 bg-slate-100 px-2 py-1 text-center font-black">
              CCTV 촬영시간 및 범위
            </td>
            <td className="border-b border-slate-500 px-2 py-1 text-slate-800 align-top" colSpan={3}>
              촬영시간: 24시간 연속 촬영 및 녹화 · 촬영범위: 출입구 및 복도, 사업장 내 건물 내 주요 시설
              <br />
              3자에 제공하지 않으며, CCTV 설치 상 지 목적으로 이용하지 않는 3자에 정보를 공하지 않는다.
            </td>
          </tr>
          <tr>
            <td className="border-b border-slate-500 bg-amber-50/40 px-2 py-1 text-slate-800 align-top text-[10.5px]" colSpan={4}>
              위 내용을 충분히 인지하고 · 개인정보의 수집 및 CCTV 설치 이용에 동의합니다.
              <br />
              개인정보의 수집이 및 CCTV 설치에 동의를 거부할 불이익이 없습니다.
            </td>
          </tr>
          <tr>
            <td className="border-slate-500 px-2 py-1 align-middle text-[11px]" colSpan={4}>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1">
                  <SpanBox checked={form.privacyConsent.agreedCollection} />
                  <span>개인정보 수집·이용에 동의합니다</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <SpanBox checked={form.privacyConsent.agreedCCTV} />
                  <span>CCTV 촬영·이용에 동의합니다</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <SpanBox checked={!form.privacyConsent.agreedCollection && !form.privacyConsent.agreedCCTV} />
                  <span>(동의하지 않음)</span>
                </label>
                <div className="ml-auto flex items-end gap-1">
                  <span className="text-[11px] text-slate-700 font-bold">동의인:</span>
                  <span className="text-[11.5px] font-black text-slate-900 border-b border-slate-500 px-2 min-w-[70px] text-center">
                    {form.privacyConsent.recipientName || form.employeeName || " "}
                  </span>
                  <div className="w-[130px] h-[32px] border-b-2 border-slate-500 flex items-end justify-center">
                    {privacySignUrl && (
                      <img src={privacySignUrl} alt="CCTV/개인정보 동의 서명" className="max-h-[32px] max-w-full object-contain" />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-semibold pb-1">(서명)</span>
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
// #220 · 연장 모달
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
  const [form, setForm] = useState<ContractForm>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return { ...emptyForm(), ...parsed } as ContractForm;
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

  // 서명 pad refs (7개 · 사용자 요구)
  const employerPadRef = useRef<SignatureCanvasType | null>(null);
  const employeePadRef = useRef<SignatureCanvasType | null>(null);
  const privacyPadRef = useRef<SignatureCanvasType | null>(null);
  const contractDatePadRef = useRef<SignatureCanvasType | null>(null);
  const specialWorkPadRef = useRef<SignatureCanvasType | null>(null);
  const severancePadRef = useRef<SignatureCanvasType | null>(null);
  const receiptPadRef = useRef<SignatureCanvasType | null>(null);

  const [employerSignUrl, setEmployerSignUrl] = useState<string | null>(null);
  const [employeeSignUrl, setEmployeeSignUrl] = useState<string | null>(null);
  const [privacySignUrl, setPrivacySignUrl] = useState<string | null>(null);
  const [contractDateSignUrl, setContractDateSignUrl] = useState<string | null>(null);
  const [specialWorkSignUrl, setSpecialWorkSignUrl] = useState<string | null>(null);
  const [severanceSignUrl, setSeveranceSignUrl] = useState<string | null>(null);
  const [receiptSignUrl, setReceiptSignUrl] = useState<string | null>(null);

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
    } catch {
      // silent
    } finally {
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

  // 계약체결일 = 시작일 (사용자가 수동으로 바꾼 것 없으면 유지)
  useEffect(() => {
    setForm(prev => (prev.contractSignDate ? prev : { ...prev, contractSignDate: prev.startDate || todayIso() }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chosenDaysCount = useMemo(() => DAYS.filter(d => form.workDays[d]).length, [form.workDays]);

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
      Number(form.weeklyDays) || 0,
    );
  }, [form.startTime, form.endTime, form.breakMinutes, form.weeklyDays]);

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

  // 서명 pad 초기화 · 전체
  const clearAllSignatures = useCallback(() => {
    employerPadRef.current?.clear();
    employeePadRef.current?.clear();
    privacyPadRef.current?.clear();
    contractDatePadRef.current?.clear();
    specialWorkPadRef.current?.clear();
    severancePadRef.current?.clear();
    receiptPadRef.current?.clear();
    setEmployerSignUrl(null);
    setEmployeeSignUrl(null);
    setPrivacySignUrl(null);
    setContractDateSignUrl(null);
    setSpecialWorkSignUrl(null);
    setSeveranceSignUrl(null);
    setReceiptSignUrl(null);
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

  // 서명 URL 갱신
  const refreshSignaturePreview = () => {
    try {
      const capture = (ref: React.MutableRefObject<SignatureCanvasType | null>) =>
        ref.current && !ref.current.isEmpty() ? ref.current.toDataURL("image/png") : null;
      setEmployerSignUrl(capture(employerPadRef));
      setEmployeeSignUrl(capture(employeePadRef));
      setPrivacySignUrl(capture(privacyPadRef));
      setContractDateSignUrl(capture(contractDatePadRef));
      setSpecialWorkSignUrl(capture(specialWorkPadRef));
      setSeveranceSignUrl(capture(severancePadRef));
      setReceiptSignUrl(capture(receiptPadRef));
    } catch {
      // no-op
    }
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

  // 서명 상태 (7개) · URL 캐시 기준 (refresh 필수) · 승인 활성/진행률 UI 용도
  const signatureStatus = useMemo(() => {
    const urls = [
      employerSignUrl, employeeSignUrl, privacySignUrl,
      contractDateSignUrl, specialWorkSignUrl, severanceSignUrl, receiptSignUrl,
    ];
    const filled = urls.filter(Boolean).length;
    return { filled, total: 7 };
  }, [
    employerSignUrl, employeeSignUrl, privacySignUrl,
    contractDateSignUrl, specialWorkSignUrl, severanceSignUrl, receiptSignUrl,
  ]);

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
    // 서명 검증 · 7개 pad 실시간 확인 (URL 이 아닌 pad ref 기준)
    const padList: Array<[string, React.MutableRefObject<SignatureCanvasType | null>]> = [
      ["사업주", employerPadRef],
      ["근로자 (하단)", employeePadRef],
      ["개인정보/CCTV", privacyPadRef],
      ["계약체결일", contractDatePadRef],
      ["특별근로 동의", specialWorkPadRef],
      ["퇴직급 동의", severancePadRef],
      ["수령자 확인", receiptPadRef],
    ];
    const missing = padList.filter(([, ref]) => !ref.current || ref.current.isEmpty()).map(([n]) => n);
    if (missing.length > 0) {
      if (opts.requireAllSignatures) {
        setNotice({ tone: "err", text: `서명 누락 (${missing.length}/7): ${missing.join(" · ")}` });
        return false;
      } else {
        if (!window.confirm(`서명이 ${missing.length}/7 비어있습니다:\n${missing.join(" · ")}\n\n서명 없이 PDF를 생성하시겠습니까?`)) return false;
      }
    }
    return true;
  };

  // 계약 완료 → PDF 로컬 저장
  const handleComplete = async () => {
    setNotice(null);
    if (!validateBeforeAction({ requireAllSignatures: false })) return;
    refreshSignaturePreview();
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
    refreshSignaturePreview();
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

  // 승인 활성 조건 · 7 pad 모두 채워야 함 (URL 기준 · refresh 필요)
  const canApprove = signatureStatus.filled === signatureStatus.total;

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

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-3 sm:px-5 py-5 flex flex-col gap-4">
        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <NotePencil size={20} weight="fill" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-800 leading-none">근로계약서 작성 · 코스트팜 양식</h1>
              <p className="text-xs text-slate-500 mt-1">좌측 폼 · 우측 이미지 재현 계약서. 7개 서명 지점 채우고 [계약완료 승인].</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {existingContract && existingContract.end_date && (
              <button
                type="button"
                onClick={() => {
                  const prevMonths = contractPeriodMonthsClient(existingContract.start_date, existingContract.end_date);
                  setExtendMonths(prevMonths != null && prevMonths > 0 ? String(prevMonths) : "3");
                  setExtendModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-sm font-bold transition-colors cursor-pointer shadow-sm"
                title={`기존 계약 (${existingContract.start_date ?? "-"} ~ ${existingContract.end_date}) 을 이어서 연장`}
              >
                <ClockCounterClockwise size={14} weight="fill" />
                <span>연장</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleReset}
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
              <a
                href={existingContract.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
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
          <div
            className={`rounded-lg border px-3 py-2 text-sm font-semibold flex items-center gap-2 ${
              notice.tone === "ok"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-rose-50 text-rose-700 border-rose-200"
            }`}
          >
            {notice.tone === "ok" ? <Check size={14} weight="bold" /> : <Warning size={14} weight="fill" />}
            {notice.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── 좌측: 폼 ── */}
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col gap-3 order-1">
            <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-100">
              <ClipboardText size={15} weight="fill" className="text-emerald-600" />
              <h2 className="text-[13px] font-black text-slate-800">계약 조건 입력</h2>
            </div>

            {/* 근로자 정보 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<User size={12} weight="fill" className="text-slate-400" />}>근로자 정보</FieldLabel>
              {empError && <div className="text-[12px] text-rose-600">{empError}</div>}
              <div className="grid grid-cols-2 gap-1.5">
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
                    placeholder={empLoading ? "직원 불러오는 중..." : "성명 입력 → 검색"}
                    autoComplete="off"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                  />
                  {empSearchOpen && form.employeeName.trim() && (() => {
                    const q = form.employeeName.trim().toLowerCase();
                    const matches = employees
                      .filter(e => (e.name ?? "").toLowerCase().includes(q))
                      .slice(0, 8);
                    if (matches.length === 0) return (
                      <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-[12px] text-slate-400 text-center">
                        일치하는 직원 없음 · 직접 입력 가능
                      </div>
                    );
                    return (
                      <ul className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                        {matches.map(e => (
                          <li key={e.id}>
                            <button
                              type="button"
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => {
                                onSelectEmployee(String(e.id));
                                setEmpSearchOpen(false);
                              }}
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
                <input
                  type="text"
                  value={form.employeeBirth}
                  onChange={(e) => upd("employeeBirth", e.target.value)}
                  placeholder="주민번호 (970302-2002227)"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
              </div>
              <input
                type="text"
                value={form.employeePhone}
                onChange={(e) => upd("employeePhone", e.target.value)}
                placeholder="연락처 (010-1234-5678)"
                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
              />
              <input
                type="text"
                value={form.employeeAddress}
                onChange={(e) => upd("employeeAddress", e.target.value)}
                placeholder="주소"
                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={form.employeeBankAccount}
                  onChange={(e) => upd("employeeBankAccount", e.target.value)}
                  placeholder="은행 / 계좌번호 (선택)"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[11px]"
                />
                <input
                  type="text"
                  value={form.employeeEmail}
                  onChange={(e) => upd("employeeEmail", e.target.value)}
                  placeholder="이메일 (선택)"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[11px]"
                />
              </div>

              {/* 카테고리 + 연차 */}
              <div className="flex items-center gap-1">
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
                    className="w-14 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[14px] text-slate-800 font-semibold text-right focus:outline-none focus:border-emerald-500 focus:shadow-sm transition"
                  />
                  <span className="text-[11px] text-slate-400 font-semibold">일</span>
                </div>
              </div>
              {form.employeeCategory === "기타" && (
                <input type="text" value={form.employeeCategoryCustom} onChange={(e) => upd("employeeCategoryCustom", e.target.value)}
                  placeholder="기타 직군 자유 입력 (예: 인턴약사 · 청소 · 배송)"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
              )}
              {(form.employeeCategory === "매장" || form.employeeCategory === "창고") && (
                <div className="mt-1 rounded-lg border border-indigo-100 bg-indigo-50/40 px-2 py-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-black text-indigo-700 shrink-0">우선업무</span>
                  <div className="flex items-center gap-1">
                    {(["매장", "창고"] as const).map(f => {
                      const active = form.primaryFocus === f;
                      const activeCls = f === "매장"
                        ? "bg-emerald-500 text-white border-emerald-600"
                        : "bg-orange-500 text-white border-orange-600";
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
                      className="w-14 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-[13px] text-slate-800 font-black text-right focus:outline-none focus:border-indigo-500 focus:shadow-sm transition disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    <span className="text-[11px] text-indigo-700 font-bold">% 비중</span>
                  </div>
                </div>
              )}
            </div>

            {/* 계약 유형 · 근무 요일 · 주 근무 횟수 */}
            <div className="flex flex-wrap gap-3 items-start">
              <div className="flex flex-col gap-1.5 min-w-[140px] flex-1">
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
              <div className="flex flex-col gap-1 min-w-[200px] flex-[2]">
                <FieldLabel icon={<CalendarBlank size={12} weight="fill" className="text-slate-400" />} required>근무 요일</FieldLabel>
                <div className="flex flex-wrap gap-1">
                  {DAYS.map(d => {
                    const on = form.workDays[d];
                    const isWeekend = d === "토" || d === "일";
                    return (
                      <button key={d} type="button" onClick={() => toggleDay(d)}
                        className={[
                          "min-w-[34px] px-2 py-1 rounded-lg text-[12px] font-black transition-colors cursor-pointer border",
                          on
                            ? isWeekend
                              ? "bg-rose-500 text-white border-rose-600"
                              : "bg-emerald-500 text-white border-emerald-600"
                            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50",
                        ].join(" ")}
                      >{d}</button>
                    );
                  })}
                  <span className="text-[11px] text-slate-400 font-semibold self-center ml-1">선택 {chosenDaysCount}일</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 min-w-[110px] flex-1">
                <span className="text-[12px] text-slate-500 font-semibold leading-none">주 근무 횟수</span>
                <SelectOrCustom value={form.weeklyDays} options={WEEKLY_DAYS} onChange={(v) => upd("weeklyDays", v)} suffix="일" placeholder="예: 2.5" />
              </div>
            </div>

            {/* 근무 시간 + 월 근로시간 자동계산 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<ClockClockwise size={12} weight="fill" className="text-slate-400" />} required>근무 시간</FieldLabel>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <div className="text-[11px] text-slate-400 font-semibold mb-0.5">시작</div>
                  <SelectOrCustom value={form.startTime} options={START_TIMES} onChange={(v) => upd("startTime", v)} placeholder="HH:MM" />
                </div>
                <div className="flex-1">
                  <div className="text-[11px] text-slate-400 font-semibold mb-0.5">종료</div>
                  <SelectOrCustom value={form.endTime} options={END_TIMES} onChange={(v) => upd("endTime", v)} placeholder="HH:MM" />
                </div>
                <div className="flex items-center gap-1 pb-0.5">
                  <Coffee size={12} className="text-slate-400 shrink-0" />
                  <input type="number" min={0} value={form.breakMinutes} onChange={(e) => upd("breakMinutes", e.target.value)}
                    className="w-14 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition text-right"
                  />
                  <span className="text-[11px] text-slate-400 font-semibold">분</span>
                </div>
              </div>

              {/* 월 근로시간 자동계산 배지 */}
              {monthlyCalc && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5 flex items-center gap-2 text-[12px]">
                  <Calculator size={13} weight="fill" className="text-emerald-700" />
                  <span className="text-emerald-800 font-black">월 근로시간</span>
                  <span className="tabular-nums text-emerald-900 font-black">
                    {monthlyCalc.monthlyHoursInt}시간 {monthlyCalc.monthlyMinutesRem}분
                  </span>
                  <span className="text-[10.5px] text-slate-500">
                    (일 {Math.floor(monthlyCalc.dailyMinutes/60)}시간 {monthlyCalc.dailyMinutes%60}분 × 주 {form.weeklyDays}일 × 4.345주)
                  </span>
                  <button
                    type="button"
                    onClick={applyMonthlyHoursToBasic}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[11px] font-black hover:bg-emerald-700 transition-colors cursor-pointer shadow-sm"
                    title="계산된 월 근로시간을 임금표의 기본급 시간에 반영"
                  >
                    기본급 시간에 반영
                  </button>
                </div>
              )}
            </div>

            {/* 시급 / 임금 구성 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <FieldLabel icon={<Money size={12} weight="fill" className="text-slate-400" />} required>시급 / 임금 구성</FieldLabel>
                <label className="inline-flex items-center gap-1 cursor-pointer select-none mb-1.5">
                  <input type="checkbox" checked={form.useWageComponents} onChange={(e) => upd("useWageComponents", e.target.checked)}
                    className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer" />
                  <span className="text-[11px] font-black text-indigo-700">임금 구성표 (월급제)</span>
                </label>
              </div>
              {!form.useWageComponents && (
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <div className="text-[11px] text-slate-400 font-semibold mb-0.5">주중</div>
                    <div className="relative">
                      <input type="text" inputMode="numeric" value={form.weekdayHourly}
                        onChange={(e) => upd("weekdayHourly", e.target.value.replace(/[^0-9]/g, ""))}
                        className="w-full bg-white border border-slate-200 rounded-lg pl-2 pr-7 py-1.5 text-[12px] text-slate-800 font-black focus:outline-none focus:border-emerald-500 focus:shadow-sm transition text-right"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-semibold pointer-events-none">원</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 font-semibold mb-0.5">주말</div>
                    <div className="relative">
                      <input type="text" inputMode="numeric" value={form.weekendHourly}
                        onChange={(e) => upd("weekendHourly", e.target.value.replace(/[^0-9]/g, ""))}
                        className="w-full bg-white border border-slate-200 rounded-lg pl-2 pr-7 py-1.5 text-[12px] text-slate-800 font-black focus:outline-none focus:border-emerald-500 focus:shadow-sm transition text-right"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-semibold pointer-events-none">원</span>
                    </div>
                  </div>
                </div>
              )}
              {form.useWageComponents && (
                <WageComponentsForm wage={form.wageComponents} onChange={(next) => upd("wageComponents", next)} />
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] text-slate-500 font-semibold shrink-0">임금지급일</span>
                <input type="text" value={form.paymentDayText} onChange={(e) => upd("paymentDayText", e.target.value)}
                  placeholder="예: 매월 1일부터 당월 말일까지 임금은 익월 5일에 지급"
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* 계약 기간 + 계약체결일 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel required>계약 기간</FieldLabel>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-slate-500 font-semibold shrink-0 w-[60px]">시작일</span>
                <input type="date" value={form.startDate} onChange={(e) => upd("startDate", e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-slate-500 font-semibold shrink-0 w-[60px]">종료일</span>
                <input type="date" value={form.endDate} onChange={(e) => upd("endDate", e.target.value)} disabled={form.indefinite}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              </div>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.indefinite} onChange={(e) => upd("indefinite", e.target.checked)}
                  className="w-4 h-4 accent-emerald-600" />
                <span className="text-[12px] font-semibold text-slate-700">무기한 (기간의 정함 없음 · 정규직)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-slate-500 font-semibold shrink-0 w-[60px]">계약체결일</span>
                <input type="date" value={form.contractSignDate} onChange={(e) => upd("contractSignDate", e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition"
                />
              </div>
            </div>

            {/* 담당 업무 */}
            <div className="flex flex-col gap-1">
              <FieldLabel required>담당 업무</FieldLabel>
              <input type="text" value={form.jobDuty} onChange={(e) => upd("jobDuty", e.target.value)}
                placeholder="예: 약국 카운터 · OTC 판매"
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
              />
            </div>

            {/* 4대보험 */}
            <div>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.socialInsurance} onChange={(e) => upd("socialInsurance", e.target.checked)}
                  className="w-4 h-4 accent-emerald-600" />
                <span className="text-[12px] font-bold text-slate-700">4대보험 가입 (고용·산재·국민연금·건강보험)</span>
              </label>
            </div>

            {/* 추가 내용 */}
            <div className="flex flex-col gap-1">
              <FieldLabel icon={<Notepad size={12} weight="fill" className="text-slate-400" />}>추가 특약</FieldLabel>
              <textarea value={form.additionalContent} onChange={(e) => upd("additionalContent", e.target.value)} rows={3}
                placeholder="계약서에 추가로 명시할 내용 (예: 수습기간 3개월 · 명절 상여 별도 등)"
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition resize-y placeholder:text-slate-400 placeholder:text-[12px]"
              />
            </div>

            {/* CCTV/개인정보 동의 */}
            <div className="flex flex-col gap-1.5 rounded-lg border border-amber-200 bg-amber-50/40 p-2">
              <div className="text-[11px] font-black text-amber-800 flex items-center gap-1">
                <Warning size={11} weight="fill" />
                개인정보 수집·이용 및 CCTV 동의
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input type="text" value={form.privacyConsent.recipientName}
                  onChange={(e) => upd("privacyConsent", { ...form.privacyConsent, recipientName: e.target.value })}
                  placeholder="수령자 성명 (미입력 시 근로자명 사용)"
                  className="bg-white border border-slate-200 rounded-md px-2 py-1 text-[12px] text-slate-800 font-semibold focus:outline-none focus:border-amber-500 transition placeholder:text-slate-400 placeholder:text-[11px]"
                />
                <input type="text" value={form.privacyConsent.recipientAddress}
                  onChange={(e) => upd("privacyConsent", { ...form.privacyConsent, recipientAddress: e.target.value })}
                  placeholder="수령자 주소 (미입력 시 근로자 주소)"
                  className="bg-white border border-slate-200 rounded-md px-2 py-1 text-[12px] text-slate-800 font-semibold focus:outline-none focus:border-amber-500 transition placeholder:text-slate-400 placeholder:text-[11px]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={form.privacyConsent.agreedCollection}
                    onChange={(e) => upd("privacyConsent", { ...form.privacyConsent, agreedCollection: e.target.checked })}
                    className="w-3.5 h-3.5 accent-amber-600 cursor-pointer" />
                  <span className="text-[11px] font-bold text-slate-700">개인정보 수집·이용 동의</span>
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={form.privacyConsent.agreedCCTV}
                    onChange={(e) => upd("privacyConsent", { ...form.privacyConsent, agreedCCTV: e.target.checked })}
                    className="w-3.5 h-3.5 accent-amber-600 cursor-pointer" />
                  <span className="text-[11px] font-bold text-slate-700">CCTV 촬영·이용 동의</span>
                </label>
              </div>
            </div>
          </section>

          {/* ── 우측: 프리뷰 + 서명 ── */}
          <section className="order-2 flex flex-col gap-3">
            <div className="flex items-center gap-1.5 pb-1">
              <NotePencil size={16} weight="fill" className="text-emerald-600" />
              <h2 className="text-sm font-black text-slate-800">계약서 미리보기</h2>
              <span className="text-[11px] text-slate-400 font-semibold ml-1">(우측 화면 그대로 PDF로 저장됩니다)</span>
            </div>

            {/* 서명 진행률 · 7 지점 */}
            <div className={`rounded-lg border px-3 py-2 flex items-center gap-3 ${
              canApprove ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
            }`}>
              <div className="flex items-center gap-1.5 shrink-0">
                {canApprove ? <Check size={14} weight="bold" className="text-emerald-600" /> : <Signature size={14} weight="fill" className="text-slate-500" />}
                <span className={`text-[12px] font-black ${canApprove ? "text-emerald-700" : "text-slate-700"}`}>
                  서명 {signatureStatus.filled} / {signatureStatus.total} 지점
                </span>
              </div>
              <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div className={`h-full transition-all ${canApprove ? "bg-emerald-500" : "bg-indigo-400"}`}
                  style={{ width: `${Math.round((signatureStatus.filled / signatureStatus.total) * 100)}%` }}
                />
              </div>
              <button type="button" onClick={refreshSignaturePreview}
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold transition-colors cursor-pointer"
                title="서명을 우측 프리뷰에 반영"
              >
                <ArrowsClockwise size={11} />
                반영
              </button>
            </div>

            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 sm:p-4">
              <ContractPreview
                ref={previewRef}
                form={form}
                employerSignUrl={employerSignUrl}
                employeeSignUrl={employeeSignUrl}
                privacySignUrl={privacySignUrl}
                contractDateSignUrl={contractDateSignUrl}
                specialWorkSignUrl={specialWorkSignUrl}
                severanceSignUrl={severanceSignUrl}
                receiptSignUrl={receiptSignUrl}
              />
            </div>

            {/* 서명 영역 · 7 지점 */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Signature size={14} weight="fill" className="text-slate-500" />
                  <span className="text-[13px] font-bold text-slate-700">서명 (7 지점)</span>
                </div>
                <button type="button" onClick={refreshSignaturePreview}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[12px] font-bold transition-colors cursor-pointer"
                  title="위 계약서 프리뷰에 서명 반영"
                >
                  <ArrowsClockwise size={12} />
                  미리보기 반영
                </button>
              </div>

              {/* 상단 2 · 사업주 + 근로자 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SignArea label="1. 사업주 (갑)" padRef={employerPadRef} color="emerald" />
                <SignArea label="2. 근로자 (을) 하단" padRef={employeePadRef} color="indigo" />
              </div>

              {/* 중단 · 조항 서명 4개 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <SignArea label="3. 계약체결일" padRef={contractDatePadRef} color="amber" height={70} compact />
                <SignArea label="4. 특별근로 동의" padRef={specialWorkPadRef} color="amber" height={70} compact />
                <SignArea label="5. 퇴직급 동의" padRef={severancePadRef} color="amber" height={70} compact />
                <SignArea label="6. 수령자 확인" padRef={receiptPadRef} color="amber" height={70} compact />
              </div>

              {/* 하단 · CCTV */}
              <div>
                <SignArea label="7. 개인정보/CCTV 동의" padRef={privacyPadRef} color="rose" />
              </div>

              {/* 완료 버튼 */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-100">
                <div className="flex-1 flex flex-col gap-1">
                  <button type="button" onClick={handleApproveAndSave} disabled={generating || !canApprove}
                    className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white text-[15px] font-black shadow-md transition-all cursor-pointer disabled:cursor-not-allowed
                      ${canApprove && !generating
                        ? "bg-gradient-to-r from-rose-500 via-fuchsia-500 to-emerald-500 hover:brightness-110 hover:shadow-lg"
                        : "bg-slate-300 text-slate-500"}`}
                    title={canApprove ? "계약 승인 · DB 저장 + PDF 다운" : "7 지점 서명을 모두 채워야 활성화됩니다"}
                  >
                    <Check size={16} weight="bold" />
                    <span>{generating ? "저장 중..." : "계약완료 승인 (DB 저장)"}</span>
                  </button>
                  {!canApprove && (
                    <span className="text-[11px] text-slate-500 font-semibold text-center sm:text-left">
                      7 지점 서명 후 [반영] 버튼을 눌러 프리뷰에 반영 · 승인 활성화
                    </span>
                  )}
                </div>
                <button type="button" onClick={saveDraft}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[12px] font-black shadow-sm transition-colors cursor-pointer whitespace-nowrap"
                  title="현재 작성 내용을 브라우저에 저장 (다음 방문 시 복원)"
                >
                  임시저장
                  {draftSavedAt && (
                    <span className="text-[10px] font-normal text-emerald-600 ml-1">
                      · {new Date(draftSavedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </button>
                <button type="button" onClick={handleComplete} disabled={generating}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-bold shadow-sm transition-colors cursor-pointer whitespace-nowrap"
                  title="PDF 로컬 다운로드 (승인 없이)"
                >
                  <DownloadSimple size={14} weight="bold" />
                  <span>{generating ? "생성 중..." : "PDF 다운로드"}</span>
                </button>
              </div>
            </div>
          </section>
        </div>
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
    </div>
  );
};

export default ContractWriterPage;
