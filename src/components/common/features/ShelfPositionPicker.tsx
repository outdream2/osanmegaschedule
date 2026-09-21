// src/components/common/features/ShelfPositionPicker.tsx
// 2026-09-21 · #319 · 공통 ShelfPositionPicker 컴포넌트 추출
//   · ProductCreateModal.ShelfPositionSection 에서 추출 · 기능 1:1 보존
//   · useStorageLocations 기반 · store1/2/3 + warehouse1/2 5-slot 그리드
//   · visibleSlots 로 슬롯 표시 제어 · compact · disabled prop 지원

import React from "react";
import { MapPin } from "lucide-react";
import { ShelfPositionInput } from "../ShelfPositionInput";
import { useStorageLocations } from "../../../hooks/useStorageLocations";
import { classifyArrivalSlot } from "../../../lib/warehouseZoneMap";

// ─── 타입 ────────────────────────────────────────────────────────────────────

export interface ShelfPositionsValue {
  warehouse1?: string | null;
  warehouse2?: string | null;
  store1?: string | null;
  store2?: string | null;
  store3?: string | null;
}

export interface ShelfPositionPickerProps {
  value: ShelfPositionsValue;
  onChange: (next: ShelfPositionsValue) => void;
  /** ERP 위치 코드 (예: "26") · classifyArrivalSlot 으로 창고1/창고2 자동 판정 */
  productLocation?: string | null;
  /** 분류 코드 · 창고1 자동 매핑 (warehouseZones.WAREHOUSE_1_CODES) */
  categoryCode?: string | null;
  /** 표시할 슬롯 강제 지정 · 미지정 시 productLocation 기반 자동 결정 */
  visibleSlots?: ReadonlySet<"warehouse1" | "warehouse2" | "store1" | "store2" | "store3">;
  disabled?: boolean;
  /** 좁은 폭 · 세로 스택 레이아웃 */
  compact?: boolean;
  showLabels?: boolean;
  /** 실시간 중복 검증용 · 상품코드 */
  productCode?: string;
}

// ─── ShelfPositionPicker ──────────────────────────────────────────────────────

export const ShelfPositionPicker: React.FC<ShelfPositionPickerProps> = ({
  value,
  onChange,
  productLocation,
  productCode,
  visibleSlots,
  disabled = false,
  compact = false,
}) => {
  const storageLocations = useStorageLocations();

  // 창고 슬롯: visibleSlots 지정 시 그대로 · 없으면 productLocation 기반 자동 결정
  const warehouseSlot: "warehouse1" | "warehouse2" | null = (() => {
    if (visibleSlots) {
      if (visibleSlots.has("warehouse1")) return "warehouse1";
      if (visibleSlots.has("warehouse2")) return "warehouse2";
      return null;
    }
    if (!productLocation) return null;
    const slot = classifyArrivalSlot(productLocation);
    if (slot === "w1") return "warehouse1";
    if (slot === "w2") return "warehouse2";
    return null;
  })();

  // 매장 슬롯: visibleSlots 지정 시 필터 · 없으면 store1 기본 포함
  const defaultStoreSlots: Array<"store1" | "store2" | "store3"> = ["store1"];
  const storeSlots: Array<"store1" | "store2" | "store3"> = visibleSlots
    ? (["store1", "store2", "store3"] as const).filter(s => visibleSlots.has(s))
    : defaultStoreSlots;

  // 추가 가능한 매장 슬롯 (store1 기본 · store2/3 추가 버튼)
  const [extraStores, setExtraStores] = React.useState<Array<"store2" | "store3">>([]);
  const allStoreSlots = visibleSlots
    ? storeSlots
    : (["store1", ...extraStores] as Array<"store1" | "store2" | "store3">);
  const availableExtraStores = (["store2", "store3"] as const).filter(s => !extraStores.includes(s));

  const getLocInfo = (code: string) => storageLocations.find(l => l.code === code);

  const handleSlotChange = (code: string, val: string | null) => {
    onChange({ ...value, [code]: val });
  };

  const wrapCls = compact ? "flex flex-col gap-2" : "flex flex-wrap gap-3 pt-1";

  return (
    <div className="col-span-full">
      <div className="flex items-center gap-1.5 mb-2">
        <MapPin size={14} className="text-ink-soft" />
        <span className="text-[15px] font-semibold text-ink tracking-tight">상세구역</span>
        <span className="text-[13px] text-ink-soft">(층·칸·순서 3자리 · 예: 332)</span>
      </div>
      <div className={wrapCls}>
        {/* 창고 슬롯 */}
        {warehouseSlot && (() => {
          const loc = getLocInfo(warehouseSlot);
          if (!loc?.active) return null;
          return (
            <ShelfPositionInput
              key={warehouseSlot}
              label={loc.name}
              required={false}
              value={value[warehouseSlot] ?? null}
              onChange={(v) => handleSlotChange(warehouseSlot, v)}
              disabled={disabled}
              productCode={productCode}
              displayLocation={productLocation}
              storageKey={warehouseSlot}
            />
          );
        })()}

        {/* 매장 슬롯 */}
        {allStoreSlots.map(code => {
          const loc = getLocInfo(code);
          if (!loc?.active) return null;
          return (
            <ShelfPositionInput
              key={code}
              label={loc.name}
              required={loc.required_detail}
              value={value[code] ?? null}
              onChange={(v) => handleSlotChange(code, v)}
              disabled={disabled}
              productCode={productCode}
              displayLocation={productLocation}
              storageKey={code}
            />
          );
        })}

        {/* 매장 추가 버튼 (visibleSlots 미지정 시만) */}
        {!visibleSlots && availableExtraStores.map(code => {
          const loc = getLocInfo(code);
          if (!loc?.active) return null;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setExtraStores(prev => [...prev, code])}
              disabled={disabled}
              className="h-9 px-3 rounded-lg border border-dashed border-brand-tint text-[14px] font-semibold text-brand-deep hover:bg-brand-tint/50 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-40"
            >
              + {loc.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ShelfPositionPicker;
