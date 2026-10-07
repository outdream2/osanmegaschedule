// src/shared/schedule/dayAssignment.ts
// 2026-10-07 · Schedule V2-C2 · Daily zone/lunch/rest assignment persistence helpers
//   · V1 DayTimelineModal 과 V2 DayScheduleViewV2 가 공유하는 단일 소스
//   · 기존 V1 key convention (tl_<kind>_<field?>_YYYY-MM-DD) 그대로 유지 · 신규 key 생성 금지
//   · identity = employees.id (number) · 기존과 동일 · migration 불필요
//   · DB 연동은 /api/zone-day/{date} 그대로 (별도 저장소 추가 없음)
//
// 책임 범위:
//   · localStorage 직접 접근 (load/save/parse)
//   · 30 일 초과 stale key 정리 (cleanupStaleTimelineKeys)
//   · Quota 방어 (safeSetTimelineItem) — V1 utils.ts 와 동일 semantics
//   · 서버 debounced auto-save 는 호출측 책임 (keys 와 payload 포맷만 통일)
//
// 비책임:
//   · 자동 배치 알고리즘 (buildAutoSuggestZoneMap · computeLunchAssignments) — utils.ts 유지
//   · drag/drop UI · conflict 검증 — useSlotHandlers 에 유지

import type { SlotMap, ZoneMap, BreakInterval, BreakCount } from "../../components/DayTimelineModal/types";

// ── Key naming (V1 기존 convention 그대로) ────────────────────────────────────
const TL_PREFIX = "tl_";
const TL_KEY_DATE_RE = /_(\d{4}-\d{2}-\d{2})$/;

export const zoneSlotsKey   = (date: string) => `tl_zone_slots_${date}`;
export const lunchSlotsKey  = (date: string) => `tl_lunch_slots_${date}`;
export const restSlotsKey   = (date: string) => `tl_rest_slots_${date}`;
export const lunchOffsetKey = (date: string) => `tl_lunch_offset_${date}`;
export const restOffsetKey  = (date: string) => `tl_rest_offset_${date}`;
export const lunchIntervalKey = (date: string) => `tl_lunch_interval_${date}`;
export const restIntervalKey  = (date: string) => `tl_rest_interval_${date}`;
export const lunchCountKey  = (date: string) => `tl_lunch_count_${date}`;
export const restCountKey   = (date: string) => `tl_rest_count_${date}`;

// ── Quota / cleanup ──────────────────────────────────────────────────────────
export function cleanupStaleTimelineKeys(now: Date = new Date()): number {
  let removed = 0;
  try {
    const cutoff = now.getTime() - 30 * 86400_000;
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(TL_PREFIX)) continue;
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
  catch (e: unknown) {
    const err = e as { name?: string; code?: number };
    if (!(err?.name === "QuotaExceededError" || err?.code === 22 || err?.code === 1014)) return;
    if (cleanupStaleTimelineKeys() === 0) return;
    try { localStorage.setItem(key, value); } catch { /**/ }
  }
}

// ── Slot maps (zone/lunch/rest) ──────────────────────────────────────────────
export function loadZoneSlots(date: string): ZoneMap {
  try { return JSON.parse(localStorage.getItem(zoneSlotsKey(date)) || "{}") as ZoneMap; }
  catch { return {}; }
}
export function saveZoneSlots(date: string, data: ZoneMap): void {
  safeSetTimelineItem(zoneSlotsKey(date), JSON.stringify(data));
}

export function loadLunchSlots(date: string): SlotMap {
  try { return JSON.parse(localStorage.getItem(lunchSlotsKey(date)) || "{}") as SlotMap; }
  catch { return {}; }
}
export function saveLunchSlots(date: string, data: SlotMap): void {
  safeSetTimelineItem(lunchSlotsKey(date), JSON.stringify(data));
}

