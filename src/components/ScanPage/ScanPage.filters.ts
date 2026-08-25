// src/components/ScanPage/ScanPage.filters.ts
// 2026-08-25 · Framework Phase 4 · large-file 분리 · ScanPage.tsx 순수 함수 이관
//   · isWarnRow · 임계치 초과 재고 (매입 대량 경고)
//   · needsDisplayRequest · 진열요청 필요 (매장 0 && 창고 >0)
//   · hasExpiry · 유통기한 정보 존재

import type { StockRow } from "./stockRowTypes";

const WARN_THRESHOLD = 100;

/** 매입 수량 임계치 초과 여부 (창고1/2 + 매장1/2/3 addQty 중 하나라도 임계 이상) */
export function isWarnRow(r: StockRow): boolean {
  const a = (v: number | "") => v !== "" ? Number(v) : 0;
  return (
    a(r.warehouse1AddQty) >= WARN_THRESHOLD ||
    a(r.warehouse2AddQty) >= WARN_THRESHOLD ||
    a(r.store1AddQty)     >= WARN_THRESHOLD ||
    a(r.store2AddQty)     >= WARN_THRESHOLD ||
    a(r.store3AddQty)     >= WARN_THRESHOLD
  );
}

/** 진열요청 필요 여부 · 매장 재고 total 0 && 창고 재고 total > 0 */
export function needsDisplayRequest(r: StockRow): boolean {
  const num = (v: number | null | undefined | "") => (v != null && v !== "" ? Number(v) : 0);
  const wh = num(r.prevWarehouse1Qty) + num(r.warehouse1AddQty)
           + num(r.prevWarehouse2Qty) + num(r.warehouse2AddQty);
  const store = num(r.prevStore1Qty) + num(r.store1AddQty)
              + num(r.prevStore2Qty) + num(r.store2AddQty)
              + num(r.prevStore3Qty) + num(r.store3AddQty);
  return store === 0 && wh > 0;
}

/** 유통기한 정보 있음 여부 (product.expiry_date 존재) */
export function hasExpiry(r: StockRow): boolean {
  const exp = (r.product as { expiry_date?: string | null }).expiry_date;
  return !!(exp && String(exp).trim());
}
