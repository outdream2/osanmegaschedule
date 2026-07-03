import React, { useState, useEffect, useCallback, useMemo } from "react";
import { X, Pencil, Clock } from "lucide-react";
import { Employee } from "../../types";

const DISPLAY_START = 10 * 60;
const DISPLAY_END = 22 * 60;
const TOTAL = DISPLAY_END - DISPLAY_START;
const BREAK_MIN = 11 * 60; // earliest selectable break start (11:00)
const STEP = 30;            // 30-minute increment for break time

const SKIP_TYPES = new Set(["휴무", "월차", "지정휴무"]);

const TYPE_COLORS: Record<string, {
  bg: string; text: string; dot: string;
  chipBg: string; chipText: string; chipBorder: string;
  tabBg: string; tabText: string;
}> = {
  "오픈":    { bg: "bg-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500", chipBg: "bg-emerald-100", chipText: "text-emerald-800", chipBorder: "border-emerald-300", tabBg: "bg-emerald-100", tabText: "text-emerald-800" },
  "미들":    { bg: "bg-blue-200",    text: "text-blue-700",    dot: "bg-blue-500",    chipBg: "bg-blue-100",    chipText: "text-blue-800",    chipBorder: "border-blue-300",    tabBg: "bg-blue-100",    tabText: "text-blue-800"    },
  "마감":    { bg: "bg-rose-200",    text: "text-rose-700",    dot: "bg-rose-500",    chipBg: "bg-rose-100",    chipText: "text-rose-800",    chipBorder: "border-rose-300",    tabBg: "bg-rose-100",    tabText: "text-rose-800"    },
  "오전반차": { bg: "bg-lime-200",   text: "text-lime-700",   dot: "bg-lime-500",   chipBg: "bg-lime-100",   chipText: "text-lime-800",   chipBorder: "border-lime-300",   tabBg: "bg-lime-100",   tabText: "text-lime-800"   },
  "오후반차": { bg: "bg-amber-200",  text: "text-amber-700",  dot: "bg-amber-500",  chipBg: "bg-amber-100",  chipText: "text-amber-800",  chipBorder: "border-amber-300",  tabBg: "bg-amber-100",  tabText: "text-amber-800"  },
};
const DEFAULT_COLOR = {
  bg: "bg-slate-200", text: "text-slate-700", dot: "bg-slate-400",
  chipBg: "bg-slate-100", chipText: "text-slate-700", chipBorder: "border-slate-300",
  tabBg: "bg-slate-100", tabText: "text-slate-700",
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
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function safeRange(start: number, end: number, fallbackStart: number, fallbackEnd: number): { start: number; end: number } {
  if (
    Number.isFinite(start) && Number.isFinite(end) &&
    end - start >= STEP &&
    start >= BREAK_MIN && end <= DISPLAY_END
  ) return { start, end };
  return { start: fallbackStart, end: fallbackEnd };
}

interface Range { start: number; end: number }

// ── Sub-components defined outside to prevent remount on parent re-render ──

interface TimeAdjusterProps {
  kind: "lunch" | "rest";
  range: Range;
  theme: {
    sectionBg: string; border: string;
    headerText: string; btnBg: string; btnText: string; timeText: string;
  };
  onAdjust: (kind: "lunch" | "rest", part: "start" | "end", delta: number) => void;
}

const TimeAdjuster: React.FC<TimeAdjusterProps> = React.memo(({ kind, range, theme, onAdjust }) => {
  const label = kind === "lunch" ? "점심" : "휴게";
  const duration = range.end - range.start;
  return (
    <div className={`flex flex-col items-center gap-2 p-3 rounded-xl border ${theme.sectionBg} ${theme.border} min-w-[110px] shrink-0`}>
      <div className={`flex items-center gap-1 text-[10px] font-black ${theme.headerText}`}>
        <Clock size={10} />{label}시간
      </div>
      {/* Start */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[8px] font-semibold text-slate-400">시작</span>
        <div className="flex items-center gap-1">
          <button className={`w-5 h-5 rounded text-[11px] font-black ${theme.btnBg} ${theme.btnText} transition cursor-pointer flex items-center justify-center`}
            onClick={() => onAdjust(kind, "start", -STEP)}>−</button>
          <span className={`text-sm font-black ${theme.timeText} tabular-nums w-10 text-center`}>{minToStr(range.start)}</span>
          <button className={`w-5 h-5 rounded text-[11px] font-black ${theme.btnBg} ${theme.btnText} transition cursor-pointer flex items-center justify-center`}
            onClick={() => onAdjust(kind, "start", +STEP)}>+</button>
        </div>
      </div>
      <div className="w-6 h-px bg-current opacity-20" />
      {/* End */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[8px] font-semibold text-slate-400">종료</span>
        <div className="flex items-center gap-1">
          <button className={`w-5 h-5 rounded text-[11px] font-black ${theme.btnBg} ${theme.btnText} transition cursor-pointer flex items-center justify-center`}
            onClick={() => onAdjust(kind, "end", -STEP)}>−</button>
          <span className={`text-sm font-black ${theme.timeText} tabular-nums w-10 text-center`}>{minToStr(range.end)}</span>
          <button className={`w-5 h-5 rounded text-[11px] font-black ${theme.btnBg} ${theme.btnText} transition cursor-pointer flex items-center justify-center`}
            onClick={() => onAdjust(kind, "end", +STEP)}>+</button>
        </div>
      </div>
      <span className={`text-[9px] font-bold ${theme.timeText} opacity-60`}>{duration}분</span>
    </div>
  );
});
TimeAdjuster.displayName = "TimeAdjuster";

type WorkerEntry = { emp: Employee; schedule: { type: string; date: string; workingHours?: string } };

interface EmployeeChipsProps {
  kind: "lunch" | "rest";
  assignees: Set<number>;
  allWorkers: WorkerEntry[];
  activeTypeTab: string;
  onTypeTabChange: (tab: string) => void;
  onToggle: (kind: "lunch" | "rest", empId: number) => void;
}

const EmployeeChips: React.FC<EmployeeChipsProps> = React.memo(({
  kind, assignees, allWorkers, activeTypeTab, onTypeTabChange, onToggle,
}) => {
  const shiftTypes = useMemo(() => {
    const types = [...new Set(allWorkers.map(w => w.schedule.type))];
    return ["전체", ...types];
  }, [allWorkers]);

  const filtered = activeTypeTab === "전체"
    ? allWorkers
    : allWorkers.filter(w => w.schedule.type === activeTypeTab);

  return (
    <div className="flex flex-col gap-2 flex-1 min-w-0">
      {/* Type tabs */}
      <div className="flex items-center gap-0.5 flex-wrap">
        {shiftTypes.map(type => {
          const colors = TYPE_COLORS[type] ?? DEFAULT_COLOR;
          const isActive = activeTypeTab === type;
          const count = (type === "전체" ? allWorkers : allWorkers.filter(w => w.schedule.type === type))
            .filter(w => assignees.has(w.emp.id)).length;
          return (
            <button
              key={type}
              onClick={() => onTypeTabChange(type)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition border cursor-pointer ${
                isActive
                  ? `${colors.tabBg} ${colors.tabText} border-current shadow-sm`
                  : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
              }`}
            >
              {type !== "전체" && (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? (TYPE_COLORS[type]?.dot ?? DEFAULT_COLOR.dot) : "bg-slate-300"}`} />
              )}
              {type}
              {count > 0 && (
                <span className={`text-[9px] font-black ${isActive ? "" : "text-slate-400"}`}>({count})</span>
              )}
            </button>
          );
        })}
      </div>
      {/* Chips */}
      <div className="flex flex-wrap gap-1.5">
        {filtered.map(({ emp, schedule }) => {
          const colors = TYPE_COLORS[schedule.type] ?? DEFAULT_COLOR;
          const isSelected = assignees.has(emp.id);
          return (
            <button
              key={emp.id}
              onClick={() => onToggle(kind, emp.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition border cursor-pointer select-none ${
                isSelected
                  ? `${colors.chipBg} ${colors.chipText} ${colors.chipBorder} shadow-sm`
                  : "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? colors.dot : "bg-gray-300"}`} />
              {emp.name}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <span className="text-[11px] text-slate-300 italic">해당 유형 없음</span>
        )}
      </div>
    </div>
  );
});
EmployeeChips.displayName = "EmployeeChips";

// ── Main component ──

interface Props {
  date: string;
  employees: Employee[];
  typeHoursMap?: Record<string, string>;
  pharmTypeHoursMap?: Record<string, string>;
  onClose: () => void;
  onEditEmployee?: (emp: Employee) => void;
  onScheduleUpdate?: () => void;
  onUpdateSchedule?: (data: {
    employeeId: number;
    date: string;
    type: string;
    workingHours: string;
    actualHours: string;
    memo?: string;
  }) => Promise<void>;
}

export const DayTimelineModal: React.FC<Props> = ({
  date, employees, typeHoursMap, pharmTypeHoursMap, onClose, onEditEmployee, onUpdateSchedule,
}) => {
  const [editingWork, setEditingWork] = useState<{ empId: number; value: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"전체" | "사원" | "약사">("전체");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [lunchTime, setLunchTime] = useState<Range>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("tl_lunch") || "");
      return safeRange(toMin(s.start), toMin(s.end), 12 * 60, 12 * 60 + 30);
    } catch { return { start: 12 * 60, end: 12 * 60 + 30 }; }
  });
  const [restTime, setRestTime] = useState<Range>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("tl_rest") || "");
      return safeRange(toMin(s.start), toMin(s.end), 15 * 60, 15 * 60 + 30);
    } catch { return { start: 15 * 60, end: 15 * 60 + 30 }; }
  });

  const [lunchAssignees, setLunchAssignees] = useState<Set<number>>(new Set());
  const [restAssignees,  setRestAssignees]  = useState<Set<number>>(new Set());

  // Reload assignees when date changes (fixes stale-date bug)
  useEffect(() => {
    try { setLunchAssignees(new Set(JSON.parse(localStorage.getItem(`tl_lunch_assignees_${date}`) || "[]"))); } catch { setLunchAssignees(new Set()); }
    try { setRestAssignees(new Set(JSON.parse(localStorage.getItem(`tl_rest_assignees_${date}`) || "[]"))); } catch { setRestAssignees(new Set()); }
  }, [date]);

  const [lunchTypeTab, setLunchTypeTab] = useState("전체");
  const [restTypeTab,  setRestTypeTab]  = useState("전체");

  const adjustTime = useCallback((kind: "lunch" | "rest", part: "start" | "end", delta: number) => {
    const setter = kind === "lunch" ? setLunchTime : setRestTime;
    const key    = kind === "lunch" ? "tl_lunch"  : "tl_rest";
    setter(prev => {
      const next = { ...prev };
      if (part === "start") {
        next.start = clamp(prev.start + delta, BREAK_MIN, prev.end - STEP);
      } else {
        next.end = clamp(prev.end + delta, prev.start + STEP, DISPLAY_END);
      }
      localStorage.setItem(key, JSON.stringify({ start: minToStr(next.start), end: minToStr(next.end) }));
      return next;
    });
  }, []);

  const toggleAssignee = useCallback((kind: "lunch" | "rest", empId: number) => {
    const setter = kind === "lunch" ? setLunchAssignees : setRestAssignees;
    const keyFn  = (d: string) => `tl_${kind}_assignees_${d}`;
    setter(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      localStorage.setItem(keyFn(date), JSON.stringify([...next]));
      return next;
    });
  }, [date]);

  const d = new Date(date + "T00:00:00");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const title = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;

  const TYPE_ORDER: Record<string, number> = { "오픈": 0, "오전반차": 1, "미들": 2, "오후반차": 3, "마감": 4 };

  const workers = useMemo(() => employees
    .map(emp => {
      const s = emp.schedules.find(sc => sc.date === date);
      if (!s || SKIP_TYPES.has(s.type)) return null;
      const hoursMap = emp.position === "약사" ? (pharmTypeHoursMap ?? typeHoursMap) : typeHoursMap;
      const wh = s.workingHours || hoursMap?.[s.type] || "";
      return { emp, schedule: s, wh };
    })
    .filter(Boolean)
    .sort((a, b) => (TYPE_ORDER[a!.schedule.type] ?? 99) - (TYPE_ORDER[b!.schedule.type] ?? 99)) as WorkerEntry[],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [employees, date, typeHoursMap, pharmTypeHoursMap]);

  const pharmacistWorkers = useMemo(() => workers.filter(w => w.emp.position === "약사"), [workers]);
  const staffWorkers      = useMemo(() => workers.filter(w => w.emp.position !== "약사"), [workers]);
  const tabWorkers        = activeTab === "약사" ? pharmacistWorkers : activeTab === "사원" ? staffWorkers : workers;

  const [dragRowId, setDragRowId] = useState<number | null>(null);
  const [orderedIds, setOrderedIds] = useState<number[]>(() => tabWorkers.map(w => w.emp.id));

  useEffect(() => {
    setOrderedIds(prev => {
      const validIds = new Set(tabWorkers.map(w => w.emp.id));
      const kept    = prev.filter(id => validIds.has(id));
      const missing = tabWorkers.map(w => w.emp.id).filter(id => !kept.includes(id));
      return [...kept, ...missing];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, workers]);

  const displayWorkers = useMemo(() => {
    const byId = new Map(tabWorkers.map(w => [w.emp.id, w]));
    const ordered = orderedIds.flatMap(id => { const w = byId.get(id); return w ? [w] : []; });
    const orderedSet = new Set(orderedIds);
    tabWorkers.forEach(w => { if (!orderedSet.has(w.emp.id)) ordered.push(w); });
    return ordered;
  }, [orderedIds, tabWorkers]);

  const workRanges = useMemo(() => {
    const r: Record<number, Range | null> = {};
    workers.forEach(w => { r[w.emp.id] = parseRange(w.wh); });
    return r;
  }, [workers]);

  const handleRowDragStart = useCallback((e: React.DragEvent, empId: number) => {
    e.dataTransfer.effectAllowed = "move";
    setDragRowId(empId);
  }, []);
  const handleRowDragOver = useCallback((e: React.DragEvent, empId: number) => {
    e.preventDefault();
    if (dragRowId === null || dragRowId === empId) return;
    setOrderedIds(prev => {
      const ids = [...prev];
      const fi = ids.indexOf(dragRowId), ti = ids.indexOf(empId);
      if (fi === -1 || ti === -1) return prev;
      ids.splice(fi, 1); ids.splice(ti, 0, dragRowId);
      return ids;
    });
  }, [dragRowId]);
  const handleRowDrop    = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragRowId(null); }, []);
  const handleRowDragEnd = useCallback(() => setDragRowId(null), []);

  const lunchTheme = { sectionBg: "bg-yellow-50", border: "border-yellow-200", headerText: "text-yellow-800", btnBg: "bg-yellow-200", btnText: "text-yellow-900", timeText: "text-yellow-900" };
  const restTheme  = { sectionBg: "bg-violet-50", border: "border-violet-200", headerText: "text-violet-800", btnBg: "bg-violet-200", btnText: "text-violet-900", timeText: "text-violet-900" };

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
          {(["전체", "사원", "약사"] as const).map(tab => {
            const count = tab === "전체" ? workers.length : tab === "약사" ? pharmacistWorkers.length : staffWorkers.length;
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 text-xs font-bold rounded-t-lg border border-b-0 transition-colors cursor-pointer ${
                  activeTab === tab
                    ? "bg-white border-slate-200 text-slate-800 -mb-px z-10"
                    : "bg-slate-50 border-transparent text-slate-400 hover:text-slate-600"
                }`}>
                {tab}
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === tab ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-500"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 select-none">

          {/* ── 근무시간 섹션 ── */}
          <div className="px-4 pt-3 pb-2">
            {/* Legend above timeline */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">근무시간</span>
              {Object.entries(TYPE_COLORS).map(([type, colors]) => (
                <div key={type} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  <span className="text-[9px] font-semibold text-slate-500">{type}</span>
                </div>
              ))}
            </div>

            {displayWorkers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-20 gap-2">
                <span className="text-xl">📅</span>
                <span className="text-slate-400 text-sm font-medium">이 날 근무자가 없습니다</span>
              </div>
            ) : (
              <div className="flex gap-3 min-w-0">
                {/* Name column */}
                <div className="flex-shrink-0 w-[88px]">
                  <div className="h-7" />
                  {displayWorkers.map(({ emp, schedule }) => {
                    const colors = TYPE_COLORS[schedule.type] ?? DEFAULT_COLOR;
                    return (
                      <div key={emp.id}
                        className={`mb-1 h-9 flex flex-col justify-center gap-0 group cursor-grab active:cursor-grabbing transition-opacity ${dragRowId === emp.id ? "opacity-40" : "opacity-100"}`}
                        draggable
                        onDragStart={e => handleRowDragStart(e, emp.id)}
                        onDragOver={e => handleRowDragOver(e, emp.id)}
                        onDrop={handleRowDrop}
                        onDragEnd={handleRowDragEnd}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
                          <span className="text-[11px] font-bold text-slate-800 truncate">{emp.name}</span>
                          {onEditEmployee && (
                            <button onClick={() => onEditEmployee(emp)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 transition-all cursor-pointer shrink-0">
                              <Pencil size={9} className="text-slate-400" />
                            </button>
                          )}
                        </div>
                        <span className={`text-[9px] font-semibold ${colors.text} leading-tight`}>{schedule.type}</span>
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
                                      await onUpdateSchedule?.({
                                        employeeId: emp.id, date,
                                        type: schedule.type,
                                        workingHours: editingWork.value,
                                        actualHours: (schedule as any).actualHours || "",
                                        memo: (schedule as any).memo || "",
                                      });
                                      setEditingWork(null);
                                    }
                                    if (e.key === "Escape") setEditingWork(null);
                                  }}
                                  placeholder="09:00-18:00"
                                  className="text-[9px] font-mono border border-indigo-300 rounded px-1 py-0 w-[70px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                />
                                <button
                                  className="text-[8px] text-indigo-500 hover:text-indigo-700 cursor-pointer font-bold"
                                  onClick={async e => {
                                    e.stopPropagation();
                                    await onUpdateSchedule?.({
                                      employeeId: emp.id, date,
                                      type: schedule.type,
                                      workingHours: editingWork.value,
                                      actualHours: (schedule as any).actualHours || "",
                                      memo: (schedule as any).memo || "",
                                    });
                                    setEditingWork(null);
                                  }}
                                >✓</button>
                                <button
                                  className="text-[8px] text-slate-400 hover:text-slate-600 cursor-pointer"
                                  onClick={e => { e.stopPropagation(); setEditingWork(null); }}
                                >✕</button>
                              </div>
                            );
                          }
                          return displayHours ? (
                            <span
                              className={`text-[9px] font-mono leading-none cursor-pointer hover:text-indigo-600 hover:underline ${onUpdateSchedule ? "text-slate-400" : "text-slate-300"}`}
                              onClick={e => {
                                if (!onUpdateSchedule) return;
                                e.stopPropagation();
                                setEditingWork({ empId: emp.id, value: displayHours });
                              }}
                              title={onUpdateSchedule ? "클릭해서 근무시간 편집" : undefined}
                            >
                              {displayHours}
                            </span>
                          ) : (
                            onUpdateSchedule ? (
                              <span
                                className="text-[9px] text-slate-300 leading-none cursor-pointer hover:text-indigo-400"
                                onClick={e => { e.stopPropagation(); setEditingWork({ empId: emp.id, value: "" }); }}
                              >
                                + 시간
                              </span>
                            ) : null
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>

                {/* Grid — draggable only from name column; grid is display-only */}
                <div className="flex-1 min-w-0 overflow-x-auto">
                  <div style={{ minWidth: "560px" }}>
                    {/* Time axis */}
                    <div className="relative h-7 mb-0.5">
                      <div className="absolute top-0 bottom-0 bg-orange-100 rounded pointer-events-none flex items-end justify-center pb-0.5"
                        style={{ left: `${pct(14 * 60)}%`, width: `${widthPct(14 * 60, 17 * 60)}%` }}>
                        <span className="text-[8px] font-black text-orange-500 tracking-tight">피크타임</span>
                      </div>
                      {SLOTS.map((slot, i) => (
                        <div key={slot} className="absolute top-0 flex flex-col items-center"
                          style={{ left: `${(i / (SLOTS.length - 1)) * 100}%`, transform: "translateX(-50%)" }}>
                          <span className={`text-[9px] whitespace-nowrap font-medium ${i >= 8 && i <= 14 ? "text-orange-500 font-bold" : "text-slate-400"}`}>{slot}</span>
                          <span className={`mt-0.5 block w-px h-1.5 ${i >= 8 && i <= 14 ? "bg-orange-300" : "bg-slate-300"}`} />
                        </div>
                      ))}
                    </div>
                    {/* Bars */}
                    <div className="relative">
                      <div className="absolute top-0 bottom-0 bg-orange-50 border-l-2 border-r-2 border-orange-200/70 pointer-events-none"
                        style={{ left: `${pct(14 * 60)}%`, width: `${widthPct(14 * 60, 17 * 60)}%` }} />
                      {SLOTS.map((slot, i) => (
                        <div key={`g-${slot}`} className="absolute top-0 bottom-0 border-l pointer-events-none"
                          style={{ left: `${(i / (SLOTS.length - 1)) * 100}%`, borderColor: i % 2 === 0 ? "#e2e8f0" : "#f8fafc" }} />
                      ))}
                      {displayWorkers.map(({ emp, schedule }) => {
                        const colors = TYPE_COLORS[schedule.type] ?? DEFAULT_COLOR;
                        const workRange = workRanges[emp.id];
                        return (
                          <div key={emp.id}
                            className={`relative mb-1 h-9 bg-slate-50 rounded-lg border border-slate-100 transition-opacity ${dragRowId === emp.id ? "opacity-40" : "opacity-100"}`}>
                            {workRange ? (
                              <div className={`absolute top-1 bottom-1 rounded-md ${colors.bg} opacity-80`}
                                style={{ left: `${pct(workRange.start)}%`, width: `${Math.max(widthPct(workRange.start, workRange.end), 0.5)}%` }}>
                                <div className="flex items-center justify-center h-full">
                                  <span className={`text-[9px] font-bold select-none truncate px-1 ${colors.text}`}>
                                    {minToStr(workRange.start)}~{minToStr(workRange.end)}
                                  </span>
                                </div>
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

          <div className="mx-4 h-px bg-slate-100" />

          {/* ── 점심시간 섹션 ── */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              <span className="text-[11px] font-black text-yellow-800">점심시간</span>
              {lunchAssignees.size > 0 && (
                <span className="text-[10px] text-yellow-600 font-semibold">{lunchAssignees.size}명 배정됨</span>
              )}
            </div>
            <div className="flex gap-3 items-start">
              <TimeAdjuster kind="lunch" range={lunchTime} theme={lunchTheme} onAdjust={adjustTime} />
              <EmployeeChips
                kind="lunch"
                assignees={lunchAssignees}
                allWorkers={workers}
                activeTypeTab={lunchTypeTab}
                onTypeTabChange={setLunchTypeTab}
                onToggle={toggleAssignee}
              />
            </div>
          </div>

          <div className="mx-4 h-px bg-slate-100" />

          {/* ── 휴게시간 섹션 ── */}
          <div className="px-4 py-3 pb-5">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-violet-400" />
              <span className="text-[11px] font-black text-violet-800">휴게시간</span>
              {restAssignees.size > 0 && (
                <span className="text-[10px] text-violet-600 font-semibold">{restAssignees.size}명 배정됨</span>
              )}
            </div>
            <div className="flex gap-3 items-start">
              <TimeAdjuster kind="rest" range={restTime} theme={restTheme} onAdjust={adjustTime} />
              <EmployeeChips
                kind="rest"
                assignees={restAssignees}
                allWorkers={workers}
                activeTypeTab={restTypeTab}
                onTypeTabChange={setRestTypeTab}
                onToggle={toggleAssignee}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
