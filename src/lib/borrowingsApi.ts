// src/lib/borrowingsApi.ts
// 2026-08-31 · #9 Phase A · 차용 API 클라이언트 래퍼
//   · server/routes/payment/borrowings.ts endpoint 통합 호출
//   · framework · api client 재사용 · ApiError 표준 · Zod 스키마 나중에

import { api, ApiError } from "./apiClient";

// ═══════════════════════════════════════════════════════
// 타입 정의
// ═══════════════════════════════════════════════════════

export interface BorrowingParty {
  id: number;
  party_type: "self" | "vendor" | "external";
  vendor_id?: number | null;
  employee_id?: number | null;
  name: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  memo?: string | null;
}

export interface BorrowingSignature {
  id: number;
  role: "lender" | "borrower" | "lender_return" | "borrower_return" | "witness";
  signer_name: string;
  signer_id?: number | null;
  party_id?: number | null;
  signature_url: string;
  stamp_url?: string | null;
  signed_at: string;
  ip_address?: string | null;
  intent_text?: string | null;
}

export interface BorrowingRow {
  id: number;
  created_at: string;
  direction: "lend" | "borrow";
  supplier: string | null;
  product_code: string | null;
  product_name: string | null;
  qty: number;
  unit_price: number | null;
  due_date: string | null;
  note: string | null;
  signature_url: string | null;
  status: "open" | "settled" | "cancelled";
  settled_at: string | null;
  created_by: string | null;
  created_by_id: number | null;
  return_signature_url: string | null;
  returned_by: string | null;
  returned_by_id: number | null;
  returned_at: string | null;
  return_note: string | null;
  // 2026-08-31 · #9 Phase A 확장
  lender_party_id?: number | null;
  borrower_party_id?: number | null;
  contract_no?: string | null;
  overdue_notified_at?: string | null;
}

export interface CreateBorrowingInput {
  direction: "lend" | "borrow";
  supplier?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  qty: number;
  unit_price?: number | null;
  due_date?: string | null;
  note?: string | null;
  signature_url?: string | null;
  created_by?: string | null;
  created_by_id?: number | null;
  // Phase A 확장
  lender_party_id?: number | null;
  borrower_party_id?: number | null;
  signatures?: Array<Omit<BorrowingSignature, "id" | "signed_at" | "ip_address">>;
}

export interface CreatePartyInput {
  party_type: "self" | "vendor" | "external";
  vendor_id?: number | null;
  employee_id?: number | null;
  name: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  memo?: string | null;
}

// ═══════════════════════════════════════════════════════
// 리스트·CRUD
// ═══════════════════════════════════════════════════════

export interface ListBorrowingsParams {
  status?: "open" | "settled" | "cancelled";
  supplier?: string;
  direction?: "lend" | "borrow";
  days?: number;
  limit?: number;
}

/** GET /api/borrowings · 리스트 조회 */
export async function listBorrowings(params?: ListBorrowingsParams): Promise<BorrowingRow[]> {
  const qs = new URLSearchParams();
  if (params?.status)    qs.set("status", params.status);
  if (params?.supplier)  qs.set("supplier", params.supplier);
  if (params?.direction) qs.set("direction", params.direction);
  if (params?.days)      qs.set("days", String(params.days));
  if (params?.limit)     qs.set("limit", String(params.limit));
  const { data } = await api.get<{ rows: BorrowingRow[]; count?: number }>(`/api/borrowings?${qs.toString()}`);
  return data?.rows ?? [];
}

/** POST /api/borrowings · 신규 등록 (Phase A · signatures[] 지원) */
export async function createBorrowing(input: CreateBorrowingInput): Promise<BorrowingRow> {
  const { data } = await api.post<{ ok: boolean; row: BorrowingRow }>("/api/borrowings", input);
  if (!data?.row) throw new ApiError(500, "등록 실패 · 응답 무효");
  return data.row;
}

/** PATCH /api/borrowings/:id · 상태·수량·메모 수정 */
export async function patchBorrowing(id: number, patch: Partial<CreateBorrowingInput> & { status?: BorrowingRow["status"] }): Promise<BorrowingRow> {
  const { data } = await api.patch<{ ok: boolean; row: BorrowingRow }>(`/api/borrowings/${id}`, patch);
  return data.row;
}

/** PATCH /api/borrowings/:id/return · 반환 처리 + 서명 필수 */
export async function returnBorrowing(id: number, params: { return_signature_url: string; return_note?: string }): Promise<BorrowingRow> {
  const { data } = await api.patch<{ ok: boolean; row: BorrowingRow }>(`/api/borrowings/${id}/return`, params);
  return data.row;
}

/** DELETE /api/borrowings/:id */
export async function deleteBorrowing(id: number): Promise<void> {
  await api.del(`/api/borrowings/${id}`);
}

// ═══════════════════════════════════════════════════════
// 당사자 (parties)
// ═══════════════════════════════════════════════════════

/** GET /api/borrowings/parties?q=... · 검색 (자동완성) */
export async function searchParties(q?: string): Promise<BorrowingParty[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const { data } = await api.get<{ rows: BorrowingParty[]; warning?: string }>(`/api/borrowings/parties${qs}`);
  return data?.rows ?? [];
}

/** POST /api/borrowings/parties · 신규 등록 */
export async function createParty(input: CreatePartyInput): Promise<BorrowingParty> {
  const { data } = await api.post<{ ok: boolean; row: BorrowingParty }>("/api/borrowings/parties", input);
  if (!data?.row) throw new ApiError(500, "당사자 등록 실패");
  return data.row;
}

// ═══════════════════════════════════════════════════════
// 서명 (signatures)
// ═══════════════════════════════════════════════════════

export interface AddSignatureInput {
  role: BorrowingSignature["role"];
  signer_name?: string;
  signer_id?: number | null;
  party_id?: number | null;
  signature_url: string;
  stamp_url?: string | null;
  intent_text?: string | null;
}

/** POST /api/borrowings/:id/signatures · 사후 서명 추가 (반환·증인) */
export async function addSignature(borrowingId: number, input: AddSignatureInput): Promise<BorrowingSignature> {
  const { data } = await api.post<{ ok: boolean; row: BorrowingSignature }>(`/api/borrowings/${borrowingId}/signatures`, input);
  if (!data?.row) throw new ApiError(500, "서명 추가 실패");
  return data.row;
}

/** GET /api/borrowings/:id/signatures · 서명 이력 조회 */
export async function listSignatures(borrowingId: number): Promise<BorrowingSignature[]> {
  const { data } = await api.get<{ rows: BorrowingSignature[] }>(`/api/borrowings/${borrowingId}/signatures`);
  return data?.rows ?? [];
}
