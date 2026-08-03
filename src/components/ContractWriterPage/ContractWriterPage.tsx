// src/components/ContractWriterPage/ContractWriterPage.tsx
// 근로계약서 작성 페이지 · 2026-08-03 · #165
// - 좌측: 조건 입력 폼 (직원·계약유형·근무요일·주근무횟수·시간·시급·기간·업무·4대보험·추가내용)
// - 우측: 실시간 표준 근로계약서 렌더 + 서명 canvas 2개 (사업주·근로자)
// - [계약 완료 · PDF 다운] · html2canvas + jsPDF · 서명 포함 · 파일명: 근로계약서_{직원명}_{시작일}.pdf
// - 드롭박스 기본 · "직접 입력" 옵션 · input 전환 · 모든 필드 자유 편집
// - 반응형: 모바일 상하 스택 · 데스크탑 좌우 split (lg:)
// - embedded 모드 · BusinessManagePage 임베드 시 자체 AppNavHeader skip
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
  employeeCategory: "약사" | "사원" | "기타";
  employeeCategoryCustom: string;   // 기타 선택 시 커스텀 텍스트 (예 · 인턴약사)

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
  employeeCategory: "사원",
  employeeCategoryCustom: "",
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
// 실시간 계약서 프리뷰 (우측)
// ─────────────────────────────────────────────────────────────────────────────

