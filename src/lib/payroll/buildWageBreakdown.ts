// src/lib/payroll/buildWageBreakdown.ts
// 2026-08-05 · 세전 총액 → 임금구성표 자동 분배 (통상시급 방식)
//
// 통상시급 (근기법 시행령 §6) = (세전 - 비과세) ÷ 임금산정시간
// 임금산정시간 = 209 + (월연장h × 1.5) + (월휴일h × 1.5) + (월야간h × 0.5)
//
// 각 항목:
//   기본급   = 통상시급 × 209
//   연장     = 통상시급 × 연장h × 1.5
//   휴일     = 통상시급 × 휴일h × 1.5 (8h 이내) · × 2.0 (8h 초과)
//   야간     = 통상시급 × 야간h × 0.5 (가산분만)
//   연차수당 = 통상시급 × 8h × 미사용일수 (월할 · 연 15일 / 12 ≈ 1.25일 · 근사 10h)
//   식대     = 최대 20만/월 (비과세)
//   자가운전 = 최대 20만/월 (비과세)

import { MONTHLY_STANDARD_HOURS, WEEKS_PER_MONTH, DAILY_LIMIT } from "./insuranceRates";

export interface WageBreakdownItem {
  hours: number;   // 시간
  rate: number;    // 시간당 (가산 반영)
  amount: number;  // 금액
}

export interface WageBreakdownResult {
  basicSalary: WageBreakdownItem;      // 기본급 (주휴 포함)
  overtimePay: WageBreakdownItem;      // 연장근로수당
  holidayPay: WageBreakdownItem;       // 휴일근로수당
  nightPay: WageBreakdownItem;         // 야간근로수당 (가산분)
  annualLeave: WageBreakdownItem;      // 연차수당
  mealAllowance: number;               // 식대 (비과세)
  vehicleAllowance: number;            // 자가운전 (비과세)
  ordinaryHourly: number;              // 통상시급
  monthlyOvertimeH: number;            // 월 연장 실시간 (참고)
  monthlyHolidayH: number;             // 월 휴일 실시간 (참고)
  monthlyNightH: number;               // 월 야간 실시간 (참고)
  equivalentHours: number;             // 임금산정시간
}

export interface BuildWageBreakdownInput {
  gross: number;                       // 세전 총액
  nonTaxable: number;                  // 비과세 (식대+차량)
  weekdays: number;                    // 주중 근무일수
  weekdayHoursPerDay: number;          // 주중 하루 근무시간
  weekendDays: number;                 // 주말 근무일수
  weekendHoursPerDay: number;          // 주말 하루 근무시간
  mealAllowance?: number;              // 식대
  vehicleAllowance?: number;           // 자가운전
  annualLeaveMonthlyH?: number;        // 월 연차수당 시간 (default 10h)
  nightHoursMonthly?: number;          // 월 야간근로 시간 (default 0)
}

/**
 * 세전 총액 · 근무조건 → 임금구성표
 */
export function buildWageBreakdown(input: BuildWageBreakdownInput): WageBreakdownResult {
  const {
    gross,
    nonTaxable,
    weekdays,
    weekdayHoursPerDay,
    weekendDays,
    weekendHoursPerDay,
    mealAllowance = 0,
    vehicleAllowance = 0,
    annualLeaveMonthlyH = 10,
    nightHoursMonthly = 0,
  } = input;

  // 주중 · 하루 8h 초과 시 연장 (근기법 §50)
  const weekdayDailyBasic = Math.min(weekdayHoursPerDay, DAILY_LIMIT);
  const weekdayDailyOvertime = Math.max(0, weekdayHoursPerDay - DAILY_LIMIT);

  // 주 소정 (주중 만) · 40h 초과 · 초과분도 연장
  const weeklyWeekdayBasic = weekdayDailyBasic * weekdays;
  const weeklyWeekdayOvertime = weekdayDailyOvertime * weekdays;
  const weeklyOverForty = Math.max(0, weeklyWeekdayBasic - 40);
  const weeklyOvertime = weeklyWeekdayOvertime + weeklyOverForty;

  // 월 시간
  const monthlyOvertimeH = weeklyOvertime * WEEKS_PER_MONTH;
  const monthlyHolidayH = weekendDays * weekendHoursPerDay * WEEKS_PER_MONTH;
  const monthlyNightH = Math.max(0, nightHoursMonthly);

  // 임금산정시간 (equivalent hours)
  const equivalentHours = MONTHLY_STANDARD_HOURS
    + monthlyOvertimeH * 1.5
    + monthlyHolidayH * 1.5
    + monthlyNightH * 0.5;

  const taxable = Math.max(0, gross - nonTaxable);
  const ordinaryHourly = equivalentHours > 0
    ? Math.round(taxable / equivalentHours)
    : 0;

  // 각 항목
  const basicSalary: WageBreakdownItem = {
    hours: MONTHLY_STANDARD_HOURS,
    rate: ordinaryHourly,
    amount: Math.round(ordinaryHourly * MONTHLY_STANDARD_HOURS),
  };
  const overtimePay: WageBreakdownItem = {
    hours: monthlyOvertimeH,
    rate: Math.round(ordinaryHourly * 1.5),
    amount: Math.round(ordinaryHourly * 1.5 * monthlyOvertimeH),
  };
  const holidayPay: WageBreakdownItem = {
    hours: monthlyHolidayH,
    rate: Math.round(ordinaryHourly * 1.5),
    amount: Math.round(ordinaryHourly * 1.5 * monthlyHolidayH),
  };
  const nightPay: WageBreakdownItem = {
    hours: monthlyNightH,
    rate: Math.round(ordinaryHourly * 0.5),
    amount: Math.round(ordinaryHourly * 0.5 * monthlyNightH),
  };
  const annualLeave: WageBreakdownItem = {
    hours: annualLeaveMonthlyH,
    rate: ordinaryHourly,
    amount: Math.round(ordinaryHourly * annualLeaveMonthlyH),
  };

  return {
    basicSalary,
    overtimePay,
    holidayPay,
    nightPay,
    annualLeave,
    mealAllowance,
    vehicleAllowance,
    ordinaryHourly,
    monthlyOvertimeH,
    monthlyHolidayH,
    monthlyNightH,
    equivalentHours,
  };
}
