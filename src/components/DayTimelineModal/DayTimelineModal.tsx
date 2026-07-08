import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, Pencil, ChevronLeft, ChevronRight, CheckCircle, Pill } from "lucide-react";
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
const LUNCH_SLOTS = ["11:30", "12:00", "12:30", "13:00", "13:30", "14:00"]; // 11:30~14:30
const REST_SLOTS  = ["16:00", "16:30", "17:00", "17:30", "18:00"];           // 16:00~18:30

type BreakInterval = 30 | 60 | 90;
type BreakCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

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

// ─── 카테고리 판별 헬퍼 (사원/기타 구분 일관화) ────────────────────────────────
// 기타 = 알바 고용형태이거나 직종이 "기타"/"알바"인 경우
// 사원 = 약사도 아니고 기타도 아닌 경우 (캐셔·진열·물류 등 정규 직종)
export function isOtherEmp(emp: Employee): boolean {
  return emp.position === "기타" || emp.position === "알바" || emp.employmentType === "알바";
}
export function isPharmEmp(emp: Employee): boolean {
  return emp.position === "약사";
}
export function isStaffEmp(emp: Employee): boolean {
  return !isPharmEmp(emp) && !isOtherEmp(emp);
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

// ─── Ghost element helpers (module-level, imperative DOM) ─────────────────────
let ghostEl: HTMLDivElement | null = null;
function createGhost(name: string) {
  ghostEl = document.createElement("div");
  ghostEl.style.cssText = "position:fixed;z-index:9999;pointer-events:none;background:#4f46e5;color:white;padding:4px 10px;border-radius:999px;font-size:13px;font-weight:700;transform:translate(-50%,-50%);white-space:nowrap;";
  ghostEl.textContent = name;
  document.body.appendChild(ghostEl);
}
function moveGhost(x: number, y: number) {
  if (ghostEl) { ghostEl.style.left = x + "px"; ghostEl.style.top = y + "px"; }
}
function removeGhost() {
  ghostEl?.remove(); ghostEl = null;
}

// ─── Sub-component: WorkerChips ──────────────────────────────────────────────
interface WorkerChipsProps {
  workers: WorkerEntry[];
  assignedIds: Set<number>;
  /** 점심 배정된 인원 ID — chip 옆에 "점심배정" 라벨 표시 */
  lunchAssignedIds?: Set<number>;
  draggingId: number | null;
  onDragStart: (e: React.DragEvent, empId: number) => void;
  onDragEnd: () => void;
  compact?: boolean;
  typeTones: Record<string, TypeTone>;
  onTouchDragStart?: (empId: number) => void;
  onTouchDragEnd?: (x: number, y: number) => void;
  /** grouped=true → 약사/사원/기타 섹션으로 나눠서 렌더링 */
  grouped?: boolean;
}

function renderSingleChip(
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
  const hasLunchAssigned = lunchAssignedIds?.has(emp.id) ?? false;
  const isPharmacist = emp.position === "약사";
  return (
    <div key={emp.id} draggable
      onDragStart={e => onDragStart(e, emp.id)}
      onDragEnd={onDragEnd}
      onTouchStart={e => {
        if (!onTouchDragStart) return;
        e.preventDefault();
        onTouchDragStart(emp.id);
        createGhost(emp.name);
        const touch = e.touches[0];
        moveGhost(touch.clientX, touch.clientY);
        const onMove = (ev: TouchEvent) => {
          ev.preventDefault();
          const t = ev.touches[0];
          moveGhost(t.clientX, t.clientY);
        };
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
      style={{
        touchAction: "none",
        ...(assigned
          ? { backgroundColor: c.chipBg, color: c.chipText, borderColor: c.chipBorder }
          : isPharmacist
          ? { backgroundColor: "#eef2ff", color: "#3730a3", borderColor: "#a5b4fc" }
          : undefined),
      }}
      className={`relative flex items-center gap-1 whitespace-nowrap ${compact ? "px-2 py-1 text-[11px]" : "px-2 py-1 text-[12px]"} rounded-full font-bold border cursor-grab active:cursor-grabbing select-none transition ${
        // 약사는 항상 emerald ring 테두리 (배정 여부 관계없이 시각적으로 두드러지게)
        isPharmacist ? "ring-2 ring-emerald-500 ring-offset-1 ring-offset-white" : ""
      } ${
        assigned
          ? "opacity-80"
          : isPharmacist
          ? ""
          : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
      } ${draggingId === emp.id ? "opacity-20" : ""}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: assigned ? c.dot : isPharmacist ? "#6366f1" : "#cbd5e1" }}
      />
      <span>{emp.name}</span>
      {/* 캐셔 겸직 배지 — 오른쪽 위 코너에 오버레이 (인라인 공간 안 잡음) */}
      {emp.position.includes("캐셔") && emp.position.includes("물류") && (
        <span
          className="absolute -top-1.5 -right-1 w-3.5 h-3.5 rounded-full bg-blue-500 border border-white text-white text-[8px] font-black leading-none flex items-center justify-center shadow-sm pointer-events-none"
          title="캐셔 겸직"
          aria-label="캐셔 겸직"
        >
          C
        </span>
      )}
      {/* 점심 배정 배지 — 왼쪽 위 코너에 오버레이 (캐셔 배지와 위치 분리) */}
      {hasLunchAssigned && (
        <span
          className="absolute -top-1.5 -left-1 w-3.5 h-3.5 rounded-full bg-yellow-400 border border-white text-yellow-900 text-[8px] font-black leading-none flex items-center justify-center shadow-sm pointer-events-none"
          title="점심 배정됨"
          aria-label="점심"
        >
          점
        </span>
      )}
    </div>
  );
}

const WorkerChips: React.FC<WorkerChipsProps> = React.memo(({
  workers, assignedIds, lunchAssignedIds, draggingId, onDragStart, onDragEnd, compact, typeTones,
  onTouchDragStart, onTouchDragEnd, grouped,
}) => {
  if (grouped) {
    const pharmacists = workers.filter(w => w.emp.position === "약사");
    const staff       = workers.filter(w => isStaffEmp(w.emp));
    const others      = workers.filter(w => isOtherEmp(w.emp));
    const sections: { label: string; items: WorkerEntry[]; labelCls: string }[] = [
      { label: "약사", items: pharmacists, labelCls: "text-indigo-600" },
      { label: "사원", items: staff,       labelCls: "text-slate-500"  },
      { label: "기타", items: others,      labelCls: "text-slate-400"  },
    ];

    // 배정된 직원과 미배정 직원 분리 (섹션 내)
    const assignedWorkers   = workers.filter(w => assignedIds.has(w.emp.id));
    const unassignedWorkers = workers.filter(w => !assignedIds.has(w.emp.id));

    // 배정된 직원 섹션: 그룹별
    const assignedSections = sections.map(s => ({ ...s, items: s.items.filter(w => assignedIds.has(w.emp.id)) }));
    const hasAnyAssigned = assignedSections.some(s => s.items.length > 0);

    return (
      <div className="flex flex-col gap-1.5">
        {workers.length === 0 && <span className="text-[12px] text-slate-300 italic">근무자 없음</span>}
        {/* 배정된 직원 — 약사/사원/기타 그룹 */}
        {assignedSections.map(({ label, items, labelCls }) => {
          if (items.length === 0) return null;
          return (
            <div key={label}>
              <span className={`text-[9px] font-black uppercase tracking-wider ${labelCls} mb-0.5 block`}>{label}</span>
              <div className="flex flex-wrap gap-1">
                {items.map(w => renderSingleChip(w, assignedIds, draggingId, onDragStart, onDragEnd, compact, typeTones, onTouchDragStart, onTouchDragEnd, lunchAssignedIds))}
              </div>
            </div>
          );
        })}
        {/* 미배정 직원 — 하단에 구분선 + 라벨 */}
        {unassignedWorkers.length > 0 && (
          <>
            {hasAnyAssigned && <div className="h-px bg-sky-200/70 my-0.5" />}
            <div>
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5 block">
                미배정 ({unassignedWorkers.length}명)
              </span>
              <div className="flex flex-wrap gap-1">
                {unassignedWorkers.map(w => renderSingleChip(w, assignedIds, draggingId, onDragStart, onDragEnd, compact, typeTones, onTouchDragStart, onTouchDragEnd, lunchAssignedIds))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {workers.length === 0 && <span className="text-[12px] text-slate-300 italic">근무자 없음</span>}
      {workers.map(w => renderSingleChip(w, assignedIds, draggingId, onDragStart, onDragEnd, compact, typeTones, onTouchDragStart, onTouchDragEnd, lunchAssignedIds))}
    </div>
  );
});
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
  const [touchDraggingId, setTouchDraggingId] = useState<number | null>(null);
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

  const handleTouchDragStart = useCallback((empId: number) => {
    setTouchDraggingId(empId);
  }, []);

  const handleTouchDragEnd = useCallback((x: number, y: number) => {
    if (touchDraggingId === null) return;
    const empId = touchDraggingId;
    setTouchDraggingId(null);
    let el = document.elementFromPoint(x, y) as HTMLElement | null;
    while (el) {
      if (el.dataset.dropSlot) {
        onDropToSlot(el.dataset.dropSlot, empId);
        return;
      }
      el = el.parentElement;
    }
  }, [touchDraggingId, onDropToSlot]);

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
                data-drop-slot={slot}
                className={`flex-1 flex flex-col border-r border-slate-200 last:border-r-0 transition ${theme.cellHover}`}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={e => { e.preventDefault(); if (draggingId !== null) onDropToSlot(slot, draggingId); }}
              >
                <div className={`text-center text-[11px] font-bold py-0.5 border-b ${theme.slotHdr}`}>{slot}</div>
                <div className="p-1 min-h-[40px] flex flex-wrap gap-0.5 items-start">
                  {assignedHere.map(empId => {
                    const w = allWorkers.find(ww => ww.emp.id === empId);
                    if (!w) return null;
                    const c = typeTones[w.schedule.type] ?? DEFAULT_TONE;
                    return (
                      <button key={empId} onClick={() => onRemoveFromSlot(slot, empId)}
                        title="클릭하여 제거"
                        style={{ backgroundColor: c.chipBg, color: c.chipText, borderColor: c.chipBorder }}
                        className="px-1.5 py-px rounded text-[11px] font-bold cursor-pointer border hover:opacity-60 transition">
                        {w.emp.name}
                      </button>
                    );
                  })}
                  {assignedHere.length === 0 && (
                    <span className="text-[11px] text-slate-300 italic w-full text-center mt-1.5">드롭</span>
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
          onTouchDragStart={handleTouchDragStart}
          onTouchDragEnd={handleTouchDragEnd}
        />
      </div>
    </div>
  );
});
BreakTimeline.displayName = "BreakTimeline";

// ─── Sub-component: ZoneSection ──────────────────────────────────────────────
interface ZoneSectionProps {
  zoneMap: ZoneMap;
  workers: WorkerEntry[];
  allWorkers: WorkerEntry[];
  onDropToZone: (zone: ZoneRow, slot: string, empId: number) => void;
  onRemoveFromZone: (zone: ZoneRow, slot: string, empId: number) => void;
  typeTones: Record<string, TypeTone>;
  workRanges: Record<number, { start: number; end: number } | null>;
  currentDow: number; // 0=일 ~ 6=토 (highlights current day's button)
  onSaveToDow: (dow: number) => Promise<void>;
  // lunch
  lunchSlotMap: SlotMap;
  shiftedLunchSlots: string[];
  lunchOffset: number;
  onShiftLunchOffset: (delta: number) => void;
  onDropToLunch: (slot: string, empId: number, source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }) => void;
  onRemoveFromLunch: (slot: string, empId: number) => void;
  onReorderLunch?: (slot: string, empId: number, toIndex: number) => void;
  // rest
  restSlotMap: SlotMap;
  shiftedRestSlots: string[];
  restOffset: number;
  onShiftRestOffset: (delta: number) => void;
  onDropToRest: (slot: string, empId: number, source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }) => void;
  onRemoveFromRest: (slot: string, empId: number) => void;
  onReorderRest?: (slot: string, empId: number, toIndex: number) => void;
  // interval
  lunchInterval: BreakInterval;
  restInterval: BreakInterval;
  onSetLunchInterval: (v: BreakInterval) => void;
  onSetRestInterval: (v: BreakInterval) => void;
  // count (몇 명이 교대로 식사/휴게할지 — 슬롯 행 수)
  lunchCount: BreakCount;
  restCount: BreakCount;
  onSetLunchCount: (v: BreakCount) => void;
  onSetRestCount: (v: BreakCount) => void;
  // 탭 필터 (약사/사원/기타/전체) 반영
  tabWorkerIds: Set<number>;
  isTabAll: boolean;
  // 사용자가 드래그 시작 등 상호작용을 하면 부모에게 알려 임의배치 배너 등을 숨김
  onUserInteract?: () => void;
  // 현재 탭 인원 기준 최적 임의배치 실행
  onAutoSuggest?: () => void;
}

// Zone section uses HOUR_SLOTS as column keys — 10:00 ~ 19:00 시작박스 (10칸)
// 20:00은 마지막 셀의 종료시간이므로 헤더 라벨로만 표시 (시작박스 없음)
const ZONE_SLOTS = HOUR_SLOTS.slice(0, -3);

/** Returns the shifted slot string for a given hour and minute offset within that hour (0 or 30). */
function subSlotKey(hourSlot: string, minuteOffset: 0 | 30): string {
  const h = parseInt(hourSlot.split(":")[0], 10);
  return `${String(h).padStart(2, "0")}:${minuteOffset === 0 ? "00" : "30"}`;
}

const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

type CellPicker =
  | { type: "zone"; zone: ZoneRow; slot: string }
  | { type: "lunch"; slot: string }
  | { type: "rest"; slot: string };

const ZoneSection: React.FC<ZoneSectionProps> = React.memo(({
  zoneMap, workers, allWorkers, onDropToZone, onRemoveFromZone, typeTones, workRanges,
  currentDow, onSaveToDow,
  lunchSlotMap, shiftedLunchSlots, lunchOffset, onShiftLunchOffset, onDropToLunch, onRemoveFromLunch, onReorderLunch,
  restSlotMap,  shiftedRestSlots,  restOffset,  onShiftRestOffset,  onDropToRest,  onRemoveFromRest,  onReorderRest,
  lunchInterval, restInterval, onSetLunchInterval, onSetRestInterval,
  lunchCount, restCount, onSetLunchCount, onSetRestCount,
  tabWorkerIds, isTabAll, onUserInteract, onAutoSuggest,
}) => {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [touchDraggingId, setTouchDraggingId] = useState<number | null>(null);
  const [selectedDows, setSelectedDows] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [cellPicker, setCellPicker] = useState<CellPicker | null>(null);
  // 드래그 출발지 — zone/lunch/rest 어디서 왔는지 추적 (자유로운 상호 이동 지원)
  const [draggingSource, setDraggingSource] = useState<{ type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string } | null>(null);
  // 하위 호환: 기존 코드 참조 잠깐 유지
  const draggingZoneSource = draggingSource && draggingSource.type === "zone"
    ? { zone: draggingSource.zone!, slot: draggingSource.slot } : null;
  const setDraggingZoneSource = (v: { zone: ZoneRow; slot: string } | null) => {
    setDraggingSource(v ? { type: "zone", zone: v.zone, slot: v.slot } : null);
  };

  // source 힌트: 드래그 출발지를 알려주면 그 위치의 충돌을 무시 (자유로운 이동을 위함)
  const tryDropToZone = useCallback((zone: ZoneRow, slot: string, empId: number,
    source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }
  ) => {
    const slotHour = parseInt(slot.split(":")[0], 10);
    const slotStart = slotHour * 60;
    const slotEnd = slotStart + 60;
    const range = workRanges[empId];
    if (range && (slotEnd <= range.start || slotStart >= range.end)) {
      alert("출근 시간이 아니어서 배정할 수 없습니다.");
      return;
    }
    const otherZone: ZoneRow = zone === "카운터" ? "매장" : "카운터";
    // 다른 zone 충돌 검사 — 출발지가 그 zone이면 이동으로 간주 (허용)
    if (((zoneMap[otherZone] ?? {})[slot] ?? []).includes(empId)) {
      const isMovingFromOtherZone = source?.type === "zone" && source.zone === otherZone && source.slot === slot;
      if (!isMovingFromOtherZone) {
        alert(`중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 ${otherZone}에 배정되어 있습니다)`);
        return;
      }
    }
    const lunchConflict = Object.entries(lunchSlotMap).some(([ls, ids]) => {
      if (!(ids as number[]).includes(empId)) return false;
      if (source?.type === "lunch" && source.slot === ls) return false;
      const [lh, lm] = ls.split(":").map(Number);
      const ls0 = lh * 60 + lm;
      return ls0 < slotEnd && ls0 + 30 > slotStart;
    });
    if (lunchConflict) { alert("중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 점심시간이 배정되어 있습니다)"); return; }
    const restConflict = Object.entries(restSlotMap).some(([rs, ids]) => {
      if (!(ids as number[]).includes(empId)) return false;
      if (source?.type === "rest" && source.slot === rs) return false;
      const [rh, rm] = rs.split(":").map(Number);
      const rs0 = rh * 60 + rm;
      return rs0 < slotEnd && rs0 + 30 > slotStart;
    });
    if (restConflict) { alert("중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 휴게시간이 배정되어 있습니다)"); return; }
    // dropToZone은 source 파라미터를 받아 atomic 이동 처리 (any 캐스팅으로 확장 시그니처 전달)
    (onDropToZone as any)(zone, slot, empId, source);
  }, [workRanges, zoneMap, lunchSlotMap, restSlotMap, onDropToZone]);

  const assignedIds = useMemo(() => {
    const ids = new Set<number>();
    ZONE_ROWS.forEach(z => (Object.values(zoneMap[z] ?? {}) as number[][]).forEach(arr => arr.forEach(id => ids.add(id))));
    (Object.values(lunchSlotMap) as number[][]).forEach(arr => arr.forEach(id => ids.add(id)));
    (Object.values(restSlotMap) as number[][]).forEach(arr => arr.forEach(id => ids.add(id)));
    return ids;
  }, [zoneMap, lunchSlotMap, restSlotMap]);
  const lunchAssignedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const arr of Object.values(lunchSlotMap ?? {})) {
      if (!Array.isArray(arr)) continue;
      for (const id of arr) {
        if (typeof id === "number" && Number.isFinite(id)) ids.add(id);
      }
    }
    return ids;
  }, [lunchSlotMap]);

  const handleDragStart = useCallback((e: React.DragEvent, id: number) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
    // 하단 칩 pool에서 시작하는 드래그는 source가 없음 — 잔여 source 초기화로 중복검사 우회 방지
    setDraggingSource(null);
    onUserInteract?.();
  }, [onUserInteract]);
  const handleDragEnd = useCallback(() => { setDraggingId(null); setDraggingSource(null); }, []);

  const handleTouchDragStart = useCallback((empId: number) => {
    setTouchDraggingId(empId);
    setDraggingSource(null);
    onUserInteract?.();
  }, [onUserInteract]);

  const handleTouchDragEnd = useCallback((x: number, y: number) => {
    if (touchDraggingId === null) return;
    const empId = touchDraggingId;
    const src = draggingSource;
    setTouchDraggingId(null);
    setDraggingSource(null);
    let el = document.elementFromPoint(x, y) as HTMLElement | null;
    while (el) {
      if (el.dataset.dropZone && el.dataset.dropSlot) {
        const dZone = el.dataset.dropZone as ZoneRow;
        const dSlot = el.dataset.dropSlot;
        if (src?.type === "zone" && src.zone === dZone && src.slot === dSlot) return; // 같은 셀
        tryDropToZone(dZone, dSlot, empId, src ?? undefined);
        return;
      }
      if (el.dataset.dropLunch) {
        if (src?.type === "lunch" && src.slot === el.dataset.dropLunch) return;
        onDropToLunch(el.dataset.dropLunch, empId, src ?? undefined);
        return;
      }
      if (el.dataset.dropRest) {
        if (src?.type === "rest" && src.slot === el.dataset.dropRest) return;
        onDropToRest(el.dataset.dropRest, empId, src ?? undefined);
        return;
      }
      el = el.parentElement;
    }
  }, [touchDraggingId, draggingSource, tryDropToZone, onDropToLunch, onDropToRest]);

  // Render a half-hour sub-cell for break rows (점심/휴게)
  // count: 인원 수 → 슬롯 내에 행(row) 수를 나타냄 (각 행에 1명씩 배정)
  const renderBreakSubCell = (
    slotKey: string,
    isActive: boolean,
    slotMap: SlotMap,
    theme: { border: string; bg: string; hover: string; label: string },
    onDrop: (slot: string, id: number, source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }) => void,
    onRemove: (slot: string, id: number) => void,
    dropKind: "lunch" | "rest",
    count: BreakCount,
    onReorder?: (slot: string, empId: number, toIndex: number) => void,
  ) => {
    // 비활성 슬롯도 드롭 타겟으로 허용 · 클릭 시 인원 선택 팝업 (모바일 친화적 터치 영역)
    if (!isActive) {
      const dataAttrInactive = dropKind === "lunch" ? { "data-drop-lunch": slotKey } : { "data-drop-rest": slotKey };
      return (
        <div
          {...dataAttrInactive}
          className={`flex-1 flex items-center justify-center bg-slate-50/40 border-r last:border-r-0 min-h-[32px] cursor-pointer transition ${theme.border} ${theme.hover} active:bg-slate-100/60`}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onDrop={e => {
            e.preventDefault();
            if (draggingId === null) return;
            const src = draggingSource;
            setDraggingSource(null);
            if (src?.type === dropKind && src.slot === slotKey) return;
            onDrop(slotKey, draggingId, src ?? undefined);
          }}
          onClick={() => setCellPicker({ type: dropKind, slot: slotKey })}
          title="탭하여 인원 배정"
        >
          <span className="text-[10px] font-black text-slate-300 select-none">+</span>
        </div>
      );
    }
    const assigned = slotMap[slotKey] ?? [];
    const minLabel = slotKey.slice(3); // "00" or "30"
    const dataAttr = dropKind === "lunch" ? { "data-drop-lunch": slotKey } : { "data-drop-rest": slotKey };
    return (
      <div
        {...dataAttr}
        className={`flex-1 flex flex-col border-r last:border-r-0 ${theme.border} ${theme.bg} ${theme.hover} transition cursor-pointer`}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={e => {
          e.preventDefault();
          if (draggingId === null) return;
          const src = draggingSource;
          setDraggingSource(null);
          // 같은 슬롯 → skip
          if (src?.type === dropKind && src.slot === slotKey) return;
          onDrop(slotKey, draggingId, src ?? undefined);
        }}
        onClick={() => setCellPicker({ type: dropKind, slot: slotKey })}
      >
        <span className={`text-[10px] font-bold text-center leading-none py-0.5 ${theme.label}`}>:{minLabel}</span>
        {/* 인원 수만큼 행(row) 표시 */}
        {Array.from({ length: count }, (_, rowIdx) => {
          const empId = assigned[rowIdx];
          const w = empId !== undefined ? allWorkers.find(ww => ww.emp.id === empId) : undefined;
          const c = w ? (typeTones[w.schedule.type] ?? DEFAULT_TONE) : null;
          // 탭 필터: 현재 탭에 없는 사람은 완전히 숨김 (빈 슬롯으로 표시)
          const inTab = w ? (isTabAll || tabWorkerIds.has(w.emp.id)) : true;
          const shouldRender = w && c && inTab;
          return (
            <div
              key={rowIdx}
              className={`flex items-center min-h-[20px] border-t px-0.5 ${theme.border} ${rowIdx === 0 ? "border-t" : ""}`}
              onDragOver={e => {
                // 같은 슬롯 내부 재정렬 지원 시에만 drop 허용
                if (draggingSource?.type === dropKind && draggingSource.slot === slotKey && onReorder) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={e => {
                if (draggingId === null) return;
                if (draggingSource?.type === dropKind && draggingSource.slot === slotKey && onReorder) {
                  e.preventDefault();
                  e.stopPropagation();
                  onReorder(slotKey, draggingId, rowIdx);
                  setDraggingSource(null);
                }
              }}
            >
              {shouldRender ? (
                <button
                  draggable
                  onDragStart={e => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingId(empId!);
                    setDraggingSource({ type: dropKind, slot: slotKey });
                    onUserInteract?.();
                  }}
                  onDragEnd={() => { setDraggingId(null); setDraggingSource(null); }}
                  onClick={e => { e.stopPropagation(); setCellPicker({ type: dropKind, slot: slotKey }); }}
                  title={w!.emp.position.includes("캐셔") && w!.emp.position.includes("물류") ? "캐셔 겸직 · 탭하여 배정 편집 (모바일) · 드래그하여 이동 (데스크탑)" : "탭하여 배정 편집 (모바일) · 드래그하여 이동 (데스크탑)"}
                  style={{ backgroundColor: c!.chipBg, color: c!.chipText, borderColor: c!.chipBorder }}
                  className="relative w-full text-center rounded text-[10px] font-bold border transition leading-none py-px cursor-grab active:cursor-grabbing hover:opacity-60 inline-flex items-center justify-center gap-0.5 whitespace-nowrap overflow-hidden"
                >
                  <span className="truncate">{w!.emp.name}</span>
                  {w!.emp.position.includes("캐셔") && w!.emp.position.includes("물류") && (
                    <span
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-500 border border-white text-white text-[7px] font-black leading-none flex items-center justify-center shadow-sm pointer-events-none"
                      title="캐셔 겸직"
                    >C</span>
                  )}
                </button>
              ) : (
                <span className="w-full text-center text-[9px] text-slate-300 leading-none">–</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const lunchTheme = { border: "border-yellow-200", bg: "bg-yellow-50/60", hover: "hover:bg-yellow-100", label: "text-yellow-500" };
  const restTheme  = { border: "border-violet-200", bg: "bg-violet-50/60", hover: "hover:bg-violet-100", label: "text-violet-400" };

  const offsetLabel = (off: number) => off === 0 ? "기본" : `${off > 0 ? "+" : ""}${off}분`;

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-400" />
          <span className="text-[11px] font-black text-sky-800">구역 · 점심 · 휴게 배정</span>
          {assignedIds.size > 0 && (
            <span className="text-[10px] font-semibold text-sky-700 opacity-70">{assignedIds.size}명 배정됨</span>
          )}
          {onAutoSuggest && (
            <button
              type="button"
              onClick={onAutoSuggest}
              className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white cursor-pointer shadow-sm transition"
              title="현재 탭 인원 기준으로 카운터·매장을 자동 배치"
            >
              ⚡ 임의배치
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-slate-400 mr-0.5">요일저장</span>
          {DOW_LABELS.map((label, dow) => (
            <button key={dow}
              onClick={() => setSelectedDows(prev => {
                const next = new Set(prev);
                if (next.has(dow)) next.delete(dow); else next.add(dow);
                return next;
              })}
              className={`w-6 h-6 text-[9px] font-black rounded transition cursor-pointer ${
                selectedDows.has(dow)
                  ? "bg-indigo-600 text-white shadow-sm"
                  : dow === currentDow
                    ? "bg-indigo-200 text-indigo-700 border border-indigo-300"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
              }`}>
              {label}
            </button>
          ))}
          {selectedDows.size > 0 && (
            <>
              <button
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  await Promise.all([...selectedDows].map(d => onSaveToDow(d)));
                  setSaving(false);
                  setSelectedDows(new Set());
                }}
                className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500 text-white hover:bg-indigo-600 cursor-pointer disabled:opacity-50 ml-0.5">
                {saving ? "저장중…" : `저장(${selectedDows.size})`}
              </button>
              <button onClick={() => setSelectedDows(new Set())}
                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-pointer">✕</button>
            </>
          )}
        </div>
      </div>

      {/* Unified grid */}
      <div className="overflow-x-auto">
        {/* pr-6: 20시 라벨 오른쪽에 여백 확보 — 셀 오른쪽 경계가 화면 끝에 붙지 않도록 */}
        <div className="pr-6" style={{ minWidth: "600px" }}>
          {/* Hour header — 왼쪽 정렬, 21시 제거됨 + 종료시간(20:00) 라벨 + 피크타임(14~17) 표시 */}
          <div className="flex mb-0.5 relative">
            <div className="w-14 shrink-0" />
            <div className="flex-1 relative">
              {/* 피크타임 배경 밴드: 14:00~17:00 = 슬롯 인덱스 4~6 (10슬롯 기준 40%~70%) */}
              <div className="absolute top-0 bottom-0 bg-orange-100/70 rounded pointer-events-none flex items-end justify-center"
                style={{ left: "40%", width: "30%" }}>
                <span className="text-[8px] font-black text-orange-500 tracking-tight leading-none pb-0.5">피크타임</span>
              </div>
              <div className="flex relative">
                {ZONE_SLOTS.map((slot, i) => {
                  const isPeak = i >= 4 && i <= 6;
                  return (
                    <div key={slot} className="flex-1 text-left pl-0.5">
                      <span className={`text-[11px] font-bold ${isPeak ? "text-orange-500" : "text-sky-600"}`}>{slot}</span>
                    </div>
                  );
                })}
              </div>
              {/* 20:00은 마지막 셀의 종료 지점 — 셀 오른쪽 끝에 라벨만 표시 */}
              <span className="text-[11px] font-bold text-sky-600 absolute right-0 top-0 pr-0.5">20:00</span>
            </div>
          </div>

          {/* Zone rows: 카운터 / 매장 */}
          {ZONE_ROWS.map(zone => {
            const isCounter = zone === "카운터";
            return (
              <div key={zone} className="flex items-stretch mb-0.5">
                <div className="w-14 shrink-0 flex items-center">
                  <span className={`text-[12px] font-black tracking-wide ${isCounter ? "text-rose-600" : "text-sky-700"}`}>{zone}</span>
                </div>
                {ZONE_SLOTS.map(slot => {
                  const assignedHere = (zoneMap[zone] ?? {})[slot] ?? [];
                  return (
                    <div key={slot}
                      data-drop-zone={zone}
                      data-drop-slot={slot}
                      className={`flex-1 border min-h-[36px] p-0.5 bg-white/60 transition cursor-pointer flex flex-wrap gap-0.5 items-start ${
                        isCounter ? "border-rose-200 hover:bg-rose-50" : "border-sky-200 hover:bg-sky-100"
                      }`}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                      onDrop={e => {
                        e.preventDefault();
                        if (draggingId === null) return;
                        const src = draggingSource;
                        setDraggingSource(null);
                        // 같은 셀 → skip
                        if (src?.type === "zone" && src.zone === zone && src.slot === slot) return;
                        tryDropToZone(zone, slot, draggingId, src ?? undefined);
                      }}
                      onClick={() => setCellPicker({ type: "zone", zone, slot })}
                    >
                      {assignedHere.map(empId => {
                        const w = allWorkers.find(ww => ww.emp.id === empId);
                        if (!w) return null;
                        // 탭 필터: 현재 탭에 없는 사람은 완전히 숨김
                        const inTab = isTabAll || tabWorkerIds.has(empId);
                        if (!inTab) return null;
                        const c = typeTones[w.schedule.type] ?? DEFAULT_TONE;
                        return (
                          <div key={empId}
                            draggable
                            onDragStart={e => {
                              e.stopPropagation();
                              e.dataTransfer.effectAllowed = "move";
                              setDraggingId(empId);
                              setDraggingZoneSource({ zone, slot });
                              onUserInteract?.();
                            }}
                            onDragEnd={() => { setDraggingId(null); setDraggingZoneSource(null); }}
                            onClick={e => { e.stopPropagation(); onRemoveFromZone(zone, slot, empId); }}
                            onTouchStart={e => {
                              e.stopPropagation();
                              setTouchDraggingId(empId);
                              setDraggingZoneSource({ zone, slot });
                              createGhost(w.emp.name);
                              const touch = e.touches[0];
                              moveGhost(touch.clientX, touch.clientY);
                              const onMove = (ev: TouchEvent) => {
                                ev.preventDefault();
                                const t = ev.touches[0];
                                moveGhost(t.clientX, t.clientY);
                              };
                              const onEnd = (ev: TouchEvent) => {
                                document.removeEventListener("touchmove", onMove);
                                document.removeEventListener("touchend", onEnd);
                                const t = ev.changedTouches[0];
                                removeGhost();
                                handleTouchDragEnd(t.clientX, t.clientY);
                              };
                              document.addEventListener("touchmove", onMove, { passive: false });
                              document.addEventListener("touchend", onEnd);
                            }}
                            title={w.emp.position.includes("캐셔") && w.emp.position.includes("물류") ? "캐셔 겸직 · 드래그로 이동 · 클릭으로 제거" : "드래그: 다른 구역으로 이동 | 클릭: 제거"}
                            style={{ backgroundColor: c.chipBg, color: c.chipText, borderColor: c.chipBorder, touchAction: "none" }}
                            className="relative px-1 py-px rounded text-[11px] font-bold border transition select-none cursor-grab hover:opacity-70 inline-flex items-center gap-0.5 whitespace-nowrap"
                          >
                            {w.emp.name}
                            {w.emp.position.includes("캐셔") && w.emp.position.includes("물류") && (
                              <span
                                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-500 border border-white text-white text-[7px] font-black leading-none flex items-center justify-center shadow-sm pointer-events-none"
                                title="캐셔 겸직"
                              >C</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Divider */}
          <div className="h-px bg-sky-200/60 my-1" />

          {/* 점심 위 시간 라벨 (컴팩트) — 시각(hour)만 표기: 10, 11, ... */}
          <div className="flex mb-0.5 relative">
            <div className="w-14 shrink-0" />
            <div className="flex-1 flex relative">
              {ZONE_SLOTS.map(slot => (
                <div key={slot} className="flex-1 text-left pl-0.5">
                  <span className="text-[10px] font-bold text-yellow-700/70">{parseInt(slot, 10)}</span>
                </div>
              ))}
              <span className="text-[10px] font-bold text-yellow-700/70 absolute right-0 top-0 pr-0.5">20</span>
            </div>
          </div>

          {/* 점심 row */}
          <div className="flex items-stretch mb-0.5">
            <div className="w-14 shrink-0 flex flex-col justify-center gap-0.5">
              <div className="flex items-center gap-0.5">
                <span className="text-[12px] font-black text-yellow-700">점심</span>
                {/* 인원 수 선택 */}
                <select
                  value={lunchCount}
                  onChange={e => onSetLunchCount(parseInt(e.target.value, 10) as BreakCount)}
                  className="ml-0.5 text-[9px] font-bold border border-yellow-300 rounded bg-white text-yellow-700 px-0.5 py-px cursor-pointer appearance-none text-center"
                  style={{ width: "36px" }}
                  title="점심 인원 수"
                >
                  {([1,2,3,4,5,6,7,8,9,10] as BreakCount[]).map(n => (
                    <option key={n} value={n}>{n}명</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => onShiftLunchOffset(-30)} disabled={lunchOffset <= -60}
                  className="w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded bg-white border border-slate-200 text-slate-500 disabled:opacity-30 cursor-pointer">−</button>
                <span className="text-[10px] font-mono text-slate-400 leading-none">{offsetLabel(lunchOffset)}</span>
                <button type="button" onClick={() => onShiftLunchOffset(30)} disabled={lunchOffset >= 60}
                  className="w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded bg-white border border-slate-200 text-slate-500 disabled:opacity-30 cursor-pointer">+</button>
              </div>
              <div className="flex gap-0.5 mt-0.5">
                {([30, 60, 90] as BreakInterval[]).map(v => (
                  <button key={v} type="button" onClick={() => onSetLunchInterval(v)}
                    className={`text-[8px] px-0.5 py-px rounded font-bold border transition cursor-pointer ${
                      lunchInterval === v ? "bg-yellow-500 text-white border-yellow-500" : "bg-white text-slate-400 border-slate-200 hover:border-yellow-300"
                    }`}>
                    {v === 30 ? "30분" : v === 60 ? "1h" : "1.5h"}
                  </button>
                ))}
              </div>
            </div>
            {ZONE_SLOTS.map(slot => {
              const k0 = subSlotKey(slot, 0);
              const k30 = subSlotKey(slot, 30);
              const activeK0 = shiftedLunchSlots.includes(k0);
              const activeK30 = shiftedLunchSlots.includes(k30);
              // 모두 비활성일 때도 renderBreakSubCell(false)로 위임 → 드롭 타겟 유지
              if (!activeK0 && !activeK30) {
                return (
                  <div key={slot} className="flex-1 flex border border-transparent">
                    {renderBreakSubCell(k0, false, lunchSlotMap, lunchTheme, onDropToLunch, onRemoveFromLunch, "lunch", lunchCount, onReorderLunch)}
                  </div>
                );
              }
              // 1시간 인터벌: 활성 slot 하나만 렌더 (전체 시간 칸 차지)
              if (lunchInterval === 60) {
                const activeKey = activeK0 ? k0 : k30;
                return (
                  <div key={slot} className="flex-1 flex border border-yellow-200">
                    {renderBreakSubCell(activeKey, true, lunchSlotMap, lunchTheme, onDropToLunch, onRemoveFromLunch, "lunch", lunchCount, onReorderLunch)}
                  </div>
                );
              }
              // 30분 인터벌: 2개 sub-cell
              return (
                <div key={slot} className="flex-1 flex border border-yellow-200">
                  {renderBreakSubCell(k0,  activeK0,  lunchSlotMap, lunchTheme, onDropToLunch, onRemoveFromLunch, "lunch", lunchCount, onReorderLunch)}
                  {renderBreakSubCell(k30, activeK30, lunchSlotMap, lunchTheme, onDropToLunch, onRemoveFromLunch, "lunch", lunchCount, onReorderLunch)}
                </div>
              );
            })}
          </div>

          {/* 휴게 위 시간 라벨 (컴팩트) — 시각(hour)만 표기 */}
          <div className="flex mb-0.5 mt-0.5 relative">
            <div className="w-14 shrink-0" />
            <div className="flex-1 flex relative">
              {ZONE_SLOTS.map(slot => (
                <div key={slot} className="flex-1 text-left pl-0.5">
                  <span className="text-[10px] font-bold text-violet-700/70">{parseInt(slot, 10)}</span>
                </div>
              ))}
              <span className="text-[10px] font-bold text-violet-700/70 absolute right-0 top-0 pr-0.5">20</span>
            </div>
          </div>

          {/* 휴게 row */}
          <div className="flex items-stretch">
            <div className="w-14 shrink-0 flex flex-col justify-center gap-0.5">
              <div className="flex items-center gap-0.5">
                <span className="text-[12px] font-black text-violet-700">휴게</span>
                {/* 인원 수 선택 */}
                <select
                  value={restCount}
                  onChange={e => onSetRestCount(parseInt(e.target.value, 10) as BreakCount)}
                  className="ml-0.5 text-[9px] font-bold border border-violet-300 rounded bg-white text-violet-700 px-0.5 py-px cursor-pointer appearance-none text-center"
                  style={{ width: "36px" }}
                  title="휴게 인원 수"
                >
                  {([1,2,3,4,5,6,7,8,9,10] as BreakCount[]).map(n => (
                    <option key={n} value={n}>{n}명</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => onShiftRestOffset(-30)} disabled={restOffset <= -60}
                  className="w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded bg-white border border-slate-200 text-slate-500 disabled:opacity-30 cursor-pointer">−</button>
                <span className="text-[10px] font-mono text-slate-400 leading-none">{offsetLabel(restOffset)}</span>
                <button type="button" onClick={() => onShiftRestOffset(30)} disabled={restOffset >= 60}
                  className="w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded bg-white border border-slate-200 text-slate-500 disabled:opacity-30 cursor-pointer">+</button>
              </div>
              <div className="flex gap-0.5 mt-0.5">
                {([30, 60, 90] as BreakInterval[]).map(v => (
                  <button key={v} type="button" onClick={() => onSetRestInterval(v)}
                    className={`text-[8px] px-0.5 py-px rounded font-bold border transition cursor-pointer ${
                      restInterval === v ? "bg-violet-500 text-white border-violet-500" : "bg-white text-slate-400 border-slate-200 hover:border-violet-300"
                    }`}>
                    {v === 30 ? "30분" : v === 60 ? "1h" : "1.5h"}
                  </button>
                ))}
              </div>
            </div>
            {ZONE_SLOTS.map(slot => {
              const k0 = subSlotKey(slot, 0);
              const k30 = subSlotKey(slot, 30);
              const activeK0 = shiftedRestSlots.includes(k0);
              const activeK30 = shiftedRestSlots.includes(k30);
              if (!activeK0 && !activeK30) {
                return (
                  <div key={slot} className="flex-1 flex border border-transparent">
                    {renderBreakSubCell(k0, false, restSlotMap, restTheme, onDropToRest, onRemoveFromRest, "rest", restCount, onReorderRest)}
                  </div>
                );
              }
              if (restInterval === 60) {
                const activeKey = activeK0 ? k0 : k30;
                return (
                  <div key={slot} className="flex-1 flex border border-violet-200">
                    {renderBreakSubCell(activeKey, true, restSlotMap, restTheme, onDropToRest, onRemoveFromRest, "rest", restCount, onReorderRest)}
                  </div>
                );
              }
              return (
                <div key={slot} className="flex-1 flex border border-violet-200">
                  {renderBreakSubCell(k0,  activeK0,  restSlotMap, restTheme, onDropToRest, onRemoveFromRest, "rest", restCount, onReorderRest)}
                  {renderBreakSubCell(k30, activeK30, restSlotMap, restTheme, onDropToRest, onRemoveFromRest, "rest", restCount, onReorderRest)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Drag-source chips — 현재 탭에 해당하는 인원만 표시 */}
      <div className="mt-2 pt-2 border-t border-sky-200/60">
        <WorkerChips
          workers={isTabAll ? allWorkers : allWorkers.filter(w => tabWorkerIds.has(w.emp.id))}
          assignedIds={assignedIds}
          lunchAssignedIds={lunchAssignedIds}
          draggingId={draggingId}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          compact
          typeTones={typeTones}
          onTouchDragStart={handleTouchDragStart}
          onTouchDragEnd={handleTouchDragEnd}
          grouped={isTabAll}
        />
      </div>

      {/* ── 셀 탭 팝업 (바텀시트) ── */}
      {cellPicker && (() => {
        const isZone   = cellPicker.type === "zone";
        const isLunch  = cellPicker.type === "lunch";
        const slot     = cellPicker.slot;
        const zone     = isZone ? (cellPicker as { type: "zone"; zone: ZoneRow; slot: string }).zone : undefined;

        const title = isZone
          ? `${zone} · ${slot}`
          : isLunch
          ? `점심 · ${slot}`
          : `휴게 · ${slot}`;

        const isAssigned = (empId: number) => {
          if (isZone && zone) return ((zoneMap[zone] ?? {})[slot] ?? []).includes(empId);
          if (isLunch)        return (lunchSlotMap[slot] ?? []).includes(empId);
          return               (restSlotMap[slot] ?? []).includes(empId);
        };
        const assignedList: number[] = isZone && zone
          ? ((zoneMap[zone] ?? {})[slot] ?? [])
          : isLunch
          ? (lunchSlotMap[slot] ?? [])
          : (restSlotMap[slot] ?? []);
        const canReorder = isLunch || cellPicker.type === "rest";
        const moveAssigned = (empId: number, dir: -1 | 1) => {
          const idx = assignedList.indexOf(empId);
          if (idx < 0) return;
          const target = idx + dir;
          if (target < 0 || target >= assignedList.length) return;
          if (isLunch && onReorderLunch) onReorderLunch(slot, empId, target);
          else if (cellPicker.type === "rest" && onReorderRest) onReorderRest(slot, empId, target);
        };

        const toggle = (empId: number) => {
          if (isAssigned(empId)) {
            if (isZone && zone)  onRemoveFromZone(zone, slot, empId);
            else if (isLunch)    onRemoveFromLunch(slot, empId);
            else                 onRemoveFromRest(slot, empId);
          } else {
            if (isZone && zone)  tryDropToZone(zone, slot, empId);
            else if (isLunch)    onDropToLunch(slot, empId);
            else                 onDropToRest(slot, empId);
          }
        };

        return (
          <>
            <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setCellPicker(null)} />
            <div className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-2xl shadow-2xl flex flex-col"
              style={{ maxHeight: "65vh" }}>
              {/* Header */}
              <div className={`flex items-center justify-between px-4 py-3 border-b ${
                isZone && zone === "카운터" ? "bg-rose-50 border-rose-200" :
                isZone ? "bg-sky-50 border-sky-200" :
                isLunch ? "bg-yellow-50 border-yellow-200" :
                "bg-violet-50 border-violet-200"
              }`}>
                <span className={`font-black text-base ${
                  isZone && zone === "카운터" ? "text-rose-700" :
                  isZone ? "text-sky-700" :
                  isLunch ? "text-yellow-700" : "text-violet-700"
                }`}>{title}</span>
                <button onClick={() => setCellPicker(null)}
                  className="text-slate-400 hover:text-slate-600 text-xl font-bold cursor-pointer px-1">✕</button>
              </div>
              {/* Worker list — 약사/사원/기타 섹션 그룹화 */}
              <div className="overflow-y-auto flex-1">
                {allWorkers.length === 0 && (
                  <div className="text-center text-slate-400 text-sm py-8">근무자 없음</div>
                )}
                {/* 현재 배정된 인원 · 순서 변경 가능 (점심·휴게 슬롯) */}
                {canReorder && assignedList.length > 0 && (
                  <div className="border-b border-slate-200 bg-indigo-50/30">
                    <div className="px-5 py-1.5 text-[10px] font-black uppercase tracking-wider text-indigo-700 border-b border-indigo-100 flex items-center justify-between">
                      <span>배정된 인원 · 순서 조정</span>
                      <span className="text-[9px] font-bold text-indigo-500">↑↓ 로 순서 변경</span>
                    </div>
                    {assignedList.map((empId, i) => {
                      const w = allWorkers.find(ww => ww.emp.id === empId);
                      if (!w) return null;
                      return (
                        <div key={`ord-${empId}`} className="flex items-center gap-2 px-5 py-2 border-b border-slate-100">
                          <span className="text-[11px] font-black text-indigo-500 w-5">{i + 1}.</span>
                          <span className="font-bold text-sm text-slate-800 flex-1 break-keep">{w.emp.name}</span>
                          <button
                            type="button"
                            onClick={() => moveAssigned(empId, -1)}
                            disabled={i === 0}
                            className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 font-black text-base flex items-center justify-center cursor-pointer transition"
                            title="위로 이동"
                          >↑</button>
                          <button
                            type="button"
                            onClick={() => moveAssigned(empId, 1)}
                            disabled={i === assignedList.length - 1}
                            className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 font-black text-base flex items-center justify-center cursor-pointer transition"
                            title="아래로 이동"
                          >↓</button>
                          <button
                            type="button"
                            onClick={() => toggle(empId)}
                            className="w-9 h-9 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 font-black text-sm flex items-center justify-center cursor-pointer transition"
                            title="배정 제거"
                          >✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(() => {
                  const popupSections: { label: string; items: typeof allWorkers; headerCls: string }[] = [
                    { label: "약사", items: allWorkers.filter(w => w.emp.position === "약사"),                                                     headerCls: "bg-indigo-50 text-indigo-700 border-indigo-100" },
                    { label: "사원", items: allWorkers.filter(w => isStaffEmp(w.emp)),                   headerCls: "bg-slate-50 text-slate-600 border-slate-100" },
                    { label: "기타", items: allWorkers.filter(w => isOtherEmp(w.emp)),                   headerCls: "bg-slate-50 text-slate-500 border-slate-100" },
                  ];
                  return popupSections.map(({ label, items, headerCls }) => {
                    if (items.length === 0) return null;
                    return (
                      <React.Fragment key={label}>
                        <div className={`px-5 py-1 text-[10px] font-black uppercase tracking-wider border-b ${headerCls}`}>{label}</div>
                        {items.map(({ emp, schedule }) => {
                          const assigned = isAssigned(emp.id);
                          const c = typeTones[schedule.type] ?? DEFAULT_TONE;
                          const isPharm = emp.position === "약사";
                          return (
                            <button key={emp.id}
                              onClick={() => toggle(emp.id)}
                              className={`w-full flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 transition active:bg-slate-100 cursor-pointer ${
                                assigned ? "bg-indigo-50" : "bg-white hover:bg-slate-50"
                              }`}
                            >
                              {/* Check indicator */}
                              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                assigned ? "bg-indigo-500 border-indigo-500" : "border-slate-300"
                              }`}>
                                {assigned && <span className="text-white text-xs font-black">✓</span>}
                              </div>
                              {/* Name + type */}
                              <div className="flex flex-col items-start gap-0.5 min-w-0">
                                <div className="flex items-center gap-1">
                                  {isPharm && <Pill size={11} className="text-indigo-500 shrink-0" />}
                                  <span className={`font-bold text-sm ${isPharm ? "text-indigo-800" : "text-slate-800"}`}>{emp.name}</span>
                                  {emp.position.includes("캐셔") && emp.position.includes("물류") && (
                                    <span className="text-[9px] font-black px-1 py-px rounded bg-blue-500 text-white leading-none" title="캐셔 겸직">C</span>
                                  )}
                                </div>
                                <span className="text-xs px-1.5 py-px rounded-full font-semibold"
                                  style={{ backgroundColor: c.chipBg, color: c.chipText }}>{schedule.type}</span>
                              </div>
                              {assigned && (
                                <span className="ml-auto text-[11px] font-bold text-rose-400">탭해서 제거</span>
                              )}
                            </button>
                          );
                        })}
                      </React.Fragment>
                    );
                  });
                })()}
              </div>
              {/* Footer */}
              <div className="px-4 py-3 border-t border-slate-100">
                <button onClick={() => setCellPicker(null)}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl cursor-pointer transition">
                  완료
                </button>
              </div>
            </div>
          </>
        );
      })()}
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
  onDateChange?: (newDate: string) => void;
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
  date, employees, typeHoursMap, pharmTypeHoursMap, onClose, onDateChange, onEditEmployee, onUpdateSchedule, scheduleTypeEntries,
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
  const [lunchInterval, setLunchInterval] = useState<BreakInterval>(() => {
    const v = localStorage.getItem(`tl_lunch_interval_${date}`);
    return v === "60" ? 60 : v === "90" ? 90 : 30;
  });
  const [restInterval, setRestInterval] = useState<BreakInterval>(() => {
    const v = localStorage.getItem(`tl_rest_interval_${date}`);
    return v === "60" ? 60 : v === "90" ? 90 : 30;
  });
  const [lunchCount, setLunchCount] = useState<BreakCount>(() => {
    const v = parseInt(localStorage.getItem(`tl_lunch_count_${date}`) || "1", 10);
    return ([1,2,3,4,5,6,7,8,9,10] as BreakCount[]).includes(v as BreakCount) ? (v as BreakCount) : 1;
  });
  const [restCount, setRestCount] = useState<BreakCount>(() => {
    const v = parseInt(localStorage.getItem(`tl_rest_count_${date}`) || "1", 10);
    return ([1,2,3,4,5,6,7,8,9,10] as BreakCount[]).includes(v as BreakCount) ? (v as BreakCount) : 1;
  });

  // 임의배치 상태 (DB/DOW 데이터 없을 때 자동 제안됨)
  const [isAutoSuggested, setIsAutoSuggested] = useState(false);
  // 확정 여부
  const [isConfirmed, setIsConfirmed] = useState(false);
  // 확정 저장 중
  const [confirming, setConfirming] = useState(false);

  // ── Day-of-week ───────────────────────────────────────────────────────────
  const dow = useMemo(() => new Date(date + "T00:00:00").getDay(), [date]);

  // ── DB-first loading: DB날짜별 → DOW 템플릿 → 임의배치 ────────────────────
  const dataLoadedRef = useRef<string | null>(null);

  // Helper: apply fetched data to state + localStorage
  const applySlotData = useCallback((
    data: {
      zone_slots?: ZoneMap; lunch_slots?: SlotMap; rest_slots?: SlotMap;
      lunch_offset?: number; rest_offset?: number;
      lunch_interval?: number; rest_interval?: number;
      lunch_count?: number; rest_count?: number;
    },
    targetDate: string,
  ) => {
    if (data.zone_slots && Object.keys(data.zone_slots).length > 0) {
      setZoneSlots(data.zone_slots);
      localStorage.setItem(`tl_zone_slots_${targetDate}`, JSON.stringify(data.zone_slots));
    }
    if (data.lunch_slots && Object.keys(data.lunch_slots).length > 0) {
      setLunchSlots(data.lunch_slots);
      localStorage.setItem(`tl_lunch_slots_${targetDate}`, JSON.stringify(data.lunch_slots));
    }
    if (data.rest_slots && Object.keys(data.rest_slots).length > 0) {
      setRestSlots(data.rest_slots);
      localStorage.setItem(`tl_rest_slots_${targetDate}`, JSON.stringify(data.rest_slots));
    }
    if (data.lunch_offset != null) {
      setLunchOffset(data.lunch_offset);
      localStorage.setItem(`tl_lunch_offset_${targetDate}`, String(data.lunch_offset));
    }
    if (data.rest_offset != null) {
      setRestOffset(data.rest_offset);
      localStorage.setItem(`tl_rest_offset_${targetDate}`, String(data.rest_offset));
    }
    if (data.lunch_interval === 30 || data.lunch_interval === 60 || data.lunch_interval === 90) {
      setLunchInterval(data.lunch_interval as BreakInterval);
      localStorage.setItem(`tl_lunch_interval_${targetDate}`, String(data.lunch_interval));
    }
    if (data.rest_interval === 30 || data.rest_interval === 60 || data.rest_interval === 90) {
      setRestInterval(data.rest_interval as BreakInterval);
      localStorage.setItem(`tl_rest_interval_${targetDate}`, String(data.rest_interval));
    }
    if (data.lunch_count && [1,2,3,4,5,6,7,8,9,10].includes(data.lunch_count)) {
      setLunchCount(data.lunch_count as BreakCount);
      localStorage.setItem(`tl_lunch_count_${targetDate}`, String(data.lunch_count));
    }
    if (data.rest_count && [1,2,3,4,5,6,7,8,9,10].includes(data.rest_count)) {
      setRestCount(data.rest_count as BreakCount);
      localStorage.setItem(`tl_rest_count_${targetDate}`, String(data.rest_count));
    }
  }, []);

  // 임의배치 생성: 약사 1명 + 캐셔/물류/진열 2명 → 카운터, 나머지 → 매장
  const buildAutoSuggest = useCallback((workerList: WorkerEntry[]): ZoneMap => {
    if (workerList.length === 0) return {};
    const newZoneMap: ZoneMap = { 카운터: {}, 매장: {} };

    // 카운터 팀 구성
    const pharmacists = workerList.filter(w => w.emp.position === "약사");
    const cashierLogistics = workerList.filter(w =>
      w.emp.position.includes("캐셔") || w.emp.position.includes("물류") || w.emp.position === "진열"
    );

    const counterTeam: WorkerEntry[] = [];
    // 약사 1명
    if (pharmacists.length > 0) counterTeam.push(pharmacists[0]);
    // 캐셔/물류/진열 최대 2명
    for (let i = 0; i < Math.min(2, cashierLogistics.length); i++) counterTeam.push(cashierLogistics[i]);

    const counterIds = new Set(counterTeam.map(w => w.emp.id));

    // 모든 직원 배정
    workerList.forEach(w => {
      const zone: typeof ZONE_ROWS[number] = counterIds.has(w.emp.id) ? "카운터" : "매장";
      const range = parseRange(w.wh);
      ZONE_SLOTS.forEach(slot => {
        const slotH = parseInt(slot.split(":")[0], 10) * 60;
        if (range && (slotH + 60 <= range.start || slotH >= range.end)) return;
        if (!newZoneMap[zone][slot]) newZoneMap[zone][slot] = [];
        newZoneMap[zone][slot].push(w.emp.id);
      });
    });
    return newZoneMap;
  }, []);

  useEffect(() => {
    if (dataLoadedRef.current === date) return;
    dataLoadedRef.current = date;

    // Reset state for new date (localStorage fallback)
    setIsAutoSuggested(false);
    setIsConfirmed(false);
    try { setLunchSlots(JSON.parse(localStorage.getItem(`tl_lunch_slots_${date}`) || "{}")); } catch { setLunchSlots({}); }
    try { setRestSlots(JSON.parse(localStorage.getItem(`tl_rest_slots_${date}`) || "{}")); } catch { setRestSlots({}); }
    try { setZoneSlots(JSON.parse(localStorage.getItem(`tl_zone_slots_${date}`) || "{}")); } catch { setZoneSlots({}); }
    const lo = parseInt(localStorage.getItem(`tl_lunch_offset_${date}`) || "0", 10);
    setLunchOffset(Number.isFinite(lo) ? Math.max(-60, Math.min(60, lo)) : 0);
    const ro = parseInt(localStorage.getItem(`tl_rest_offset_${date}`) || "0", 10);
    setRestOffset(Number.isFinite(ro) ? Math.max(-60, Math.min(60, ro)) : 0);
    const li = localStorage.getItem(`tl_lunch_interval_${date}`);
    setLunchInterval(li === "60" ? 60 : li === "90" ? 90 : 30);
    const ri2 = localStorage.getItem(`tl_rest_interval_${date}`);
    setRestInterval(ri2 === "60" ? 60 : ri2 === "90" ? 90 : 30);
    const lc = parseInt(localStorage.getItem(`tl_lunch_count_${date}`) || "1", 10);
    setLunchCount(([1,2,3,4,5,6,7,8,9,10] as BreakCount[]).includes(lc as BreakCount) ? (lc as BreakCount) : 1);
    const rc = parseInt(localStorage.getItem(`tl_rest_count_${date}`) || "1", 10);
    setRestCount(([1,2,3,4,5,6,7,8,9,10] as BreakCount[]).includes(rc as BreakCount) ? (rc as BreakCount) : 1);

    const slotHasData = (ls: SlotMap, rs: SlotMap, zs: ZoneMap) =>
      Object.values(ls).some((a: unknown) => (a as number[]).length > 0) ||
      Object.values(rs).some((a: unknown) => (a as number[]).length > 0) ||
      Object.values(zs).some((sm: unknown) => Object.values(sm as Record<string, number[]>).some(a => a.length > 0));

    // 1. DB 날짜별 배정 우선 조회
    fetch(`/api/zone-day/${date}`)
      .then(r => r.ok ? r.json() : null)
      .then((dayData: (Record<string, unknown> & { _empty?: boolean; is_confirmed?: boolean }) | null) => {
        if (!dayData) throw new Error("no day data");
        if (dayData._empty) throw new Error("empty");
        // 데이터가 있으면 적용
        const hasSlots = slotHasData(
          (dayData.lunch_slots as SlotMap) ?? {},
          (dayData.rest_slots as SlotMap) ?? {},
          (dayData.zone_slots as ZoneMap) ?? {},
        );
        if (hasSlots) {
          applySlotData(dayData as Parameters<typeof applySlotData>[0], date);
          setIsConfirmed(dayData.is_confirmed ?? false);
          setIsAutoSuggested(false);
          return;
        }
        throw new Error("empty slots");
      })
      .catch(() => {
        // 2. DOW 템플릿 조회
        const currentDow = new Date(date + "T00:00:00").getDay();
        fetch(`/api/zone-assignments/${currentDow}`)
          .then(r => r.ok ? r.json() : null)
          .then((dowData: (Record<string, unknown>) | null) => {
            if (!dowData) throw new Error("no dow");
            const hasSlots = slotHasData(
              (dowData.lunch_slots as SlotMap) ?? {},
              (dowData.rest_slots as SlotMap) ?? {},
              (dowData.zone_slots as ZoneMap) ?? {},
            );
            if (hasSlots) {
              applySlotData(dowData as Parameters<typeof applySlotData>[0], date);
              setIsAutoSuggested(false);
              return;
            }
            throw new Error("empty dow");
          })
          .catch(() => {
            // 3. 임의배치: workers가 아직 계산 전일 수 있으므로 빈 ZoneMap으로만 마크 → workers 계산 후 실제 배치는 별도 effect
            setIsAutoSuggested(true);
          });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // ── Workers ───────────────────────────────────────────────────────────────
  // 입사일 이전 · 퇴사일 이후 직원은 자동 제외 (전체스케쥴 회색처리와 연동)
  const workers = useMemo(() => employees
    .map(emp => {
      if (emp.hireDate && date < emp.hireDate) return null;
      if (emp.retireDate && date > emp.retireDate) return null;
      const s = emp.schedules.find(sc => sc.date === date);
      if (!s || SKIP_TYPES.has(s.type)) return null;
      const hoursMap = emp.position === "약사" ? (pharmTypeHoursMap ?? typeHoursMap) : typeHoursMap;
      const wh = s.workingHours || hoursMap?.[s.type] || "";
      return { emp, schedule: s, wh } as WorkerEntry;
    })
    .filter((w): w is WorkerEntry => w !== null)
    .sort((a, b) => (TYPE_ORDER[a.schedule.type] ?? 99) - (TYPE_ORDER[b.schedule.type] ?? 99)),
  [employees, date, typeHoursMap, pharmTypeHoursMap]);

  // 임의배치 실제 적용: isAutoSuggested가 true가 된 뒤 workers가 준비되면 배치 생성
  useEffect(() => {
    if (!isAutoSuggested || workers.length === 0) return;
    const suggested = buildAutoSuggest(workers);
    setZoneSlots(suggested);
    localStorage.setItem(`tl_zone_slots_${date}`, JSON.stringify(suggested));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoSuggested, workers]);

  const pharmacistWorkers = useMemo(() => workers.filter(w => w.emp.position === "약사"), [workers]);
  const staffWorkers      = useMemo(() => workers.filter(w => isStaffEmp(w.emp)), [workers]);
  const otherWorkers      = useMemo(() => workers.filter(w => isOtherEmp(w.emp)), [workers]);

  const tabWorkerIds = useMemo(() => new Set((() => {
    if (activeTab === "약사") return pharmacistWorkers.map(w => w.emp.id);
    if (activeTab === "사원") return staffWorkers.map(w => w.emp.id);
    if (activeTab === "기타") return otherWorkers.map(w => w.emp.id);
    return workers.map(w => w.emp.id);
  })()), [activeTab, workers, pharmacistWorkers, staffWorkers, otherWorkers]);
  const isTabAll = activeTab === "전체";
  const tabWorkers = useMemo(() => {
    if (activeTab === "약사") return pharmacistWorkers;
    if (activeTab === "사원") return staffWorkers;
    if (activeTab === "기타") return otherWorkers;
    return workers;
  }, [activeTab, workers, pharmacistWorkers, staffWorkers, otherWorkers]);

  // ── Row ordering ──────────────────────────────────────────────────────────
  const [dragRowId, setDragRowId] = useState<number | null>(null);
  const [orderedIds, setOrderedIds] = useState<number[]>(() => tabWorkers.map(w => w.emp.id));
  const [showUnassigned, setShowUnassigned] = useState(false);

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

  // 약사 / 사원 / 기타 그룹핑 — 일별 스케쥴 리스트에서 카테고리별로 분리
  const displayGroups = useMemo(() => {
    const pharm = displayWorkers.filter(w => w.emp.position === "약사");
    const staff = displayWorkers.filter(w => isStaffEmp(w.emp));
    const other = displayWorkers.filter(w => isOtherEmp(w.emp));
    return [
      { label: "약사", items: pharm, hdrCls: "text-indigo-600" },
      { label: "사원", items: staff, hdrCls: "text-slate-500" },
      { label: "기타", items: other, hdrCls: "text-slate-400" },
    ].filter(g => g.items.length > 0);
  }, [displayWorkers]);

  const workRanges = useMemo(() => {
    const r: Record<number, { start: number; end: number } | null> = {};
    workers.forEach(w => { r[w.emp.id] = parseRange(w.wh); });
    return r;
  }, [workers]);

  // ── 자동 저장 (debounce 1.5초) ────────────────────────────────────────────
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutoSave = useCallback((
    zs: ZoneMap, ls: SlotMap, rs: SlotMap,
    lo: number, ro: number, li: BreakInterval, ri: BreakInterval,
    lc: BreakCount, rc: BreakCount,
  ) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      fetch(`/api/zone-day/${date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zone_slots: zs, lunch_slots: ls, rest_slots: rs,
          lunch_offset: lo, rest_offset: ro,
          lunch_interval: li, rest_interval: ri,
          lunch_count: lc, rest_count: rc,
          is_confirmed: false,
        }),
      }).catch(() => {});
    }, 1500);
  }, [date]);

  // 확정 저장
  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/zone-day/${date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zone_slots: zoneSlots, lunch_slots: lunchSlots, rest_slots: restSlots,
          lunch_offset: lunchOffset, rest_offset: restOffset,
          lunch_interval: lunchInterval, rest_interval: restInterval,
          lunch_count: lunchCount, rest_count: restCount,
          is_confirmed: true,
        }),
      });
      if (res.ok) {
        setIsConfirmed(true);
        setIsAutoSuggested(false);
      } else {
        const detail = await res.text().catch(() => "");
        alert("확정 저장에 실패했습니다.\n" + detail);
      }
    } catch (e) {
      alert("확정 저장 오류: " + (e as Error).message);
    } finally {
      setConfirming(false);
    }
  }, [date, zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount]);

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
  const dropToLunchSlot = useCallback((slot: string, empId: number,
    source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }
  ) => {
    const [lh, lm] = slot.split(":").map(Number);
    const lStart = lh * 60 + lm;
    const lEnd = lStart + 30;
    // 점심 시간 겹침 검사 — 같은 사람이 시간이 겹치는 점심 슬롯에 배정될 수 없음
    // source slot(= 같은 lunch에서 이동)은 skip해서 정상 이동 허용
    const lunchDup = Object.entries(lunchSlots).some(([ls, ids]) => {
      if (source?.type === "lunch" && source.slot === ls) return false;
      if (!(ids as number[]).includes(empId)) return false;
      const [oh, om] = ls.split(":").map(Number);
      const oStart = oh * 60 + om;
      const oEnd = oStart + 30;
      return oStart < lEnd && oEnd > lStart;
    });
    if (lunchDup) { alert("이미 배정되었습니다.\n같은 시간대에 이미 점심이 배정되어 있습니다."); return; }
    // 출발지가 zone이고 그 slot이 이 lunch 시간대와 겹치면 zone 충돌 검사 스킵
    const zoneConflict = ZONE_ROWS.some(zone =>
      Object.entries(zoneSlots[zone] ?? {}).some(([zSlot, ids]) => {
        if (!(ids as number[]).includes(empId)) return false;
        if (source?.type === "zone" && source.zone === zone && source.slot === zSlot) return false;
        const zh = parseInt(zSlot.split(":")[0], 10) * 60;
        return zh < lEnd && zh + 60 > lStart;
      })
    );
    if (zoneConflict) { alert("중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 카운터/매장 구역이 배정되어 있습니다)"); return; }
    const restConflict = Object.entries(restSlots).some(([rs, ids]) => {
      if (!(ids as number[]).includes(empId)) return false;
      if (source?.type === "rest" && source.slot === rs) return false;
      const [rh, rm] = rs.split(":").map(Number);
      const rStart = rh * 60 + rm;
      return rStart < lEnd && rStart + 30 > lStart;
    });
    if (restConflict) { alert("중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 휴게시간이 배정되어 있습니다)"); return; }
    // 출발지 lunch/rest/zone에서 자동 제거 (atomic 이동)
    if (source?.type === "lunch" && source.slot !== slot) {
      setLunchSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    } else if (source?.type === "rest") {
      setRestSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    } else if (source?.type === "zone" && source.zone) {
      const srcZone = source.zone;
      setZoneSlots(prev => {
        const z = { ...(prev[srcZone] ?? {}) };
        z[source.slot] = (z[source.slot] ?? []).filter(id => id !== empId);
        return { ...prev, [srcZone]: z };
      });
    }
    setLunchSlots(prev => {
      const next = { ...prev, [slot]: [...(prev[slot] ?? []).filter(id => id !== empId), empId] };
      localStorage.setItem(`tl_lunch_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(zoneSlots, next, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, restSlots, lunchSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  const removeFromLunchSlot = useCallback((slot: string, empId: number) => {
    setLunchSlots(prev => {
      const next = { ...prev, [slot]: (prev[slot] ?? []).filter(id => id !== empId) };
      localStorage.setItem(`tl_lunch_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(zoneSlots, next, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  const dropToRestSlot = useCallback((slot: string, empId: number,
    source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }
  ) => {
    const [rh, rm] = slot.split(":").map(Number);
    const rStart = rh * 60 + rm;
    const rEnd = rStart + 30;
    const zoneConflict = ZONE_ROWS.some(zone =>
      Object.entries(zoneSlots[zone] ?? {}).some(([zSlot, ids]) => {
        if (!(ids as number[]).includes(empId)) return false;
        if (source?.type === "zone" && source.zone === zone && source.slot === zSlot) return false;
        const zh = parseInt(zSlot.split(":")[0], 10) * 60;
        return zh < rEnd && zh + 60 > rStart;
      })
    );
    if (zoneConflict) { alert("중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 카운터/매장 구역이 배정되어 있습니다)"); return; }
    const lunchConflict = Object.entries(lunchSlots).some(([ls, ids]) => {
      if (!(ids as number[]).includes(empId)) return false;
      if (source?.type === "lunch" && source.slot === ls) return false;
      const [lh, lm] = ls.split(":").map(Number);
      const lStart = lh * 60 + lm;
      return lStart < rEnd && lStart + 30 > rStart;
    });
    if (lunchConflict) { alert("중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 점심시간이 배정되어 있습니다)"); return; }
    // 출발지에서 자동 제거 (atomic 이동)
    if (source?.type === "rest" && source.slot !== slot) {
      setRestSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    } else if (source?.type === "lunch") {
      setLunchSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    } else if (source?.type === "zone" && source.zone) {
      const srcZone = source.zone;
      setZoneSlots(prev => {
        const z = { ...(prev[srcZone] ?? {}) };
        z[source.slot] = (z[source.slot] ?? []).filter(id => id !== empId);
        return { ...prev, [srcZone]: z };
      });
    }
    setRestSlots(prev => {
      const next = { ...prev, [slot]: [...(prev[slot] ?? []).filter(id => id !== empId), empId] };
      localStorage.setItem(`tl_rest_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(zoneSlots, lunchSlots, next, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, lunchSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  const removeFromRestSlot = useCallback((slot: string, empId: number) => {
    setRestSlots(prev => {
      const next = { ...prev, [slot]: (prev[slot] ?? []).filter(id => id !== empId) };
      localStorage.setItem(`tl_rest_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(zoneSlots, lunchSlots, next, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, lunchSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  const dropToZone = useCallback((zone: ZoneRow, slot: string, empId: number,
    source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }
  ) => {
    // 출발지가 lunch/rest이면 그 곳에서 자동 제거
    if (source?.type === "lunch") {
      setLunchSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    } else if (source?.type === "rest") {
      setRestSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    }
    // 출발지가 zone이면 그 zone/slot에서 제거 (같은 zone/slot이면 이동 아니므로 skip)
    setZoneSlots(prev => {
      let base = prev;
      if (source?.type === "zone" && source.zone && !(source.zone === zone && source.slot === slot)) {
        const srcZone = source.zone;
        const zSrc = { ...(base[srcZone] ?? {}) };
        zSrc[source.slot] = (zSrc[source.slot] ?? []).filter(id => id !== empId);
        base = { ...base, [srcZone]: zSrc };
      }
      const z = { ...(base[zone] ?? {}) };
      z[slot] = [...(z[slot] ?? []).filter(id => id !== empId), empId];
      const next = { ...base, [zone]: z };
      localStorage.setItem(`tl_zone_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(next, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  const removeFromZone = useCallback((zone: ZoneRow, slot: string, empId: number) => {
    setZoneSlots(prev => {
      const z = { ...(prev[zone] ?? {}) };
      z[slot] = (z[slot] ?? []).filter(id => id !== empId);
      const next = { ...prev, [zone]: z };
      localStorage.setItem(`tl_zone_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(next, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  // ── 요일별 템플릿 DB 저장 ─────────────────────────────────────────────────
  const saveTemplateToDow = useCallback(async (saveDow: number) => {
    // Pre-write FIRST so navigating to another date immediately shows data
    const cur = new Date();
    cur.setHours(0, 0, 0, 0);
    while (cur.getDay() !== saveDow) cur.setDate(cur.getDate() + 1);
    const dayDates: string[] = [];
    for (let i = 0; i < 4; i++) {
      const d = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      dayDates.push(d);
      localStorage.setItem(`tl_zone_slots_${d}`,  JSON.stringify(zoneSlots));
      localStorage.setItem(`tl_lunch_slots_${d}`, JSON.stringify(lunchSlots));
      localStorage.setItem(`tl_rest_slots_${d}`,  JSON.stringify(restSlots));
      localStorage.setItem(`tl_lunch_offset_${d}`, String(lunchOffset));
      localStorage.setItem(`tl_rest_offset_${d}`,  String(restOffset));
      localStorage.setItem(`tl_lunch_interval_${d}`, String(lunchInterval));
      localStorage.setItem(`tl_rest_interval_${d}`, String(restInterval));
      localStorage.setItem(`tl_lunch_count_${d}`, String(lunchCount));
      localStorage.setItem(`tl_rest_count_${d}`, String(restCount));
      cur.setDate(cur.getDate() + 7);
    }
    try {
      const dayPayload = {
        zone_slots: zoneSlots,
        lunch_slots: lunchSlots,
        rest_slots: restSlots,
        lunch_offset: lunchOffset,
        rest_offset: restOffset,
        lunch_interval: lunchInterval,
        rest_interval: restInterval,
        lunch_count: lunchCount,
        rest_count: restCount,
      };
      const responses = await Promise.all([
        // DOW 템플릿 저장
        fetch(`/api/zone-assignments/${saveDow}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dayPayload),
        }),
        // 해당 날짜들의 zone_day_assignments도 업데이트 (is_confirmed: false)
        ...dayDates.map(d => fetch(`/api/zone-day/${d}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...dayPayload, is_confirmed: false }),
        })),
      ]);
      // 실패한 응답 확인 — 조용한 실패로 저장 안됨 문제 방지
      const failed = responses.filter(r => !r.ok);
      if (failed.length > 0) {
        const details = await Promise.all(failed.map(async r => `${r.url}: ${r.status} ${await r.text().catch(() => "")}`));
        alert("일부 저장 실패:\n" + details.join("\n"));
      }
    } catch (e) {
      alert("저장 실패: " + (e as Error).message);
    }
  }, [zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount]);

  const handleLunchShiftOffset = useCallback((delta: number) => {
    setLunchOffset(prev => {
      const next = Math.max(-60, Math.min(60, prev + delta));
      localStorage.setItem(`tl_lunch_offset_${date}`, String(next));
      scheduleAutoSave(zoneSlots, lunchSlots, restSlots, next, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, lunchSlots, restSlots, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  const handleRestShiftOffset = useCallback((delta: number) => {
    setRestOffset(prev => {
      const next = Math.max(-60, Math.min(60, prev + delta));
      localStorage.setItem(`tl_rest_offset_${date}`, String(next));
      scheduleAutoSave(zoneSlots, lunchSlots, restSlots, lunchOffset, next, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, lunchSlots, restSlots, lunchOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  const handleSetLunchInterval = useCallback((v: BreakInterval) => {
    setLunchInterval(v);
    localStorage.setItem(`tl_lunch_interval_${date}`, String(v));
    scheduleAutoSave(zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, v, restInterval, lunchCount, restCount);
  }, [date, zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, restInterval, lunchCount, restCount, scheduleAutoSave]);
  const handleSetRestInterval = useCallback((v: BreakInterval) => {
    setRestInterval(v);
    localStorage.setItem(`tl_rest_interval_${date}`, String(v));
    scheduleAutoSave(zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, v, lunchCount, restCount);
  }, [date, zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, lunchCount, restCount, scheduleAutoSave]);

  const handleSetLunchCount = useCallback((v: BreakCount) => {
    setLunchCount(v);
    localStorage.setItem(`tl_lunch_count_${date}`, String(v));
    scheduleAutoSave(zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, v, restCount);
  }, [date, zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, restCount, scheduleAutoSave]);
  const handleSetRestCount = useCallback((v: BreakCount) => {
    setRestCount(v);
    localStorage.setItem(`tl_rest_count_${date}`, String(v));
    scheduleAutoSave(zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, v);
  }, [date, zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, scheduleAutoSave]);

  const shiftedLunchSlots = useMemo(() => {
    const all = LUNCH_SLOTS.map(s => shiftSlot(s, lunchOffset));
    if (lunchInterval === 90) return all.filter((_, i) => i % 3 === 0);
    if (lunchInterval === 60) return all.filter((_, i) => i % 2 === 0);
    return all;
  }, [lunchOffset, lunchInterval]);
  const shiftedRestSlots = useMemo(() => {
    const all = REST_SLOTS.map(s => shiftSlot(s, restOffset));
    if (restInterval === 90) return all.filter((_, i) => i % 3 === 0);
    if (restInterval === 60) return all.filter((_, i) => i % 2 === 0);
    return all;
  }, [restOffset, restInterval]);

  // ── Date title ────────────────────────────────────────────────────────────
  const d = new Date(date + "T00:00:00");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const title = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;
  const offsetDate = useCallback((delta: number) => {
    const nd = new Date(date + "T00:00:00");
    nd.setDate(nd.getDate() + delta);
    return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`;
  }, [date]);

  const tabs = useMemo(() => [
    { key: "전체" as TabKey, count: workers.length },
    { key: "사원" as TabKey, count: staffWorkers.length },
    { key: "약사" as TabKey, count: pharmacistWorkers.length },
    { key: "기타" as TabKey, count: otherWorkers.length },
  ], [workers, staffWorkers, pharmacistWorkers, otherWorkers]);

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 pt-4 sm:pt-0" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl overflow-hidden flex flex-col"
        style={{ maxHeight: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white flex-shrink-0 gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {onDateChange && (
              <button onClick={() => onDateChange(offsetDate(-1))}
                className="p-1 rounded hover:bg-slate-700 transition-colors text-slate-400 hover:text-white cursor-pointer shrink-0">
                <ChevronLeft size={16} />
              </button>
            )}
            <span className="text-sm font-bold tracking-tight shrink-0 break-keep">{title}</span>
            {onDateChange && (
              <button onClick={() => onDateChange(offsetDate(1))}
                className="p-1 rounded hover:bg-slate-700 transition-colors text-slate-400 hover:text-white cursor-pointer shrink-0">
                <ChevronRight size={16} />
              </button>
            )}
            <span className="bg-slate-700 text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 hidden sm:inline">
              근무 {workers.length}명 (사원 {staffWorkers.length} / 약사 {pharmacistWorkers.length}
              {otherWorkers.length > 0 ? ` / 기타 ${otherWorkers.length}` : ""})
            </span>
            <span className="bg-slate-700 text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 sm:hidden">
              {workers.length}명
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white shrink-0">
            <X size={17} />
          </button>
        </div>

        {/* Position filter tabs */}
        <div className="flex items-center gap-1 px-3 sm:px-5 pt-2 pb-0 bg-white border-b border-slate-200 flex-shrink-0 min-w-0 overflow-x-auto scrollbar-none">
          {tabs.map(({ key, count }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`shrink-0 px-3 sm:px-4 py-1.5 text-xs font-bold rounded-t-lg border border-b-0 transition-colors cursor-pointer ${
                activeTab === key
                  ? "bg-white border-slate-200 text-slate-800 -mb-px z-10"
                  : "bg-slate-50 border-transparent text-slate-400 hover:text-slate-600"
              }`}>
              {key}
              <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === key ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-500"}`}>{count}</span>
            </button>
          ))}
          {/* 확정 버튼 */}
          <div className="ml-auto flex items-center gap-2 pb-1 shrink-0 pl-2">
            {isConfirmed ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
                <CheckCircle size={13} />
                확정됨
              </span>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white cursor-pointer disabled:opacity-50 transition">
                <CheckCircle size={13} />
                {confirming ? "저장중…" : "확정"}
              </button>
            )}
          </div>
        </div>

        {/* 임의배치 배너 */}
        {isAutoSuggested && (
          <div className="flex items-center justify-between px-4 py-2 bg-amber-400 text-amber-900 flex-shrink-0">
            <span className="text-[12px] font-black tracking-tight">
              ⚡ 임의배치 — 확정하기 전에 배치를 조정하세요
            </span>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="text-[11px] font-bold px-3 py-1 rounded-lg bg-amber-900 text-amber-100 hover:bg-amber-800 cursor-pointer disabled:opacity-50 transition ml-3 shrink-0">
              {confirming ? "저장중…" : "지금 확정"}
            </button>
          </div>
        )}

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 select-none">

          {/* ── 근무시간 섹션 ── */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">근무시간</span>
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
                      className="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200 hover:bg-orange-200 cursor-pointer transition flex items-center gap-1"
                      title="클릭하여 미배정 인원 명단 보기"
                    >
                      미배정 {unassignedList.length}명
                      <span className={`text-[9px] transition-transform ${showUnassigned ? "rotate-180" : ""}`}>▾</span>
                    </button>
                    {showUnassigned && (
                      <div className="absolute z-30 mt-1 left-0 bg-white border border-orange-200 rounded-lg shadow-lg p-2 min-w-[180px] max-w-[280px] max-h-64 overflow-y-auto">
                        <div className="text-[9px] font-black text-orange-500 uppercase tracking-wider mb-1 px-1">미배정 인원</div>
                        <div className="flex flex-wrap gap-1">
                          {unassignedList.map(w => (
                            <span key={w.emp.id}
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-100">
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
                <div className="flex-shrink-0 w-[132px]">
                  <div className="h-7" />
                  {displayGroups.flatMap(g => [
                    <div key={`hdr-${g.label}`}
                      className={`mb-1 h-5 px-1 flex items-end text-[9px] font-black uppercase tracking-wider border-b border-slate-200 ${g.hdrCls}`}>
                      {g.label} · {g.items.length}
                    </div>,
                    ...g.items.map(({ emp, schedule }) => {
                    const colors = typeTones[schedule.type] ?? DEFAULT_TONE;
                    const isPharmacist = emp.position === "약사";
                    const hasLunch = Object.values(lunchSlots ?? {}).some(ids => Array.isArray(ids) && (ids as number[]).includes(emp.id));
                    const hasRest  = Object.values(restSlots ?? {}).some(ids => Array.isArray(ids) && (ids as number[]).includes(emp.id));

                    // 물류 담당 구역 (물류 또는 캐셔+물류 겸직인 경우 표시)
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
                          <span className={`text-[11px] font-bold whitespace-nowrap ${isPharmacist ? "text-indigo-800 ring-1 ring-emerald-400 rounded px-1 bg-emerald-50/50" : "text-slate-800"}`}>{emp.name}</span>
                          {/* 입사일/퇴사일 배지 — 오늘 보고 있는 날짜가 그날인 경우 표시 */}
                          {!!emp.hireDate && date === emp.hireDate && (
                            <span className="text-[8px] font-black px-1 py-px rounded bg-emerald-500 text-white leading-none shrink-0" title={`입사일 (${emp.hireDate})`}>입사</span>
                          )}
                          {!!emp.retireDate && date === emp.retireDate && (
                            <span className="text-[8px] font-black px-1 py-px rounded bg-rose-500 text-white leading-none shrink-0" title={`퇴사일 (${emp.retireDate})`}>퇴사</span>
                          )}
                          {/* 오픈/마감 등 근무유형을 이름 옆에 배지로 인라인 표시 (기존 별도 줄 제거) */}
                          <span className="text-[9px] font-bold leading-none shrink-0" style={{ color: colors.text }}>{schedule.type}</span>
                          {/* 캐셔 겸직 배지 — 이름 옆에 작게 표시 */}
                          {isCashierLogistics && (
                            <span className="text-[8px] font-black px-1 py-px rounded bg-blue-500 text-white leading-none shrink-0" title="캐셔 겸직">C</span>
                          )}
                          {/* 배정 구역 배지: 물류 또는 캐셔+물류 직원의 담당구역 (파란색) */}
                          {showZoneBadge && (() => {
                            const zoneNumsRaw = (emp as any).zone_nums ?? (emp as any).zoneNums;
                            const zoneNums: number[] = Array.isArray(zoneNumsRaw) ? zoneNumsRaw : [];
                            if (zoneNums.length === 0) return null;
                            return (
                              <span className={`text-[8px] font-bold px-1 py-px rounded leading-none shrink-0 ${isCashierLogistics ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : "bg-blue-50 text-blue-600"}`}
                                title={isCashierLogistics ? "캐셔·물류 겸직" : "물류 담당구역"}>
                                {zoneNums.slice(0, 3).join("·")}{zoneNums.length > 3 ? "…" : ""}
                              </span>
                            );
                          })()}
                          {hasLunch && (
                            <span className="text-[8px] font-bold px-1 py-px rounded bg-yellow-100 text-yellow-600 leading-none shrink-0">점심</span>
                          )}
                          {hasRest && (
                            <span className="text-[8px] font-bold px-1 py-px rounded bg-violet-100 text-violet-600 leading-none shrink-0">휴게</span>
                          )}
                          {onEditEmployee && (
                            <button onClick={() => onEditEmployee(emp)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 transition-all cursor-pointer shrink-0">
                              <Pencil size={9} className="text-slate-400" />
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
                  }),
                  ])}
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
                      {displayGroups.flatMap(g => [
                        <div key={`sp-${g.label}`} className="mb-1 h-5" />,
                        ...g.items.map(({ emp, schedule }) => {
                        const colors = typeTones[schedule.type] ?? DEFAULT_TONE;
                        const workRange = workRanges[emp.id];
                        return (
                          <div key={emp.id}
                            className={`relative mb-1 h-8 bg-slate-50 rounded-lg border border-slate-100 transition-opacity ${dragRowId === emp.id ? "opacity-40" : "opacity-100"}`}>
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
                      }),
                      ])}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mx-4 h-px bg-slate-100" />

          {/* ── 구역 · 점심 · 휴게 배정 섹션 ── */}
          <div className="px-4 py-3 pb-5">
            <ZoneSection
              zoneMap={zoneSlots}
              workers={tabWorkers}
              allWorkers={workers}
              onDropToZone={dropToZone}
              onRemoveFromZone={removeFromZone}
              typeTones={typeTones}
              workRanges={workRanges}
              currentDow={dow}
              onSaveToDow={saveTemplateToDow}
              lunchSlotMap={lunchSlots}
              shiftedLunchSlots={shiftedLunchSlots}
              lunchOffset={lunchOffset}
              onShiftLunchOffset={handleLunchShiftOffset}
              onDropToLunch={dropToLunchSlot}
              onRemoveFromLunch={removeFromLunchSlot}
              onReorderLunch={(slot, empId, toIndex) => {
                setLunchSlots(prev => {
                  const arr = [...(prev[slot] ?? [])];
                  const from = arr.indexOf(empId);
                  if (from < 0) return prev;
                  arr.splice(from, 1);
                  const idx = Math.max(0, Math.min(toIndex, arr.length));
                  arr.splice(idx, 0, empId);
                  const next = { ...prev, [slot]: arr };
                  localStorage.setItem(`tl_lunch_slots_${date}`, JSON.stringify(next));
                  scheduleAutoSave(zoneSlots, next, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
                  return next;
                });
              }}
              restSlotMap={restSlots}
              shiftedRestSlots={shiftedRestSlots}
              restOffset={restOffset}
              onShiftRestOffset={handleRestShiftOffset}
              onDropToRest={dropToRestSlot}
              onRemoveFromRest={removeFromRestSlot}
              onReorderRest={(slot, empId, toIndex) => {
                setRestSlots(prev => {
                  const arr = [...(prev[slot] ?? [])];
                  const from = arr.indexOf(empId);
                  if (from < 0) return prev;
                  arr.splice(from, 1);
                  const idx = Math.max(0, Math.min(toIndex, arr.length));
                  arr.splice(idx, 0, empId);
                  const next = { ...prev, [slot]: arr };
                  localStorage.setItem(`tl_rest_slots_${date}`, JSON.stringify(next));
                  scheduleAutoSave(zoneSlots, lunchSlots, next, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
                  return next;
                });
              }}
              lunchInterval={lunchInterval}
              restInterval={restInterval}
              onSetLunchInterval={handleSetLunchInterval}
              onSetRestInterval={handleSetRestInterval}
              lunchCount={lunchCount}
              restCount={restCount}
              onSetLunchCount={handleSetLunchCount}
              onSetRestCount={handleSetRestCount}
              tabWorkerIds={tabWorkerIds}
              isTabAll={isTabAll}
              onUserInteract={() => setIsAutoSuggested(false)}
              onAutoSuggest={() => {
                // 현재 탭 인원 기준으로 자동배치 생성 후 기존 zoneSlots에 병합
                // (다른 탭 인원의 배정은 보존)
                const suggested = buildAutoSuggest(tabWorkers);
                const tabIdSet = new Set(tabWorkers.map(w => w.emp.id));

                // ── 1단계: 점심 배정 계산 (구역 배정 전에 먼저 확정) ──────────
                const lunchAssignments = new Map<number, string>(); // empId → lunch slot key
                {
                  const slots = [...shiftedLunchSlots];
                  if (slots.length > 0) {
                    const perSlotCount: Record<string, number> = {};
                    slots.forEach(s => { perSlotCount[s] = 0; });
                    // 근무 시간이 첫 lunch slot을 포함하는 사람만 후보
                    const candidates = tabWorkers.filter(w => {
                      const r = workRanges[w.emp.id];
                      if (!r) return true;
                      const [lh0, lm0] = slots[0].split(":").map(Number);
                      const first = lh0 * 60 + lm0;
                      return first >= r.start && first < r.end;
                    });
                    let si = 0;
                    for (const w of candidates) {
                      let tries = 0;
                      while (tries < slots.length && perSlotCount[slots[si]] >= lunchCount) {
                        si = (si + 1) % slots.length;
                        tries++;
                      }
                      if (tries >= slots.length) break;
                      const key = slots[si];
                      lunchAssignments.set(w.emp.id, key);
                      perSlotCount[key]++;
                      si = (si + 1) % slots.length;
                    }
                  }
                }

                // ── 2단계: 구역(zone) 배정 — 점심시간에 걸리는 zone slot에서는 해당 인원 제외 ─
                let nextZone: ZoneMap = {};
                setZoneSlots(prev => {
                  const next: ZoneMap = {};
                  for (const zone of ZONE_ROWS) {
                    const existing = prev[zone] ?? {};
                    const cleaned: Record<string, number[]> = {};
                    for (const [slot, ids] of Object.entries(existing)) {
                      cleaned[slot] = (ids as number[]).filter(id => !tabIdSet.has(id));
                    }
                    next[zone] = cleaned;
                  }
                  // suggested 병합 시 점심 시간과 겹치는 slot에서는 해당 인원 제거
                  const conflictsWithLunch = (empId: number, zoneSlot: string): boolean => {
                    const lunchSlot = lunchAssignments.get(empId);
                    if (!lunchSlot) return false;
                    const zh = parseInt(zoneSlot.split(":")[0], 10) * 60;
                    const zEnd = zh + 60;
                    const [lh, lm] = lunchSlot.split(":").map(Number);
                    const lStart = lh * 60 + lm;
                    const lEnd = lStart + 30;
                    return zh < lEnd && zEnd > lStart;
                  };
                  for (const zone of ZONE_ROWS) {
                    const sug = suggested[zone] ?? {};
                    for (const [slot, idsRaw] of Object.entries(sug)) {
                      const ids = (idsRaw as number[]).filter(id => !conflictsWithLunch(id, slot));
                      next[zone][slot] = [...(next[zone][slot] ?? []).filter(id => !ids.includes(id)), ...ids];
                    }
                  }
                  nextZone = next;
                  localStorage.setItem(`tl_zone_slots_${date}`, JSON.stringify(next));
                  return next;
                });

                // ── 3단계: 점심 배정 반영 ─────────────────────────────────
                setLunchSlots(prev => {
                  const cleaned: SlotMap = {};
                  for (const [slot, ids] of Object.entries(prev)) {
                    cleaned[slot] = (ids as number[]).filter(id => !tabIdSet.has(id));
                  }
                  for (const [empId, slot] of lunchAssignments) {
                    cleaned[slot] = [...(cleaned[slot] ?? []), empId];
                  }
                  localStorage.setItem(`tl_lunch_slots_${date}`, JSON.stringify(cleaned));
                  scheduleAutoSave(nextZone, cleaned, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
                  return cleaned;
                });

                setIsAutoSuggested(false);
              }}
            />
          </div>

        </div>
      </div>
    </div>
  );
};
