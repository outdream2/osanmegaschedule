// src/lib/payroll/insuranceRates.ts
// 2026-08-05 · 4대보험 요율 · 통상시급 상수 · docs/PAYROLL_ALGORITHM.md 준수
//
// 주의: 국민연금 2033년까지 매년 0.5%p 인상 로드맵 · 하드코딩 금지 · config 로 관리.
// 매년 3월 지급분부터 개정될 수 있음.

export const RATES_2026 = {
  nationalPension: 0.0475,      // 국민연금 (근로자 부담률)
  healthInsurance: 0.03595,     // 건강보험 (근로자 부담률)
  longTermCare: 0.1314,         // 장기요양 (건강보험료 대비 · 2026 기준 · 보건복지부 0.9448%/7.19%)
  employmentInsurance: 0.009,   // 고용보험 (근로자 부담률)
  localTaxRate: 0.10,           // 지방소득세 (소득세 × 10%)
} as const;

// 월 소정근로시간 · 주 40h + 주휴 8h × 4.3452주 ≈ 209h
export const MONTHLY_STANDARD_HOURS = 209;

// T-CTR-12 (2026-08-05) · 임금구성표 인정시간 (고정 상수) · 사용자 정본
//   · basic 209h          : 주 40h + 주휴 8h × 4.3452주
//   · fixedOvertime 55.94h: 약정 연장 실 37.3h × 1.5배 가산 포함
//   · fixedHoliday 22h    : 연간 공휴일/12개월 × 1.5배 가산 포함
//   · fixedAnnualLeave 10h: 월 1.25일 × 8h (연 15일 / 12개월)
//   · total 296.94h       : 통상시급 분모 (세전 X → 통상시급 = X / 296.94)
export const RECOGNIZED_HOURS = {
  basic: 209,
  fixedOvertime: 55.94,
  fixedHoliday: 22,
  fixedAnnualLeave: 10,
  total: 296.94,
} as const;

// 월 평균 주 수 (52.1775주 / 12개월)
export const WEEKS_PER_MONTH = 4.3452;

// 일 법정근로시간 (근기법 §50)
export const DAILY_LIMIT = 8;

// 주 법정근로시간
export const WEEKLY_LIMIT = 40;

// 최저임금 (2026) · 실제 확정치 확인 필요 · 미확정 시 근사 (2025 = 10,030 → 2026 인상 추정)
export const MIN_WAGE_2026 = 10_030;

// 비과세 상한 (실무)
export const NON_TAXABLE_LIMITS = {
  meal: 200_000,          // 식대 (2023.1 부터 20만/월)
  vehicle: 200_000,       // 자가운전보조 (요건 충족 시)
} as const;
