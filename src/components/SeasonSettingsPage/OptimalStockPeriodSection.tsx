// src/components/SeasonSettingsPage/OptimalStockPeriodSection.tsx
// 2026-08-23 · #193 · 적정재고 계산 기준 일수 설정
//   · 하드코딩 30일 → KV setting optimal_stock_period_days · 사용자 조정 가능
//   · 계산법 · 오늘 기준 * 일 판매량 = 적정재고
// 2026-08-24 · 기본 15일 (사용자 지시) · MIN 1일 (7 clamp 이슈 fix)
//   · 입력 중 clamp 제거 · onBlur/Enter 에서만 확정 · 자유 타이핑 허용

import React, { useState, useEffect } from "react";
import { Package, ArrowsClockwise } from "@phosphor-icons/react";
import { Card } from "../common/Card";
import { useKvSetting } from "../../hooks/useKvSetting";
// 2026-08-23 · #193 · 상수 단일 소스 · useOptimalStockPeriod 훅과 통일
import {
  OPTIMAL_STOCK_DEFAULT_DAYS as DEFAULT_DAYS,
  OPTIMAL_STOCK_MIN_DAYS as MIN_DAYS,
  OPTIMAL_STOCK_MAX_DAYS as MAX_DAYS,
} from "../../hooks/useOptimalStockPeriod";
// 2026-08-26 · 사용자 지시 · 적정재고값 실제 컬럼 반영 (재계산 API 호출)
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { Spinner } from "../common/Spinner";

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

  // 2026-08-24 · 로컬 입력 buffer · 사용자 자유 타이핑 (clamp X · onBlur/Enter 에 확정)
  const [inputValue, setInputValue] = useState<string>("");
  useEffect(() => {
    if (loaded) setInputValue(String(days));
  }, [loaded, days]);

  // 2026-08-26 · 사용자 지시 · 재계산 · 실제 products.optimal_stock 컬럼 업데이트
  const { toast, showSuccess, showError } = useToast();
  const confirm = useConfirm();
  const [recalcing, setRecalcing] = useState(false);
  const [lastResult, setLastResult] = useState<{ updated: number; failed?: number; note?: string } | null>(null);
  const runRecalc = async () => {
    const n = Number(inputValue) || days;
    const ok = await confirm({
      title: "적정재고 재계산",
      message: `현재 저장된 ${n}일 기준으로 모든 상품의 적정재고를 재계산합니다.\n\n계산법 · 최근 ${n}일 판매량 합계 = 적정재고\n대상 · stock_history 가 있는 모든 상품\n\n진행할까요?`,
    });
    if (!ok) return;
    setRecalcing(true);
    setLastResult(null);
    try {
      const { data } = await api.post<{ ok: boolean; updated: number; failed?: number; note?: string }>(
        "/api/products/refill-optimal-stock",
        { days: n }
      );
      setLastResult({ updated: data?.updated ?? 0, failed: data?.failed, note: data?.note });
      if (data?.updated) {
        showSuccess(`재계산 완료 · ${data.updated}건 업데이트${data.failed ? ` · ${data.failed}건 실패` : ""}`);
      } else {
        showError(data?.note ?? "재계산 결과 · 업데이트 0건");
      }
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "네트워크 오류";
      showError(`재계산 실패 · ${msg}`);
    } finally {
      setRecalcing(false);
    }
  };

  const commit = () => {
    const n = Number(inputValue);
    if (!Number.isFinite(n)) {
      setInputValue(String(days));  // 무효 입력 시 · 이전 값 복원
      return;
    }
    const clamped = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.round(n)));
    setDays(clamped);
    setInputValue(String(clamped));  // 사용자에게 clamp 결과 반영
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 타이핑 중 · clamp X · 자유 입력
    setInputValue(e.target.value);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); }
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
          value={loaded ? inputValue : String(DEFAULT_DAYS)}
          onChange={handleChange}
          onBlur={commit}
          onKeyDown={handleKeyDown}
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

      {/* 2026-08-26 · 사용자 지시 · 재계산 버튼 · 실제 products.optimal_stock 컬럼 업데이트
          기준 일수만 저장하면 · 실제 값은 자동으로 안 바뀜 · 이 버튼으로 명시적 재계산 필요 */}
      <div className="flex items-start gap-3 p-3 bg-amber-50/50 border border-amber-200 rounded-lg">
        <span className="text-[16px] shrink-0 mt-0.5">⚠</span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-amber-800 leading-tight">기준 일수 변경 후 · [재계산 실행] 필수</div>
          <div className="text-[12.5px] text-amber-700 mt-1 leading-relaxed">
            기준 일수 저장은 즉시 · 하지만 실제 <b>products.optimal_stock</b> 값은 자동으로 안 바뀝니다.
            <br />
            변경 사항을 모든 상품에 적용하려면 · 아래 [재계산 실행] 을 눌러주세요.
          </div>
          {lastResult && (
            <div className="text-[12.5px] font-semibold text-amber-800 mt-2">
              마지막 결과 · <span className="text-emerald-700">{lastResult.updated}건 업데이트</span>
              {lastResult.failed ? <span className="ml-2 text-rose-600">({lastResult.failed}건 실패)</span> : null}
              {lastResult.note ? <span className="ml-2 text-zinc-500">· {lastResult.note}</span> : null}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={runRecalc}
          disabled={recalcing || !loaded}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[14px] font-bold shadow-sm ring-2 ring-amber-300/40 transition cursor-pointer disabled:opacity-40 shrink-0"
          title={`현재 ${inputValue}일 기준으로 재계산`}
        >
          {recalcing ? <Spinner size={13} tone="white" /> : <ArrowsClockwise size={15} weight="bold" />}
          {recalcing ? "재계산 중..." : "재계산 실행"}
        </button>
      </div>

      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
    </Card>
  );
};

export default OptimalStockPeriodSection;
