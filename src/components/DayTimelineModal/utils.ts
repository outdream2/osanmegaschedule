// 2026-08-16 · #8 · Phase 2A · DayTimelineModal slim helpers
import type { Employee } from "../../types";
import { getTypeHex, derivePresetTones, type ScheduleTypeEntry } from "../../constants";
import { DEFAULT_TONE, type TypeTone } from "./types";

export const DISPLAY_START = 10 * 60;
export const DISPLAY_END = 22 * 60;
export const TOTAL = DISPLAY_END - DISPLAY_START;

export const HOUR_SLOTS: string[] = Array.from({ length: 13 }, (_, i) => `${String(10 + i).padStart(2, "0")}:00`);
export const LUNCH_SLOTS = ["11:30", "12:00", "12:30", "13:00", "13:30", "14:00"];
export const REST_SLOTS = ["16:00", "16:30", "17:00", "17:30", "18:00"];

export const isOtherEmp = (e: Employee) => e.position === "기타" || e.position === "알바" || e.employmentType === "알바";
export const isPharmEmp = (e: Employee) => e.position === "약사";
export const isStaffEmp = (e: Employee) => !isPharmEmp(e) && !isOtherEmp(e);

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
