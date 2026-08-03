// src/components/ContractWriterPage/ContractWriterPage.tsx
// 근로계약서 작성 페이지 · 2026-08-03 · #165 · #200
// - 좌측: 조건 입력 폼 (직원·계약유형·근무요일·주근무횟수·시간·시급·기간·업무·4대보험·추가내용)
// - 우측: 실시간 표준 근로계약서 렌더 + 조항별 이해확인 체크박스·마이크로 서명 (은행 스타일) + 최종 서명 2개
// - [계약 완료 · PDF 다운] · html2canvas + jsPDF · 서명 포함 · 파일명: 근로계약서_{직원명}_{시작일}.pdf
// - 드롭박스 기본 · "직접 입력" 옵션 · input 전환 · 모든 필드 자유 편집
// - 반응형: 모바일 상하 스택 · 데스크탑 좌우 split (lg:)
// - embedded 모드 · BusinessManagePage 임베드 시 자체 AppNavHeader skip
// #200 · 은행 스타일 조항별 이해 확인 (DocuSign initial + 한국 금융권 개별약관 동의 패턴 참고):
//   - 각 조항 오른쪽에 컴팩트 확인 영역 (~140px) · [ ] 이해했음 체크박스 + 60x30 mini signature pad
//   - 서명 시 자동 체크 · 지우기 미니 버튼
//   - 미확인 dashed rose / 확인 solid emerald
//   - 하단 진행률 badge (N/M 조항 확인) · 100% 완료 시 emerald 강조
//   - PDF 캡처 시 프리뷰 내부에 이미 canvas 포함 · html2canvas 가 자연스럽게 렌더
//   - 좌측 대형 서명 canvas 2개 · 최종 서명(사업주·근로자)으로 우측 계약서 하단에 유지
// 준수 원칙:
//   - feedback_ui_principles: 리스트 아니라 폼이라 3원칙 자체는 미해당 · 카테고리 색상 팔레트는 유지
//   - feedback_ui_consult: 통일된 디자인 (slate + emerald/indigo 팔레트 · rounded-xl · shadow-sm)
//   - iOS/Gemini · 이 파일에서 절대 참조 안 함
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NotePencil, User, ClipboardText, CalendarBlank, ClockClockwise, Money,
  Coffee, Notepad, Eraser, DownloadSimple, ArrowsClockwise, Warning, Check,
  Buildings, Signature,
} from "@phosphor-icons/react";
import SignaturePad from "react-signature-canvas";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import type { AuthSession, Employee } from "../../types";
import {
  loadContractSettings,
  DEFAULT_CONTRACT_SETTINGS,
  type ContractCategory,
} from "../ContractSettingsPage/ContractSettingsPage";

// react-signature-canvas · 기본 export 가 SignatureCanvas 클래스 · ref 타입 별칭
type SignatureCanvasType = SignaturePad;

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────

interface ContractWriterPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** true · 자체 AppNavHeader skip (BusinessManagePage 임베드용) */
  embedded?: boolean;
}

type DayKey = "월" | "화" | "수" | "목" | "금" | "토" | "일";

interface ContractForm {
  // 직원
  employeeId: number | null;
  employeeName: string;         // 직접 입력도 가능 (자동 채움 + 편집 가능)
  employeePhone: string;
  employeeAddress: string;
  employeeBirth: string;         // 주민번호 앞자리 or 생년월일 (자유 입력)

  // 계약 유형
  contractType: string;          // 정규직/계약직/알바/일용/인턴 · 자유 입력

  // 계약직 · 개월수 (선택 시 startDate + N개월 → endDate 자동)
  contractMonths: string;        // "3" | "6" | "12" | "24" | 자유 입력

  // 근무 요일 (체크박스)
  workDays: Record<DayKey, boolean>;

  // 주 근무 횟수 (드롭박스 · 직접 입력)
  weeklyDays: string;            // "3" | "4" | "5" | "6" | 자유 입력

  // 근무 시간
  startTime: string;             // "09:00" 등
  endTime: string;               // "18:00" 등
  breakMinutes: string;          // 휴게 분

  // 시급
  weekdayHourly: string;         // 원
  weekendHourly: string;         // 원

  // 계약 기간
  startDate: string;             // YYYY-MM-DD
  endDate: string;               // YYYY-MM-DD or "" (무기한)
  indefinite: boolean;           // 무기한

  // 업무
  jobDuty: string;

  // 4대보험
  socialInsurance: boolean;

  // 추가 내용
  additionalContent: string;

  // 연차 유급휴가 (일)
  annualLeaveDays: string;

  // 직원 카테고리 (약사·사원·기타) · 기타는 자유 입력 지원
  employeeCategory: "약사" | "매장" | "창고" | "기타";
  employeeCategoryCustom: string;   // 기타 선택 시 커스텀 텍스트 (예 · 인턴약사)

  // #186 · 우선업무 · 매장/창고 선택 시 표시
  // - primaryFocus: 매장/창고 중 어느 물류에 우선순위 · null 은 미사용
  // - primaryFocusPercent: 비중 (%) · default 70
  primaryFocus: "매장" | "창고" | null;
  primaryFocusPercent: number;

