// src/types.ts

export type AuthRole = 'superadmin' | 'admin' | 'manager' | 'employee' | 'vendor';

export interface AuthSession {
  role: AuthRole;
  employeeId?: number;
  employeeName?: string;
  employeeRank?: string;
  level?: number; // 0-9: 0=차단, 1-6=직원, 7=관리자, 8=대표(admin), 9=최고관리자
  /** Unix ms — time the session was originally created (used for absolute timeout) */
  loginAt?: number;
  /** Unix ms — last recorded user activity (used for idle timeout) */
  lastActiveAt?: number;
  /** When true, idle/absolute timeouts are skipped — session persists until explicit logout */
  rememberMe?: boolean;
}

export interface Schedule {
  id?: number;
  employeeId: number;
  date: string; // format: YYYY-MM-DD
  type: string; // "오픈" | "마감" | "휴무" | "월차" | "지정휴무" | "오전반차" | "오후반차"
  workingHours: string;
  actualHours: string;
  memo?: string;
}

export interface Employee {
  id: number;
  name: string;
  position: string;     // 구분: 약사 | 캐셔 | 진열 | 물류 | 알바 | 기타
  rank?: string;        // 직급: 대표 | 부장 | 팀장 | 과장 | 사원 | ...
  employmentType: string; // 정직원 | 계약직 | 알바
  hireDate: string;
  retireDate?: string | null; // 퇴사일 (YYYY-MM-DD). null이면 현직.
  description: string;
  workplace: string; // "매장" or "창고"
  gender?: "남" | "여";
  phone?: string; // 핸드폰번호 (로그인 ID로 사용)
  address?: string | null; // 주소 (마이페이지에서 본인이 수정 가능)
  email?: string | null;             // 이메일
  resident_number?: string | null;   // 주민등록번호 (마스킹 처리 주의)
  push_subscription?: object | null; // Web Push 구독 정보
  annual_leave_days?: number | null;
  level?: number | null; // 0-9: 1=직원, 8=대표, 9=최고관리자
  contract_file_url?: string | null;
  resignation_file_url?: string | null; // T-Staff-ResignationColumn · 사직서 파일 URL (Supabase Storage · resignations 버킷)
  resume_url?: string | null; // T21 · 이력서 파일 URL (Supabase Storage · resumes 버킷)
  bankbook_image_url?: string | null; // 통장사본 · base64 dataURL 또는 Supabase Storage URL · 인건비 이체 검증용
  employee_number?: string | null; // 사번 · 인사 관리용 식별자 · 근로계약서와 연결
  break_time_minutes?: number | null; // 일일 휴게시간 (분) · 기본 60
  break_apply_paid?: boolean | null;  // 인건비 계산 시 휴게 차감 여부 · 기본 true
  /** #186 · 우선 담당 물류 · "매장" | "창고" · null 은 미지정 */
  primary_focus?: "매장" | "창고" | null;
  /** #186 · 우선 담당 비중 (%) · 기본 70 · null 이면 미적용 */
  primary_focus_percent?: number | null;
  schedules: Schedule[];
}

export interface PagePermission {
  read: number;  // minimum level to view
  write: number; // minimum level to edit/submit
  /** 2026-08-12 · #100 · 이 직군에 속하면 · 레벨 무관하게 읽기 허용 (OR 조건). 미지정 = 레벨만 판정 */
  readPositions?: string[];
  /** 2026-08-12 · #100 · 이 직군에 속하면 · 레벨 무관하게 쓰기 허용 (OR 조건). 미지정 = 레벨만 판정 */
  writePositions?: string[];
  /** 2026-08-16 · 페이지 숨김 · true 면 모든 사용자에게 사이드바에서 노출 안됨 (권한 무관) · lv 9 관리자는 예외 */
  hidden?: boolean;
}

