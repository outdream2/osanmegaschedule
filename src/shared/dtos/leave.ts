// 2026-08-16 · 서버·클라 공유 · 연차 응답 DTO
export interface LeaveRequest {
  id: number;
  employee_id: number;
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewer_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

/** GET /api/leave-balance · 잔여 연차 */
export interface LeaveBalanceResponse {
  total: number;      // 연 부여
  used: number;       // 사용 (반차 0.5)
  remaining: number;  // 잔여
}

/** GET /api/leave-stats?year=YYYY · 월차 사용 통계 */
export type LeaveStatsResponse = Record<number, number>; // { employeeId: 사용일수 }
