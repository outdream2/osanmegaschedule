// src/hooks/useSidebar.ts
// 2026-08-11 · 사이드바 V2 · collapsed 상태 · localStorage 영속화 · Ctrl+B 단축키
import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "sidebar.collapsed";
const AUTO_COLLAPSE_BELOW = 1280; // Desktop L 기준 · 이 미만은 초기 접힘

function readInitial(): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return window.innerWidth < AUTO_COLLAPSE_BELOW;
}

export function useSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(readInitial);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  // Ctrl/Cmd + B 단축키
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
