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
}

export const ZoneCell: React.FC<ZoneCellProps> = ({
  zone, onContextClick, onDetailClick, className = "", isPopoverOpen, staffColorIndex,
  isDragOver, onDragOver, onDrop, onDragLeave, showDetails = false, isSearchedHighlight = false
}) => {
  const ref = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    : "";

  let statusCls = "bg-white text-gray-700 border-gray-300 hover:border-gray-400";
  if (zone.status === "low") {
    statusCls = "bg-amber-500 text-white border-amber-600 hover:bg-amber-600";
  } else if (zone.status === "empty") {
    statusCls = "bg-red-500 text-white border-red-650 hover:bg-red-600";
  } else {
    // Normal background color scheme based on sections / map definitions
    if (zone.section === "aisle") {
      const aisleColors: Record<number, string> = {
        9: "bg-blue-500 text-white border-blue-600 hover:bg-blue-600",
        8: "bg-blue-400 text-white border-blue-500 hover:bg-blue-500",
        7: "bg-sky-500 text-white border-sky-600 hover:bg-sky-600",
        6: "bg-purple-400 text-white border-purple-500 hover:bg-purple-500",
        5: "bg-stone-400 text-white border-stone-500 hover:bg-stone-500",
        4: "bg-orange-300 text-white border-orange-400 hover:bg-orange-400",
        3: "bg-teal-500 text-white border-teal-600 hover:bg-teal-600",
        2: "bg-yellow-400 text-gray-900 border-yellow-500 hover:bg-yellow-500",
        1: "bg-green-500 text-white border-green-600 hover:bg-green-600",
      };
      statusCls = aisleColors[zone.num] || "bg-blue-500 text-white border-blue-600";
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
        if (ref.current) onDetailClick(zone);
      }}
      onDragOver={onDragOver ? (e) => onDragOver(e, zone) : undefined}
      onDrop={onDrop ? (e) => onDrop(e, zone) : undefined}
      onDragLeave={onDragLeave}
      className={`w-full rounded-lg border-2 transition-all duration-300 active:scale-[0.96] cursor-pointer flex flex-col font-bold shadow-sm ${statusCls} ${ringCls} ${className}`}
    >
      {/* Row 1: 구역 번호 + 상태 dot */}
      <div className="flex items-center justify-between px-1 pt-0.5 shrink-0">
        <span className="text-[8px] leading-none font-black opacity-70">{zone.num}</span>
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
    </button>
  );
};
