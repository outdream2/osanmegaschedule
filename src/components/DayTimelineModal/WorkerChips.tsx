// 2026-08-16 · #8 · Phase 2A · WorkerChips 추출 · slim
import React from "react";
import type { WorkerEntry, TypeTone } from "./types";
import { DEFAULT_TONE } from "./types";
import { isStaffEmp, isOtherEmp, createGhost, moveGhost, removeGhost } from "./utils";

interface Props {
  workers: WorkerEntry[];
  assignedIds: Set<number>;
  lunchAssignedIds?: Set<number>;
  draggingId: number | null;
  onDragStart: (e: React.DragEvent, empId: number) => void;
  onDragEnd: () => void;
  compact?: boolean;
  typeTones: Record<string, TypeTone>;
  onTouchDragStart?: (empId: number) => void;
  onTouchDragEnd?: (x: number, y: number) => void;
  /** true → 약사/사원/기타 섹션 분리 */
  grouped?: boolean;
}

function renderChip(
  { emp, schedule }: WorkerEntry,
  assignedIds: Set<number>,
  draggingId: number | null,
  onDragStart: (e: React.DragEvent, empId: number) => void,
  onDragEnd: () => void,
  compact: boolean | undefined,
  typeTones: Record<string, TypeTone>,
  onTouchDragStart: ((empId: number) => void) | undefined,
  onTouchDragEnd: ((x: number, y: number) => void) | undefined,
  lunchAssignedIds?: Set<number>,
) {
  const c = typeTones[schedule.type] ?? DEFAULT_TONE;
  const assigned = assignedIds.has(emp.id);
  const hasLunch = lunchAssignedIds?.has(emp.id) ?? false;
  const isPharm = emp.position === "약사";
  return (
    <div key={emp.id} draggable
      onDragStart={e => onDragStart(e, emp.id)}
      onDragEnd={onDragEnd}
      onTouchStart={e => {
        if (!onTouchDragStart) return;
        e.preventDefault();
        onTouchDragStart(emp.id);
        createGhost(emp.name);
        const t0 = e.touches[0];
        moveGhost(t0.clientX, t0.clientY);
        const onMove = (ev: TouchEvent) => { ev.preventDefault(); const t = ev.touches[0]; moveGhost(t.clientX, t.clientY); };
        const onEnd = (ev: TouchEvent) => {
          document.removeEventListener("touchmove", onMove);
          document.removeEventListener("touchend", onEnd);
          const t = ev.changedTouches[0];
          removeGhost();
          onTouchDragEnd?.(t.clientX, t.clientY);
        };
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onEnd);
      }}
      style={{ touchAction: "none", ...(assigned ? { backgroundColor: c.chipBg, color: c.chipText, borderColor: c.chipBorder } : undefined) }}
      className={`relative flex items-center gap-1 whitespace-nowrap ${compact ? "px-1.5 py-0.5 text-[13px]" : "px-2 py-0.5 text-[14px]"} rounded-full font-bold border cursor-grab active:cursor-grabbing select-none transition ${
        assigned ? "opacity-80" : "bg-white border-zinc-200 hover:border-zinc-400"
      } ${draggingId === emp.id ? "opacity-20" : ""}`}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: assigned ? c.dot : isPharm ? "#9333ea" : "#cbd5e1" }} />
      <span className={isPharm ? "text-purple-600 font-black" : (!assigned ? "text-zinc-600" : "")}>{emp.name}</span>
      {hasLunch && (
        <span className="absolute -top-1.5 -left-1 w-3.5 h-3.5 rounded-full bg-yellow-400 border border-white text-yellow-900 text-[11px] font-black leading-none flex items-center justify-center shadow-sm pointer-events-none" title="점심 배정됨" aria-label="점심">점</span>
      )}
    </div>
  );
}

export const WorkerChips: React.FC<Props> = React.memo(({
  workers, assignedIds, lunchAssignedIds, draggingId, onDragStart, onDragEnd, compact, typeTones,
  onTouchDragStart, onTouchDragEnd, grouped,
}) => {
  const renderList = (items: WorkerEntry[]) =>
    items.map(w => renderChip(w, assignedIds, draggingId, onDragStart, onDragEnd, compact, typeTones, onTouchDragStart, onTouchDragEnd, lunchAssignedIds));

  if (!grouped) return (
    <div className="flex flex-wrap gap-1">
      {workers.length === 0 && <span className="text-[15px] text-zinc-300 italic">근무자 없음</span>}
      {renderList(workers)}
    </div>
  );

  const sections: { label: string; items: WorkerEntry[]; labelCls: string }[] = [
    { label: "약사", items: workers.filter(w => w.emp.position === "약사"), labelCls: "text-indigo-600" },
    { label: "사원", items: workers.filter(w => isStaffEmp(w.emp)), labelCls: "text-zinc-500" },
    { label: "기타", items: workers.filter(w => isOtherEmp(w.emp)), labelCls: "text-zinc-400" },
  ];
  const assignedByGroup = sections.map(s => ({ ...s, items: s.items.filter(w => assignedIds.has(w.emp.id)) }));
  const unassigned = workers.filter(w => !assignedIds.has(w.emp.id));
  const hasAnyAssigned = assignedByGroup.some(s => s.items.length > 0);

  return (
    <div className="flex flex-col gap-1.5">
      {workers.length === 0 && <span className="text-[15px] text-zinc-300 italic">근무자 없음</span>}
      {assignedByGroup.map(({ label, items, labelCls }) => items.length === 0 ? null : (
        <div key={label}>
          <span className={`text-[12px] font-black uppercase tracking-wider ${labelCls} mb-0.5 block`}>{label}</span>
          <div className="flex flex-wrap gap-1">{renderList(items)}</div>
        </div>
      ))}
      {unassigned.length > 0 && (
        <>
          {hasAnyAssigned && <div className="h-px bg-sky-200/70 my-0.5" />}
          <div>
            <span className="text-[12px] font-black uppercase tracking-wider text-zinc-400 mb-0.5 block">
              미배정 ({unassigned.length}명)
            </span>
            <div className="flex flex-wrap gap-1">{renderList(unassigned)}</div>
          </div>
        </>
      )}
    </div>
  );
});
WorkerChips.displayName = "WorkerChips";