  // 사업주 (기본값 · 편집 가능)
  employerName: string;          // 대표자명
  companyName: string;           // 회사명
  companyAddress: string;
  companyRegNo: string;          // 사업자등록번호
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수 (드롭박스 옵션)
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

const emptyForm = (): ContractForm => ({
  employeeId: null,
  employeeName: "",
  employeePhone: "",
  employeeAddress: "",
  employeeBirth: "",
  contractType: "정규직",
  contractMonths: "12",
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
  annualLeaveDays: "15",
  employeeCategory: "매장",
  employeeCategoryCustom: "",
  primaryFocus: "매장",           // #186 · 매장이 기본 카테고리 · 기본 우선업무는 매장
  primaryFocusPercent: 70,        // #186 · 기본 70%
  employerName: (DEFAULT_EMPLOYER.employerName as string) ?? "",
  companyName:  (DEFAULT_EMPLOYER.companyName as string) ?? "",
  companyAddress: (DEFAULT_EMPLOYER.companyAddress as string) ?? "",
  companyRegNo: (DEFAULT_EMPLOYER.companyRegNo as string) ?? "",
});

// ─────────────────────────────────────────────────────────────────────────────
// 재사용 컴포넌트: 드롭박스 + 직접입력
// ─────────────────────────────────────────────────────────────────────────────

const SelectOrCustom: React.FC<{
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  className?: string;
}> = ({ value, options, onChange, placeholder, suffix, className = "" }) => {
  // options 안에 있으면 select · 아니면 직접입력 모드
  const inList = options.includes(value);
  const [mode, setMode] = useState<"select" | "custom">(inList ? "select" : "custom");

  useEffect(() => {
    // 외부에서 value 가 바뀌면 mode 재판단 (초기화 · 리셋 대응)
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

// 필드 레이블
const FieldLabel: React.FC<{ icon?: React.ReactNode; children: React.ReactNode; required?: boolean }> = ({ icon, children, required }) => (
  <label className="text-[12px] font-bold text-slate-600 flex items-center gap-1.5 mb-1.5">
    {icon}
    <span>{children}{required && <span className="text-rose-500 ml-0.5">*</span>}</span>
  </label>
);

// ─────────────────────────────────────────────────────────────────────────────
// 서명 캔버스 래퍼 (react-signature-canvas · 마우스/터치 지원)
// ─────────────────────────────────────────────────────────────────────────────

const SignArea: React.FC<{
  label: string;
  padRef: React.MutableRefObject<SignatureCanvasType | null>;
  color?: "emerald" | "indigo";
}> = ({ label, padRef, color = "emerald" }) => {
  const [empty, setEmpty] = useState(true);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 300, h: 110 });

  // 반응형 · 부모 폭에 맞춰 canvas 크기 조정
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(200, Math.floor(e.contentRect.width) - 2);
        setSize({ w, h: 110 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleEnd = () => {
    // padRef.current 존재하면 empty 상태 재계산
    if (padRef.current) setEmpty(padRef.current.isEmpty());
  };

  const handleClear = () => {
    padRef.current?.clear();
    setEmpty(true);
  };

  const borderCls = color === "emerald" ? "border-emerald-200" : "border-indigo-200";
  const textCls   = color === "emerald" ? "text-emerald-700"  : "text-indigo-700";
  const btnCls    = color === "emerald" ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
                                        : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-black flex items-center gap-1 ${textCls}`}>
          <Signature size={13} weight="fill" />
          {label}
        </span>
        <button
          type="button"
          onClick={handleClear}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-bold transition-colors cursor-pointer ${btnCls}`}
          title="서명 지우기"
        >
          <Eraser size={11} />
          지우기
        </button>
      </div>

      <div
        ref={wrapperRef}
        className={`relative bg-white border-2 border-dashed ${borderCls} rounded-lg overflow-hidden`}
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
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-300 text-xs font-bold select-none">
            여기에 서명해 주세요
          </span>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// #200 · 조항별 이해 확인 · 마이크로 서명 패드 (은행/DocuSign initial 스타일)
//   - 60~80 x 30~40 px · 지우기 미니 버튼 · 서명 시 자동 체크
//   - padRef 는 부모에서 관리 (조항 키별 Map) · 자동 이해상태 콜백
//   - 미확인 dashed rose · 확인 solid emerald
// ─────────────────────────────────────────────────────────────────────────────

const MicroSignPad: React.FC<{
  clauseKey: string;
  checked: boolean;
  onChangeChecked: (v: boolean) => void;
  padRef: React.MutableRefObject<SignatureCanvasType | null>;
  onSignedChange?: (empty: boolean) => void;
}> = ({ clauseKey: _clauseKey, checked, onChangeChecked, padRef, onSignedChange }) => {
  const [empty, setEmpty] = useState(true);

  // 서명 시작 → 자동 체크
  const handleBegin = () => {
    setEmpty(false);
    if (!checked) onChangeChecked(true);
    onSignedChange?.(false);
  };
  const handleEnd = () => {
    const e = padRef.current ? padRef.current.isEmpty() : true;
    setEmpty(e);
    onSignedChange?.(e);
  };
  const handleClear = () => {
    padRef.current?.clear();
    setEmpty(true);
    onSignedChange?.(true);
    // 체크는 유지 (사용자 의도 존중) · 원한다면 해제하려면 아래 주석 해제
    // onChangeChecked(false);
  };

  // 상태별 색상 · 완료(checked && !empty) · 확인만(checked) · 미확인
  const isComplete = checked && !empty;
  const borderCls = isComplete
    ? "border-emerald-500 border-solid"
    : checked
      ? "border-amber-400 border-solid"
      : "border-rose-300 border-dashed";
  const bgCls = isComplete ? "bg-emerald-50/40" : "bg-white";

  return (
    <div className="flex flex-col items-stretch gap-1 w-[130px] shrink-0">
      {/* 체크박스 */}
      <label className="flex items-center gap-1 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChangeChecked(e.target.checked)}
          className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer"
        />
        <span className={`text-[10px] font-black leading-tight ${isComplete ? "text-emerald-700" : checked ? "text-amber-700" : "text-slate-500"}`}>
          이해했음
        </span>
      </label>

      {/* 서명 pad + 지우기 */}
      <div className="relative">
        <div
          className={`relative rounded-md border-2 ${borderCls} ${bgCls} overflow-hidden`}
          style={{ width: 130, height: 40 }}
        >
          <SignaturePad
            ref={(el) => { padRef.current = el; }}
            canvasProps={{
              width: 130,
              height: 40,
              className: "block touch-none",
              style: { width: "130px", height: "40px" },
            }}
            penColor="#0f172a"
            onBegin={handleBegin}
            onEnd={handleEnd}
          />
          {empty && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-bold text-slate-300 select-none">
              여기에 서명
            </span>
          )}
        </div>
        {/* 지우기 미니 버튼 */}
        <button
          type="button"
          onClick={handleClear}
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 border border-slate-200 flex items-center justify-center text-[8px] font-black leading-none transition-colors cursor-pointer"
          title="서명 지우기"
        >
          ×
        </button>
      </div>
    </div>
  );
};

// 각 조항 이해확인 상태
interface ClauseAck {
  checked: boolean;
  empty: boolean;  // 서명 empty 여부
}
type ClauseAckMap = Record<string, ClauseAck>;

// ─────────────────────────────────────────────────────────────────────────────
// 실시간 계약서 프리뷰 (우측)
// ─────────────────────────────────────────────────────────────────────────────

const ContractPreview = React.forwardRef<HTMLDivElement, {
  form: ContractForm;
  employerSignUrl: string | null;
  employeeSignUrl: string | null;
  clauseAcks: ClauseAckMap;
  setClauseAckChecked: (key: string, v: boolean) => void;
  setClauseAckEmpty: (key: string, empty: boolean) => void;
  clausePadRefs: React.MutableRefObject<Record<string, SignatureCanvasType | null>>;
}>(({ form, employerSignUrl, employeeSignUrl, clauseAcks, setClauseAckChecked, setClauseAckEmpty, clausePadRefs }, ref) => {
  const workDayText = DAYS.filter(d => form.workDays[d]).join("·") || "(선택 안 됨)";
  const startD = fmtKoreanDate(form.startDate);
  const endD = form.indefinite ? "무기한 (기간의 정함 없음)" : fmtKoreanDate(form.endDate) || "(미입력)";

  // 근무 시간 계산 (전체 · 휴게 · 실근무) · 인건비 정책과 동일 규칙
  const hoursCalc = (() => {
    const [sh, sm] = form.startTime.split(":").map(Number);
    const [eh, em] = form.endTime.split(":").map(Number);
    if (!Number.isFinite(sh) || !Number.isFinite(eh)) return null;
    const rawMin = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
    if (rawMin <= 0) return null;
    const breakMin = Number(form.breakMinutes) || 0;
    const paidMin = Math.max(0, rawMin - breakMin);
    const fmt = (min: number) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
    };
    return { rawText: fmt(rawMin), paidText: fmt(paidMin), breakText: fmt(breakMin) };
  })();

  return (
    <div
      ref={ref}
      className="bg-white text-slate-900 border border-slate-200 rounded-xl shadow-sm p-6 sm:p-8 mx-auto"
      style={{
        // A4 근사 (PDF 출력 안정성 · 실제 PDF 는 A4 기준으로 스케일)
        width: "100%",
        maxWidth: "780px",
        fontFamily: "'Noto Sans KR', 'Malgun Gothic', system-ui, -apple-system, 'Segoe UI', sans-serif",
        lineHeight: 1.6,
      }}
    >
      {/* 제목 */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-black tracking-wider text-slate-900" style={{ letterSpacing: "0.15em" }}>
          표 준 근 로 계 약 서
        </h2>
        <div className="mt-1.5 text-[11px] text-slate-500 font-semibold">
          (근로기준법 시행규칙 별지 제17호서식)
        </div>
      </div>

      <p className="text-[13px] text-slate-700 mb-4">
        <span className="font-bold">{form.companyName || "(사업주명)"}</span>(이하 "사업주"라 함)와(과){" "}
        <span className="font-bold">{form.employeeName || "(근로자명)"}</span>(이하 "근로자"라 함)는 다음과 같이 근로계약을 체결한다.
      </p>

      {/* 헬퍼 · ack props 생성 · 조번호를 key 로 */}
      {(() => null)()}

      <PreviewRow
        no="1"
        title="근로계약기간"
        ack={{
          clauseKey: "1",
          checked: !!clauseAcks["1"]?.checked,
          onChangeChecked: (v) => setClauseAckChecked("1", v),
          padRef: ensurePadRef(clausePadRefs, "1"),
          onSignedChange: (e) => setClauseAckEmpty("1", e),
        }}
      >
        <div>{startD || "(시작일 미입력)"} 부터 {endD} 까지</div>
        {form.indefinite && <div className="text-[11px] text-slate-500 mt-0.5">※ 기간의 정함이 없는 경우 (정규직)</div>}
      </PreviewRow>

      <PreviewRow
        no="2"
        title="근무장소"
        ack={{
          clauseKey: "2",
          checked: !!clauseAcks["2"]?.checked,
          onChangeChecked: (v) => setClauseAckChecked("2", v),
          padRef: ensurePadRef(clausePadRefs, "2"),
          onSignedChange: (e) => setClauseAckEmpty("2", e),
        }}
      >
        <div>{form.companyAddress || "(근무장소 미입력)"}</div>
      </PreviewRow>

      <PreviewRow
        no="3"
        title="업무의 내용"
        ack={{
          clauseKey: "3",
          checked: !!clauseAcks["3"]?.checked,
          onChangeChecked: (v) => setClauseAckChecked("3", v),
          padRef: ensurePadRef(clausePadRefs, "3"),
          onSignedChange: (e) => setClauseAckEmpty("3", e),
        }}
      >
        <div className="whitespace-pre-wrap">{form.jobDuty || "(업무 내용 미입력)"}</div>
      </PreviewRow>

      <PreviewRow
        no="4"
        title="소정근로시간"
        ack={{
          clauseKey: "4",
          checked: !!clauseAcks["4"]?.checked,
          onChangeChecked: (v) => setClauseAckChecked("4", v),
          padRef: ensurePadRef(clausePadRefs, "4"),
          onSignedChange: (e) => setClauseAckEmpty("4", e),
        }}
      >
        <div>
          {form.startTime || "--:--"} 부터 {form.endTime || "--:--"} 까지
          {hoursCalc && <span className="text-slate-500 text-[12px] ml-1">(총 {hoursCalc.rawText})</span>}
        </div>
        <div>
          휴게시간: {form.breakMinutes || "0"} 분
          {hoursCalc && Number(form.breakMinutes) > 0 && (
            <span className="text-slate-500 text-[12px] ml-1">({hoursCalc.breakText} · 무급)</span>
          )}
        </div>
        {hoursCalc && (
          <div className="text-[12px] text-slate-700 mt-1">
            <span className="font-semibold">실근무시간 · {hoursCalc.paidText}</span>
            <span className="text-slate-500"> (전체 {hoursCalc.rawText} − 휴게 {hoursCalc.breakText})</span>
          </div>
        )}
        <div className="text-[11px] text-slate-500 mt-0.5">
          ※ 휴게시간은 무급이며 임금 계산에서 제외됨 (근로기준법 제54조)
        </div>
      </PreviewRow>

      <PreviewRow
        no="5"
        title="근무일 / 주 근무횟수"
        ack={{
          clauseKey: "5",
          checked: !!clauseAcks["5"]?.checked,
          onChangeChecked: (v) => setClauseAckChecked("5", v),
          padRef: ensurePadRef(clausePadRefs, "5"),
          onSignedChange: (e) => setClauseAckEmpty("5", e),
        }}
      >
        <div>근무일: {workDayText}</div>
        <div>주 {form.weeklyDays || "-"}일 근무</div>
      </PreviewRow>

      <PreviewRow
        no="6"
        title="임금"
        ack={{
          clauseKey: "6",
          checked: !!clauseAcks["6"]?.checked,
          onChangeChecked: (v) => setClauseAckChecked("6", v),
          padRef: ensurePadRef(clausePadRefs, "6"),
          onSignedChange: (e) => setClauseAckEmpty("6", e),
        }}
      >
        <div>· 시간급 (주중): {fmtWon(form.weekdayHourly)} 원</div>
        <div>· 시간급 (주말): {fmtWon(form.weekendHourly)} 원</div>
        <div className="text-[12px] text-slate-600 mt-0.5">
          · 임금지급일: 매월 말일 (해당일이 휴일인 경우 전일 지급)
        </div>
        <div className="text-[12px] text-slate-600">
          · 지급방법: 근로자 명의 예금통장에 입금
        </div>
      </PreviewRow>

      <PreviewRow
        no="7"
        title="연차유급휴가"
        ack={{
          clauseKey: "7",
          checked: !!clauseAcks["7"]?.checked,
          onChangeChecked: (v) => setClauseAckChecked("7", v),
          padRef: ensurePadRef(clausePadRefs, "7"),
          onSignedChange: (e) => setClauseAckEmpty("7", e),
        }}
      >
        <div>연차유급휴가는 근로기준법에서 정하는 바에 따라 <b>연 {form.annualLeaveDays || "15"}일</b> 부여함</div>
      </PreviewRow>

      {/* #186 · 8. 담당 업무의 우선순위 (매장/창고 우선업무 · 70%) · 조건부 */}
      {form.primaryFocus && (form.employeeCategory === "매장" || form.employeeCategory === "창고") && (
        <PreviewRow
          no="8"
          title="담당 업무의 우선순위"
          ack={{
            clauseKey: "8",
            checked: !!clauseAcks["8"]?.checked,
            onChangeChecked: (v) => setClauseAckChecked("8", v),
            padRef: ensurePadRef(clausePadRefs, "8"),
            onSignedChange: (e) => setClauseAckEmpty("8", e),
          }}
        >
          <div>
            근로자는 <b>{form.primaryFocus}</b> 관련 업무에 근무시간의{" "}
            <b>{form.primaryFocusPercent}%</b> 비중을 두고 근무한다.
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            ※ 잔여 시간은 근무 상황에 따라 사업주가 지정하는 부수 업무를 수행함
          </div>
        </PreviewRow>
      )}

      {(() => {
        // 우선업무 조항 유무에 따라 이후 조 번호 동적 계산
        const hasFocus = !!(form.primaryFocus && (form.employeeCategory === "매장" || form.employeeCategory === "창고"));
        let n = hasFocus ? 9 : 8;
        const socialNo = String(n++);
        const contractTypeNo = String(n++);
        const additionalNo = form.additionalContent.trim() ? String(n++) : null;
        const grantNo = String(n++);
        const etcNo = String(n++);
        const mkAck = (key: string) => ({
          clauseKey: key,
          checked: !!clauseAcks[key]?.checked,
          onChangeChecked: (v: boolean) => setClauseAckChecked(key, v),
          padRef: ensurePadRef(clausePadRefs, key),
          onSignedChange: (e: boolean) => setClauseAckEmpty(key, e),
        });
        return (
          <>
            <PreviewRow no={socialNo} title="사회보험 적용" ack={mkAck(socialNo)}>
              <div className="flex flex-wrap gap-3 text-[13px]">
                <span className="flex items-center gap-1">
                  <SpanBox checked={form.socialInsurance} /> 고용보험
                </span>
                <span className="flex items-center gap-1">
                  <SpanBox checked={form.socialInsurance} /> 산재보험
                </span>
                <span className="flex items-center gap-1">
                  <SpanBox checked={form.socialInsurance} /> 국민연금
                </span>
                <span className="flex items-center gap-1">
                  <SpanBox checked={form.socialInsurance} /> 건강보험
                </span>
              </div>
            </PreviewRow>

            <PreviewRow no={contractTypeNo} title="계약유형" ack={mkAck(contractTypeNo)}>
              <div>{form.contractType || "(계약유형 미입력)"}</div>
            </PreviewRow>

            {additionalNo && (
              <PreviewRow no={additionalNo} title="기타 (추가 내용)" ack={mkAck(additionalNo)}>
                <div className="whitespace-pre-wrap">{form.additionalContent}</div>
              </PreviewRow>
            )}

            <PreviewRow no={grantNo} title="근로계약서 교부" ack={mkAck(grantNo)}>
              <div className="text-[12px] text-slate-700">
                사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와 관계 없이 근로자에게 교부한다.
              </div>
            </PreviewRow>

            <PreviewRow no={etcNo} title="기타" ack={mkAck(etcNo)}>
              <div className="text-[12px] text-slate-700">
                본 계약에 정함이 없는 사항은 근로기준법령에 의함.
              </div>
            </PreviewRow>
          </>
        );
      })()}

      {/* 계약일자 */}
      <div className="mt-8 text-center text-[14px] text-slate-800 font-semibold">
        {fmtKoreanDate(form.startDate) || fmtKoreanDate(todayIso())}
      </div>

      {/* 서명란 */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* 사업주 */}
        <div className="border-t-2 border-slate-800 pt-3">
          <div className="text-[13px] font-black text-slate-800 mb-2">(사업주)</div>
          <div className="text-[12px] text-slate-700 space-y-0.5">
            <div>사업체명: <span className="font-semibold">{form.companyName || "-"}</span></div>
            <div>주소: <span className="font-semibold">{form.companyAddress || "-"}</span></div>
            <div>대표자: <span className="font-semibold">{form.employerName || "-"}</span></div>
            <div>사업자등록번호: <span className="font-semibold">{form.companyRegNo || "-"}</span></div>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-[12px] text-slate-600 font-semibold">서명:</span>
            <div className="flex-1 border-b border-slate-400 h-14 flex items-end">
              {employerSignUrl && (
                <img src={employerSignUrl} alt="사업주 서명" className="max-h-14 max-w-full object-contain" />
              )}
            </div>
          </div>
        </div>

        {/* 근로자 */}
        <div className="border-t-2 border-slate-800 pt-3">
          <div className="text-[13px] font-black text-slate-800 mb-2">(근로자)</div>
          <div className="text-[12px] text-slate-700 space-y-0.5">
            <div>성명: <span className="font-semibold">{form.employeeName || "-"}</span></div>
            <div>생년월일: <span className="font-semibold">{form.employeeBirth || "-"}</span></div>
            <div>주소: <span className="font-semibold">{form.employeeAddress || "-"}</span></div>
            <div>연락처: <span className="font-semibold">{form.employeePhone || "-"}</span></div>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-[12px] text-slate-600 font-semibold">서명:</span>
            <div className="flex-1 border-b border-slate-400 h-14 flex items-end">
              {employeeSignUrl && (
                <img src={employeeSignUrl} alt="근로자 서명" className="max-h-14 max-w-full object-contain" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
ContractPreview.displayName = "ContractPreview";

// 프리뷰 · 항목 하나 · #200 · 우측 이해확인 영역 지원
const PreviewRow: React.FC<{
  no: string;
  title: string;
  children: React.ReactNode;
  ack?: {
    clauseKey: string;
    checked: boolean;
    onChangeChecked: (v: boolean) => void;
    padRef: React.MutableRefObject<SignatureCanvasType | null>;
    onSignedChange: (empty: boolean) => void;
  };
}> = ({ no, title, children, ack }) => (
  <div className="mb-3 grid grid-cols-[52px,1fr,auto] gap-2 items-start text-[13px]">
    <div className="font-bold text-slate-800 pt-0.5">제{no}조</div>
    <div className="text-slate-700 min-w-0">
      <div className="font-bold text-slate-900 mb-0.5">({title})</div>
      <div className="pl-1">{children}</div>
    </div>
    {ack ? (
      <MicroSignPad
        clauseKey={ack.clauseKey}
        checked={ack.checked}
        onChangeChecked={ack.onChangeChecked}
        padRef={ack.padRef}
        onSignedChange={ack.onSignedChange}
      />
    ) : (
      <div className="w-[130px] shrink-0" aria-hidden="true" />
    )}
  </div>
);

// 조항별 pad ref helper · lazy get/set
function ensurePadRef(
  refs: React.MutableRefObject<Record<string, SignatureCanvasType | null>>,
  key: string,
): React.MutableRefObject<SignatureCanvasType | null> {
  if (!(key in refs.current)) refs.current[key] = null;
  // wrapper 객체 (다른 부분과 API 동일 유지)
  return {
    get current() { return refs.current[key]; },
    set current(v: SignatureCanvasType | null) { refs.current[key] = v; },
  } as React.MutableRefObject<SignatureCanvasType | null>;
}

// 사회보험 · 체크박스 대체 사각형 (PDF 렌더 안정성 · 이모지 회피)
const SpanBox: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span
    className={`inline-flex items-center justify-center w-4 h-4 border-2 text-[10px] font-black ${checked ? "border-emerald-600 text-emerald-600" : "border-slate-300 text-transparent"}`}
    style={{ lineHeight: "1" }}
  >
    {checked ? "V" : ""}
  </span>
);

// ─────────────────────────────────────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────────────────────────────────────

const ContractWriterPage: React.FC<ContractWriterPageProps> = ({ authSession, onBack, onNavigate, onLogout, embedded = false }) => {
  const [form, setForm] = useState<ContractForm>(() => emptyForm());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);
  const [empSearchOpen, setEmpSearchOpen] = useState(false);

  // 서명 pad refs
  const employerPadRef = useRef<SignatureCanvasType | null>(null);
  const employeePadRef = useRef<SignatureCanvasType | null>(null);

  // #200 · 조항별 이해확인 상태
  const [clauseAcks, setClauseAcks] = useState<ClauseAckMap>({});
  const clausePadRefs = useRef<Record<string, SignatureCanvasType | null>>({});
  const setClauseAckChecked = useCallback((key: string, v: boolean) => {
    setClauseAcks(prev => ({
      ...prev,
      [key]: { checked: v, empty: prev[key]?.empty ?? true },
    }));
  }, []);
  const setClauseAckEmpty = useCallback((key: string, empty: boolean) => {
    setClauseAcks(prev => ({
      ...prev,
      [key]: { checked: prev[key]?.checked ?? false, empty },
    }));
  }, []);

  // 완료 · PDF 생성 상태
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // 직원 목록 로드
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

  // #194 · localStorage · "contract-writer-prefill" · 자동 채움 (mount 후 1회)
  // - 직원목록 [작성] 버튼 → localStorage prefill → 이 페이지 마운트 시 자동 반영
  // - 채움 후 · localStorage.removeItem · 재사용 방지 (뒤로가기 뒤 다시 들어와도 재적용 안 됨)
  // - 실패 시 silent
  const [prefillConsumed, setPrefillConsumed] = useState(false);
  useEffect(() => {
    if (prefillConsumed) return;
    try {
      const raw = localStorage.getItem("contract-writer-prefill");
      if (!raw) { setPrefillConsumed(true); return; }
      const p = JSON.parse(raw);
      if (!p || typeof p !== "object") { setPrefillConsumed(true); return; }

      // position → employeeCategory 매핑 (onSelectEmployee 와 동일 규칙)
      const mapCategory = (pos: string): { cat: ContractForm["employeeCategory"]; custom: string } => {
        const t = String(pos ?? "").trim();
        if (t === "약사") return { cat: "약사", custom: "" };
        if (t === "매장") return { cat: "매장", custom: "" };
        if (t === "창고") return { cat: "창고", custom: "" };
        if (["물류", "캐셔", "진열"].includes(t)) return { cat: "매장", custom: "" };
        if (!t) return { cat: "기타", custom: "" };
        return { cat: "기타", custom: t };
      };
      // employmentType → contractType
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
          // 입사일 있으면 startDate 로 (없으면 유지)
          startDate: typeof p.hireDate === "string" && p.hireDate ? p.hireDate : prev.startDate,
        };
      });

      // 재사용 방지 · 소비 즉시 제거
      localStorage.removeItem("contract-writer-prefill");
    } catch {
      // silent · 실패해도 기본 폼 유지
    } finally {
      setPrefillConsumed(true);
    }
  }, [prefillConsumed]);

  // 사업주 · 대표자 · 기본값(강남성 · 오산 메가타운 약국) · 편집 가능

  // 계약 유형 · "정규직" 이면 무기한 자동 · "계약직" 이면 무기한 해제 (편집 가능)
  useEffect(() => {
    if (form.contractType === "정규직" && !form.indefinite) {
      setForm(prev => ({ ...prev, indefinite: true, endDate: "" }));
    } else if (form.contractType === "계약직" && form.indefinite) {
      setForm(prev => ({ ...prev, indefinite: false }));
    }
  }, [form.contractType]); // eslint-disable-line react-hooks/exhaustive-deps

  // 계약직 · contractMonths → 시작일 + N개월 · 종료일 자동 계산 (편집 가능)
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

  // 직원 카테고리 (약사·매장·창고·기타) → 업무 내용 기본값 자동 반영 (사용자 편집 시 그대로 유지)
  // - #184 · 사용자 설정 (contract-writer-settings) 우선 · 없으면 하드코딩 fallback
  useEffect(() => {
    // 저장된 설정 우선 · 실패 시 default
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
    // 기본값 4종 · DEFAULT 4종 · 빈 값 중 하나이면 자동 갱신 (사용자 커스텀 지키기)
    const knownDefaults = new Set<string>([
      ...Object.values(defaults),
      ...Object.values(DEFAULT_CONTRACT_SETTINGS).filter((v): v is string => typeof v === "string" && v.length > 0),
    ]);
    const isDefault = !form.jobDuty || knownDefaults.has(form.jobDuty);
    if (isDefault && nextDuty && nextDuty !== form.jobDuty) {
      setForm(prev => ({ ...prev, jobDuty: nextDuty }));
    }
  }, [form.employeeCategory, form.employeeCategoryCustom]); // eslint-disable-line react-hooks/exhaustive-deps

  // #186 · 카테고리 → 우선업무 자동 매핑
  // - 매장/창고 선택 시 · primaryFocus 자동 설정 (이미 다른 값이면 유지)
  // - 약사/기타 선택 시 · primaryFocus null 로 리셋 (부적합)
  useEffect(() => {
    setForm(prev => {
      if (prev.employeeCategory === "매장" || prev.employeeCategory === "창고") {
        // 카테고리와 동일한 물류 자동 · 이미 매장/창고 중 값이면 유지
        if (prev.primaryFocus == null) {
          return { ...prev, primaryFocus: prev.employeeCategory };
        }
        return prev;
      }
      // 약사·기타 · 우선업무 미적용
      if (prev.primaryFocus !== null) {
        return { ...prev, primaryFocus: null };
      }
      return prev;
    });
  }, [form.employeeCategory]);

  // 근무요일 개수 → 주근무횟수 자동 (사용자가 직접 조정 안 했으면)
  const chosenDaysCount = useMemo(() => DAYS.filter(d => form.workDays[d]).length, [form.workDays]);

  // 필드 업데이트 helper
  const upd = useCallback(<K extends keyof ContractForm>(key: K, val: ContractForm[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
  }, []);

  const toggleDay = (d: DayKey) => {
    setForm(prev => ({ ...prev, workDays: { ...prev.workDays, [d]: !prev.workDays[d] } }));
  };

  // 직원 선택 시 · 이름·연락처·주소·업무 자동 채움 (모두 편집 가능)
  const onSelectEmployee = (empIdRaw: string) => {
    if (!empIdRaw) {
      upd("employeeId", null);
      return;
    }
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
      // 직원 카테고리 자동 매핑 (약사·매장·창고·기타)
      employeeCategory: (() => {
        const pos = String(emp.position || "").trim();
        if (pos === "약사")  return "약사" as const;
        if (pos === "매장")  return "매장" as const;
        if (pos === "창고")  return "창고" as const;
        // 하위 호환 · 물류/캐셔/진열 → 매장 (기본)
        if (["물류", "캐셔", "진열"].includes(pos)) return "매장" as const;
        return "기타" as const;
      })(),
      employeeCategoryCustom: (() => {
        const pos = String(emp.position || "").trim();
        return pos && pos !== "약사" ? pos : prev.employeeCategoryCustom;
      })(),
      // 정규직/계약직/알바 · 매핑
      contractType: (() => {
        const et = (emp.employmentType || "").trim();
        if (et.includes("정")) return "정규직";
        if (et.includes("계약")) return "계약직";
        if (et.includes("알바") || et.includes("파트")) return "알바";
        return prev.contractType;
      })(),
      // #186 · Employee.primary_focus / primary_focus_percent 존재 시 반영
      primaryFocus: (emp.primary_focus === "매장" || emp.primary_focus === "창고")
        ? emp.primary_focus
        : prev.primaryFocus,
      primaryFocusPercent: (typeof emp.primary_focus_percent === "number" && emp.primary_focus_percent > 0)
        ? emp.primary_focus_percent
        : prev.primaryFocusPercent,
    }));
  };

  // 폼 리셋
  const handleReset = () => {
    if (!window.confirm("입력한 모든 내용과 서명을 초기화합니다. 계속하시겠습니까?")) return;
    setForm(emptyForm());
    employerPadRef.current?.clear();
    employeePadRef.current?.clear();
    // #200 · 조항별 이해확인 pad·상태 초기화
    Object.values(clausePadRefs.current).forEach(p => { try { p?.clear(); } catch {} });
    setClauseAcks({});
    setNotice(null);
  };

  // 서명 URL (실시간 프리뷰 반영은 사용자가 "미리보기 갱신" 버튼 or 완료 시 반영)
  const [employerSignUrl, setEmployerSignUrl] = useState<string | null>(null);
  const [employeeSignUrl, setEmployeeSignUrl] = useState<string | null>(null);

  const refreshSignaturePreview = () => {
    try {
      // isEmpty() true 면 null · false 면 dataURL
      setEmployerSignUrl(employerPadRef.current && !employerPadRef.current.isEmpty()
        ? employerPadRef.current.toDataURL("image/png") : null);
      setEmployeeSignUrl(employeePadRef.current && !employeePadRef.current.isEmpty()
        ? employeePadRef.current.toDataURL("image/png") : null);
    } catch {
      // no-op
    }
  };

  // ── 공통 · 프리뷰 캡처 → PDF 인스턴스 생성 ────────────────────────────
  // handleComplete (로컬 다운) 과 handleApproveAndSave (#202 · DB 저장) 이 공유
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

  // 공통 검증 · 최소 필드 + 서명 + 조항 확인 (softMode=true 면 조항 미확인 시 confirm 스킵)
  const validateBeforeAction = (opts: { requireAllAcks: boolean }): boolean => {
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
    const employerEmpty = !employerPadRef.current || employerPadRef.current.isEmpty();
    const employeeEmpty = !employeePadRef.current || employeePadRef.current.isEmpty();
    if (employerEmpty || employeeEmpty) {
      const missing = [
        employerEmpty ? "사업주" : null,
        employeeEmpty ? "근로자" : null,
      ].filter(Boolean).join(" · ");
      if (!window.confirm(`서명이 비어있습니다 (${missing}).\n서명 없이 진행하시겠습니까?`)) return false;
    }

    const activeKeys = Object.keys(clauseAcks);
    const unchecked = activeKeys.filter(k => !clauseAcks[k].checked);
    if (opts.requireAllAcks) {
      // 승인 모드 · 미확인 있으면 하드 스톱
      if (activeKeys.length === 0 || unchecked.length > 0) {
        setNotice({
          tone: "err",
          text: activeKeys.length === 0
            ? "조항 이해 확인을 먼저 완료하세요."
            : `이해 미확인 조항 ${unchecked.length}개 (제${unchecked.join("·")}조) 를 완료하세요.`,
        });
        return false;
      }
    } else {
      // 로컬 다운로드 모드 · confirm 로 진행 여부 확인
      if (activeKeys.length === 0 || unchecked.length > 0) {
        const msg = activeKeys.length === 0
          ? "조항별 이해 확인이 하나도 완료되지 않았습니다.\n그래도 PDF를 생성하시겠습니까?"
          : `이해 미확인 조항이 ${unchecked.length}개 있습니다 (제${unchecked.join("·")}조).\n그래도 PDF를 생성하시겠습니까?`;
        if (!window.confirm(msg)) return false;
      }
    }
    return true;
  };

  // 계약 완료 → 프리뷰 캡처 → PDF 로컬 저장 (기존 · 유지)
  const handleComplete = async () => {
    setNotice(null);
    if (!validateBeforeAction({ requireAllAcks: false })) return;

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

  // #202 · 계약완료 승인 · PDF 생성 → DB 저장 (Supabase Storage + employee_contracts row + employees.contract_file_url 갱신) → 로컬 다운도 병행
  const handleApproveAndSave = async () => {
    setNotice(null);
    if (!validateBeforeAction({ requireAllAcks: true })) return;

    refreshSignaturePreview();
    setGenerating(true);
    await new Promise(r => setTimeout(r, 60));

    try {
      const { pdf, filename } = await buildPdfFromPreview();

      // dataURL · data:application/pdf;base64,...
      const pdfDataUrl = pdf.output("datauristring");

      // 서버 저장 (Storage 업로드 + row insert + employees.contract_file_url 갱신)
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
        // 저장 실패라도 사용자 편의 · 로컬 다운은 진행
        pdf.save(filename);
        setNotice({ tone: "err", text: `${msg} · 로컬 다운로드만 진행되었습니다.` });
        return;
      }

      // 로컬 다운도 병행 (사용자 편의)
      pdf.save(filename);

      const pdfUrl: string | undefined = saved?.pdf_url;
      setNotice({
        tone: "ok",
        text: pdfUrl
          ? `계약이 승인되어 저장되었습니다. 다운로드 링크: ${pdfUrl}`
          : "계약이 승인되어 저장되었습니다.",
      });
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message ?? "계약 승인·저장에 실패했습니다." });
    } finally {
      setGenerating(false);
    }
  };

  // 승인 버튼 활성화 조건 · 조항 이해 확인 100% (렌더된 활성 조항 전체 checked)
  const canApprove = (() => {
    const keys = Object.keys(clauseAcks);
    if (keys.length === 0) return false;
    return keys.every(k => !!clauseAcks[k]?.checked);
  })();

  // ── 렌더 ─────────────────────────────────────────────────────────────────
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
              <h1 className="text-lg sm:text-xl font-black text-slate-800 leading-none">근로계약서 작성</h1>
              <p className="text-xs text-slate-500 mt-1">좌측에서 조건을 입력하면 우측에 실시간 계약서가 생성됩니다. 서명 후 PDF로 다운로드하세요.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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

        {/* 안내 배너 */}
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

        {/* 좌우 split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── 좌측: 조건 입력 폼 ────────────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col gap-3 order-2 lg:order-1">
            <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-100">
              <ClipboardText size={15} weight="fill" className="text-emerald-600" />
              <h2 className="text-[13px] font-black text-slate-800">계약 조건 입력</h2>
            </div>

            {/* 근로자 정보 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<User size={12} weight="fill" className="text-slate-400" />}>근로자 정보</FieldLabel>
              {empError && <div className="text-[12px] text-rose-600">{empError}</div>}
              {/* 성명 (autocomplete · DB 검색) + 생년월일 한 줄 */}
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
                              {e.position && (
                                <span className="text-[11px] text-slate-500">{e.position}</span>
                              )}
                              {e.phone && (
                                <span className="text-[11px] text-slate-400 ml-auto tabular-nums">{e.phone}</span>
                              )}
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
                  placeholder="생년월일 (1990-01-15)"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
              </div>
              {/* 연락처 */}
              <input
                type="text"
                value={form.employeePhone}
                onChange={(e) => upd("employeePhone", e.target.value)}
                placeholder="연락처 (010-1234-5678)"
                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
              />
              {/* 주소 */}
              <input
                type="text"
                value={form.employeeAddress}
                onChange={(e) => upd("employeeAddress", e.target.value)}
                placeholder="주소"
                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
              />
              {/* 직원 카테고리 (4버튼) + 연차 인라인 */}
              <div className="flex items-center gap-1">
                {(["약사", "매장", "창고", "기타"] as const).map(cat => {
                  const active = form.employeeCategory === cat;
                  const activeColor =
                    cat === "약사" ? "bg-violet-500 text-white border-violet-500" :
                    cat === "매장" ? "bg-emerald-500 text-white border-emerald-500" :
                    cat === "창고" ? "bg-orange-500 text-white border-orange-500" :
                                     "bg-slate-600 text-white border-slate-600";
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => upd("employeeCategory", cat)}
                      className={`px-2 py-1 rounded-lg border text-[12px] font-bold transition-colors cursor-pointer ${
                        active ? activeColor : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-[11px] text-slate-400 font-semibold shrink-0">연차</span>
                  <input
                    type="number"
                    min={0}
                    value={form.annualLeaveDays}
                    onChange={(e) => upd("annualLeaveDays", e.target.value)}
                    placeholder="15"
                    className="w-14 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[14px] text-slate-800 font-semibold text-right focus:outline-none focus:border-emerald-500 focus:shadow-sm transition"
                  />
                  <span className="text-[11px] text-slate-400 font-semibold">일</span>
                </div>
              </div>
              {form.employeeCategory === "기타" && (
                <input
                  type="text"
                  value={form.employeeCategoryCustom}
                  onChange={(e) => upd("employeeCategoryCustom", e.target.value)}
                  placeholder="기타 직군 자유 입력 (예: 인턴약사 · 청소 · 배송)"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
              )}

              {/* #186 · 우선업무 (매장/창고) · 매장/창고 카테고리에서만 노출 */}
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
                        <button
                          key={f}
                          type="button"
                          onClick={() => upd("primaryFocus", active ? null : f)}
                          className={`px-2 py-0.5 rounded-md border text-[12px] font-bold transition-colors cursor-pointer ${
                            active ? activeCls : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                          title={`${f} 업무를 우선순위로 지정`}
                        >
                          {f}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.primaryFocusPercent}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        upd("primaryFocusPercent", Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 70);
                      }}
                      disabled={form.primaryFocus == null}
                      className="w-14 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-[13px] text-slate-800 font-black text-right focus:outline-none focus:border-indigo-500 focus:shadow-sm transition disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    <span className="text-[11px] text-indigo-700 font-bold">% 비중</span>
                  </div>
                  <div className="basis-full text-[10px] text-indigo-500/80 leading-tight">
                    선택한 물류(매장/창고)의 업무에 {form.primaryFocusPercent}% 비중을 두고 근무. 스케줄표에 우선업무 배지로 표시됨.
                  </div>
                </div>
              )}
            </div>

            {/* 사업주 정보 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<Buildings size={12} weight="fill" className="text-slate-400" />}>사업주 정보</FieldLabel>
              {/* 사업체명 + 대표자명 한 줄 */}
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => upd("companyName", e.target.value)}
                  placeholder="사업체명"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
                <input
                  type="text"
                  value={form.employerName}
                  onChange={(e) => upd("employerName", e.target.value)}
                  placeholder="대표자명"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
              </div>
              {/* 사업장 주소 */}
              <input
                type="text"
                value={form.companyAddress}
                onChange={(e) => upd("companyAddress", e.target.value)}
                placeholder="사업장 주소"
                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
              />
              {/* 사업자등록번호 인라인 */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 font-semibold shrink-0">사업자등록번호</span>
                <input
                  type="text"
                  value={form.companyRegNo}
                  onChange={(e) => upd("companyRegNo", e.target.value)}
                  placeholder="123-45-67890"
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
              </div>
            </div>

            {/* 계약 유형 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel required>계약 유형</FieldLabel>
              <SelectOrCustom
                value={form.contractType}
                options={CONTRACT_TYPES}
                onChange={(v) => upd("contractType", v)}
                placeholder="예: 프리랜서"
              />
              {/* 계약직 · 개월수 선택 */}
              {form.contractType === "계약직" && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-semibold shrink-0">계약 개월수</span>
                  <div className="flex-1">
                    <SelectOrCustom
                      value={form.contractMonths}
                      options={["3", "6", "12", "18", "24", "36"]}
                      onChange={(v) => upd("contractMonths", v)}
                      placeholder="예: 9"
                      suffix="개월"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 근무 요일 */}
            <div className="flex flex-col gap-1">
              <FieldLabel icon={<CalendarBlank size={12} weight="fill" className="text-slate-400" />} required>근무 요일</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {DAYS.map(d => {
                  const on = form.workDays[d];
                  const isWeekend = d === "토" || d === "일";
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={[
                        "min-w-[34px] px-2 py-1 rounded-lg text-[12px] font-black transition-colors cursor-pointer border",
                        on
                          ? isWeekend
                            ? "bg-rose-500 text-white border-rose-600"
                            : "bg-emerald-500 text-white border-emerald-600"
                          : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {d}
                    </button>
                  );
                })}
                <span className="text-[11px] text-slate-400 font-semibold self-center ml-1">선택 {chosenDaysCount}일</span>
              </div>
            </div>

            {/* 주 근무 횟수 */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-semibold shrink-0">주 근무 횟수</span>
              <div className="flex-1">
                <SelectOrCustom
                  value={form.weeklyDays}
                  options={WEEKLY_DAYS}
                  onChange={(v) => upd("weeklyDays", v)}
                  suffix="일"
                  placeholder="예: 2.5"
                />
              </div>
            </div>

            {/* 근무 시간 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<ClockClockwise size={12} weight="fill" className="text-slate-400" />} required>근무 시간</FieldLabel>
              {/* 시작 · 종료 · 휴게 한 줄 */}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <div className="text-[11px] text-slate-400 font-semibold mb-0.5">시작</div>
                  <SelectOrCustom
                    value={form.startTime}
                    options={START_TIMES}
                    onChange={(v) => upd("startTime", v)}
                    placeholder="HH:MM"
                  />
                </div>
                <div className="flex-1">
                  <div className="text-[11px] text-slate-400 font-semibold mb-0.5">종료</div>
                  <SelectOrCustom
                    value={form.endTime}
                    options={END_TIMES}
                    onChange={(v) => upd("endTime", v)}
                    placeholder="HH:MM"
                  />
                </div>
                <div className="flex items-center gap-1 pb-0.5">
                  <Coffee size={12} className="text-slate-400 shrink-0" />
                  <input
                    type="number"
                    min={0}
                    value={form.breakMinutes}
                    onChange={(e) => upd("breakMinutes", e.target.value)}
                    className="w-14 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition text-right"
                  />
                  <span className="text-[11px] text-slate-400 font-semibold">분</span>
                </div>
              </div>
            </div>

            {/* 시급 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<Money size={12} weight="fill" className="text-slate-400" />} required>시급 (원)</FieldLabel>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold mb-0.5">주중</div>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.weekdayHourly}
                      onChange={(e) => upd("weekdayHourly", e.target.value.replace(/[^0-9]/g, ""))}
                      className="w-full bg-white border border-slate-200 rounded-lg pl-2 pr-7 py-1.5 text-[12px] text-slate-800 font-black focus:outline-none focus:border-emerald-500 focus:shadow-sm transition text-right"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-semibold pointer-events-none">원</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold mb-0.5">주말</div>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.weekendHourly}
                      onChange={(e) => upd("weekendHourly", e.target.value.replace(/[^0-9]/g, ""))}
                      className="w-full bg-white border border-slate-200 rounded-lg pl-2 pr-7 py-1.5 text-[12px] text-slate-800 font-black focus:outline-none focus:border-emerald-500 focus:shadow-sm transition text-right"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-semibold pointer-events-none">원</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 계약 기간 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel required>계약 기간</FieldLabel>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold mb-0.5">시작일</div>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => upd("startDate", e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold mb-0.5">종료일</div>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => upd("endDate", e.target.value)}
                    disabled={form.indefinite}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.indefinite}
                  onChange={(e) => upd("indefinite", e.target.checked)}
                  className="w-4 h-4 accent-emerald-600"
                />
                <span className="text-[12px] font-semibold text-slate-700">무기한 (기간의 정함 없음 · 정규직)</span>
              </label>
            </div>

            {/* 담당 업무 */}
            <div className="flex flex-col gap-1">
              <FieldLabel required>담당 업무</FieldLabel>
              <input
                type="text"
                value={form.jobDuty}
                onChange={(e) => upd("jobDuty", e.target.value)}
                placeholder="예: 약국 카운터 · OTC 판매"
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
              />
            </div>

            {/* 4대보험 */}
            <div>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.socialInsurance}
                  onChange={(e) => upd("socialInsurance", e.target.checked)}
                  className="w-4 h-4 accent-emerald-600"
                />
                <span className="text-[12px] font-bold text-slate-700">4대보험 가입 (고용·산재·국민연금·건강보험)</span>
              </label>
            </div>

            {/* 추가 내용 */}
            <div className="flex flex-col gap-1">
              <FieldLabel icon={<Notepad size={12} weight="fill" className="text-slate-400" />}>추가 내용</FieldLabel>
              <textarea
                value={form.additionalContent}
                onChange={(e) => upd("additionalContent", e.target.value)}
                rows={3}
                placeholder="계약서에 추가로 명시할 내용 (예: 수습기간 3개월 · 명절 상여 별도 등)"
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 focus:shadow-sm transition resize-y placeholder:text-slate-400 placeholder:text-[12px]"
              />
            </div>

            {/* 서명 영역 */}
            <div className="border-t border-slate-100 pt-2.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Signature size={13} weight="fill" className="text-slate-400" />
                  <span className="text-[12px] font-bold text-slate-600">서명 (사업주 · 근로자)</span>
                </div>
                <button
                  type="button"
                  onClick={refreshSignaturePreview}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold transition-colors cursor-pointer"
                  title="우측 계약서에 서명 반영"
                >
                  <ArrowsClockwise size={11} />
                  미리보기 반영
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SignArea label="사업주 서명" padRef={employerPadRef} color="emerald" />
                <SignArea label="근로자 서명" padRef={employeePadRef} color="indigo" />
              </div>

              {/* 계약 완료 · 승인/PDF 다운 · #202 */}
              {/* - 좌측 · [계약완료 승인] · rose→emerald 그라디언트 · DB 저장 (Storage + row + employees.contract_file_url) + 로컬 다운
                  - 우측 · [PDF 다운로드] · 기존 로컬 다운로드 유지 (승인 없이 확인용 프린트 가능) */}
              <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:justify-between">
                <div className="flex-1 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={handleApproveAndSave}
                    disabled={generating || !canApprove}
                    className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white text-[15px] font-black shadow-md transition-all cursor-pointer disabled:cursor-not-allowed
                      ${canApprove && !generating
                        ? "bg-gradient-to-r from-rose-500 via-fuchsia-500 to-emerald-500 hover:brightness-110 hover:shadow-lg"
                        : "bg-slate-300 text-slate-500"}`}
                    title={canApprove
                      ? "계약 승인 · DB 저장 + PDF 다운"
                      : "모든 조항 이해 확인을 완료해야 활성화됩니다"}
                  >
                    <Check size={16} weight="bold" />
                    <span>{generating ? "저장 중..." : "계약완료 승인 (DB 저장)"}</span>
                  </button>
                  {!canApprove && (
                    <span className="text-[11px] text-slate-500 font-semibold text-center sm:text-left">
                      모든 조항 이해 확인 · 미니 서명 완료 시 활성화
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={generating}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-bold shadow-sm transition-colors cursor-pointer"
                  title="PDF 로컬 다운로드 (승인 없이)"
                >
                  <DownloadSimple size={14} weight="bold" />
                  <span>{generating ? "생성 중..." : "PDF 다운로드"}</span>
                </button>
              </div>
            </div>
          </section>

          {/* ── 우측: 실시간 프리뷰 ──────────────────────────────────────── */}
          <section className="order-1 lg:order-2 flex flex-col gap-3">
            <div className="flex items-center gap-1.5 pb-1">
              <NotePencil size={16} weight="fill" className="text-emerald-600" />
              <h2 className="text-sm font-black text-slate-800">계약서 미리보기</h2>
              <span className="text-[11px] text-slate-400 font-semibold ml-1">(우측 화면 그대로 PDF로 저장됩니다)</span>
            </div>

            {/* #200 · 조항 이해 확인 진행률 */}
            {(() => {
              const activeKeys = Object.keys(clauseAcks);
              // 활성 조항 = 화면에 렌더되는 조항 · 항상 최소 1..7 + 조건부
              // 진행률 표시는 clauseAcks 에 등록된 항목 기준 (렌더링 시 초기화됨)
              // 대신 UX 상 · 렌더된 조항 중 몇 개가 checked 인지 계산
              const total = Math.max(activeKeys.length, 1);
              const done = activeKeys.filter(k => clauseAcks[k].checked).length;
              const pct = Math.round((done / total) * 100);
              const complete = done > 0 && done === activeKeys.length;
              return (
                <div className={`rounded-lg border px-3 py-2 flex items-center gap-3 ${
                  complete
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-slate-50 border-slate-200"
                }`}>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {complete ? (
                      <Check size={14} weight="bold" className="text-emerald-600" />
                    ) : (
                      <ClipboardText size={14} weight="fill" className="text-slate-500" />
                    )}
                    <span className={`text-[12px] font-black ${complete ? "text-emerald-700" : "text-slate-700"}`}>
                      조항 이해 확인 {done} / {activeKeys.length || "-"}
                    </span>
                  </div>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full transition-all ${complete ? "bg-emerald-500" : "bg-indigo-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={`text-[11px] font-bold shrink-0 ${complete ? "text-emerald-600" : "text-slate-500"}`}>
                    {complete ? "전체 완료" : `${pct}%`}
                  </span>
                </div>
              );
            })()}

            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 sm:p-4">
              <ContractPreview
                ref={previewRef}
                form={form}
                employerSignUrl={employerSignUrl}
                employeeSignUrl={employeeSignUrl}
                clauseAcks={clauseAcks}
                setClauseAckChecked={setClauseAckChecked}
                setClauseAckEmpty={setClauseAckEmpty}
                clausePadRefs={clausePadRefs}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default ContractWriterPage;
