// 2026-09-25 · #1 · 발주매입 대조 · 클라이언트 API 래퍼 (사용자 지시)
//   · GET /api/order-purchase-match?days=N
//   · POST /api/order-purchase-match/:order_id/confirm
//
// 대원칙:
//   · 단일 endpoint · apiClient 통합 · try/catch 는 UI 단
//   · 발주 관련 · no-store · 서버가 처리 (Cache-Control 응답)

import { api } from "../apiClient";
import type { MatchConfirmInput } from "../../shared/schemas/orderPurchaseMatch";

// ═══════════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════════

export interface PurchaseMatchLine {
  purchase_id: string | number;
  purchase_date: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  supplier_name: string | null;
}

export interface OrderMatchRow {
  id: string | number;
  order_number: string | null;
  order_date: string | null;
  sent_at: string | null;
  supplier: string | null;
  product_code: string;
  product_name: string | null;
  order_qty: number;
  unit_price: number | null;
  status: string | null;
  match_status: string | null;
  matched_at: string | null;
  matched_by: number | null;
  exception_type: string | null;
  exception_note: string | null;
  purchase_matches: PurchaseMatchLine[];
  purchase_total_qty: number;
  purchase_avg_price: number | null;
  price_diff_pct: number | null;
  auto_status: "matched" | "exception" | "unmatched";
  auto_exception_type: "qty_short" | "qty_over" | "price_diff" | "no_purchase" | null;
}

export interface UnregisteredPurchase {
  id: string | number;
  purchase_date: string | null;
  supplier_name: string | null;
  supplier_code: string | null;
  product_code: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface OrderPurchaseMatchResponse {
  matched: OrderMatchRow[];
  exceptions: OrderMatchRow[];
  unmatched: OrderMatchRow[];
  unregistered_purchases: UnregisteredPurchase[];
  counts: {
    matched: number;
    exceptions: number;
    unmatched: number;
    unregistered: number;
  };
  window_days: number;
  lookback_days: number;
}

/**
 * 2026-09-25 · 사용자 정정 · 단일 발주 매칭 결과 (오른쪽 패널)
 *   · GET /api/order-purchase-match/order/:order_number?days=N
 */
export interface OrderPurchaseMatchByOrderResponse {
  order_number: string;
  supplier: string | null;
  sent_at: string | null;
  order_date: string | null;
  rows: OrderMatchRow[];
  counts: {
    matched: number;
    exceptions: number;
    unmatched: number;
  };
  window_days: number;
}

// ═══════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════

/** GET /api/order-purchase-match?days=N · 발주-매입 자동 매칭 결과 */
export async function getOrderPurchaseMatchList(
  days = 7,
): Promise<OrderPurchaseMatchResponse> {
  const { data } = await api.get<OrderPurchaseMatchResponse>(
    `/api/order-purchase-match?days=${encodeURIComponent(String(days))}`,
  );
  return {
    matched: data?.matched ?? [],
    exceptions: data?.exceptions ?? [],
    unmatched: data?.unmatched ?? [],
    unregistered_purchases: data?.unregistered_purchases ?? [],
    counts: data?.counts ?? { matched: 0, exceptions: 0, unmatched: 0, unregistered: 0 },
    window_days: data?.window_days ?? days,
    lookback_days: data?.lookback_days ?? days * 2,
  };
}

/**
 * 2026-09-25 · 사용자 정정 · 단일 발주의 매칭 결과 조회
 *   · GET /api/order-purchase-match/order/:order_number?days=N
 *   · 발주매입대조 오른쪽 패널 · OrderHistoryTab 선택 시 사용
 */
export async function getOrderPurchaseMatchByOrder(
  orderNumber: string,
  days = 7,
): Promise<OrderPurchaseMatchByOrderResponse> {
  const { data } = await api.get<OrderPurchaseMatchByOrderResponse>(
    `/api/order-purchase-match/order/${encodeURIComponent(orderNumber)}?days=${encodeURIComponent(String(days))}`,
  );
  return {
    order_number: data?.order_number ?? orderNumber,
    supplier: data?.supplier ?? null,
    sent_at: data?.sent_at ?? null,
    order_date: data?.order_date ?? null,
    rows: data?.rows ?? [],
    counts: data?.counts ?? { matched: 0, exceptions: 0, unmatched: 0 },
    window_days: data?.window_days ?? days,
  };
}

/** POST /api/order-purchase-match/:order_id/confirm · 매칭 확정 (matched·exception·undo) */
export async function confirmOrderPurchaseMatch(
  orderId: string | number,
  payload: MatchConfirmInput,
): Promise<{ ok: boolean; id: string | number }> {
  const { data } = await api.post<{ ok: boolean; id: string | number }>(
    `/api/order-purchase-match/${encodeURIComponent(String(orderId))}/confirm`,
    payload,
  );
  return data ?? { ok: true, id: orderId };
}
