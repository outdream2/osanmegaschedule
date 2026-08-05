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
  push_subscription?: object | null; // Web Push 구독 정보
  annual_leave_days?: number | null;
  level?: number | null; // 0-9: 1=직원, 8=대표, 9=최고관리자
  contract_file_url?: string | null;
  resume_url?: string | null; // T21 · 이력서 파일 URL (Supabase Storage · resumes 버킷)
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
}

export interface PagePermissions {
  schedule: PagePermission;
  display: PagePermission;
  scan: PagePermission;
  requests: PagePermission;
  leave: PagePermission;
  ocr: PagePermission;
  upload: PagePermission;
  reservation: PagePermission;
  lunch: PagePermission;
  stockcheck: PagePermission;
  pharmacist: PagePermission;
}

export const DEFAULT_PERMISSIONS: PagePermissions = {
  schedule:  { read: 1, write: 1 },
  display:   { read: 2, write: 2 },
  scan:      { read: 1, write: 1 },
  requests:  { read: 2, write: 2 },
  leave:     { read: 1, write: 1 },
  ocr:       { read: 2, write: 2 },
  upload:    { read: 2, write: 2 },
  reservation: { read: 1, write: 1 },
  lunch:     { read: 1, write: 1 },
  stockcheck: { read: 1, write: 1 },
  // 약사 전용 · 열람 level ≥ 3 (약사) · 업로드 level ≥ 8 (관리자)
  pharmacist: { read: 3, write: 8 },
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
