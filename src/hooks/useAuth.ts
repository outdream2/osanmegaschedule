// src/hooks/useAuth.ts
import { useState, useEffect, useCallback, useRef } from "react";
import type { AuthSession } from "../types";

const STORAGE_KEY = "megatown_auth_session";

/** 30 minutes in ms — idle timeout · 2026-08-23 · #252 · KV `session_idle_timeout_minutes` 로 동적 조회 (fallback 30분) */
const IDLE_TIMEOUT_DEFAULT_MS = 30 * 60 * 1000;
const IDLE_TIMEOUT_MIN_MS = 5 * 60 * 1000;
const IDLE_TIMEOUT_MAX_MS = 480 * 60 * 1000;
/** useKvSetting 이 localStorage 에 캐시 · 매 tick 최신 값 조회 · 관리자 편집 즉시 반영 */
function getEffectiveIdleTimeoutMs(): number {
  try {
    const raw = localStorage.getItem("kv:session_idle_timeout_minutes");
    if (!raw) return IDLE_TIMEOUT_DEFAULT_MS;
    const parsed = JSON.parse(raw);
    const n = typeof parsed === "number" ? parsed : Number(parsed);
    if (!Number.isFinite(n)) return IDLE_TIMEOUT_DEFAULT_MS;
    const ms = Math.round(n) * 60 * 1000;
    if (ms < IDLE_TIMEOUT_MIN_MS || ms > IDLE_TIMEOUT_MAX_MS) return IDLE_TIMEOUT_DEFAULT_MS;
    return ms;
  } catch {
    return IDLE_TIMEOUT_DEFAULT_MS;
  }
}
/** 24 hours in ms — absolute session cap regardless of activity */
const ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
/** Warn this many ms before idle expiry · 30분 idle 기준 · 5분 전 경고 */
const WARN_BEFORE_MS = 5 * 60 * 1000;
/** How often the background timer tick runs */
const TICK_INTERVAL_MS = 30_000;

/** DOM events that count as user activity */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
];

const VALID_ROLES: string[] = ["superadmin", "admin", "manager", "employee", "vendor"];

function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed || !VALID_ROLES.includes(parsed.role)) return null;
    // Discard legacy sessions that lack level (can't determine privilege)
    if (parsed.level === undefined || parsed.level === null) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearAllMegatownKeys(): void {
  Object.keys(localStorage)
    .filter((k) => k.startsWith("megatown_"))
    .forEach((k) => localStorage.removeItem(k));
}

function isExpired(session: AuthSession, now: number): boolean {
  // rememberMe sessions never expire automatically — only explicit logout clears them
  if (session.rememberMe) return false;
  // Absolute timeout: hard cap from login time
  if (session.loginAt !== undefined && now - session.loginAt > ABSOLUTE_TIMEOUT_MS) {
    return true;
  }
  // Idle timeout: no activity for 8 hours
  const lastActivity = session.lastActiveAt ?? session.loginAt;
  if (lastActivity !== undefined && now - lastActivity > getEffectiveIdleTimeoutMs()) {
    return true;
  }
  return false;
}

function isWarnWindow(session: AuthSession, now: number): boolean {
  if (session.rememberMe) return false;
  const lastActivity = session.lastActiveAt ?? session.loginAt;
  if (lastActivity === undefined) return false;
  const idleElapsed = now - lastActivity;
  return (
    idleElapsed >= getEffectiveIdleTimeoutMs() - WARN_BEFORE_MS &&
    idleElapsed < getEffectiveIdleTimeoutMs()
  );
}

/** Returns seconds until idle expiry (may be negative if already expired) */
function secondsUntilIdleExpiry(session: AuthSession, now: number): number {
  const lastActivity = session.lastActiveAt ?? session.loginAt;
  if (lastActivity === undefined) return 0;
  return Math.round((lastActivity + getEffectiveIdleTimeoutMs() - now) / 1000);
}

export interface UseAuthReturn {
  session: AuthSession | null;
  setSession: (next: AuthSession | null) => void;
  clearSession: () => void;
  /** true while the 5-minute warning window is active */
  showTimeoutWarning: boolean;
  /** seconds remaining until idle auto-logout (only meaningful while showTimeoutWarning is true) */
  secondsRemaining: number;
  /** Call this when the user clicks "계속 사용" — resets the idle clock */
  extendSession: () => void;
}

