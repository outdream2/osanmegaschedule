// src/lib/payroll/simplifiedTax2026.ts
// 2026-08-07 · 국세청 간이세액표 근사 · 부양가족 수 반영 · 원천징수 비율 옵션
//
// 실무 표 (부양가족 1인 · 100% 원천징수 · 사용자 확정 데이터):
//   200만  → 소득세  19,520 (지방세 1,950 · 1.07%)
//   300만  → 소득세  84,850 (지방세 8,480 · 3.11%)
//   467만  → 소득세 263,550 (지방세 26,350 · 6.20%)  ← 기본급 단독 예시
//   500만  → 소득세 326,270 (지방세 32,620 · 7.18%)
//   663만  → 소득세 558,400 (지방세 55,840 · 9.26%)  ← 포괄 총액 예시
//   1000만 → 소득세 1,477,810 (지방세 147,780 · 16.25%)
//
// 지방소득세 = 소득세 × 10% (calcTaxes 에서 별도 계산)
// 원천징수 비율 옵션 · 80% / 100% / 120% (근로자 선택 · applyRate 함수)

// 부양가족 1인 · 소득세 근사표 (월 과세급여 → 소득세 원)
// 실무 홈택스 값 기반 · 구간별 선형 보간
const INCOME_TAX_TABLE_1DEP: Array<[gross: number, tax: number]> = [
  [0,          0],
  [1_500_000,  0],           // ~150만 이하 · 사실상 면세
  [2_000_000,  19_520],      // ~200만 · 실무 표
  [3_000_000,  84_850],      // ~300만 · 실무 표
  [4_000_000,  180_000],     // ~400만 · 보간
  [4_670_000,  263_550],     // ~467만 · 실무 표
  [5_000_000,  326_270],     // ~500만 · 실무 표
  [6_000_000,  475_000],     // ~600만 · 보간
  [6_630_000,  558_400],     // ~663만 · 실무 표
  [7_000_000,  650_000],     // ~700만 · 실무 표
  [8_000_000,  875_000],     // ~800만 · 보간
  [10_000_000, 1_477_810],   // ~1000만 · 실무 표
  [12_000_000, 1_950_000],   // ~1200만 · 보간
  [15_000_000, 2_750_000],   // ~1500만 · 보간
];

/**
 * 원천징수 비율 옵션 · 근로자 선택 (근소세법 §137 · 국세청 안내)
 *   · 80%  · 매달 세금 적게 · 연말정산 추가 납부 가능성
 *   · 100% · 간이세액표 정석 (기본)
 *   · 120% · 매달 세금 많이 · 연말정산 환급 가능성
 */
export type WithholdingRate = 0.8 | 1.0 | 1.2;
export const WITHHOLDING_RATES: readonly WithholdingRate[] = [0.8, 1.0, 1.2] as const;
export const DEFAULT_WITHHOLDING_RATE: WithholdingRate = 1.0;

/**
 * 부양가족 인원 수 → 소득세 감소 계수 (실무 근사)
 * 홈택스 공식 표 · 부양가족 별 차감액 근사
 *   1인 → 1.0 (기본)
 *   2인 → 0.85
 *   3인 → 0.70
 *   4인 → 0.55
 *   5인 → 0.40
 *   6인+ → 0.30
 */
function dependentsFactor(dependents: number): number {
  const d = Math.max(1, Math.floor(dependents));
  if (d === 1) return 1.0;
  if (d === 2) return 0.85;
  if (d === 3) return 0.70;
  if (d === 4) return 0.55;
  if (d === 5) return 0.40;
  return 0.30;
}

/**
 * 소득세 근사 (홈택스 간이세액표 기반 · 부양가족 반영 · 원천징수 비율 옵션)
 * @param taxableGross 월 과세급여 (세전 - 비과세)
 * @param dependents 부양가족 수 (본인 포함 · default 1)
 * @param withholdingRate 원천징수 비율 (0.8 / 1.0 / 1.2 · default 1.0)
 * @returns 소득세 (원)
 */
export function approxIncomeTax(taxableGross: number, dependents: number = 1, withholdingRate: WithholdingRate = DEFAULT_WITHHOLDING_RATE): number {
  const g = Math.max(0, taxableGross);
  const table = INCOME_TAX_TABLE_1DEP;
  const factor = dependentsFactor(dependents) * withholdingRate;

  // 표 범위 초과 · 마지막 두 점 선형 외삽 (누진 반영 위해 기울기 유지)
  const last = table[table.length - 1];
  const secondLast = table[table.length - 2];
  if (g >= last[0]) {
    const slope = (last[1] - secondLast[1]) / (last[0] - secondLast[0]);
    const extrap = last[1] + slope * (g - last[0]);
    return Math.round(extrap * factor);
  }

  // 구간 선형 보간
  for (let i = 0; i < table.length - 1; i += 1) {
    const [g1, t1] = table[i];
    const [g2, t2] = table[i + 1];
    if (g >= g1 && g < g2) {
      const ratio = (g - g1) / (g2 - g1);
      const tax = t1 + ratio * (t2 - t1);
      return Math.round(tax * factor);
    }
  }
  return 0;
}
