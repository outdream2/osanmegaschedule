// StockRowDesktop · tbody > <tr> 한 행 렌더
// PC: 개별 5열 표시 (hidden lg:table-cell)
// 모바일: lg:hidden 통합 셀 → StockRowMobile 위임
// 공통: 상품명 셀 · 합계 셀 · 액션 셀 → StockActionsCell 위임
//
// 증분 방식 · 각 셀 3층: 기존값(readonly) / 추가입력 / 합계(자동계산)

import React from "react";
import { Box, Hash } from "lucide-react";
import type { StockRow } from "./stockRowTypes";
import { calcRowTotal, calcSlotTotal, calcTotalAdded } from "./stockRowTypes";
import { StockActionsCell } from "./StockActionsCell";
import { StockRowMobile } from "./StockRowMobile";

// ── 수량 입력 (+/-) ─────────────────────────────────────────
interface NumberInputProps {
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder?: string;
  disabled?: boolean;
  accent?: string;
}
const NumberInput: React.FC<NumberInputProps> = ({
  value, onChange, placeholder = "0", disabled = false, accent = "focus:border-brand-deep",
}) => {
  const cur = value === "" ? 0 : Number(value) || 0;
  const dec = () => { if (disabled) return; const n = Math.max(0, cur - 1); onChange(n === 0 && value === "" ? "" : n); };
  const inc = () => { if (disabled) return; onChange(cur + 1); };
  return (
    <div className={`inline-flex items-stretch w-full h-11 bg-white border-2 border-zinc-200 rounded-xl overflow-hidden transition-all focus-within:border-teal-400 focus-within:shadow-[0_0_0_3px_rgba(20,184,166,0.12)] ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <button type="button" onClick={dec} disabled={disabled || cur <= 0}
        className="w-9 shrink-0 text-zinc-400 hover:bg-zinc-100 hover:text-rose-600 active:bg-zinc-200 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-zinc-400 text-[18px] font-bold leading-none flex items-center justify-center cursor-pointer border-r border-zinc-200"
        title="감소" tabIndex={-1}>−</button>
      <input
        type="number" inputMode="numeric" value={value} disabled={disabled}
        onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder={placeholder}
        className={`flex-1 min-w-0 h-full text-center px-0.5 bg-transparent border-0 text-[15px] font-bold tabular-nums text-zinc-900 focus:outline-none disabled:text-zinc-300 placeholder:text-zinc-300 ${accent}`}
      />
      <button type="button" onClick={inc} disabled={disabled}
        className="w-9 shrink-0 text-zinc-400 hover:bg-zinc-100 hover:text-emerald-600 active:bg-zinc-200 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-zinc-400 text-[18px] font-bold leading-none flex items-center justify-center cursor-pointer border-l border-zinc-200"
        title="증가" tabIndex={-1}>+</button>
    </div>
  );
};

// ── 구역 편집 ────────────────────────────────────────────────
interface ZoneInputProps {
  value: string | null;
  placeholder?: string;
  accentClass: string;
  onChange: (v: string | null) => void;
}
const ZoneInput: React.FC<ZoneInputProps> = ({ value, placeholder = "-", accentClass, onChange }) => (
  <input
    type="text"
    value={value ?? ""}
    onChange={e => onChange(e.target.value.trim() === "" ? null : e.target.value)}
    placeholder={placeholder}
    className={`w-full h-7 text-center px-1.5 rounded-md bg-zinc-50 border border-dashed border-zinc-200
      text-[11px] font-bold tabular-nums outline-none transition placeholder:text-zinc-300
      focus:bg-white focus:border-solid ${accentClass}`}
    title="구역 편집"
  />
);

// ── 3층 셀 · 기존값 / 추가입력 / 합계 ───────────────────────
interface SlotCellProps {
  prev: number | null | undefined;
  addValue: number | "";
  onAddChange: (v: number | "") => void;
  accent: string;
  /** 구역 입력 (매장 전용) */
  zone?: string | null;
  zoneAccentClass?: string;
  onZoneChange?: (v: string | null) => void;
}
const SlotCell: React.FC<SlotCellProps> = ({
  prev, addValue, onAddChange, accent, zone, zoneAccentClass, onZoneChange,
}) => {
  const total = calcSlotTotal(prev, addValue);
  const hasAdd = addValue !== "" && Number(addValue) !== 0;
  return (
    <div className="flex flex-col gap-0.5">
      {/* 층1: 기존값 · 회색 읽기전용 */}
      <div className="flex items-center justify-center h-6 rounded-md bg-zinc-50 border border-zinc-100">
        <span className="text-[11px] text-zinc-400 font-semibold tabular-nums">
          {prev != null ? `현재 ${prev}` : <span className="text-zinc-300">-</span>}
        </span>
      </div>
      {/* 층2: 추가 입력창 */}
      <NumberInput
        value={addValue}
        onChange={onAddChange}
        placeholder="+0"
        accent={accent}
      />
      {/* 층3: 합계 · 자동계산 */}
      <div className={`flex items-center justify-center h-6 rounded-md border ${
        hasAdd ? "bg-emerald-50 border-emerald-200" : "bg-zinc-50 border-zinc-100"
      }`}>
        <span className={`text-[12px] font-bold tabular-nums ${
          hasAdd ? "text-emerald-700" : total > 0 ? "text-zinc-600" : "text-zinc-300"
        }`}>
          = {total}
        </span>
      </div>
      {/* 구역 입력 (매장 전용) */}
      {onZoneChange != null && (
        <ZoneInput
          value={zone ?? null}
          placeholder="-"
          accentClass={zoneAccentClass ?? ""}
          onChange={onZoneChange}
        />
      )}
    </div>
  );
};

// ── 메인 컴포넌트 ────────────────────────────────────────────
interface StockRowDesktopProps {
  row: StockRow;
  idx: number;
  isRecent: boolean;
  requestingKey: string | null;
  onPatch: (key: string, patch: Partial<StockRow>) => void;
  onRemove: (key: string) => void;
  onHistory: (code: string, name: string) => void;
  onRequestDisplay: (row: StockRow) => void;
}

export const StockRowDesktop: React.FC<StockRowDesktopProps> = React.memo(({
  row, idx, isRecent, requestingKey, onPatch, onRemove, onHistory, onRequestDisplay,
}) => {
  const rowTotal = calcRowTotal(row);
  const totalAdded = calcTotalAdded(row);

  const rowBg = isRecent
    ? "bg-teal-50/60"
    : idx % 2 === 0
      ? "bg-white hover:bg-zinc-50/50"
      : "bg-zinc-50/30 hover:bg-zinc-50/60";
  const accentColor = isRecent ? "border-l-teal-400" : "border-l-transparent";

  return (
    <tr className={`border-l-[3px] border-b border-zinc-100/70 transition-colors duration-100 ${accentColor} ${rowBg}`}>

      {/* 상품명 · 규격 · 코드 */}
      <td className="px-2 py-2 align-middle min-w-[140px]">
        <div className="flex items-start gap-1.5 flex-wrap">
          <p className="text-[12px] sm:text-[13px] font-bold text-zinc-800 break-words whitespace-normal leading-snug">
            {row.product.name}
          </p>
          {/* A3 · 이번 세션 추가 수량 뱃지 */}
          {totalAdded > 0 && (
            <span className="inline-flex items-center shrink-0 text-[10px] font-bold tabular-nums
              px-1.5 py-0.5 rounded-md leading-none bg-emerald-50 text-emerald-700 border border-emerald-200">
              +{totalAdded}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {(row.product as any).spec && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold
              text-zinc-500 bg-zinc-100/80 rounded px-1.5 py-0.5">
              <Box size={8} className="text-zinc-400" />
              {(row.product as any).spec}
            </span>
          )}
          <span className="inline-flex items-center gap-0.5 text-[10px] font-mono
            text-zinc-400 bg-zinc-100/60 rounded px-1.5 py-0.5">
            <Hash size={8} className="text-zinc-300" />
            {row.code}
          </span>
        </div>
      </td>

      {/* 창고1 · 데스크탑만 */}
      <td className="hidden lg:table-cell px-1 py-2 align-middle">
        <SlotCell
          prev={row.prevWarehouse1Qty}
          addValue={row.warehouse1AddQty}
          onAddChange={v => onPatch(row.key, { warehouse1AddQty: v })}
          accent="focus:border-orange-400"
        />
      </td>

      {/* 창고2 · 데스크탑만 */}
      <td className="hidden lg:table-cell px-1 py-2 align-middle">
        <SlotCell
          prev={row.prevWarehouse2Qty}
          addValue={row.warehouse2AddQty}
          onAddChange={v => onPatch(row.key, { warehouse2AddQty: v })}
          accent="focus:border-amber-400"
        />
      </td>

      {/* 매장1 · 데스크탑만 */}
      <td className="hidden lg:table-cell px-1 py-2 align-middle">
        <SlotCell
          prev={row.prevStore1Qty}
          addValue={row.store1AddQty}
          onAddChange={v => onPatch(row.key, { store1AddQty: v })}
          accent="focus:border-brand-deep"
          zone={row.store1Zone}
          zoneAccentClass="text-emerald-600 focus:border-brand-deep"
          onZoneChange={v => onPatch(row.key, { store1Zone: v })}
        />
      </td>

      {/* 매장2 · 데스크탑만 */}
      <td className="hidden lg:table-cell px-1 py-2 align-middle">
        <SlotCell
          prev={row.prevStore2Qty}
          addValue={row.store2AddQty}
          onAddChange={v => onPatch(row.key, { store2AddQty: v })}
          accent="focus:border-brand-deep"
          zone={row.store2Zone}
          zoneAccentClass="text-sky-600 focus:border-brand-deep"
          onZoneChange={v => onPatch(row.key, { store2Zone: v })}
        />
      </td>

      {/* 매장3 · 데스크탑만 */}
      <td className="hidden lg:table-cell px-1 py-2 align-middle">
        <SlotCell
          prev={row.prevStore3Qty}
          addValue={row.store3AddQty}
          onAddChange={v => onPatch(row.key, { store3AddQty: v })}
          accent="focus:border-brand-deep"
          zone={row.store3Zone}
          zoneAccentClass="text-violet-600 focus:border-brand-deep"
          onZoneChange={v => onPatch(row.key, { store3Zone: v })}
        />
      </td>

      {/* 모바일 통합 재고 셀 · lg 미만 */}
      <td className="lg:hidden px-2 py-2.5 align-middle">
        <StockRowMobile row={row} onPatch={onPatch} />
      </td>

      {/* 합계 */}
      <td className="px-2 py-2 align-middle text-center">
        {rowTotal > 0 ? (
          <span className="text-[13px] font-bold tabular-nums text-teal-700">
            {rowTotal}
          </span>
        ) : (
          <span className="text-[11px] text-zinc-300">-</span>
        )}
      </td>

      {/* 이력·진열요청·삭제 */}
      <td className="px-2 py-2 text-center align-middle">
        <StockActionsCell
          row={row}
          requestingKey={requestingKey}
          onHistory={onHistory}
          onRequestDisplay={onRequestDisplay}
          onRemove={onRemove}
        />
      </td>
    </tr>
  );
});
StockRowDesktop.displayName = "StockRowDesktop";
