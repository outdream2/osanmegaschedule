// src/components/DisplayPage/ZoneCell.tsx
import React, { useRef } from "react";
import type { ZoneSection } from "../../constants/displayZones";

// ─── Types (shared with DisplayPage) ──────────────────────────────────────────
type ZoneStatus = "normal" | "low" | "empty";

interface DisplayZone {
  id: string;
  num: number;
  label: string;
  category: string;
  section: ZoneSection;
  assignedStaffId: number | null;
  assignedStaffName: string;
  status: ZoneStatus;
  products: string;
}

// ─── Local helpers / palette (mirrors DisplayPage) ────────────────────────────
const statusDot = (s: ZoneStatus) =>
  ({ normal: "bg-emerald-500", low: "bg-amber-500", empty: "bg-red-500" }[s]);

const STAFF_AVATAR_COLORS = [
  "bg-violet-600 text-white",
  "bg-sky-600 text-white",
  "bg-rose-600 text-white",
  "bg-teal-600 text-white",
  "bg-orange-600 text-white",
  "bg-fuchsia-600 text-white",
];

export interface ZoneCellProps {
  zone: DisplayZone;
  onContextClick: (z: DisplayZone, rect: DOMRect) => void;
  onDetailClick: (z: DisplayZone) => void;
  className?: string;
  isPopoverOpen?: boolean;
  staffColorIndex?: number | null;
  isDragOver?: boolean;
  onDragOver?: (e: React.DragEvent, zone: DisplayZone) => void;
  onDrop?: (e: React.DragEvent, zone: DisplayZone) => void;
  onDragLeave?: () => void;
  showDetails?: boolean;
  isSearchedHighlight?: boolean;
  groupColor?: string;
  groupLabel?: string;
  configMode?: boolean;
  inSelectedGroup?: boolean;
  onConfigClick?: (zone: DisplayZone) => void;
}

