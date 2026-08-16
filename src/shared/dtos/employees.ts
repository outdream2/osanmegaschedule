// 2026-08-16 · 서버·클라 공유 · 직원 응답 DTO
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
}

/** GET /api/employees/next-number · 다음 사번 응답 */
export interface NextEmployeeNumberResponse {
  nextNumber: string; // 예: "001" · 3자리 zero-pad
}
