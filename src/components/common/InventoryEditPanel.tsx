// src/components/common/InventoryEditPanel.tsx
// 실재고 입력 패널 · 창고1/창고2/매장1/매장2/매장3 수량 + 매장 구역 편집
// controlled 컴포넌트 — 부모가 values/onChange 를 제공
// InventoryEditModal 에 내장되거나 단독으로 사용 가능

import React from "react";
import { Package, MapPin } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface InventoryValues {
  w1: number | "";
  w2: number | "";
  s1: number | "";
  s2: number | "";
  s3: number | "";
  s1z: string | null;
  s2z: string | null;
  s3z: string | null;
}

export interface InventoryEditPanelProps {
  productCode: string;
  productName: string;
  values: InventoryValues;
  onChange: (v: InventoryValues) => void;
  /** 저장 버튼 표시 (기본 false · 모달 footer 에서 저장할 경우 false) */
  showSaveButton?: boolean;
  onSave?: () => void;
  saving?: boolean;
  /** compact 모드 (패딩 최소화) */
  dense?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
interface NumberInputProps {
  value: number | "";
  onChange: (v: number | "") => void;
  disabled?: boolean;
  accent?: string;
}
const NumberInput: React.FC<NumberInputProps> = ({
  value, onChange, disabled = false, accent = "focus:border-teal-400",
}) => {
  const cur = value === "" ? 0 : Number(value) || 0;
  const dec = () => {
    if (disabled) return;
    const n = Math.max(0, cur - 1);
    onChange(n === 0 && value === "" ? "" : n);
  };
  const inc = () => { if (disabled) return; onChange(cur + 1); };
  return (
    <div className={`inline-flex items-stretch w-full h-9 bg-white border border-slate-200 rounded-lg overflow-hidden transition ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <button
        type="button"
        onClick={dec}
        disabled={disabled || cur <= 0}
        className="w-7 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-rose-600 active:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 text-[16px] font-black leading-none flex items-center justify-center cursor-pointer border-r border-slate-200"
        title="감소"
        tabIndex={-1}
      >−</button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder="0"
        className={`flex-1 min-w-0 h-full text-center px-1 bg-transparent border-0 text-[13px] font-black tabular-nums focus:outline-none disabled:text-slate-300 ${accent}`}
      />
      <button
        type="button"
        onClick={inc}
        disabled={disabled}
        className="w-7 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-emerald-600 active:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 text-[16px] font-black leading-none flex items-center justify-center cursor-pointer border-l border-slate-200"
        title="증가"
        tabIndex={-1}
      >+</button>
    </div>
  );
};

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
    className={`w-full h-5 text-center px-1 bg-transparent border-0 border-b border-dashed border-slate-200
      text-[10px] font-bold tabular-nums outline-none transition placeholder:text-slate-300 ${accentClass}`}
    title="구역 편집"
  />
);

// ─────────────────────────────────────────────────────────────
// Total helper
// ─────────────────────────────────────────────────────────────
function calcTotal(v: InventoryValues): number {
  return (v.w1 !== "" ? Number(v.w1) : 0)
    + (v.w2 !== "" ? Number(v.w2) : 0)
    + (v.s1 !== "" ? Number(v.s1) : 0)
    + (v.s2 !== "" ? Number(v.s2) : 0)
    + (v.s3 !== "" ? Number(v.s3) : 0);
}

// ─────────────────────────────────────────────────────────────
// InventoryEditPanel
// ─────────────────────────────────────────────────────────────
export const InventoryEditPanel: React.FC<InventoryEditPanelProps> = ({
  productCode,
  productName,
  values,
  onChange,
  showSaveButton = false,
  onSave,
  saving = false,
  dense = false,
}) => {
  const pad = dense ? "p-3 space-y-3" : "p-4 space-y-4";

  const set = (patch: Partial<InventoryValues>) => onChange({ ...values, ...patch });

  const total = calcTotal(values);

  return (
    <div className={pad}>
      {/* 상품 정보 헤더 */}
      <div className="flex items-start gap-2.5 pb-2 border-b border-slate-100">
        <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
          <Package size={13} className="text-violet-600" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-slate-800 leading-snug break-words">{productName || productCode}</div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{productCode}</div>
        </div>
      </div>

      {/* 창고 섹션 */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Package size={10} className="text-orange-400" strokeWidth={2.5} />
          <span className="text-[10px] font-bold text-orange-500 tracking-wide uppercase">창고</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-orange-600 block">창고 1</span>
            <NumberInput
              value={values.w1}
              onChange={v => set({ w1: v })}
              accent="focus:border-orange-400"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-orange-600 block">창고 2</span>
            <NumberInput
              value={values.w2}
              onChange={v => set({ w2: v })}
              accent="focus:border-orange-400"
            />
          </div>
        </div>
      </div>

      {/* 매장 섹션 */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin size={10} className="text-emerald-500" strokeWidth={2.5} />
          <span className="text-[10px] font-bold text-emerald-600 tracking-wide uppercase">매장</span>
        </div>
        <div className="space-y-2">
          {/* 매장 1 */}
          <div className="px-2.5 py-2 rounded-xl bg-emerald-50 border border-emerald-100 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-emerald-700 shrink-0">매장 1</span>
              <div className="flex-1 max-w-[80px]">
                <ZoneInput
                  value={values.s1z}
                  accentClass="text-emerald-600 focus:border-emerald-400"
                  placeholder="구역"
                  onChange={v => set({ s1z: v })}
                />
              </div>
            </div>
            <NumberInput
              value={values.s1}
              onChange={v => set({ s1: v })}
              accent="focus:border-emerald-400"
            />
          </div>
          {/* 매장 2 */}
          <div className="px-2.5 py-2 rounded-xl bg-emerald-50 border border-emerald-100 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-emerald-700 shrink-0">매장 2</span>
              <div className="flex-1 max-w-[80px]">
                <ZoneInput
                  value={values.s2z}
                  accentClass="text-emerald-600 focus:border-emerald-400"
                  placeholder="구역"
                  onChange={v => set({ s2z: v })}
                />
              </div>
            </div>
            <NumberInput
              value={values.s2}
              onChange={v => set({ s2: v })}
              accent="focus:border-emerald-400"
            />
          </div>
          {/* 매장 3 */}
          <div className="px-2.5 py-2 rounded-xl bg-emerald-50 border border-emerald-100 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-emerald-700 shrink-0">매장 3</span>
              <div className="flex-1 max-w-[80px]">
                <ZoneInput
                  value={values.s3z}
                  accentClass="text-emerald-600 focus:border-emerald-400"
                  placeholder="구역"
                  onChange={v => set({ s3z: v })}
                />
              </div>
            </div>
            <NumberInput
              value={values.s3}
              onChange={v => set({ s3: v })}
              accent="focus:border-emerald-400"
            />
          </div>
        </div>
      </div>

      {/* 합계 */}
      <div className="px-3 py-2.5 rounded-xl bg-violet-600 flex items-center justify-between">
        <span className="text-[11px] font-bold text-violet-100">합계 (창고 + 매장)</span>
        <span className="tabular-nums text-[15px] font-black text-white">{total}</span>
      </div>

      {/* 저장 버튼 (옵션) */}
      {showSaveButton && onSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="w-full h-10 rounded-xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-[13px] font-bold transition-colors disabled:opacity-60 cursor-pointer"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      )}
    </div>
  );
};

export default InventoryEditPanel;
