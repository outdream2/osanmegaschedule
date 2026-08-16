// src/hooks/useSidebar.ts
// 2026-08-11 · 사이드바 V2 · collapsed 상태 · width 드래그 리사이즈 · localStorage 영속화
import { useEffect, useRef, useState, useCallback } from "react";

const COLLAPSED_KEY = "sidebar.collapsed";
const WIDTH_KEY = "sidebar.width";
const AUTO_COLLAPSE_BELOW = 1280;

export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 380;
export const SIDEBAR_DEFAULT_WIDTH = 220;

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(COLLAPSED_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return window.innerWidth < AUTO_COLLAPSE_BELOW;
}

function readWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  const raw = parseInt(localStorage.getItem(WIDTH_KEY) ?? "", 10);
  if (Number.isFinite(raw) && raw >= SIDEBAR_MIN_WIDTH && raw <= SIDEBAR_MAX_WIDTH) return raw;
  return SIDEBAR_DEFAULT_WIDTH;
}

/** 사이드바 폭 · 드래그 리사이즈 · localStorage 영속화 (PC 전용 · 모바일은 shadcn Sheet 자동 사용) */
export function useSidebarWidth() {
  const [width, setWidth] = useState<number>(readWidth);
  // 2026-08-12 · 드래그 중 unmount 시 리스너/스타일 리크 방지 · cleanup 저장
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  /** 마우스다운 시 · document 에 mousemove/mouseup 리스너 추가 · 폭 조정 */
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, startWidth + (ev.clientX - startX)));
      setWidth(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      cleanupRef.current = null;
    };
    // 이전 드래그의 cleanup 이 살아있으면 먼저 정리 (연속 mousedown 방어)
    cleanupRef.current?.();
    cleanupRef.current = onUp;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width]);

  return { width, setWidth, startResize };
}

export function useSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed(v => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = useCallback(() => setCollapsed(v => !v), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return { collapsed, toggle, mobileOpen, openMobile, closeMobile };
}

// 2026-08-16 · 사이드바 활성 · env 대신 서버 KV 설정 (Supabase app_settings.sidebar_enabled) 로 관리
//   · 사용자 요구: 배포 후에도 관리자가 UI 에서 토글 가능해야 함 (env 재배포 불필요)
//   · env VITE_SIDEBAR_V2 는 초기 fallback (서버 미응답 시)
//   · 기본값 · true (사이드바 활성) · env "false" 면 비활성
const SIDEBAR_FALLBACK = import.meta.env.VITE_SIDEBAR_V2 !== "false";

const SIDEBAR_ENABLED_KEY = "sidebar_enabled";
const CACHE_EVENT = "sidebar-enabled-updated";
let cachedEnabled: boolean | null = null;
let inflight: Promise<boolean> | null = null;

async function fetchSidebarEnabled(): Promise<boolean> {
  if (cachedEnabled !== null) return cachedEnabled;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`/api/settings?key=${SIDEBAR_ENABLED_KEY}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const v = body?.value;
      const enabled = typeof v === "boolean" ? v : SIDEBAR_FALLBACK;
      cachedEnabled = enabled;
      return enabled;
    } catch {
      cachedEnabled = SIDEBAR_FALLBACK;
      return SIDEBAR_FALLBACK;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** 사이드바 활성 여부 무효화 (관리자 토글 후 호출 · 브로드캐스트) */
export function invalidateSidebarEnabled(): void {
  cachedEnabled = null;
  try {
    window.dispatchEvent(new CustomEvent<null>(CACHE_EVENT));
  } catch { /* silent */ }
}

/** 사이드바 활성 여부 훅 · 서버 KV + 로컬 캐시 · 실시간 반영 */
export function useSidebarEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(cachedEnabled ?? SIDEBAR_FALLBACK);

  useEffect(() => {
    let alive = true;
    fetchSidebarEnabled().then((v) => { if (alive) setEnabled(v); });
    const handler = () => {
      fetchSidebarEnabled().then((v) => { if (alive) setEnabled(v); });
    };
    window.addEventListener(CACHE_EVENT, handler);
    return () => {
      alive = false;
      window.removeEventListener(CACHE_EVENT, handler);
    };
  }, []);

  return enabled;
}

/** 하위호환 · 기존 코드용 · const 값 · 초기 render 시점 · 훅 도입 후 deprecated */
export const SIDEBAR_ENABLED = SIDEBAR_FALLBACK;
