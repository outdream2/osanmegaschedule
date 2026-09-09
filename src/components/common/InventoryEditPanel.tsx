// src/components/common/InventoryEditPanel.tsx
// 실재고 입력 패널 · 창고1/창고2/매장1/매장2/매장3 누적(add) 방식
// 각 zone: 현재값(readonly) + 추가수량(delta input) + zone별 [저장] 버튼
// 매장 zone: 구역 라벨 편집 가능 유지

import React, { useState, useEffect } from "react";
import { Package, MapPin } from "lucide-react";
import { Card } from "./Card";
import { TEXT } from "@/styles/tokens";
// 2026-09-08 · 매장 zone 저장 시 · 상세위치(3자리) 함께 입력·저장
import { ShelfPositionInput } from "./ShelfPositionInput";
import type { ShelfPositions } from "../../lib/shelfPositions";

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
  /** 2026-09-08 · 위치별 상세 진열위치 (3자리 · 매장 필수) · JSONB · key=storage_location code */
  shelf_positions?: ShelfPositions | null;
}

export interface InventoryEditPanelProps {
  productCode: string;
  productName: string;
  currentValues: CurrentValues;
  /** zone 별 저장 콜백 · newTotal = current + delta · zone label 함께 전달
   *  2026-09-08 · shelfDetail (3자리) · 매장 zone 저장 시 · 상세위치 병합 저장
   */
  onSaveZone: (
    zone: ZoneKey,
    newTotal: number,
    zoneLabel?: string | null,
    shelfDetail?: string | null,
  ) => Promise<void>;
  savingZone?: ZoneKey | null;
  /** compact 모드 (패딩 최소화) */
  dense?: boolean;
  /** 2026-09-08 · 상세위치 실시간 중복 검증 · 상품의 진열구역 · 있으면 ShelfPositionInput 에 전달 */
  displayLocation?: string | null;
}

