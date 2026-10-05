// src/components/StockManagePage/FlowTab.types.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · FlowTab 타입/유틸/캐시 이관

// 2026-10-04 · stock_history column rename
//   · opening_stock→prv_stock · purchase_qty→buy_stock · sale_qty→sale_stock · disposal_qty→product_bad_stock
export interface StockFlowRow {
  product_code: string;
  product_name: string;
  supplier: string | null;
  spec: string | null;
  prv_stock: number;
  buy_stock: number;
  sale_stock: number;
  product_bad_stock: number;
  closing_stock: number;
  total_amount: number;
  optimal_stock: number;
  last_purchase_date?: string | null;
  sale_price?: number;
  purchase_price?: number;
  sale_stock_month?: number;
}

export type SortKey =
  | "name" | "opening" | "sale" | "purchase" | "amount" | "closing" | "current" | "loss"
  | "turnover" | "doh" | "cycle" | "last_purchase" | "min_order" | "last_purchase_price"
  | "stock_value" | "sale_price" | "profit_rate" | "turnover_3m";

export type SortDir = "asc" | "desc";
export type FlowGroup = "stock" | "purchase" | "sales";

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

// ─── Module-level cache (5분 TTL) ────────────────────────────────────────────
export const GLOBAL_FLOW_CACHE = new Map<string, { data: any; ts: number }>();
export const FLOW_CACHE_TTL = 5 * 60 * 1000;