// 2026-08-12 · 신규 페이지 반영 (승인요청·경영·설정 등) · 사이드바 그룹과 정합
// 2026-08-16 · 인덱스 시그니처 추가 · subTab 복합키 (`{pageKey}:{subTab}`) 저장 허용
//   예: "display:purchase-order", "approval-request:leave"
//   기존 명시 키 (schedule, display 등) 는 부모 페이지 fallback 용
export interface PagePermissions {
  schedule: PagePermission;
  display: PagePermission;
  scan: PagePermission;
  productarrival: PagePermission;
  requests: PagePermission;
  leave: PagePermission;
  "approval-request": PagePermission;
  ocr: PagePermission;
  upload: PagePermission;
  reservation: PagePermission;
  lunch: PagePermission;
  stockcheck: PagePermission;
  stockarrivals: PagePermission;
  pharmacist: PagePermission;
  board: PagePermission;
  "business-manage": PagePermission;
  "hr-forms": PagePermission;
  mypage: PagePermission;
  "zone-labels": PagePermission;
  permissions: PagePermission;
  branding: PagePermission;
  "company-info": PagePermission;
  "season-settings": PagePermission;
  /** subTab 복합키 · 예: "display:purchase-order" · 부모 페이지 설정 override */
  [subTabKey: string]: PagePermission;
}

export const DEFAULT_PERMISSIONS: PagePermissions = {
  schedule:  { read: 1, write: 1 },
  display:   { read: 2, write: 2 },
  scan:      { read: 1, write: 1 },
  productarrival: { read: 2, write: 2 },
  requests:  { read: 2, write: 2 },
  leave:     { read: 1, write: 1 },
  "approval-request": { read: 1, write: 1 },
  ocr:       { read: 2, write: 2 },
  upload:    { read: 2, write: 2 },
  reservation: { read: 1, write: 1 },
  lunch:     { read: 1, write: 1 },
  stockcheck: { read: 1, write: 1 },
  stockarrivals: { read: 2, write: 2 },
  // 약사 전용 · 열람 level ≥ 3 (약사) · 업로드 level ≥ 8 (관리자)
  pharmacist: { read: 3, write: 8 },
  board:     { read: 1, write: 1 },
  "business-manage": { read: 2, write: 2 },
  "hr-forms":       { read: 2, write: 2 },
  mypage:    { read: 1, write: 1 },
  "zone-labels":    { read: 2, write: 2 },
  permissions:      { read: 9, write: 9 },
  branding:         { read: 9, write: 9 },
  "company-info":   { read: 9, write: 9 },
  "season-settings": { read: 9, write: 9 },
};

export interface MonthlySummary {
  day: number;
  date: string; // format: YYYY-MM-DD
  openCount: number;
  middleCount: number;
  closeCount: number;
  totalCount: number;
  pharmacistCount: number;
  staffCount: number;  // 약사·알바 제외 사원
  otherCount: number;  // 알바(기타)
}

// T-CompanyInfo-DB · 근로계약서 사업주 정보 · settings "company_info" key 로 서버 저장
export interface CompanyInfo {
  name: string;
  address: string;
  regNo: string;
  representativeName: string;
  representativeTitle?: string;
  phone?: string;
}

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  name: "오산 메가타운 약국",
  address: "경기도 오산시 경기대로 868-4 2층",
  regNo: "",
  representativeName: "강남성",
};

// T-Contract-PaymentDay · 근로계약서 임금지급일 · settings "payment_day_text" key
export const DEFAULT_PAYMENT_DAY_TEXT = "당월 01일부터 당월 말일 까지 근로한 부분에 대하여 당월 말일에 '을' 본인 명의의 통장으로 지급한다.";

// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-12 · 프레임워크 준비 · 브랜딩·연락처·도장·모바일가시성 (settings key wrapping)
// ─────────────────────────────────────────────────────────────────────────────

