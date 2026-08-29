// src/components/StaffManagePage/types.ts
// 2026-08-21 · Framework Phase 4 · StaffManagePage 대형 파일 분리 · types + constants 이관

// ─── 인적사항 / 인사기록 카드 ─────────────────────────────────────────────
export interface CareerItem {
  id: string;
  company: string;
  period: string;
  desc?: string;
}

export interface EducationItem {
  id: string;
  school: string;
  major?: string;
  grad?: string;
}

export interface CertItem {
  id: string;
  name: string;
  issuer?: string;
  date?: string;
}

// ─── 직원 엔터티 ────────────────────────────────────────────────────────────
export interface Employee {
  id: number;
  name: string;
  position?: string | null;
  /** 2026-08-29 · #177 · 직급 · 대표·부장·팀장·과장·대리·사원 등 · 시스템설정 · 직급 탭에서 목록 편집 */
  rank?: string | null;
  phone?: string | null;
  email?: string | null;
  level?: number | null;
  role?: string | null;
  contract_file_url?: string | null;
  resignation_file_url?: string | null; // T-Staff-ResignationColumn · 사직서 파일 URL · 퇴사자 전용
  resume_url?: string | null;  // T21 · 이력서 · Google Drive URL
  bankbook_image_url?: string | null;  // 통장사본 · base64 or URL (ContractWriterPage 첨부 · employees 컬럼 optional)
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

export type EditDraft = Pick<
  Employee,
  | "name" | "position" | "rank" | "phone" | "email" | "level" | "role"
  | "hire_date" | "memo" | "contract_file_url" | "resume_url" | "photo_url"
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
export const POSITIONS = ["약사", "창고", "매장", "매니저", "기타"] as const;
export const SCHEDULE_TYPES = ["오픈", "미들", "마감", "클로징", "자유", "풀타임"] as const;
export const GENDERS = ["남", "여"] as const;

// 계약유형 (regular/fixed_term/part_time/daily/intern)
export const CONTRACT_TYPES: { value: string; label: string; short: string }[] = [
  { value: "regular",    label: "정규직",  short: "정규" },
  { value: "fixed_term", label: "계약직",  short: "계약" },
  { value: "part_time",  label: "알바",    short: "알바" },
  { value: "daily",      label: "일용직",  short: "일용" },
  { value: "intern",     label: "인턴",    short: "인턴" },
];

// 인사평가 등급
export const PERFORMANCE_RATINGS: { value: string; label: string }[] = [
  { value: "S", label: "S · 탁월" },
  { value: "A", label: "A · 우수" },
  { value: "B", label: "B · 양호" },
  { value: "C", label: "C · 보통" },
  { value: "D", label: "D · 미흡" },
];

// ─── 아바타 컬러 팔레트 ────────────────────────────────────────────────────
export const AVATAR_COLORS = [
  "bg-brand-deep",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-rose-500",
  "bg-violet-500",
] as const;

// ─── 섹션 그룹 컬러 맵 ──────────────────────────────────────────────────────
// 4그룹: 인적사항(sky) · 근무·계약(amber) · 경력·자격(emerald) · 임금·보험(rose)
export type SectionGroup = "personal" | "work" | "career" | "wage";

export const GROUP_HEADER: Record<SectionGroup, string> = {
  personal: "bg-sky-50    border-sky-100   text-sky-700",
  work:     "bg-amber-50  border-amber-100  text-amber-700",
  career:   "bg-emerald-50 border-emerald-100 text-emerald-700",
  wage:     "bg-rose-50   border-rose-100   text-rose-700",
};

export const GROUP_ICON: Record<SectionGroup, string> = {
  personal: "text-sky-400",
  work:     "text-amber-400",
  career:   "text-emerald-400",
  wage:     "text-rose-400",
};
