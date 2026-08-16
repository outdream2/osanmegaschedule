// 2026-08-16 · 서버·클라 공유 · 점심 응답 DTO
export interface LunchRequest {
  id: number;
  employee_id: number;
  employee_name: string;
  date: string;
  eating: boolean;
  memo: string | null;
  updated_at: string;
}

/** GET /api/lunch-requests?date=YYYY-MM-DD */
export interface LunchRequestsResponse {
  requests: LunchRequest[];
  count: number;
}

/** GET /api/lunch-attendance?date=YYYY-MM-DD · 출근 현황 */
export interface LunchAttendanceResponse {
  working: { id: number; name: string; position: string }[];
  pharmacistCount: number;
  staffCount: number;
  totalCount: number;
}
