// 2026-08-20 · payroll · calcTaxes · 세전 → 4대보험 + 소득세 + 지방세
import { describe, it, expect } from "vitest";
import { calcTaxes } from "./calcTaxes";
import { RATES_2026 } from "./insuranceRates";

describe("calcTaxes · 기본 구조", () => {
  it("반환 · 7개 필드 (np·hi·ltc·ei·incomeTax·localTax·total)", () => {
    const r = calcTaxes(3_000_000, 2_800_000, 1);
    expect(r).toHaveProperty("np");
    expect(r).toHaveProperty("hi");
    expect(r).toHaveProperty("ltc");
    expect(r).toHaveProperty("ei");
    expect(r).toHaveProperty("incomeTax");
    expect(r).toHaveProperty("localTax");
    expect(r).toHaveProperty("total");
  });

  it("total · 6항목 합계 일치", () => {
    const r = calcTaxes(3_000_000, 2_800_000, 1);
    expect(r.total).toBe(r.np + r.hi + r.ltc + r.ei + r.incomeTax + r.localTax);
  });

  it("모든 항목 · 정수 (반올림)", () => {
    const r = calcTaxes(3_500_000, 3_300_000, 1);
    for (const k of ["np", "hi", "ltc", "ei", "incomeTax", "localTax", "total"] as const) {
      expect(Number.isInteger(r[k])).toBe(true);
    }
  });
});

describe("calcTaxes · 4대보험 산식", () => {
  it("np = taxableGross × 4.75% (반올림)", () => {
    const tg = 3_000_000;
    const r = calcTaxes(3_000_000, tg, 1);
    expect(r.np).toBe(Math.round(tg * RATES_2026.nationalPension));
  });

  it("hi = taxableGross × 3.595%", () => {
    const tg = 3_000_000;
    const r = calcTaxes(3_000_000, tg, 1);
    expect(r.hi).toBe(Math.round(tg * RATES_2026.healthInsurance));
  });

  it("ltc = hi × 13.14%", () => {
    const tg = 3_000_000;
    const r = calcTaxes(3_000_000, tg, 1);
    expect(r.ltc).toBe(Math.round(r.hi * RATES_2026.longTermCare));
  });

  it("ei = taxableGross × 0.9%", () => {
    const tg = 3_000_000;
    const r = calcTaxes(3_000_000, tg, 1);
    expect(r.ei).toBe(Math.round(tg * RATES_2026.employmentInsurance));
  });

  it("localTax = incomeTax × 10%", () => {
    const r = calcTaxes(3_500_000, 3_300_000, 1);
    expect(r.localTax).toBe(Math.round(r.incomeTax * RATES_2026.localTaxRate));
  });
});

describe("calcTaxes · 경계값", () => {
  it("taxableGross=0 · 모든 값 0", () => {
    const r = calcTaxes(0, 0, 1);
    expect(r.np).toBe(0);
    expect(r.hi).toBe(0);
    expect(r.ltc).toBe(0);
    expect(r.ei).toBe(0);
    expect(r.incomeTax).toBe(0);
    expect(r.localTax).toBe(0);
    expect(r.total).toBe(0);
  });

  it("음수 taxableGross · 0으로 clamp", () => {
    const r = calcTaxes(0, -100_000, 1);
    expect(r.np).toBe(0);
    expect(r.hi).toBe(0);
    expect(r.ei).toBe(0);
  });

  it("gross 인자 · 현재 미사용 (동일 taxableGross 시 결과 동일)", () => {
    const r1 = calcTaxes(3_000_000, 2_800_000, 1);
    const r2 = calcTaxes(5_000_000, 2_800_000, 1);
    expect(r1.np).toBe(r2.np);
    expect(r1.hi).toBe(r2.hi);
    expect(r1.incomeTax).toBe(r2.incomeTax);
  });
});

describe("calcTaxes · 부양가족", () => {
  it("부양가족 default = 1", () => {
    const r1 = calcTaxes(3_500_000, 3_300_000);
    const r2 = calcTaxes(3_500_000, 3_300_000, 1);
    expect(r1.total).toBe(r2.total);
  });

  it("부양가족 많을수록 · 소득세 감소 (4대보험은 동일)", () => {
    const r1 = calcTaxes(5_000_000, 4_800_000, 1);
    const r3 = calcTaxes(5_000_000, 4_800_000, 3);
    expect(r3.incomeTax).toBeLessThan(r1.incomeTax);
    expect(r3.np).toBe(r1.np);
    expect(r3.hi).toBe(r1.hi);
    expect(r3.ei).toBe(r1.ei);
  });
});

describe("calcTaxes · 실무 sanity", () => {
  it("월 300만 · 부양 1 · 4대보험 합 · 세전의 8~10%", () => {
    const gross = 3_000_000;
    const r = calcTaxes(gross, gross, 1);
    const insuranceSum = r.np + r.hi + r.ltc + r.ei;
    const ratio = insuranceSum / gross;
    expect(ratio).toBeGreaterThan(0.08);
    expect(ratio).toBeLessThan(0.10);
  });

  it("고소득 · 총 공제 · 세전보다 작음", () => {
    const gross = 10_000_000;
    const r = calcTaxes(gross, gross, 1);
    expect(r.total).toBeLessThan(gross);
  });
});
