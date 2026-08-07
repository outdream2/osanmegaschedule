// src/lib/wageCalc.ts
// 노무사 표준 임금 계산 유틸 · ContractWriterPage 에서 이동 (god-phase1)
// T-X / T-CTR-9 (2026-08-05) · 근로기준법 §50·§56·§55

// 시간 상수 (포괄임금 산정 · 스펙 · 계약서 이미지 원본)
// 중요: OVERTIME(55.94) · HOLIDAY(22.00) 은 "이미 1.5배 가산이 반영된 시간"
//   · 실 연장 = 55.94 ÷ 1.5 = 37.29h · 주 8.58h
//   · 실 휴일 = 22 ÷ 1.5 = 14.67h · 월 1.83일
//   · 계산식에서 × 1.5 를 곱하면 안 됨 (2중 가산)
export const WAGE_HOURS = {
  BASIC: 209,           // 기본급 (주40 + 주휴 8) × 4.3452 ≈ 209
  OVERTIME: 55.94,      // 연장 (월평균) · 1.5배 가산 반영됨
  HOLIDAY: 22.00,       // 휴일 (월평균) · 1.5배 가산 반영됨
  ANNUAL_LEAVE: 10.00,  // 연차 (월평균 · 가산 없음)
} as const;

// T-P (2026-08-05) · 세전 총액 divisor · 통상시급 하나로 모든 항목 계산 (레거시 · 하드코딩)
//   세전 = 통상시급 × (209 + 55.94 + 22 + 10) = 통상시급 × 296.94
export const WAGE_DIVISOR =
  WAGE_HOURS.BASIC + WAGE_HOURS.OVERTIME + WAGE_HOURS.HOLIDAY + WAGE_HOURS.ANNUAL_LEAVE;

export const WEEK_PER_MONTH = 4.3452;
export const DAILY_LIMIT = 8;

export interface WageBaseHours {
  monthlyBasicH: number;           // 월 기본급 시간 (주휴 포함)
  monthlyOvertimeGainedH: number;  // 월 연장 시간 (× 1.5 가산 반영)
  monthlyHolidayGainedH: number;   // 월 휴일 시간 (× 1.5 가산 반영)
  monthlyOvertimeRealH: number;    // 월 연장 실시간 (참고 · 미가산)
  monthlyHolidayRealH: number;     // 월 휴일 실시간 (참고 · 미가산)
  weeklyBasicH: number;            // 주 기본 (참고)
  weeklyHolidayH: number;          // 주휴 (참고)
}

/**
 * T-X (2026-08-05) · 노무사 표준 계산법 · 동적 wage base
 *   · dailyBasic = min(dailyHours, 8)                        (일 기본 · 최대 8h · 법정근로시간)
 *   · dailyOvertime = max(0, dailyHours - 8)                 (일 연장)
 *   · weeklyBasic = dailyBasic × weekdays                    (주 소정)
 *   · weeklyHoliday = 40h 이상 → 8 · 15h 이상 → dailyBasic · 미만 → 0  (주휴수당 · 근기법 §55)
 *   · monthlyBasicH = (weeklyBasic + weeklyHoliday) × 4.3452
 *   · monthlyOvertimeRealH = weeklyOvertime × 4.3452
 *   · monthlyOvertimeGainedH = monthlyOvertimeRealH × 1.5    (연장 가산 · §56)
 *   · monthlyHolidayRealH = weekendDays × dailyHours × 4.3452
 *   · monthlyHolidayGainedH = monthlyHolidayRealH × 1.5      (휴일근로 · §56)
 *
 * 정본 케이스 (weekdays=5, weekendDays=0):
 *   · 7.5h → basic 195.5 · OT 0
 *   · 8.0h → basic 209   · OT 0
 *   · 8.5h → basic 209   · OT 16.29
 *   · 9.0h → basic 209   · OT 32.59
 *   · 10.0h → basic 209  · OT 65.18
 */
export function calcWageBase(dailyHours: number, weekdays: number, weekendDays: number = 0): WageBaseHours {
  // T-CTR-9 · Step 1 (2026-08-05) · NaN/Infinity 방어 · 입력 undefined/NaN → 0 대체
  const dh = Number.isFinite(dailyHours) ? Math.max(0, dailyHours) : 0;
  const wd = Number.isFinite(weekdays)   ? Math.max(0, weekdays)   : 0;
  const we = Number.isFinite(weekendDays) ? Math.max(0, weekendDays) : 0;
  const dailyBasic = Math.min(dh, DAILY_LIMIT);
  const dailyOvertime = Math.max(0, dh - DAILY_LIMIT);

  const weeklyBasic = dailyBasic * wd;
  const weeklyHoliday = weeklyBasic >= 40 ? 8 : (weeklyBasic >= 15 ? dailyBasic : 0);
  const weeklyOvertime = dailyOvertime * wd;

  const monthlyBasicH = (weeklyBasic + weeklyHoliday) * WEEK_PER_MONTH;
  const monthlyOvertimeRealH = weeklyOvertime * WEEK_PER_MONTH;
  const monthlyOvertimeGainedH = monthlyOvertimeRealH * 1.5;
  const monthlyHolidayRealH = we * dh * WEEK_PER_MONTH;
  const monthlyHolidayGainedH = monthlyHolidayRealH * 1.5;

  return {
    monthlyBasicH,
    monthlyOvertimeGainedH,
    monthlyHolidayGainedH,
    monthlyOvertimeRealH,
    monthlyHolidayRealH,
    weeklyBasicH: weeklyBasic,
    weeklyHolidayH: weeklyHoliday,
  };
}

// T-X (2026-08-05) · 통상시급 산정용 · 동적 divisor (기본+연장가산+휴일가산+연차)
export function calcDynamicDivisor(
  dailyHours: number,
  weekdays: number,
  weekendDays: number,
  annualLeaveH: number = WAGE_HOURS.ANNUAL_LEAVE,
): number {
  const b = calcWageBase(dailyHours, weekdays, weekendDays);
  return b.monthlyBasicH + b.monthlyOvertimeGainedH + b.monthlyHolidayGainedH + Math.max(0, annualLeaveH);
}
