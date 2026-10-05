// src/shared/erp/erpSaleMapper.ts
// 2026-10-05 · ERP Sale_Status → sales table payload
//   · 사용자 승인 schema: id · 8 ERP field · created_at (surrogate PK · UNIQUE 없음)
//   · stable transaction identity 없음 (ERP 응답 8 column 전부 content)
//   · 중복 방지는 "sale_date 범위 기반 상태 표시" 로 수행 (service 측)

export interface ErpSaleRow {
  SaleDate?: unknown;
  ProductName?: unknown;
  BuyerCorpNameView?: unknown;
  TotalStock?: unknown;
  UnitCost?: unknown;
  UnitSale?: unknown;
  SaleTotal?: unknown;
  Margin?: unknown;
  [k: string]: unknown;
}

export interface SalePayload {
  sale_date: string | null;
  product_name: string | null;
  buyer_name: string | null;
  total_stock: number | null;
  unit_cost: number | null;
  unit_sale: number | null;
  sale_total: number | null;
  margin: number | null;
}

export function buildSalePayload(r: ErpSaleRow): SalePayload {
  const str = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };
  const num = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).trim());
    return Number.isFinite(n) ? n : null;
  };
  return {
    sale_date: str(r.SaleDate),
    product_name: str(r.ProductName),
    buyer_name: str(r.BuyerCorpNameView),
    total_stock: num(r.TotalStock),
    unit_cost: num(r.UnitCost),
    unit_sale: num(r.UnitSale),
    sale_total: num(r.SaleTotal),
    margin: num(r.Margin),
  };
}
