// StockRowCard · 통합 카드형 실재고 입력 · 2026-08-18 · #95 재설계
//   · 모바일 우선 · PC 동일 (SplitPanel 안 좁은 폭 대응)
//   · 접힘 기본 (상품명 + 5-way strip + 합계) → 탭 시 확장 (5-slot editor)
//   · 최근 스캔·값 있음 자동 확장 · Linear/Attio/Notion 2026 톤
//
// 시각 계층
//   1) 상단 · 상품명 (17px bold) · code/spec (11px mono) · 우측 총 합계 (28px bold)
//   2) chip strip · 5 색 dot + label + 합계값 (한눈에 5-way 상태)
//   3) 확장 · 5-slot editor (현재/입력/합계 · 매장은 구역 편집 포함)
//   4) 액션 · 이력·진열요청·삭제
//
// 안전
//   · patchRow/removeRow/onHistory/requestDisplay 시그니처 그대로 · handlers 무변경
//   · StockRow 타입 그대로 사용
//   · StockActionsCell 재사용 (기존 3버튼 그대로)

import React, { useState, useMemo } from "react";
import { Box, Hash, ChevronDown, ChevronUp } from "lucide-react";
import type { StockRow } from "./stockRowTypes";
import { calcRowTotal, calcSlotTotal, calcTotalAdded } from "./stockRowTypes";
import { StatusPill } from "../common/StatusPill";
import { StockActionsCell } from "./StockActionsCell";

// ─── 5-slot 정의 (창고2 · 매장3) ─────────────────────────────────
interface SlotDef {
  key: string;
  label: string;      // "창1"
  full: string;       // "창고1"
  addKey: keyof StockRow;
  prevKey: keyof StockRow;
  zoneKey?: keyof StockRow;
  dot: string;        // "bg-orange-500"
  text: string;       // "text-orange-700"
  softBg: string;     // "bg-orange-50/50"
}

const SLOTS: readonly SlotDef[] = [
  { key: "w1", label: "창1", full: "창고1", addKey: "warehouse1AddQty", prevKey: "prevWarehouse1Qty",                          dot: "bg-orange-500",  text: "text-orange-700",  softBg: "bg-orange-50/60"  },
  { key: "w2", label: "창2", full: "창고2", addKey: "warehouse2AddQty", prevKey: "prevWarehouse2Qty",                          dot: "bg-amber-500",   text: "text-amber-700",   softBg: "bg-amber-50/60"   },
  { key: "s1", label: "매1", full: "매장1", addKey: "store1AddQty",     prevKey: "prevStore1Qty",     zoneKey: "store1Zone", dot: "bg-emerald-500", text: "text-emerald-700", softBg: "bg-emerald-50/60" },
  { key: "s2", label: "매2", full: "매장2", addKey: "store2AddQty",     prevKey: "prevStore2Qty",     zoneKey: "store2Zone", dot: "bg-sky-500",     text: "text-sky-700",     softBg: "bg-sky-50/60"     },
  { key: "s3", label: "매3", full: "매장3", addKey: "store3AddQty",     prevKey: "prevStore3Qty",     zoneKey: "store3Zone", dot: "bg-violet-500",  text: "text-violet-700",  softBg: "bg-violet-50/60"  },
] as const;

const WARN_THRESHOLD = 100;

// ─── 수량 스테퍼 · Linear/Fluent2 톤 · 스타일 통일 ───────────────
const StepperInput: React.FC<{
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = "0" }) => {
  const cur = value === "" ? 0 : Number(value) || 0;
  const dec = () => { const n = Math.max(0, cur - 1); onChange(n === 0 && value === "" ? "" : n); };
  const inc = () => onChange(cur + 1);
  return (
    <div className="inline-flex items-stretch w-full h-10 bg-white border-2 border-line rounded-xl overflow-hidden
      transition-all duration-150
      focus-within:border-brand-deep
      focus-within:shadow-[0_0_0_3px_rgba(10,46,74,0.10)]">
      <button
        type="button"
        onClick={dec}
        disabled={cur <= 0}
        tabIndex={-1}
        className="w-9 shrink-0 text-zinc-400 hover:text-rose-600 hover:bg-rose-50/60
          active:bg-rose-100/50 disabled:opacity-25 disabled:hover:bg-transparent
          disabled:hover:text-zinc-400 text-[18px] font-bold leading-none flex items-center justify-center
          cursor-pointer border-r border-line transition-colors"
        aria-label="감소"
      >−</button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder={placeholder}
        className="flex-1 min-w-0 h-full text-center bg-transparent border-0
          text-[16px] font-bold tabular-nums text-ink
          focus:outline-none placeholder:text-zinc-300"
      />
      <button
        type="button"
        onClick={inc}
        tabIndex={-1}
        className="w-9 shrink-0 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50/60
          active:bg-emerald-100/50 text-[18px] font-bold leading-none flex items-center justify-center
          cursor-pointer border-l border-line transition-colors"
        aria-label="증가"
      >+</button>
    </div>
  );
};

