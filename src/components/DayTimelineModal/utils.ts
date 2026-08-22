// 2026-08-16 · #8 · Phase 2A · DayTimelineModal slim helpers
import { getTypeHex, derivePresetTones, type ScheduleTypeEntry } from "../../constants";
import { DEFAULT_TONE, type TypeTone, type WorkerEntry, type ZoneMap } from "./types";
import { isPharmEmp as _isPharmEmp } from "../../lib/employeeCategory";

export const DISPLAY_START = 10 * 60;
export const DISPLAY_END = 22 * 60;
export const TOTAL = DISPLAY_END - DISPLAY_START;

export const HOUR_SLOTS: string[] = Array.from({ length: 13 }, (_, i) => `${String(10 + i).padStart(2, "0")}:00`);
export const LUNCH_SLOTS = ["11:30", "12:00", "12:30", "13:00", "13:30", "14:00"];
export const REST_SLOTS = ["16:00", "16:30", "17:00", "17:30", "18:00"];

// 2026-08-16 · #91 · 공통 lib · src/lib/employeeCategory 로 통합 (SchedulePage 도 사용)
export { isOtherEmp, isPharmEmp, isStaffEmp } from "../../lib/employeeCategory";

// LocalStorage · tl_*_YYYY-MM-DD · 30일 만료 정리 + Quota 대응
const TL_KEY_PREFIX = "tl_";
const TL_KEY_DATE_RE = /_(\d{4}-\d{2}-\d{2})$/;

export function cleanupStaleTimelineKeys(now: Date = new Date()): number {
  let removed = 0;
  try {
    const cutoff = now.getTime() - 30 * 86400_000;
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(TL_KEY_PREFIX)) continue;
      const m = key.match(TL_KEY_DATE_RE);
      if (!m) continue;
      const ts = Date.parse(m[1] + "T00:00:00");
      if (Number.isFinite(ts) && ts < cutoff) stale.push(key);
    }
    for (const k of stale) { try { localStorage.removeItem(k); removed++; } catch { /**/ } }
  } catch { /**/ }
  return removed;
}

export function safeSetTimelineItem(key: string, value: string): void {
  try { localStorage.setItem(key, value); }
  catch (e: any) {
    if (!(e?.name === "QuotaExceededError" || e?.code === 22 || e?.code === 1014)) return;
    if (cleanupStaleTimelineKeys() === 0) return;
    try { localStorage.setItem(key, value); } catch { /**/ }
  }
}

