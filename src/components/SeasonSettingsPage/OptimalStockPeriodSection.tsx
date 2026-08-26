// src/components/SeasonSettingsPage/OptimalStockPeriodSection.tsx
// 2026-08-23 · #193 · 적정재고 계산 기준 · KV setting · 사용자 조정
// 2026-08-24 · 기본 15일 · MIN 1일 · onBlur/Enter clamp
// 2026-08-26 v3 · 사용자 지시 · 목업 프리미엄 트렌드 · Linear/Vercel/Notion 톤
//   · 폰트 대형화 · gradient border · IconTile · segmented mode toggle · CTA 강조

import React, { useState, useEffect } from "react";
import { Package, ArrowsClockwise } from "@phosphor-icons/react";
import { CalendarClock, CalendarRange } from "lucide-react";
import { useKvSetting } from "../../hooks/useKvSetting";
import {
  OPTIMAL_STOCK_DEFAULT_DAYS as DEFAULT_DAYS,
  OPTIMAL_STOCK_MIN_DAYS as MIN_DAYS,
  OPTIMAL_STOCK_MAX_DAYS as MAX_DAYS,
} from "../../hooks/useOptimalStockPeriod";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { Spinner } from "../common/Spinner";
import { IconTile } from "../common/IconTile";
import { StatusPill } from "../common/StatusPill";

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

  const [inputValue, setInputValue] = useState<string>("");
  useEffect(() => { if (loaded) setInputValue(String(days)); }, [loaded, days]);

  const { toast, showSuccess, showError } = useToast();
  const confirm = useConfirm();
  const [recalcing, setRecalcing] = useState(false);
  const [mode, setMode] = useState<"today" | "range">("today");
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [lastResult, setLastResult] = useState<{ updated: number; failed?: number; note?: string; productsWithSales?: number; productsZeroed?: number; from?: string; to?: string } | null>(null);

  const runRecalc = async () => {
    const n = Number(inputValue) || days;
    const modeLabel = mode === "today" ? `최근 ${n}일` : `${fromDate} ~ ${toDate}`;
    const ok = await confirm({
      title: "적정재고 재계산",
      message: `${modeLabel} 판매량 합계 = 적정재고\n\n대상 · 전체 상품 (판매 0 이면 optimal_stock = 0)\n\n진행할까요?`,
    });
    if (!ok) return;
    if (mode === "range" && fromDate > toDate) { showError("시작 날짜가 끝 날짜보다 늦습니다"); return; }
    setRecalcing(true);
    setLastResult(null);
    try {
      const payload: any = mode === "range" ? { fromDate, toDate } : { days: n };
      const { data } = await api.post<{ ok: boolean; updated: number; failed?: number; note?: string; productsWithSales?: number; productsZeroed?: number; from?: string; to?: string }>(
        "/api/products/refill-optimal-stock",
        payload
      );
      setLastResult({
        updated: data?.updated ?? 0,
        failed: data?.failed,
        note: data?.note,
        productsWithSales: data?.productsWithSales,
        productsZeroed: data?.productsZeroed,
        from: data?.from,
        to: data?.to,
      });
      if (data?.updated) {
        showSuccess(`재계산 완료 · ${data.updated}건 (판매 있음 ${data.productsWithSales ?? "?"} · 0 처리 ${data.productsZeroed ?? "?"})`);
      } else {
        showError(data?.note ?? "재계산 결과 · 업데이트 0건");
      }
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "네트워크 오류";
      showError(`재계산 실패 · ${msg}`);
    } finally { setRecalcing(false); }
  };

  const commit = () => {
    const n = Number(inputValue);
    if (!Number.isFinite(n)) { setInputValue(String(days)); return; }
    const clamped = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.round(n)));
    setDays(clamped);
    setInputValue(String(clamped));
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); }
  };

  return (
    <section
      className="bg-white rounded-2xl border border-line overflow-hidden"
      style={{ boxShadow: "0 1px 2px rgba(10,46,74,0.04), 0 4px 12px -4px rgba(10,46,74,0.06)" }}
    >
      {/* accent gradient top bar */}
      <div className="h-1 bg-gradient-to-r from-brand-deep via-sky-500 to-cyan-500" />

      <div className="p-7 flex flex-col gap-6">
        {/* 헤더 */}
        <div className="flex items-start gap-4">
          <IconTile icon={<Package size={22} />} tone="brand" size="lg" />
          <div className="flex-1 min-w-0">
            <h3 className="text-[22px] font-extrabold text-ink tracking-tight leading-tight">적정재고 설정</h3>
            <p className="text-[17px] text-ink-soft mt-2 leading-relaxed">
              <strong className="text-ink">계산법</strong> · <em className="text-brand-deep font-semibold not-italic">N일 판매량 합계</em> = 적정재고
              <br />
              <span className="text-[15px]">발주필요·저재고 판정 · 진열 표시 · 자동 발주 계산 등 · 모든 소비처에 적용</span>
            </p>
          </div>
          {saveState === "saving" && <StatusPill tone="zinc" size="sm">저장 중...</StatusPill>}
          {saveState === "saved"  && <StatusPill tone="emerald" size="sm">저장됨</StatusPill>}
          {saveState === "error"  && <StatusPill tone="rose" size="sm">저장 실패</StatusPill>}
        </div>

        {/* 계산 방식 · segmented pill */}
        <div className="flex flex-col gap-3">
          <div className="text-[16px] font-bold text-ink tracking-tight">계산 방식</div>
          <div className="inline-flex bg-zinc-100 border border-line rounded-xl p-1.5 gap-1 self-start">
            <button
              type="button"
              onClick={() => setMode("today")}
              className={`inline-flex items-center gap-2 h-11 px-4 rounded-lg text-[16px] font-bold transition-all cursor-pointer ${
                mode === "today"
                  ? "bg-white text-brand-deep shadow-sm ring-1 ring-brand-deep/10"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              <CalendarClock size={17} strokeWidth={2.2} />
              오늘부터 · 최근 N일
            </button>
            <button
              type="button"
              onClick={() => setMode("range")}
              className={`inline-flex items-center gap-2 h-11 px-4 rounded-lg text-[16px] font-bold transition-all cursor-pointer ${
                mode === "range"
                  ? "bg-white text-brand-deep shadow-sm ring-1 ring-brand-deep/10"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              <CalendarRange size={17} strokeWidth={2.2} />
              특정 기간 (시작 ~ 끝)
            </button>
          </div>
        </div>

        {/* 입력 영역 · 카드형 · 큰 폰트 */}
        <div className="rounded-xl border-2 border-brand-deep/10 bg-brand-tint/20 p-5">
          {mode === "today" ? (
            <div className="flex items-center gap-4 flex-wrap">
              <label htmlFor="optimal-stock-days" className="text-[17px] font-bold text-ink">기준 일수</label>
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
                className="w-28 h-12 px-3 text-[22px] font-extrabold text-brand-deep text-right border-2 border-line rounded-xl bg-white focus:outline-none focus:ring-4 focus:ring-brand-tint focus:border-brand-deep disabled:opacity-40 tabular-nums shadow-sm"
              />
              <span className="text-[19px] font-bold text-ink">일</span>
              <span className="text-[14px] text-zinc-500 ml-2">(범위 {MIN_DAYS} ~ {MAX_DAYS}일 · 기본 {DEFAULT_DAYS}일)</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <label htmlFor="optimal-stock-fromdate" className="text-[17px] font-bold text-ink">시작</label>
              <input
                id="optimal-stock-fromdate"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                max={toDate}
                className="h-12 px-3 text-[17px] font-semibold text-ink border-2 border-line rounded-xl bg-white focus:outline-none focus:ring-4 focus:ring-brand-tint focus:border-brand-deep tabular-nums shadow-sm"
              />
              <span className="text-[19px] text-zinc-400 font-bold">~</span>
              <label htmlFor="optimal-stock-todate" className="text-[17px] font-bold text-ink">끝</label>
              <input
                id="optimal-stock-todate"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                min={fromDate}
                max={new Date().toISOString().slice(0, 10)}
                className="h-12 px-3 text-[17px] font-semibold text-ink border-2 border-line rounded-xl bg-white focus:outline-none focus:ring-4 focus:ring-brand-tint focus:border-brand-deep tabular-nums shadow-sm"
              />
              <span className="text-[14px] text-zinc-500 ml-1">기간 내 판매량 합산</span>
            </div>
          )}
        </div>

        {/* 예시 힌트 · 카드형 · 개선된 가독성 */}
        <div className="text-[15px] text-ink-soft bg-zinc-50/70 border border-line rounded-xl px-5 py-4 leading-relaxed">
          <div className="mb-1"><b className="text-ink">💡 예시</b> · 30일 · 최근 30일 판매량 30개 → <b className="text-brand-deep">적정재고 30개</b></div>
          <div className="mb-1"><b className="text-emerald-700">✔ 짧게</b> (7~14일) · 빠른 회전 · 소진 위험 · 잦은 발주</div>
          <div><b className="text-amber-700">⚠ 길게</b> (60~90일) · 안전 재고 · 재고 부담 · 자본 부담</div>
        </div>

        {/* 재계산 CTA · 강조 · gradient · 큰 버튼 */}
        <div className="flex items-center gap-4 p-5 bg-gradient-to-br from-amber-50 via-white to-amber-50/50 border-2 border-amber-200 rounded-xl">
          <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-[22px]">⚠</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-bold text-amber-900 leading-tight">기준 변경 후 · [재계산 실행] 필수</div>
            <div className="text-[15px] text-amber-800 mt-1 leading-relaxed">
              KV 저장은 즉시 · 실제 <b>products.optimal_stock</b> 컬럼은 자동으로 안 바뀝니다.
            </div>
            {lastResult && (
              <div className="text-[14px] font-semibold text-amber-900 mt-2 leading-relaxed">
                마지막 · <span className="text-emerald-700">{lastResult.updated}건 업데이트</span>
                {lastResult.failed ? <span className="ml-2 text-rose-600">({lastResult.failed}건 실패)</span> : null}
                {lastResult.productsWithSales != null && <span className="ml-2 text-zinc-600">· 판매 {lastResult.productsWithSales}종</span>}
                {lastResult.productsZeroed != null && lastResult.productsZeroed > 0 && <span className="ml-2 text-zinc-500">· 0 처리 {lastResult.productsZeroed}종</span>}
                {lastResult.from && <span className="ml-2 text-zinc-500">· 기준 {lastResult.from} ~ {lastResult.to ?? "오늘"}</span>}
                {lastResult.note ? <span className="ml-2 text-zinc-500">· {lastResult.note}</span> : null}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={runRecalc}
            disabled={recalcing || !loaded}
            className="inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-[16px] font-extrabold shadow-md ring-2 ring-amber-300/40 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 active:scale-[0.98]"
            title={`현재 ${inputValue}일 기준으로 재계산`}
          >
            {recalcing ? <Spinner size={16} tone="white" /> : <ArrowsClockwise size={19} weight="bold" />}
            {recalcing ? "재계산 중..." : "재계산 실행"}
          </button>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
    </section>
  );
};

export default OptimalStockPeriodSection;
