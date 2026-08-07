// src/hooks/useResizablePanel.ts
// 좌우 패널 폭 조절 공통 훅 · localStorage 저장·복원 · mouse 지원
// 적용: StaffManagePage · OrderManagePage(3개) · CategoryTab · ReturnListPanel · DisplayPage
import React, { useCallback, useEffect, useRef, useState } from "react";

export interface UseResizablePanelOptions {
  storageKey: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  /** 데스크탑 감지 기준 px (default 1024) · true 이면 isDesktop 상태 제공 */
  detectDesktop?: boolean;
  desktopBreakpoint?: number;
}

export interface UseResizablePanelResult {
  width: number;
  setWidth: (w: number) => void;
  startResize: (e: React.MouseEvent) => void;
  isDesktop: boolean;
}

export function useResizablePanel({
  storageKey,
  defaultWidth,
  minWidth = 0,
  maxWidth = 9999,
  detectDesktop = false,
  desktopBreakpoint = 1024,
}: UseResizablePanelOptions): UseResizablePanelResult {
  const [width, setWidthState] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(storageKey));
      return Number.isFinite(v) && v >= minWidth && v <= maxWidth ? v : defaultWidth;
    } catch {
      return defaultWidth;
    }
  });

  const [isDesktop, setIsDesktop] = useState<boolean>(
    () => detectDesktop && typeof window !== "undefined" && window.innerWidth >= desktopBreakpoint,
  );

  useEffect(() => {
    if (!detectDesktop) return;
    const onResize = () => setIsDesktop(window.innerWidth >= desktopBreakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [detectDesktop, desktopBreakpoint]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, String(width)); } catch { /* ignore */ }
  }, [storageKey, width]);

  const setWidth = useCallback((w: number) => {
    setWidthState(Math.max(minWidth, Math.min(maxWidth, w)));
  }, [minWidth, maxWidth]);

  // Ref 방식으로 drag 중 stale closure 방지
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const widthRef = useRef(width);
  useEffect(() => { widthRef.current = width; }, [width]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startW: widthRef.current };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const next = Math.max(minWidth, Math.min(maxWidth, r.startW + (ev.clientX - r.startX)));
      setWidthState(next);
    };
    const onUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [minWidth, maxWidth]);

  return { width, setWidth, startResize, isDesktop };
}
