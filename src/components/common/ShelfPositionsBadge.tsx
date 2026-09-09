// src/components/common/ShelfPositionsBadge.tsx
// 2026-09-08 · 상세 진열위치 표시 (읽기 전용)
// 2026-09-09 · 사용자 지시 · 배지 스타일 제거 · 순수 텍스트로
//   · 미입력 매장 · 빨간 텍스트 강조 유지 (기능적 시각 신호)
//   · 있는 위치 · brand-deep 텍스트 · 구분자 " · "
//   · 이름은 하위호환 유지 · 실제 렌더는 배지 아님

import React from "react";
import { formatShelfPositions, type ShelfPositions } from "../../lib/shelfPositions";
import { useStorageLocations } from "../../hooks/useStorageLocations";

export interface ShelfPositionsBadgeProps {
  positions: ShelfPositions | null | undefined;
  size?: "sm" | "md";       // sm · 리스트 · md · 상세 패널
  /** 2026-09-09 · 매장구역 UI 스타일 상속 · 사용자 지시 · 색만 다르게
   *  · "text" · 매장구역이 텍스트인 곳 (기본)
   *  · "badge" · 매장구역이 배지인 곳 · 같은 pill 스타일 · 색만 rose 계열 */
  variant?: "text" | "badge";
  className?: string;
}

export const ShelfPositionsBadge: React.FC<ShelfPositionsBadgeProps> = ({ positions, size = "sm", variant = "text", className = "" }) => {
  const locations = useStorageLocations();
  if (!locations.length) return null;
  const list = formatShelfPositions(positions, locations);
  if (list.length === 0) return null;

  const sizeCls = size === "md" ? "text-[14px]" : "text-[13px]";

  // 2026-09-09 · badge variant · 매장구역 pill 스타일과 동일 크기 · 색상만 로즈 계열
  if (variant === "badge") {
    const chipBase = size === "md"
      ? "text-[13px] px-2 py-0.5 rounded-md font-semibold tabular-nums"
      : "text-[12px] px-1.5 py-0.5 rounded font-semibold tabular-nums";
    return (
      <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
        {list.map(p => (
          <span
            key={p.code}
            className={`${chipBase} ${
              p.isMissing
                ? "bg-rose-50 text-rose-700 border border-rose-200"
                : p.detail
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : "bg-zinc-50 text-zinc-500 border border-zinc-200"
            }`}
            title={p.detail ? `${p.name} · ${p.detail}` : p.isMissing ? `${p.name} · 상세위치 미입력` : p.name}
          >
            <span className="opacity-70 mr-0.5 font-medium">{p.name}</span>
            {p.detail ? p.detail : p.isMissing ? "미입력" : ""}
          </span>
        ))}
      </span>
    );
  }

  // text variant · 기본 · 인라인 텍스트 · " · " 구분자
  return (
    <span className={`inline-flex flex-wrap items-baseline ${sizeCls} ${className}`}>
      {list.map((p, idx) => (
        <React.Fragment key={p.code}>
          {idx > 0 && <span className="text-zinc-300 mx-1">·</span>}
          <span
            className={
              p.isMissing
                ? "text-rose-600 font-semibold tabular-nums"
                : p.detail
                  ? "text-rose-600 font-semibold tabular-nums"
                  : "text-ink-soft font-medium tabular-nums"
            }
            title={p.detail ? `${p.name} · ${p.detail}` : p.isMissing ? `${p.name} · 상세위치 미입력` : p.name}
          >
            <span className="text-zinc-500 font-medium mr-0.5">{p.name}</span>
            {p.detail ? p.detail : p.isMissing ? <span className="text-rose-500">미입력</span> : ""}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
};

export default ShelfPositionsBadge;
