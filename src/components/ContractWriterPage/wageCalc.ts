// src/components/ContractWriterPage/wageCalc.ts
// 근로계약서 임금 계산 순수 함수 모음 (절대 변경 금지)

import type { WageComponents } from "./types";
import { INSURANCE_RATES } from "./constants";
import { WAGE_HOURS, WAGE_DIVISOR } from "../../lib/wageCalc";
import {
  RECOGNIZED_HOURS,
  grossUp as payrollGrossUp,
  calcMonthlyIncomeTax as payrollCalcMonthlyIncomeTax,
  type WithholdingRate,
  DEFAULT_WITHHOLDING_RATE,
} from "../../lib/payroll";

export { WAGE_HOURS, WAGE_DIVISOR };

// 임금 8항목 총액 산출
export function computeWageTotal(w: WageComponents): number {
  return (
    (w.basicSalary?.amount ?? 0) +
    (w.fixedOvertime?.amount ?? 0) +
    (w.fixedHoliday?.amount ?? 0) +
    (w.fixedHolidayOvertime?.amount ?? 0) +
    (w.fixedNight?.amount ?? 0) +
    (w.fixedAnnualLeave?.amount ?? 0) +
    (w.mealAllowance ?? 0) +
    (w.vehicleAllowance ?? 0)
  );
}

// 시간 문자열 (HH:MM) 파싱
export function parseHM(s: string): { h: number; m: number } | null {
  const mm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!mm) return null;
  const h = Number(mm[1]);
  const m = Number(mm[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { h, m };
}

// 근무시간 → 월 근로시간 계산
export function computeMonthlyHours(startTime: string, endTime: string, breakMinutes: number, weeklyDays: number): {
  dailyMinutes: number;
  weeklyMinutes: number;
  monthlyMinutes: number;
  monthlyHours: number;
  monthlyHoursInt: number;
  monthlyMinutesRem: number;
} | null {
  const s = parseHM(startTime);
  const e = parseHM(endTime);
  if (!s || !e) return null;
  const rawMin = (e.h * 60 + e.m) - (s.h * 60 + s.m);
  if (rawMin <= 0) return null;
  const dailyMinutes = Math.max(0, rawMin - Math.max(0, breakMinutes));
  const weeklyMinutes = dailyMinutes * Math.max(0, weeklyDays);
  const monthlyMinutes = Math.ceil(weeklyMinutes * 4.345);
  const monthlyHours = monthlyMinutes / 60;
  const monthlyHoursInt = Math.floor(monthlyMinutes / 60);
  const monthlyMinutesRem = monthlyMinutes % 60;
  return { dailyMinutes, weeklyMinutes, monthlyMinutes, monthlyHours, monthlyHoursInt, monthlyMinutesRem };
}

// #220 · 개월수 산출
export function contractPeriodMonthsClient(startIso?: string | null, endIso?: string | null): number | null {
  if (!startIso || !endIso) return null;
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (e.getTime() < s.getTime()) return null;
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() >= s.getDate() - 1) months += 1;
  return months > 0 ? months : null;
}

// 시급 → 포괄임금 4항목 (레거시 · 하위호환)
export function computeWageFromHourly(weekdayHourly: number, _weekendHourly: number): {
  basicAmount: number;
  overtimeAmount: number;
  holidayAmount: number;
  annualLeaveAmount: number;
  total: number;
} {
  const w = Math.max(0, weekdayHourly);
  const basicAmount = Math.round(WAGE_HOURS.BASIC * w);
  const overtimeAmount = Math.round(WAGE_HOURS.OVERTIME * w);
  const holidayAmount = Math.round(WAGE_HOURS.HOLIDAY * w);
  const annualLeaveAmount = Math.round(WAGE_HOURS.ANNUAL_LEAVE * w);
  return {
    basicAmount, overtimeAmount, holidayAmount, annualLeaveAmount,
    total: basicAmount + overtimeAmount + holidayAmount + annualLeaveAmount,
  };
}

