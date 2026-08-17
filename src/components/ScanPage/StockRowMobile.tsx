// StockRowMobile · 모바일 전용 재고 입력 셀 내부 렌더 (lg:hidden td 안)
// 창고 2칸 grid + 매장 3칸 grid · 3층 구조 (기존값/추가입력/합계)
//
// 증분 방식 · 각 위치 그룹 3층: 기존(회색) / 추가입력 / 합계(강조)

import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { StockRow } from "./stockRowTypes";
import { calcSlotTotal } from "./stockRowTypes";

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

// ── 메인 컴포넌트 ────────────────────────────────────────────
interface StockRowMobileProps {
  row: StockRow;
  onPatch: (key: string, patch: Partial<StockRow>) => void;
}

export const StockRowMobile: React.FC<StockRowMobileProps> = React.memo(({ row, onPatch }) => {
  // product.spec 파싱 (ERP 지정 매장 위치 · "/" 로 3매장 분할)
  const specParts = String((row.product as any).spec ?? "").split("/").map((s: string) => s.trim());
  const [spec1, spec2, spec3] = [specParts[0] ?? "", specParts[1] ?? "", specParts[2] ?? ""];

  // 2026-08-10 · A2 Progressive Disclosure · 매장1 만 기본 노출 · 나머지 4칸 접힘
  // 값 (prev or add) 있는 위치는 자동 확장
  const hasWh1 = row.prevWarehouse1Qty != null || (row.warehouse1AddQty !== "" && Number(row.warehouse1AddQty) !== 0);
  const hasWh2 = row.prevWarehouse2Qty != null || (row.warehouse2AddQty !== "" && Number(row.warehouse2AddQty) !== 0);
  const hasStore2 = row.prevStore2Qty != null || (row.store2AddQty !== "" && Number(row.store2AddQty) !== 0);
  const hasStore3 = row.prevStore3Qty != null || (row.store3AddQty !== "" && Number(row.store3AddQty) !== 0);
  const autoExpanded = hasWh1 || hasWh2 || hasStore2 || hasStore3;
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const expanded = autoExpanded || manuallyExpanded;

  const warehouseCols: Array<{
    addKey: keyof Pick<StockRow, "warehouse1AddQty" | "warehouse2AddQty">;
    prev: number | null | undefined;
    label: string;
    accent: string;
    color: string;
  }> = [
    { addKey: "warehouse1AddQty", prev: row.prevWarehouse1Qty, label: "창1", accent: "focus:border-orange-400", color: "text-orange-600" },
    { addKey: "warehouse2AddQty", prev: row.prevWarehouse2Qty, label: "창2", accent: "focus:border-amber-400",  color: "text-amber-600"  },
  ];

  const storeCols: Array<{
    addKey: keyof Pick<StockRow, "store1AddQty" | "store2AddQty" | "store3AddQty">;
    zoneKey: keyof Pick<StockRow, "store1Zone" | "store2Zone" | "store3Zone">;
    prev: number | null | undefined;
    zone: string | null;
    spec: string;
    label: string;
    accent: string;
    zoneAccent: string;
    color: string;
  }> = [
    { addKey: "store1AddQty", zoneKey: "store1Zone", prev: row.prevStore1Qty, zone: row.store1Zone, spec: spec1, label: "매1", accent: "focus:border-brand-deep", zoneAccent: "text-emerald-600 focus:border-brand-deep", color: "text-emerald-600" },
    { addKey: "store2AddQty", zoneKey: "store2Zone", prev: row.prevStore2Qty, zone: row.store2Zone, spec: spec2, label: "매2", accent: "focus:border-brand-deep",     zoneAccent: "text-sky-600 focus:border-brand-deep",     color: "text-sky-600"     },
    { addKey: "store3AddQty", zoneKey: "store3Zone", prev: row.prevStore3Qty, zone: row.store3Zone, spec: spec3, label: "매3", accent: "focus:border-brand-deep",  zoneAccent: "text-violet-600 focus:border-brand-deep", color: "text-violet-600"  },
  ];

  // 매장1 (주 매장 · 항상 노출)
  const store1Col = storeCols[0];
  const otherStoreCols = storeCols.slice(1);

  const renderCell = (
    addKey: any,
    prev: number | null | undefined,
    label: string,
    accent: string,
    color: string,
    zoneKey?: any,
    zone?: string | null,
    spec?: string,
    zoneAccent?: string,
  ) => {
    const addVal = row[addKey] as number | "";
    const total = calcSlotTotal(prev, addVal);
    const hasAdd = addVal !== "" && Number(addVal) !== 0;
    return (
      <div key={addKey} className="flex flex-col gap-0.5">
        <span className={`text-[13px] font-bold px-1 ${color}`}>{label}</span>
        <div className="flex items-center justify-center h-6 rounded-md bg-zinc-50 border border-zinc-100">
          <span className="text-[11px] text-zinc-400 font-semibold tabular-nums">
            {prev != null ? `현재 ${prev}` : <span className="text-zinc-300">-</span>}
          </span>
        </div>
        <NumberInput
          value={addVal}
          onChange={v => onPatch(row.key, { [addKey]: v } as Partial<StockRow>)}
          placeholder="+0"
          accent={accent}
        />
        <div className={`flex items-center justify-center h-6 rounded-md border ${
          hasAdd ? "bg-emerald-50 border-emerald-200" : "bg-zinc-50 border-zinc-100"
        }`}>
          <span className={`text-[12px] font-bold tabular-nums ${
            hasAdd ? "text-emerald-700" : total > 0 ? "text-zinc-600" : "text-zinc-300"
          }`}>= {total}</span>
        </div>
        {spec && (
          <div className="text-[11px] text-zinc-500 text-center px-1 tabular-nums" title={`ERP 지정 위치 · ${spec}`}>
            {spec}
          </div>
        )}
        {zoneKey && zoneAccent && (
          <ZoneInput
            value={zone ?? null}
            placeholder="구역"
            accentClass={zoneAccent}
            onChange={v => onPatch(row.key, { [zoneKey]: v } as Partial<StockRow>)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* A2 · 매장1 (주 매장) · 항상 노출 */}
      <div className="grid grid-cols-1">
        {renderCell(store1Col.addKey, store1Col.prev, store1Col.label, store1Col.accent, store1Col.color, store1Col.zoneKey, store1Col.zone, store1Col.spec, store1Col.zoneAccent)}
      </div>

      {/* A2 · 나머지 4칸 접기/펼치기 · 값 있으면 자동 확장 · 없으면 토글 */}
      {!expanded && (
        <button
          type="button"
          onClick={() => setManuallyExpanded(true)}
          className="w-full py-1.5 rounded-md bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-[11px] font-bold text-zinc-500 hover:text-zinc-700 inline-flex items-center justify-center gap-1 transition cursor-pointer"
        >
          <ChevronDown size={12} /> 나머지 4칸 (창1·창2·매2·매3)
        </button>
      )}
      {expanded && !autoExpanded && (
        <button
          type="button"
          onClick={() => setManuallyExpanded(false)}
          className="w-full py-1.5 rounded-md bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-[11px] font-bold text-zinc-500 hover:text-zinc-700 inline-flex items-center justify-center gap-1 transition cursor-pointer"
        >
          <ChevronUp size={12} /> 접기
        </button>
      )}

      {/* 창고 그룹 · 2칸 · 접힘 가능 */}
      {expanded && <div className="grid grid-cols-2 gap-2">
        {warehouseCols.map(({ addKey, prev, label, accent, color }) => {
          const addVal = row[addKey] as number | "";
          const total = calcSlotTotal(prev, addVal);
          const hasAdd = addVal !== "" && Number(addVal) !== 0;
          return (
            <div key={addKey} className="flex flex-col gap-0.5">
              {/* 라벨 */}
              <span className={`text-[13px] font-bold px-1 ${color}`}>{label}</span>
              {/* 층1: 기존값 */}
              <div className="flex items-center justify-center h-6 rounded-md bg-zinc-50 border border-zinc-100">
                <span className="text-[11px] text-zinc-400 font-semibold tabular-nums">
                  {prev != null ? `현재 ${prev}` : <span className="text-zinc-300">-</span>}
                </span>
              </div>
              {/* 층2: 추가 입력창 */}
              <NumberInput
                value={addVal}
                onChange={v => onPatch(row.key, { [addKey]: v } as Partial<StockRow>)}
                placeholder="+0"
                accent={accent}
              />
              {/* 층3: 합계 */}
              <div className={`flex items-center justify-center h-6 rounded-md border ${
                hasAdd ? "bg-emerald-50 border-emerald-200" : "bg-zinc-50 border-zinc-100"
              }`}>
                <span className={`text-[12px] font-bold tabular-nums ${
                  hasAdd ? "text-emerald-700" : total > 0 ? "text-zinc-600" : "text-zinc-300"
                }`}>
                  = {total}
                </span>
              </div>
            </div>
          );
        })}
      </div>}

      {/* 매장 그룹 · 2·3 (매장1 제외) · 접힘 가능 */}
      {expanded && <div className="grid grid-cols-2 gap-2">
        {otherStoreCols.map(({ addKey, zoneKey, prev, zone, spec, label, accent, zoneAccent, color }) => {
          const addVal = row[addKey] as number | "";
          const total = calcSlotTotal(prev, addVal);
          const hasAdd = addVal !== "" && Number(addVal) !== 0;
          return (
            <div key={addKey} className="flex flex-col gap-0.5">
              {/* 라벨 */}
              <span className={`text-[13px] font-bold px-1 ${color}`}>{label}</span>
              {/* 층1: 기존값 */}
              <div className="flex items-center justify-center h-6 rounded-md bg-zinc-50 border border-zinc-100">
                <span className="text-[11px] text-zinc-400 font-semibold tabular-nums">
                  {prev != null ? `현재 ${prev}` : <span className="text-zinc-300">-</span>}
                </span>
              </div>
              {/* 층2: 추가 입력창 */}
              <NumberInput
                value={addVal}
                onChange={v => onPatch(row.key, { [addKey]: v } as Partial<StockRow>)}
                placeholder="+0"
                accent={accent}
              />
              {/* 층3: 합계 */}
              <div className={`flex items-center justify-center h-6 rounded-md border ${
                hasAdd ? "bg-emerald-50 border-emerald-200" : "bg-zinc-50 border-zinc-100"
              }`}>
                <span className={`text-[12px] font-bold tabular-nums ${
                  hasAdd ? "text-emerald-700" : total > 0 ? "text-zinc-600" : "text-zinc-300"
                }`}>
                  = {total}
                </span>
              </div>
              {/* ERP 지정 위치 (spec) · 있을 때만 */}
              {spec && (
                <div className="text-[11px] text-zinc-500 text-center px-1 tabular-nums" title={`ERP 지정 위치 · ${spec}`}>
                  {spec}
                </div>
              )}
              {/* 구역 (real_map · 편집) · 항상 노출 · 신규 스캔 상품도 입력 가능 */}
              <ZoneInput
                value={zone}
                placeholder="구역"
                accentClass={zoneAccent}
                onChange={v => onPatch(row.key, { [zoneKey]: v } as Partial<StockRow>)}
              />
            </div>
          );
        })}
      </div>}
    </div>
  );
});
StockRowMobile.displayName = "StockRowMobile";
