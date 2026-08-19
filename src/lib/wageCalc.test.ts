// 2026-08-19 · wageCalc · 노무사 표준 임금 계산 (근로기준법 §50/§55/§56)
import { describe, it, expect } from "vitest";
import {
  calcWageBase,
  calcDynamicDivisor,
  WAGE_HOURS,
  WAGE_DIVISOR,
  WEEK_PER_MONTH,
  DAILY_LIMIT,
} from "./wageCalc";

describe("상수 · WAGE_HOURS · WAGE_DIVISOR · WEEK_PER_MONTH · DAILY_LIMIT", () => {
  it("WAGE_HOURS · BASIC=209 · OVERTIME=55.94 · HOLIDAY=22 · ANNUAL_LEAVE=10", () => {
    expect(WAGE_HOURS.BASIC).toBe(209);
    expect(WAGE_HOURS.OVERTIME).toBe(55.94);
    expect(WAGE_HOURS.HOLIDAY).toBe(22.00);
    expect(WAGE_HOURS.ANNUAL_LEAVE).toBe(10.00);
  });

  it("WAGE_DIVISOR = 296.94", () => {
    expect(WAGE_DIVISOR).toBeCloseTo(296.94, 2);
  });

  it("WEEK_PER_MONTH · 4.3452", () => {
    expect(WEEK_PER_MONTH).toBe(4.3452);
  });

  it("DAILY_LIMIT · 8 (법정근로시간)", () => {
    expect(DAILY_LIMIT).toBe(8);
  });
});

describe("calcWageBase · 표준 케이스 (평일 5일)", () => {
  it("7.5h × 5일 · 주 37.5 (40 미만) · 주휴 dailyBasic(7.5)", () => {
    const r = calcWageBase(7.5, 5, 0);
    expect(r.weeklyBasicH).toBe(37.5);
    expect(r.weeklyHolidayH).toBe(7.5); // 40 미만 15 이상 → dailyBasic
    // (37.5 + 7.5) × 4.3452 = 45 × 4.3452 = 195.534
    expect(r.monthlyBasicH).toBeCloseTo(195.534, 2);
    expect(r.monthlyOvertimeGainedH).toBe(0);
  });

  it("8.0h × 5일 · 주 40 · 주휴 8h · basic=209", () => {
    const r = calcWageBase(8, 5, 0);
    expect(r.weeklyBasicH).toBe(40);
    expect(r.weeklyHolidayH).toBe(8);
    // (40 + 8) × 4.3452 = 48 × 4.3452 = 208.5696 ≈ 209
    expect(r.monthlyBasicH).toBeCloseTo(208.5696, 2);
    expect(r.monthlyOvertimeGainedH).toBe(0);
  });

  it("8.5h × 5일 · 초과 0.5h/일 × 5 = 2.5h/주 · 연장 × 1.5 반영", () => {
    const r = calcWageBase(8.5, 5, 0);
    expect(r.weeklyBasicH).toBe(40);
    expect(r.weeklyHolidayH).toBe(8);
    // 연장 실: 2.5 × 4.3452 = 10.863
    expect(r.monthlyOvertimeRealH).toBeCloseTo(10.863, 2);
    // 연장 가산: 10.863 × 1.5 ≈ 16.29
    expect(r.monthlyOvertimeGainedH).toBeCloseTo(16.29, 1);
  });

  it("9.0h × 5일 · 초과 5h/주 · 32.59 가산", () => {
    const r = calcWageBase(9, 5, 0);
    // 5 × 4.3452 × 1.5 = 32.589
    expect(r.monthlyOvertimeGainedH).toBeCloseTo(32.59, 1);
  });

  it("10.0h × 5일 · 초과 10h/주 · 65.18 가산", () => {
    const r = calcWageBase(10, 5, 0);
    // 10 × 4.3452 × 1.5 = 65.178
    expect(r.monthlyOvertimeGainedH).toBeCloseTo(65.18, 1);
  });
});

describe("calcWageBase · 주휴수당 근기법 §55 · 조건", () => {
  it("주 15h 미만 · 주휴 0", () => {
    const r = calcWageBase(2, 5, 0); // 10h/week
    expect(r.weeklyBasicH).toBe(10);
    expect(r.weeklyHolidayH).toBe(0);
  });

  it("주 15h 이상 · 주 40h 미만 · dailyBasic 만큼", () => {
    const r = calcWageBase(4, 5, 0); // 20h/week
    expect(r.weeklyHolidayH).toBe(4); // dailyBasic
  });

  it("주 40h 이상 · 주휴 8", () => {
    const r = calcWageBase(8, 5, 0);
    expect(r.weeklyHolidayH).toBe(8);
  });

  it("주 15h 경계값 · 15h · dailyBasic", () => {
    const r = calcWageBase(3, 5, 0); // 15h/week
    expect(r.weeklyHolidayH).toBe(3);
  });
});

describe("calcWageBase · 휴일근로 (주말 근무)", () => {
  it("weekendDays=1 · 8h · 월 8 × 4.3452 × 1.5 = 52.14 가산", () => {
    const r = calcWageBase(8, 5, 1);
    // 실: 1 × 8 × 4.3452 = 34.76
    expect(r.monthlyHolidayRealH).toBeCloseTo(34.7616, 2);
    // 가산: × 1.5 = 52.14
    expect(r.monthlyHolidayGainedH).toBeCloseTo(52.14, 1);
  });

  it("weekendDays=0 · 휴일 0", () => {
    const r = calcWageBase(8, 5, 0);
    expect(r.monthlyHolidayRealH).toBe(0);
    expect(r.monthlyHolidayGainedH).toBe(0);
  });
});

describe("calcWageBase · NaN/음수/undefined 방어", () => {
  it("NaN 입력 · 0 대체", () => {
    const r = calcWageBase(NaN, 5);
    expect(r.weeklyBasicH).toBe(0);
    expect(r.monthlyOvertimeGainedH).toBe(0);
  });

  it("음수 입력 · 0 clamp", () => {
    const r = calcWageBase(-5, 5);
    expect(r.weeklyBasicH).toBe(0);
  });

  it("Infinity · 0 대체", () => {
    const r = calcWageBase(Infinity, 5);
    expect(r.weeklyBasicH).toBe(0);
  });

  it("weekdays 0 · 모든 시간 0", () => {
    const r = calcWageBase(8, 0);
    expect(r.weeklyBasicH).toBe(0);
    expect(r.monthlyBasicH).toBe(0);
  });
});

describe("calcDynamicDivisor", () => {
  it("표준 8h × 5일 · basic 208.5696 + OT 0 + HOLIDAY 0 + AL 10 = 218.5696", () => {
    const d = calcDynamicDivisor(8, 5, 0);
    expect(d).toBeCloseTo(218.5696, 2);
  });

  it("연장 있음 · 9h × 5일 · basic + gained OT + AL", () => {
    const d = calcDynamicDivisor(9, 5, 0);
    // basic 208.5696 + OT 32.589 + 0 + 10 = 251.16
    expect(d).toBeCloseTo(251.16, 1);
  });

  it("annualLeaveH 커스텀", () => {
    const d1 = calcDynamicDivisor(8, 5, 0, 20);
    const d2 = calcDynamicDivisor(8, 5, 0, 10);
    expect(d1 - d2).toBeCloseTo(10, 2);
  });

  it("음수 annualLeaveH · 0 clamp", () => {
    const d = calcDynamicDivisor(8, 5, 0, -5);
    // AL 0 · basic 208.5696 + 0 + 0 + 0 = 208.5696
    expect(d).toBeCloseTo(208.5696, 2);
  });
});
