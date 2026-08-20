// 2026-08-20 · payroll · insuranceRates 상수 검증
// 4대보험 요율 · 통상시급 상수 · docs/PAYROLL_ALGORITHM.md 준수
import { describe, it, expect } from "vitest";
import {
  RATES_2026,
  MONTHLY_STANDARD_HOURS,
  WEEKS_PER_MONTH,
  DAILY_LIMIT,
  WEEKLY_LIMIT,
  MIN_WAGE_2026,
  NON_TAXABLE_LIMITS,
  RECOGNIZED_HOURS,
} from "./insuranceRates";

describe("RATES_2026 · 4대보험 요율", () => {
  it("국민연금 · 4.75%", () => {
    expect(RATES_2026.nationalPension).toBe(0.0475);
  });

  it("건강보험 · 3.595%", () => {
    expect(RATES_2026.healthInsurance).toBe(0.03595);
  });

  it("장기요양 · 건강보험료의 13.14%", () => {
    expect(RATES_2026.longTermCare).toBe(0.1314);
  });

  it("고용보험 · 0.9%", () => {
    expect(RATES_2026.employmentInsurance).toBe(0.009);
  });

  it("지방소득세 · 소득세의 10%", () => {
    expect(RATES_2026.localTaxRate).toBe(0.10);
  });

  it("모든 요율 · 0 <= r <= 1", () => {
    for (const [, v] of Object.entries(RATES_2026)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("근무시간 상수", () => {
  it("MONTHLY_STANDARD_HOURS · 209", () => {
    expect(MONTHLY_STANDARD_HOURS).toBe(209);
  });

  it("WEEKS_PER_MONTH · 4.3452 (52.1775/12)", () => {
    expect(WEEKS_PER_MONTH).toBe(4.3452);
  });

  it("DAILY_LIMIT · 8 (근기법 §50)", () => {
    expect(DAILY_LIMIT).toBe(8);
  });

  it("WEEKLY_LIMIT · 40", () => {
    expect(WEEKLY_LIMIT).toBe(40);
  });

  it("주 40h + 주휴 8h × 4.3452 ≈ 208.57 ≈ 209", () => {
    const derived = (40 + 8) * WEEKS_PER_MONTH;
    expect(derived).toBeCloseTo(208.57, 1);
  });
});

describe("MIN_WAGE_2026 · 최저임금", () => {
  it("2026 근사 · 10,030원 이상", () => {
    expect(MIN_WAGE_2026).toBeGreaterThanOrEqual(10_030);
  });

  it("정수 (원)", () => {
    expect(Number.isInteger(MIN_WAGE_2026)).toBe(true);
  });
});

describe("NON_TAXABLE_LIMITS · 비과세 상한", () => {
  it("식대 · 20만원/월 (2023.1~)", () => {
    expect(NON_TAXABLE_LIMITS.meal).toBe(200_000);
  });

  it("자가운전 · 20만원/월", () => {
    expect(NON_TAXABLE_LIMITS.vehicle).toBe(200_000);
  });
});

describe("RECOGNIZED_HOURS · 임금구성표 인정시간 (T-CTR-12)", () => {
  it("basic · 209h (주 40h + 주휴 8h × 4.3452)", () => {
    expect(RECOGNIZED_HOURS.basic).toBe(209);
  });

  it("fixedOvertime · 55.94h (약정연장 37.3h × 1.5)", () => {
    expect(RECOGNIZED_HOURS.fixedOvertime).toBe(55.94);
  });

  it("fixedHoliday · 22h (연간 공휴일/12 × 1.5)", () => {
    expect(RECOGNIZED_HOURS.fixedHoliday).toBe(22);
  });

  it("fixedAnnualLeave · 10h (연 15일 / 12 × 8h)", () => {
    expect(RECOGNIZED_HOURS.fixedAnnualLeave).toBe(10);
  });

  it("total · 296.94h · 항목 합계와 일치", () => {
    const sum =
      RECOGNIZED_HOURS.basic +
      RECOGNIZED_HOURS.fixedOvertime +
      RECOGNIZED_HOURS.fixedHoliday +
      RECOGNIZED_HOURS.fixedAnnualLeave;
    expect(sum).toBeCloseTo(RECOGNIZED_HOURS.total, 2);
    expect(RECOGNIZED_HOURS.total).toBe(296.94);
  });

  it("모든 항목 · 양수", () => {
    for (const v of Object.values(RECOGNIZED_HOURS)) {
      expect(v).toBeGreaterThan(0);
    }
  });
});
