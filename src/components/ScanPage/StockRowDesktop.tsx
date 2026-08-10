// StockRowDesktop · tbody > <tr> 한 행 렌더
// PC: 개별 5열 표시 (hidden lg:table-cell)
// 모바일: lg:hidden 통합 셀 → StockRowMobile 위임
// 공통: 상품명 셀 · 합계 셀 · 액션 셀 → StockActionsCell 위임

import React from "react";
import { Box, Hash } from "lucide-react";
import type { StockRow } from "./stockRowTypes";
import { calcDiff, calcTotalDiff, calcRowTotal } from "./stockRowTypes";
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
  value, onChange, placeholder = "0", disabled = false, accent = "focus:border-teal-400",
}) => {
  const cur = value === "" ? 0 : Number(value) || 0;
  const dec = () => { if (disabled) return; const n = Math.max(0, cur - 1); onChange(n === 0 && value === "" ? "" : n); };
  const inc = () => { if (disabled) return; onChange(cur + 1); };
  return (
    <div className={`inline-flex items-stretch w-full h-11 bg-white border-2 border-slate-200 rounded-xl overflow-hidden transition-all focus-within:border-teal-400 focus-within:shadow-[0_0_0_3px_rgba(20,184,166,0.12)] ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <button type="button" onClick={dec} disabled={disabled || cur <= 0}
        className="w-9 shrink-0 text-slate-400 hover:bg-slate-100 hover:text-rose-600 active:bg-slate-200 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-400 text-[18px] font-black leading-none flex items-center justify-center cursor-pointer border-r border-slate-200"
        title="감소" tabIndex={-1}>−</button>
      <input
        type="number" inputMode="numeric" value={value} disabled={disabled}
        onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder={placeholder}
        className={`flex-1 min-w-0 h-full text-center px-0.5 bg-transparent border-0 text-[15px] font-black tabular-nums text-slate-900 focus:outline-none disabled:text-slate-300 placeholder:text-slate-300 ${accent}`}
      />
      <button type="button" onClick={inc} disabled={disabled}
        className="w-9 shrink-0 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 active:bg-slate-200 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-400 text-[18px] font-black leading-none flex items-center justify-center cursor-pointer border-l border-slate-200"
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
    className={`w-full h-7 text-center px-1.5 rounded-md bg-slate-50 border border-dashed border-slate-200
      text-[11px] font-bold tabular-nums outline-none transition placeholder:text-slate-300
      focus:bg-white focus:border-solid ${accentClass}`}
    title="구역 편집"
  />
);

// ── diff 마이크로텍스트 ──────────────────────────────────────
const DiffMicro: React.FC<{ prev: number; diff: number | null }> = ({ prev, diff }) => (
  <div className="flex items-center justify-center gap-1 text-[10px] tabular-nums leading-none">
    <span className="text-slate-400">이전 {prev}</span>
    {diff != null && (
      <span className={diff > 0 ? "text-emerald-600 font-bold" : diff < 0 ? "text-rose-500 font-bold" : "text-slate-400"}>
        {diff > 0 ? `+${diff}` : diff}
      </span>
    )}
  </div>
);

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
  const hasAnyValue =
    row.warehouse1Qty !== "" || row.warehouse2Qty !== "" ||
    row.store1Qty !== "" || row.store2Qty !== "" || row.store3Qty !== "";

  const totalDiff = calcTotalDiff(row);

  const rowBg = isRecent
    ? "bg-teal-50/60"
    : idx % 2 === 0
      ? "bg-white hover:bg-slate-50/50"
      : "bg-slate-50/30 hover:bg-slate-50/60";
  const accentColor = isRecent ? "border-l-teal-400" : "border-l-transparent";

  return (
    <tr className={`border-l-[3px] border-b border-slate-100/70 transition-colors duration-100 ${accentColor} ${rowBg}`}>

      {/* 상품명 · 규격 · 코드 */}
      <td className="px-2 py-2 align-middle min-w-[140px]">
        <div className="flex items-start gap-1.5 flex-wrap">
          <p className="text-[12px] sm:text-[13px] font-black text-slate-800 break-words whitespace-normal leading-snug">
            {row.product.name}
          </p>
          {/* A3 · 총 diff 뱃지 */}
          {totalDiff != null && (
            <span className={`inline-flex items-center shrink-0 text-[10px] font-black tabular-nums
              px-1.5 py-0.5 rounded-md leading-none
              ${totalDiff > 0
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : totalDiff < 0
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : "bg-slate-100 text-slate-500 border border-slate-200"}`}
            >
              {totalDiff > 0 ? `+${totalDiff}` : totalDiff}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {(row.product as any).spec && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold
              text-slate-500 bg-slate-100/80 rounded px-1.5 py-0.5">
              <Box size={8} className="text-slate-400" />
              {(row.product as any).spec}
            </span>
          )}
          <span className="inline-flex items-center gap-0.5 text-[10px] font-mono
            text-slate-400 bg-slate-100/60 rounded px-1.5 py-0.5">
            <Hash size={8} className="text-slate-300" />
            {row.code}
          </span>
        </div>
      </td>

      {/* 창고1 · 데스크탑만 */}
      <td className="hidden lg:table-cell px-1 py-2 align-middle">
        {(() => {
          const diff1 = calcDiff(row.warehouse1Qty, row.prevWarehouse1Qty);
          return (
            <div className="flex flex-col gap-0.5">
              <NumberInput
                value={row.warehouse1Qty}
                onChange={v => onPatch(row.key, { warehouse1Qty: v })}
                accent="focus:border-orange-400"
              />
              {row.prevWarehouse1Qty != null && <DiffMicro prev={row.prevWarehouse1Qty} diff={diff1} />}
            </div>
          );
        })()}
      </td>

      {/* 창고2 · 데스크탑만 */}
      <td className="hidden lg:table-cell px-1 py-2 align-middle">
        {(() => {
          const diff2 = calcDiff(row.warehouse2Qty, row.prevWarehouse2Qty);
          return (
            <div className="flex flex-col gap-0.5">
              <NumberInput
                value={row.warehouse2Qty}
                onChange={v => onPatch(row.key, { warehouse2Qty: v })}
                accent="focus:border-amber-400"
              />
              {row.prevWarehouse2Qty != null && <DiffMicro prev={row.prevWarehouse2Qty} diff={diff2} />}
            </div>
          );
        })()}
      </td>

      {/* 매장1 · 데스크탑만 */}
      <td className="hidden lg:table-cell px-1 py-2 align-middle">
        {(() => {
          const diffS1 = calcDiff(row.store1Qty, row.prevStore1Qty);
          return (
            <div className="flex flex-col gap-0.5">
              <NumberInput
                value={row.store1Qty}
                onChange={v => onPatch(row.key, { store1Qty: v })}
                accent="focus:border-emerald-400"
              />
              {row.prevStore1Qty != null && <DiffMicro prev={row.prevStore1Qty} diff={diffS1} />}
              <ZoneInput
                value={row.store1Zone}
                placeholder="-"
                accentClass="text-emerald-600 focus:border-emerald-400"
                onChange={v => onPatch(row.key, { store1Zone: v })}
              />
            </div>
          );
        })()}
      </td>

      {/* 매장2 · 데스크탑만 */}
      <td className="hidden lg:table-cell px-1 py-2 align-middle">
        {(() => {
          const diffS2 = calcDiff(row.store2Qty, row.prevStore2Qty);
          return (
            <div className="flex flex-col gap-0.5">
              <NumberInput
                value={row.store2Qty}
                onChange={v => onPatch(row.key, { store2Qty: v })}
                accent="focus:border-sky-400"
              />
              {row.prevStore2Qty != null && <DiffMicro prev={row.prevStore2Qty} diff={diffS2} />}
              <ZoneInput
                value={row.store2Zone}
                placeholder="-"
                accentClass="text-sky-600 focus:border-sky-400"
                onChange={v => onPatch(row.key, { store2Zone: v })}
              />
            </div>
          );
        })()}
      </td>

      {/* 매장3 · 데스크탑만 */}
      <td className="hidden lg:table-cell px-1 py-2 align-middle">
        {(() => {
          const diffS3 = calcDiff(row.store3Qty, row.prevStore3Qty);
          return (
            <div className="flex flex-col gap-0.5">
              <NumberInput
                value={row.store3Qty}
                onChange={v => onPatch(row.key, { store3Qty: v })}
                accent="focus:border-violet-400"
              />
              {row.prevStore3Qty != null && <DiffMicro prev={row.prevStore3Qty} diff={diffS3} />}
              <ZoneInput
                value={row.store3Zone}
                placeholder="-"
                accentClass="text-violet-600 focus:border-violet-400"
                onChange={v => onPatch(row.key, { store3Zone: v })}
              />
            </div>
          );
        })()}
      </td>

      {/* 모바일 통합 재고 셀 · lg 미만 */}
      <td className="lg:hidden px-2 py-2.5 align-middle">
        <StockRowMobile row={row} onPatch={onPatch} />
      </td>

      {/* 합계 */}
      <td className="px-2 py-2 align-middle text-center">
        {hasAnyValue ? (
          <span className={`text-[13px] font-black tabular-nums ${rowTotal > 0 ? "text-teal-700" : "text-slate-400"}`}>
            {rowTotal}
          </span>
        ) : (
          <span className="text-[11px] text-slate-300">-</span>
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

