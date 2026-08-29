// 2026-08-16 · 서버·클라 공유 · 직원 응답 DTO
// 2026-08-29 · #182 Phase A · DTO 일치화 · src/types.ts Employee 와 필드 일치 (누락 5 필드 추가)
//   · Phase 1+2 슬림화 후 · DTO 이중화 · 편집 시 데이터 손실 위험 해결
//   · resident_number · push_subscription · break_time_minutes · break_apply_paid · primary_focus · primary_focus_percent 추가
export interface Employee {
  id: number;
  name: string;
  position: string;
  rank: string | null;
  employmentType: string;
  hireDate: string;
  retireDate: string | null;
  description: string;
  workplace: string;
  gender: string | null;
  phone: string | null;
  annual_leave_days: number | null;
  level: number | null;
  address: string | null;
  email: string | null;
  bankbook_image_url: string | null;
  employee_number: string | null;
  // 2026-08-29 · #182 Phase A · types.ts 와 일치화
  resident_number?: string | null;         // 주민등록번호 (마스킹 처리)
  push_subscription?: object | null;       // Web Push 구독
  break_time_minutes?: number | null;      // 일일 휴게시간 (분) · 기본 60
  break_apply_paid?: boolean | null;       // 인건비 계산 시 휴게 차감 여부
  primary_focus?: "매장" | "창고" | null;  // #186 · 우선 담당 물류
  primary_focus_percent?: number | null;   // #186 · 우선 담당 비중 (%)
  contract_file_url?: string | null;       // 근로계약서 PDF URL
  resignation_file_url?: string | null;    // 사직서 파일 URL
  resume_url?: string | null;              // 이력서 파일 URL
}

/** GET /api/employees/next-number · 다음 사번 응답 */
export interface NextEmployeeNumberResponse {
  nextNumber: string; // 예: "001" · 3자리 zero-pad
}
