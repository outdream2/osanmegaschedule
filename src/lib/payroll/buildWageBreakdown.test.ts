// 2026-08-20 · payroll · buildWageBreakdown · 세전 → 임금구성표 자동 분배
import { describe, it, expect } from "vitest";
import { buildWageBreakdown } from "./buildWageBreakdown";
import { MONTHLY_STANDARD_HOURS, WEEKS_PER_MONTH } from "./insuranceRates";

const base = {
  gross: 3_000_000,
  nonTaxable: 0,
  weekdays: 5,
  weekdayHoursPerDay: 8,
  weekendDays: 0,
  weekendHoursPerDay: 0,
};

describe("buildWageBreakdown · 기본 구조", () => {
  it("반환 · 모든 필드 존재", () => {
    const r = buildWageBreakdown(base);
    expect(r.basicSalary).toBeDefined();
    expect(r.overtimePay).toBeDefined();
    expect(r.holidayPay).toBeDefined();
    expect(r.nightPay).toBeDefined();
    expect(r.annualLeave).toBeDefined();
    expect(r.mealAllowance).toBeDefined();
    expect(r.vehicleAllowance).toBeDefined();
    expect(r.ordinaryHourly).toBeGreaterThan(0);
    expect(r.equivalentHours).toBeGreaterThan(0);
  });

  it("각 항목 · hours·rate·amount 3필드", () => {
    const r = buildWageBreakdown(base);
    for (const item of [r.basicSalary, r.overtimePay, r.holidayPay, r.nightPay, r.annualLeave]) {
      expect(item).toHaveProperty("hours");
      expect(item).toHaveProperty("rate");
      expect(item).toHaveProperty("amount");
    }
  });
});

describe("buildWageBreakdown · 표준 (주중 5일 × 8h · 연장·휴일 없음)", () => {
  it("기본급 hours · 209", () => {
    const r = buildWageBreakdown(base);
    expect(r.basicSalary.hours).toBe(MONTHLY_STANDARD_HOURS);
  });

  it("연장 · 0h · amount 0", () => {
    const r = buildWageBreakdown(base);
    expect(r.overtimePay.hours).toBe(0);
    expect(r.overtimePay.amount).toBe(0);
    expect(r.monthlyOvertimeH).toBe(0);
  });

  it("휴일 · 0h · amount 0", () => {
    const r = buildWageBreakdown(base);
    expect(r.holidayPay.hours).toBe(0);
    expect(r.holidayPay.amount).toBe(0);
    expect(r.monthlyHolidayH).toBe(0);
  });

  it("equivalentHours = 209 (연장·휴일·야간 없음)", () => {
    const r = buildWageBreakdown(base);
    expect(r.equivalentHours).toBe(MONTHLY_STANDARD_HOURS);
  });

  it("ordinaryHourly = (세전 - 비과세) / 209 · 반올림", () => {
    const r = buildWageBreakdown(base);
    expect(r.ordinaryHourly).toBe(Math.round(3_000_000 / 209));
  });
});

describe("buildWageBreakdown · 연장 (하루 8시간 초과)", () => {
  it("주중 5일 × 9h · 하루 1h 초과 · 주 5h 연장", () => {
    const r = buildWageBreakdown({ ...base, weekdayHoursPerDay: 9 });
    // 5일 × 1h = 주 5h 연장 · × 4.3452 = 21.726h/월
    expect(r.monthlyOvertimeH).toBeCloseTo(5 * WEEKS_PER_MONTH, 2);
    expect(r.overtimePay.hours).toBeCloseTo(5 * WEEKS_PER_MONTH, 2);
  });

  it("연장 rate = 통상시급 × 1.5 (반올림)", () => {
    const r = buildWageBreakdown({ ...base, weekdayHoursPerDay: 9 });
    expect(r.overtimePay.rate).toBe(Math.round(r.ordinaryHourly * 1.5));
  });

  it("주 40h 초과 · 초과분도 연장으로 처리", () => {
    // 6일 × 8h = 48h · 40 초과 8h · 주 8h 연장
    const r = buildWageBreakdown({ ...base, weekdays: 6, weekdayHoursPerDay: 8 });
    expect(r.monthlyOvertimeH).toBeCloseTo(8 * WEEKS_PER_MONTH, 2);
  });
});

