// src/lib/payroll/calcTaxes.ts
// 2026-08-05 · forward: gross → tax
// 4대보험 근로자 부담 + 소득세 + 지방소득세 산출

import { RATES_2026 } from "./insuranceRates";
import { approxIncomeTax } from "./simplifiedTax2026";

export interface TaxBreakdown {
  np: number;        // 국민연금
  hi: number;        // 건강보험
  ltc: number;       // 장기요양
  ei: number;        // 고용보험
  incomeTax: number; // 소득세
  localTax: number;  // 지방소득세
  total: number;     // 공제 합계
}

/**
 * 세전 총액 → 4대보험 + 소득세 + 지방세
 *
 * @param gross         세전 총액 (원) · 산재보험은 사업주 전액 · 근로자 부담 X
 * @param taxableGross  과세 급여 (원) = 세전 - 비과세 (식대·차량 등)
 * @param dependents    부양가족 수 (본인 포함 · default 1)
 */
export function calcTaxes(
  gross: number,
  taxableGross: number,
  dependents: number = 1,
): TaxBreakdown {
  // 4대보험 · 과세급여 기준 (국민연금은 상한 있으나 실무 상 대부분 미만 · 근사 유지)
  const np = Math.round(Math.max(0, taxableGross) * RATES_2026.nationalPension);
  const hi = Math.round(Math.max(0, taxableGross) * RATES_2026.healthInsurance);
  const ltc = Math.round(hi * RATES_2026.longTermCare);
  const ei = Math.round(Math.max(0, taxableGross) * RATES_2026.employmentInsurance);

  // 소득세 · 홈택스 간이세액표 근사 · 부양가족 반영
  const incomeTax = approxIncomeTax(taxableGross, dependents);
  const localTax = Math.round(incomeTax * RATES_2026.localTaxRate);

  // 참고: gross 인자는 향후 국민연금 상한 등 확장 여지 · 현재는 미사용
  void gross;

  return {
    np, hi, ltc, ei, incomeTax, localTax,
    total: np + hi + ltc + ei + incomeTax + localTax,
  };
}
