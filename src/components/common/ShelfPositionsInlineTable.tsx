// src/components/common/ShelfPositionsInlineTable.tsx
// 2026-09-09 · #15 · 매장 상세구역 / 창고 상세구역 2열 grid 인라인 표
//   · storage_locations 기반 동적 · store/warehouse 자동 분류
//   · 매장이 추가되어도 자동 대응 (매장4·5 등)
//   · 클릭 시 · ShelfPositionsEditModal 열기 (전 위치 편집)

import React, { useMemo, useState } from "react";
import { useStorageLocations } from "../../hooks/useStorageLocations";
import { ShelfPositionsEditModal } from "./ShelfPositionsEditModal";
import type { ShelfPositions } from "../../lib/shelfPositions";

export interface ShelfPositionsInlineTableProps {
  productCode: string;
  productName?: string;
  displayLocation?: string | null;
  shelfPositions?: ShelfPositions | null;
  /** 컨테이너 className · 예: 상단 border-t 등 */
  className?: string;
  /** 라벨 폰트 크기 (13 or 12) */
  labelSize?: "sm" | "md";
}

export const ShelfPositionsInlineTable: React.FC<ShelfPositionsInlineTableProps> = ({
  productCode, productName, displayLocation, shelfPositions, className = "", labelSize = "sm",
}) => {
  const locations = useStorageLocations();
  // 2026-09-09 · 사용자 지시 · 매장 클릭 → 매장만 · 창고 클릭 → 창고만
  const [openKind, setOpenKind] = useState<"store" | "warehouse" | null>(null);

  const { storeParts, warehouseParts } = useMemo(() => {
    const store: string[] = [];
    const warehouse: string[] = [];
    for (const loc of locations) {
      if (!loc.active) continue;
      const v = shelfPositions?.[loc.code];
      if (typeof v === "string" && v.length === 3) {
        if (loc.kind === "store") store.push(v);
        else warehouse.push(v);
      }
    }
    return { storeParts: store, warehouseParts: warehouse };
  }, [locations, shelfPositions]);

  const storeEmpty = storeParts.length === 0;
  const warehouseEmpty = warehouseParts.length === 0;
  // 2026-09-09 · 사용자 지시 · 라벨 +2 · sm 14 · md 15
  const labelCls = labelSize === "md"
    ? "text-[15px] font-bold text-zinc-500 tracking-tight uppercase"
    : "text-[14px] font-bold text-zinc-500 tracking-tight uppercase";

  return (
    <>
      <div className={`grid grid-cols-2 gap-x-4 gap-y-2 items-start ${className}`}>
        <div className="flex flex-col gap-1 min-w-0">
          <span className={labelCls}>매장 상세구역</span>
          <button
            type="button"
            onClick={() => setOpenKind("store")}
            className={[
              "text-[14px] tabular-nums tracking-tight cursor-pointer transition rounded px-1.5 py-0.5 text-left hover:bg-indigo-50 self-start",
              storeEmpty ? "text-zinc-400 font-medium" : "text-indigo-700 font-semibold",
            ].join(" ")}
            title="매장 상세구역 편집"
          >
            {storeEmpty ? "비어있음" : storeParts.join(" · ")}
          </button>
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <span className={labelCls}>창고 상세구역</span>
          <button
            type="button"
            onClick={() => setOpenKind("warehouse")}
            className={[
              "text-[14px] tabular-nums tracking-tight cursor-pointer transition rounded px-1.5 py-0.5 text-left hover:bg-cyan-50 self-start",
              warehouseEmpty ? "text-zinc-400 font-medium" : "text-cyan-700 font-semibold",
            ].join(" ")}
            title="창고 상세구역 편집"
          >
            {warehouseEmpty ? "비어있음" : warehouseParts.join(" · ")}
          </button>
        </div>
      </div>

      {openKind && (
        <ShelfPositionsEditModal
          productCode={productCode}
          productName={productName}
          displayLocation={displayLocation ?? null}
          initial={shelfPositions}
          kindFilter={openKind}
          onClose={() => setOpenKind(null)}
        />
      )}
    </>
  );
};

export default ShelfPositionsInlineTable;