// 시간 계산
export function parseRange(wh: string): { start: number; end: number } | null {
  if (!wh) return null;
  const m = wh.match(/^(\d{1,2})(?::(\d{2}))?\s*[-~]\s*(\d{1,2})(?::(\d{2}))?$/);
  return m ? { start: +m[1] * 60 + (+m[2] || 0), end: +m[3] * 60 + (+m[4] || 0) } : null;
}
export const pct = (min: number) => ((Math.max(DISPLAY_START, Math.min(DISPLAY_END, min)) - DISPLAY_START) / TOTAL) * 100;
export const widthPct = (s: number, e: number) => {
  const a = Math.max(DISPLAY_START, s), b = Math.min(DISPLAY_END, e);
  return b <= a ? 0 : ((b - a) / TOTAL) * 100;
};
export const minToStr = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export function shiftSlot(base: string, offsetMin: number): string {
  const [h, m] = base.split(":").map(Number);
  const total = h * 60 + m + offsetMin;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(((total % 60) + 60) % 60).padStart(2, "0")}`;
}
export function datesInMonth(dateStr: string): string[] {
  const d = new Date(dateStr + "T00:00:00");
  const y = d.getFullYear(), mo = d.getMonth();
  const count = new Date(y, mo + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${y}-${String(mo + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}

// Ghost drag (touch)
let ghostEl: HTMLDivElement | null = null;
export function createGhost(name: string): void {
  ghostEl = document.createElement("div");
  ghostEl.style.cssText = "position:fixed;z-index:9999;pointer-events:none;background:#4f46e5;color:white;padding:4px 10px;border-radius:999px;font-size:13px;font-weight:700;transform:translate(-50%,-50%);white-space:nowrap;";
  ghostEl.textContent = name;
  document.body.appendChild(ghostEl);
}
export const moveGhost = (x: number, y: number) => { if (ghostEl) { ghostEl.style.left = `${x}px`; ghostEl.style.top = `${y}px`; } };
export const removeGhost = () => { ghostEl?.remove(); ghostEl = null; };

// 근무 유형 색상 톤 · settings 기반 + fallback
export function buildTypeTones(entries?: ScheduleTypeEntry[]): Record<string, TypeTone> {
  const out: Record<string, TypeTone> = {};
  const known = ["오픈", "미들", "마감", "오픈마감", "오전반차", "오후반차"];
  const build = (type: string) => {
    const hex = getTypeHex(type, entries);
    const t = derivePresetTones(hex);
    return { bg: hex, text: t.text, dot: t.dot, chipBg: t.bg, chipText: t.text, chipBorder: t.chip };
  };
  for (const t of known) out[t] = build(t);
  for (const e of entries ?? []) if (e.type && !out[e.type]) out[e.type] = build(e.type);
  return out;
}

export { DEFAULT_TONE };

// 2026-08-22 · Framework Phase 4 · DayTimelineModal 이관 · 자동배치 빌더
// ZONE_SLOTS 은 ZoneSection 내부 (const) · 여기서는 파라미터로 받음 (순환 참조 방지)
// 2026-08-22 · 점심 배정 계산 · pure function (onAutoSuggest 콜백 이관)
//   · 매장 인원 우선 · 카운터 팀 후순위 · 근무 범위 내만 · lunchCount 명 제한 라운드로빈
export function computeLunchAssignments(
  tabWorkers: WorkerEntry[],
  shiftedLunchSlots: string[],
  workRanges: Record<number, { start: number; end: number } | null>,
  lunchCount: number,
): Map<number, string> {
  const lunchAssignments = new Map<number, string>();
  const lunchSlotArr = [...shiftedLunchSlots];
  if (lunchSlotArr.length === 0) return lunchAssignments;

  const perSlotCount: Record<string, number> = {};
  lunchSlotArr.forEach(s => { perSlotCount[s] = 0; });

  const lunchCandidates = tabWorkers.filter(w => {
    const r = workRanges[w.emp.id];
    if (!r) return true;
    return lunchSlotArr.some(slot => {
      const [lh, lm] = slot.split(":").map(Number);
      const lStart = lh * 60 + lm;
      return lStart >= r.start && lStart < r.end;
    });
  });

  const pharmAndCashier = new Set(
    tabWorkers
      .filter(w => _isPharmEmp(w.emp) || w.emp.position.includes("캐셔"))
      .map(w => w.emp.id)
  );
  const sortedCandidates = [...lunchCandidates].sort((a, b) => {
    const aCounter = pharmAndCashier.has(a.emp.id) ? 1 : 0;
    const bCounter = pharmAndCashier.has(b.emp.id) ? 1 : 0;
    return aCounter - bCounter;
  });

  let si = 0;
  for (const w of sortedCandidates) {
    const empId = w.emp.id;
    const r = workRanges[empId];
    for (let tries = 0; tries < lunchSlotArr.length; tries++) {
      const slotKey = lunchSlotArr[(si + tries) % lunchSlotArr.length];
      if (perSlotCount[slotKey] >= lunchCount) continue;
      if (r) {
        const [lh, lm] = slotKey.split(":").map(Number);
        const lStart = lh * 60 + lm;
        if (lStart < r.start || lStart >= r.end) continue;
      }
      lunchAssignments.set(empId, slotKey);
      perSlotCount[slotKey]++;
      si = (lunchSlotArr.indexOf(slotKey) + 1) % lunchSlotArr.length;
      break;
    }
  }
  return lunchAssignments;
}

export function buildAutoSuggestZoneMap(
  workerList: WorkerEntry[],
  zoneSlots: readonly string[],
  lunchMap: Map<number, string> = new Map(),
  rangeMap: Record<number, { start: number; end: number } | null> = {},
): ZoneMap {
  if (workerList.length === 0) return {};
  const newZoneMap: ZoneMap = { 카운터: {}, 매장: {} };

  const inRange = (empId: number, slotH: number): boolean => {
    const r = rangeMap[empId];
    if (!r) return true;
    return slotH < r.end && slotH + 60 > r.start;
  };

  const conflictsWithLunch = (empId: number, slotH: number): boolean => {
    const lKey = lunchMap.get(empId);
    if (!lKey) return false;
    const [lh, lm] = lKey.split(":").map(Number);
    const lStart = lh * 60 + lm;
    const lEnd = lStart + 30;
    return slotH < lEnd && slotH + 60 > lStart;
  };

  const pharmWorkers = workerList.filter(w => _isPharmEmp(w.emp));
  const cashierWorkers = workerList.filter(w =>
    !_isPharmEmp(w.emp) && w.emp.position.includes("캐셔")
  );
  const otherWorkers = workerList.filter(w =>
    !_isPharmEmp(w.emp) && !w.emp.position.includes("캐셔")
  );

  let pharmRIdx = 0;
  let cashier1Idx = 0;

  for (const slot of zoneSlots) {
    const slotH = parseInt(slot.split(":")[0], 10) * 60;

    let pharmAssigned: number | null = null;
    if (pharmWorkers.length > 0) {
      for (let tries = 0; tries < pharmWorkers.length; tries++) {
        const candidate = pharmWorkers[(pharmRIdx + tries) % pharmWorkers.length];
        if (inRange(candidate.emp.id, slotH) && !conflictsWithLunch(candidate.emp.id, slotH)) {
          pharmAssigned = candidate.emp.id;
          pharmRIdx = (pharmRIdx + 1) % pharmWorkers.length;
          break;
        }
      }
    }
    if (pharmAssigned != null) {
      if (!newZoneMap["카운터"][slot]) newZoneMap["카운터"][slot] = [];
      newZoneMap["카운터"][slot].push(pharmAssigned);
    }

    if (cashierWorkers.length > 0) {
      const c1 = cashierWorkers.length;
      let assigned = 0;
      for (let offset = 0; offset < c1 && assigned < 2; offset++) {
        const idx = (cashier1Idx + offset) % c1;
        const candidate = cashierWorkers[idx];
        if (inRange(candidate.emp.id, slotH) && !conflictsWithLunch(candidate.emp.id, slotH)) {
          if (!newZoneMap["카운터"][slot]) newZoneMap["카운터"][slot] = [];
          newZoneMap["카운터"][slot].push(candidate.emp.id);
          assigned++;
        }
      }
      cashier1Idx = (cashier1Idx + 1) % Math.max(1, c1);
    }

    for (const w of pharmWorkers) {
      if (w.emp.id === pharmAssigned) continue;
      if (inRange(w.emp.id, slotH) && !conflictsWithLunch(w.emp.id, slotH)) {
        if (!newZoneMap["매장"][slot]) newZoneMap["매장"][slot] = [];
        newZoneMap["매장"][slot].push(w.emp.id);
      }
    }

    for (const w of otherWorkers) {
      if (inRange(w.emp.id, slotH) && !conflictsWithLunch(w.emp.id, slotH)) {
        if (!newZoneMap["매장"][slot]) newZoneMap["매장"][slot] = [];
        newZoneMap["매장"][slot].push(w.emp.id);
      }
    }

    const counterCashierSet = new Set(newZoneMap["카운터"][slot] ?? []);
    for (const w of cashierWorkers) {
      if (!counterCashierSet.has(w.emp.id) && inRange(w.emp.id, slotH) && !conflictsWithLunch(w.emp.id, slotH)) {
        if (!newZoneMap["매장"][slot]) newZoneMap["매장"][slot] = [];
        newZoneMap["매장"][slot].push(w.emp.id);
      }
    }
  }

  return newZoneMap;
}
