// 2026-08-21 · ScanPage · stockRowTypes 순수 헬퍼 검증
//   calcSlotTotal · calcRowTotal · calcTotalAdded (StockRow 합산)
import { describe, it, expect } from "vitest";
import { calcSlotTotal, calcRowTotal, calcTotalAdded } from "./stockRowTypes";
import type { StockRow } from "./stockRowTypes";
import type { ProductInfo } from "../../lib/productsCache";

const emptyProduct: ProductInfo = {
  code: "T1",
  name: "테스트",
  spec: null,
  supplier: null,
  currentStock: null,
  optimalStock: null,
  minStock: null,
  salePrice: null,
  purchasePrice: null,
  location: null,
  hidden: false,
} as any;

function makeRow(overrides: Partial<StockRow> = {}): StockRow {
  return {
    key: "k1",
    code: "T1",
    product: emptyProduct,
    addedAt: 0,
    warehouse1AddQty: "",
    warehouse2AddQty: "",
    store1AddQty: "",
    store2AddQty: "",
    store3AddQty: "",
    warehouse1Zone: null,
    warehouse2Zone: null,
    store1Zone: null,
    store2Zone: null,
    store3Zone: null,
    ...overrides,
  };
}

describe("calcSlotTotal · add 절대값 · add 없으면 prev", () => {
  it("prev=5, add=3 · add 절대값 3", () => {
    expect(calcSlotTotal(5, 3)).toBe(3);
  });

  it("prev=null, add=5 · 5", () => {
    expect(calcSlotTotal(null, 5)).toBe(5);
  });

  it("prev=undefined, add=2 · 2", () => {
    expect(calcSlotTotal(undefined, 2)).toBe(2);
  });

  it("prev=10, add=\"\" · prev 사용 10", () => {
    expect(calcSlotTotal(10, "")).toBe(10);
  });

  it("prev=null, add=\"\" · 0", () => {
    expect(calcSlotTotal(null, "")).toBe(0);
  });

  it("prev=0, add=0 · 0", () => {
    expect(calcSlotTotal(0, 0)).toBe(0);
  });

  it("음수 add · 절대값 반환", () => {
    expect(calcSlotTotal(5, -2)).toBe(-2);
  });
});

describe("calcRowTotal · 5칸 전체 합산", () => {
  it("모두 비어있음 · 0", () => {
    expect(calcRowTotal(makeRow())).toBe(0);
  });

  it("창고1 add=3만 · 3", () => {
    expect(calcRowTotal(makeRow({ warehouse1AddQty: 3 }))).toBe(3);
  });

  it("add 있으면 절대값 · add 없으면 prev · 합산", () => {
    const row = makeRow({
      prevWarehouse1Qty: 10, warehouse1AddQty: 2,   // add=2 (절대)
      prevWarehouse2Qty: 5,  warehouse2AddQty: 1,   // add=1 (절대)
      prevStore1Qty:     3,  store1AddQty:     "",  // add 없음 → prev=3
      prevStore2Qty:     null, store2AddQty:   4,   // add=4 (절대)
      prevStore3Qty:     null, store3AddQty:   "",  // add 없음, prev=null → 0
    });
    // 2 + 1 + 3 + 4 + 0 = 10
    expect(calcRowTotal(row)).toBe(10);
  });

  it("모든 슬롯 add=1 · 5", () => {
    const row = makeRow({
      warehouse1AddQty: 1, warehouse2AddQty: 1,
      store1AddQty: 1, store2AddQty: 1, store3AddQty: 1,
    });
    expect(calcRowTotal(row)).toBe(5);
  });
});

describe("calcTotalAdded · 이번 세션 add 만 합산 (prev 무시)", () => {
  it("모두 add=\"\" · 0", () => {
    expect(calcTotalAdded(makeRow())).toBe(0);
  });

  it("prev 있어도 add 없으면 · 0 (add 만)", () => {
    const row = makeRow({
      prevWarehouse1Qty: 100,
      prevStore1Qty: 100,
    });
    expect(calcTotalAdded(row)).toBe(0);
  });

  it("add 5칸 각 1 · 5 (prev 무시)", () => {
    const row = makeRow({
      prevWarehouse1Qty: 100, warehouse1AddQty: 1,
      prevWarehouse2Qty: 100, warehouse2AddQty: 1,
      prevStore1Qty:     100, store1AddQty:     1,
      prevStore2Qty:     100, store2AddQty:     1,
      prevStore3Qty:     100, store3AddQty:     1,
    });
    expect(calcTotalAdded(row)).toBe(5);
  });

  it("혼합 · add=3+5+\"\"+\"\"+2 · 10", () => {
    const row = makeRow({
      warehouse1AddQty: 3,
      warehouse2AddQty: 5,
      store3AddQty: 2,
    });
    expect(calcTotalAdded(row)).toBe(10);
  });
});
