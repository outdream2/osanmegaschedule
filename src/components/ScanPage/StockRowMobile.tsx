// StockRowMobile · 모바일 전용 재고 입력 셀 내부 렌더 (lg:hidden td 안)
// 창고 2칸 grid + 매장 3칸 grid · A1 diff · ERP 위치(spec) · 구역 편집

import React from "react";
import type { StockRow } from "./stockRowTypes";
import { calcDiff } from "./stockRowTypes";

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

// ── diff 텍스트 ──────────────────────────────────────────────
const DiffLabel: React.FC<{ prev: number; diff: number | null }> = ({ prev, diff }) => (
  <span className="flex items-baseline gap-0.5 text-[11px] tabular-nums">
    <span className="text-slate-400">이전 {prev}</span>
    {diff != null && (
      <span className={diff > 0 ? "text-emerald-600 font-bold" : diff < 0 ? "text-rose-500 font-bold" : "text-slate-400"}>
        {diff > 0 ? `+${diff}` : diff}
      </span>
    )}
  </span>
);

// ── 메인 컴포넌트 ────────────────────────────────────────────
interface StockRowMobileProps {
  row: StockRow;
  onPatch: (key: string, patch: Partial<StockRow>) => void;
}

export const StockRowMobile: React.FC<StockRowMobileProps> = React.memo(({ row, onPatch }) => {
  // product.spec 파싱 (ERP 지정 매장 위치 · "/" 로 3매장 분할)
  const specParts = String((row.product as any).spec ?? "").split("/").map((s: string) => s.trim());
  const [spec1, spec2, spec3] = [specParts[0] ?? "", specParts[1] ?? "", specParts[2] ?? ""];

  const warehouseCols: Array<{
    key: keyof Pick<StockRow, "warehouse1Qty" | "warehouse2Qty">;
    prev: number | null | undefined;
    label: string;
    accent: string;
    color: string;
  }> = [
    { key: "warehouse1Qty", prev: row.prevWarehouse1Qty, label: "창1", accent: "focus:border-orange-400", color: "text-orange-600" },
    { key: "warehouse2Qty", prev: row.prevWarehouse2Qty, label: "창2", accent: "focus:border-amber-400",  color: "text-amber-600"  },
  ];

  const storeCols: Array<{
    key: keyof Pick<StockRow, "store1Qty" | "store2Qty" | "store3Qty">;
    zoneKey: keyof Pick<StockRow, "store1Zone" | "store2Zone" | "store3Zone">;
    prev: number | null | undefined;
    zone: string | null;
    spec: string;
    label: string;
    accent: string;
    zoneAccent: string;
    color: string;
  }> = [
    { key: "store1Qty", zoneKey: "store1Zone", prev: row.prevStore1Qty, zone: row.store1Zone, spec: spec1, label: "매1", accent: "focus:border-emerald-400", zoneAccent: "text-emerald-600 focus:border-emerald-400", color: "text-emerald-600" },
    { key: "store2Qty", zoneKey: "store2Zone", prev: row.prevStore2Qty, zone: row.store2Zone, spec: spec2, label: "매2", accent: "focus:border-sky-400",     zoneAccent: "text-sky-600 focus:border-sky-400",     color: "text-sky-600"     },
    { key: "store3Qty", zoneKey: "store3Zone", prev: row.prevStore3Qty, zone: row.store3Zone, spec: spec3, label: "매3", accent: "focus:border-violet-400",  zoneAccent: "text-violet-600 focus:border-violet-400", color: "text-violet-600"  },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      {/* 창고 그룹 · 2칸 */}
      <div className="grid grid-cols-2 gap-2">
        {warehouseCols.map(({ key, prev, label, accent, color }) => {
          const d = calcDiff(row[key], prev);
          return (
            <div key={key} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between px-1">
                <span className={`text-[13px] font-black ${color}`}>{label}</span>
                {prev != null && <DiffLabel prev={prev} diff={d} />}
              </div>
              <NumberInput
                value={row[key]}
                onChange={v => onPatch(row.key, { [key]: v } as Partial<StockRow>)}
                accent={accent}
              />
            </div>
          );
        })}
      </div>

      {/* 매장 그룹 · 3칸 */}
      <div className="grid grid-cols-3 gap-2">
        {storeCols.map(({ key, zoneKey, prev, zone, spec, label, accent, zoneAccent, color }) => {
          const d = calcDiff(row[key], prev);
          return (
            <div key={key} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between px-1">
                <span className={`text-[13px] font-black ${color}`}>{label}</span>
                {prev != null && <DiffLabel prev={prev} diff={d} />}
              </div>
              <NumberInput
                value={row[key]}
                onChange={v => onPatch(row.key, { [key]: v } as Partial<StockRow>)}
                accent={accent}
              />
              {/* ERP 지정 위치 (spec) · 있을 때만 */}
              {spec && (
                <div className="text-[11px] text-slate-500 text-center px-1 tabular-nums" title={`ERP 지정 위치 · ${spec}`}>
                  {spec}
                </div>
              )}
              {/* 구역 (real_map · 편집) · 값 있을 때만 */}
              {zone && (
                <ZoneInput
                  value={zone}
                  placeholder="구역"
                  accentClass={zoneAccent}
                  onChange={v => onPatch(row.key, { [zoneKey]: v } as Partial<StockRow>)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
StockRowMobile.displayName = "StockRowMobile";
