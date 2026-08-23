// src/hooks/useSessionTimeoutSetting.ts
// 2026-08-23 · #252 · 세션 만료 시간 · 설정에서 관리자 편집 가능 (분 단위)
//   · 기존 · IDLE_TIMEOUT_MS = 30분 하드코딩 (useAuth.ts)
//   · 개선 · 서버 KV `session_idle_timeout_minutes` · 관리자 lv9 편집
//   · 범위 · 5분 ~ 480분 (8시간) · 기본 30분
//   · 소비처 · useAuth (IDLE_TIMEOUT_MS 대체) · SessionTimeoutWarning · 관리자 설정 UI

import { useKvSetting } from "./useKvSetting";

export const SESSION_TIMEOUT_DEFAULT_MINUTES = 30;
export const SESSION_TIMEOUT_MIN_MINUTES = 5;
export const SESSION_TIMEOUT_MAX_MINUTES = 480;

function sanitize(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.round(n);
  if (clamped < SESSION_TIMEOUT_MIN_MINUTES || clamped > SESSION_TIMEOUT_MAX_MINUTES) return null;
  return clamped;
}

export interface UseSessionTimeoutSettingResult {
  minutes: number;
  ms: number;
  loaded: boolean;
}

/** 세션 만료 시간 조회 훅 (읽기 전용) · 편집 UI 는 별도 컴포넌트 */
export function useSessionTimeoutSetting(): UseSessionTimeoutSettingResult {
  const { value, loaded } = useKvSetting<number>({
    key: "session_idle_timeout_minutes",
    defaultValue: SESSION_TIMEOUT_DEFAULT_MINUTES,
    sanitize,
  });
  return { minutes: value, ms: value * 60 * 1000, loaded };
}

/** 편집 UI 용 · 값 조회 + 저장 · 관리자 lv9 전용 UI 에서 사용 */
export function useSessionTimeoutSettingEditor() {
  return useKvSetting<number>({
    key: "session_idle_timeout_minutes",
    defaultValue: SESSION_TIMEOUT_DEFAULT_MINUTES,
    sanitize,
  });
}
