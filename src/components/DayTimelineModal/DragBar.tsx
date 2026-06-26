import React from "react";

const DISPLAY_START = 10 * 60;
const DISPLAY_END = 20 * 60;
const TOTAL = DISPLAY_END - DISPLAY_START;

export interface Range { start: number; end: number }

export type DragKind = "work" | "lunch" | "rest";

function minToStr(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function pct(min: number): number {
  return ((Math.max(DISPLAY_START, Math.min(DISPLAY_END, min)) - DISPLAY_START) / TOTAL) * 100;
}

function widthPct(start: number, end: number): number {
  const s = Math.max(DISPLAY_START, start);
  const e = Math.min(DISPLAY_END, end);
  return e <= s ? 0 : ((e - s) / TOTAL) * 100;
}

interface DragBarProps {
  kind: DragKind;
  part_start?: never;
  part_end?: never;
  range: Range;
  empId?: number;
  colorCls: string;
  label?: string;
  position: "top" | "bottom" | "full";
  startDrag: (
    e: React.MouseEvent | React.TouchEvent,
    kind: DragKind,
    part: "start" | "end" | "body",
    initStart: number,
    initEnd: number,
    empId?: number,
  ) => void;
}

// Draggable bar sub-component
export const DragBar: React.FC<DragBarProps> = ({
  kind, range, empId, colorCls, label, position, startDrag,
}) => {
  const w = widthPct(range.start, range.end);
  if (w <= 0) return null;
  const posStyle = position === "top"
    ? { top: "4px", height: "22px" }
    : position === "bottom"
    ? { bottom: "4px", height: "22px" }
    : { top: "50%", transform: "translateY(-50%)", height: "24px" };
  return (
    <div
      className={`absolute rounded-md ${colorCls}`}
      style={{ left: `${pct(range.start)}%`, width: `${w}%`, position: "absolute", ...posStyle }}
    >
      {/* left resize */}
      <div
        className="absolute left-0 top-0 bottom-0 w-4 cursor-ew-resize bg-black/10 hover:bg-black/25 active:bg-black/40 rounded-l-md touch-none"
        onMouseDown={e => startDrag(e, kind, "start", range.start, range.end, empId)}
        onTouchStart={e => startDrag(e, kind, "start", range.start, range.end, empId)}
      />
      {/* body */}
      <div
        className="absolute inset-0 mx-4 cursor-grab active:cursor-grabbing flex items-center justify-center touch-none"
        onMouseDown={e => startDrag(e, kind, "body", range.start, range.end, empId)}
        onTouchStart={e => startDrag(e, kind, "body", range.start, range.end, empId)}
      >
        {label && (
          <span className="text-[9px] font-bold whitespace-nowrap select-none truncate px-1">
            {label} {minToStr(range.start)}~{minToStr(range.end)}
          </span>
        )}
        {!label && (
          <span className="text-[9px] font-semibold whitespace-nowrap select-none text-white/60 truncate">
            {minToStr(range.start)}~{minToStr(range.end)}
          </span>
        )}
      </div>
      {/* right resize */}
      <div
        className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize bg-black/10 hover:bg-black/25 active:bg-black/40 rounded-r-md touch-none"
        onMouseDown={e => startDrag(e, kind, "end", range.start, range.end, empId)}
        onTouchStart={e => startDrag(e, kind, "end", range.start, range.end, empId)}
      />
    </div>
  );
};
