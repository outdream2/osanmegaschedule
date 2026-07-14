// server/ocr/__tests__/parse.totals.test.ts
// 총계·할인·잔액 관련 회귀 방지 테스트 (Phase 4 · 2026-07-14)

import { describe, it, expect } from "vitest";
import {
  inferMissingTotals,
  sanitizeBalanceContamination,
  extractDiscount,
  auditRowSumVsTotal,
} from "../parse";

describe("inferMissingTotals", () => {
  it("(공급가액:부가세=10:1) 페어 스캔 + 합 = 총계 확정", () => {
    const rt = "공급가액 8,352,890 부가세 835,289 합계 9,188,179";
    const r = inferMissingTotals(rt, 8352890, { subtotal: null, supplyAmount: null, vat: null, total: null });
    expect(r.supplyAmount).toBe(8352890);
    expect(r.vat).toBe(835289);
    expect(r.total).toBe(9188179);
  });

  it("짧은 rawText (200자 미만) 도 정상 감지 · Fix 2 회귀 방지", () => {
    const rt = "공급가액 1,800,000\n부가세 180,000\n합계금액 1,980,000\n";
    const r = inferMissingTotals(rt, 1800000, { subtotal: null, supplyAmount: null, vat: null, total: null });
    expect(r.supplyAmount).toBe(1800000);
    expect(r.vat).toBe(180000);
    expect(r.total).toBe(1980000);
    expect(r.subtotal).toBe(1800000);
  });

  it("rawText 없어도 rowsSum > 0 이면 subtotal 백필", () => {
    const r = inferMissingTotals("", 542160, { subtotal: null, supplyAmount: null, vat: null, total: null });
    expect(r.subtotal).toBe(542160);
  });

  it("기존 subtotal 있으면 덮어쓰지 않음", () => {
    const rt = "공급가액 1,800,000 부가세 180,000";
    const r = inferMissingTotals(rt, 1800000, { subtotal: 1900000, supplyAmount: null, vat: null, total: null });
    expect(r.subtotal).toBeUndefined();  // 기존값 있음 → 백필 스킵
  });
});

describe("sanitizeBalanceContamination", () => {
  it("total 이 rowsSum 의 20배 이상 → 잔액 오염 판정 · total 무효화", () => {
    const meta = { total: 53411540, subtotal: 542160, supplier: "미상" };
    const r = sanitizeBalanceContamination(meta, 542160);
    expect(r.contaminated).toBe(true);
    expect(r.meta.total).toBeUndefined();
    expect(r.meta.balanceAfter).toBe(53411540);
  });

  it("total 이 rowsSum 과 유사 → 정상 (오염 아님)", () => {
    const meta = { total: 156000, subtotal: 156000 };
    const r = sanitizeBalanceContamination(meta, 156000);
    expect(r.contaminated).toBe(false);
    expect(r.meta.total).toBe(156000);
  });

  it("total 이 없으면 무동작", () => {
    const meta = { subtotal: 100000 };
    const r = sanitizeBalanceContamination(meta, 100000);
    expect(r.contaminated).toBe(false);
  });
});

describe("extractDiscount", () => {
  it("에누리액 감지", () => {
    const rt = "소계 156,000 에누리액 5,000 부가세 14,182 합계 165,182";
    const r = extractDiscount(rt, 156000, { total: 165182 });
    expect(r.discount).toBe(5000);
    expect(r.discountLabel).toBe("에누리액");
  });

  it("할인 + 차액 조합 → 합산", () => {
    const rt = "할인 5,000 차액 2,000";
    const r = extractDiscount(rt, 100000, { total: 105000 });
    expect(r.discount).toBe(7000);
    expect(r.discountLabel).toContain("할인");
    expect(r.discountLabel).toContain("차액");
  });

  it("DC 표기 인식", () => {
    const rt = "소계 500,000 DC 25,000 부가세 47,500 합계 522,500";
    const r = extractDiscount(rt, 500000, { total: 522500 });
    expect(r.discount).toBe(25000);
    expect(r.discountLabel).toBe("DC");
  });

  it("반품 별도 필드로 감지 (할인과 분리)", () => {
    const rt = "반품액 10,000";
    const r = extractDiscount(rt, 90000, { total: null });
    expect(r.return_).toBe(10000);
    expect(r.discount).toBeUndefined();
  });

  it("부가세 별도 자동 판정 (총계/rowsSum ≈ 1.10)", () => {
    const rt = "";  // rawText 없어도 감지되어야 함 (Fix 3)
    const r = extractDiscount(rt, 1636364, { total: 1800000 });
    expect(r.vatSeparate).toBe(true);
  });

  it("아무것도 없으면 빈 결과", () => {
    const rt = "소계 156,000 부가세 14,182 합계 170,182";
    const r = extractDiscount(rt, 156000, { total: 170182 });
    expect(r.discount).toBeUndefined();
    expect(r.return_).toBeUndefined();
    expect(r.vatSeparate).toBeUndefined();
  });
});

describe("auditRowSumVsTotal", () => {
  it("행합 = 총계 → withinTolerance = true", () => {
    const headers = ["품명", "수량", "단가", "금액"];
    const rows = [["a", 1, 100, 100], ["b", 2, 200, 400]];
    const r = auditRowSumVsTotal(headers, rows, "", 500);
    expect(r.rowSum).toBe(500);
    expect(r.stated).toBe(500);
    expect(r.withinTolerance).toBe(true);
  });

  it("행합 ≠ 총계 → withinTolerance = false", () => {
    const headers = ["품명", "수량", "단가", "금액"];
    const rows = [["a", 1, 100, 100]];
    const r = auditRowSumVsTotal(headers, rows, "", 5000);
    expect(r.withinTolerance).toBe(false);
    expect(r.delta).toBe(4900);
  });
});
