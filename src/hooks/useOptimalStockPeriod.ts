// src/hooks/useOptimalStockPeriod.ts
// 2026-08-23 · #193 · 적정재고 계산 기준 일수 · 서버 KV 설정 조회
//   · SeasonSettingsPage > "적정재고 설정" (OptimalStockPeriodSection) 에서 사용자 조정
//   · 소비처 · CategoryTab · TrendingTab · RequestsPage · OrderManagePage · ProductDetailPanel
//   · 저장 · KV `optimal_stock_period_days` (useKvSetting)
//   · 로딩 전 · DEFAULT_DAYS(30) fallback (안전)
//   · 범위 · MIN_DAYS(7) ~ MAX_DAYS(90) · sanitize · 잘못된 값은 default 로

import { useKvSetting } from "./useKvSetting";

export const OPTIMAL_STOCK_DEFAULT_DAYS = 30;
export const OPTIMAL_STOCK_MIN_DAYS = 7;
export const OPTIMAL_STOCK_MAX_DAYS = 90;

function sanitize(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.round(n);
  if (clamped < OPTIMAL_STOCK_MIN_DAYS || clamped > OPTIMAL_STOCK_MAX_DAYS) return null;
  return clamped;
}

export interface UseOptimalStockPeriodResult {
  days: number;
  loaded: boolean;
}

/**
 * 적정재고 계산 기준 일수 조회 훅 (읽기 전용)
 * 편집 UI 는 OptimalStockPeriodSection (SeasonSettingsPage) 에서 처리
 */
export function useOptimalStockPeriod(): UseOptimalStockPeriodResult {
  const { value, loaded } = useKvSetting<number>({
    key: "optimal_stock_period_days",
    defaultValue: OPTIMAL_STOCK_DEFAULT_DAYS,
    sanitize,
  });
  return { days: value, loaded };
}
