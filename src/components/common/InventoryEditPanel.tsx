// src/components/common/InventoryEditPanel.tsx
// 실재고 입력 패널 · 창고1/창고2/매장1/매장2/매장3 누적(add) 방식
// 각 zone: 현재값(readonly) + 추가수량(delta input) + zone별 [저장] 버튼
// 매장 zone: 구역 라벨 편집 가능 유지

import React, { useState, useEffect } from "react";
import { Package, MapPin } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types (InventoryValues 는 backwards compat 용 export 유지)
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

export type ZoneKey = "w1" | "w2" | "s1" | "s2" | "s3";

export interface CurrentValues {
  w1: number;
  w2: number;
  s1: number;
  s2: number;
  s3: number;
  s1z: string | null;
  s2z: string | null;
  s3z: string | null;
}

export interface InventoryEditPanelProps {
  productCode: string;
  productName: string;
  currentValues: CurrentValues;
  /** zone 별 저장 콜백 · newTotal = current + delta · zone label 함께 전달 */
  onSaveZone: (
    zone: ZoneKey,
    newTotal: number,
    zoneLabel?: string | null,
  ) => Promise<void>;
  savingZone?: ZoneKey | null;
  /** compact 모드 (패딩 최소화) */
  dense?: boolean;
}

type Deltas = Record<ZoneKey, number | "">;

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
interface DeltaInputProps {
  value: number | "";
  onChange: (v: number | "") => void;
  disabled?: boolean;
  accent?: string;
}
const DeltaInput: React.FC<DeltaInputProps> = ({
  value, onChange, disabled = false, accent = "focus:border-teal-400",
}) => {
  const cur = value === "" ? 0 : Math.max(0, Number(value) || 0);
  const dec = () => {
    if (disabled) return;
    const n = Math.max(0, cur - 1);
    onChange(n);
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
        min={0}
        disabled={disabled}
        onChange={e => {
          const n = e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0);
          onChange(n);
        }}
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
// ZoneRow — 창고용 (현재 + delta + 저장 버튼)
// ─────────────────────────────────────────────────────────────
interface ZoneRowProps {
  label: string;
  current: number;
  delta: number | "";
  onDeltaChange: (v: number | "") => void;
  onSave: () => void;
  saving: boolean;
  accent: string;
}
const ZoneRow: React.FC<ZoneRowProps> = ({
  label, current, delta, onDeltaChange, onSave, saving, accent,
}) => {
  const d = delta === "" ? 0 : Number(delta);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className={`text-[10px] font-semibold ${accent} block`}>{label}</span>
        <span className="text-[10px] text-slate-400 tabular-nums">현재 <span className="font-black text-slate-700">{current}</span></span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1">
          <DeltaInput
            value={delta}
            onChange={onDeltaChange}
            disabled={saving}
            accent={`focus:border-${accent.includes("orange") ? "orange" : "teal"}-400`}
          />
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || d <= 0}
          className="h-9 px-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-[11px] font-bold transition-colors disabled:opacity-40 cursor-pointer shrink-0"
        >
          {saving ? "…" : "+저장"}
        </button>
      </div>
      {d > 0 && (
        <div className="text-[10px] text-slate-400 text-right tabular-nums">
          저장 후: <span className="font-black text-violet-700">{current + d}</span>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// StoreZoneRow — 매장용 (구역 편집 포함)
// ─────────────────────────────────────────────────────────────
interface StoreZoneRowProps extends ZoneRowProps {
  zoneLabel: string | null;
  onZoneLabelChange: (v: string | null) => void;
}
const StoreZoneRow: React.FC<StoreZoneRowProps> = ({
  label, current, delta, onDeltaChange, onSave, saving, accent,
  zoneLabel, onZoneLabelChange,
}) => {
  const d = delta === "" ? 0 : Number(delta);
  return (
    <div className="px-2.5 py-2 rounded-xl bg-emerald-50 border border-emerald-100 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-emerald-700 shrink-0">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 tabular-nums">현재 <span className="font-black text-slate-700">{current}</span></span>
          <div className="max-w-[80px]">
            <ZoneInput
              value={zoneLabel}
              accentClass="text-emerald-600 focus:border-emerald-400"
              placeholder="구역"
              onChange={onZoneLabelChange}
            />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1">
          <DeltaInput
            value={delta}
            onChange={onDeltaChange}
            disabled={saving}
            accent="focus:border-emerald-400"
          />
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || d <= 0}
          className="h-9 px-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-[11px] font-bold transition-colors disabled:opacity-40 cursor-pointer shrink-0"
        >
          {saving ? "…" : "+저장"}
        </button>
      </div>
      {d > 0 && (
        <div className="text-[10px] text-slate-400 text-right tabular-nums">
          저장 후: <span className="font-black text-violet-700">{current + d}</span>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// InventoryEditPanel
// ─────────────────────────────────────────────────────────────
const EMPTY_DELTAS: Deltas = { w1: "", w2: "", s1: "", s2: "", s3: "" };

export const InventoryEditPanel: React.FC<InventoryEditPanelProps> = ({
  productCode,
  productName,
  currentValues,
  onSaveZone,
  savingZone = null,
  dense = false,
}) => {
  const pad = dense ? "p-3 space-y-3" : "p-4 space-y-4";

  // delta per zone (로컬 state · 저장 성공 시 해당 zone 리셋)
  const [deltas, setDeltas] = useState<Deltas>(EMPTY_DELTAS);

  // 매장 구역 라벨 (로컬 편집 · zone 별 저장 시 함께 전달)
  const [zones, setZones] = useState({
    s1z: currentValues.s1z,
    s2z: currentValues.s2z,
    s3z: currentValues.s3z,
  });

  // currentValues 가 바뀌면 (부모가 저장 성공 후 업데이트) zone labels 동기화
  useEffect(() => {
    setZones({
      s1z: currentValues.s1z,
      s2z: currentValues.s2z,
      s3z: currentValues.s3z,
    });
  }, [currentValues.s1z, currentValues.s2z, currentValues.s3z]);

  const setDelta = (zone: ZoneKey, v: number | "") =>
    setDeltas(prev => ({ ...prev, [zone]: v }));

  const resetDelta = (zone: ZoneKey) =>
    setDeltas(prev => ({ ...prev, [zone]: "" }));

  const handleSave = async (zone: ZoneKey) => {
    const d = deltas[zone];
    const delta = d === "" ? 0 : Number(d);
    if (delta <= 0) return;
    const current = currentValues[zone];
    const newTotal = current + delta;
    const zoneLabel =
      zone === "s1" ? zones.s1z
      : zone === "s2" ? zones.s2z
      : zone === "s3" ? zones.s3z
      : undefined;
    await onSaveZone(zone, newTotal, zoneLabel);
    resetDelta(zone);
  };

  // 합계: 현재 + 미저장 delta 합산
  const totalCurrent = currentValues.w1 + currentValues.w2 + currentValues.s1 + currentValues.s2 + currentValues.s3;
  const totalDelta =
    (deltas.w1 === "" ? 0 : Number(deltas.w1)) +
    (deltas.w2 === "" ? 0 : Number(deltas.w2)) +
    (deltas.s1 === "" ? 0 : Number(deltas.s1)) +
    (deltas.s2 === "" ? 0 : Number(deltas.s2)) +
    (deltas.s3 === "" ? 0 : Number(deltas.s3));

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
          <ZoneRow
            label="창고 1"
            current={currentValues.w1}
            delta={deltas.w1}
            onDeltaChange={v => setDelta("w1", v)}
            onSave={() => handleSave("w1")}
            saving={savingZone === "w1"}
            accent="text-orange-600"
          />
          <ZoneRow
            label="창고 2"
            current={currentValues.w2}
            delta={deltas.w2}
            onDeltaChange={v => setDelta("w2", v)}
            onSave={() => handleSave("w2")}
            saving={savingZone === "w2"}
            accent="text-orange-600"
          />
        </div>
      </div>

      {/* 매장 섹션 */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin size={10} className="text-emerald-500" strokeWidth={2.5} />
          <span className="text-[10px] font-bold text-emerald-600 tracking-wide uppercase">매장</span>
        </div>
        <div className="space-y-2">
          <StoreZoneRow
            label="매장 1"
            current={currentValues.s1}
            delta={deltas.s1}
            onDeltaChange={v => setDelta("s1", v)}
            onSave={() => handleSave("s1")}
            saving={savingZone === "s1"}
            accent="text-emerald-600"
            zoneLabel={zones.s1z}
            onZoneLabelChange={v => setZones(z => ({ ...z, s1z: v }))}
          />
          <StoreZoneRow
            label="매장 2"
            current={currentValues.s2}
            delta={deltas.s2}
            onDeltaChange={v => setDelta("s2", v)}
            onSave={() => handleSave("s2")}
            saving={savingZone === "s2"}
            accent="text-emerald-600"
            zoneLabel={zones.s2z}
            onZoneLabelChange={v => setZones(z => ({ ...z, s2z: v }))}
          />
          <StoreZoneRow
            label="매장 3"
            current={currentValues.s3}
            delta={deltas.s3}
            onDeltaChange={v => setDelta("s3", v)}
            onSave={() => handleSave("s3")}
            saving={savingZone === "s3"}
            accent="text-emerald-600"
            zoneLabel={zones.s3z}
            onZoneLabelChange={v => setZones(z => ({ ...z, s3z: v }))}
          />
        </div>
      </div>

      {/* 합계 (현재 + 미저장 delta 합산 미리보기) */}
      <div className="px-3 py-2.5 rounded-xl bg-violet-600 flex items-center justify-between">
        <span className="text-[11px] font-bold text-violet-100">
          합계 (현재{totalDelta > 0 ? ` + 추가 ${totalDelta}` : ""})
        </span>
        <span className="tabular-nums text-[15px] font-black text-white">
          {totalCurrent}{totalDelta > 0 ? ` → ${totalCurrent + totalDelta}` : ""}
        </span>
      </div>
    </div>
  );
};

export default InventoryEditPanel;
