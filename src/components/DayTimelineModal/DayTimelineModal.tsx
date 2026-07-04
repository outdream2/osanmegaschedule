import React, { useState, useEffect, useCallback, useMemo } from "react";
import { X, Pencil } from "lucide-react";
import { Employee } from "../../types";
import { getTypeHex, derivePresetTones, type ScheduleTypeEntry } from "../../constants";

// ─── Constants ───────────────────────────────────────────────────────────────
const DISPLAY_START = 10 * 60;
const DISPLAY_END   = 22 * 60;
const TOTAL = DISPLAY_END - DISPLAY_START;
const SKIP_TYPES = new Set(["휴무", "월차", "지정휴무"]);

// 1-hour slots for main work timeline (10:00 ~ 22:00)
const HOUR_SLOTS: string[] = [];
for (let h = 10; h <= 22; h++) HOUR_SLOTS.push(`${String(h).padStart(2, "0")}:00`);

// 30-min break time slots
const LUNCH_SLOTS = ["11:00", "11:30", "12:00", "12:30", "13:00", "13:30"]; // 11:00~14:00
const REST_SLOTS  = ["15:30", "16:00", "16:30", "17:00", "17:30"];           // 15:30~18:00

const ZONE_ROWS = ["카운터", "매장"] as const;
type ZoneRow = typeof ZONE_ROWS[number];

const TYPE_ORDER: Record<string, number> = { "오픈": 0, "오전반차": 1, "미들": 2, "오후반차": 3, "마감": 4 };

/**
 * Runtime hex-based color tone used across the modal.
 * Built once per render via useMemo from the user's schedule type entries so
 * SettingsModal color changes flow through automatically.
 */
type TypeTone = { bg: string; text: string; dot: string; chipBg: string; chipText: string; chipBorder: string };

const DEFAULT_TONE: TypeTone = {
  bg: "#e2e8f0", text: "#334155", dot: "#94a3b8",
  chipBg: "#f1f5f9", chipText: "#334155", chipBorder: "#e2e8f0",
};

/** Build the tone lookup from the settings entries, falling back to built-in defaults for known types. */
function buildTypeTones(entries?: ScheduleTypeEntry[]): Record<string, TypeTone> {
  const out: Record<string, TypeTone> = {};
  const knownTypes = ["오픈", "미들", "마감", "오픈마감", "오전반차", "오후반차"];
  for (const t of knownTypes) {
    const hex = getTypeHex(t, entries);
    const tones = derivePresetTones(hex);
    out[t] = {
      bg: hex,            // use the direct color hex so each type is visually distinct
      text: tones.text,
      dot: tones.dot,
      chipBg: tones.bg,
      chipText: tones.text,
      chipBorder: tones.chip,
    };
  }
  for (const e of entries ?? []) {
    if (!e.type || out[e.type]) continue;
    const hex = getTypeHex(e.type, entries);
    const tones = derivePresetTones(hex);
    out[e.type] = {
      bg: hex,
      text: tones.text,
      dot: tones.dot,
      chipBg: tones.bg,
      chipText: tones.text,
      chipBorder: tones.chip,
    };
  }
  return out;
}

