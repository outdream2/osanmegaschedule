// src/hooks/useSidebar.ts
// 2026-08-11 · 사이드바 V2 · collapsed 상태 · width 드래그 리사이즈 · localStorage 영속화
import { useEffect, useState, useCallback } from "react";

const COLLAPSED_KEY = "sidebar.collapsed";
const WIDTH_KEY = "sidebar.width";
const AUTO_COLLAPSE_BELOW = 1280;

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 400;
export const SIDEBAR_DEFAULT_WIDTH = 256;

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

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

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
    };
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

export const SIDEBAR_ENABLED = import.meta.env.VITE_SIDEBAR_V2 === "true";
