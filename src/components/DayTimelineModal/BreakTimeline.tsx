// 2026-08-16 · #8 Phase 2B · BreakTimeline 추출
import React, { useState, useCallback, useMemo } from "react";
import type { WorkerEntry, TypeTone, SlotMap } from "./types";
import { DEFAULT_TONE } from "./types";
import { WorkerChips } from "./WorkerChips";

interface Props {
  kind: "lunch" | "rest";
  slots: string[];
  slotMap: SlotMap;
  workers: WorkerEntry[];
  allWorkers: WorkerEntry[];
  onApplyMonth: () => void;
  onDropToSlot: (slot: string, empId: number) => void;
  onRemoveFromSlot: (slot: string, empId: number) => void;
  typeTones: Record<string, TypeTone>;
  offset: number;
  onShiftOffset: (delta: number) => void;
}

const THEME = {
  lunch: { label: "점심시간", dot: "bg-yellow-400", hdr: "text-yellow-800", border: "border-yellow-200", bg: "bg-yellow-50", slotHdr: "bg-yellow-100 text-yellow-700 border-yellow-200", cellHover: "hover:bg-yellow-50" },
  rest:  { label: "휴게시간", dot: "bg-violet-400", hdr: "text-violet-800", border: "border-violet-200", bg: "bg-violet-50", slotHdr: "bg-violet-100 text-violet-700 border-violet-200", cellHover: "hover:bg-violet-50" },
};

export const BreakTimeline: React.FC<Props> = React.memo(({
  kind, slots, slotMap, workers, allWorkers, onApplyMonth, onDropToSlot, onRemoveFromSlot, typeTones, offset, onShiftOffset,
}) => {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [touchDraggingId, setTouchDraggingId] = useState<number | null>(null);
  const [confirmMonth, setConfirmMonth] = useState(false);
  const theme = THEME[kind];

  const assignedIds = useMemo(() => {
    const ids = new Set<number>();
    (Object.values(slotMap) as number[][]).forEach(arr => arr.forEach(id => ids.add(id)));
    return ids;
  }, [slotMap]);

  const handleDragStart = useCallback((e: React.DragEvent, id: number) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }, []);
  const handleDragEnd = useCallback(() => setDraggingId(null), []);
  const handleTouchDragStart = useCallback((empId: number) => setTouchDraggingId(empId), []);
  const handleTouchDragEnd = useCallback((x: number, y: number) => {
    if (touchDraggingId === null) return;
    const empId = touchDraggingId;
    setTouchDraggingId(null);
    let el = document.elementFromPoint(x, y) as HTMLElement | null;
    while (el) {
      if (el.dataset.dropSlot) { onDropToSlot(el.dataset.dropSlot, empId); return; }
      el = el.parentElement;
    }
  }, [touchDraggingId, onDropToSlot]);

  return (
    <div className={`rounded-xl border ${theme.border} ${theme.bg} p-3`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${theme.dot}`} />
          <span className={`text-[14px] font-black ${theme.hdr}`}>{theme.label}</span>
          <div className="flex items-center gap-0.5 ml-1">
            <button type="button" onClick={() => onShiftOffset(-30)} disabled={offset <= -60}
              className="w-5 h-5 flex items-center justify-center text-[14px] font-bold rounded bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="30분 앞으로">-</button>
            <span className="text-[12px] font-mono text-zinc-500 min-w-[36px] text-center">
              {offset === 0 ? "기본" : `${offset > 0 ? "+" : ""}${offset}분`}
            </span>
            <button type="button" onClick={() => onShiftOffset(30)} disabled={offset >= 60}
              className="w-5 h-5 flex items-center justify-center text-[14px] font-bold rounded bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="30분 뒤로">+</button>
          </div>
          {assignedIds.size > 0 && (
            <span className={`text-[13px] font-semibold ${theme.hdr} opacity-70`}>{assignedIds.size}명 배정됨</span>
          )}
        </div>
        {confirmMonth ? (
          <div className="flex items-center gap-1">
            <span className="text-[13px] text-zinc-500">이 달 전체에 적용?</span>
            <button onClick={() => { onApplyMonth(); setConfirmMonth(false); }}
              className="text-[13px] font-bold px-2 py-0.5 rounded bg-indigo-500 text-white hover:bg-indigo-600 cursor-pointer">예</button>
            <button onClick={() => setConfirmMonth(false)}
              className="text-[13px] font-bold px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 hover:bg-zinc-200 cursor-pointer">취소</button>
          </div>
        ) : (
          <button onClick={() => setConfirmMonth(true)}
            className="text-[13px] font-bold px-2 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-400 transition cursor-pointer">
            전월 적용
          </button>
        )}
      </div>

      {/* Slot grid */}
      <div className="overflow-x-auto">
        <div className="flex rounded-lg border border-zinc-200 overflow-hidden" style={{ minWidth: `${slots.length * 68}px` }}>
          {slots.map(slot => {
            const assignedHere = slotMap[slot] ?? [];
            return (
              <div key={slot} data-drop-slot={slot}
                className={`flex-1 flex flex-col border-r border-zinc-200 last:border-r-0 transition ${theme.cellHover}`}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={e => { e.preventDefault(); if (draggingId !== null) onDropToSlot(slot, draggingId); }}
              >
                <div className={`text-center text-[14px] font-bold py-0.5 border-b ${theme.slotHdr}`}>{slot}</div>
                <div className="p-1 min-h-[40px] flex flex-wrap gap-0.5 items-start">
                  {assignedHere.map(empId => {
                    const w = allWorkers.find(ww => ww.emp.id === empId);
                    if (!w) return null;
                    const c = typeTones[w.schedule.type] ?? DEFAULT_TONE;
                    return (
                      <button key={empId} onClick={() => onRemoveFromSlot(slot, empId)}
                        title="클릭하여 제거"
                        style={{ backgroundColor: c.chipBg, color: c.chipText, borderColor: c.chipBorder }}
                        className="px-1.5 py-px rounded text-[14px] font-bold cursor-pointer border hover:opacity-60 transition">
                        {w.emp.name}
                      </button>
                    );
                  })}
                  {assignedHere.length === 0 && (
                    <span className="text-[14px] text-zinc-300 italic w-full text-center mt-1.5">드롭</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drag-source chips */}
      <div className="mt-2 pt-2 border-t border-zinc-200/70">
        <WorkerChips
          workers={workers}
          assignedIds={assignedIds}
          draggingId={draggingId}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          typeTones={typeTones}
          onTouchDragStart={handleTouchDragStart}
          onTouchDragEnd={handleTouchDragEnd}
        />
      </div>
    </div>
  );
});
BreakTimeline.displayName = "BreakTimeline";