// ─── 구역 입력 (매장 전용) ───────────────────────────────────────
const ZoneInput: React.FC<{
  value: string | null;
  onChange: (v: string | null) => void;
}> = ({ value, onChange }) => (
  <input
    type="text"
    value={value ?? ""}
    onChange={e => onChange(e.target.value.trim() === "" ? null : e.target.value)}
    placeholder="구역"
    className="w-full h-8 text-center px-2 rounded-md bg-zinc-50 border border-dashed border-line
      text-[12px] font-semibold tabular-nums text-ink outline-none transition
      placeholder:text-zinc-300
      focus:bg-white focus:border-solid focus:border-brand-deep
      focus:shadow-[0_0_0_3px_rgba(10,46,74,0.08)]"
    title="구역 편집"
  />
);

// ─── 카드 컴포넌트 ───────────────────────────────────────────────
interface StockRowCardProps {
  row: StockRow;
  isRecent: boolean;
  requestingKey: string | null;
  onPatch: (key: string, patch: Partial<StockRow>) => void;
  onRemove: (key: string) => void;
  onHistory: (code: string, name: string) => void;
  onRequestDisplay: (row: StockRow) => void;
}

export const StockRowCard: React.FC<StockRowCardProps> = React.memo(({
  row, isRecent, requestingKey, onPatch, onRemove, onHistory, onRequestDisplay,
}) => {
  const rowTotal = calcRowTotal(row);
  const totalAdded = calcTotalAdded(row);
  const hasAdd = totalAdded !== 0;

  const isWarn = useMemo(() => {
    const a = (v: number | "") => v !== "" ? Number(v) : 0;
    return SLOTS.some(s => a(row[s.addKey] as any) >= WARN_THRESHOLD);
  }, [row]);

  // 최근/입력됨/이상값 자동 확장 · 그 외 사용자 토글
  const autoExpanded = isRecent || hasAdd || isWarn;
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const expanded = autoExpanded || manuallyExpanded;

  // product.spec 파싱 (매장별 ERP 위치)
  const specParts = String((row.product as any).spec ?? "").split("/").map(s => s.trim());

  return (
    <div
      className={[
        "group relative bg-white rounded-2xl border transition-all duration-200",
        "shadow-[0_1px_2px_rgba(10,46,74,0.04),0_1px_3px_rgba(10,46,74,0.03)]",
        "hover:shadow-[0_2px_6px_rgba(10,46,74,0.06),0_4px_12px_-2px_rgba(10,46,74,0.04)]",
        isRecent
          ? "border-brand-deep/40 shadow-[0_0_0_3px_rgba(10,46,74,0.06),0_1px_3px_rgba(10,46,74,0.05)]"
          : isWarn
            ? "border-amber-200"
            : "border-line/70",
      ].join(" ")}
    >
      {/* ─── 헤더 (상품명 + 코드 + 우측 합계) · 탭하면 접힘 토글 */}
      <button
        type="button"
        onClick={() => setManuallyExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left cursor-pointer"
      >
        {/* 좌측 · 상품명 · 코드 · chip strip (접힘 시만) */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-start gap-2 flex-wrap">
            <h4 className="text-[16px] font-bold text-ink tracking-tight leading-snug break-keep">
              {row.product.name}
            </h4>
            {totalAdded > 0 && (
              <StatusPill tone="emerald" size="xs">+{totalAdded}</StatusPill>
            )}
            {isWarn && (
              <StatusPill tone="amber" size="xs">이상값</StatusPill>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(row.product as any).spec && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold
                text-zinc-500 bg-zinc-100/70 rounded px-1.5 py-0.5">
                <Box size={9} className="text-zinc-400" />
                {(row.product as any).spec}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-mono
              text-zinc-400 bg-zinc-100/60 rounded px-1.5 py-0.5">
              <Hash size={9} className="text-zinc-300" />
              {row.code}
            </span>
          </div>

          {/* chip strip · 접힘 시만 · 5-way 한눈 요약 */}
          {!expanded && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {SLOTS.map(s => {
                const prev = row[s.prevKey] as number | null | undefined;
                const add  = row[s.addKey]  as number | "";
                const tot  = calcSlotTotal(prev, add);
                const hasVal = tot > 0 || (add !== "" && Number(add) !== 0);
                return (
                  <span
                    key={s.key}
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 border ${
                      hasVal
                        ? `${s.softBg} border-transparent`
                        : "bg-transparent border-line/60"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${hasVal ? "" : "opacity-40"}`} />
                    <span className={`text-[11px] font-semibold ${hasVal ? s.text : "text-zinc-400"}`}>
                      {s.label}
                    </span>
                    <span className={`text-[12px] font-bold tabular-nums ${hasVal ? "text-ink" : "text-zinc-300"}`}>
                      {tot > 0 ? tot : "-"}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* 우측 · 총 합계 · 큰 숫자 */}
        <div className="shrink-0 flex flex-col items-end gap-0.5">
          <span className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">합계</span>
          <span className={`text-[28px] font-bold tabular-nums leading-none tracking-tight ${
            rowTotal > 0 ? "text-brand-deep" : "text-zinc-300"
          }`}>
            {rowTotal}
          </span>
          <span className="mt-1 text-ink-soft group-hover:text-brand-deep transition-colors">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
      </button>

      {/* ─── 확장 · 5-slot editor + 액션 */}
      {expanded && (
        <div className="border-t border-line/60 px-4 py-3 flex flex-col gap-2.5">
          {SLOTS.map((s, i) => {
            const prev = row[s.prevKey] as number | null | undefined;
            const add  = row[s.addKey]  as number | "";
            const tot  = calcSlotTotal(prev, add);
            const hasAddVal = add !== "" && Number(add) !== 0;
            const spec = s.zoneKey ? (specParts[i - 2] ?? "") : "";
            return (
              <div
                key={s.key}
                className="grid grid-cols-[64px_1fr_auto] gap-2 items-center"
              >
                {/* label + dot */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`w-1 h-6 rounded-full ${s.dot}`} />
                  <span className={`text-[13px] font-bold ${s.text}`}>{s.full}</span>
                </div>

                {/* 현재값 (좌) + 스테퍼 (우) + (매장) 구역 */}
                <div className={`grid ${s.zoneKey ? "grid-cols-[auto_1fr_88px]" : "grid-cols-[auto_1fr]"} gap-2 items-center`}>
                  <span className="text-[12px] font-semibold text-ink-soft tabular-nums shrink-0 min-w-[52px]">
                    {prev != null ? `현재 ${prev}` : <span className="text-zinc-300">현재 -</span>}
                  </span>
                  <StepperInput
                    value={add}
                    onChange={v => onPatch(row.key, { [s.addKey]: v } as Partial<StockRow>)}
                    placeholder="+0"
                  />
                  {s.zoneKey && (
                    <ZoneInput
                      value={row[s.zoneKey] as string | null}
                      onChange={v => onPatch(row.key, { [s.zoneKey!]: v } as Partial<StockRow>)}
                    />
                  )}
                </div>

                {/* 합계 (우) */}
                <span className={`text-[15px] font-bold tabular-nums text-right min-w-[48px] tracking-tight ${
                  hasAddVal ? "text-emerald-700" : tot > 0 ? "text-ink" : "text-zinc-300"
                }`}>
                  = {tot}
                </span>

                {/* ERP 지정 위치 (매장 spec) */}
                {s.zoneKey && spec && (
                  <div className="col-span-3 pl-[72px] -mt-1 text-[11px] text-ink-soft tabular-nums" title={`ERP 지정 위치 · ${spec}`}>
                    ERP {spec}
                  </div>
                )}
              </div>
            );
          })}

          {/* 액션 (기존 StockActionsCell 재사용) */}
          <div className="mt-1 pt-2 border-t border-line/50 flex items-center justify-end">
            <StockActionsCell
              row={row}
              requestingKey={requestingKey}
              onHistory={onHistory}
              onRequestDisplay={onRequestDisplay}
              onRemove={onRemove}
            />
          </div>
        </div>
      )}
    </div>
  );
});
StockRowCard.displayName = "StockRowCard";