// 2026-09-08 · zone code → storage_location code 매핑
const ZONE_TO_LOCATION: Record<ZoneKey, string> = {
  w1: "warehouse1",
  w2: "warehouse2",
  s1: "store1",
  s2: "store2",
  s3: "store3",
};

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
  value, onChange, disabled = false, accent = "focus:border-brand-deep",
}) => {
  const cur = value === "" ? 0 : Math.max(0, Number(value) || 0);
  const dec = () => {
    if (disabled) return;
    const n = Math.max(0, cur - 1);
    onChange(n);
  };
  const inc = () => { if (disabled) return; onChange(cur + 1); };
  return (
    <div className={`inline-flex items-stretch w-full h-9 bg-white border border-line rounded-lg overflow-hidden transition ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <button
        type="button"
        onClick={dec}
        disabled={disabled || cur <= 0}
        className={`w-7 shrink-0 text-zinc-500 hover:bg-zinc-100 hover:text-rose-600 active:bg-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500 ${TEXT.tab} flex items-center justify-center cursor-pointer border-r border-line`}
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
        className={`flex-1 min-w-0 h-full text-center px-1 bg-transparent border-0 text-[15px] font-bold tabular-nums focus:outline-none disabled:text-zinc-300 ${accent}`}
      />
      <button
        type="button"
        onClick={inc}
        disabled={disabled}
        className={`w-7 shrink-0 text-zinc-500 hover:bg-zinc-100 hover:text-emerald-600 active:bg-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500 ${TEXT.tab} flex items-center justify-center cursor-pointer border-l border-line`}
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
    lang="ko" type="text"
    value={value ?? ""}
    onChange={e => onChange(e.target.value.trim() === "" ? null : e.target.value)}
    placeholder={placeholder}
    className={`w-full h-5 text-center px-1 bg-transparent border-0 border-b border-dashed border-line
      text-[12px] font-bold tabular-nums outline-none transition placeholder:text-zinc-300 ${accentClass}`}
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
  // 2026-09-08 · 창고 상세위치 (선택 · optional) · shelfDetail null → 미표시
  shelfDetail?: string | null;
  onShelfDetailChange?: (v: string | null) => void;
  // 2026-09-08 · 실시간 중복 검증 · 3개 다 있으면 활성
  productCode?: string;
  displayLocation?: string | null;
  storageKey?: string;
}
const ZoneRow: React.FC<ZoneRowProps> = ({
  label, current, delta, onDeltaChange, onSave, saving, accent,
  shelfDetail, onShelfDetailChange,
  productCode, displayLocation, storageKey,
}) => {
  const d = delta === "" ? 0 : Number(delta);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className={`text-[12px] font-semibold ${accent} block`}>{label}</span>
        <span className="text-[12px] text-zinc-400 tabular-nums">현재 <span className="font-bold text-zinc-700">{current}</span></span>
      </div>
      {onShelfDetailChange && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-zinc-500 shrink-0 w-14">상세위치</span>
          <ShelfPositionInput
            value={shelfDetail ?? null}
            onChange={onShelfDetailChange}
            compact
            productCode={productCode}
            displayLocation={displayLocation}
            storageKey={storageKey}
          />
        </div>
      )}
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
          className="h-9 px-2.5 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[13px] font-bold transition-colors disabled:opacity-40 cursor-pointer shrink-0"
        >
          {saving ? "…" : "+저장"}
        </button>
      </div>
      {d > 0 && (
        <div className="text-[12px] text-zinc-400 text-right tabular-nums">
          저장 후: <span className="font-bold text-violet-700">{current + d}</span>
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
  // 2026-09-08 · 상세 진열위치 (3자리) · 매장 필수
  shelfDetail: string | null;
  onShelfDetailChange: (v: string | null) => void;
  shelfRequired: boolean;
}
const StoreZoneRow: React.FC<StoreZoneRowProps> = ({
  label, current, delta, onDeltaChange, onSave, saving, accent,
  zoneLabel, onZoneLabelChange,
  shelfDetail, onShelfDetailChange, shelfRequired,
  productCode, displayLocation, storageKey,
}) => {
  const d = delta === "" ? 0 : Number(delta);
  return (
    <Card variant="flat" bg="bg-emerald-50" borderColor="border-emerald-100" rounded="xl" padding="none" className="px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-emerald-700 shrink-0">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-zinc-400 tabular-nums">현재 <span className="font-bold text-zinc-700">{current}</span></span>
          <div className="max-w-[80px]">
            <ZoneInput
              value={zoneLabel}
              accentClass="text-emerald-600 focus:border-brand-deep"
              placeholder="구역"
              onChange={onZoneLabelChange}
            />
          </div>
        </div>
      </div>
      {/* 2026-09-08 · 상세 진열위치 (3자리) · 매장 필수 · 저장 시 함께 반영 · 실시간 중복 검증 */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-emerald-700 shrink-0 w-14">상세위치</span>
        <ShelfPositionInput
          value={shelfDetail}
          onChange={onShelfDetailChange}
          required={shelfRequired}
          compact
          productCode={productCode}
          displayLocation={displayLocation}
          storageKey={storageKey}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1">
          <DeltaInput
            value={delta}
            onChange={onDeltaChange}
            disabled={saving}
            accent="focus:border-brand-deep"
          />
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || d <= 0}
          className="h-9 px-2.5 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[13px] font-bold transition-colors disabled:opacity-40 cursor-pointer shrink-0"
        >
          {saving ? "…" : "+저장"}
        </button>
      </div>
      {d > 0 && (
        <div className="text-[12px] text-zinc-400 text-right tabular-nums">
          저장 후: <span className="font-bold text-violet-700">{current + d}</span>
        </div>
      )}
    </Card>
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
  displayLocation,
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

  // 2026-09-08 · 위치별 상세 진열위치 (3자리) · 저장 시 함께 반영
  const initialShelf = (currentValues.shelf_positions ?? {}) as ShelfPositions;
  const [shelfDetails, setShelfDetails] = useState<Record<ZoneKey, string | null>>({
    w1: (initialShelf[ZONE_TO_LOCATION.w1] as string | null | undefined) ?? null,
    w2: (initialShelf[ZONE_TO_LOCATION.w2] as string | null | undefined) ?? null,
    s1: (initialShelf[ZONE_TO_LOCATION.s1] as string | null | undefined) ?? null,
    s2: (initialShelf[ZONE_TO_LOCATION.s2] as string | null | undefined) ?? null,
    s3: (initialShelf[ZONE_TO_LOCATION.s3] as string | null | undefined) ?? null,
  });

  // currentValues 가 바뀌면 (부모가 저장 성공 후 업데이트) zone labels + shelf 동기화
  useEffect(() => {
    setZones({
      s1z: currentValues.s1z,
      s2z: currentValues.s2z,
      s3z: currentValues.s3z,
    });
  }, [currentValues.s1z, currentValues.s2z, currentValues.s3z]);

  useEffect(() => {
    const sp = (currentValues.shelf_positions ?? {}) as ShelfPositions;
    setShelfDetails({
      w1: (sp[ZONE_TO_LOCATION.w1] as string | null | undefined) ?? null,
      w2: (sp[ZONE_TO_LOCATION.w2] as string | null | undefined) ?? null,
      s1: (sp[ZONE_TO_LOCATION.s1] as string | null | undefined) ?? null,
      s2: (sp[ZONE_TO_LOCATION.s2] as string | null | undefined) ?? null,
      s3: (sp[ZONE_TO_LOCATION.s3] as string | null | undefined) ?? null,
    });
  }, [currentValues.shelf_positions]);

  const setDelta = (zone: ZoneKey, v: number | "") =>
    setDeltas(prev => ({ ...prev, [zone]: v }));

  const setShelf = (zone: ZoneKey, v: string | null) =>
    setShelfDetails(prev => ({ ...prev, [zone]: v }));

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
    // 2026-09-08 · 매장 zone (s1·s2·s3) · 상세위치 필수 · 3자리 검증
    const isStore = zone === "s1" || zone === "s2" || zone === "s3";
    const shelfDetail = shelfDetails[zone];
    if (isStore && (!shelfDetail || shelfDetail.length !== 3)) {
      // 부모 onSaveZone 에서 에러 toast 처리 · 여기선 alert 대신 window event 로 검증 실패 알림
      // 실제는 alert 로 간단 처리 (모달 컨텍스트 · confirm 훅 없음)
      alert(`${label(zone)} 위치는 상세위치가 필수입니다 (3자리 · 예 332)`);
      return;
    }
    await onSaveZone(zone, newTotal, zoneLabel, shelfDetail);
    resetDelta(zone);
  };

  const label = (zone: ZoneKey): string => (
    zone === "w1" ? "창고1" : zone === "w2" ? "창고2" :
    zone === "s1" ? "매장1" : zone === "s2" ? "매장2" : "매장3"
  );

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
      <div className="flex items-start gap-2.5 pb-2 border-b border-zinc-100">
        <div className="w-7 h-7 rounded-lg bg-brand-tint flex items-center justify-center shrink-0">
          <Package size={13} className="text-violet-600" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-zinc-800 leading-snug break-words">{productName || productCode}</div>
          <div className="text-[12px] text-zinc-400 font-mono mt-0.5">{productCode}</div>
        </div>
      </div>

      {/* 창고 섹션 */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Package size={10} className="text-orange-400" strokeWidth={2.5} />
          <span className="text-[12px] font-bold text-orange-500 tracking-wide uppercase">창고</span>
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
            shelfDetail={shelfDetails.w1}
            onShelfDetailChange={v => setShelf("w1", v)}
            productCode={productCode}
            displayLocation={displayLocation}
            storageKey={ZONE_TO_LOCATION.w1}
          />
          <ZoneRow
            label="창고 2"
            current={currentValues.w2}
            delta={deltas.w2}
            onDeltaChange={v => setDelta("w2", v)}
            onSave={() => handleSave("w2")}
            saving={savingZone === "w2"}
            accent="text-orange-600"
            shelfDetail={shelfDetails.w2}
            onShelfDetailChange={v => setShelf("w2", v)}
            productCode={productCode}
            displayLocation={displayLocation}
            storageKey={ZONE_TO_LOCATION.w2}
          />
        </div>
      </div>

      {/* 매장 섹션 */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin size={10} className="text-emerald-500" strokeWidth={2.5} />
          <span className="text-[12px] font-bold text-emerald-600 tracking-wide uppercase">매장</span>
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
            shelfDetail={shelfDetails.s1}
            onShelfDetailChange={v => setShelf("s1", v)}
            shelfRequired
            productCode={productCode}
            displayLocation={displayLocation}
            storageKey={ZONE_TO_LOCATION.s1}
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
            shelfDetail={shelfDetails.s2}
            onShelfDetailChange={v => setShelf("s2", v)}
            shelfRequired
            productCode={productCode}
            displayLocation={displayLocation}
            storageKey={ZONE_TO_LOCATION.s2}
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
            shelfDetail={shelfDetails.s3}
            onShelfDetailChange={v => setShelf("s3", v)}
            shelfRequired
            productCode={productCode}
            displayLocation={displayLocation}
            storageKey={ZONE_TO_LOCATION.s3}
          />
        </div>
      </div>

      {/* 합계 (현재 + 미저장 delta 합산 미리보기) */}
      <div className="px-3 py-2.5 rounded-xl bg-brand-deep flex items-center justify-between">
        <span className="text-[13px] font-bold text-violet-100">
          합계 (현재{totalDelta > 0 ? ` + 추가 ${totalDelta}` : ""})
        </span>
        <span className="tabular-nums text-[15px] font-bold text-white">
          {totalCurrent}{totalDelta > 0 ? ` → ${totalCurrent + totalDelta}` : ""}
        </span>
      </div>
    </div>
  );
};

export default InventoryEditPanel;
