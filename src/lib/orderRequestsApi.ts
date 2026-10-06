// src/lib/orderRequestsApi.ts
// 2026-09-14 · 프레임워크 · 발주 요청 API 클라이언트 래퍼
//   · server/routes/display/requests.ts (order-requests endpoints)
//   · 8+ 호출 사이트 통합 (borrowingsApi · inventoryChecksApi 패턴)
//   · 단일 endpoint 대원칙

import { api } from "./apiClient";

// ═══════════════════════════════════════════════════════
// 타입 정의
// ═══════════════════════════════════════════════════════

/** 발주 요청 페이로드 (POST) · 유연 (일부 필드만 선택) */
export interface CreateOrderRequestPayload {
  product_code: string;
  product_name: string;
  current_stock?: number | null;
  optimal_stock?: number | null;
  /** 2026-09-10 · 발주필요에서 지정한 발주 수량 (부족량 또는 조정값) */
  order_qty?: number | null;
  supplier?: string | null;
  /** 2026-10-06 · 사용자 지시 · canonical supplier_code 명시 전달 (name 역추정 금지) · DB type text */
  supplier_code?: string | null;
  requested_at?: string;
  note?: string;
}

export interface OrderRequestRow {
  id: string;
  product_code: string;
  product_name: string;
  current_stock: number | null;
  optimal_stock: number | null;
  order_qty?: number | null;
  requested_at: string;
  supplier?: string | null;
  /** 2026-10-06 · canonical supplier_code · vendors.supplier_code / products.supplier_code 와 동일 identity */
  supplier_code?: string | null;
  supplier_contact?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  balance?: number | null;
  ocr_balance?: number | null;
}

export interface BulkSendOrderRequestsPayload {
  order_request_ids: Array<string | number>;
  employee_id?: number | null;
  notify_logistics_leader?: boolean;
  extra_message?: string;
}

export interface BulkSendOrderRequestsResponse {
  ok?: boolean;
  sent?: number;
  failed?: number;
  dispatches?: Array<{ status: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

// ═══════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════

/**
 * GET /api/order-requests · 발주 요청 리스트
 */
export async function listOrderRequests(): Promise<OrderRequestRow[]> {
  const { data } = await api.get<OrderRequestRow[]>("/api/order-requests");
  return Array.isArray(data) ? data : [];
}

/**
 * POST /api/order-requests · 발주 요청 등록
 * 서버 · 같은 product_code 재요청 · UPDATE (덮어쓰기)
 */
export async function createOrderRequest(
  payload: CreateOrderRequestPayload
): Promise<void> {
  await api.post("/api/order-requests", {
    requested_at: new Date().toISOString(),
    ...payload,
  });
}

/**
 * POST /api/order-requests/bulk-send · 여러 발주 요청 · 이메일 전송
 * 서버 · SolAPI 카톡 or SMTP 이메일 전송
 */
export async function bulkSendOrderRequests(
  payload: BulkSendOrderRequestsPayload
): Promise<BulkSendOrderRequestsResponse> {
  const { data } = await api.post<BulkSendOrderRequestsResponse>(
    "/api/order-requests/bulk-send",
    payload
  );
  return data ?? {};
}
