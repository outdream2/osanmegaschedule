// src/lib/wageGrossUpCoefficient.ts
// 2026-08-07 · 세후 → 세전 역산 계수표 (사용자 확정)
//   · 희망 월 수령액 (세후 · Y) 구간별 공제율 (R) 근사 · 세전 = Y × 계수
//   · 4대보험 + 소득세 예측 공제율 기반 · payrollGrossUp 대체용 간이 산식

export interface GrossUpBracket {
  /** 세후 Y 하한 (원 · 이상) */
  minNet: number;
  /** 세후 Y 상한 (원 · 미만) */
  maxNet: number;
  /** 세전 = 세후 × 계수 */
  coefficient: number;
  /** 표시용 공제율 문자열 (예: "9.5%~10.5%") */
  ratioLabel: string;
}

export const GROSSUP_COEFFICIENTS: GrossUpBracket[] = [
  { minNet: 1_000_000,  maxNet: 2_000_000,  coefficient: 1.110, ratioLabel: "9.5%~10.5%" },
  { minNet: 2_000_000,  maxNet: 3_000_000,  coefficient: 1.135, ratioLabel: "11.0%~12.5%" },
  { minNet: 3_000_000,  maxNet: 4_000_000,  coefficient: 1.165, ratioLabel: "13.0%~15.0%" },
  { minNet: 4_000_000,  maxNet: 5_000_000,  coefficient: 1.200, ratioLabel: "15.5%~17.5%" },
  { minNet: 5_000_000,  maxNet: 6_000_000,  coefficient: 1.230, ratioLabel: "17.5%~19.5%" },
  { minNet: 6_000_000,  maxNet: 8_000_000,  coefficient: 1.280, ratioLabel: "20.0%~24.0%" },
  { minNet: 8_000_000,  maxNet: 10_000_000, coefficient: 1.350, ratioLabel: "24.5%~27.5%" },
  { minNet: 10_000_000, maxNet: 12_000_000, coefficient: 1.420, ratioLabel: "28.0%~31.0%" },
  { minNet: 12_000_000, maxNet: 15_000_000, coefficient: 1.500, ratioLabel: "31.5%~35.0%" },
  { minNet: 15_000_000, maxNet: 20_000_000, coefficient: 1.600, ratioLabel: "35.5%~40.0%" },
];

/** 세후 → 계수·세전 lookup · 범위 밖은 가장 가까운 구간으로 clamp */
export function grossUpFromNet(net: number): {
  coefficient: number;
  gross: number;
  bracket: GrossUpBracket;
} {
  if (!Number.isFinite(net) || net <= 0) {
    const b = GROSSUP_COEFFICIENTS[0];
    return { coefficient: b.coefficient, gross: 0, bracket: b };
  }
  const bracket =
    GROSSUP_COEFFICIENTS.find(x => net >= x.minNet && net < x.maxNet)
    ?? (net < GROSSUP_COEFFICIENTS[0].minNet
          ? GROSSUP_COEFFICIENTS[0]
          : GROSSUP_COEFFICIENTS[GROSSUP_COEFFICIENTS.length - 1]);
  return {
    coefficient: bracket.coefficient,
    gross: Math.round(net * bracket.coefficient),
    bracket,
  };
}