/** 브랜드 아이덴티티 · settings "brand_identity" key */
export interface BrandIdentity {
  /** 2026-08-16 · 지역명 · 예: "오산" · shortName 앞에 줄바꿈으로 표시 */
  region?: string;
  shortName: string;         // 사이드바/푸터 · 예: "메가타운 약국"
  brandNameEn: string;       // 랜딩 히어로 · "OSAN MEGATOWN"
  brandAccentWord: string;   // 랜딩 컬러 강조 · "MEGATOWN"
  appTitle: string;          // document.title · "오산메가타운 관리시스템"
  logoUrl?: string;          // 없으면 bundled fallback
  faviconUrl?: string;       // 없으면 bundled fallback
}
export const DEFAULT_BRAND_IDENTITY: BrandIdentity = {
  region: "오산",
  shortName: "메가타운 약국",
  brandNameEn: "OSAN MEGATOWN",
  brandAccentWord: "MEGATOWN",
  appTitle: "오산메가타운 관리시스템",
};

/** 지역 + 브랜드명 조합 · 2줄 표시용 · "지역\nshortName" · region 없으면 shortName 만 */
export function formatBrandDisplay(brand: Pick<BrandIdentity, "region" | "shortName">): string {
  if (brand.region?.trim()) return `${brand.region.trim()}\n${brand.shortName}`;
  return brand.shortName;
}

/** 연락처·저작권 · settings "contact_info" key */
export interface ContactInfo {
  phone: string;
  email: string;
  website: string;
  businessHours: string;      // "09:00 - 22:00"
  copyrightText: string;      // 푸터 · "(주)이룸즈(IRUMS)"
  kakaoChannelUrl: string;    // "https://pf.kakao.com/_XWuiX/friend"
  kakaoQrImageUrl?: string;   // 없으면 bundled fallback
}
export const DEFAULT_CONTACT_INFO: ContactInfo = {
  phone: "",
  email: "",
  website: "",
  businessHours: "09:00 - 22:00",
  copyrightText: "(주)이룸즈(IRUMS)",
  kakaoChannelUrl: "https://pf.kakao.com/_XWuiX/friend",
};

/** 도장 매핑 · settings "stamps_map" key · 이름 → 도장 이미지 */
export interface StampMapping {
  name: string;        // "강남성" 등 사업주/대표자 이름
  imageUrl: string;    // Supabase Storage or 상대 경로
  bundledFallback?: "sungstamp" | "kyustamp";  // 기존 bundled 이미지 (하위호환)
}
export const DEFAULT_STAMPS_MAP: StampMapping[] = [
  { name: "강남성", imageUrl: "", bundledFallback: "sungstamp" },
  { name: "강남규", imageUrl: "", bundledFallback: "kyustamp" },
];

/** 페이지별 모바일 사용여부 · settings "mobile_visibility" key
 *  · 값 없거나 undefined 는 default (허용)
 *  · false 면 · 모바일에서 접근 시 "PC 전용 화면입니다" 안내
 *  · @deprecated 2026-08-12 · Phase 6 · MobileMinLevelMap 으로 대체 · 하위호환 유지
 */
export type MobileVisibilityMap = Partial<Record<string, boolean>>; // pageKey → allowed
export const DEFAULT_MOBILE_VISIBILITY: MobileVisibilityMap = {
  // 기본 · 모든 페이지 모바일 허용 (false 로 명시된 것만 차단)
};

/** 페이지별 모바일 최소 레벨 · settings "mobile_min_level" key
 *  · 값 없거나 undefined 는 · 0 (모두 허용)
 *  · 예: { display: 9 } → 매장 페이지 · 모바일에서는 lv 9 이상만 접근
 *  · userLevel >= minLevel 이면 접근 가능 · 아니면 "PC 전용 화면입니다" 안내
 */
export type MobileMinLevelMap = Partial<Record<string, number>>;
export const DEFAULT_MOBILE_MIN_LEVEL: MobileMinLevelMap = {};
