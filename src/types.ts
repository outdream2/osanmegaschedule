// src/types.ts

export type AuthRole = 'superadmin' | 'admin' | 'manager' | 'employee';

export interface AuthSession {
  role: AuthRole;
  employeeId?: number;
  employeeName?: string;
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
  description: string;
  workplace: string; // "매장" or "창고"
  gender?: "남" | "여";
  push_subscription?: object | null; // Web Push 구독 정보
  annual_leave_days?: number | null;
  level?: number | null; // 0-9: 1=직원, 8=대표, 9=최고관리자
  schedules: Schedule[];
}

export interface MonthlySummary {
  day: number;
  date: string; // format: YYYY-MM-DD
  openCount: number;
  middleCount: number;
  closeCount: number;
  totalCount: number;
  pharmacistCount: number;
  staffCount: number;
}
