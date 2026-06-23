import React, { useState, useRef } from "react";
import { X } from "lucide-react";
import { Employee } from "../types";
import axios from "axios";

const DISPLAY_START = 10 * 60;
const DISPLAY_END = 20 * 60;
const TOTAL = DISPLAY_END - DISPLAY_START;
const SNAP = 15;

const SKIP_TYPES = new Set(["휴무", "월차", "지정휴무"]);

const TYPE_COLORS: Record<string, string> = {
  "오픈":    "bg-emerald-500",
  "미들":    "bg-blue-500",
  "마감":    "bg-rose-500",
  "오전반차": "bg-lime-500",
  "오후반차": "bg-amber-500",
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
  const [lunch, setLunch] = useState<Range>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("tl_lunch") || "");
      return { start: toMin(s.start), end: toMin(s.end) };
    } catch { return { start: 12 * 60, end: 13 * 60 }; }
  });
  const [rest, setRest] = useState<Range>(() => {
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

  const [workerRanges, setWorkerRanges] = useState<Record<number, Range | null>>(() => {
    const result: Record<number, Range | null> = {};
    workers.forEach(w => { result[w.emp.id] = parseRange(w.wh); });
    return result;
  });

  const gridRef = useRef<HTMLDivElement>(null);

  const getMinFromX = (clientX: number): number => {
    if (!gridRef.current) return DISPLAY_START;
    const rect = gridRef.current.getBoundingClientRect();
    return clamp(DISPLAY_START + ((clientX - rect.left) / rect.width) * TOTAL, DISPLAY_START, DISPLAY_END);
  };

  const startDrag = (
    e: React.MouseEvent,
    kind: "lunch" | "rest" | "emp",
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

      if (kind === "lunch") setLunch({ start: curStart, end: curEnd });
      else if (kind === "rest") setRest({ start: curStart, end: curEnd });
      else if (kind === "emp" && empId !== undefined) {
        setWorkerRanges(prev => ({ ...prev, [empId]: { start: curStart, end: curEnd } }));
      }
    };

    const onUp = async () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";

      if (kind === "lunch") {
        localStorage.setItem("tl_lunch", JSON.stringify({ start: minToStr(curStart), end: minToStr(curEnd) }));
      } else if (kind === "rest") {
        localStorage.setItem("tl_rest", JSON.stringify({ start: minToStr(curStart), end: minToStr(curEnd) }));
      } else if (kind === "emp" && empId !== undefined) {
        try {
          await axios.put("/api/schedules", {
            employeeId: empId,
            date,
            workingHours: `${minToStr(curStart)}-${minToStr(curEnd)}`,
          });
        } catch (err) {
          console.error("Failed to save schedule", err);
        }
      }
    };

    document.body.style.cursor = part === "body" ? "grabbing" : "ew-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const BreakRow = ({ kind }: { kind: "lunch" | "rest" }) => {
    const r = kind === "lunch" ? lunch : rest;
    const label = kind === "lunch" ? "점심시간" : "휴게시간";
    const rowBg = kind === "lunch" ? "bg-yellow-50" : "bg-violet-50";
    const barBg = kind === "lunch" ? "bg-yellow-300" : "bg-violet-300";
    const handleBg = kind === "lunch"
      ? "bg-yellow-500/50 hover:bg-yellow-600/60"
      : "bg-violet-500/50 hover:bg-violet-600/60";
    const textCls = kind === "lunch" ? "text-yellow-800" : "text-violet-800";
    const borderCls = kind === "lunch" ? "border-yellow-200" : "border-violet-200";
    const w = widthPct(r.start, r.end);
    return (
      <div className={`relative h-9 mb-1 rounded-lg border ${rowBg} ${borderCls}`}>
        {w > 0 && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 h-6 rounded-md ${barBg}`}
            style={{ left: `${pct(r.start)}%`, width: `${w}%` }}
          >
            {/* left resize */}
            <div
              className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l-md ${handleBg}`}
              onMouseDown={e => startDrag(e, kind, "start", r.start, r.end)}
            />
            {/* body move */}
            <div
              className="absolute inset-0 mx-2 cursor-grab active:cursor-grabbing flex items-center justify-center"
              onMouseDown={e => startDrag(e, kind, "body", r.start, r.end)}
            >
              <span className={`text-[10px] font-bold whitespace-nowrap select-none ${textCls}`}>
                {minToStr(r.start)}~{minToStr(r.end)}
              </span>
            </div>
            {/* right resize */}
            <div
              className={`absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r-md ${handleBg}`}
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
            <div>
              <span className="text-base font-bold tracking-tight">{title}</span>
              <span className="ml-2 bg-slate-700 text-slate-300 text-[11px] px-2.5 py-0.5 rounded-full font-semibold">
                근무 {workers.length}명
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
          >
            <X size={17} />
          </button>
        </div>

        {/* Hint */}
        <div className="px-5 py-1.5 bg-slate-50 border-b border-slate-200 flex-shrink-0">
          <span className="text-[10px] text-slate-400 font-medium">
            막대 양 끝 드래그 → 시간 조정 &nbsp;|&nbsp; 가운데 드래그 → 이동 &nbsp;(15분 단위)
          </span>
        </div>

        {/* Timeline */}
        <div className="overflow-y-auto flex-1 px-4 pt-3 pb-4 select-none">
          {workers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <span className="text-2xl">📅</span>
              <span className="text-slate-400 text-sm font-medium">이 날 근무자가 없습니다</span>
            </div>
          ) : (
            <div className="flex gap-3 min-w-0">
              {/* Name column */}
              <div className="flex-shrink-0 w-[96px]">
                <div className="h-8" />
                {/* Break time labels */}
                <div className="h-9 mb-1 flex items-center">
                  <span className="text-[10px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-0.5 leading-none">점심시간</span>
                </div>
                <div className="h-9 mb-1 flex items-center">
                  <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5 leading-none">휴게시간</span>
                </div>
                {/* Divider */}
                <div className="h-px bg-slate-200 mb-1.5" />
                {/* Employee names */}
                {workers.map(({ emp, schedule }) => (
                  <div key={emp.id} className="h-9 mb-1.5 flex flex-col justify-center">
                    <span className="text-xs font-bold text-slate-800 leading-tight truncate">{emp.name}</span>
                    <span className="text-[10px] text-slate-400 leading-tight mt-0.5">{schedule.type}</span>
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

                    {/* Break rows at top */}
                    <BreakRow kind="lunch" />
                    <BreakRow kind="rest" />
                    {/* Divider */}
                    <div className="h-px bg-slate-200 mb-1.5" />

                    {/* Employee rows */}
                    {workers.map(({ emp, schedule }) => {
                      const color = TYPE_COLORS[schedule.type] ?? "bg-slate-400";
                      const range = workerRanges[emp.id];
                      return (
                        <div key={emp.id} className="relative h-9 mb-1.5 bg-slate-50 rounded-lg border border-slate-100">
                          {range ? (
                            <div
                              className={`absolute top-1/2 -translate-y-1/2 h-6 rounded-md z-20 shadow-sm ${color}`}
                              style={{
                                left: `${pct(range.start)}%`,
                                width: `${Math.max(widthPct(range.start, range.end), 0.5)}%`,
                              }}
                            >
                              {/* left resize */}
                              <div
                                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/10 hover:bg-black/25 rounded-l-md"
                                onMouseDown={e => startDrag(e, "emp", "start", range.start, range.end, emp.id)}
                              />
                              {/* body move */}
                              <div
                                className="absolute inset-0 mx-2 cursor-grab active:cursor-grabbing flex items-center px-1"
                                onMouseDown={e => startDrag(e, "emp", "body", range.start, range.end, emp.id)}
                              >
                                <span className="text-[10px] text-white/40 font-medium truncate whitespace-nowrap drop-shadow-sm">
                                  {minToStr(range.start)}-{minToStr(range.end)}
                                </span>
                              </div>
                              {/* right resize */}
                              <div
                                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/10 hover:bg-black/25 rounded-r-md"
                                onMouseDown={e => startDrag(e, "emp", "end", range.start, range.end, emp.id)}
                              />
                            </div>
                          ) : (
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
        <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex-shrink-0 flex-wrap">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded ${color} inline-block shadow-sm`} />
              <span className="text-[11px] text-slate-500 font-medium">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