describe("buildWageBreakdown · 휴일 (주말)", () => {
  it("주말 2일 × 4h · 월 휴일 = 2×4×4.3452", () => {
    const r = buildWageBreakdown({ ...base, weekendDays: 2, weekendHoursPerDay: 4 });
    expect(r.monthlyHolidayH).toBeCloseTo(2 * 4 * WEEKS_PER_MONTH, 2);
    expect(r.holidayPay.hours).toBeCloseTo(2 * 4 * WEEKS_PER_MONTH, 2);
  });

  it("휴일 rate = 통상시급 × 1.5", () => {
    const r = buildWageBreakdown({ ...base, weekendDays: 2, weekendHoursPerDay: 4 });
    expect(r.holidayPay.rate).toBe(Math.round(r.ordinaryHourly * 1.5));
  });
});

describe("buildWageBreakdown · 야간", () => {
  it("nightHoursMonthly=20 · rate = 통상시급 × 0.5 (가산분)", () => {
    const r = buildWageBreakdown({ ...base, nightHoursMonthly: 20 });
    expect(r.monthlyNightH).toBe(20);
    expect(r.nightPay.hours).toBe(20);
    expect(r.nightPay.rate).toBe(Math.round(r.ordinaryHourly * 0.5));
  });

  it("nightHoursMonthly 음수 · 0으로 clamp", () => {
    const r = buildWageBreakdown({ ...base, nightHoursMonthly: -5 });
    expect(r.monthlyNightH).toBe(0);
    expect(r.nightPay.amount).toBe(0);
  });
});

describe("buildWageBreakdown · 연차수당", () => {
  it("annualLeave · default 10h · rate = 통상시급", () => {
    const r = buildWageBreakdown(base);
    expect(r.annualLeave.hours).toBe(10);
    expect(r.annualLeave.rate).toBe(r.ordinaryHourly);
    expect(r.annualLeave.amount).toBe(Math.round(r.ordinaryHourly * 10));
  });

  it("annualLeaveMonthlyH=0 · amount 0", () => {
    const r = buildWageBreakdown({ ...base, annualLeaveMonthlyH: 0 });
    expect(r.annualLeave.hours).toBe(0);
    expect(r.annualLeave.amount).toBe(0);
  });
});

describe("buildWageBreakdown · 비과세 (식대·자가운전)", () => {
  it("mealAllowance 20만 · 반영", () => {
    const r = buildWageBreakdown({ ...base, mealAllowance: 200_000 });
    expect(r.mealAllowance).toBe(200_000);
  });

  it("vehicleAllowance 20만 · 반영", () => {
    const r = buildWageBreakdown({ ...base, vehicleAllowance: 200_000 });
    expect(r.vehicleAllowance).toBe(200_000);
  });

  it("nonTaxable 20만 · 통상시급 = (gross - 20만) / 209", () => {
    const r = buildWageBreakdown({ ...base, nonTaxable: 200_000 });
    expect(r.ordinaryHourly).toBe(Math.round((3_000_000 - 200_000) / 209));
  });

  it("nonTaxable > gross · 통상시급 0", () => {
    const r = buildWageBreakdown({ ...base, gross: 100_000, nonTaxable: 200_000 });
    expect(r.ordinaryHourly).toBe(0);
  });
});

describe("buildWageBreakdown · equivalentHours 공식", () => {
  it("연장·휴일 있을 때 · basic + 1.5×연장 + 1.5×휴일 + 0.5×야간", () => {
    const r = buildWageBreakdown({
      ...base,
      weekdays: 5,
      weekdayHoursPerDay: 9,
      weekendDays: 1,
      weekendHoursPerDay: 4,
      nightHoursMonthly: 10,
    });
    const expected =
      MONTHLY_STANDARD_HOURS +
      r.monthlyOvertimeH * 1.5 +
      r.monthlyHolidayH * 1.5 +
      r.monthlyNightH * 0.5;
    expect(r.equivalentHours).toBeCloseTo(expected, 4);
  });
});

describe("buildWageBreakdown · edge case", () => {
  it("weekdays=0 · weekendDays=0 · equivalentHours = 209 · ordinaryHourly > 0", () => {
    const r = buildWageBreakdown({ ...base, weekdays: 0 });
    expect(r.equivalentHours).toBe(MONTHLY_STANDARD_HOURS);
    expect(r.ordinaryHourly).toBeGreaterThan(0);
  });

  it("gross=0 · 모든 amount 0", () => {
    const r = buildWageBreakdown({ ...base, gross: 0 });
    expect(r.ordinaryHourly).toBe(0);
    expect(r.basicSalary.amount).toBe(0);
    expect(r.overtimePay.amount).toBe(0);
  });
});
