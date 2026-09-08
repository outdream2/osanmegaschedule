// src/components/common/ShelfPositionsBadge.tsx
// 2026-09-08 · 상세 진열위치 표시 뱃지 (읽기 전용)
//   · 진열위치 표시하는 32개 파일 공통 · 위치별 리스트 뱃지
//   · 매장 미입력 · 빨간 강조 · 관리자 눈에 즉시 띄게
//   · storage_locations 는 useStorageLocations() 훅으로 조회

import React from "react";
import { formatShelfPositions, type ShelfPositions } from "../../lib/shelfPositions";
import { useStorageLocations } from "../../hooks/useStorageLocations";

export interface ShelfPositionsBadgeProps {
  positions: ShelfPositions | null | undefined;
  size?: "sm" | "md";       // sm · 리스트 · md · 상세 패널
  className?: string;
}

export const ShelfPositionsBadge: React.FC<ShelfPositionsBadgeProps> = ({ positions, size = "sm", className = "" }) => {
  const locations = useStorageLocations();
  if (!locations.length) return null;
  const list = formatShelfPositions(positions, locations);
  if (list.length === 0) return null;

  const chipCls = size === "md"
    ? "text-[12px] px-2 py-0.5 rounded-md"
    : "text-[11px] px-1.5 py-0.5 rounded";
  const gapCls = size === "md" ? "gap-1.5" : "gap-1";

  return (
    <span className={`inline-flex flex-wrap items-center ${gapCls} ${className}`}>
      {list.map(p => (
        <span
          key={p.code}
          className={`${chipCls} font-medium tabular-nums ${
            p.isMissing
              ? "bg-rose-50 text-rose-600 border border-rose-200"
              : p.detail
                ? "bg-brand-tint text-brand-deep border border-brand-tint"
                : "bg-zinc-100 text-ink-soft border border-zinc-200"
          }`}
          title={p.detail ? `${p.name} · ${p.detail}` : p.isMissing ? `${p.name} · 상세위치 미입력` : p.name}
        >
          <span className="opacity-70 mr-0.5">{p.name}</span>
          {p.detail ? p.detail : p.isMissing ? "미입력" : ""}
        </span>
      ))}
    </span>
  );
};

export default ShelfPositionsBadge;
