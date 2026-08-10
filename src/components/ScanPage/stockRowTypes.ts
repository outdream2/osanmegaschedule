// ScanPage · 공유 타입 · 컴포넌트 분리용
// ScanPage.tsx 와 하위 Row 컴포넌트들이 공통으로 사용

import type { ProductInfo } from "../../lib/productsCache";

export interface StockRow {
  key: string;                    // code + timestamp
  code: string;
  product: ProductInfo;
  addedAt: number;
  warehouse1Qty: number | "";
  warehouse2Qty: number | "";
  store1Qty:     number | "";
  store2Qty:     number | "";
  store3Qty:     number | "";
  store1Zone:    string | null;
  store2Zone:    string | null;
  store3Zone:    string | null;
  lastCheckedAt?: string | null;
  historyCount?: number;
  prevWarehouse1Qty?: number | null;
  prevWarehouse2Qty?: number | null;
  prevStore1Qty?:     number | null;
  prevStore2Qty?:     number | null;
  prevStore3Qty?:     number | null;
}

/** 현재값과 이전값 diff 계산 · 둘 다 있을 때만 */
export function calcDiff(cur: number | "", prev: number | null | undefined): number | null {
  if (prev == null) return null;
  if (cur === "") return null;
  return Number(cur) - prev;
}

/** 5칸 총 diff */
export function calcTotalDiff(r: StockRow): number | null {
  const hasPrev =
    r.prevWarehouse1Qty != null || r.prevWarehouse2Qty != null ||
    r.prevStore1Qty != null     || r.prevStore2Qty != null     || r.prevStore3Qty != null;
  if (!hasPrev) return null;
  const d = (cur: number | "", prev: number | null | undefined) => {
    if (prev == null || cur === "") return 0;
    return Number(cur) - prev;
  };
  return (
    d(r.warehouse1Qty, r.prevWarehouse1Qty) +
    d(r.warehouse2Qty, r.prevWarehouse2Qty) +
    d(r.store1Qty,     r.prevStore1Qty)     +
    d(r.store2Qty,     r.prevStore2Qty)     +
    d(r.store3Qty,     r.prevStore3Qty)
  );
}

/** 행 합계 */
export function calcRowTotal(r: StockRow): number {
  const w1 = r.warehouse1Qty !== "" ? Number(r.warehouse1Qty) : 0;
  const w2 = r.warehouse2Qty !== "" ? Number(r.warehouse2Qty) : 0;
  const s1 = r.store1Qty     !== "" ? Number(r.store1Qty)     : 0;
  const s2 = r.store2Qty     !== "" ? Number(r.store2Qty)     : 0;
  const s3 = r.store3Qty     !== "" ? Number(r.store3Qty)     : 0;
  return w1 + w2 + s1 + s2 + s3;
}