// ─── Types ───────────────────────────────────────────────────────────────────
type WorkerEntry = {
  emp: Employee;
  schedule: { type: string; date: string; workingHours?: string; actualHours?: string; memo?: string };
  wh: string;
};
type SlotMap = Record<string, number[]>;  // timeSlot → empId[]
type ZoneMap = Record<string, SlotMap>;   // zoneName → SlotMap

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseRange(wh: string): { start: number; end: number } | null {
  if (!wh) return null;
  const m = wh.match(/^(\d{1,2})(?::(\d{2}))?\s*[-~]\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  return { start: parseInt(m[1]) * 60 + (m[2] ? parseInt(m[2]) : 0), end: parseInt(m[3]) * 60 + (m[4] ? parseInt(m[4]) : 0) };
}
function pct(min: number): number {
  return ((Math.max(DISPLAY_START, Math.min(DISPLAY_END, min)) - DISPLAY_START) / TOTAL) * 100;
}
function widthPct(start: number, end: number): number {
  const s = Math.max(DISPLAY_START, start);
  const e = Math.min(DISPLAY_END, end);
  return e <= s ? 0 : ((e - s) / TOTAL) * 100;
}
function minToStr(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
/** Shift a "HH:MM" slot by N minutes, returning a new "HH:MM" string. */
function shiftSlot(base: string, offsetMin: number): string {
  const [h, m] = base.split(":").map(Number);
  const total = h * 60 + m + offsetMin;
  const nh = Math.floor(total / 60);
  const nm = ((total % 60) + 60) % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}
function datesInMonth(dateStr: string): string[] {
  const d = new Date(dateStr + "T00:00:00");
  const y = d.getFullYear(), mo = d.getMonth();
  const count = new Date(y, mo + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const day = i + 1;
    return `${y}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
}

// ─── Sub-component: WorkerChips ──────────────────────────────────────────────
interface WorkerChipsProps {
  workers: WorkerEntry[];
  assignedIds: Set<number>;
  draggingId: number | null;
  onDragStart: (e: React.DragEvent, empId: number) => void;
  onDragEnd: () => void;
  compact?: boolean;
  typeTones: Record<string, TypeTone>;
}

const WorkerChips: React.FC<WorkerChipsProps> = React.memo(({
  workers, assignedIds, draggingId, onDragStart, onDragEnd, compact, typeTones,
}) => (
  <div className="flex flex-wrap gap-1">
    {workers.length === 0 && <span className="text-[10px] text-slate-300 italic">근무자 없음</span>}
    {workers.map(({ emp, schedule }) => {
      const c = typeTones[schedule.type] ?? DEFAULT_TONE;
      const assigned = assignedIds.has(emp.id);
      return (
        <div key={emp.id} draggable
          onDragStart={e => onDragStart(e, emp.id)}
          onDragEnd={onDragEnd}
          style={assigned
            ? { backgroundColor: c.chipBg, color: c.chipText, borderColor: c.chipBorder }
            : undefined}
          className={`flex items-center gap-1 ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"} rounded-full font-bold border cursor-grab active:cursor-grabbing select-none transition ${
            assigned ? "opacity-70" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
          } ${draggingId === emp.id ? "opacity-20" : ""}`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: assigned ? c.dot : "#cbd5e1" }}
          />
          {emp.name}
        </div>
      );
    })}
  </div>
));
WorkerChips.displayName = "WorkerChips";

// ─── Sub-component: BreakTimeline ─────────────────────────────────────────────
interface BreakTimelineProps {
  kind: "lunch" | "rest";
  slots: string[];
  slotMap: SlotMap;
  workers: WorkerEntry[];       // drag-source chips (tab-filtered)
  allWorkers: WorkerEntry[];    // all workers for slot display lookup
  onApplyMonth: () => void;
  onDropToSlot: (slot: string, empId: number) => void;
  onRemoveFromSlot: (slot: string, empId: number) => void;
  typeTones: Record<string, TypeTone>;
  offset: number;
  onShiftOffset: (delta: number) => void;
}

const BreakTimeline: React.FC<BreakTimelineProps> = React.memo(({
  kind, slots, slotMap, workers, allWorkers, onApplyMonth, onDropToSlot, onRemoveFromSlot, typeTones, offset, onShiftOffset,
}) => {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [confirmMonth, setConfirmMonth] = useState(false);

  const theme = kind === "lunch"
    ? { label: "점심시간", dot: "bg-yellow-400", hdr: "text-yellow-800", border: "border-yellow-200", bg: "bg-yellow-50", slotHdr: "bg-yellow-100 text-yellow-700 border-yellow-200", cellHover: "hover:bg-yellow-50" }
    : { label: "휴게시간", dot: "bg-violet-400", hdr: "text-violet-800", border: "border-violet-200", bg: "bg-violet-50", slotHdr: "bg-violet-100 text-violet-700 border-violet-200", cellHover: "hover:bg-violet-50" };

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

  return (
    <div className={`rounded-xl border ${theme.border} ${theme.bg} p-3`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${theme.dot}`} />
          <span className={`text-[11px] font-black ${theme.hdr}`}>{theme.label}</span>
          <div className="flex items-center gap-0.5 ml-1">
            <button
              type="button"
              onClick={() => onShiftOffset(-30)}
              disabled={offset <= -60}
              className="w-5 h-5 flex items-center justify-center text-[11px] font-bold rounded bg-white border border-slate-200 text-slate-500 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="30분 앞으로"
            >-</button>
            <span className="text-[9px] font-mono text-slate-500 min-w-[36px] text-center">
              {offset === 0 ? "기본" : `${offset > 0 ? "+" : ""}${offset}분`}
            </span>
            <button
              type="button"
              onClick={() => onShiftOffset(30)}
              disabled={offset >= 60}
              className="w-5 h-5 flex items-center justify-center text-[11px] font-bold rounded bg-white border border-slate-200 text-slate-500 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="30분 뒤로"
            >+</button>
          </div>
          {assignedIds.size > 0 && (
            <span className={`text-[10px] font-semibold ${theme.hdr} opacity-70`}>{assignedIds.size}명 배정됨</span>
          )}
        </div>
        {confirmMonth ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500">이 달 전체에 적용?</span>
            <button onClick={() => { onApplyMonth(); setConfirmMonth(false); }}
              className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500 text-white hover:bg-indigo-600 cursor-pointer">예</button>
            <button onClick={() => setConfirmMonth(false)}
              className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">취소</button>
          </div>
        ) : (
          <button onClick={() => setConfirmMonth(true)}
            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500 hover:border-slate-400 transition cursor-pointer">
            전월 적용
          </button>
        )}
      </div>

      {/* Slot timeline grid */}
      <div className="overflow-x-auto">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden" style={{ minWidth: `${slots.length * 68}px` }}>
          {slots.map(slot => {
            const assignedHere = slotMap[slot] ?? [];
            return (
              <div key={slot}
                className={`flex-1 flex flex-col border-r border-slate-200 last:border-r-0 transition ${theme.cellHover}`}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={e => { e.preventDefault(); if (draggingId !== null) onDropToSlot(slot, draggingId); }}
              >
                <div className={`text-center text-[9px] font-bold py-0.5 border-b ${theme.slotHdr}`}>{slot}</div>
                <div className="p-1 min-h-[30px] flex flex-wrap gap-0.5 items-start">
                  {assignedHere.map(empId => {
                    const w = allWorkers.find(ww => ww.emp.id === empId);
                    if (!w) return null;
                    const c = typeTones[w.schedule.type] ?? DEFAULT_TONE;
                    return (
                      <button key={empId} onClick={() => onRemoveFromSlot(slot, empId)}
                        title="클릭하여 제거"
                        style={{ backgroundColor: c.chipBg, color: c.chipText, borderColor: c.chipBorder }}
                        className="px-1.5 py-px rounded text-[9px] font-bold cursor-pointer border hover:opacity-60 transition">
                        {w.emp.name}
                      </button>
                    );
                  })}
                  {assignedHere.length === 0 && (
                    <span className="text-[8px] text-slate-300 italic w-full text-center mt-1.5">드롭</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drag-source chips */}
      <div className="mt-2 pt-2 border-t border-slate-200/70">
        <WorkerChips
          workers={workers}
          assignedIds={assignedIds}
          draggingId={draggingId}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          typeTones={typeTones}
        />
      </div>
    </div>
  );
});
BreakTimeline.displayName = "BreakTimeline";

// ─── Sub-component: ZoneSection ──────────────────────────────────────────────
interface ZoneSectionProps {
  zoneMap: ZoneMap;
  workers: WorkerEntry[];       // drag-source chips (tab-filtered)
  allWorkers: WorkerEntry[];    // all workers for slot display lookup
  onDropToZone: (zone: ZoneRow, slot: string, empId: number) => void;
  onRemoveFromZone: (zone: ZoneRow, slot: string, empId: number) => void;
  onApplyMonth: () => void;
  typeTones: Record<string, TypeTone>;
  workRanges: Record<number, { start: number; end: number } | null>;
  lunchSlotMap: SlotMap; // to block zone assignment during lunch time
}

// Zone section uses HOUR_SLOTS as column keys (slice off the last end-boundary slot)
const ZONE_SLOTS = HOUR_SLOTS.slice(0, -1); // 10:00~21:00 = 12 columns

const ZoneSection: React.FC<ZoneSectionProps> = React.memo(({
  zoneMap, workers, allWorkers, onDropToZone, onRemoveFromZone, onApplyMonth, typeTones, workRanges, lunchSlotMap,
}) => {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [confirmMonth, setConfirmMonth] = useState(false);

  const tryDropToZone = useCallback((zone: ZoneRow, slot: string, empId: number) => {
    const slotHour = parseInt(slot.split(":")[0], 10);
    const slotStart = slotHour * 60;
    const slotEnd = slotStart + 60;

    // 출근시간 체크
    const range = workRanges[empId];
    if (range && (slotEnd <= range.start || slotStart >= range.end)) {
      alert("출근 시간이 아니어서 배정할 수 없습니다.");
      return;
    }

    // 점심시간 체크: 해당 직원이 이 시간대에 점심 배정돼 있으면 차단
    const lunchConflict = Object.entries(lunchSlotMap).some(([lunchSlot, ids]) => {
      if (!ids.includes(empId)) return false;
      const [lh, lm] = lunchSlot.split(":").map(Number);
      const lunchStart = lh * 60 + lm;
      const lunchEnd = lunchStart + 30;
      return lunchStart < slotEnd && lunchEnd > slotStart;
    });
    if (lunchConflict) {
      alert("점심시간이 배정된 시간대입니다.");
      return;
    }

    onDropToZone(zone, slot, empId);
  }, [workRanges, lunchSlotMap, onDropToZone]);

  const assignedIds = useMemo(() => {
    const ids = new Set<number>();
    ZONE_ROWS.forEach(z => (Object.values(zoneMap[z] ?? {}) as number[][]).forEach(arr => arr.forEach(id => ids.add(id))));
    return ids;
  }, [zoneMap]);

  const handleDragStart = useCallback((e: React.DragEvent, id: number) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }, []);
  const handleDragEnd = useCallback(() => setDraggingId(null), []);

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-400" />
          <span className="text-[11px] font-black text-sky-800">매장구역 배정</span>
          {assignedIds.size > 0 && (
            <span className="text-[10px] font-semibold text-sky-700 opacity-70">{assignedIds.size}명 배정됨</span>
          )}
        </div>
        {confirmMonth ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500">이 달 전체에 적용?</span>
            <button onClick={() => { onApplyMonth(); setConfirmMonth(false); }}
              className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500 text-white hover:bg-indigo-600 cursor-pointer">예</button>
            <button onClick={() => setConfirmMonth(false)}
              className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">취소</button>
          </div>
        ) : (
          <button onClick={() => setConfirmMonth(true)}
            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500 hover:border-slate-400 transition cursor-pointer">
            전월 적용
          </button>
        )}
      </div>

      {/* Zone grid */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: "560px" }}>
          {/* Hour header */}
          <div className="flex mb-0.5">
            <div className="w-12 shrink-0" />
            {ZONE_SLOTS.map(slot => (
              <div key={slot} className="flex-1 text-center">
                <span className="text-[8px] font-bold text-sky-600">{slot}</span>
              </div>
            ))}
          </div>
          {/* Zone rows */}
          {ZONE_ROWS.map(zone => {
            const isCounter = zone === "카운터";
            return (
            <div key={zone} className="flex items-stretch mb-0.5">
              <div className="w-12 shrink-0 flex items-center">
                <span className={`text-[9px] font-black uppercase tracking-wide ${isCounter ? "text-rose-600" : "text-sky-700"}`}>{zone}</span>
              </div>
              {ZONE_SLOTS.map(slot => {
                const assignedHere = (zoneMap[zone] ?? {})[slot] ?? [];
                return (
                  <div key={slot}
                    className={`flex-1 border min-h-[26px] p-0.5 bg-white/60 transition cursor-default flex flex-wrap gap-0.5 items-start ${
                      isCounter
                        ? "border-rose-200 hover:bg-rose-50"
                        : "border-sky-200 hover:bg-sky-100"
                    }`}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDrop={e => { e.preventDefault(); if (draggingId !== null) tryDropToZone(zone, slot, draggingId); }}
                  >
                    {assignedHere.map(empId => {
                      const w = allWorkers.find(ww => ww.emp.id === empId);
                      if (!w) return null;
                      const c = typeTones[w.schedule.type] ?? DEFAULT_TONE;
                      return (
                        <button key={empId} onClick={() => onRemoveFromZone(zone, slot, empId)}
                          title="클릭하여 제거"
                          style={{ backgroundColor: c.chipBg, color: c.chipText, borderColor: c.chipBorder }}
                          className="px-1 py-px rounded text-[8px] font-bold cursor-pointer border hover:opacity-60 transition">
                          {w.emp.name}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            );
          })}
        </div>
      </div>

      {/* Drag-source chips */}
      <div className="mt-2 pt-2 border-t border-sky-200/60">
        <WorkerChips
          workers={workers}
          assignedIds={assignedIds}
          draggingId={draggingId}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          compact
          typeTones={typeTones}
        />
      </div>
    </div>
  );
});
ZoneSection.displayName = "ZoneSection";

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  date: string;
  employees: Employee[];
  typeHoursMap?: Record<string, string>;
  pharmTypeHoursMap?: Record<string, string>;
  onClose: () => void;
  onEditEmployee?: (emp: Employee) => void;
  onScheduleUpdate?: () => void;
  onUpdateSchedule?: (data: {
    employeeId: number; date: string; type: string;
    workingHours: string; actualHours: string; memo?: string;
  }) => Promise<void>;
  /** Optional: user-customized schedule type entries. Used to resolve per-type colors. */
  scheduleTypeEntries?: ScheduleTypeEntry[];
}

type TabKey = "전체" | "사원" | "약사" | "기타";

export const DayTimelineModal: React.FC<Props> = ({
  date, employees, typeHoursMap, pharmTypeHoursMap, onClose, onEditEmployee, onUpdateSchedule, scheduleTypeEntries,
}) => {
  // Build per-type tone map from user settings (hex-based). Rebuilds only when settings change.
  const typeTones = useMemo(() => buildTypeTones(scheduleTypeEntries), [scheduleTypeEntries]);
  const [editingWork, setEditingWork] = useState<{ empId: number; value: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("전체");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Slot state ────────────────────────────────────────────────────────────
  const [lunchSlots, setLunchSlots] = useState<SlotMap>(() => {
    try { return JSON.parse(localStorage.getItem(`tl_lunch_slots_${date}`) || "{}"); } catch { return {}; }
  });
  const [restSlots, setRestSlots] = useState<SlotMap>(() => {
    try { return JSON.parse(localStorage.getItem(`tl_rest_slots_${date}`) || "{}"); } catch { return {}; }
  });
  const [zoneSlots, setZoneSlots] = useState<ZoneMap>(() => {
    try { return JSON.parse(localStorage.getItem(`tl_zone_slots_${date}`) || "{}"); } catch { return {}; }
  });

  // Slot window offsets (in minutes). Clamped to [-60, +60].
  const [lunchOffset, setLunchOffset] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(`tl_lunch_offset_${date}`) || "0", 10);
    return Number.isFinite(v) ? Math.max(-60, Math.min(60, v)) : 0;
  });
  const [restOffset, setRestOffset] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(`tl_rest_offset_${date}`) || "0", 10);
    return Number.isFinite(v) ? Math.max(-60, Math.min(60, v)) : 0;
  });

  // Reload on date change
  useEffect(() => {
    try { setLunchSlots(JSON.parse(localStorage.getItem(`tl_lunch_slots_${date}`) || "{}")); } catch { setLunchSlots({}); }
    try { setRestSlots(JSON.parse(localStorage.getItem(`tl_rest_slots_${date}`) || "{}")); } catch { setRestSlots({}); }
    try { setZoneSlots(JSON.parse(localStorage.getItem(`tl_zone_slots_${date}`) || "{}")); } catch { setZoneSlots({}); }
    const lo = parseInt(localStorage.getItem(`tl_lunch_offset_${date}`) || "0", 10);
    setLunchOffset(Number.isFinite(lo) ? Math.max(-60, Math.min(60, lo)) : 0);
    const ro = parseInt(localStorage.getItem(`tl_rest_offset_${date}`) || "0", 10);
    setRestOffset(Number.isFinite(ro) ? Math.max(-60, Math.min(60, ro)) : 0);
  }, [date]);

  // ── Workers ───────────────────────────────────────────────────────────────
  const workers = useMemo(() => employees
    .map(emp => {
      const s = emp.schedules.find(sc => sc.date === date);
      if (!s || SKIP_TYPES.has(s.type)) return null;
      const hoursMap = emp.position === "약사" ? (pharmTypeHoursMap ?? typeHoursMap) : typeHoursMap;
      const wh = s.workingHours || hoursMap?.[s.type] || "";
      return { emp, schedule: s, wh } as WorkerEntry;
    })
    .filter((w): w is WorkerEntry => w !== null)
    .sort((a, b) => (TYPE_ORDER[a.schedule.type] ?? 99) - (TYPE_ORDER[b.schedule.type] ?? 99)),
  [employees, date, typeHoursMap, pharmTypeHoursMap]);

  const pharmacistWorkers = useMemo(() => workers.filter(w => w.emp.position === "약사"), [workers]);
  const staffWorkers      = useMemo(() => workers.filter(w => w.emp.position !== "약사" && w.emp.employmentType !== "알바"), [workers]);
  const otherWorkers      = useMemo(() => workers.filter(w => w.emp.position !== "약사" && w.emp.employmentType === "알바"), [workers]);

  const tabWorkers = useMemo(() => {
    if (activeTab === "약사") return pharmacistWorkers;
    if (activeTab === "사원") return staffWorkers;
    if (activeTab === "기타") return otherWorkers;
    return workers;
  }, [activeTab, workers, pharmacistWorkers, staffWorkers, otherWorkers]);

  // ── Row ordering ──────────────────────────────────────────────────────────
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
    const r: Record<number, { start: number; end: number } | null> = {};
    workers.forEach(w => { r[w.emp.id] = parseRange(w.wh); });
    return r;
  }, [workers]);

  // ── Row drag handlers ─────────────────────────────────────────────────────
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

  // ── Slot handlers ─────────────────────────────────────────────────────────
  const dropToLunchSlot = useCallback((slot: string, empId: number) => {
    setLunchSlots(prev => {
      const next = { ...prev, [slot]: [...(prev[slot] ?? []).filter(id => id !== empId), empId] };
      localStorage.setItem(`tl_lunch_slots_${date}`, JSON.stringify(next));
      return next;
    });
  }, [date]);

  const removeFromLunchSlot = useCallback((slot: string, empId: number) => {
    setLunchSlots(prev => {
      const next = { ...prev, [slot]: (prev[slot] ?? []).filter(id => id !== empId) };
      localStorage.setItem(`tl_lunch_slots_${date}`, JSON.stringify(next));
      return next;
    });
  }, [date]);

  const dropToRestSlot = useCallback((slot: string, empId: number) => {
    setRestSlots(prev => {
      const next = { ...prev, [slot]: [...(prev[slot] ?? []).filter(id => id !== empId), empId] };
      localStorage.setItem(`tl_rest_slots_${date}`, JSON.stringify(next));
      return next;
    });
  }, [date]);

  const removeFromRestSlot = useCallback((slot: string, empId: number) => {
    setRestSlots(prev => {
      const next = { ...prev, [slot]: (prev[slot] ?? []).filter(id => id !== empId) };
      localStorage.setItem(`tl_rest_slots_${date}`, JSON.stringify(next));
      return next;
    });
  }, [date]);

  const dropToZone = useCallback((zone: ZoneRow, slot: string, empId: number) => {
    setZoneSlots(prev => {
      const z = { ...(prev[zone] ?? {}) };
      z[slot] = [...(z[slot] ?? []).filter(id => id !== empId), empId];
      const next = { ...prev, [zone]: z };
      localStorage.setItem(`tl_zone_slots_${date}`, JSON.stringify(next));
      return next;
    });
  }, [date]);

  const removeFromZone = useCallback((zone: ZoneRow, slot: string, empId: number) => {
    setZoneSlots(prev => {
      const z = { ...(prev[zone] ?? {}) };
      z[slot] = (z[slot] ?? []).filter(id => id !== empId);
      const next = { ...prev, [zone]: z };
      localStorage.setItem(`tl_zone_slots_${date}`, JSON.stringify(next));
      return next;
    });
  }, [date]);

  // ── "전월 적용" ───────────────────────────────────────────────────────────
  const applyLunchToMonth = useCallback(() => {
    const snap = lunchSlots;
    datesInMonth(date).forEach(d => { if (d !== date) localStorage.setItem(`tl_lunch_slots_${d}`, JSON.stringify(snap)); });
  }, [date, lunchSlots]);

  const applyRestToMonth = useCallback(() => {
    const snap = restSlots;
    datesInMonth(date).forEach(d => { if (d !== date) localStorage.setItem(`tl_rest_slots_${d}`, JSON.stringify(snap)); });
  }, [date, restSlots]);

  const applyZoneToMonth = useCallback(() => {
    const snap = zoneSlots;
    datesInMonth(date).forEach(d => { if (d !== date) localStorage.setItem(`tl_zone_slots_${d}`, JSON.stringify(snap)); });
  }, [date, zoneSlots]);

  const handleLunchShiftOffset = useCallback((delta: number) => {
    setLunchOffset(prev => {
      const next = Math.max(-60, Math.min(60, prev + delta));
      localStorage.setItem(`tl_lunch_offset_${date}`, String(next));
      return next;
    });
  }, [date]);

  const handleRestShiftOffset = useCallback((delta: number) => {
    setRestOffset(prev => {
      const next = Math.max(-60, Math.min(60, prev + delta));
      localStorage.setItem(`tl_rest_offset_${date}`, String(next));
      return next;
    });
  }, [date]);

  const shiftedLunchSlots = useMemo(() => LUNCH_SLOTS.map(s => shiftSlot(s, lunchOffset)), [lunchOffset]);
  const shiftedRestSlots  = useMemo(() => REST_SLOTS.map(s => shiftSlot(s, restOffset)),  [restOffset]);

  // ── Date title ────────────────────────────────────────────────────────────
  const d = new Date(date + "T00:00:00");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const title = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;

  const tabs = useMemo(() => [
    { key: "전체" as TabKey, count: workers.length },
    { key: "사원" as TabKey, count: staffWorkers.length },
    { key: "약사" as TabKey, count: pharmacistWorkers.length },
    ...(otherWorkers.length > 0 ? [{ key: "기타" as TabKey, count: otherWorkers.length }] : []),
  ], [workers, staffWorkers, pharmacistWorkers, otherWorkers]);

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
              근무 {workers.length}명 (사원 {staffWorkers.length} / 약사 {pharmacistWorkers.length}
              {otherWorkers.length > 0 ? ` / 기타 ${otherWorkers.length}` : ""})
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white">
            <X size={17} />
          </button>
        </div>

        {/* Position filter tabs */}
        <div className="flex items-center gap-1 px-5 pt-2 pb-0 bg-white border-b border-slate-200 flex-shrink-0">
          {tabs.map(({ key, count }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-4 py-1.5 text-xs font-bold rounded-t-lg border border-b-0 transition-colors cursor-pointer ${
                activeTab === key
                  ? "bg-white border-slate-200 text-slate-800 -mb-px z-10"
                  : "bg-slate-50 border-transparent text-slate-400 hover:text-slate-600"
              }`}>
              {key}
              <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === key ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-500"}`}>{count}</span>
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 select-none">

          {/* ── 근무시간 섹션 ── */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">근무시간</span>
              {[...new Set(workers.map(w => w.schedule.type))].map(type => {
                const colors = typeTones[type] ?? DEFAULT_TONE;
                return (
                  <div key={type} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.dot }} />
                    <span className="text-[9px] font-semibold text-slate-500">{type}</span>
                  </div>
                );
              })}
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
                    const colors = typeTones[schedule.type] ?? DEFAULT_TONE;
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
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                          <span className="text-[11px] font-bold text-slate-800 truncate">{emp.name}</span>
                          {onEditEmployee && (
                            <button onClick={() => onEditEmployee(emp)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 transition-all cursor-pointer shrink-0">
                              <Pencil size={9} className="text-slate-400" />
                            </button>
                          )}
                        </div>
                        <span className="text-[9px] font-semibold leading-tight" style={{ color: colors.text }}>{schedule.type}</span>
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
                                  className="text-[9px] font-mono border border-indigo-300 rounded px-1 py-0 w-[70px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                />
                                <button className="text-[8px] text-indigo-500 hover:text-indigo-700 cursor-pointer font-bold"
                                  onClick={async e => { e.stopPropagation(); await onUpdateSchedule?.({ employeeId: emp.id, date, type: schedule.type, workingHours: editingWork.value, actualHours: schedule.actualHours || "", memo: schedule.memo || "" }); setEditingWork(null); }}>✓</button>
                                <button className="text-[8px] text-slate-400 hover:text-slate-600 cursor-pointer"
                                  onClick={e => { e.stopPropagation(); setEditingWork(null); }}>✕</button>
                              </div>
                            );
                          }
                          return displayHours ? (
                            <span
                              className={`text-[9px] font-mono leading-none cursor-pointer hover:text-indigo-600 hover:underline ${onUpdateSchedule ? "text-slate-400" : "text-slate-300"}`}
                              onClick={e => { if (!onUpdateSchedule) return; e.stopPropagation(); setEditingWork({ empId: emp.id, value: displayHours }); }}
                              title={onUpdateSchedule ? "클릭해서 근무시간 편집" : undefined}
                            >{displayHours}</span>
                          ) : (
                            onUpdateSchedule ? (
                              <span className="text-[9px] text-slate-300 leading-none cursor-pointer hover:text-indigo-400"
                                onClick={e => { e.stopPropagation(); setEditingWork({ empId: emp.id, value: "" }); }}>+ 시간</span>
                            ) : null
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>

                {/* Timeline grid */}
                <div className="flex-1 min-w-0 overflow-x-auto">
                  <div style={{ minWidth: "560px" }}>
                    {/* 1-hour time axis */}
                    <div className="relative h-7 mb-0.5">
                      <div className="absolute top-0 bottom-0 bg-orange-100 rounded pointer-events-none flex items-end justify-center pb-0.5"
                        style={{ left: `${pct(14 * 60)}%`, width: `${widthPct(14 * 60, 17 * 60)}%` }}>
                        <span className="text-[8px] font-black text-orange-500 tracking-tight">피크타임</span>
                      </div>
                      {HOUR_SLOTS.map((slot, i) => (
                        <div key={slot} className="absolute top-0 flex flex-col items-center"
                          style={{ left: `${(i / (HOUR_SLOTS.length - 1)) * 100}%`, transform: "translateX(-50%)" }}>
                          <span className={`text-[9px] whitespace-nowrap font-medium ${parseInt(slot) >= 14 && parseInt(slot) <= 17 ? "text-orange-500 font-bold" : "text-slate-400"}`}>{slot}</span>
                          <span className={`mt-0.5 block w-px h-1.5 ${parseInt(slot) >= 14 && parseInt(slot) <= 17 ? "bg-orange-300" : "bg-slate-300"}`} />
                        </div>
                      ))}
                    </div>
                    {/* Work bars */}
                    <div className="relative">
                      <div className="absolute top-0 bottom-0 bg-orange-50 border-l-2 border-r-2 border-orange-200/70 pointer-events-none"
                        style={{ left: `${pct(14 * 60)}%`, width: `${widthPct(14 * 60, 17 * 60)}%` }} />
                      {HOUR_SLOTS.map((slot, i) => (
                        <div key={`g-${slot}`} className="absolute top-0 bottom-0 border-l pointer-events-none"
                          style={{ left: `${(i / (HOUR_SLOTS.length - 1)) * 100}%`, borderColor: "#e2e8f0" }} />
                      ))}
                      {displayWorkers.map(({ emp, schedule }) => {
                        const colors = typeTones[schedule.type] ?? DEFAULT_TONE;
                        const workRange = workRanges[emp.id];
                        return (
                          <div key={emp.id}
                            className={`relative mb-1 h-9 bg-slate-50 rounded-lg border border-slate-100 transition-opacity ${dragRowId === emp.id ? "opacity-40" : "opacity-100"}`}>
                            {workRange ? (
                              <div className="absolute top-1 bottom-1 rounded-md opacity-90"
                                style={{
                                  left: `${pct(workRange.start)}%`,
                                  width: `${Math.max(widthPct(workRange.start, workRange.end), 0.5)}%`,
                                  backgroundColor: colors.bg,
                                }}>
                                <div className="flex items-center justify-center h-full">
                                  <span className="text-[9px] font-bold select-none truncate px-1" style={{ color: colors.text }}>
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

          {/* ── 매장구역 배정 섹션 ── */}
          <div className="px-4 py-3">
            <ZoneSection
              zoneMap={zoneSlots}
              workers={tabWorkers}
              allWorkers={workers}
              onDropToZone={dropToZone}
              onRemoveFromZone={removeFromZone}
              onApplyMonth={applyZoneToMonth}
              typeTones={typeTones}
              workRanges={workRanges}
              lunchSlotMap={lunchSlots}
            />
          </div>

          <div className="mx-4 h-px bg-slate-100" />

          {/* ── 점심시간 섹션 ── */}
          <div className="px-4 py-3">
            <BreakTimeline
              kind="lunch"
              slots={shiftedLunchSlots}
              slotMap={lunchSlots}
              workers={tabWorkers}
              allWorkers={workers}
              onApplyMonth={applyLunchToMonth}
              onDropToSlot={dropToLunchSlot}
              onRemoveFromSlot={removeFromLunchSlot}
              typeTones={typeTones}
              offset={lunchOffset}
              onShiftOffset={handleLunchShiftOffset}
            />
          </div>

          <div className="mx-4 h-px bg-slate-100" />

          {/* ── 휴게시간 섹션 ── */}
          <div className="px-4 py-3 pb-5">
            <BreakTimeline
              kind="rest"
              slots={shiftedRestSlots}
              slotMap={restSlots}
              workers={tabWorkers}
              allWorkers={workers}
              onApplyMonth={applyRestToMonth}
              onDropToSlot={dropToRestSlot}
              onRemoveFromSlot={removeFromRestSlot}
              typeTones={typeTones}
              offset={restOffset}
              onShiftOffset={handleRestShiftOffset}
            />
          </div>

        </div>
      </div>
    </div>
  );
};
