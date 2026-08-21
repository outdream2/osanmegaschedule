// src/components/StockManagePage/SupplierTab.types.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · SupplierTab 타입 이관

export type SupplierAgg = {
  supplier: string;
  supplier_code: string | null;
  names?: string[];
  code_conflict?: boolean;
  purchaseQty: number; purchaseAmount: number; saleQty: number; saleAmount?: number;
  itemCount: number; totalStockAmount: number;
};

export type SupListSortKey =
  | "totalStockAmount"
  | "saleQty"
  | "saleAmount"
  | "purchaseQty"
  | "itemCount"
  | "supplier"
  | "avgCycleDays";

export type SupDetailSortKey =
  | "name" | "current" | "cycle" | "purchase_date" | "purchase_qty"
  | "min_order" | "total_amount" | "purchase_price" | "sale_qty" | "sale_amount";

export type SupplierGroup = "stock" | "purchase" | "sale";

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}
