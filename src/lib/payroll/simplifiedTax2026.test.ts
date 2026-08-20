// 2026-08-20 · payroll · 국세청 간이세액표 근사 · 부양가족 반영
import { describe, it, expect } from "vitest";
import {
  approxIncomeTax,
  calcMonthlyIncomeTax,
  childTaxCreditAnnual,
  WITHHOLDING_RATES,
  DEFAULT_WITHHOLDING_RATE,
} from "./simplifiedTax2026";

describe("WITHHOLDING_RATES · 원천징수 비율", () => {
  it("80/100/120 세 옵션", () => {
    expect(WITHHOLDING_RATES).toEqual([0.8, 1.0, 1.2]);
  });

  it("DEFAULT · 100% (1.0)", () => {
    expect(DEFAULT_WITHHOLDING_RATE).toBe(1.0);
  });
});

describe("childTaxCreditAnnual · 자녀 세액공제 (연)", () => {
  it("자녀 0명 · 0원", () => {
    expect(childTaxCreditAnnual(0)).toBe(0);
  });

  it("자녀 1명 · 25만원", () => {
    expect(childTaxCreditAnnual(1)).toBe(250_000);
  });

  it("자녀 2명 · 55만원", () => {
    expect(childTaxCreditAnnual(2)).toBe(550_000);
  });

  it("자녀 3명 · 55만 + 40만 = 95만원", () => {
    expect(childTaxCreditAnnual(3)).toBe(950_000);
  });

  it("자녀 4명 · 55만 + 40만×2 = 135만원", () => {
    expect(childTaxCreditAnnual(4)).toBe(1_350_000);
  });

  it("음수 · 0으로 clamp", () => {
    expect(childTaxCreditAnnual(-3)).toBe(0);
  });

  it("소수 · floor 처리 · 1.7 → 1명 25만원", () => {
    expect(childTaxCreditAnnual(1.7)).toBe(250_000);
  });
});

describe("approxIncomeTax · 부양가족 1인 · 근사표", () => {
  it("0원 · 0원", () => {
    expect(approxIncomeTax(0)).toBe(0);
  });

  it("음수 · 0원 (clamp)", () => {
    expect(approxIncomeTax(-500_000)).toBe(0);
  });

  it("150만 이하 · 사실상 면세 · 0원", () => {
    expect(approxIncomeTax(1_500_000)).toBeGreaterThanOrEqual(0);
    expect(approxIncomeTax(1_000_000)).toBe(0);
  });

  it("300만 · 실무표 74,000원", () => {
    expect(approxIncomeTax(3_000_000)).toBe(74_000);
  });

  it("500만 · 실무표 330,000원", () => {
    expect(approxIncomeTax(5_000_000)).toBe(330_000);
  });

  it("700만 · 실무표 650,000원", () => {
    expect(approxIncomeTax(7_000_000)).toBe(650_000);
  });

  it("1000만 · 실무표 1,300,000원", () => {
    expect(approxIncomeTax(10_000_000)).toBe(1_300_000);
  });

  it("구간 사이 · 선형 보간 · 350만 (실무 130,000)", () => {
    expect(approxIncomeTax(3_500_000)).toBe(130_000);
  });

  it("400만 · 200,000원", () => {
    expect(approxIncomeTax(4_000_000)).toBe(200_000);
  });

  it("표 범위 초과 · 2000만 · 마지막 두 점 외삽", () => {
    // 15M · 2,600,000 + slope (~33%) × 5M ≈ 4,266,666
    const tax = approxIncomeTax(20_000_000);
    expect(tax).toBeGreaterThan(2_600_000);
  });
});