// 시급 + 각 항목 시간·분 → 임금구성 6항목 금액 산출
export function computeWageFromHourlyDual(
  weekdayHourly: number,
  _weekendHourly: number,
  wage: WageComponents,
): {
  basicAmount: number;
  overtimeAmount: number;
  holidayAmount: number;
  holidayOvertimeAmount: number;
  nightAmount: number;
  annualLeaveAmount: number;
  total: number;
} {
  const w = Number.isFinite(weekdayHourly) ? Math.max(0, weekdayHourly) : 0;
  const safeN = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const hoursOf = (e: typeof wage.basicSalary | undefined) => (e ? safeN(e.hours) + safeN(e.minutes) / 60 : 0);
  const basicH = hoursOf(wage.basicSalary);
  const overtimeH = hoursOf(wage.fixedOvertime);
  const holidayH = hoursOf(wage.fixedHoliday);
  const holidayOtH = hoursOf(wage.fixedHolidayOvertime);
  const nightH = hoursOf(wage.fixedNight);
  const annualH = hoursOf(wage.fixedAnnualLeave);
  const basicAmount           = Math.round(basicH     * w);
  const overtimeAmount        = Math.round(overtimeH  * w);
  const holidayAmount         = Math.round(holidayH   * w);
  const holidayOvertimeAmount = Math.round(holidayOtH * w * 0.5);
  const nightAmount           = Math.round(nightH     * w * 0.5);
  const annualLeaveAmount     = Math.round(annualH    * w);
  return {
    basicAmount, overtimeAmount, holidayAmount, holidayOvertimeAmount, nightAmount, annualLeaveAmount,
    total: basicAmount + overtimeAmount + holidayAmount + holidayOvertimeAmount + nightAmount + annualLeaveAmount,
  };
}

// 목표 월급 → 통상시급 (레거시 · 하드코딩 divisor)
export function computeHourlyFromTarget(targetTotal: number, dynamicDivisor?: number): number {
  const div = (dynamicDivisor != null && dynamicDivisor > 0) ? dynamicDivisor : WAGE_DIVISOR;
  if (div <= 0) return 0;
  return Math.round(Math.max(0, targetTotal) / div);
}

// 실 근무시간 기반 월급
export function computeActualPay(
  startTime: string,
  endTime: string,
  breakMinutes: number,
  weeklyWeekdayDays: number,
  weeklyWeekendDays: number,
  weekdayHourly: number,
  weekendHourly: number,
): {
  dailyHours: number;
  weekdayMonthlyHours: number;
  weekendMonthlyHours: number;
  weekdayPay: number;
  weekendPay: number;
  total: number;
} | null {
  const s = parseHM(startTime);
  const e = parseHM(endTime);
  if (!s || !e) return null;
  const rawMin = (e.h * 60 + e.m) - (s.h * 60 + s.m);
  if (rawMin <= 0) return null;
  const dailyMin = Math.max(0, rawMin - Math.max(0, breakMinutes));
  const dailyHours = dailyMin / 60;
  const weekdayMonthlyMinutes = Math.ceil(dailyMin * Math.max(0, weeklyWeekdayDays) * 4.345);
  const weekendMonthlyMinutes = Math.ceil(dailyMin * Math.max(0, weeklyWeekendDays) * 4.345);
  const weekdayMonthlyHours = weekdayMonthlyMinutes / 60;
  const weekendMonthlyHours = weekendMonthlyMinutes / 60;
  const weekdayPay = Math.round(weekdayMonthlyHours * Math.max(0, weekdayHourly));
  const weekendPay = Math.round(weekendMonthlyHours * Math.max(0, weekendHourly));
  return {
    dailyHours,
    weekdayMonthlyHours,
    weekendMonthlyHours,
    weekdayPay,
    weekendPay,
    total: weekdayPay + weekendPay,
  };
}

// 4대보험 · 근로자 부담
export function computeInsurance(gross: number): {
  pension: number;
  health: number;
  ltc: number;
  employment: number;
  total: number;
} {
  const g = Math.max(0, gross);
  const pension = Math.round(g * INSURANCE_RATES.PENSION);
  const health = Math.round(g * INSURANCE_RATES.HEALTH);
  const ltc = Math.round(health * INSURANCE_RATES.LTC_RATIO);
  const employment = Math.round(g * INSURANCE_RATES.EMPLOYMENT);
  return { pension, health, ltc, employment, total: pension + health + ltc + employment };
}

