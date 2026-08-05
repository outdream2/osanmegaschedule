// src/lib/payroll/grossUp.ts
// 2026-08-05 · 세후→세전 역산 · fixed-point iteration
// 세율이 누진이므로 `gross = net / (1-r)` 부정확 → 반복 근사 (Newton-like)

import { calcTaxes, type TaxBreakdown } from "./calcTaxes";

export interface GrossUpResult {
  gross: number;
  taxes: TaxBreakdown;
  iterations: number;
  converged: boolean;
}

/**
 * 세후 목표 → 세전 총액 역산 (반복 근사)
 *
 * @param netTarget   희망 세후 (원)
 * @param nonTaxable  비과세 (식대 + 차량 등)
 * @param dependents  부양가족 수 (본인 포함 · default 1)
 * @param opts.tolerance   오차 허용 (기본 100원)
 * @param opts.maxIter     최대 반복 (기본 20)
 * @param opts.overshoot   보정 배율 (기본 1.3)
 *
 * 수렴 · 미국 payroll SW (PaycheckCity 등) 동일 방식 · 3~5회 수렴 · 최대 20회.
 */
export function grossUp(
  netTarget: number,
  nonTaxable: number = 0,
  dependents: number = 1,
  opts?: { tolerance?: number; maxIter?: number; overshoot?: number },
): GrossUpResult {
  const tolerance = opts?.tolerance ?? 100;
  const maxIter = opts?.maxIter ?? 20;
  const overshoot = opts?.overshoot ?? 1.3;

  if (netTarget <= 0) {
    return {
      gross: 0,
      taxes: calcTaxes(0, 0, dependents),
      iterations: 0,
      converged: true,
    };
  }

  // 초기값 · 22% overhead 경험치
  let gross = netTarget * 1.25;

  for (let i = 0; i < maxIter; i += 1) {
    const taxableGross = Math.max(0, gross - nonTaxable);
    const taxes = calcTaxes(gross, taxableGross, dependents);
    const netCalc = gross - taxes.total;
    const error = netTarget - netCalc;

    if (Math.abs(error) < tolerance) {
      return {
        gross: Math.round(gross),
        taxes,
        iterations: i + 1,
        converged: true,
      };
    }
    gross += error * overshoot;
  }

  // 수렴 실패 · 마지막 값 반환 (throw 대신 · UI 는 별도 warning)
  const roundedGross = Math.round(gross);
  const taxableGross = Math.max(0, roundedGross - nonTaxable);
  return {
    gross: roundedGross,
    taxes: calcTaxes(roundedGross, taxableGross, dependents),
    iterations: maxIter,
    converged: false,
  };
}
