// src/types.ts

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
  position: string;     // 약사 | 캐셔 | 물류 | 대표 | 임원
  employmentType: string; // 정직원 | 계약직 | 알바
  hireDate: string;
  description: string;
  workplace: string; // "매장" or "창고"
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