// 소득세 · 국세청 간이세액표 7단계 정식 공식 (2026)
export function computeIncomeTax(
  gross: number,
  dependents: number = 1,
  withholdingRate: WithholdingRate = DEFAULT_WITHHOLDING_RATE,
  childrenCount: number = 0,
  extraDeduction: number = 0,
): { incomeTax: number; localTax: number; total: number } {
  return payrollCalcMonthlyIncomeTax(Math.max(0, gross), Math.max(0, extraDeduction), dependents, 0, withholdingRate, childrenCount);
}

// 실수령액 = 세전 - 4대보험 - 소득세 - 지방소득세
export function computeNetPay(gross: number): {
  insurance: ReturnType<typeof computeInsurance>;
  tax: ReturnType<typeof computeIncomeTax>;
  net: number;
} {
  const insurance = computeInsurance(gross);
  const tax = computeIncomeTax(gross);
  return { insurance, tax, net: Math.max(0, gross - insurance.total - tax.total) };
}

// 세후 목표 → 세전 총액 역산
export function reverseGrossFromNet(targetNet: number, nonTaxable: number = 0, dependents: number = 1): number {
  if (targetNet <= 0) return 0;
  const res = payrollGrossUp(targetNet, Math.max(0, nonTaxable), Math.max(1, dependents));
  return res.gross;
}

// 세후 목표 → 통상시급 · 4항목 임금구성 역산
export function reverseWageFromNet(
  targetNet: number,
  prevWage: WageComponents,
): { hourly: number; gross: number; wage: WageComponents } {
  const gross = reverseGrossFromNet(targetNet);
  const hourly = WAGE_DIVISOR > 0 ? Math.round(gross / WAGE_DIVISOR) : 0;
  const basicAmount        = Math.round(WAGE_HOURS.BASIC * hourly);
  const overtimeAmount     = Math.round(WAGE_HOURS.OVERTIME * hourly);
  const holidayAmount      = Math.round(WAGE_HOURS.HOLIDAY * hourly);
  const annualLeaveAmount  = Math.round(WAGE_HOURS.ANNUAL_LEAVE * hourly);
  const wage: WageComponents = {
    ...prevWage,
    basicSalary:      { hours: 209, minutes: 0,  amount: basicAmount },
    fixedOvertime:    { hours: 55,  minutes: 56, amount: overtimeAmount },
    fixedHoliday:     { hours: 22,  minutes: 0,  amount: holidayAmount },
    fixedAnnualLeave: { hours: 10,  minutes: 0,  amount: annualLeaveAmount },
  };
  return { hourly, gross, wage };
}

// 세후 목표 → 주중/주말 시급 · 6항목 임금구성 역산
export function reverseWageFromNetDual(
  targetNet: number,
  currentWeekdayHourly: number,
  currentWeekendHourly: number,
  prevWage: WageComponents,
): {
  weekdayHourly: number;
  weekendHourly: number;
  gross: number;
  wage: WageComponents;
} {
  const gross = reverseGrossFromNet(targetNet);
  const wdBase = currentWeekdayHourly > 0 ? currentWeekdayHourly : 35000;
  const weBase = currentWeekendHourly > 0 ? currentWeekendHourly : 40000;
  const baseCalc = computeWageFromHourlyDual(wdBase, weBase, prevWage);
  const currentGross = baseCalc.total;
  const scale = currentGross > 0 ? gross / currentGross : 0;
  const weekdayHourly = Math.round(wdBase * scale);
  const weekendHourly = Math.round(weBase * scale);
  const finalCalc = computeWageFromHourlyDual(weekdayHourly, weekendHourly, prevWage);
  const wage: WageComponents = {
    ...prevWage,
    basicSalary:          { ...prevWage.basicSalary,          amount: finalCalc.basicAmount },
    fixedOvertime:        { ...prevWage.fixedOvertime,        amount: finalCalc.overtimeAmount },
    fixedHoliday:         { ...prevWage.fixedHoliday,         amount: finalCalc.holidayAmount },
    fixedHolidayOvertime: { ...prevWage.fixedHolidayOvertime, amount: finalCalc.holidayOvertimeAmount },
    fixedNight:           { ...prevWage.fixedNight,           amount: finalCalc.nightAmount },
    fixedAnnualLeave:     { ...prevWage.fixedAnnualLeave,     amount: finalCalc.annualLeaveAmount },
  };
  return { weekdayHourly, weekendHourly, gross, wage };
}

