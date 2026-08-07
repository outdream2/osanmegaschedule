// src/lib/payroll/index.ts
// 2026-08-05 · payroll 모듈 · barrel export
// docs/PAYROLL_ALGORITHM.md 준수 · 사용자 정본 흐름

export {
  RATES_2026,
  MONTHLY_STANDARD_HOURS,
  WEEKS_PER_MONTH,
  DAILY_LIMIT,
  WEEKLY_LIMIT,
  MIN_WAGE_2026,
  NON_TAXABLE_LIMITS,
  RECOGNIZED_HOURS,
} from "./insuranceRates";

export { approxIncomeTax, calcMonthlyIncomeTax } from "./simplifiedTax2026";

export { calcTaxes, type TaxBreakdown } from "./calcTaxes";

export { grossUp, type GrossUpResult } from "./grossUp";

export {
  buildWageBreakdown,
  type WageBreakdownItem,
  type WageBreakdownResult,
  type BuildWageBreakdownInput,
} from "./buildWageBreakdown";

export {
  useWageCalculator,
  calculateWage,
  type WageCalculatorInput,
  type WageCalculatorResult,
} from "./useWageCalculator";
