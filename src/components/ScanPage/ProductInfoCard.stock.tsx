// ProductInfoCard.stock.tsx
// 2026-08-29 · 분리 · 재고현황 + 실재고입력 섹션 (창고1·창고2·매장1·매장2·매장3)

import React from "react";
import { Package, AlertTriangle, ChevronRight, ChevronDown, Check, X } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { StockSlotCard } from "./StockSlotCard";
import type { InlineEditableKey } from "./ProductInfoCard.types";

type InvStatus = "idle" | "loading" | "done" | "error";

interface ProductInfoStockProps {
  isLow: boolean;
  cur: number | null;
  opt: number | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  showActualInput: boolean;
  showW1: boolean;
  showW2: boolean;
  zoneW1: string;
  zoneW2: string;
  zoneS1: string;
  zoneS2: string;
  zoneS3: string;
  storeZones: string[];
  warehouse1Stock: number | "";
  warehouse2Stock: number | "";
  store1Stock: number | "";
  store2Stock: number | "";
  store3Stock: number | "";
  w1Status: InvStatus;
  w2Status: InvStatus;
  s1Status: InvStatus;
  s2Status: InvStatus;
  s3Status: InvStatus;
  w1Error: string | null;
  w2Error: string | null;
  s1Error: string | null;
  s2Error: string | null;
  s3Error: string | null;
  onW1Change: (v: number | "") => void;
  onW2Change: (v: number | "") => void;
  onS1Change: (v: number | "") => void;
  onS2Change: (v: number | "") => void;
  onS3Change: (v: number | "") => void;
  onW1Submit: () => void;
  onW2Submit: () => void;
  onS1Submit: () => void;
  onS2Submit: () => void;
  onS3Submit: () => void;
  // 적정재고 인라인 편집
  editingKey: InlineEditableKey | null;
  editingValue: string;
  editSaving: boolean;
  editError: string | null;
  inlineEditEnabled: boolean;
  onEditStart: (k: InlineEditableKey, v: any) => void;
  onEditChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export const ProductInfoStock: React.FC<ProductInfoStockProps> = ({
  isLow, cur, opt, collapsed, onToggleCollapse,
  showActualInput, showW1, showW2,
  zoneW1, zoneW2, zoneS1, zoneS2, zoneS3, storeZones,
  warehouse1Stock, warehouse2Stock, store1Stock, store2Stock, store3Stock,
  w1Status, w2Status, s1Status, s2Status, s3Status,
  w1Error, w2Error, s1Error, s2Error, s3Error,
  onW1Change, onW2Change, onS1Change, onS2Change, onS3Change,
  onW1Submit, onW2Submit, onS1Submit, onS2Submit, onS3Submit,
  editingKey, editingValue, editSaving, editError, inlineEditEnabled,
  onEditStart, onEditChange, onCommit, onCancel,
}) => {
  const hasInput =
    warehouse1Stock !== "" || warehouse2Stock !== "" ||
    store1Stock !== "" || store2Stock !== "" || store3Stock !== "";
  const totalActual =
    Number(warehouse1Stock || 0) + Number(warehouse2Stock || 0) +
    Number(store1Stock || 0) + Number(store2Stock || 0) + Number(store3Stock || 0);
  const diff = hasInput && cur != null ? totalActual - cur : null;

  return (
    <div className={`relative overflow-hidden rounded-xl border px-3 py-2.5 mb-2.5 ${isLow ? "bg-red-50 border-red-200" : "bg-zinc-50 border-line"}`}>
      <span aria-hidden className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${isLow ? "from-rose-500 via-red-500 to-rose-500" : "from-brand-deep via-sky-500 to-brand-deep"} opacity-90 z-10 pointer-events-none`} />

      {/* 헤더 · 접기/펼치기 */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-1.5 hover:bg-white/40 -mx-1 px-1 py-0.5 rounded transition cursor-pointer flex-1 min-w-0"
          title={collapsed ? "펼치기" : "접기"}
        >
          {collapsed
            ? <ChevronRight size={15} className="text-zinc-400 shrink-0" />
            : <ChevronDown size={15} className="text-zinc-500 shrink-0" />}
          <Package size={13} className={`shrink-0 ${isLow ? "text-red-500" : "text-brand-deep"}`} />
          <p className={`text-[15px] font-bold ${isLow ? "text-red-600" : "text-zinc-800"}`}>재고현황</p>
          {isLow && (
            <span className="text-[13px] font-bold text-red-500 flex items-center gap-0.5 shrink-0">
              <AlertTriangle size={12} /> 부족
            </span>
          )}
          {collapsed && (
            <span className="text-[13px] tabular-nums font-semibold text-zinc-500 ml-1 truncate">현재고 {cur ?? "-"} · 적정 {opt ?? "-"}</span>
          )}
        </button>
      </div>

      {/* 현재고 · 적정재고 */}
      {!collapsed && (
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center bg-white rounded-lg border border-line py-2 px-1">
            <p className="text-[13px] font-semibold text-zinc-500 mb-1">현재고</p>
            <p className={`text-[18px] font-bold leading-none tabular-nums ${isLow ? "text-red-600" : "text-zinc-800"}`}>{cur ?? "-"}</p>
          </div>
          <div className="text-center bg-white rounded-lg border border-amber-200 py-2 px-1">
            <p className="text-[13px] font-semibold text-amber-600 mb-1">추천적정재고</p>
            {editingKey === "optimal_stock" ? (
              <div className="flex items-center gap-0.5 justify-center">
                <input
                  type="number" min={0}
                  value={editingValue}
                  onChange={e => onEditChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel(); }}
                  disabled={editSaving}
                  autoFocus
                  className="w-10 text-[14px] font-bold text-center border border-amber-500 rounded px-0.5 py-0 focus:outline-none"
                />
                <button onClick={onCommit} disabled={editSaving} className="w-4 h-4 rounded bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 disabled:opacity-40 cursor-pointer">
                  {editSaving ? <Spinner size={8} /> : <Check size={9} />}
                </button>
                <button onClick={onCancel} disabled={editSaving} className="w-4 h-4 rounded bg-zinc-200 text-zinc-600 flex items-center justify-center hover:bg-zinc-300 disabled:opacity-40 cursor-pointer">
                  <X size={9} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => inlineEditEnabled && onEditStart("optimal_stock", opt)}
                disabled={!inlineEditEnabled}
                className={`text-[18px] font-bold leading-none tabular-nums text-amber-700 ${inlineEditEnabled ? "hover:bg-amber-100 rounded px-1 -mx-1 cursor-pointer transition" : "cursor-default"}`}
                title={inlineEditEnabled ? "클릭 → 편집" : undefined}
              >{opt ?? "-"}</button>
            )}
          </div>
        </div>
      )}

      {/* 실재고 입력 슬롯 */}
      {showActualInput && !collapsed && (
        <div className="flex flex-col gap-3 mt-1.5">
          {/* 창고 */}
          {(showW1 || showW2) && (
            <div className={`grid gap-1.5 ${showW1 && showW2 ? "grid-cols-2" : "grid-cols-1"}`}>
              {showW1 && (
                <StockSlotCard kind="warehouse" label="창고1" zone={zoneW1} value={warehouse1Stock}
                  onChange={v => { onW1Change(v); }} status={w1Status} onSubmit={onW1Submit} toneKey="wh1" />
              )}
              {showW2 && (
                <StockSlotCard kind="warehouse" label="창고2" zone={zoneW2} value={warehouse2Stock}
                  onChange={v => { onW2Change(v); }} status={w2Status} onSubmit={onW2Submit} toneKey="wh2" />
              )}
            </div>
          )}
          {/* 매장 */}
          {(() => {
            const storeCount = storeZones.length <= 1 ? 1 : storeZones.length >= 3 ? 3 : 2;
            const gridCls = storeCount === 3 ? "grid-cols-3" : storeCount === 2 ? "grid-cols-2" : "grid-cols-1";
            return (
              <div className={`grid ${gridCls} gap-1.5`}>
                {(storeZones.length === 0 || storeZones.length >= 1) && (
                  <StockSlotCard kind="store" label="매장1" zone={zoneS1} value={store1Stock}
                    onChange={v => { onS1Change(v); }} status={s1Status} onSubmit={onS1Submit} toneKey="s1" />
                )}
                {storeZones.length >= 2 && (
                  <StockSlotCard kind="store" label="매장2" zone={zoneS2} value={store2Stock}
                    onChange={v => { onS2Change(v); }} status={s2Status} onSubmit={onS2Submit} toneKey="s2" />
                )}
                {storeZones.length >= 3 && (
                  <StockSlotCard kind="store" label="매장3" zone={zoneS3} value={store3Stock}
                    onChange={v => { onS3Change(v); }} status={s3Status} onSubmit={onS3Submit} toneKey="s3" />
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* 합계 + 차이 */}
      {showActualInput && !collapsed && hasInput && (
        <div className="flex items-center justify-between text-[14px] font-semibold px-0.5 mt-1.5 flex-wrap gap-1">
          <span className="text-zinc-600">실재고 합계: <span className="tabular-nums font-bold text-violet-700">{totalActual}개</span></span>
          {diff != null && (
            <span className={`tabular-nums font-bold ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-zinc-400"}`}>
              현재고 대비 {diff > 0 ? "+" : ""}{diff}개
            </span>
          )}
        </div>
      )}

      {/* 에러 표시 */}
      {!collapsed && editingKey === "optimal_stock" && editError && (
        <p className="text-[13px] text-red-500 mt-1">{editError}</p>
      )}
      {showActualInput && !collapsed && w1Status === "error" && w1Error && (
        <p className="text-[13px] text-red-500 text-center mt-1">창고1: {w1Error}</p>
      )}
      {showActualInput && !collapsed && w2Status === "error" && w2Error && (
        <p className="text-[13px] text-red-500 text-center mt-1">창고2: {w2Error}</p>
      )}
      {showActualInput && !collapsed && s1Status === "error" && s1Error && (
        <p className="text-[13px] text-red-500 text-center mt-1">매장1: {s1Error}</p>
      )}
      {showActualInput && !collapsed && s2Status === "error" && s2Error && (
        <p className="text-[13px] text-red-500 text-center mt-1">매장2: {s2Error}</p>
      )}
      {showActualInput && !collapsed && s3Status === "error" && s3Error && (
        <p className="text-[13px] text-red-500 text-center mt-1">매장3: {s3Error}</p>
      )}
    </div>
  );
};
