// src/lib/leaveApi.ts
// 2026-09-14 · 프레임워크 · 연차 API 클라이언트 래퍼
//   · server/routes/daily/leave.ts
//   · 7+ 호출 사이트 통합 · CRUD + pending count

import { api } from "./apiClient";

export interface LeaveRequestRow {
  id: string;
  employee_id: number;
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
  status: "pending" | "approved" | "rejected";
  reviewer_note?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface CreateLeaveRequestInput {
  employee_id: number;
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason?: string;
}

/** GET /api/leave-requests · 리스트 (my or all) */
export async function listLeaveRequests(params?: {
  employeeId?: number;
  all?: boolean;
}): Promise<LeaveRequestRow[]> {
  const qs = new URLSearchParams();
  if (params?.employeeId != null) qs.set("employeeId", String(params.employeeId));
  if (params?.all) qs.set("all", "true");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const { data } = await api.get<LeaveRequestRow[]>(`/api/leave-requests${suffix}`);
  return Array.isArray(data) ? data : [];
}

/** GET /api/leave-requests/pending-count · 대기 건수 */
export async function getLeavePendingCount(): Promise<number> {
  const { data } = await api.get<{ count?: number }>("/api/leave-requests/pending-count");
  return Number(data?.count ?? 0);
}

/** POST /api/leave-requests · 신청 */
export async function createLeaveRequest(input: CreateLeaveRequestInput): Promise<void> {
  await api.post("/api/leave-requests", input);
}

/** PUT /api/leave-requests/:id · 승인·반려 (reviewer_note 포함) */
export async function reviewLeaveRequest(
  id: string,
  input: { status: "approved" | "rejected"; reviewer_note?: string }
): Promise<void> {
  await api.put(`/api/leave-requests/${id}`, input);
}

/** DELETE /api/leave-requests/:id · 취소 (본인) or 삭제 (관리자) */
export async function deleteLeaveRequest(id: string): Promise<void> {
  await api.del(`/api/leave-requests/${id}`);
}