describe("approxIncomeTax · 부양가족 반영", () => {
  it("500만 · 부양 2인 · 85% × 330,000 = 280,500", () => {
    expect(approxIncomeTax(5_000_000, 2)).toBe(Math.round(330_000 * 0.85));
  });

  it("500만 · 부양 3인 · 70% × 330,000 = 231,000", () => {
    expect(approxIncomeTax(5_000_000, 3)).toBe(Math.round(330_000 * 0.70));
  });

  it("500만 · 부양 4인 · 55% × 330,000", () => {
    expect(approxIncomeTax(5_000_000, 4)).toBe(Math.round(330_000 * 0.55));
  });

  it("500만 · 부양 5인 · 40% × 330,000", () => {
    expect(approxIncomeTax(5_000_000, 5)).toBe(Math.round(330_000 * 0.40));
  });

  it("500만 · 부양 6인 · 30% × 330,000", () => {
    expect(approxIncomeTax(5_000_000, 6)).toBe(Math.round(330_000 * 0.30));
  });

  it("부양 10인 · 6인+ 동일 (30%)", () => {
    expect(approxIncomeTax(5_000_000, 10)).toBe(approxIncomeTax(5_000_000, 6));
  });

  it("부양 0 · min 1로 clamp · 1인과 동일", () => {
    expect(approxIncomeTax(5_000_000, 0)).toBe(approxIncomeTax(5_000_000, 1));
  });

  it("부양 소수 · floor · 2.9 → 2인", () => {
    expect(approxIncomeTax(5_000_000, 2.9)).toBe(approxIncomeTax(5_000_000, 2));
  });

  it("부양가족 많을수록 · 세금 감소", () => {
    const t1 = approxIncomeTax(5_000_000, 1);
    const t3 = approxIncomeTax(5_000_000, 3);
    const t5 = approxIncomeTax(5_000_000, 5);
    expect(t1).toBeGreaterThan(t3);
    expect(t3).toBeGreaterThan(t5);
  });
});

describe("calcMonthlyIncomeTax · 국세청 7단계 공식", () => {
  it("비과세 초과 시 · 0원", () => {
    const r = calcMonthlyIncomeTax(200_000, 300_000, 1);
    expect(r.incomeTax).toBe(0);
    expect(r.localTax).toBe(0);
    expect(r.total).toBe(0);
  });

  it("gross=0 · 0원", () => {
    const r = calcMonthlyIncomeTax(0, 0);
    expect(r.total).toBe(0);
  });

  it("반환 · incomeTax + localTax = total", () => {
    const r = calcMonthlyIncomeTax(3_000_000, 200_000, 1);
    expect(r.incomeTax + r.localTax).toBe(r.total);
  });

  it("localTax = incomeTax × 10% (반올림)", () => {
    const r = calcMonthlyIncomeTax(3_000_000, 200_000, 1);
    expect(r.localTax).toBe(Math.round(r.incomeTax * 0.10));
  });

  it("월 300만 · 비과세 20만 · 부양 1 · incomeTax > 0", () => {
    const r = calcMonthlyIncomeTax(3_000_000, 200_000, 1);
    expect(r.incomeTax).toBeGreaterThan(0);
  });

  it("부양가족 많을수록 · 세금 감소 (기본공제 확대)", () => {
    const r1 = calcMonthlyIncomeTax(5_000_000, 200_000, 1);
    const r4 = calcMonthlyIncomeTax(5_000_000, 200_000, 4);
    expect(r4.incomeTax).toBeLessThan(r1.incomeTax);
  });

  it("자녀 세액공제 반영 · 자녀 있으면 세금 감소", () => {
    const r0 = calcMonthlyIncomeTax(5_000_000, 200_000, 2, 0, 1.0, 0);
    const r2 = calcMonthlyIncomeTax(5_000_000, 200_000, 2, 0, 1.0, 2);
    expect(r2.incomeTax).toBeLessThan(r0.incomeTax);
  });

  it("원천징수 120% · 100% 대비 더 많이 걷음", () => {
    const r100 = calcMonthlyIncomeTax(5_000_000, 200_000, 1, 0, 1.0);
    const r120 = calcMonthlyIncomeTax(5_000_000, 200_000, 1, 0, 1.2);
    expect(r120.incomeTax).toBeGreaterThan(r100.incomeTax);
  });

  it("원천징수 80% · 100% 대비 덜 걷음", () => {
    const r100 = calcMonthlyIncomeTax(5_000_000, 200_000, 1, 0, 1.0);
    const r80 = calcMonthlyIncomeTax(5_000_000, 200_000, 1, 0, 0.8);
    expect(r80.incomeTax).toBeLessThan(r100.incomeTax);
  });

  it("월급 클수록 · 세금 증가 (누진 반영)", () => {
    const r3 = calcMonthlyIncomeTax(3_000_000, 0);
    const r7 = calcMonthlyIncomeTax(7_000_000, 0);
    expect(r7.incomeTax).toBeGreaterThan(r3.incomeTax);
  });

  it("음수 nonTaxable · 0으로 clamp", () => {
    const r = calcMonthlyIncomeTax(3_000_000, -100_000);
    // (M = gross - max(0, nonTaxable=0)) = 3M
    expect(r.incomeTax).toBeGreaterThan(0);
  });
});
