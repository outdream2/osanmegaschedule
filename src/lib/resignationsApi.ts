// src/lib/resignationsApi.ts
// 2026-09-14 · 프레임워크 · 사직서 API 클라이언트 래퍼
//   · server/routes/staff/resignations.ts
//   · 5+ 호출 사이트 통합

import { api } from "./apiClient";

export interface ResignationRow {
  id: number;
  employee_id: number;
  employee_name: string;
  position: string | null;
  hire_date: string | null;
  last_work_date: string;
  reason: string;
  reason_detail: string | null;
  handover_notes: string | null;
  signature_data_url: string | null;
  pdf_url: string | null;
  status: "pending" | "approved" | "rejected";
  reject_reason?: string | null;
  approved_by?: string | null;
  approved_by_id?: number | null;
  approved_at?: string | null;
  created_at: string;
}

export interface CreateResignationInput {
  employee_id: number;
  employee_name: string;
  position?: string | null;
  hire_date?: string | null;
  last_work_date: string;
  reason: string;
  reason_detail?: string | null;
  handover_notes?: string | null;
  signature_data_url: string | null;
  pdf_url?: string | null;
}

export interface ReviewResignationInput {
  status: "approved" | "rejected";
  reject_reason?: string;
  approved_by?: string;
  approved_by_id?: number;
}

/** GET /api/resignations · 리스트 */
export async function listResignations(): Promise<ResignationRow[]> {
  const { data } = await api.get<ResignationRow[]>("/api/resignations");
  return Array.isArray(data) ? data : [];
}

/** GET /api/resignations/pending-count · 대기 건수 */
export async function getResignationPendingCount(): Promise<number> {
  const { data } = await api.get<{ count?: number }>("/api/resignations/pending-count");
  return Number(data?.count ?? 0);
}

/** POST /api/resignations · 사직서 제출 */
export async function createResignation(input: CreateResignationInput): Promise<void> {
  await api.post("/api/resignations", input);
}

/** PATCH /api/resignations/:id · 승인·반려 */
export async function reviewResignation(id: number, input: ReviewResignationInput): Promise<void> {
  await api.patch(`/api/resignations/${id}`, input);
}
