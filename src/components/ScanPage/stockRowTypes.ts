// ScanPage · 공유 타입 · 컴포넌트 분리용
// ScanPage.tsx 와 하위 Row 컴포넌트들이 공통으로 사용

import type { ProductInfo } from "../../lib/productsCache";

export interface StockRow {
  key: string;                    // code + timestamp
  code: string;
  product: ProductInfo;
  addedAt: number;
  // ── 이전 저장값 (읽기 전용 · 스캔 시 서버에서 로드)
  prevWarehouse1Qty?: number | null;
  prevWarehouse2Qty?: number | null;
  prevStore1Qty?:     number | null;
  prevStore2Qty?:     number | null;
  prevStore3Qty?:     number | null;
  // ── 추가 입력값 (사용자가 이번 세션에 입고한 수량 입력)
  warehouse1AddQty: number | "";
  warehouse2AddQty: number | "";
  store1AddQty:     number | "";
  store2AddQty:     number | "";
  store3AddQty:     number | "";
  store1Zone:    string | null;
  store2Zone:    string | null;
  store3Zone:    string | null;
  lastCheckedAt?: string | null;
  historyCount?: number;
  // 2026-08-23 · #204 · 개별 저장 완료 여부 · true 시 카드 자동 접힘 (재편집 가능)
  savedThisSession?: boolean;
}

/** prev + add 합산 · prev 없으면 add 만 · add 없으면 prev 만 */
export function calcSlotTotal(prev: number | null | undefined, add: number | ""): number {
  const p = prev != null ? prev : 0;
  const a = add !== "" ? Number(add) : 0;
  return p + a;
}

/** 합계 셀용 · 5칸 전체 (prev + add) 합산 */
export function calcRowTotal(r: StockRow): number {
  return (
    calcSlotTotal(r.prevWarehouse1Qty, r.warehouse1AddQty) +
    calcSlotTotal(r.prevWarehouse2Qty, r.warehouse2AddQty) +
    calcSlotTotal(r.prevStore1Qty,     r.store1AddQty)     +
    calcSlotTotal(r.prevStore2Qty,     r.store2AddQty)     +
    calcSlotTotal(r.prevStore3Qty,     r.store3AddQty)
  );
}

/** Phase A3 헤더 뱃지용 · 이번 세션 추가 수량 합계 */
export function calcTotalAdded(r: StockRow): number {
  const a = (v: number | "") => v !== "" ? Number(v) : 0;
  return a(r.warehouse1AddQty) + a(r.warehouse2AddQty) + a(r.store1AddQty) + a(r.store2AddQty) + a(r.store3AddQty);
}