const ContractPreview = React.forwardRef<HTMLDivElement, {
  form: ContractForm;
  employerSignUrl: string | null;
  employeeSignUrl: string | null;
}>(({ form, employerSignUrl, employeeSignUrl }, ref) => {
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

      <PreviewRow no="1" title="근로계약기간">
        <div>{startD || "(시작일 미입력)"} 부터 {endD} 까지</div>
        {form.indefinite && <div className="text-[11px] text-slate-500 mt-0.5">※ 기간의 정함이 없는 경우 (정규직)</div>}
      </PreviewRow>

      <PreviewRow no="2" title="근무장소">
        <div>{form.companyAddress || "(근무장소 미입력)"}</div>
      </PreviewRow>

      <PreviewRow no="3" title="업무의 내용">
        <div className="whitespace-pre-wrap">{form.jobDuty || "(업무 내용 미입력)"}</div>
      </PreviewRow>

      <PreviewRow no="4" title="소정근로시간">
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

      <PreviewRow no="5" title="근무일 / 주 근무횟수">
        <div>근무일: {workDayText}</div>
        <div>주 {form.weeklyDays || "-"}일 근무</div>
      </PreviewRow>

      <PreviewRow no="6" title="임금">
        <div>· 시간급 (주중): {fmtWon(form.weekdayHourly)} 원</div>
        <div>· 시간급 (주말): {fmtWon(form.weekendHourly)} 원</div>
        <div className="text-[12px] text-slate-600 mt-0.5">
          · 임금지급일: 매월 말일 (해당일이 휴일인 경우 전일 지급)
        </div>
        <div className="text-[12px] text-slate-600">
          · 지급방법: 근로자 명의 예금통장에 입금
        </div>
      </PreviewRow>

      <PreviewRow no="7" title="연차유급휴가">
        <div>연차유급휴가는 근로기준법에서 정하는 바에 따라 <b>연 {form.annualLeaveDays || "15"}일</b> 부여함</div>
      </PreviewRow>

      <PreviewRow no="8" title="사회보험 적용">
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

      <PreviewRow no="9" title="계약유형">
        <div>{form.contractType || "(계약유형 미입력)"}</div>
      </PreviewRow>

      {form.additionalContent.trim() && (
        <PreviewRow no="10" title="기타 (추가 내용)">
          <div className="whitespace-pre-wrap">{form.additionalContent}</div>
        </PreviewRow>
      )}

      <PreviewRow no={form.additionalContent.trim() ? "11" : "10"} title="근로계약서 교부">
        <div className="text-[12px] text-slate-700">
          사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와 관계 없이 근로자에게 교부한다.
        </div>
      </PreviewRow>

      <PreviewRow no={form.additionalContent.trim() ? "12" : "11"} title="기타">
        <div className="text-[12px] text-slate-700">
          본 계약에 정함이 없는 사항은 근로기준법령에 의함.
        </div>
      </PreviewRow>

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

// 프리뷰 · 항목 하나
const PreviewRow: React.FC<{ no: string; title: string; children: React.ReactNode }> = ({ no, title, children }) => (
  <div className="mb-3 grid grid-cols-[70px,1fr] gap-3 items-start text-[13px]">
    <div className="font-bold text-slate-800 pt-0.5">제{no}조</div>
    <div className="text-slate-700">
      <div className="font-bold text-slate-900 mb-0.5">({title})</div>
      <div className="pl-1">{children}</div>
    </div>
  </div>
);

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

  // 서명 pad refs
  const employerPadRef = useRef<SignatureCanvasType | null>(null);
  const employeePadRef = useRef<SignatureCanvasType | null>(null);

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

  // 직원 카테고리 (약사·사원·기타) → 업무 내용 기본값 자동 반영 (사용자 편집 시 그대로 유지)
  useEffect(() => {
    const defaults: Record<string, string> = {
      "약사": "일반의약품·전문의약품 조제·복약지도 · 의약품 재고 관리 · 처방전 접수",
      "사원": "약국 카운터 · OTC 판매 · 재고 관리 · 매장 정리",
      "기타": "매장 지원 업무",
    };
    const key = form.employeeCategory;
    const nextDuty = form.employeeCategory === "기타" && form.employeeCategoryCustom
      ? `${form.employeeCategoryCustom} 관련 업무`
      : defaults[key];
    // 기본값 3종 중 하나이거나 빈 값인 경우만 자동 갱신 (사용자 커스텀 지키기)
    const isDefault = !form.jobDuty || Object.values(defaults).includes(form.jobDuty);
    if (isDefault && nextDuty && nextDuty !== form.jobDuty) {
      setForm(prev => ({ ...prev, jobDuty: nextDuty }));
    }
  }, [form.employeeCategory, form.employeeCategoryCustom]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // 직원 카테고리 자동 매핑 (약사 · 사원 · 기타)
      employeeCategory: (() => {
        const pos = String(emp.position || "").trim();
        if (pos === "약사") return "약사" as const;
        // 정직원 + 약사 아닌 경우 = 사원
        const et = String(emp.employmentType || "").trim();
        if (pos && !["기타", "알바"].includes(pos) && (et === "정직원" || et === "")) return "사원" as const;
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
    }));
  };

  // 폼 리셋
  const handleReset = () => {
    if (!window.confirm("입력한 모든 내용과 서명을 초기화합니다. 계속하시겠습니까?")) return;
    setForm(emptyForm());
    employerPadRef.current?.clear();
    employeePadRef.current?.clear();
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

  // 계약 완료 → 프리뷰 캡처 → PDF 저장
  const handleComplete = async () => {
    setNotice(null);

    // 최소 검증
    if (!form.employeeName.trim()) {
      setNotice({ tone: "err", text: "근로자 성명을 입력하세요." });
      return;
    }
    if (!form.startDate) {
      setNotice({ tone: "err", text: "계약 시작일을 입력하세요." });
      return;
    }
    if (!form.indefinite && !form.endDate) {
      setNotice({ tone: "err", text: "계약 종료일을 입력하거나 '무기한'을 선택하세요." });
      return;
    }
    const employerEmpty = !employerPadRef.current || employerPadRef.current.isEmpty();
    const employeeEmpty = !employeePadRef.current || employeePadRef.current.isEmpty();
    if (employerEmpty || employeeEmpty) {
      const missing = [
        employerEmpty ? "사업주" : null,
        employeeEmpty ? "근로자" : null,
      ].filter(Boolean).join(" · ");
      if (!window.confirm(`서명이 비어있습니다 (${missing}).\n서명 없이 PDF를 생성하시겠습니까?`)) return;
    }

    // 서명 URL 반영 (프리뷰에 이미지로 나타나도록)
    refreshSignaturePreview();

    // 다음 tick · state 반영 후 캡처
    setGenerating(true);
    await new Promise(r => setTimeout(r, 60));

    try {
      const node = previewRef.current;
      if (!node) throw new Error("계약서 프리뷰를 찾을 수 없습니다.");

      // html2canvas · 스케일 2 · 흰색 배경 (PDF 텍스트 선명도)
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: node.scrollWidth,
      });

      const imgData = canvas.toDataURL("image/png");

      // A4 세로 · mm 단위
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();

      // 이미지 비율 유지 · A4 폭 기준 스케일
      const imgW = pdfW;
      const imgH = (canvas.height * imgW) / canvas.width;

      if (imgH <= pdfH) {
        pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH, undefined, "FAST");
      } else {
        // 여러 페이지 분할
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
      pdf.save(`근로계약서_${safeName}_${safeDate}.pdf`);

      setNotice({ tone: "ok", text: "PDF 다운로드가 시작되었습니다." });
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message ?? "PDF 생성에 실패했습니다." });
    } finally {
      setGenerating(false);
    }
  };

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
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 sm:p-5 flex flex-col gap-4 order-2 lg:order-1">
            <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <ClipboardText size={16} weight="fill" className="text-emerald-600" />
              <h2 className="text-sm font-black text-slate-800">계약 조건 입력</h2>
            </div>

            {/* 근로자 정보 */}
            <div>
              <FieldLabel icon={<User size={13} weight="fill" className="text-slate-500" />}>근로자 정보</FieldLabel>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">직원 선택 (또는 직접 입력)</div>
                  <select
                    value={form.employeeId != null ? String(form.employeeId) : ""}
                    onChange={(e) => onSelectEmployee(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition cursor-pointer"
                    disabled={empLoading}
                  >
                    <option value="">-- 직원 선택 --</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.name}{e.position ? ` (${e.position})` : ""}
                      </option>
                    ))}
                  </select>
                  {empError && <div className="text-[11px] text-rose-600 mt-1">{empError}</div>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={form.employeeName}
                    onChange={(e) => upd("employeeName", e.target.value)}
                    placeholder="성명"
                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
                  />
                  <input
                    type="text"
                    value={form.employeeBirth}
                    onChange={(e) => upd("employeeBirth", e.target.value)}
                    placeholder="생년월일 (예: 1990-01-15)"
                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
                <input
                  type="text"
                  value={form.employeePhone}
                  onChange={(e) => upd("employeePhone", e.target.value)}
                  placeholder="연락처 (예: 010-1234-5678)"
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
                />
                <input
                  type="text"
                  value={form.employeeAddress}
                  onChange={(e) => upd("employeeAddress", e.target.value)}
                  placeholder="주소"
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
                />
                {/* 직원 카테고리 · 약사 · 사원 · 기타 (기타는 자유 입력) */}
                <div className="grid grid-cols-3 gap-1.5">
                  {(["약사", "사원", "기타"] as const).map(cat => {
                    const active = form.employeeCategory === cat;
                    const activeColor =
                      cat === "약사" ? "bg-violet-500 text-white border-violet-500" :
                      cat === "사원" ? "bg-sky-500 text-white border-sky-500" :
                                       "bg-slate-600 text-white border-slate-600";
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => upd("employeeCategory", cat)}
                        className={`px-2 py-1.5 rounded-lg border text-[12px] font-bold transition-colors cursor-pointer ${
                          active ? activeColor : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
                {form.employeeCategory === "기타" && (
                  <input
                    type="text"
                    value={form.employeeCategoryCustom}
                    onChange={(e) => upd("employeeCategoryCustom", e.target.value)}
                    placeholder="기타 직군 · 자유 입력 (예: 인턴약사 · 청소 · 배송 등)"
                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
                  />
                )}
                {/* 연차 유급휴가 (일) */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-semibold shrink-0">연차 유급휴가</span>
                  <input
                    type="number"
                    min={0}
                    value={form.annualLeaveDays}
                    onChange={(e) => upd("annualLeaveDays", e.target.value)}
                    placeholder="15"
                    className="w-24 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold text-right focus:outline-none focus:border-emerald-500 transition"
                  />
                  <span className="text-[11px] text-slate-500 font-semibold">일</span>
                </div>
              </div>
            </div>

            {/* 사업주 정보 */}
            <div>
              <FieldLabel icon={<Buildings size={13} weight="fill" className="text-slate-500" />}>사업주 정보</FieldLabel>
              <div className="grid grid-cols-1 gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(e) => upd("companyName", e.target.value)}
                    placeholder="사업체명"
                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
                  />
                  <input
                    type="text"
                    value={form.employerName}
                    onChange={(e) => upd("employerName", e.target.value)}
                    placeholder="대표자명"
                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
                <input
                  type="text"
                  value={form.companyAddress}
                  onChange={(e) => upd("companyAddress", e.target.value)}
                  placeholder="사업장 주소"
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
                />
                <input
                  type="text"
                  value={form.companyRegNo}
                  onChange={(e) => upd("companyRegNo", e.target.value)}
                  placeholder="사업자등록번호 (예: 123-45-67890)"
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            </div>

            {/* 계약 유형 */}
            <div>
              <FieldLabel required>계약 유형</FieldLabel>
              <SelectOrCustom
                value={form.contractType}
                options={CONTRACT_TYPES}
                onChange={(v) => upd("contractType", v)}
                placeholder="예: 프리랜서"
              />
              {/* 계약직 · 개월수 선택 (시작일 + N개월 → 종료일 자동) */}
              {form.contractType === "계약직" && (
                <div className="mt-2">
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">계약 개월수</div>
                  <SelectOrCustom
                    value={form.contractMonths}
                    options={["3", "6", "12", "18", "24", "36"]}
                    onChange={(v) => upd("contractMonths", v)}
                    placeholder="예: 9"
                    suffix="개월"
                  />
                </div>
              )}
            </div>

            {/* 근무 요일 */}
            <div>
              <FieldLabel icon={<CalendarBlank size={13} weight="fill" className="text-slate-500" />} required>근무 요일</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map(d => {
                  const on = form.workDays[d];
                  const isWeekend = d === "토" || d === "일";
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={[
                        "min-w-[38px] px-2.5 py-1.5 rounded-lg text-sm font-black transition-colors cursor-pointer border",
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
              </div>
              <div className="text-[11px] text-slate-500 mt-1">선택된 요일: {chosenDaysCount}일</div>
            </div>

            {/* 주 근무 횟수 */}
            <div>
              <FieldLabel>주 근무 횟수 (일)</FieldLabel>
              <SelectOrCustom
                value={form.weeklyDays}
                options={WEEKLY_DAYS}
                onChange={(v) => upd("weeklyDays", v)}
                suffix="일"
                placeholder="예: 2.5"
              />
            </div>

            {/* 근무 시간 */}
            <div>
              <FieldLabel icon={<ClockClockwise size={13} weight="fill" className="text-slate-500" />} required>근무 시간</FieldLabel>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">시작</div>
                  <SelectOrCustom
                    value={form.startTime}
                    options={START_TIMES}
                    onChange={(v) => upd("startTime", v)}
                    placeholder="HH:MM"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">종료</div>
                  <SelectOrCustom
                    value={form.endTime}
                    options={END_TIMES}
                    onChange={(v) => upd("endTime", v)}
                    placeholder="HH:MM"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Coffee size={13} className="text-slate-400" />
                <span className="text-[11px] text-slate-500 font-semibold">휴게시간</span>
                <input
                  type="number"
                  min={0}
                  value={form.breakMinutes}
                  onChange={(e) => upd("breakMinutes", e.target.value)}
                  className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition text-right"
                />
                <span className="text-[11px] text-slate-500 font-semibold">분</span>
              </div>
            </div>

            {/* 시급 */}
            <div>
              <FieldLabel icon={<Money size={13} weight="fill" className="text-slate-500" />} required>시급 (원)</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">주중</div>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.weekdayHourly}
                      onChange={(e) => upd("weekdayHourly", e.target.value.replace(/[^0-9]/g, ""))}
                      className="w-full bg-white border border-slate-200 rounded-lg pl-2.5 pr-8 py-1.5 text-sm text-slate-800 font-black focus:outline-none focus:border-emerald-500 transition text-right"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold pointer-events-none">원</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">주말</div>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.weekendHourly}
                      onChange={(e) => upd("weekendHourly", e.target.value.replace(/[^0-9]/g, ""))}
                      className="w-full bg-white border border-slate-200 rounded-lg pl-2.5 pr-8 py-1.5 text-sm text-slate-800 font-black focus:outline-none focus:border-emerald-500 transition text-right"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold pointer-events-none">원</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 계약 기간 */}
            <div>
              <FieldLabel required>계약 기간</FieldLabel>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">시작일</div>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => upd("startDate", e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">종료일</div>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => upd("endDate", e.target.value)}
                    disabled={form.indefinite}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
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
                <span className="text-xs font-semibold text-slate-700">무기한 (기간의 정함 없음 · 정규직)</span>
              </label>
            </div>

            {/* 담당 업무 */}
            <div>
              <FieldLabel required>담당 업무</FieldLabel>
              <input
                type="text"
                value={form.jobDuty}
                onChange={(e) => upd("jobDuty", e.target.value)}
                placeholder="예: 약국 카운터 · OTC 판매"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition"
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
                <span className="text-sm font-bold text-slate-700">4대보험 가입 (고용·산재·국민연금·건강보험)</span>
              </label>
            </div>

            {/* 추가 내용 */}
            <div>
              <FieldLabel icon={<Notepad size={13} weight="fill" className="text-slate-500" />}>추가 내용</FieldLabel>
              <textarea
                value={form.additionalContent}
                onChange={(e) => upd("additionalContent", e.target.value)}
                rows={4}
                placeholder="계약서에 추가로 명시할 내용 (예: 수습기간 3개월 · 명절 상여 별도 등)"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 transition resize-y"
              />
            </div>

            {/* 서명 영역 */}
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Signature size={14} weight="fill" className="text-slate-500" />
                  <span className="text-[12px] font-bold text-slate-600">서명 (사업주 · 근로자 · 손가락 또는 마우스)</span>
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

              {/* 계약 완료 · PDF 다운 · 서명 아래에 배치 */}
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={generating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-black shadow-sm transition-colors cursor-pointer"
                  title="계약 완료 · PDF 다운"
                >
                  <DownloadSimple size={16} weight="bold" />
                  <span>{generating ? "생성 중..." : "계약 완료 · PDF 다운"}</span>
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

            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 sm:p-4">
              <ContractPreview
                ref={previewRef}
                form={form}
                employerSignUrl={employerSignUrl}
                employeeSignUrl={employeeSignUrl}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default ContractWriterPage;
