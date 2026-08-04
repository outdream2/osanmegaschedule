// src/components/StaffManagePage/StaffManagePage.tsx
// 직원관리 페이지 — 마스터-디테일 레이아웃 (이력서 스타일 우측 패널)
// 좌측: 슬림 원라인 리스트 / 우측: 이력서 형식 상세 + 인라인 편집
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  Briefcase,
  Building,
  Calendar,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Edit2,
  ExternalLink,
  FileText,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  Paperclip,
  PenSquare as NotePencilIcon,
  Phone,
  RefreshCw,
  Save,
  Search,
  Star,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";

// ─── 타입 ───────────────────────────────────────────────────────────────────
interface Employee {
  id: number;
  name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  level?: number | null;
  role?: string | null;
  contract_file_url?: string | null;
  photo_url?: string | null;
  hire_date?: string | null;
  memo?: string | null;
  // ── 이력서 · 인사기록카드 확장 필드 (DB 없으면 undefined 처리) ──
  // 인적사항
  birth_date?: string | null;
  gender?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_rel?: string | null;
  // 근무 정보
  schedule_type?: string | null; // 오픈/미들/마감/클로징/자유
  work_area?: string | null;     // 담당 구역
  // 계약 정보
  contract_type?: string | null;  // regular/fixed_term/part_time/daily/intern
  contract_start?: string | null;
  contract_end?: string | null;
  probation_end_date?: string | null;
  work_location?: string | null;
  job_duties?: string | null;
  // 근로조건
  working_hours_per_week?: number | null;
  break_time_minutes?: number | null;
  break_apply_paid?: boolean | null; // 휴게시간 인건비 차감 적용 여부 (기본 true)
  weekly_holiday?: string | null;  // 일요일 등
  annual_leave_days?: number | null;
  // 임금
  wage_calc_type?: string | null; // hourly/daily/monthly/annual
  wage_amount?: number | null;
  wage_pay_day?: string | null;   // 매월 10일 등
  wage_pay_method?: string | null;
  bank_name?: string | null;
  bank_account_no?: string | null;
  salary?: string | null; // 하위 호환 (레거시)
  // 4대보험
  insurance_nps_date?: string | null;   // 국민연금
  insurance_nhis_date?: string | null;  // 건강보험
  insurance_ei_date?: string | null;    // 고용보험
  insurance_wcia_date?: string | null;  // 산재보험
  insurance_excluded?: boolean | null;
  // 자격 (약국 특수)
  pharmacist_license_no?: string | null;
  health_check_expiry?: string | null;
  // 경력·학력·자격증 (배열)
  careers?: CareerItem[] | null;
  educations?: EducationItem[] | null;
  certifications?: CertItem[] | null;
  // 인사평가 (S/A/B/C/D · 관리자 입력)
  performance_rating?: string | null;
  [key: string]: unknown;
}

/**
 * 인사기록카드 관련 DB 컬럼 추가 SQL (Supabase에서 한 번 실행):
 *
 * ALTER TABLE employees
 *   ADD COLUMN IF NOT EXISTS birth_date date,
 *   ADD COLUMN IF NOT EXISTS gender text,
 *   ADD COLUMN IF NOT EXISTS address text,
 *   ADD COLUMN IF NOT EXISTS emergency_contact_name text,
 *   ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
 *   ADD COLUMN IF NOT EXISTS emergency_contact_rel text,
 *   ADD COLUMN IF NOT EXISTS schedule_type text,
 *   ADD COLUMN IF NOT EXISTS work_area text,
 *   ADD COLUMN IF NOT EXISTS contract_type text,
 *   ADD COLUMN IF NOT EXISTS contract_start date,
 *   ADD COLUMN IF NOT EXISTS contract_end date,
 *   ADD COLUMN IF NOT EXISTS probation_end_date date,
 *   ADD COLUMN IF NOT EXISTS work_location text,
 *   ADD COLUMN IF NOT EXISTS job_duties text,
 *   ADD COLUMN IF NOT EXISTS working_hours_per_week numeric(4,1),
 *   ADD COLUMN IF NOT EXISTS break_time_minutes integer DEFAULT 60,
 *   ADD COLUMN IF NOT EXISTS break_apply_paid boolean DEFAULT true,
 *   ADD COLUMN IF NOT EXISTS weekly_holiday text DEFAULT '일요일',
 *   ADD COLUMN IF NOT EXISTS annual_leave_days integer DEFAULT 15,
 *   ADD COLUMN IF NOT EXISTS wage_calc_type text,
 *   ADD COLUMN IF NOT EXISTS wage_amount integer,
 *   ADD COLUMN IF NOT EXISTS wage_pay_day text,
 *   ADD COLUMN IF NOT EXISTS wage_pay_method text DEFAULT '계좌이체',
 *   ADD COLUMN IF NOT EXISTS bank_name text,
 *   ADD COLUMN IF NOT EXISTS bank_account_no text,
 *   ADD COLUMN IF NOT EXISTS insurance_nps_date date,
 *   ADD COLUMN IF NOT EXISTS insurance_nhis_date date,
 *   ADD COLUMN IF NOT EXISTS insurance_ei_date date,
 *   ADD COLUMN IF NOT EXISTS insurance_wcia_date date,
 *   ADD COLUMN IF NOT EXISTS insurance_excluded boolean DEFAULT false,
 *   ADD COLUMN IF NOT EXISTS pharmacist_license_no text,
 *   ADD COLUMN IF NOT EXISTS health_check_expiry date,
 *   ADD COLUMN IF NOT EXISTS careers jsonb DEFAULT '[]'::jsonb,
 *   ADD COLUMN IF NOT EXISTS educations jsonb DEFAULT '[]'::jsonb,
 *   ADD COLUMN IF NOT EXISTS certifications jsonb DEFAULT '[]'::jsonb,
 *   ADD COLUMN IF NOT EXISTS performance_rating text;
 */

interface CareerItem {
  id: string;
  company: string;
  period: string;
  desc?: string;
}

interface EducationItem {
  id: string;
  school: string;
  major?: string;
  grad?: string;
}

interface CertItem {
  id: string;
  name: string;
  issuer?: string;
  date?: string;
}

type EditDraft = Pick<
  Employee,
  | "name" | "position" | "phone" | "email" | "level" | "role"
  | "hire_date" | "memo" | "contract_file_url" | "photo_url"
  | "birth_date" | "gender" | "address" | "schedule_type" | "work_area"
  | "salary" | "contract_start" | "contract_end"
  // 신규 · 인사기록카드 확장
  | "emergency_contact_name" | "emergency_contact_phone" | "emergency_contact_rel"
  | "contract_type" | "probation_end_date" | "work_location" | "job_duties"
  | "working_hours_per_week" | "break_time_minutes" | "break_apply_paid" | "weekly_holiday" | "annual_leave_days"
  | "wage_calc_type" | "wage_amount" | "wage_pay_day" | "wage_pay_method" | "bank_name" | "bank_account_no"
  | "insurance_nps_date" | "insurance_nhis_date" | "insurance_ei_date" | "insurance_wcia_date" | "insurance_excluded"
  | "pharmacist_license_no" | "health_check_expiry"
  | "performance_rating"
>;

// ─── 상수 ───────────────────────────────────────────────────────────────────
// 2026-08-03 · 캐셔·진열 → 물류로 통합 · 물류를 창고/매장으로 분리
const POSITIONS = ["약사", "창고", "매장", "매니저", "기타"] as const;
const SCHEDULE_TYPES = ["오픈", "미들", "마감", "클로징", "자유", "풀타임"] as const;
const GENDERS = ["남", "여"] as const;

// 계약유형 (regular/fixed_term/part_time/daily/intern)
const CONTRACT_TYPES: { value: string; label: string; short: string }[] = [
  { value: "regular",    label: "정규직",  short: "정규" },
  { value: "fixed_term", label: "계약직",  short: "계약" },
  { value: "part_time",  label: "알바",    short: "알바" },
  { value: "daily",      label: "일용직",  short: "일용" },
  { value: "intern",     label: "인턴",    short: "인턴" },
];

// 인사평가 등급
const PERFORMANCE_RATINGS: { value: string; label: string }[] = [
  { value: "S", label: "S · 탁월" },
  { value: "A", label: "A · 우수" },
  { value: "B", label: "B · 양호" },
  { value: "C", label: "C · 보통" },
  { value: "D", label: "D · 미흡" },
];

