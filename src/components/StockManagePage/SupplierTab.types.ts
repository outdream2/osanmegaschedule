// src/components/StockManagePage/SupplierTab.types.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · SupplierTab 타입 이관

export type SupplierAgg = {
  supplier: string;
  supplier_code: string | null;
  names?: string[];
  code_conflict?: boolean;
  purchaseQty: number; purchaseAmount: number; saleQty: number; saleAmount?: number;
  itemCount: number; totalStockAmount: number;
  // 2026-10-01 · 사용자 지시 · 공통기능 공식 통일 · 재고자산 = 매입액 − 판매원가 (대원칙 #1)
  //   · 이전 · totalStockAmount (판매액) 를 "재고자산" 라벨로 표시 · 값·라벨 불일치
  //   · 이후 · 신규 stockAssetAmount · 실제 재고자산 (purchase - cogs) · balances-map 과 동일 공식
  cogsAmount?: number;
  stockAssetAmount?: number;
};

export type SupListSortKey =
  | "totalStockAmount"
  | "stockAssetAmount" // 2026-10-01 · 사용자 지시 · 공통기능 공식 통일 · 실제 재고자산 (purchase - cogs)
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
