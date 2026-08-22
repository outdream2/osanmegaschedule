// 2026-08-22 · Framework Phase 4 · DayTimelineModal WorkTime 섹션 이관
// 근무시간 그래프 · 미배정 배지 · 타입 범례 · Name column + Timeline grid
//   · 드래그 재정렬 · 근무시간 인라인 편집

import React from "react";
import { Pill, Pencil } from "lucide-react";
import type { ZoneMap, SlotMap, TypeTone, WorkerEntry } from "./types";
import { DEFAULT_TONE } from "./types";
import { ZONE_ROWS } from "./types";
import { HOUR_SLOTS, pct, widthPct, minToStr } from "./utils";
import type { Employee } from "../../types";

interface DisplayGroup {
  label: string;
  hdrCls: string;
  items: WorkerEntry[];
}

interface WorkTimeSectionProps {
  workers: WorkerEntry[];
  displayWorkers: WorkerEntry[];
  displayGroups: DisplayGroup[];
  workRanges: Record<number, { start: number; end: number } | null>;
  zoneSlots: ZoneMap;
  lunchSlots: SlotMap;
  restSlots: SlotMap;
  showUnassigned: boolean;
  setShowUnassigned: React.Dispatch<React.SetStateAction<boolean>>;
  typeTones: Record<string, TypeTone>;
  date: string;
  dragRowId: number | null;
  editingWork: { empId: number; value: string } | null;
  setEditingWork: React.Dispatch<React.SetStateAction<{ empId: number; value: string } | null>>;
  pharmTypeHoursMap?: Record<string, string>;
  typeHoursMap?: Record<string, string>;
  onEditEmployee?: (emp: Employee) => void;
  onUpdateSchedule?: (data: {
    employeeId: number; date: string; type: string;
    workingHours: string; actualHours: string; memo?: string;
  }) => Promise<void>;
  handleRowDragStart: (e: React.DragEvent, empId: number) => void;
  handleRowDragOver: (e: React.DragEvent, empId: number) => void;
  handleRowDrop: (e: React.DragEvent) => void;
  handleRowDragEnd: () => void;
}

