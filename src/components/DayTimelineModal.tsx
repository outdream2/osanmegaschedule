import React, { useState, useRef } from "react";
import { X } from "lucide-react";
import { Employee } from "../types";
import axios from "axios";

const DISPLAY_START = 10 * 60;
const DISPLAY_END = 20 * 60;
const TOTAL = DISPLAY_END - DISPLAY_START;
const SNAP = 15;

const SKIP_TYPES = new Set(["휴무", "월차", "지정휴무"]);

const TYPE_COLORS_BG: Record<string, string> = {
  "오픈":    "bg-emerald-200",
  "미들":    "bg-blue-200",
  "마감":    "bg-rose-200",
  "오전반차": "bg-lime-200",
  "오후반차": "bg-amber-200",
};

const SLOTS: string[] = [];
for (let m = DISPLAY_START; m <= DISPLAY_END; m += 30) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  SLOTS.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
}

function toMin(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minToStr(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseRange(wh: string): { start: number; end: number } | null {
  if (!wh) return null;
  const m = wh.match(/^(\d{1,2})(?::(\d{2}))?\s*[-~]\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const start = parseInt(m[1]) * 60 + (m[2] ? parseInt(m[2]) : 0);
  const end   = parseInt(m[3]) * 60 + (m[4] ? parseInt(m[4]) : 0);
  return { start, end };
}

function pct(min: number): number {
  return ((Math.max(DISPLAY_START, Math.min(DISPLAY_END, min)) - DISPLAY_START) / TOTAL) * 100;
}

function widthPct(start: number, end: number): number {
  const s = Math.max(DISPLAY_START, start);
  const e = Math.min(DISPLAY_END, end);
  return e <= s ? 0 : ((e - s) / TOTAL) * 100;
}

function snapTo(min: number): number {
  return Math.round(min / SNAP) * SNAP;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface Range { start: number; end: number }
interface EmpBreak { lunch: Range; rest: Range }

type DragKind = "work" | "lunch" | "rest";

interface Props {
  date: string;
  employees: Employee[];
  openShiftHour: string;
  middleShiftHour: string;
  closeShiftHour: string;
  onClose: () => void;
}

export const DayTimelineModal: React.FC<Props> = ({
  date, employees, openShiftHour, middleShiftHour, closeShiftHour, onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"사원" | "약사">("사원");

  // Global default break times
  const [globalLunch, setGlobalLunch] = useState<Range>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("tl_lunch") || "");
      return { start: toMin(s.start), end: toMin(s.end) };
    } catch { return { start: 12 * 60, end: 13 * 60 }; }
  });
  const [globalRest, setGlobalRest] = useState<Range>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("tl_rest") || "");
      return { start: toMin(s.start), end: toMin(s.end) };
    } catch { return { start: 15 * 60, end: 15 * 60 + 30 }; }
  });

  const d = new Date(date + "T00:00:00");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const title = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;

  const workers = employees
    .map(emp => {
      const s = emp.schedules.find(sc => sc.date === date);
      if (!s || SKIP_TYPES.has(s.type)) return null;
      let wh = s.workingHours;
      if (!wh) {
        if (s.type === "오픈")    wh = openShiftHour;
        else if (s.type === "미들") wh = middleShiftHour;
        else if (s.type === "마감") wh = closeShiftHour;
      }
      return { emp, schedule: s, wh };
    })
    .filter(Boolean) as { emp: Employee; schedule: NonNullable<ReturnType<Employee["schedules"]["find"]>>; wh: string }[];

  const pharmacistWorkers = workers.filter(w => w.emp.position === "약사");
  const staffWorkers      = workers.filter(w => w.emp.position !== "약사");
  const tabWorkers        = activeTab === "약사" ? pharmacistWorkers : staffWorkers;

  // Per-employee working hour ranges
  const [workRanges, setWorkRanges] = useState<Record<number, Range | null>>(() => {
    const r: Record<number, Range | null> = {};
    workers.forEach(w => { r[w.emp.id] = parseRange(w.wh); });
    return r;
  });

  // Per-employee break times — initialized from global defaults, overrideable per person
  const [empBreaks, setEmpBreaks] = useState<Record<number, EmpBreak>>(() => {
    const stored = (() => {
      try { return JSON.parse(localStorage.getItem(`tl_emp_breaks_${date}`) || "{}"); }
      catch { return {}; }
    })();
    const r: Record<number, EmpBreak> = {};
    workers.forEach(w => {
      if (stored[w.emp.id]) {
        r[w.emp.id] = {
          lunch: { start: stored[w.emp.id].lunch.start, end: stored[w.emp.id].lunch.end },
          rest:  { start: stored[w.emp.id].rest.start,  end: stored[w.emp.id].rest.end  },
        };
      } else {
        r[w.emp.id] = {
          lunch: { ...globalLunch },
          rest:  { ...globalRest  },
        };
      }
    });
    return r;
  });

  const gridRef = useRef<HTMLDivElement>(null);

  const getMinFromX = (clientX: number): number => {
    if (!gridRef.current) return DISPLAY_START;
    const rect = gridRef.current.getBoundingClientRect();
    return clamp(DISPLAY_START + ((clientX - rect.left) / rect.width) * TOTAL, DISPLAY_START, DISPLAY_END);
  };

  const saveEmpBreaks = (next: Record<number, EmpBreak>) => {
    localStorage.setItem(`tl_emp_breaks_${date}`, JSON.stringify(next));
    setEmpBreaks(next);
  };

  const startDrag = (
    e: React.MouseEvent,
    kind: DragKind,
    part: "start" | "end" | "body",
    initStart: number,
    initEnd: number,
    empId?: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const duration = initEnd - initStart;
    const bodyOffset = getMinFromX(e.clientX) - initStart;
    let curStart = initStart;
    let curEnd = initEnd;

    const onMove = (me: MouseEvent) => {
      const mouse = snapTo(getMinFromX(me.clientX));
      if (part === "start") {
        curStart = clamp(mouse, DISPLAY_START, initEnd - SNAP);
        curEnd = initEnd;
      } else if (part === "end") {
        curStart = initStart;
        curEnd = clamp(mouse, initStart + SNAP, DISPLAY_END);
      } else {
        const raw = getMinFromX(me.clientX) - bodyOffset;
        curStart = clamp(snapTo(raw), DISPLAY_START, DISPLAY_END - duration);
        curEnd = curStart + duration;
      }

      if (kind === "work" && empId !== undefined) {
        setWorkRanges(prev => ({ ...prev, [empId]: { start: curStart, end: curEnd } }));
      } else if (kind === "lunch") {
        if (empId !== undefined) {
          setEmpBreaks(prev => ({
            ...prev,
            [empId]: { ...prev[empId], lunch: { start: curStart, end: curEnd } },
          }));
        } else {
          setGlobalLunch({ start: curStart, end: curEnd });
        }
      } else if (kind === "rest") {
        if (empId !== undefined) {
          setEmpBreaks(prev => ({
            ...prev,
            [empId]: { ...prev[empId], rest: { start: curStart, end: curEnd } },
          }));
        } else {
          setGlobalRest({ start: curStart, end: curEnd });
        }
      }
    };

    const onUp = async () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";

      if (kind === "work" && empId !== undefined) {
        try {
          await axios.put("/api/schedules", {
            employeeId: empId,
            date,
            workingHours: `${minToStr(curStart)}-${minToStr(curEnd)}`,
          });
        } catch (err) {
          console.error("Failed to save working hours", err);
        }
      } else if (kind === "lunch") {
        if (empId !== undefined) {
          setEmpBreaks(prev => {
            const next = { ...prev, [empId]: { ...prev[empId], lunch: { start: curStart, end: curEnd } } };
            localStorage.setItem(`tl_emp_breaks_${date}`, JSON.stringify(next));
            return next;
          });
        } else {
          localStorage.setItem("tl_lunch", JSON.stringify({ start: minToStr(curStart), end: minToStr(curEnd) }));
        }
      } else if (kind === "rest") {
        if (empId !== undefined) {
          setEmpBreaks(prev => {
            const next = { ...prev, [empId]: { ...prev[empId], rest: { start: curStart, end: curEnd } } };
            localStorage.setItem(`tl_emp_breaks_${date}`, JSON.stringify(next));
            return next;
          });
        } else {
          localStorage.setItem("tl_rest", JSON.stringify({ start: minToStr(curStart), end: minToStr(curEnd) }));
        }
      }
    };

    document.body.style.cursor = part === "body" ? "grabbing" : "ew-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Apply global defaults to all employees
  const applyGlobalToAll = () => {
    const next: Record<number, EmpBreak> = {};
    workers.forEach(w => {
      next[w.emp.id] = { lunch: { ...globalLunch }, rest: { ...globalRest } };
    });
    saveEmpBreaks(next);
  };

  // Draggable bar sub-component
  const DragBar = ({
    kind, part_start, part_end, range, empId, colorCls, label, position,
  }: {
    kind: DragKind;
    part_start?: never;
    part_end?: never;
    range: Range;
    empId?: number;
    colorCls: string;
    label?: string;
    position: "top" | "bottom" | "full";
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
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/10 hover:bg-black/25 rounded-l-md"
          onMouseDown={e => startDrag(e, kind, "start", range.start, range.end, empId)}
        />
        {/* body */}
        <div
          className="absolute inset-0 mx-2 cursor-grab active:cursor-grabbing flex items-center justify-center"
          onMouseDown={e => startDrag(e, kind, "body", range.start, range.end, empId)}
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
          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/10 hover:bg-black/25 rounded-r-md"
          onMouseDown={e => startDrag(e, kind, "end", range.start, range.end, empId)}
        />
      </div>
    );
  };

  // Global break row (top section)
  const GlobalBreakRow = ({ kind }: { kind: "lunch" | "rest" }) => {
    const r = kind === "lunch" ? globalLunch : globalRest;
    const label = kind === "lunch" ? "기본 점심" : "기본 휴게";
    const rowBg = kind === "lunch" ? "bg-yellow-50 border-yellow-200" : "bg-violet-50 border-violet-200";
    const barBg = kind === "lunch" ? "bg-yellow-300" : "bg-violet-300";
    const textCls = kind === "lunch" ? "text-yellow-800" : "text-violet-800";
    const w = widthPct(r.start, r.end);
    return (
      <div className={`relative h-8 mb-1 rounded-lg border ${rowBg}`}>
        {w > 0 && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-md ${barBg}`}
            style={{ left: `${pct(r.start)}%`, width: `${w}%` }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/10 hover:bg-black/25 rounded-l-md"
              onMouseDown={e => startDrag(e, kind, "start", r.start, r.end)}
            />
            <div
              className={`absolute inset-0 mx-2 cursor-grab active:cursor-grabbing flex items-center justify-center`}
              onMouseDown={e => startDrag(e, kind, "body", r.start, r.end)}
            >
              <span className={`text-[9px] font-bold whitespace-nowrap select-none ${textCls}`}>
                {label} {minToStr(r.start)}~{minToStr(r.end)}
              </span>
            </div>
            <div
              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/10 hover:bg-black/25 rounded-r-md"
              onMouseDown={e => startDrag(e, kind, "end", r.start, r.end)}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl overflow-hidden flex flex-col"
        style={{ maxHeight: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold tracking-tight">{title}</span>
            <span className="bg-slate-700 text-slate-300 text-[11px] px-2.5 py-0.5 rounded-full font-semibold">
              근무 {workers.length}명 (사원 {staffWorkers.length} / 약사 {pharmacistWorkers.length})
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white">
            <X size={17} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-5 pt-2 pb-0 bg-white border-b border-slate-200 flex-shrink-0">
          {(["사원", "약사"] as const).map(tab => {
            const count = tab === "약사" ? pharmacistWorkers.length : staffWorkers.length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 text-xs font-bold rounded-t-lg border border-b-0 transition-colors cursor-pointer ${
                  activeTab === tab
                    ? "bg-white border-slate-200 text-slate-800 -mb-px z-10"
                    : "bg-slate-50 border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab}
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-500"
                }`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Hint */}
        <div className="px-5 py-1.5 bg-slate-50 border-b border-slate-200 flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[10px] text-slate-400 font-medium">
            양 끝 드래그 → 시간 조정 &nbsp;|&nbsp; 가운데 드래그 → 이동 &nbsp;(15분 단위)
          </span>
          <button
            onClick={applyGlobalToAll}
            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded px-2 py-0.5 transition cursor-pointer whitespace-nowrap"
          >
            기본값 전체적용
          </button>
        </div>

        {/* Timeline */}
        <div className="overflow-y-auto flex-1 px-4 pt-3 pb-4 select-none">
          {tabWorkers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <span className="text-2xl">📅</span>
              <span className="text-slate-400 text-sm font-medium">이 날 근무자가 없습니다</span>
            </div>
          ) : (
            <div className="flex gap-3 min-w-0">
              {/* Name column */}
              <div className="flex-shrink-0 w-[100px]">
                <div className="h-8" /> {/* time axis */}
                {/* Global break labels */}
                <div className="h-8 mb-1 flex items-center">
                  <span className="text-[9px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-0.5">기본 점심</span>
                </div>
                <div className="h-8 mb-1 flex items-center">
                  <span className="text-[9px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">기본 휴게</span>
                </div>
                <div className="h-px bg-slate-200 mb-2" />
                {/* Employee labels */}
                {tabWorkers.map(({ emp, schedule }) => (
                  <div key={emp.id} className="h-16 mb-1.5 flex flex-col justify-center gap-0.5">
                    <span className="text-xs font-bold text-slate-800 leading-tight truncate">{emp.name}</span>
                    <span className="text-[9px] text-slate-400 leading-tight">{schedule.type}</span>
                    <div className="flex gap-1">
                      <span className="text-[8px] text-yellow-600 leading-tight">점심</span>
                      <span className="text-[8px] text-violet-600 leading-tight">휴게</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Grid */}
              <div className="flex-1 min-w-0 overflow-x-auto">
                <div ref={gridRef} style={{ minWidth: "600px" }}>
                  {/* Time axis */}
                  <div className="relative h-8 mb-0.5">
                    {SLOTS.map((slot, i) => (
                      <div key={slot} className="absolute top-0 flex flex-col items-center"
                        style={{ left: `${(i / (SLOTS.length - 1)) * 100}%`, transform: "translateX(-50%)" }}>
                        <span className="text-[9px] text-slate-400 whitespace-nowrap font-medium">{slot}</span>
                        <span className="mt-1 block w-px h-2 bg-slate-300" />
                      </div>
                    ))}
                  </div>

                  {/* Bars area */}
                  <div className="relative">
                    {/* Grid lines */}
                    {SLOTS.map((slot, i) => (
                      <div key={`g-${slot}`}
                        className="absolute top-0 bottom-0 border-l pointer-events-none"
                        style={{
                          left: `${(i / (SLOTS.length - 1)) * 100}%`,
                          borderColor: i % 2 === 0 ? "#e2e8f0" : "#f8fafc",
                        }} />
                    ))}

                    {/* Global break rows */}
                    <GlobalBreakRow kind="lunch" />
                    <GlobalBreakRow kind="rest" />
                    <div className="h-px bg-slate-200 mb-2" />

                    {/* Employee rows — each shows work bar (faint) + lunch + rest on top */}
                    {tabWorkers.map(({ emp, schedule }) => {
                      const colorCls = TYPE_COLORS_BG[schedule.type] ?? "bg-slate-400";
                      const workRange = workRanges[emp.id];
                      const breaks = empBreaks[emp.id] ?? { lunch: globalLunch, rest: globalRest };

                      return (
                        <div key={emp.id} className="relative h-16 mb-1.5 bg-slate-50 rounded-lg border border-slate-100">
                          {/* Layer 1: working hours bar — faint background */}
                          {workRange && (
                            <div
                              className={`absolute top-1 bottom-1 rounded-md ${colorCls}`}
                              style={{ left: `${pct(workRange.start)}%`, width: `${Math.max(widthPct(workRange.start, workRange.end), 0.5)}%` }}
                            >
                              {/* left resize handle */}
                              <div
                                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/10 rounded-l-md"
                                onMouseDown={e => startDrag(e, "work", "start", workRange.start, workRange.end, emp.id)}
                              />
                              {/* body */}
                              <div
                                className="absolute inset-0 mx-2 cursor-grab active:cursor-grabbing flex items-center justify-center"
                                onMouseDown={e => startDrag(e, "work", "body", workRange.start, workRange.end, emp.id)}
                              >
                                <span className={`text-[9px] font-medium select-none truncate text-slate-400`}>
                                  {minToStr(workRange.start)}~{minToStr(workRange.end)}
                                </span>
                              </div>
                              {/* right resize handle */}
                              <div
                                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/10 rounded-r-md"
                                onMouseDown={e => startDrag(e, "work", "end", workRange.start, workRange.end, emp.id)}
                              />
                            </div>
                          )}

                          {/* Layer 2: lunch break — upper portion */}
                          {(() => {
                            const r = breaks.lunch;
                            const w = widthPct(r.start, r.end);
                            if (w <= 0) return null;
                            return (
                              <div
                                className="absolute bg-yellow-300/90 rounded"
                                style={{ top: "5px", height: "20px", left: `${pct(r.start)}%`, width: `${w}%` }}
                              >
                                <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-yellow-500/40 rounded-l"
                                  onMouseDown={e => startDrag(e, "lunch", "start", r.start, r.end, emp.id)} />
                                <div className="absolute inset-0 mx-1.5 cursor-grab active:cursor-grabbing flex items-center justify-center"
                                  onMouseDown={e => startDrag(e, "lunch", "body", r.start, r.end, emp.id)}>
                                  <span className="text-[8px] font-bold text-yellow-900 whitespace-nowrap select-none truncate">
                                    {minToStr(r.start)}~{minToStr(r.end)}
                                  </span>
                                </div>
                                <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-yellow-500/40 rounded-r"
                                  onMouseDown={e => startDrag(e, "lunch", "end", r.start, r.end, emp.id)} />
                              </div>
                            );
                          })()}

                          {/* Layer 3: rest break — lower portion */}
                          {(() => {
                            const r = breaks.rest;
                            const w = widthPct(r.start, r.end);
                            if (w <= 0) return null;
                            return (
                              <div
                                className="absolute bg-violet-300/90 rounded"
                                style={{ bottom: "5px", height: "20px", left: `${pct(r.start)}%`, width: `${w}%` }}
                              >
                                <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-violet-500/40 rounded-l"
                                  onMouseDown={e => startDrag(e, "rest", "start", r.start, r.end, emp.id)} />
                                <div className="absolute inset-0 mx-1.5 cursor-grab active:cursor-grabbing flex items-center justify-center"
                                  onMouseDown={e => startDrag(e, "rest", "body", r.start, r.end, emp.id)}>
                                  <span className="text-[8px] font-bold text-violet-900 whitespace-nowrap select-none truncate">
                                    {minToStr(r.start)}~{minToStr(r.end)}
                                  </span>
                                </div>
                                <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-violet-500/40 rounded-r"
                                  onMouseDown={e => startDrag(e, "rest", "end", r.start, r.end, emp.id)} />
                              </div>
                            );
                          })()}

                          {!workRange && (
                            <div className="flex items-center justify-center h-full">
                              <span className="text-[10px] text-slate-300 font-medium">시간 미정</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 px-5 py-2 bg-slate-50 border-t border-slate-200 flex-shrink-0 flex-wrap">
          {Object.entries(TYPE_COLORS_BG).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded ${color} inline-block`} />
              <span className="text-[10px] text-slate-500">{type}</span>
            </div>
          ))}
          <span className="text-slate-200">|</span>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-yellow-300 inline-block" />
            <span className="text-[10px] text-slate-500">점심</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-violet-300 inline-block" />
            <span className="text-[10px] text-slate-500">휴게</span>
          </div>
        </div>
      </div>
    </div>
  );
};
