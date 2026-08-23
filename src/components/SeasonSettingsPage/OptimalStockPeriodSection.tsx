// src/components/SeasonSettingsPage/OptimalStockPeriodSection.tsx
// 2026-08-23 · #193 · 적정재고 계산 기준 일수 설정
//   · 하드코딩 30일 → KV setting optimal_stock_period_days · 사용자 조정 가능
//   · 계산법 · 오늘 기준 * 일 판매량 = 적정재고
//   · 범위 · 7~90일 · 기본 30일

import React from "react";
import { Package } from "@phosphor-icons/react";
import { Card } from "../common/Card";
import { useKvSetting } from "../../hooks/useKvSetting";
// 2026-08-23 · #193 · 상수 단일 소스 · useOptimalStockPeriod 훅과 통일
import {
  OPTIMAL_STOCK_DEFAULT_DAYS as DEFAULT_DAYS,
  OPTIMAL_STOCK_MIN_DAYS as MIN_DAYS,
  OPTIMAL_STOCK_MAX_DAYS as MAX_DAYS,
} from "../../hooks/useOptimalStockPeriod";

/** sanitize · 숫자 검증 + 범위 clamp */
function sanitize(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.round(n);
  if (clamped < MIN_DAYS || clamped > MAX_DAYS) return null;
  return clamped;
}

export const OptimalStockPeriodSection: React.FC = () => {
  const { value: days, setValue: setDays, loaded, saveState } = useKvSetting<number>({
    key: "optimal_stock_period_days",
    defaultValue: DEFAULT_DAYS,
    sanitize,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (!Number.isFinite(n)) return;
    // clamp on input
    const clamped = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.round(n)));
    setDays(clamped);
  };

  return (
    <Card padding="lg" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Package size={20} className="text-brand-deep shrink-0" />
        <h3 className="text-[16px] font-bold text-ink tracking-tight">적정재고 설정</h3>
        {saveState === "saving" && (
          <span className="text-[12px] text-zinc-400 ml-2">저장 중...</span>
        )}
        {saveState === "saved" && (
          <span className="text-[12px] text-emerald-600 ml-2">저장됨</span>
        )}
        {saveState === "error" && (
          <span className="text-[12px] text-rose-600 ml-2">저장 실패</span>
        )}
      </div>

      <p className="text-[14px] text-ink-soft leading-relaxed">
        <strong className="text-ink">계산법</strong> · 오늘 기준 · <em className="text-brand-deep font-semibold">N일</em> * 일 판매량 = 적정재고
        <br />
        발주필요·저재고 판정 · 진열 표시 · 자동 발주 계산 등 · 모든 소비처에 적용됩니다.
      </p>

      <div className="flex items-center gap-3">
        <label htmlFor="optimal-stock-days" className="text-[14px] font-semibold text-ink">
          기준 일수
        </label>
        <input
          id="optimal-stock-days"
          type="number"
          min={MIN_DAYS}
          max={MAX_DAYS}
          step={1}
          value={loaded ? days : DEFAULT_DAYS}
          onChange={handleChange}
          disabled={!loaded}
          className="w-24 h-9 px-2.5 text-[15px] font-semibold text-ink text-right border border-line rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep disabled:opacity-40 tabular-nums"
        />
        <span className="text-[14px] text-ink-soft">일</span>
        <span className="text-[12px] text-zinc-400 ml-2">
          (범위 · {MIN_DAYS} ~ {MAX_DAYS}일 · 기본 {DEFAULT_DAYS}일)
        </span>
      </div>

      <div className="text-[13px] text-ink-soft bg-zinc-50/60 border border-line rounded-lg px-3 py-2 leading-relaxed">
        💡 예시 · 30일 · 최근 30일 판매량 = 30개 → 적정재고 30개
        <br />
        💡 짧게 설정 시 (7~14일) · 빠른 회전 · 소진 위험 · 잦은 발주
        <br />
        💡 길게 설정 시 (60~90일) · 안전 재고 · 재고 부담 · 자본 부담
      </div>
    </Card>
  );
};

export default OptimalStockPeriodSection;
