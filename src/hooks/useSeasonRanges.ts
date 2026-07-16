// src/hooks/useSeasonRanges.ts
// 계절 → 월 매핑 (app_settings key='season_ranges') · 전역 캐시 훅
//   - 앱 시작 시 한 번 fetch → 모듈 캐시 + localStorage 캐시
//   - 관리자가 계절 정의 변경 시 setSeasonRanges 로 즉시 반영
//   - 사용처: SeasonButtons UI · 그리고 각 페이지에서 계절 클릭 → 서버에 ?season=xxx 전송
import { useEffect, useState, useCallback } from "react";

export type SeasonKey = "spring" | "summer" | "autumn" | "winter";
export type SeasonRanges = Record<SeasonKey, number[]>;

export const DEFAULT_SEASON_RANGES: SeasonRanges = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
};

const STORAGE_KEY = "megatown_season_ranges";

// 모듈 레벨 캐시 · 여러 컴포넌트에서 공유
let cache: SeasonRanges | null = null;
let inflight: Promise<SeasonRanges> | null = null;
const listeners = new Set<(v: SeasonRanges) => void>();

function normalize(input: any): SeasonRanges {
  const clean = (arr: any): number[] => {
    if (!Array.isArray(arr)) return [];
    const set = new Set<number>();
    for (const v of arr) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= 12) set.add(n);
    }
    return [...set].sort((a, b) => a - b);
  };
  const raw = (input && typeof input === "object") ? input : {};
  const out: SeasonRanges = {
    spring: clean(raw.spring),
    summer: clean(raw.summer),
    autumn: clean(raw.autumn),
    winter: clean(raw.winter),
  };
  for (const k of ["spring", "summer", "autumn", "winter"] as SeasonKey[]) {
    if (out[k].length === 0) out[k] = [...DEFAULT_SEASON_RANGES[k]];
  }
  return out;
}

function loadFromStorage(): SeasonRanges | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveToStorage(v: SeasonRanges) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

/** 서버에서 최신 계절 정의 fetch · 캐시 갱신 */
export async function fetchSeasonRanges(): Promise<SeasonRanges> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch("/api/settings/season-ranges");
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const v = normalize(j);
      cache = v;
      saveToStorage(v);
      listeners.forEach(fn => fn(v));
      return v;
    } catch {
      const stored = loadFromStorage();
      const fallback = stored ?? { ...DEFAULT_SEASON_RANGES };
      cache = fallback;
      return fallback;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** 계절 정의 저장 (관리자 전용 · level>=9 서버측 검증) */
export async function saveSeasonRanges(ranges: SeasonRanges, employeeId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/settings/season-ranges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ranges, employeeId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j?.error ?? "저장 실패" };
    const v = normalize(j.ranges ?? ranges);
    cache = v;
    saveToStorage(v);
    listeners.forEach(fn => fn(v));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "네트워크 오류" };
  }
}

/**
 * 앱 어디서든 계절 정의를 얻는 훅.
 *   - 첫 호출 시 모듈 캐시 or localStorage → 즉시 반환
 *   - 백그라운드에서 fetch → 최신 값으로 갱신
 */
export function useSeasonRanges(): SeasonRanges {
  const [ranges, setRanges] = useState<SeasonRanges>(() => cache ?? loadFromStorage() ?? { ...DEFAULT_SEASON_RANGES });

  useEffect(() => {
    let mounted = true;
    if (!cache) {
      fetchSeasonRanges().then(v => { if (mounted) setRanges(v); }).catch(() => { /* ignore */ });
    }
    const listener = (v: SeasonRanges) => { if (mounted) setRanges(v); };
    listeners.add(listener);
    return () => { mounted = false; listeners.delete(listener); };
  }, []);

  return ranges;
}

/** 계절키 → 한글 라벨 · 이모지 */
export const SEASON_LABEL: Record<SeasonKey, string> = {
  spring: "봄",
  summer: "여름",
  autumn: "가을",
  winter: "겨울",
};
export const SEASON_EMOJI: Record<SeasonKey, string> = {
  spring: "🌸",
  summer: "☀️",
  autumn: "🍁",
  winter: "❄️",
};

/** 계절 월 배열 → "3·4·5월" 형식 라벨 */
export function formatMonths(months: number[]): string {
  if (!months || months.length === 0) return "-";
  return months.map(m => `${m}`).join("·") + "월";
}

/** 로그아웃 등 상황에서 캐시 초기화 */
export function clearSeasonCache() {
  cache = null;
  inflight = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

// UI 편의를 위한 useCallback 래퍼 · 저장 후 자동으로 훅 재렌더
export function useSaveSeasonRanges() {
  return useCallback(saveSeasonRanges, []);
}