export function useAuth(): UseAuthReturn {
  const [session, setSessionState] = useState<AuthSession | null>(() => {
    const s = readSession();
    if (s && isExpired(s, Date.now())) {
      clearAllMegatownKeys();
      return null;
    }
    return s;
  });
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // Keep a ref so activity handler can always access current session without
  // stale-closure issues, and so we can throttle localStorage writes.
  const sessionRef = useRef(session);
  const lastWriteRef = useRef(0);

  const persistSession = useCallback((s: AuthSession) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, []);

  const setSession = useCallback((next: AuthSession | null) => {
    if (next) {
      const now = Date.now();
      const stamped: AuthSession = {
        ...next,
        loginAt: next.loginAt ?? now,
        lastActiveAt: now,
      };
      persistSession(stamped);
      sessionRef.current = stamped;
      setSessionState(stamped);
    } else {
      clearAllMegatownKeys();
      sessionRef.current = null;
      setSessionState(null);
    }
    setShowTimeoutWarning(false);
  }, [persistSession]);

  const clearSession = useCallback(() => {
    clearAllMegatownKeys();
    sessionRef.current = null;
    setSessionState(null);
    setShowTimeoutWarning(false);
  }, []);

  // Extend idle clock — called on "계속 사용" click
  const extendSession = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    const now = Date.now();
    const updated: AuthSession = { ...current, lastActiveAt: now };
    persistSession(updated);
    sessionRef.current = updated;
    setSessionState(updated);
    setShowTimeoutWarning(false);
  }, [persistSession]);

  // ---- Activity listener: throttled to max 1 localStorage write per minute ----
  useEffect(() => {
    const handleActivity = () => {
      const current = sessionRef.current;
      if (!current) return;
      const now = Date.now();
      // Throttle: only write if >60 s since last write
      if (now - lastWriteRef.current < 60_000) return;
      lastWriteRef.current = now;
      const updated: AuthSession = { ...current, lastActiveAt: now };
      persistSession(updated);
      sessionRef.current = updated;
      // Don't call setSessionState here — it would re-render the whole tree every
      // minute just for a timestamp update. The ticker will sync display state.
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true })
    );
    return () => {
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, handleActivity as EventListener)
      );
    };
  }, [persistSession]);

  // ---- Periodic expiry / warning ticker ----
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      // Always re-read from localStorage so we pick up activity recorded in other
      // tabs (the storage event handler below keeps sessionRef in sync, but ticks
      // may fire before the event propagates).
      const stored = readSession();

      if (!stored) {
        if (sessionRef.current !== null) {
          sessionRef.current = null;
          setSessionState(null);
          setShowTimeoutWarning(false);
        }
        return;
      }

      if (isExpired(stored, now)) {
        clearAllMegatownKeys();
        sessionRef.current = null;
        setSessionState(null);
        setShowTimeoutWarning(false);
        // 세션 만료 플래그 저장 (LandingPage 에서 안내 표시)
        try { sessionStorage.setItem("megatown_session_expired", "1"); } catch { /* noop */ }
        window.location.replace("/?expired=1");
        return;
      }

      // Sync in-memory ref to whatever localStorage says (handles other-tab activity)
      sessionRef.current = stored;

      if (isWarnWindow(stored, now)) {
        setShowTimeoutWarning(true);
        setSecondsRemaining(secondsUntilIdleExpiry(stored, now));
      } else {
        setShowTimeoutWarning(false);
      }
    };

    tick(); // run immediately on mount
    const id = setInterval(tick, TICK_INTERVAL_MS);
    // 2026-08-23 · #251 · 탭 focus 복귀 시 즉시 tick · 브라우저 background throttling 우회
    //   · 문제 · 탭이 background 상태 시 setInterval 이 스로틀 (Chrome 1s min) · 30분 idle 감지 지연
    //   · 결과 · 사용자가 탭 복귀 시 · 랜딩페이지 로그인 상태로 노출 (실제는 만료) · 데이터 0
    //   · 해결 · visibilitychange · document.visible 시 즉시 tick + 만료 시 로그인 화면 이동
    //   · window focus 도 fallback (visibilitychange 미지원 브라우저 대비)
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    const onFocus = () => tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []); // intentionally empty — ticker is self-contained via refs

  // ---- Cross-tab sync via StorageEvent ----
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY && e.key !== null) return;
      const updated = readSession();
      sessionRef.current = updated;
      setSessionState(updated);
      if (!updated) setShowTimeoutWarning(false);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return {
    session,
    setSession,
    clearSession,
    showTimeoutWarning,
    secondsRemaining,
    extendSession,
  };
}