export function loadRestSlots(date: string): SlotMap {
  try { return JSON.parse(localStorage.getItem(restSlotsKey(date)) || "{}") as SlotMap; }
  catch { return {}; }
}
export function saveRestSlots(date: string, data: SlotMap): void {
  safeSetTimelineItem(restSlotsKey(date), JSON.stringify(data));
}

// ── Offsets (minutes) ────────────────────────────────────────────────────────
export function loadLunchOffset(date: string): number {
  const v = parseInt(localStorage.getItem(lunchOffsetKey(date)) || "0", 10);
  return Number.isFinite(v) ? Math.max(-60, Math.min(60, v)) : 0;
}
export function saveLunchOffset(date: string, value: number): void {
  safeSetTimelineItem(lunchOffsetKey(date), String(value));
}

export function loadRestOffset(date: string): number {
  const v = parseInt(localStorage.getItem(restOffsetKey(date)) || "0", 10);
  return Number.isFinite(v) ? Math.max(-60, Math.min(60, v)) : 0;
}
export function saveRestOffset(date: string, value: number): void {
  safeSetTimelineItem(restOffsetKey(date), String(value));
}

// ── Interval ─────────────────────────────────────────────────────────────────
const VALID_INTERVALS: readonly BreakInterval[] = [30, 60, 90];
function parseInterval(raw: string | null): BreakInterval {
  return raw === "60" ? 60 : raw === "90" ? 90 : 30;
}
export function loadLunchInterval(date: string): BreakInterval {
  return parseInterval(localStorage.getItem(lunchIntervalKey(date)));
}
export function saveLunchInterval(date: string, value: BreakInterval): void {
  if (!VALID_INTERVALS.includes(value)) return;
  safeSetTimelineItem(lunchIntervalKey(date), String(value));
}
export function loadRestInterval(date: string): BreakInterval {
  return parseInterval(localStorage.getItem(restIntervalKey(date)));
}
export function saveRestInterval(date: string, value: BreakInterval): void {
  if (!VALID_INTERVALS.includes(value)) return;
  safeSetTimelineItem(restIntervalKey(date), String(value));
}

// ── Count (slot row count) ───────────────────────────────────────────────────
const VALID_COUNTS: readonly BreakCount[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
function parseCount(raw: string | null): BreakCount {
  const v = parseInt(raw || "1", 10);
  return (VALID_COUNTS as readonly number[]).includes(v) ? (v as BreakCount) : 1;
}
export function loadLunchCount(date: string): BreakCount {
  return parseCount(localStorage.getItem(lunchCountKey(date)));
}
export function saveLunchCount(date: string, value: BreakCount): void {
  if (!VALID_COUNTS.includes(value)) return;
  safeSetTimelineItem(lunchCountKey(date), String(value));
}
export function loadRestCount(date: string): BreakCount {
  return parseCount(localStorage.getItem(restCountKey(date)));
}
export function saveRestCount(date: string, value: BreakCount): void {
  if (!VALID_COUNTS.includes(value)) return;
  safeSetTimelineItem(restCountKey(date), String(value));
}

// ── Aggregate snapshot (for V2 Day Assignment read-only view) ────────────────
export interface DayAssignmentSnapshot {
  zone: ZoneMap;
  lunch: SlotMap;
  rest: SlotMap;
  lunchOffset: number;
  restOffset: number;
  lunchInterval: BreakInterval;
  restInterval: BreakInterval;
  lunchCount: BreakCount;
  restCount: BreakCount;
}

export function loadDayAssignmentSnapshot(date: string): DayAssignmentSnapshot {
  return {
    zone: loadZoneSlots(date),
    lunch: loadLunchSlots(date),
    rest: loadRestSlots(date),
    lunchOffset: loadLunchOffset(date),
    restOffset: loadRestOffset(date),
    lunchInterval: loadLunchInterval(date),
    restInterval: loadRestInterval(date),
    lunchCount: loadLunchCount(date),
    restCount: loadRestCount(date),
  };
}
