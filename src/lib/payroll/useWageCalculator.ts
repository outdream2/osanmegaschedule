// src/lib/payroll/useWageCalculator.ts
// 2026-08-05 · React 훅 · 사용자 정본 흐름
//
// 1. 근무조건 (주중일수·하루h · 주말일수·하루h)
// 2. 직군별 시급 (주중·주말)
// 3. 희망세후 = (주중일수 × 하루h × 주중시급 + 주말일수 × 하루h × 주말시급) × 4.3452
// 4. 역산 (gross-up · 반복 근사) → 세전
// 5. 통상시급 분배 → 기본급·연장·휴일·야간·연차·식대·차량 자동
// 6. 세전 - 4대보험 - 소득세 - 지방세 = 세후 (100원 이내)

import { useEffect, useMemo, useState } from "react";
import { WEEKS_PER_MONTH, MIN_WAGE_2026 } from "./insuranceRates";
import { grossUp, type GrossUpResult } from "./grossUp";
import { buildWageBreakdown, type WageBreakdownResult } from "./buildWageBreakdown";

export interface WageCalculatorInput {
  weekdays: number;                    // 주중 근무일수 (0~5)
  weekdayHoursPerDay: number;          // 주중 하루 근무시간
  weekendDays: number;                 // 주말 근무일수 (0~2)
  weekendHoursPerDay: number;          // 주말 하루 근무시간
  weekdayHourlyRate: number;           // 주중 시급
  weekendHourlyRate: number;           // 주말 시급
  taxDependents?: number;              // 부양가족 (default 1)
  mealAllowance?: number;              // 식대 (비과세)
  vehicleAllowance?: number;           // 자가운전 (비과세)
  annualLeaveMonthlyH?: number;        // 월 연차수당 시간 (default 10h)
  nightHoursMonthly?: number;          // 월 야간근로 시간 (default 0)
  overrideDesiredNet?: number | null;  // 사용자가 세후를 직접 입력한 경우 · null 이면 자동 산출
}

export interface WageCalculatorResult {
  desiredNet: number;                  // 희망 세후 (자동 or 사용자 입력)
  gross: number;                       // 세전 총액
  wageBreakdown: WageBreakdownResult;  // 임금구성표
  taxes: GrossUpResult["taxes"];       // 세금 상세
  netCalculated: number;               // 실제 세후 (검산)
  reconciliation: {
    diff: number;                      // 희망 - 실제
    iterations: number;
    converged: boolean;
  };
  minimumWageWarning: boolean;         // 통상시급 < 최저시급
  belowMinWageRate: number;            // 최저시급 기준 (참고)
}

/**
 * 사용자 정본 흐름 · 시급 × 시간 → 세후 → 역산 → 세전 → 임금구성 자동
 *
 * · 입력 변경 시 debounce 200ms (렌더 무한 루프 방지 · UX 부드러움)
 * · overrideDesiredNet 값이 있으면 그 값을 세후 목표로 사용
 */
export function useWageCalculator(input: WageCalculatorInput): WageCalculatorResult {
  const {
    weekdays,
    weekdayHoursPerDay,
    weekendDays,
    weekendHoursPerDay,
    weekdayHourlyRate,
    weekendHourlyRate,
    taxDependents = 1,
    mealAllowance = 0,
    vehicleAllowance = 0,
    annualLeaveMonthlyH = 10,
    nightHoursMonthly = 0,
    overrideDesiredNet = null,
  } = input;

  // debounce 상태 · 200ms
  const [debouncedInput, setDebouncedInput] = useState(input);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInput(input), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    weekdays, weekdayHoursPerDay, weekendDays, weekendHoursPerDay,
    weekdayHourlyRate, weekendHourlyRate,
    taxDependents, mealAllowance, vehicleAllowance,
    annualLeaveMonthlyH, nightHoursMonthly, overrideDesiredNet,
  ]);

  return useMemo(() => calculateWage(debouncedInput), [debouncedInput]);
}

/**
 * 순수 함수 · 훅 없이 직접 호출 가능 (테스트·검증용)
 */
export function calculateWage(input: WageCalculatorInput): WageCalculatorResult {
  const {
    weekdays,
    weekdayHoursPerDay,
    weekendDays,
    weekendHoursPerDay,
    weekdayHourlyRate,
    weekendHourlyRate,
    taxDependents = 1,
    mealAllowance = 0,
    vehicleAllowance = 0,
    annualLeaveMonthlyH = 10,
    nightHoursMonthly = 0,
    overrideDesiredNet = null,
  } = input;

  // Step 1 · 희망 세후 (자동 or override)
  const weeklyWeekdayH = Math.max(0, weekdays) * Math.max(0, weekdayHoursPerDay);
  const weeklyWeekendH = Math.max(0, weekendDays) * Math.max(0, weekendHoursPerDay);
  const autoDesiredNet = Math.round(
    (weeklyWeekdayH * Math.max(0, weekdayHourlyRate)
      + weeklyWeekendH * Math.max(0, weekendHourlyRate))
    * WEEKS_PER_MONTH,
  );
  const desiredNet = overrideDesiredNet != null && overrideDesiredNet > 0
    ? overrideDesiredNet
    : autoDesiredNet;

  // Step 2 · 세후→세전 역산
  const nonTaxable = mealAllowance + vehicleAllowance;
  const { gross, taxes, iterations, converged } = grossUp(desiredNet, nonTaxable, taxDependents);

  // Step 3 · 통상시급 분배 · 임금구성표
  const wageBreakdown = buildWageBreakdown({
    gross,
    nonTaxable,
    weekdays,
    weekdayHoursPerDay,
    weekendDays,
    weekendHoursPerDay,
    mealAllowance,
    vehicleAllowance,
    annualLeaveMonthlyH,
    nightHoursMonthly,
  });

  const netCalculated = gross - taxes.total;
  const diff = desiredNet - netCalculated;

  // 최저임금 검사 · 통상시급 < 최저시급
  const minimumWageWarning = wageBreakdown.ordinaryHourly > 0
    && wageBreakdown.ordinaryHourly < MIN_WAGE_2026;

  return {
    desiredNet,
    gross,
    wageBreakdown,
    taxes,
    netCalculated,
    reconciliation: { diff, iterations, converged },
    minimumWageWarning,
    belowMinWageRate: MIN_WAGE_2026,
  };
}