export const ZoneCell: React.FC<ZoneCellProps> = ({
  zone, onContextClick, onDetailClick, className = "", isPopoverOpen, staffColorIndex,
  isDragOver, onDragOver, onDrop, onDragLeave, showDetails = false, isSearchedHighlight = false,
  groupColor, groupLabel, configMode = false, inSelectedGroup = false, onConfigClick,
}) => {
  const ref = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (configMode) {
      if (onConfigClick) onConfigClick(zone);
      return;
    }
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      onContextClick(zone, rect);
    }
  };

  const ringCls = isDragOver
    ? "ring-2 ring-emerald-500 ring-offset-1 shadow-lg z-10 scale-[1.04]"
    : isPopoverOpen
    ? "ring-2 ring-indigo-500 ring-offset-1 shadow-lg z-10"
    : isSearchedHighlight
    ? "ring-4 ring-emerald-500 animate-pulse scale-[1.05] z-10"
    : configMode && inSelectedGroup
    ? "shadow-lg scale-[1.05] z-10"
    : "";

  const configDimCls = configMode && !inSelectedGroup && !groupColor ? "opacity-60" : "";
  const configOtherGroupDimCls = configMode && !inSelectedGroup && groupColor ? "opacity-70" : "";

  const inlineStyle: React.CSSProperties = {};
  if (configMode && inSelectedGroup && groupColor) {
    inlineStyle.boxShadow = `0 0 0 3px ${groupColor}, 0 4px 10px ${groupColor}66`;
  }

  let statusCls = "bg-white text-gray-700 border-gray-300 hover:border-gray-400";
  if (zone.status === "low") {
    statusCls = "bg-amber-500 text-white border-amber-600 hover:bg-amber-600";
  } else if (zone.status === "empty") {
    statusCls = "bg-red-500 text-white border-red-650 hover:bg-red-600";
  } else {
    // Normal background color scheme based on sections / map definitions
    if (zone.section === "aisle") {
      // 각 pair (1-8) 동일 톤 · A=진한색 / B=연한색 (category.jpg 색상 반영)
      const aisleColorsAB: Record<number, { A: string; B: string }> = {
        1: {
          A: "bg-blue-600 text-white border-blue-700 hover:bg-blue-700",
          B: "bg-blue-300 text-blue-950 border-blue-400 hover:bg-blue-400",
        },
        2: {
          A: "bg-yellow-500 text-yellow-950 border-yellow-600 hover:bg-yellow-600",
          B: "bg-yellow-200 text-yellow-900 border-yellow-300 hover:bg-yellow-300",
        },
        3: {
          A: "bg-red-600 text-white border-red-700 hover:bg-red-700",
          B: "bg-red-300 text-red-950 border-red-400 hover:bg-red-400",
        },
        4: {
          A: "bg-pink-600 text-white border-pink-700 hover:bg-pink-700",
          B: "bg-pink-300 text-pink-950 border-pink-400 hover:bg-pink-400",
        },
        5: {
          A: "bg-lime-600 text-white border-lime-700 hover:bg-lime-700",
          B: "bg-lime-300 text-lime-950 border-lime-400 hover:bg-lime-400",
        },
        6: {
          A: "bg-sky-600 text-white border-sky-700 hover:bg-sky-700",
          B: "bg-sky-300 text-sky-950 border-sky-400 hover:bg-sky-400",
        },
        7: {
          A: "bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700",
          B: "bg-indigo-300 text-indigo-950 border-indigo-400 hover:bg-indigo-400",
        },
        8: {
          A: "bg-purple-600 text-white border-purple-700 hover:bg-purple-700",
          B: "bg-purple-300 text-purple-950 border-purple-400 hover:bg-purple-400",
        },
      };
      const pair = aisleColorsAB[zone.num];
      if (pair) {
        const isA = zone.id.endsWith("A");
        const isB = zone.id.endsWith("B");
        statusCls = isA ? pair.A : isB ? pair.B : pair.A;
      } else {
        statusCls = "bg-white text-slate-700 border-slate-300 hover:border-slate-400";
      }
    } else if (zone.num === 36) {
      statusCls = "bg-blue-50 text-blue-900 border-blue-300 hover:bg-blue-100 hover:border-blue-400";
    } else if (zone.num === 37) {
      statusCls = "bg-[#fef08a] text-amber-950 border-yellow-400 hover:bg-yellow-100 hover:border-yellow-500";
    } else if (zone.num === 38) {
      statusCls = "bg-orange-500 text-white border-orange-600 hover:bg-orange-600";
    } else if (zone.num === 40) {
      statusCls = "bg-blue-500 text-white border-blue-600 hover:bg-blue-600";
    } else if (zone.num === 39 || zone.num === 41) {
      statusCls = "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 hover:border-gray-400";
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        if (configMode) return;
        if (ref.current) onDetailClick(zone);
      }}
      onDragOver={onDragOver ? (e) => onDragOver(e, zone) : undefined}
      onDrop={onDrop ? (e) => onDrop(e, zone) : undefined}
      onDragLeave={onDragLeave}
      style={inlineStyle}
      className={`relative w-full rounded-lg border-2 transition-all duration-300 active:scale-[0.96] cursor-pointer flex flex-col font-bold shadow-sm overflow-hidden ${statusCls} ${ringCls} ${configDimCls} ${configOtherGroupDimCls} ${className}`}
    >
      {/* Group color strip */}
      {groupColor && (
        <span
          className="absolute top-0 left-0 right-0 h-[3px] pointer-events-none"
          style={{ backgroundColor: groupColor }}
        />
      )}

      {/* Row 1: 구역 번호 (A/B는 num+letter) + 상태 dot */}
      <div className="flex items-center justify-between px-1 pt-0.5 shrink-0">
        <span className="text-[11px] font-black leading-none">
          {zone.num}
          {zone.id.endsWith("A") && <span>A</span>}
          {zone.id.endsWith("B") && <span>B</span>}
        </span>
        {zone.status !== "normal" ? (
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(zone.status)}`} />
        ) : (
          <span className="w-1.5 h-1.5 shrink-0" />
        )}
      </div>

      {/* Row 2: 담당자 이름 뱃지 */}
      <div className="flex-1 flex items-center justify-center w-full px-0.5 min-h-0 pb-0.5">
        {zone.assignedStaffName ? (
          <span className={`text-[9px] font-black px-1 py-px rounded leading-tight text-center max-w-full break-all ${
            staffColorIndex !== null && staffColorIndex !== undefined
              ? STAFF_AVATAR_COLORS[staffColorIndex % STAFF_AVATAR_COLORS.length]
              : "bg-slate-600 text-white"
          }`}>
            {zone.assignedStaffName.slice(0, 3)}
          </span>
        ) : (
          <span className="text-[9px] opacity-30 font-normal">-</span>
        )}
      </div>

      {/* Row 3: showDetails 카테고리 텍스트 (선택적) */}
      {showDetails && (
        <div className="text-[7px] leading-tight font-medium line-clamp-1 text-center opacity-70 w-full px-0.5 shrink-0 pb-0.5">{zone.category}</div>
      )}

      {/* Group label badge */}
      {groupLabel && (
        <span
          className="absolute bottom-0.5 right-0.5 text-[8px] font-black px-1 rounded leading-none text-white pointer-events-none shadow"
          style={{ backgroundColor: groupColor ?? "#64748b" }}
        >
          {groupLabel}
        </span>
      )}

      {/* Config mode in-group checkmark */}
      {configMode && inSelectedGroup && (
        <span
          className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[9px] font-black pointer-events-none shadow"
          style={{ backgroundColor: groupColor ?? "#6366f1" }}
        >
          ✓
        </span>
      )}
    </button>
  );
};