export const WorkTimeSection: React.FC<WorkTimeSectionProps> = ({
  workers, displayWorkers, displayGroups, workRanges,
  zoneSlots, lunchSlots, restSlots,
  showUnassigned, setShowUnassigned, typeTones,
  date, dragRowId, editingWork, setEditingWork,
  pharmTypeHoursMap, typeHoursMap, onEditEmployee, onUpdateSchedule,
  handleRowDragStart, handleRowDragOver, handleRowDrop, handleRowDragEnd,
}) => {
  return (
    <div className="px-4 pt-3 pb-2">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest">근무시간</span>
        {/* 미배정 직원 수 배지 — 클릭 시 이름 목록 토글 */}
        {(() => {
          const unassignedList = workers.filter(w => {
            const inZone  = ZONE_ROWS.some(zone => Object.values(zoneSlots[zone] ?? {}).some(ids => (ids as number[]).includes(w.emp.id)));
            const inLunch = Object.values(lunchSlots).some(ids => (ids as number[]).includes(w.emp.id));
            const inRest  = Object.values(restSlots).some(ids => (ids as number[]).includes(w.emp.id));
            return !inZone && !inLunch && !inRest;
          });
          if (unassignedList.length === 0) return null;
          return (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUnassigned(v => !v)}
                className="text-[13px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200 hover:bg-orange-200 cursor-pointer transition flex items-center gap-1"
                title="클릭하여 미배정 인원 명단 보기"
              >
                미배정 {unassignedList.length}명
                <span className={`text-[12px] transition-transform ${showUnassigned ? "rotate-180" : ""}`}>▾</span>
              </button>
              {showUnassigned && (
                <div className="absolute z-30 mt-1 left-0 bg-white border border-orange-200 rounded-lg shadow-lg p-2 min-w-[180px] max-w-[280px] max-h-64 overflow-y-auto">
                  <div className="text-[12px] font-bold text-orange-500 uppercase tracking-wider mb-1 px-1">미배정 인원</div>
                  <div className="flex flex-wrap gap-1">
                    {unassignedList.map(w => (
                      <span key={w.emp.id}
                        className="text-[13px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-100">
                        {w.emp.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        {[...new Set(workers.map(w => w.schedule.type))].map(type => {
          const colors = typeTones[type] ?? DEFAULT_TONE;
          return (
            <div key={type} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.dot }} />
              <span className="text-[12px] font-semibold text-zinc-500">{type}</span>
            </div>
          );
        })}
      </div>

      {displayWorkers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-20 gap-2">
          <span className="text-xl">📅</span>
          <span className="text-zinc-400 text-[17px] font-medium">이 날 근무자가 없습니다</span>
        </div>
      ) : (
        <div className="flex gap-3 min-w-0">
          {/* Name column */}
          <div className="flex-shrink-0 w-[132px]">
            <div className="h-7" />
            {displayGroups.flatMap(g => [
              <div key={`hdr-${g.label}`}
                className={`mb-1 h-5 px-1 flex items-end text-[12px] font-bold uppercase tracking-wider border-b border-line ${g.hdrCls}`}>
                {g.label} · {g.items.length}
              </div>,
              ...g.items.map(({ emp, schedule }) => {
              const colors = typeTones[schedule.type] ?? DEFAULT_TONE;
              const isPharmacist = emp.position === "약사";
              const hasLunch = Object.values(lunchSlots ?? {}).some(ids => Array.isArray(ids) && (ids as number[]).includes(emp.id));
              const hasRest  = Object.values(restSlots ?? {}).some(ids => Array.isArray(ids) && (ids as number[]).includes(emp.id));

              const isLogistics = emp.position.includes("물류");
              const isCashierLogistics = emp.position.includes("캐셔") && emp.position.includes("물류");
              const showZoneBadge = isLogistics || isCashierLogistics;
              return (
                <div key={emp.id}
                  className={`mb-1 h-8 flex flex-col justify-center gap-0 group cursor-grab active:cursor-grabbing transition-opacity ${dragRowId === emp.id ? "opacity-40" : "opacity-100"}`}
                  draggable
                  onDragStart={e => handleRowDragStart(e, emp.id)}
                  onDragOver={e => handleRowDragOver(e, emp.id)}
                  onDrop={handleRowDrop}
                  onDragEnd={handleRowDragEnd}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    {isPharmacist
                      ? <Pill size={10} className="text-indigo-500 shrink-0" />
                      : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                    }
                    <span className={`text-[14px] whitespace-nowrap ${isPharmacist ? "text-purple-600 font-bold" : "text-zinc-800 font-bold"}`}>{emp.name}</span>
                    {!!emp.hireDate && date === emp.hireDate && (
                      <span className="text-[11px] font-bold px-1 py-px rounded bg-emerald-500 text-white leading-none shrink-0" title={`입사일 (${emp.hireDate})`}>입사</span>
                    )}
                    {!!emp.retireDate && date === emp.retireDate && (
                      <span className="text-[11px] font-bold px-1 py-px rounded bg-rose-500 text-white leading-none shrink-0" title={`퇴사일 (${emp.retireDate})`}>퇴사</span>
                    )}
                    <span className="text-[12px] font-bold leading-none shrink-0" style={{ color: colors.text }}>{schedule.type}</span>
                    {showZoneBadge && (() => {
                      const zoneNumsRaw = (emp as any).zone_nums ?? (emp as any).zoneNums;
                      const zoneNums: number[] = Array.isArray(zoneNumsRaw) ? zoneNumsRaw : [];
                      if (zoneNums.length === 0) return null;
                      return (
                        <span className={`text-[11px] font-bold px-1 py-px rounded leading-none shrink-0 ${isCashierLogistics ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : "bg-blue-50 text-blue-600"}`}
                          title={isCashierLogistics ? "캐셔·물류 겸직" : "물류 담당구역"}>
                          {zoneNums.slice(0, 3).join("·")}{zoneNums.length > 3 ? "…" : ""}
                        </span>
                      );
                    })()}
                    {hasLunch && (
                      <span className="text-[11px] font-bold px-1 py-px rounded bg-yellow-100 text-yellow-600 leading-none shrink-0">점심</span>
                    )}
                    {hasRest && (
                      <span className="text-[11px] font-bold px-1 py-px rounded bg-violet-100 text-violet-600 leading-none shrink-0">휴게</span>
                    )}
                    {onEditEmployee && (
                      <button onClick={() => onEditEmployee(emp)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-200 transition-all cursor-pointer shrink-0">
                        <Pencil size={9} className="text-zinc-400" />
                      </button>
                    )}
                  </div>
                  {/* Editable work hours */}
                  {(() => {
                    const hoursMap = emp.position === "약사" ? (pharmTypeHoursMap ?? typeHoursMap) : typeHoursMap;
                    const displayHours = schedule.workingHours || hoursMap?.[schedule.type] || "";
                    if (editingWork?.empId === emp.id) {
                      return (
                        <div className="flex items-center gap-0.5 mt-0.5" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={editingWork.value}
                            onChange={e => setEditingWork({ empId: emp.id, value: e.target.value })}
                            onKeyDown={async e => {
                              if (e.key === "Enter") {
                                await onUpdateSchedule?.({ employeeId: emp.id, date, type: schedule.type, workingHours: editingWork.value, actualHours: schedule.actualHours || "", memo: schedule.memo || "" });
                                setEditingWork(null);
                              }
                              if (e.key === "Escape") setEditingWork(null);
                            }}
                            placeholder="09:00-18:00"
                            className="text-[12px] font-mono border border-line rounded px-1 py-0 w-[70px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors"
                          />
                          <button className="text-[11px] text-indigo-500 hover:text-indigo-700 cursor-pointer font-bold"
                            onClick={async e => { e.stopPropagation(); await onUpdateSchedule?.({ employeeId: emp.id, date, type: schedule.type, workingHours: editingWork.value, actualHours: schedule.actualHours || "", memo: schedule.memo || "" }); setEditingWork(null); }}>✓</button>
                          <button className="text-[11px] text-zinc-400 hover:text-zinc-600 cursor-pointer"
                            onClick={e => { e.stopPropagation(); setEditingWork(null); }}>✕</button>
                        </div>
                      );
                    }
                    return displayHours ? (
                      <span
                        className={`text-[12px] font-mono leading-none cursor-pointer hover:text-indigo-600 hover:underline ${onUpdateSchedule ? "text-zinc-400" : "text-zinc-300"}`}
                        onClick={e => { if (!onUpdateSchedule) return; e.stopPropagation(); setEditingWork({ empId: emp.id, value: displayHours }); }}
                        title={onUpdateSchedule ? "클릭해서 근무시간 편집" : undefined}
                      >{displayHours}</span>
                    ) : (
                      onUpdateSchedule ? (
                        <span className="text-[12px] text-zinc-300 leading-none cursor-pointer hover:text-indigo-400"
                          onClick={e => { e.stopPropagation(); setEditingWork({ empId: emp.id, value: "" }); }}>+ 시간</span>
                      ) : null
                    );
                  })()}
                </div>
              );
            }),
            ])}
          </div>

          {/* Timeline grid */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <div style={{ minWidth: "560px" }}>
              <div className="relative h-7 mb-0.5">
                <div className="absolute top-0 bottom-0 bg-orange-100 rounded pointer-events-none flex items-end justify-center pb-0.5"
                  style={{ left: `${pct(14 * 60)}%`, width: `${widthPct(14 * 60, 17 * 60)}%` }}>
                  <span className="text-[11px] font-bold text-orange-500 tracking-tight">피크타임</span>
                </div>
                {HOUR_SLOTS.map((slot, i) => (
                  <div key={slot} className="absolute top-0 flex flex-col items-center"
                    style={{ left: `${(i / (HOUR_SLOTS.length - 1)) * 100}%`, transform: "translateX(-50%)" }}>
                    <span className={`text-[12px] whitespace-nowrap font-medium ${parseInt(slot) >= 14 && parseInt(slot) <= 17 ? "text-orange-500 font-bold" : "text-zinc-400"}`}>{slot}</span>
                    <span className={`mt-0.5 block w-px h-1.5 ${parseInt(slot) >= 14 && parseInt(slot) <= 17 ? "bg-orange-300" : "bg-zinc-300"}`} />
                  </div>
                ))}
              </div>
              <div className="relative">
                <div className="absolute top-0 bottom-0 bg-orange-50 border-l-2 border-r-2 border-orange-200/70 pointer-events-none"
                  style={{ left: `${pct(14 * 60)}%`, width: `${widthPct(14 * 60, 17 * 60)}%` }} />
                {HOUR_SLOTS.map((slot, i) => (
                  <div key={`g-${slot}`} className="absolute top-0 bottom-0 border-l pointer-events-none"
                    style={{ left: `${(i / (HOUR_SLOTS.length - 1)) * 100}%`, borderColor: "#e2e8f0" }} />
                ))}
                {displayGroups.flatMap(g => [
                  <div key={`sp-${g.label}`} className="mb-1 h-5" />,
                  ...g.items.map(({ emp, schedule }) => {
                  const colors = typeTones[schedule.type] ?? DEFAULT_TONE;
                  const workRange = workRanges[emp.id];
                  return (
                    <div key={emp.id}
                      className={`relative mb-1 h-8 bg-zinc-50 rounded-lg border border-zinc-100 transition-opacity ${dragRowId === emp.id ? "opacity-40" : "opacity-100"}`}>
                      {workRange ? (
                        <div className="absolute top-1 bottom-1 rounded-md opacity-90"
                          style={{
                            left: `${pct(workRange.start)}%`,
                            width: `${Math.max(widthPct(workRange.start, workRange.end), 0.5)}%`,
                            backgroundColor: colors.bg,
                          }}>
                          <div className="flex items-center justify-center h-full">
                            <span className="text-[12px] font-bold select-none truncate px-1" style={{ color: colors.text }}>
                              {minToStr(workRange.start)}~{minToStr(workRange.end)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <span className="text-[13px] text-zinc-300 font-medium">시간 미정</span>
                        </div>
                      )}
                    </div>
                  );
                }),
                ])}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