// ─── 헬퍼: 직책 컬러 ────────────────────────────────────────────────────────
function positionColor(pos: string | null | undefined) {
  if (!pos) return "bg-slate-100 text-slate-500 border-slate-200";
  if (pos.includes("약사"))              return "bg-violet-100 text-violet-700 border-violet-200";
  if (pos.includes("매장"))              return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (pos.includes("창고"))              return "bg-orange-100 text-orange-700 border-orange-200";
  if (pos.includes("물류") || pos.includes("진열") || pos.includes("캐셔"))
                                          return "bg-orange-100 text-orange-700 border-orange-200"; // 하위 호환
  if (pos.includes("매니저"))            return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function scheduleTypeColor(t: string | null | undefined) {
  if (!t) return "bg-slate-100 text-slate-400 border-slate-200";
  if (t === "오픈")    return "bg-amber-100 text-amber-700 border-amber-200";
  if (t === "미들")    return "bg-teal-100 text-teal-700 border-teal-200";
  if (t === "마감")    return "bg-indigo-100 text-indigo-700 border-indigo-200";
  if (t === "클로징")  return "bg-purple-100 text-purple-700 border-purple-200";
  if (t === "풀타임")  return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

// 계약유형 · 배지 컬러 + 한글 라벨
function contractTypeMeta(t: string | null | undefined): { label: string; short: string; color: string } | null {
  if (!t) return null;
  const found = CONTRACT_TYPES.find((c) => c.value === t);
  const short = found?.short ?? t;
  const label = found?.label ?? t;
  let color: string;
  switch (t) {
    case "regular":    color = "bg-blue-100 text-blue-700 border-blue-200"; break;
    case "fixed_term": color = "bg-amber-100 text-amber-700 border-amber-200"; break;
    case "part_time":  color = "bg-slate-100 text-slate-600 border-slate-200"; break;
    case "daily":      color = "bg-rose-100 text-rose-700 border-rose-200"; break;
    case "intern":     color = "bg-lime-100 text-lime-700 border-lime-200"; break;
    default:           color = "bg-slate-100 text-slate-500 border-slate-200";
  }
  return { label, short, color };
}

// 인사평가 · 배지 컬러
function performanceRatingColor(r: string | null | undefined): string {
  if (!r) return "bg-slate-100 text-slate-400 border-slate-200";
  switch (r.toUpperCase()) {
    case "S": return "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200";
    case "A": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "B": return "bg-sky-100 text-sky-700 border-sky-200";
    case "C": return "bg-amber-100 text-amber-700 border-amber-200";
    case "D": return "bg-rose-100 text-rose-700 border-rose-200";
    default:  return "bg-slate-100 text-slate-500 border-slate-200";
  }
}

// 퇴직금 지급대상 판단 · 계속근로 1년 이상 · 주 15시간 이상
//   · 근로기준법 상 최소 조건 (working_hours_per_week 없으면 정규직/계약직만 인정)
function isSeveranceEligible(emp: Employee): boolean {
  if (!emp.hire_date) return false;
  const hire = new Date(String(emp.hire_date));
  if (isNaN(hire.getTime())) return false;
  const end = emp.retire_date ? new Date(String(emp.retire_date)) : new Date();
  const years = (end.getTime() - hire.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 1) return false;
  const hoursPerWeek = Number(emp.working_hours_per_week);
  if (Number.isFinite(hoursPerWeek) && hoursPerWeek > 0 && hoursPerWeek < 15) return false;
  return true;
}

// #219 · 근로계약서(employee_contracts) 기반 · 계약 개월수 자동 산출
//   · start_date ~ end_date · 총 개월 <= 4 → "계약 N개월"
//   · 그 외(장기 · 무기한 · 미매핑) → null (호출자가 fallback 처리)
function contractPeriodMonths(startIso: string | null | undefined, endIso: string | null | undefined): number | null {
  if (!startIso || !endIso) return null;
  const s = new Date(String(startIso));
  const e = new Date(String(endIso));
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (e.getTime() < s.getTime()) return null;
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  // 종료일이 시작일 "일자보다 크거나 같으면" · 1개월 더 인정 (예 2026-01-01 ~ 2026-01-31 → 1개월)
  if (e.getDate() >= s.getDate() - 1) months += 1;
  return months > 0 ? months : null;
}

// #219 · 계약 자동 라벨 산출 (근로계약서 이력 우선 · 없으면 contract_type)
//   · 총 개월 <= 4 → "계약 N개월" (amber 배지)
//   · 그 외 → contract_type 기반 (기존 contractTypeMeta 그대로 유지)
function autoContractBadge(
  latest: { start_date?: string | null; end_date?: string | null } | null | undefined,
  contractType: string | null | undefined,
): { label: string; color: string; source: "auto" | "manual" } | null {
  if (latest) {
    const months = contractPeriodMonths(latest.start_date, latest.end_date);
    if (months != null && months <= 4) {
      return {
        label: `계약 ${months}개월`,
        color: "bg-amber-100 text-amber-800 border-amber-300",
        source: "auto",
      };
    }
  }
  const meta = contractTypeMeta(contractType);
  return meta ? { label: meta.label, color: meta.color, source: "manual" } : null;
}

// 근속기간 계산 · hire_date 기반 · "3년 2개월" · 없으면 "-"
function calcTenure(hireDate: string | null | undefined): string {
  if (!hireDate) return "-";
  const start = new Date(hireDate);
  if (Number.isNaN(start.getTime())) return "-";
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  // 일자 보정 · 아직 이번 달의 입사일이 안 지났다면 -1
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return "-";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0 && rem === 0) return "이번 달";
  if (years === 0) return `${rem}개월`;
  if (rem === 0)   return `${years}년`;
  return `${years}년 ${rem}개월`;
}

// ─── 헬퍼: 아바타 그라디언트 ────────────────────────────────────────────────
const AVATAR_GRADIENTS = [
  "from-indigo-400 to-violet-500",
  "from-sky-400 to-indigo-500",
  "from-emerald-400 to-teal-500",
  "from-orange-400 to-amber-500",
  "from-rose-400 to-pink-500",
  "from-violet-400 to-purple-500",
] as const;

function avatarGradient(name: string) {
  const code = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[code % AVATAR_GRADIENTS.length];
}

function initials(name: string) {
  return name ? name.charAt(0) : "?";
}

// ─── 섹션 그룹 컬러 맵 ──────────────────────────────────────────────────────
// 4그룹: 인적사항(sky) · 근무·계약(amber) · 경력·자격(emerald) · 임금·보험(rose)
type SectionGroup = "personal" | "work" | "career" | "wage";

const GROUP_HEADER: Record<SectionGroup, string> = {
  personal: "bg-sky-50    border-sky-100   text-sky-700",
  work:     "bg-amber-50  border-amber-100  text-amber-700",
  career:   "bg-emerald-50 border-emerald-100 text-emerald-700",
  wage:     "bg-rose-50   border-rose-100   text-rose-700",
};
const GROUP_ICON: Record<SectionGroup, string> = {
  personal: "text-sky-400",
  work:     "text-amber-400",
  career:   "text-emerald-400",
  wage:     "text-rose-400",
};

// ─── 서브컴포넌트: 아바타 ────────────────────────────────────────────────────
const Avatar: React.FC<{
  name: string;
  photoUrl?: string | null;
  size?: "xs" | "sm" | "lg";
}> = ({ name, photoUrl, size = "sm" }) => {
  const dim =
    size === "lg" ? "w-20 h-20 text-2xl"
    : size === "xs" ? "w-8 h-8 text-xs"
    : "w-9 h-9 text-sm";
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${dim} rounded-full object-cover ring-2 ring-white shadow shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center text-white font-black shadow shrink-0 select-none`}
    >
      {initials(name)}
    </div>
  );
};

// ─── 서브컴포넌트: 인라인 텍스트 필드 ──────────────────────────────────────
const InlineField: React.FC<{
  label: string;
  value: string;
  editing: boolean;
  icon?: React.ReactNode;
  type?: React.HTMLInputTypeAttribute;
  placeholder?: string;
  onChange: (v: string) => void;
  monospace?: boolean;
  wide?: boolean;
}> = ({ label, value, editing, icon, type = "text", placeholder, onChange, monospace: _monospace, wide }) => (
  <div className={`flex flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-0.5 leading-none">
      {icon}
      {label}
    </span>
    {editing ? (
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border border-indigo-300 rounded-md px-2 py-0.5 text-[13px] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 bg-indigo-50/40 h-7"
      />
    ) : (
      <span
        className={`text-[13px] font-semibold leading-snug min-h-[20px] ${!value ? "text-slate-300 italic" : "text-slate-700"}`}
      >
        {value || "(없음)"}
      </span>
    )}
  </div>
);

// ─── 서브컴포넌트: 섹션 카드 (아코디언) — 그룹 컬러 헤더 ─────────────────────
const SectionCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  group?: SectionGroup;
}> = ({ title, icon, children, defaultOpen = true, group = "personal" }) => {
  const [open, setOpen] = useState(defaultOpen);
  const headerCls = GROUP_HEADER[group];
  const iconCls   = GROUP_ICON[group];
  const textCls   = headerCls.split(" ").find(c => c.startsWith("text-")) ?? "";
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full px-3 py-2 border-b ${open ? headerCls : "bg-white border-slate-100"} flex items-center justify-between cursor-pointer transition-colors duration-150`}
      >
        <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${open ? textCls : "text-slate-500"}`}>
          <span className={open ? iconCls : "text-slate-400"}>{icon}</span>
          {title}
        </span>
        <span className={`transition-transform duration-200 opacity-50 ${open ? "rotate-180" : ""} ${open ? textCls : "text-slate-400"}`}>
          <svg width="10" height="10" viewBox="0 0 12 12">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </span>
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
};

// ─── 서브컴포넌트: 빈 상태 행 ───────────────────────────────────────────────
const EmptyRow: React.FC<{ label: string }> = ({ label }) => (
  <p className="text-[11px] text-slate-300 italic py-1.5">{label}</p>
);

// ─── 서브컴포넌트: 섹션 소제목 indicator ─────────────────────────────────────
const SectionLabel: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <div className="flex items-center gap-1.5 mb-3">
    <span className={`inline-block w-1 h-3.5 rounded-full shrink-0 ${color}`} />
    <span className="text-[11px] font-semibold text-slate-500">{children}</span>
  </div>
);

// ─── 서브컴포넌트: 신규 등록 모달 ────────────────────────────────────────────
const CreateModal: React.FC<{
  onClose: () => void;
  onSave: (data: Partial<Employee>) => Promise<void>;
  saving: boolean;
}> = ({ onClose, onSave, saving }) => {
  const [draft, setDraft] = useState<Partial<Employee>>({ name: "", position: "물류" });
  const set = (k: keyof Employee, v: unknown) => setDraft((p) => ({ ...p, [k]: v }));

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-violet-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
              <UserPlus size={13} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-800">직원 신규 등록</span>
          </div>
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="text-slate-400 hover:text-slate-700 w-7 h-7 rounded-md hover:bg-white/70 cursor-pointer flex items-center justify-center disabled:opacity-40"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {(
            [
              { label: "이름 *", key: "name", type: "text", placeholder: "" },
              { label: "연락처", key: "phone", type: "text", placeholder: "010-0000-0000" },
              { label: "이메일", key: "email", type: "email", placeholder: "name@example.com" },
              { label: "입사일", key: "hire_date", type: "date", placeholder: "" },
            ] as { label: string; key: keyof Employee; type: string; placeholder: string }[]
          ).map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">{label}</label>
              <input
                type={type}
                value={String(draft[key] ?? "")}
                onChange={(e) => set(key, e.target.value)}
                placeholder={placeholder}
                className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
              />
            </div>
          ))}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">직책</label>
            <select
              value={String(draft.position ?? "")}
              onChange={(e) => set("position", e.target.value)}
              className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-[12px] bg-white focus:outline-none focus:border-indigo-400"
            >
              <option value="">선택 안 함</option>
              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">메모</label>
            <textarea
              value={String(draft.memo ?? "")}
              onChange={(e) => set("memo", e.target.value)}
              placeholder="(선택) 근무 특이사항 · 알러지 등"
              rows={2}
              className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-indigo-400 resize-none"
            />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-[11px] font-semibold text-slate-600 bg-white border border-slate-300 rounded-md h-7 px-3 hover:bg-slate-50 cursor-pointer disabled:opacity-40"
          >
            취소
          </button>
          <button
            onClick={() => onSave(draft)}
            disabled={saving}
            className="text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md h-7 px-3.5 cursor-pointer disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── 서브컴포넌트: 직원 없음 (우측 빈 상태) ─────────────────────────────────
