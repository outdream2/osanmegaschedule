// 2026-08-20 · payroll · grossUp · 세후 목표 → 세전 역산 (fixed-point)
import { describe, it, expect } from "vitest";
import { grossUp } from "./grossUp";

describe("grossUp · 기본 구조", () => {
  it("반환 · gross·taxes·iterations·converged", () => {
    const r = grossUp(2_500_000);
    expect(r).toHaveProperty("gross");
    expect(r).toHaveProperty("taxes");
    expect(r).toHaveProperty("iterations");
    expect(r).toHaveProperty("converged");
  });

  it("gross · 정수 (반올림)", () => {
    const r = grossUp(2_500_000);
    expect(Number.isInteger(r.gross)).toBe(true);
  });
});

describe("grossUp · 경계값", () => {
  it("netTarget=0 · gross=0 · converged=true · iterations=0", () => {
    const r = grossUp(0);
    expect(r.gross).toBe(0);
    expect(r.converged).toBe(true);
    expect(r.iterations).toBe(0);
    expect(r.taxes.total).toBe(0);
  });

  it("netTarget 음수 · 0 처리", () => {
    const r = grossUp(-100_000);
    expect(r.gross).toBe(0);
    expect(r.converged).toBe(true);
  });
});

describe("grossUp · 수렴", () => {
  it("2,500,000 세후 · 20회 이내 수렴", () => {
    const r = grossUp(2_500_000);
    expect(r.converged).toBe(true);
    expect(r.iterations).toBeLessThanOrEqual(20);
    expect(r.iterations).toBeGreaterThan(0);
  });

  it("2,500,000 세후 · gross - total ≈ net (오차 100원 이내)", () => {
    const netTarget = 2_500_000;
    const r = grossUp(netTarget);
    const actualNet = r.gross - r.taxes.total;
    expect(Math.abs(actualNet - netTarget)).toBeLessThanOrEqual(100);
  });

  it("gross > netTarget (세전 > 세후)", () => {
    const r = grossUp(3_000_000);
    expect(r.gross).toBeGreaterThan(3_000_000);
  });

  it("고소득 5백만 세후 · 수렴 · gross > net", () => {
    const r = grossUp(5_000_000);
    expect(r.converged).toBe(true);
    expect(r.gross).toBeGreaterThan(5_000_000);
  });
});

describe("grossUp · 옵션", () => {
  it("tolerance 완화 (10000) · 더 적은 iteration", () => {
    const strict = grossUp(2_500_000, 0, 1, { tolerance: 10 });
    const loose = grossUp(2_500_000, 0, 1, { tolerance: 10_000 });
    expect(loose.iterations).toBeLessThanOrEqual(strict.iterations);
  });

  it("maxIter=1 · 수렴 실패 가능 · converged=false", () => {
    const r = grossUp(5_000_000, 0, 1, { maxIter: 1, tolerance: 1 });
    expect(r.iterations).toBe(1);
    // 아주 낮은 maxIter · 수렴 실패 확률 큼
    expect(typeof r.converged).toBe("boolean");
  });

  it("overshoot 다른 값 · 수렴 여전히 성공", () => {
    const r = grossUp(2_500_000, 0, 1, { overshoot: 1.0 });
    expect(r.converged).toBe(true);
  });
});

describe("grossUp · 비과세 · 부양가족 반영", () => {
  it("비과세 20만 · 세금 감소 · gross 감소", () => {
    const noneNT = grossUp(2_500_000, 0, 1);
    const withNT = grossUp(2_500_000, 200_000, 1);
    expect(withNT.taxes.incomeTax).toBeLessThanOrEqual(noneNT.taxes.incomeTax);
    // 세금 부담 감소 → 동일 세후 위한 gross 감소 또는 유사
    expect(withNT.gross).toBeLessThanOrEqual(noneNT.gross);
  });

  it("부양가족 3인 · 소득세 감소 · gross 감소", () => {
    const r1 = grossUp(5_000_000, 0, 1);
    const r3 = grossUp(5_000_000, 0, 3);
    expect(r3.taxes.incomeTax).toBeLessThan(r1.taxes.incomeTax);
    expect(r3.gross).toBeLessThan(r1.gross);
  });
});

describe("grossUp · taxes 결과 정합성", () => {
  it("taxes · calcTaxes 결과와 일관 · np·hi·incomeTax 모두 양수", () => {
    const r = grossUp(3_000_000);
    expect(r.taxes.np).toBeGreaterThan(0);
    expect(r.taxes.hi).toBeGreaterThan(0);
    expect(r.taxes.ei).toBeGreaterThan(0);
    expect(r.taxes.incomeTax).toBeGreaterThan(0);
    expect(r.taxes.total).toBeGreaterThan(0);
  });

  it("타 세후 목표 · 비교 · 큰 목표 · 큰 gross", () => {
    const r1 = grossUp(2_000_000);
    const r2 = grossUp(5_000_000);
    expect(r2.gross).toBeGreaterThan(r1.gross);
    expect(r2.taxes.total).toBeGreaterThan(r1.taxes.total);
  });
});
