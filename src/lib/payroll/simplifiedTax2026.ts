// src/lib/payroll/simplifiedTax2026.ts
// 2026-08-05 · 국세청 간이세액표 근사 · 부양가족 수 반영
//
// 실무 근사표 (부양가족 1인 · 비과세 20만 · 100% 원천징수):
//   300만 → 소득세 ~74,000     (지방세 포함 ~81,400)
//   500만 → 소득세 ~330,000    (지방세 포함 ~363,000)
//   700만 → 소득세 ~650,000    (지방세 포함 ~715,000)
//   1000만 → 소득세 ~1,300,000 (지방세 포함 ~1,430,000)
//
// 지방소득세 = 소득세 × 10% (calcTaxes 에서 별도 계산)
//
// 후속 개선: 국세청 홈택스 엑셀 다운로드 → JSON 파싱 → 정확 스냅샷 교체 가능
// (기능은 동일 · 이 함수 · approxIncomeTax(taxableGross, dependents) 만 유지하면 됨)

// 부양가족 1인 · 소득세 근사표 (월 과세급여 → 소득세 원)
// 실무 홈택스 값 기반 · 구간별 선형 보간
const INCOME_TAX_TABLE_1DEP: Array<[gross: number, tax: number]> = [
  [0,          0],
  [1_500_000,  0],       // ~150만 이하 · 사실상 면세 (근사)
  [2_000_000,  15_000],  // ~200만
  [2_500_000,  40_000],  // ~250만
  [3_000_000,  74_000],  // ~300만 · 실무 표
  [3_500_000,  130_000], // ~350만
  [4_000_000,  200_000], // ~400만
  [4_500_000,  265_000], // ~450만
  [5_000_000,  330_000], // ~500만 · 실무 표
  [5_500_000,  400_000], // ~550만
  [6_000_000,  475_000], // ~600만
  [6_500_000,  560_000], // ~650만
  [7_000_000,  650_000], // ~700만 · 실무 표
  [7_500_000,  745_000], // ~750만
  [8_000_000,  845_000], // ~800만
  [9_000_000,  1_065_000], // ~900만
  [10_000_000, 1_300_000], // ~1000만 · 실무 표
  [12_000_000, 1_800_000], // ~1200만
  [15_000_000, 2_600_000], // ~1500만
];

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
 * 국세청 근로소득 간이세액표 7단계 정식 산출 공식 (2026 기준)
 *   1. 과세대상 월급여 M = 급여 - 비과세
 *   2. 연 환산 Y = M × 12 · 근로소득공제 D1 (5구간 · 최대 2,000만)
 *   3. 과세표준 K = Y - D1 - (부양가족 × 150만) - 기본특별공제
 *   4. 연 산출세액 T (누진 · 6% ~ 45% · 8구간)
 *   5. 근로소득 세액공제 C (T ≤ 130만 · 55% · 초과 · 71.5만 + 30%)
 *   6. 월 근로소득세 = (T - C) / 12
 *   7. 지방소득세 = 근로소득세 × 10%
 *
 * @param monthlyGross 월 세전 급여 (원)
 * @param nonTaxable 월 비과세 소득 (식대·차량 등 · default 0)
 * @param dependents 부양가족 수 (본인 포함 · default 1)
 * @param basicSpecialDeduction 기본 특별공제 (표준세액공제 등 · default 0 · 필요 시 확장)
 */
export function calcMonthlyIncomeTax(
  monthlyGross: number,
  nonTaxable: number = 0,
  dependents: number = 1,
  basicSpecialDeduction: number = 0,
): { incomeTax: number; localTax: number; total: number } {
  // 1단계 · 과세대상 월급여
  const M = Math.max(0, monthlyGross - Math.max(0, nonTaxable));
  if (M <= 0) return { incomeTax: 0, localTax: 0, total: 0 };
  // 2단계 · 연 환산 + 근로소득공제
  const Y = M * 12;
  let D1: number;
  if (Y <= 5_000_000)        D1 = Y * 0.7;
  else if (Y <= 15_000_000)  D1 = 3_500_000  + (Y - 5_000_000)   * 0.4;
  else if (Y <= 45_000_000)  D1 = 7_500_000  + (Y - 15_000_000)  * 0.15;
  else if (Y <= 100_000_000) D1 = 12_000_000 + (Y - 45_000_000)  * 0.05;
  else                       D1 = Math.min(20_000_000, 14_750_000 + (Y - 100_000_000) * 0.02);
  // 3단계 · 과세표준
  const K = Math.max(0, Y - D1 - Math.max(1, dependents) * 1_500_000 - basicSpecialDeduction);
  // 4단계 · 연간 산출세액 (누진)
  let T: number;
  if (K <= 14_000_000)        T = K * 0.06;
  else if (K <= 50_000_000)   T = 840_000       + (K - 14_000_000)   * 0.15;
  else if (K <= 88_000_000)   T = 6_240_000     + (K - 50_000_000)   * 0.24;
  else if (K <= 150_000_000)  T = 15_360_000    + (K - 88_000_000)   * 0.35;
  else if (K <= 300_000_000)  T = 37_060_000    + (K - 150_000_000)  * 0.38;
  else if (K <= 500_000_000)  T = 94_060_000    + (K - 300_000_000)  * 0.40;
  else if (K <= 1_000_000_000) T = 174_060_000  + (K - 500_000_000)  * 0.42;
  else                        T = 384_060_000   + (K - 1_000_000_000) * 0.45;
  // 5단계 · 근로소득 세액공제
  const C = T <= 1_300_000 ? T * 0.55 : 715_000 + (T - 1_300_000) * 0.30;
  // 6단계 · 월 근로소득세 (음수 방어)
  const incomeTax = Math.max(0, Math.round((T - C) / 12));
  // 7단계 · 지방소득세 (소득세 × 10%)
  const localTax = Math.round(incomeTax * 0.10);
  return { incomeTax, localTax, total: incomeTax + localTax };
}

/**
 * 소득세 근사 (홈택스 간이세액표 기반 · 부양가족 반영)
 * @param taxableGross 월 과세급여 (세전 - 비과세)
 * @param dependents 부양가족 수 (본인 포함 · default 1)
 * @returns 소득세 (원)
 */
export function approxIncomeTax(taxableGross: number, dependents: number = 1): number {
  const g = Math.max(0, taxableGross);
  const table = INCOME_TAX_TABLE_1DEP;

  // 표 범위 초과 · 마지막 두 점 선형 외삽 (누진 반영 위해 기울기 유지)
  const last = table[table.length - 1];
  const secondLast = table[table.length - 2];
  if (g >= last[0]) {
    const slope = (last[1] - secondLast[1]) / (last[0] - secondLast[0]);
    const extrap = last[1] + slope * (g - last[0]);
    return Math.round(extrap * dependentsFactor(dependents));
  }

  // 구간 선형 보간
  for (let i = 0; i < table.length - 1; i += 1) {
    const [g1, t1] = table[i];
    const [g2, t2] = table[i + 1];
    if (g >= g1 && g < g2) {
      const ratio = (g - g1) / (g2 - g1);
      const tax = t1 + ratio * (t2 - t1);
      return Math.round(tax * dependentsFactor(dependents));
    }
  }
  return 0;
}