const EmptyDetail: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-300 select-none py-16">
    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 flex items-center justify-center shadow-sm">
      <Users size={34} className="text-indigo-300" />
    </div>
    <div className="text-center">
      <p className="text-sm font-bold text-slate-400">직원을 선택하세요</p>
      <p className="text-[12px] text-slate-300 mt-1">좌측 목록에서 직원을 클릭하면 인사카드가 표시됩니다</p>
    </div>
  </div>
);

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────
interface StaffManagePageProps {
  /** 계약서 작성 요청 · Employee 정보를 담고 · 부모(BusinessManagePage)가 · 서류작성 서브탭으로 이동시킴 */
  onWriteContract?: (emp: Employee) => void;
}

const StaffManagePage: React.FC<StaffManagePageProps> = ({ onWriteContract }) => {
  // ── 상태 ──
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [filterPosition, setFilterPosition] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"active" | "retired" | "all">("active");

  // 좌측 리스트 폭 (px) · localStorage 저장 · 데스크탑만 반영 (lg:)
  const LIST_WIDTH_KEY = "megatown_staffManage.listWidth";
  const [listWidth, setListWidth] = useState<number>(() => {
    try {
      const s = localStorage.getItem(LIST_WIDTH_KEY);
      const n = s ? parseInt(s, 10) : NaN;
      return Number.isFinite(n) && n >= 200 && n <= 640 ? n : 288;
    } catch { return 288; }
  });
  useEffect(() => {
    try { localStorage.setItem(LIST_WIDTH_KEY, String(listWidth)); } catch { /* ignore */ }
  }, [listWidth]);
  const [isDesktop, setIsDesktop] = useState<boolean>(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const startResizeList = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = listWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const next = Math.max(200, Math.min(640, startW + delta));
      setListWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<EditDraft | null>(null);
  const [saving, setSaving]   = useState(false);

  const [mobileDetail, setMobileDetail] = useState(false);
  const [createOpen, setCreateOpen]     = useState(false);
  const [createSaving, setCreateSaving] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── 연차 · 유급휴가 상태 (선택된 직원 · 연 단위) ──────────────────────────
  // schedules 테이블에서 type ∈ {"월차","오전반차","오후반차"} 항목을 사용한 연차로 집계
  // 연차 승인(POST/PUT /api/leave-requests approved) → 서버가 schedules에 자동 upsert
  // 삭제 → PUT /api/schedules { type: "" } (SchedulePage와 동일한 clear 방식)
  interface UsedLeaveItem {
    date: string;              // YYYY-MM-DD
    type: string;              // 월차 / 오전반차 / 오후반차
    memo: string;
    weight: number;            // 월차=1, 반차=0.5
  }
  const currentYearNow = new Date().getFullYear();
  const [leaveYear, setLeaveYear] = useState<number>(currentYearNow);
  const [usedLeaves, setUsedLeaves] = useState<UsedLeaveItem[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveError, setLeaveError]     = useState<string | null>(null);
  const [deletingLeaveDate, setDeletingLeaveDate] = useState<string | null>(null);

  // #219 · 선택된 직원의 최신 근로계약서 (start_date/end_date · 자동 계약타입 산출용)
  interface LatestContract {
    id?: number;
    contract_type?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    created_at?: string | null;
    pdf_url?: string | null;
  }
  const [latestContract, setLatestContract] = useState<LatestContract | null>(null);
  const [latestContractLoading, setLatestContractLoading] = useState(false);

  // ── 데이터 로드 ──
  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const y = now.getFullYear(), m = now.getMonth() + 1;
      const res = await fetch(`/api/schedules?year=${y}&month=${m}`);
      if (!res.ok) throw new Error(`서버 오류 ${res.status}`);
      const data = await res.json();
      const list: Employee[] = Array.isArray(data?.employees) ? data.employees : [];
      setEmployees(list);
      if (selectedId != null && !list.find((e) => e.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { loadEmployees(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 연차 사용 이력 로드 (선택된 직원 · 지정 연도 12개월 병렬) ──────────────
  const LEAVE_TYPES_SET = useMemo(() => new Set(["월차", "오전반차", "오후반차"]), []);
  const leaveWeight = (t: string) => (t === "오전반차" || t === "오후반차") ? 0.5 : 1;

  const loadUsedLeaves = useCallback(async (empId: number, year: number) => {
    setLeaveLoading(true);
    setLeaveError(null);
    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) => i + 1).map(async (m) => {
          const res = await fetch(`/api/schedules?year=${year}&month=${m}`);
          if (!res.ok) return null;
          return res.json().catch(() => null);
        })
      );
      const items: UsedLeaveItem[] = [];
      for (const monthData of results) {
        const emps: Employee[] = Array.isArray(monthData?.employees) ? monthData.employees : [];
        const target = emps.find(e => e.id === empId);
        const schedules: any[] = Array.isArray((target as any)?.schedules) ? (target as any).schedules : [];
        for (const s of schedules) {
          const t = String(s?.type ?? "");
          const d = String(s?.date ?? "");
          if (!t || !d) continue;
          if (!LEAVE_TYPES_SET.has(t)) continue;
          if (!d.startsWith(`${year}-`)) continue;
          items.push({ date: d, type: t, memo: String(s?.memo ?? ""), weight: leaveWeight(t) });
        }
      }
      items.sort((a, b) => a.date.localeCompare(b.date));
      setUsedLeaves(items);
    } catch (err: unknown) {
      setLeaveError(err instanceof Error ? err.message : "연차 이력 조회 실패");
      setUsedLeaves([]);
    } finally {
      setLeaveLoading(false);
    }
  }, [LEAVE_TYPES_SET]);

  // 선택된 직원 · 연도 변경 시 재조회
  useEffect(() => {
    if (selectedId == null) {
      setUsedLeaves([]);
      setLeaveError(null);
      setLeaveLoading(false);
      return;
    }
    loadUsedLeaves(selectedId, leaveYear);
  }, [selectedId, leaveYear, loadUsedLeaves]);

  // #219 · 선택된 직원의 최신 근로계약서 조회 (자동 계약타입 배지용)
  //   · GET /api/employee-contracts?employeeId=X · created_at DESC 첫번째
  //   · 실패 시 · latestContract=null (배지는 contract_type fallback)
  useEffect(() => {
    if (selectedId == null) {
      setLatestContract(null);
      setLatestContractLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLatestContractLoading(true);
      try {
        const res = await fetch(`/api/employee-contracts?employeeId=${selectedId}`);
        if (!res.ok) { if (!cancelled) setLatestContract(null); return; }
        const rows = await res.json();
        if (cancelled) return;
        const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        setLatestContract(first as LatestContract | null);
      } catch {
        if (!cancelled) setLatestContract(null);
      } finally {
        if (!cancelled) setLatestContractLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  // 개별 연차 삭제 · PUT /api/schedules with type="" (SchedulePage clear 방식)
  const deleteUsedLeave = async (empId: number, date: string) => {
    if (!window.confirm(`${date} 연차 기록을 삭제할까요?\n\n스케줄표(월차)에도 반영됩니다.`)) return;
    setDeletingLeaveDate(date);
    try {
      const res = await fetch(`/api/schedules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: empId,
          date,
          type: "",
          workingHours: "",
          actualHours: "",
          memo: "",
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(`삭제 실패: ${(b as { error?: string }).error ?? res.statusText}`);
        return;
      }
      // 로컬 상태 즉시 반영
      setUsedLeaves(prev => prev.filter(l => l.date !== date));
    } catch (err: unknown) {
      alert(`삭제 오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingLeaveDate(null);
    }
  };

  // ── 필터링 ──
  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const isRetired = !!(e as any).retire_date;
      if (filterStatus === "active"  && isRetired)   return false;
      if (filterStatus === "retired" && !isRetired)  return false;
      if (filterPosition && !(e.position ?? "").includes(filterPosition)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          e.name?.toLowerCase().includes(q) ||
          (e.position ?? "").toLowerCase().includes(q) ||
          (e.phone ?? "").toLowerCase().includes(q) ||
          (e.email ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [employees, search, filterPosition, filterStatus]);

  const selectedEmp = useMemo(
    () => employees.find((e) => e.id === selectedId) ?? null,
    [employees, selectedId]
  );

  // ── 선택 ──
  const handleSelect = (emp: Employee) => {
    if (editing && !window.confirm("편집 중인 내용이 있습니다. 이동할까요?")) return;
    setSelectedId(emp.id);
    setEditing(false);
    setDraft(null);
    setMobileDetail(true);
  };

  // ── 편집 시작 ──
  const startEdit = (emp: Employee) => {
    setDraft({
      name: emp.name ?? "",
      position: emp.position ?? "",
      phone: emp.phone ?? "",
      email: emp.email ?? "",
      level: emp.level ?? null,
      role: emp.role ?? "",
      hire_date: emp.hire_date ?? "",
      memo: emp.memo ?? "",
      contract_file_url: emp.contract_file_url ?? "",
      photo_url: emp.photo_url ?? "",
      birth_date: emp.birth_date ?? "",
      gender: emp.gender ?? "",
      address: emp.address ?? "",
      schedule_type: emp.schedule_type ?? "",
      work_area: emp.work_area ?? "",
      salary: emp.salary ?? "",
      contract_start: emp.contract_start ?? "",
      contract_end: emp.contract_end ?? "",
      contract_type: emp.contract_type ?? "",
      performance_rating: emp.performance_rating ?? "",
      break_time_minutes: emp.break_time_minutes ?? 60,
      break_apply_paid: emp.break_apply_paid ?? true,
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setDraft(null); };

  // ── 저장 ──
  const saveEdit = async () => {
    if (!selectedEmp || !draft) return;
    if (!draft.name?.trim()) { alert("이름을 입력해주세요."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${selectedEmp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...selectedEmp, ...draft }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(`저장 실패: ${(b as { error?: string }).error ?? res.statusText}`);
        return;
      }
      setEditing(false);
      setDraft(null);
      setEmployees((prev) => prev.map((e) => e.id === selectedEmp.id ? { ...e, ...draft } : e));
    } catch (err: unknown) {
      alert(`저장 오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // ── 삭제 ──
  const deleteEmployee = async (emp: Employee) => {
    if (!window.confirm(`직원 [${emp.name}] 삭제할까요?\n\n관련 스케줄·배정 데이터도 영향을 받을 수 있습니다.`)) return;
    try {
      const res = await fetch(`/api/employees/${emp.id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(`삭제 실패: ${(b as { error?: string }).error ?? res.statusText}`);
        return;
      }
      if (selectedId === emp.id) setSelectedId(null);
      loadEmployees();
    } catch (err: unknown) {
      alert(`삭제 오류: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ── 신규 등록 ──
  const createEmployee = async (data: Partial<Employee>) => {
    if (!data.name?.trim()) { alert("이름을 입력해주세요."); return; }
    setCreateSaving(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(`저장 실패: ${(b as { error?: string }).error ?? res.statusText}`);
        return;
      }
      const created: Employee = await res.json();
      setCreateOpen(false);
      await loadEmployees();
      setSelectedId(created?.id ?? null);
    } catch (err: unknown) {
      alert(`저장 오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreateSaving(false);
    }
  };

  const setField = <K extends keyof EditDraft>(k: K, v: EditDraft[K]) => {
    setDraft((p) => (p ? { ...p, [k]: v } : p));
  };

  const displayEmp = editing && draft ? { ...selectedEmp!, ...draft } : selectedEmp;

  // ── 좌측 리스트 아이템 · 표 형식 · 한 줄 (2026-08-03) ────────────────────────
  const ListRow: React.FC<{ emp: Employee }> = ({ emp }) => {
    const isSelected = emp.id === selectedId;
    const ctMeta   = contractTypeMeta(emp.contract_type);
    const tenure   = calcTenure(emp.hire_date);
    const hasContractFile = !!emp.contract_file_url;
    const rating   = emp.performance_rating ? emp.performance_rating.toUpperCase() : null;
    const isRetired = !!(emp as any).retire_date;
    const openContract = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (emp.contract_file_url) {
        window.open(emp.contract_file_url, "_blank", "noopener,noreferrer");
      } else {
        alert(`${emp.name}님의 근로계약서가 등록되어 있지 않습니다.\n편집 모드에서 계약서 URL을 입력해 주세요.`);
      }
    };
    return (
      <tr
        onClick={() => handleSelect(emp)}
        className={`cursor-pointer transition-colors ${
          isSelected ? "bg-indigo-50/80" : "hover:bg-slate-50/70"
        }`}
      >
        {/* 이름 */}
        <td className="px-2 py-2 text-[13px] font-bold text-slate-800 truncate max-w-[120px]">
          <div className="flex items-center gap-1">
            {emp.photo_url && <Avatar name={emp.name} photoUrl={emp.photo_url} size="xs" />}
            <span className={isSelected ? "text-indigo-800" : ""}>{emp.name}</span>
          </div>
        </td>
        {/* 직책 */}
        <td className="px-1 py-2 text-center">
          {emp.position && (
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md border leading-tight ${positionColor(emp.position)}`}>
              {emp.position}
            </span>
          )}
        </td>
        {/* 계약유형 */}
        <td className="px-1 py-2 text-center">
          {ctMeta ? (
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md border leading-tight ${ctMeta.color}`}>
              {ctMeta.short}
            </span>
          ) : (
            <span className="text-[11px] text-slate-300">-</span>
          )}
        </td>
        {/* 근속 */}
        <td className="px-1 py-2 text-center text-[12px] text-slate-600 tabular-nums whitespace-nowrap">
          {tenure}
        </td>
        {/* 평가 */}
        <td className="px-1 py-2 text-center">
          {rating ? (
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md border leading-tight tabular-nums ${performanceRatingColor(rating)}`}>
              {rating}
            </span>
          ) : (
            <span className="text-[11px] text-slate-300">-</span>
          )}
        </td>
        {/* 근로계약서 · 보기 or 작성 */}
        <td className="px-1 py-2 text-center">
          {hasContractFile ? (
            <button
              type="button"
              onClick={openContract}
              className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer whitespace-nowrap"
              title="근로계약서 새 창으로 보기"
            >
              <Paperclip size={10} />보기
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // 계약서 작성 페이지로 이동 · Employee 정보를 prefill
                try {
                  const prefill = {
                    employeeId: emp.id,
                    employeeName: emp.name ?? "",
                    employeePhone: emp.phone ?? "",
                    employeeAddress: (emp as any).address ?? "",
                    hireDate: emp.hire_date ?? "",
                    position: emp.position ?? "",
                    employmentType: (emp as any).employmentType ?? (emp as any).employment_type ?? "",
                    annualLeaveDays: (emp as any).annual_leave_days ?? null,
                  };
                  localStorage.setItem("contract-writer-prefill", JSON.stringify(prefill));
                } catch { /* localStorage 실패 무시 */ }
                if (onWriteContract) {
                  onWriteContract(emp);
                } else {
                  // fallback · 이벤트로 통지 (BusinessManagePage 리스너)
                  window.dispatchEvent(new CustomEvent("staff-write-contract", { detail: { employeeId: emp.id } }));
                }
              }}
              className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 cursor-pointer whitespace-nowrap transition-colors"
              title="근로계약서 작성 · 기본정보 자동 채움"
            >
              <NotePencilIcon size={10} />작성
            </button>
          )}
        </td>
        {/* 상태 배지 · 퇴사·퇴사예정 */}
        <td className="px-1 py-2 text-center">
          {isRetired && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border leading-tight bg-rose-50 text-rose-700 border-rose-200">
              퇴사
            </span>
          )}
        </td>
      </tr>
    );
  };

  // ── 렌더링 ──────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 max-w-[1360px] mx-auto w-full px-4 py-4 flex flex-col gap-3 min-h-0">

      {/* ── 상단 필터바 (full-width · StockManagePage 벤치마크) ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* 페이지 아이콘 + 타이틀 */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shrink-0">
            <Users size={13} className="text-white" />
          </div>
          <span className="text-[13px] font-bold text-slate-800">직원관리</span>
          <span className="text-[11px] font-semibold px-1.5 py-px rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 tabular-nums">
            {employees.length}명
          </span>
        </div>

        {/* 구분선 */}
        <div className="hidden sm:block w-px h-5 bg-slate-200 shrink-0" />

        {/* 검색 */}
        <div className="relative min-w-[160px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 · 직책 · 연락처"
            className="pl-8 pr-3 h-8 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-slate-50 placeholder:text-slate-400 w-full sm:w-48"
          />
        </div>

        {/* 재직 상태 필터 · 재직/퇴사/전체 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">상태</span>
          <div className="inline-flex bg-slate-50 border border-slate-200 rounded-lg p-0.5 shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] gap-0.5">
            {[
              { key: "active",  label: "재직",  color: "bg-emerald-600 text-white" },
              { key: "retired", label: "퇴사",  color: "bg-rose-500 text-white" },
              { key: "all",     label: "전체",  color: "bg-slate-700 text-white" },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => setFilterStatus(s.key as typeof filterStatus)}
                className={`h-6 px-2 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  filterStatus === s.key ? `${s.color} shadow-sm` : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 직책 필터 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">직책</span>
          <div className="inline-flex bg-slate-50 border border-slate-200 rounded-lg p-0.5 shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] flex-wrap gap-0.5">
            <button
              onClick={() => setFilterPosition("")}
              className={`h-6 px-2 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                filterPosition === ""
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              전체
            </button>
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => setFilterPosition(filterPosition === p ? "" : p)}
                className={`h-6 px-2 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  filterPosition === p
                    ? "bg-white text-slate-800 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* 우측 액션 버튼 */}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={loadEmployees}
            disabled={loading}
            title="새로고침"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 cursor-pointer disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="h-8 px-3 flex items-center gap-1.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer shadow-sm transition-colors"
          >
            <UserPlus size={12} />
            신규 등록
          </button>
        </div>
      </div>

      {/* ── 마스터-디테일 · 좌우 split · 2026-08-03 (#183) · 공통 CSS 클래스 (split-*) 로 통일 ── */}
      <div
        className="split-container"
        style={{ height: "calc(100vh - 200px)" }}
      >
        {/* ════ 좌측: 직원 리스트 카드 · 데스크탑에서 폭 조정 가능 ════ */}
        <aside
          className="split-left"
          style={isDesktop ? { width: `${listWidth}px` } : undefined}
        >

          {/* 카드 헤더 · 공통 card-header */}
          <div className="card-header">
            <User size={13} className="text-indigo-400 shrink-0" />
            <span className="text-[13px] font-semibold text-slate-800">직원 목록</span>
            {filtered.length !== employees.length && (
              <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-px tabular-nums ml-auto">
                {filtered.length}/{employees.length}
              </span>
            )}
          </div>

          {/* 직원 목록 · 표 형식 · 한 줄 · 컬럼: 이름·직책·계약유형·근속·평가·계약서·상태 */}
          <div className="flex-1 overflow-auto min-h-0">
            {loading && filtered.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-slate-400 text-[11px] font-semibold gap-1.5">
                <Loader2 size={13} className="animate-spin" />로딩 중...
              </div>
            ) : error ? (
              <div className="m-2.5 p-2.5 text-[11px] text-red-600 font-semibold bg-red-50 rounded-lg border border-red-200">
                {error}
                <button onClick={loadEmployees} className="ml-1.5 underline cursor-pointer">재시도</button>
              </div>
            ) : !loading && filtered.length === 0 ? (
              <div className="text-center text-[11px] text-slate-300 py-8">해당 조건의 직원이 없습니다</div>
            ) : (
              <table className={`w-full border-collapse ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                  <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-2 py-1.5 text-left">이름</th>
                    <th className="px-1 py-1.5 text-center">직책</th>
                    <th className="px-1 py-1.5 text-center">계약유형</th>
                    <th className="px-1 py-1.5 text-center">근속</th>
                    <th className="px-1 py-1.5 text-center">평가</th>
                    <th className="px-1 py-1.5 text-center">계약서</th>
                    <th className="px-1 py-1.5 text-center">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((emp) => <ListRow key={emp.id} emp={emp} />)}
                </tbody>
              </table>
            )}
          </div>

          {/* 하단 신규 등록 */}
          <div className="px-3 py-2 border-t border-slate-100 shrink-0">
            <button
              onClick={() => setCreateOpen(true)}
              className="w-full h-7 text-[11px] font-semibold text-indigo-600 border border-dashed border-indigo-200 rounded-lg hover:bg-indigo-50 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
            >
              <UserPlus size={11} /> 신규 직원 등록
            </button>
          </div>
        </aside>

        {/* Resize handle · 공통 split-divider · 데스크탑만 · group 은 @apply 로 상속 불가 → 클래스로 명시 */}
        <div
          onMouseDown={startResizeList}
          className="split-divider group"
          title="드래그하여 좌측 리스트 폭 조절"
        >
          <span className="text-[10px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* ════ 우측: 인사카드 패널 · 공통 split-right · min-h-0 (flex-1 세로 스크롤 정상화) ════ */}
        <section className="split-right">
          {!displayEmp ? (
            <EmptyDetail />
          ) : (
            <>
              {/* ── 프로필 헤더 — 슬림 배너 (py-2.5) ── */}
              <div className="bg-gradient-to-r from-indigo-50/90 to-violet-50/70 border-b border-indigo-100/80 px-4 py-2.5 shrink-0">
                <div className="flex items-center gap-3">
                  {/* 사진 · 편집 모드 또는 photo_url 있을 때만 */}
                  {(displayEmp.photo_url || editing) && (
                    <div className="relative group shrink-0">
                      {displayEmp.photo_url ? (
                        <Avatar name={displayEmp.name} photoUrl={displayEmp.photo_url} size="sm" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                          <Camera size={14} />
                        </div>
                      )}
                      {editing && (
                        <button
                          onClick={() => photoInputRef.current?.click()}
                          title="사진 변경"
                          className="absolute inset-0 rounded-full bg-slate-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          <Camera size={11} className="text-white" />
                        </button>
                      )}
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setField("photo_url", URL.createObjectURL(file));
                        }}
                      />
                    </div>
                  )}

                  {/* 이름 · 배지 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      {editing ? (
                        <input
                          value={draft?.name ?? ""}
                          onChange={(e) => setField("name", e.target.value)}
                          className="text-base font-bold text-slate-800 border-b-2 border-indigo-400 bg-transparent focus:outline-none leading-tight"
                        />
                      ) : (
                        <h3 className="text-base font-bold text-slate-800 leading-tight">{displayEmp.name}</h3>
                      )}
                      <span className="text-[10px] text-slate-300">#{displayEmp.id}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* 직책 */}
                      {editing ? (
                        <select
                          value={draft?.position ?? ""}
                          onChange={(e) => setField("position", e.target.value)}
                          className="text-[11px] border border-slate-300 rounded-md px-2 h-6 bg-white focus:outline-none focus:border-indigo-400"
                        >
                          <option value="">직책 없음</option>
                          {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      ) : (
                        <span className={`text-[11px] font-semibold px-1.5 py-px rounded border ${positionColor(displayEmp.position)}`}>
                          {(displayEmp.position === "창고" || displayEmp.position === "매장")
                            ? `물류 · ${displayEmp.position}`
                            : (displayEmp.position || "직책 없음")}
                        </span>
                      )}
                      {/* 계약유형 · #219 · 근로계약서 기반 자동 산출 (짧은 계약 → "계약 N개월") · fallback contract_type */}
                      {(() => {
                        const badge = autoContractBadge(latestContract, displayEmp.contract_type);
                        if (!badge) return null;
                        const tip = badge.source === "auto"
                          ? `계약서 자동 산출 · 시작 ${latestContract?.start_date ?? "-"} · 종료 ${latestContract?.end_date ?? "-"}`
                          : "계약유형";
                        return (
                          <span
                            className={`text-[11px] font-semibold px-1.5 py-px rounded border ${badge.color}`}
                            title={tip}
                          >
                            {badge.label}
                          </span>
                        );
                      })()}
                      {/* 근무타입 */}
                      {editing ? (
                        <select
                          value={draft?.schedule_type ?? ""}
                          onChange={(e) => setField("schedule_type", e.target.value)}
                          className="text-[11px] border border-slate-300 rounded-md px-2 h-6 bg-white focus:outline-none focus:border-indigo-400"
                        >
                          <option value="">근무타입 없음</option>
                          {SCHEDULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : displayEmp.schedule_type ? (
                        <span className={`text-[10px] font-semibold px-1.5 py-px rounded border ${scheduleTypeColor(displayEmp.schedule_type)}`}>
                          {displayEmp.schedule_type}
                        </span>
                      ) : null}
                      {/* 레벨 */}
                      {displayEmp.level != null && (
                        <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-0.5">
                          <Award size={9} /> Lv.{editing ? draft?.level : displayEmp.level}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 편집 / 저장 / 삭제 버튼 */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {editing ? (
                      <>
                        <button
                          onClick={cancelEdit}
                          disabled={saving}
                          className="h-7 px-2.5 text-[11px] font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer flex items-center gap-1 disabled:opacity-40 transition-colors"
                        >
                          <X size={12} /> 취소
                        </button>
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="h-7 px-2.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-40 transition-colors"
                        >
                          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          {saving ? "저장 중..." : "저장"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => selectedEmp && startEdit(selectedEmp)}
                          className="h-7 px-2.5 text-[11px] font-semibold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 cursor-pointer flex items-center gap-1 transition-colors"
                        >
                          <Edit2 size={12} /> 편집
                        </button>
                        <button
                          onClick={() => selectedEmp && deleteEmployee(selectedEmp)}
                          className="h-7 px-2.5 text-[11px] font-semibold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer flex items-center gap-1 transition-colors"
                        >
                          <Trash2 size={12} /> 삭제
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── 3열 KPI 바 — 근속 · 연차잔여 · 인사평가 (항상 노출) ── */}
              {(() => {
                const tenure = calcTenure(displayEmp.hire_date);
                const totalDaysRaw = editing ? draft?.annual_leave_days : displayEmp.annual_leave_days;
                const totalDays = Number.isFinite(Number(totalDaysRaw)) ? Number(totalDaysRaw) : 15;
                const usedDays = usedLeaves.reduce((sum, l) => sum + l.weight, 0);
                const remainDays = Math.max(0, totalDays - usedDays);
                const fmtD = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1);
                const rating = displayEmp.performance_rating ? String(displayEmp.performance_rating).toUpperCase() : null;
                return (
                  <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 shrink-0 bg-white">
                    {/* 근속 */}
                    <div className="flex flex-col items-center justify-center py-2 px-2 gap-0.5">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-0.5">
                        <Clock size={9} className="text-indigo-400" /> 근속
                      </span>
                      <span className="text-[15px] font-black text-slate-800 leading-tight tabular-nums">
                        {tenure === "-" ? <span className="text-[12px] text-slate-300">미등록</span> : tenure}
                      </span>
                      {displayEmp.hire_date && (
                        <span className="text-[10px] text-slate-400">{displayEmp.hire_date}</span>
                      )}
                    </div>
                    {/* 연차 잔여 */}
                    <div className="flex flex-col items-center justify-center py-2 px-2 gap-0.5">
                      <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide flex items-center gap-0.5">
                        <CalendarDays size={9} /> 연차 잔여
                      </span>
                      <span className="text-[15px] font-black text-emerald-700 leading-tight tabular-nums">
                        {fmtD(remainDays)}<span className="text-[11px] font-semibold ml-0.5">일</span>
                      </span>
                      <span className="text-[10px] text-slate-400">총 {fmtD(totalDays)}일 · 사용 {fmtD(usedDays)}일</span>
                    </div>
                    {/* 인사평가 */}
                    <div className="flex flex-col items-center justify-center py-2 px-2 gap-0.5">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-0.5">
                        <Star size={9} className="text-amber-400" /> 평가
                      </span>
                      {rating ? (
                        <span className={`text-[15px] font-black leading-tight px-2 py-0.5 rounded-md border ${performanceRatingColor(rating)}`}>
                          {rating}
                        </span>
                      ) : (
                        <span className="text-[12px] text-slate-300 italic leading-tight">미평가</span>
                      )}
                      {isSeveranceEligible(displayEmp) && (
                        <span className="text-[9px] font-bold text-rose-500 bg-rose-50 border border-rose-200 px-1.5 py-px rounded-md leading-tight">퇴직금대상</span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── 인사카드 섹션들 · flex-1 min-h-0 · 세로 스크롤 (#238 · 명시적 max-h + overscroll-contain 강제) ── */}
              <div
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2 bg-slate-50/30"
                style={{ maxHeight: "calc(100vh - 260px)" }}
              >

                {/* §1 인적사항 — sky 그룹 */}
                <SectionCard title="인적사항" icon={<User size={11} />} group="personal" defaultOpen>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <InlineField
                      label="연락처" value={editing ? (draft?.phone ?? "") : (displayEmp.phone ?? "")}
                      editing={editing} icon={<Phone size={9} />} placeholder="010-0000-0000" monospace
                      onChange={(v) => setField("phone", v)}
                    />
                    <InlineField
                      label="이메일" value={editing ? (draft?.email ?? "") : (displayEmp.email ?? "")}
                      editing={editing} icon={<Mail size={9} />} type="email" placeholder="name@example.com"
                      onChange={(v) => setField("email", v)}
                    />
                    <InlineField
                      label="생년월일" value={editing ? (draft?.birth_date ?? "") : (displayEmp.birth_date ?? "")}
                      editing={editing} icon={<Calendar size={9} />} type="date"
                      onChange={(v) => setField("birth_date", v)}
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-0.5 leading-none">
                        <User size={9} /> 성별
                      </span>
                      {editing ? (
                        <select
                          value={draft?.gender ?? ""}
                          onChange={(e) => setField("gender", e.target.value)}
                          className="border border-indigo-300 rounded-md px-2 py-0.5 text-[13px] bg-white focus:outline-none focus:border-indigo-500 bg-indigo-50/40 h-7"
                        >
                          <option value="">선택 안 함</option>
                          {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      ) : (
                        <span className={`text-[13px] font-semibold leading-snug min-h-[20px] ${displayEmp.gender ? "text-slate-700" : "text-slate-300 italic"}`}>
                          {displayEmp.gender || "(없음)"}
                        </span>
                      )}
                    </div>
                    <InlineField
                      label="주소" value={editing ? (draft?.address ?? "") : (displayEmp.address ?? "")}
                      editing={editing} icon={<MapPin size={9} />} placeholder="주소 입력"
                      onChange={(v) => setField("address", v)} wide
                    />
                  </div>
                </SectionCard>

                {/* §2 근무 정보 · 2026-08-04 · 사용자 요청으로 제거 · 필드는 §6 계약·서류에서 접근 */}
                {false && (
                <SectionCard title="근무 정보" icon={<Building size={11} />} group="work" defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <InlineField
                      label="직책" value={editing ? (draft?.position ?? "") : (displayEmp.position ?? "")}
                      editing={editing} icon={<Award size={9} />} placeholder="직책 입력"
                      onChange={(v) => setField("position", v)}
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-0.5 leading-none">
                        <Users size={9} /> 구분 / 역할
                      </span>
                      {editing ? (
                        <div className="flex gap-1">
                          <input
                            type="number" min={1} max={9}
                            value={draft?.level ?? ""}
                            onChange={(e) => setField("level", e.target.value === "" ? null : Number(e.target.value))}
                            placeholder="Lv"
                            className="w-10 border border-indigo-300 rounded-md px-1.5 text-[13px] focus:outline-none bg-indigo-50/40 h-7"
                          />
                          <input
                            type="text" value={draft?.role ?? ""}
                            onChange={(e) => setField("role", e.target.value)}
                            placeholder="역할 (예: admin)"
                            className="flex-1 border border-indigo-300 rounded-md px-2 text-[13px] focus:outline-none bg-indigo-50/40 h-7"
                          />
                        </div>
                      ) : (
                        <span className="text-[13px] font-semibold leading-snug min-h-[20px] text-slate-700">
                          {displayEmp.level != null ? `Lv.${displayEmp.level}` : ""}
                          {displayEmp.role && <span className="text-slate-400 ml-1">({displayEmp.role})</span>}
                          {displayEmp.level == null && !displayEmp.role && <span className="text-slate-300 italic">(없음)</span>}
                        </span>
                      )}
                    </div>
                    <InlineField
                      label="입사일" value={editing ? (draft?.hire_date ?? "") : (displayEmp.hire_date ?? "")}
                      editing={editing} icon={<Calendar size={9} />} type="date"
                      onChange={(v) => setField("hire_date", v)}
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-0.5 leading-none">
                        <ClipboardList size={9} /> 근무 타입
                      </span>
                      {editing ? (
                        <select
                          value={draft?.schedule_type ?? ""}
                          onChange={(e) => setField("schedule_type", e.target.value)}
                          className="border border-indigo-300 rounded-md px-2 text-[13px] bg-white focus:outline-none bg-indigo-50/40 h-7"
                        >
                          <option value="">선택 안 함</option>
                          {SCHEDULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : (
                        <span className={`text-[13px] font-semibold leading-snug min-h-[20px] ${displayEmp.schedule_type ? "text-slate-700" : "text-slate-300 italic"}`}>
                          {displayEmp.schedule_type || "(없음)"}
                        </span>
                      )}
                    </div>
                    <InlineField
                      label="담당 구역" value={editing ? (draft?.work_area ?? "") : (displayEmp.work_area ?? "")}
                      editing={editing} icon={<MapPin size={9} />} placeholder="예: 1구역 / 냉장"
                      onChange={(v) => setField("work_area", v)} wide
                    />
                  </div>
                </SectionCard>
                )}

                {/* §3~§5 경력·학력·자격증·면허 섹션 · 2026-08-04 · 사용자 요청으로 UI 제거
                    · DB 필드 (careers · educations · certifications) 는 유지 (다른 참조 대비) */}

                {/* §6 계약 · 서류 — amber 그룹 */}
                <SectionCard title="계약 · 서류" icon={<FileText size={11} />} group="work" defaultOpen>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {/* 계약유형 · 드롭박스 (정규/계약/알바/일용/인턴) */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-0.5 leading-none">
                        <Briefcase size={9} /> 계약유형
                      </span>
                      {editing ? (
                        <select
                          value={draft?.contract_type ?? ""}
                          onChange={(e) => setField("contract_type", e.target.value || null)}
                          className="border border-indigo-300 rounded-md px-2 text-[13px] bg-indigo-50/40 focus:outline-none focus:border-indigo-500 h-7"
                        >
                          <option value="">선택 안 함</option>
                          {CONTRACT_TYPES.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      ) : (() => {
                        // #219 · 근로계약서 기반 자동 산출 우선 · fallback contract_type
                        const badge = autoContractBadge(latestContract, displayEmp.contract_type);
                        const manualMeta = contractTypeMeta(displayEmp.contract_type);
                        const showAutoOnly = badge?.source === "auto";
                        return (
                          <div className="flex flex-wrap items-center gap-1 min-h-[20px]">
                            {badge ? (
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${badge.color}`}
                                title={showAutoOnly
                                  ? `계약서 자동 산출 · ${latestContract?.start_date ?? "-"} ~ ${latestContract?.end_date ?? "-"}`
                                  : "계약유형"}
                              >
                                {badge.label}
                                {showAutoOnly && <span className="ml-1 text-[9px] font-black opacity-70">AUTO</span>}
                              </span>
                            ) : (
                              <span className="text-[13px] font-semibold text-slate-300 italic">(없음)</span>
                            )}
                            {/* auto 배지가 우선 노출된 경우 · 수동 contract_type 이 있으면 옆에 서브 표시 */}
                            {showAutoOnly && manualMeta && (
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${manualMeta.color} opacity-70`}
                                title="수동 지정 계약유형"
                              >
                                {manualMeta.short}
                              </span>
                            )}
                            {latestContractLoading && (
                              <span className="text-[10px] text-slate-300">불러오는 중...</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* 근속기간 · read-only 계산 표시 (hire_date 기반) */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-0.5 leading-none">
                        <Clock size={9} /> 근속기간
                      </span>
                      <span className={`text-[13px] font-semibold leading-snug min-h-[20px] ${displayEmp.hire_date ? "text-slate-700" : "text-slate-300 italic"}`}>
                        {displayEmp.hire_date ? calcTenure(displayEmp.hire_date) : "(입사일 미등록)"}
                        {displayEmp.hire_date && (
                          <span className="text-[10px] font-normal text-slate-400 ml-1">
                            · {displayEmp.hire_date}
                          </span>
                        )}
                      </span>
                    </div>

                    <InlineField
                      label="계약 시작일" value={editing ? (draft?.contract_start ?? "") : (displayEmp.contract_start ?? "")}
                      editing={editing} icon={<Calendar size={9} />} type="date"
                      onChange={(v) => setField("contract_start", v)}
                    />
                    <InlineField
                      label="계약 종료일" value={editing ? (draft?.contract_end ?? "") : (displayEmp.contract_end ?? "")}
                      editing={editing} icon={<Calendar size={9} />} type="date"
                      onChange={(v) => setField("contract_end", v)}
                    />
                    <InlineField
                      label="급여" value={editing ? (draft?.salary ?? "") : (displayEmp.salary ?? "")}
                      editing={editing} placeholder="예: 시급 10,030원"
                      onChange={(v) => setField("salary", v)} wide
                    />

                    {/* 인사평가 · 편집 가능 (드롭박스 S/A/B/C/D) */}
                    <div className="col-span-2 flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-0.5 leading-none">
                        <Star size={9} /> 인사평가
                      </span>
                      {editing ? (
                        <select
                          value={draft?.performance_rating ?? ""}
                          onChange={(e) => setField("performance_rating", e.target.value || null)}
                          className="border border-indigo-300 rounded-md px-2 text-[13px] bg-indigo-50/40 focus:outline-none focus:border-indigo-500 max-w-[200px] h-7"
                        >
                          <option value="">평가 없음</option>
                          {PERFORMANCE_RATINGS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      ) : displayEmp.performance_rating ? (
                        <span className="inline-flex items-center gap-1.5 leading-snug min-h-[20px]">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${performanceRatingColor(displayEmp.performance_rating)}`}>
                            {String(displayEmp.performance_rating).toUpperCase()}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {PERFORMANCE_RATINGS.find((r) => r.value === String(displayEmp.performance_rating).toUpperCase())?.label ?? ""}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[13px] font-semibold text-slate-300 italic leading-snug min-h-[20px]">(미평가)</span>
                      )}
                    </div>

                    {/* 계약서 파일 · [보기] 버튼 UI · 없으면 "없음" 배지 · 편집 모드에서 URL 입력 */}
                    <div className="col-span-2 flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-0.5 leading-none">
                        <FileText size={9} /> 근로계약서
                      </span>
                      {editing ? (
                        <input
                          type="url"
                          value={draft?.contract_file_url ?? ""}
                          onChange={(e) => setField("contract_file_url", e.target.value)}
                          placeholder="계약서 URL 입력 (https://...)"
                          className="border border-indigo-300 rounded-md px-2.5 py-1 text-[12px] focus:outline-none focus:border-indigo-500 bg-indigo-50/40"
                        />
                      ) : (
                        <div className="flex items-center gap-2 py-1">
                          {displayEmp.contract_file_url ? (
                            <>
                              <button
                                type="button"
                                onClick={() => window.open(displayEmp.contract_file_url as string, "_blank", "noopener,noreferrer")}
                                className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm cursor-pointer transition-colors"
                              >
                                <ExternalLink size={11} /> 보기
                              </button>
                              <span className="text-[10px] text-slate-400 truncate max-w-[280px]">
                                {displayEmp.contract_file_url}
                              </span>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => alert("등록된 근로계약서가 없습니다.\n편집 모드에서 계약서 URL 을 입력해 주세요.")}
                                className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded-md cursor-pointer hover:bg-slate-200/60 transition-colors"
                              >
                                <Paperclip size={11} /> 보기
                              </button>
                              <span className="text-[11px] font-semibold text-slate-400 italic">없음</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </SectionCard>

                {/* §7 근로조건 — amber 그룹 */}
                <SectionCard title="근로조건" icon={<Calendar size={11} />} group="work" defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <InlineField
                      label="주 소정근로시간"
                      value={editing ? String(draft?.working_hours_per_week ?? "") : String(displayEmp.working_hours_per_week ?? "")}
                      editing={editing} type="number" placeholder="40"
                      onChange={(v) => setField("working_hours_per_week", v === "" ? null : Number(v))}
                    />
                    {/* 휴게시간 · 인건비 차감 적용 여부 + 30/60분 선택 */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold text-slate-400 leading-none">휴게시간 (차감)</span>
                      {editing ? (
                        <div className="flex items-center gap-1.5">
                          <label className="inline-flex items-center gap-1 text-[12px] text-slate-700 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={draft?.break_apply_paid ?? true}
                              onChange={(e) => setField("break_apply_paid", e.target.checked)}
                              className="h-3.5 w-3.5 accent-emerald-600"
                            />
                            적용
                          </label>
                          <select
                            value={String(draft?.break_time_minutes ?? 60)}
                            onChange={(e) => setField("break_time_minutes", Number(e.target.value))}
                            disabled={(draft?.break_apply_paid ?? true) === false}
                            className="h-7 text-[12px] px-2 border border-slate-300 rounded-md bg-white disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            <option value="30">30분</option>
                            <option value="60">1시간</option>
                          </select>
                        </div>
                      ) : (
                        <span className="text-[13px] font-semibold leading-snug min-h-[20px] text-slate-700">
                          {(displayEmp.break_apply_paid ?? true) === false
                            ? <span className="text-slate-400 italic">미적용</span>
                            : `${displayEmp.break_time_minutes ?? 60}분 차감`}
                        </span>
                      )}
                    </div>
                    <InlineField
                      label="유급 주휴일"
                      value={editing ? (draft?.weekly_holiday ?? "") : (displayEmp.weekly_holiday ?? "")}
                      editing={editing} placeholder="일요일"
                      onChange={(v) => setField("weekly_holiday", v)}
                    />
                    {/* 연차유급휴가 총일수 · 아래 "연차 · 유급휴가" 섹션에서 편집 */}
                    <InlineField
                      label="근무 장소"
                      value={editing ? (draft?.work_location ?? "") : (displayEmp.work_location ?? "")}
                      editing={editing} placeholder="오산 메가타운 약국" wide
                      onChange={(v) => setField("work_location", v)}
                    />
                    <InlineField
                      label="종사 업무"
                      value={editing ? (draft?.job_duties ?? "") : (displayEmp.job_duties ?? "")}
                      editing={editing} placeholder="조제보조·POS·진열" wide
                      onChange={(v) => setField("job_duties", v)}
                    />
                  </div>
                </SectionCard>

                {/* §7-2 연차 · 유급휴가 — work 그룹 · 스케줄표(월차)와 실시간 연동 */}
                <SectionCard title="연차 · 유급휴가" icon={<CalendarDays size={11} />} group="work" defaultOpen>
                  {(() => {
                    // 총일수 (편집 중이면 draft, 아니면 원본) · 반차 0.5일 가산
                    const totalDaysRaw = editing ? draft?.annual_leave_days : displayEmp.annual_leave_days;
                    const totalDays = Number.isFinite(Number(totalDaysRaw)) ? Number(totalDaysRaw) : 15;
                    const usedDays = usedLeaves.reduce((sum, l) => sum + l.weight, 0);
                    const remainDays = Math.max(0, totalDays - usedDays);
                    const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
                    return (
                      <div className="flex flex-col gap-2.5">
                        {/* 상단 KPI · 잔여 / 총 / 사용 + 연도 셀렉터 */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {/* 잔여 (강조) */}
                            <div className="flex flex-col items-center px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 min-w-[56px]">
                              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">잔여</span>
                              <span className="text-[14px] font-black text-emerald-700 tabular-nums leading-tight">{fmtDays(remainDays)}<span className="text-[10px] font-semibold ml-0.5">일</span></span>
                            </div>
                            {/* 총 · 편집 가능 */}
                            <div className="flex flex-col items-center px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 min-w-[56px]">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">총 부여</span>
                              {editing ? (
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={String(draft?.annual_leave_days ?? "")}
                                  onChange={(e) => setField("annual_leave_days", e.target.value === "" ? null : Number(e.target.value))}
                                  className="w-12 text-center border border-indigo-300 rounded-md px-1 py-0.5 text-[13px] font-black text-slate-800 tabular-nums bg-white focus:outline-none focus:border-indigo-500"
                                />
                              ) : (
                                <span className="text-[14px] font-black text-slate-800 tabular-nums leading-tight">{fmtDays(totalDays)}<span className="text-[10px] font-semibold ml-0.5">일</span></span>
                              )}
                            </div>
                            {/* 사용 */}
                            <div className="flex flex-col items-center px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 min-w-[56px]">
                              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">사용</span>
                              <span className="text-[14px] font-black text-amber-700 tabular-nums leading-tight">{fmtDays(usedDays)}<span className="text-[10px] font-semibold ml-0.5">일</span></span>
                            </div>
                          </div>
                          {/* 연도 선택 */}
                          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-1.5 py-1 shadow-sm">
                            <button
                              type="button"
                              onClick={() => setLeaveYear(y => y - 1)}
                              className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                              title="이전 해"
                            >
                              <ChevronLeft size={13} />
                            </button>
                            <span className="text-[12px] font-bold text-slate-700 tabular-nums px-1 min-w-[46px] text-center">{leaveYear}년</span>
                            <button
                              type="button"
                              onClick={() => setLeaveYear(y => y + 1)}
                              disabled={leaveYear >= currentYearNow}
                              className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title="다음 해"
                            >
                              <ChevronRight size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => selectedEmp && loadUsedLeaves(selectedEmp.id, leaveYear)}
                              className="ml-1 w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-indigo-600 cursor-pointer"
                              title="새로고침"
                            >
                              <RefreshCw size={11} className={leaveLoading ? "animate-spin" : ""} />
                            </button>
                          </div>
                        </div>

                        {/* 사용 이력 리스트 */}
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <SectionLabel color="bg-amber-400">사용한 연차 · {usedLeaves.length}건</SectionLabel>
                            {editing && (
                              <span className="text-[10px] font-semibold text-rose-500">편집 모드 · X 버튼으로 삭제</span>
                            )}
                          </div>
                          {leaveError ? (
                            <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-2 py-1.5">
                              {leaveError}
                            </div>
                          ) : leaveLoading ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 py-2">
                              <Loader2 size={11} className="animate-spin" /> 불러오는 중...
                            </div>
                          ) : usedLeaves.length === 0 ? (
                            <EmptyRow label={`${leaveYear}년 사용한 연차가 없습니다`} />
                          ) : (
                            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                              <table className="w-full text-[12px]">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                  <tr className="text-slate-500 text-[10px] uppercase tracking-wider">
                                    <th className="text-left  font-semibold px-2.5 py-1.5 w-[110px]">날짜</th>
                                    <th className="text-center font-semibold px-1.5 py-1.5 w-[70px]">유형</th>
                                    <th className="text-left  font-semibold px-2 py-1.5">사유 · 메모</th>
                                    {editing && <th className="w-8" />}
                                  </tr>
                                </thead>
                                <tbody>
                                  {usedLeaves.map((leave) => {
                                    const typeColor =
                                      leave.type === "월차"      ? "bg-amber-100 text-amber-700 border-amber-200"
                                      : leave.type === "오전반차" ? "bg-sky-100 text-sky-700 border-sky-200"
                                      : leave.type === "오후반차" ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                                      :                             "bg-slate-100 text-slate-600 border-slate-200";
                                    const isDeleting = deletingLeaveDate === leave.date;
                                    // date → YYYY.MM.DD (요일)
                                    let dowLabel = "";
                                    try {
                                      const d = new Date(leave.date + "T00:00:00");
                                      dowLabel = ["일","월","화","수","목","금","토"][d.getDay()];
                                    } catch { /* ignore */ }
                                    return (
                                      <tr key={leave.date} className="border-t border-slate-100 hover:bg-slate-50/60">
                                        <td className="px-2.5 py-1.5 font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                                          {leave.date.replace(/-/g, ".")}
                                          {dowLabel && <span className="text-[10px] font-normal text-slate-400 ml-1">({dowLabel})</span>}
                                        </td>
                                        <td className="px-1.5 py-1.5 text-center">
                                          <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md border leading-tight ${typeColor}`}>
                                            {leave.type}
                                          </span>
                                        </td>
                                        <td className="px-2 py-1.5 text-[11px] text-slate-600 truncate max-w-[220px]" title={leave.memo}>
                                          {leave.memo || <span className="text-slate-300 italic">-</span>}
                                        </td>
                                        {editing && (
                                          <td className="px-1 py-1.5 text-center">
                                            <button
                                              type="button"
                                              onClick={() => selectedEmp && deleteUsedLeave(selectedEmp.id, leave.date)}
                                              disabled={isDeleting}
                                              className="w-6 h-6 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-40 flex items-center justify-center"
                                              title="이 연차 삭제 (스케줄표에도 반영)"
                                            >
                                              {isDeleting ? <Loader2 size={11} className="animate-spin" /> : <X size={12} />}
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                            연차 승인 시 자동 반영 · 삭제 시 스케줄표(월차)에서도 제거됩니다 · 반차는 0.5일로 계산
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </SectionCard>

                {/* §8 임금 정보 — rose 그룹 */}
                <SectionCard title="임금 정보" icon={<Briefcase size={11} />} group="wage" defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold text-slate-400 leading-none">임금 유형</span>
                      {editing ? (
                        <select
                          value={draft?.wage_calc_type ?? ""}
                          onChange={(e) => setField("wage_calc_type", e.target.value || null)}
                          className="border border-indigo-300 rounded-md px-2 text-[13px] focus:outline-none focus:border-indigo-500 bg-indigo-50/40 h-7"
                        >
                          <option value="">선택 안 함</option>
                          <option value="hourly">시급</option>
                          <option value="daily">일급</option>
                          <option value="monthly">월급</option>
                          <option value="annual">연봉</option>
                        </select>
                      ) : (
                        <span className="text-[13px] font-semibold leading-snug min-h-[20px] text-slate-700">
                          {({ hourly: "시급", daily: "일급", monthly: "월급", annual: "연봉" } as Record<string, string>)[displayEmp.wage_calc_type ?? ""] ?? <span className="text-slate-300 italic">(미지정)</span>}
                        </span>
                      )}
                    </div>
                    <InlineField
                      label="임금액 (원)"
                      value={editing ? String(draft?.wage_amount ?? "") : String(displayEmp.wage_amount ?? "")}
                      editing={editing} type="number" placeholder="10030"
                      monospace
                      onChange={(v) => setField("wage_amount", v === "" ? null : Number(v))}
                    />
                    <InlineField
                      label="지급일"
                      value={editing ? (draft?.wage_pay_day ?? "") : (displayEmp.wage_pay_day ?? "")}
                      editing={editing} placeholder="매월 10일"
                      onChange={(v) => setField("wage_pay_day", v)}
                    />
                    <InlineField
                      label="지급 방법"
                      value={editing ? (draft?.wage_pay_method ?? "") : (displayEmp.wage_pay_method ?? "")}
                      editing={editing} placeholder="계좌이체"
                      onChange={(v) => setField("wage_pay_method", v)}
                    />
                    <InlineField
                      label="은행"
                      value={editing ? (draft?.bank_name ?? "") : (displayEmp.bank_name ?? "")}
                      editing={editing} placeholder="국민은행"
                      onChange={(v) => setField("bank_name", v)}
                    />
                    <InlineField
                      label="계좌번호"
                      value={editing ? (draft?.bank_account_no ?? "") : (displayEmp.bank_account_no ?? "")}
                      editing={editing} placeholder="123-45-6789012"
                      monospace
                      onChange={(v) => setField("bank_account_no", v)}
                    />
                  </div>
                </SectionCard>

                {/* §9 4대보험 — rose 그룹 */}
                <SectionCard title="4대보험" icon={<ClipboardList size={11} />} group="wage" defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <InlineField
                      label="국민연금 취득일"
                      value={editing ? (draft?.insurance_nps_date ?? "") : (displayEmp.insurance_nps_date ?? "")}
                      editing={editing} icon={<Calendar size={9} />} type="date"
                      onChange={(v) => setField("insurance_nps_date", v)}
                    />
                    <InlineField
                      label="건강보험 취득일"
                      value={editing ? (draft?.insurance_nhis_date ?? "") : (displayEmp.insurance_nhis_date ?? "")}
                      editing={editing} icon={<Calendar size={9} />} type="date"
                      onChange={(v) => setField("insurance_nhis_date", v)}
                    />
                    <InlineField
                      label="고용보험 취득일"
                      value={editing ? (draft?.insurance_ei_date ?? "") : (displayEmp.insurance_ei_date ?? "")}
                      editing={editing} icon={<Calendar size={9} />} type="date"
                      onChange={(v) => setField("insurance_ei_date", v)}
                    />
                    <InlineField
                      label="산재보험 취득일"
                      value={editing ? (draft?.insurance_wcia_date ?? "") : (displayEmp.insurance_wcia_date ?? "")}
                      editing={editing} icon={<Calendar size={9} />} type="date"
                      onChange={(v) => setField("insurance_wcia_date", v)}
                    />
                    <div className="col-span-2 flex items-center gap-2">
                      {editing ? (
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!draft?.insurance_excluded}
                            onChange={(e) => setField("insurance_excluded", e.target.checked)}
                            className="w-3.5 h-3.5 rounded"
                          />
                          4대보험 제외 대상
                        </label>
                      ) : displayEmp.insurance_excluded ? (
                        <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-px rounded-md">4대보험 제외 대상</span>
                      ) : null}
                    </div>
                  </div>
                </SectionCard>

                {/* §10 약국 특수 자격 — emerald 그룹 */}
                <SectionCard title="약국 특수 자격" icon={<Award size={11} />} group="career" defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <InlineField
                      label="약사 면허번호"
                      value={editing ? (draft?.pharmacist_license_no ?? "") : (displayEmp.pharmacist_license_no ?? "")}
                      editing={editing} placeholder="약사 면허번호"
                      monospace
                      onChange={(v) => setField("pharmacist_license_no", v)}
                    />
                    <InlineField
                      label="보건증 만료일"
                      value={editing ? (draft?.health_check_expiry ?? "") : (displayEmp.health_check_expiry ?? "")}
                      editing={editing} icon={<Calendar size={9} />} type="date"
                      onChange={(v) => setField("health_check_expiry", v)}
                    />
                  </div>
                </SectionCard>

                {/* §11 메모 — personal 그룹 */}
                <SectionCard title="메모" icon={<ClipboardList size={11} />} group="personal" defaultOpen={false}>
                  {editing ? (
                    <textarea
                      value={draft?.memo ?? ""}
                      onChange={(e) => setField("memo", e.target.value)}
                      placeholder="근무 특이사항 · 알러지 · 기타 참고 사항"
                      rows={3}
                      className="w-full border border-indigo-300 rounded-md px-2.5 py-2 text-[12px] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 bg-indigo-50/40 resize-none"
                    />
                  ) : (
                    <p className={`text-[12px] whitespace-pre-wrap ${displayEmp.memo ? "text-slate-700" : "text-slate-300 italic"}`}>
                      {displayEmp.memo || "(없음)"}
                    </p>
                  )}
                </SectionCard>

                <div className="h-2" />
              </div>
            </>
          )}
        </section>
      </div>

      {/* ── 모바일 상세 모달 · 가운데 위치 (2026-08-03 사용자 요청) ── */}
      {mobileDetail && selectedEmp && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setMobileDetail(false)}
        >
          <div
            className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[86vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 to-violet-50/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <Avatar name={selectedEmp.name} photoUrl={selectedEmp.photo_url} size="xs" />
                <div>
                  <span className="text-sm font-bold text-slate-800">{selectedEmp.name}</span>
                  <span className={`ml-2 text-[9px] font-semibold px-1.5 py-px rounded-md border ${positionColor(selectedEmp.position)}`}>
                    {selectedEmp.position || "직책 없음"}
                  </span>
                </div>
              </div>
              <button onClick={() => setMobileDetail(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/70 transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3.5 bg-slate-50/40 space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5 bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
                {(
                  [
                    ["연락처", selectedEmp.phone],
                    ["이메일", selectedEmp.email],
                    ["입사일", selectedEmp.hire_date],
                    ["근속기간", selectedEmp.hire_date ? calcTenure(selectedEmp.hire_date) : null],
                    ["계약유형", contractTypeMeta(selectedEmp.contract_type)?.label ?? null],
                    ["인사평가", selectedEmp.performance_rating ? String(selectedEmp.performance_rating).toUpperCase() : null],
                    ["권한레벨", selectedEmp.level != null ? `Lv.${selectedEmp.level}` : null],
                    ["근무타입", selectedEmp.schedule_type],
                    ["담당구역", selectedEmp.work_area],
                  ] as [string, string | null | undefined][]
                ).map(([label, val]) =>
                  val ? (
                    <div key={label} className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                      <span className="text-[12px] font-semibold text-slate-700">{val}</span>
                    </div>
                  ) : null
                )}
                {/* 근로계약서 · 별도 버튼 */}
                <div className="col-span-2 flex flex-col gap-0.5 pt-1 border-t border-slate-100 mt-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">근로계약서</span>
                  {selectedEmp.contract_file_url ? (
                    <button
                      type="button"
                      onClick={() => window.open(selectedEmp.contract_file_url as string, "_blank", "noopener,noreferrer")}
                      className="mt-1 inline-flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm cursor-pointer self-start"
                    >
                      <ExternalLink size={11} /> 보기
                    </button>
                  ) : (
                    <span className="text-[11px] font-semibold text-slate-400 italic mt-1">없음</span>
                  )}
                </div>
              </div>
              {selectedEmp.memo && (
                <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">메모</span>
                  <p className="text-[12px] text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedEmp.memo}</p>
                </div>
              )}
            </div>
            <div className="px-3.5 py-2.5 border-t border-slate-100 bg-white flex gap-1.5 shrink-0">
              <button
                onClick={() => { setMobileDetail(false); startEdit(selectedEmp); }}
                className="flex-1 h-9 text-[12px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer hover:bg-indigo-100 transition-colors"
              >
                <Edit2 size={13} /> 편집
              </button>
              <button
                onClick={() => { setMobileDetail(false); deleteEmployee(selectedEmp); }}
                className="h-9 px-4 text-[12px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl flex items-center gap-1.5 cursor-pointer hover:bg-red-100 transition-colors"
              >
                <Trash2 size={13} /> 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 신규 등록 모달 ── */}
      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onSave={createEmployee}
          saving={createSaving}
        />
      )}
    </main>
  );
};

export default StaffManagePage;