// 계약유형 → 월급제 여부
export function isMonthlyWageType(contractType: string): boolean {
  return contractType === "정규직" || contractType === "계약직" || contractType === "인턴";
}

// 통상시급 자동 반복 근사
export function computeAutoHourly(target: number, wdRate: number, extras: number): number {
  if (target <= 0) return Math.round(Math.max(0, wdRate) * 10) / 10;
  let h = wdRate > 0 ? wdRate : 25000;
  for (let i = 0; i < 10; i++) {
    const basic = h * WAGE_HOURS.BASIC;
    const g = h * WAGE_DIVISOR + extras;
    const p = basic * INSURANCE_RATES.PENSION;
    const hh = basic * INSURANCE_RATES.HEALTH;
    const lt = hh * INSURANCE_RATES.LTC_RATIO;
    const em = basic * INSURANCE_RATES.EMPLOYMENT;
    const insSum = p + hh + lt + em;
    const net = g - insSum;
    const delta = target - net;
    if (Math.abs(delta) < 50) break;
    h += delta / WAGE_DIVISOR;
    if (h < 0) h = 0;
  }
  return Math.round(h * 10) / 10;
}

// T-CTR-WageByType · 계약유형별 임금 5단계 계산
export function computeWageFlow(
  contractType: string,
  weekdayHourly: number,
  weekendHourly: number,
  weeklyWeekdayH: number,
  weeklyWeekendH: number,
  basicH: number,
  otH: number,
  holH: number,
  annualH: number,
): {
  isMonthly: boolean;
  weeklyPay: number;
  monthlyNet: number;
  gross: number;
  taxTotal: number;
  netAmount: number;
  ordinaryHourly: number;
  basic: number;
  overtime: number;
  holiday: number;
  annualLeave: number;
  divisor: number;
  converged: boolean;
} {
  const isMonthly = isMonthlyWageType(contractType);
  const wd = Math.max(0, weekdayHourly);
  const we = Math.max(0, weekendHourly) || wd;
  const divisor = basicH + otH + holH + annualH;

  const weeklyPay   = Math.round(weeklyWeekdayH * wd + weeklyWeekendH * we);
  const monthlyNet  = Math.round(weeklyPay * 4.345);
  const { gross, taxes, converged } = payrollGrossUp(monthlyNet, 0, 1);
  const taxTotal    = taxes.total;
  const netAmount   = Math.max(0, gross - taxTotal);
  const ordinaryHourly = divisor > 0 ? Math.round(gross / divisor) : 0;
  const basic       = Math.round(ordinaryHourly * basicH);
  const overtime    = Math.round(ordinaryHourly * otH);
  const holiday     = Math.round(ordinaryHourly * holH);
  const annualLeave = Math.round(ordinaryHourly * annualH);
  return {
    isMonthly,
    weeklyPay, monthlyNet,
    gross, taxTotal, netAmount,
    ordinaryHourly,
    basic, overtime, holiday, annualLeave,
    divisor,
    converged,
  };
}

// 유틸 함수 (포맷팅)
export const fmtWon = (v: string | number): string => {
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9-]/g, ""));
  if (!Number.isFinite(n) || n === 0) return "0";
  return n.toLocaleString("ko-KR");
};

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const fmtKoreanDate = (iso: string): string => {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
};

// RECOGNIZED_HOURS 재수출 (Step 4 useEffect 에서 사용)
export { RECOGNIZED_HOURS };
