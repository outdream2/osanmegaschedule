// src/hooks/useColumnResize.ts
// 테이블 컬럼 폭 드래그 리사이즈 훅 (T-UI-컬럼리사이저)
//
// 사용법:
//   const { getWidth, startResize, resizerProps } = useColumnResize("myPage", {
//     name:    { default: 180, min: 80, max: 400 },
//     amount:  { default: 100, min: 60, max: 200 },
//   });
//   // JSX
//   <th style={{ width: getWidth("name") }}>
//     이름
//     <span {...resizerProps("name")} />
//   </th>
//
// - localStorage key: megatown_col_width.<pageKey>.<colKey>
// - Mouse + Touch 모두 지원
// - React DnD 없음 · pure pointer event
// - 2단(카테고리) 헤더도 동일하게 사용 가능

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 리사이저 핸들 <span> 에 공통으로 쓸 Tailwind className
 * th 에 `position: relative` 필요
 * 사용: <span {...resizerProps("col")} className={RESIZER_CLS} style={{ touchAction:"none" }} />
 */
export const RESIZER_CLS =
  "absolute right-0 top-0 bottom-0 w-3 " +
  "flex items-center justify-center z-10 " +
  "cursor-col-resize select-none " +
  "after:content-[''] after:absolute after:right-1 after:top-1/4 after:bottom-1/4 " +
  "after:w-px after:bg-slate-300 after:rounded-full " +
  "hover:after:bg-sky-400 hover:after:w-[2px] after:transition-all after:duration-100";

export interface ColDef {
  /** 기본 폭(px) */
  default: number;
  /** 최소 폭(px) · 기본 60 */
  min?: number;
  /** 최대 폭(px) · 기본 800 */
  max?: number;
}

type ColWidths<K extends string> = Record<K, number>;

function storageKey(pageKey: string, colKey: string): string {
  return `megatown_col_width.${pageKey}.${colKey}`;
}

function loadWidth(pageKey: string, colKey: string, def: number): number {
  try {
    const raw = localStorage.getItem(storageKey(pageKey, colKey));
    if (raw == null) return def;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : def;
  } catch {
    return def;
  }
}

function saveWidth(pageKey: string, colKey: string, w: number) {
  try {
    localStorage.setItem(storageKey(pageKey, colKey), String(w));
  } catch { /**/ }
}

export interface UseColumnResizeResult<K extends string> {
  /** 현재 컬럼 폭(px) */
  getWidth: (col: K) => number;
  /** 리사이즈 핸들에 spread 할 props */
  resizerProps: (col: K) => {
    onMouseDown: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
    role: "separator";
    "aria-label": string;
    className: string;
    style: React.CSSProperties;
  };
  /** 폭 강제 리셋 (기본값으로) */
  resetWidth: (col: K) => void;
  /** 모든 컬럼 폭 리셋 */
  resetAll: () => void;
}

export function useColumnResize<K extends string>(
  pageKey: string,
  defs: Record<K, ColDef>,
): UseColumnResizeResult<K> {
  // 초기 폭: localStorage → default 순
  const [widths, setWidths] = useState<ColWidths<K>>(() => {
    const result = {} as ColWidths<K>;
    for (const [col, def] of Object.entries(defs) as [K, ColDef][]) {
      result[col] = loadWidth(pageKey, col, def.default);
    }
    return result;
  });

  // 리사이즈 세션 ref (setState 없이 빠르게)
  const resizeRef = useRef<{
    col: K;
    startX: number;
    startW: number;
    min: number;
    max: number;
  } | null>(null);

  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v));

  const applyDelta = useCallback(
    (deltaX: number) => {
      const r = resizeRef.current;
      if (!r) return;
      const def = defs[r.col];
      const min = def.min ?? 60;
      const max = def.max ?? 800;
      const next = clamp(r.startW + deltaX, min, max);
      setWidths(prev => ({ ...prev, [r.col]: next }));
    },
    [defs],
  );

  // 마우스 이벤트 핸들러 (window 레벨 · cleanup)
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      applyDelta(e.clientX - resizeRef.current.startX);
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      applyDelta(e.clientX - resizeRef.current.startX);
      // 최종값 저장
      setWidths(prev => {
        if (!resizeRef.current) return prev;
        saveWidth(pageKey, resizeRef.current.col, prev[resizeRef.current.col]);
        return prev;
      });
      resizeRef.current = null;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [applyDelta, pageKey]);

  // 터치 이벤트 핸들러 (window 레벨)
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (!resizeRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      applyDelta(touch.clientX - resizeRef.current.startX);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!resizeRef.current) return;
      const touch = e.changedTouches[0];
      if (touch) applyDelta(touch.clientX - resizeRef.current.startX);
      setWidths(prev => {
        if (!resizeRef.current) return prev;
        saveWidth(pageKey, resizeRef.current.col, prev[resizeRef.current.col]);
        return prev;
      });
      resizeRef.current = null;
    };
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [applyDelta, pageKey]);

  const getWidth = useCallback(
    (col: K): number => widths[col] ?? (defs[col]?.default ?? 100),
    [widths, defs],
  );

  const resizerProps = useCallback(
    (col: K) => {
      const startMouse = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const def = defs[col];
        resizeRef.current = {
          col,
          startX: e.clientX,
          startW: widths[col] ?? def.default,
          min: def.min ?? 60,
          max: def.max ?? 800,
        };
      };
      const startTouch = (e: React.TouchEvent) => {
        e.stopPropagation();
        const touch = e.touches[0];
        if (!touch) return;
        const def = defs[col];
        resizeRef.current = {
          col,
          startX: touch.clientX,
          startW: widths[col] ?? def.default,
          min: def.min ?? 60,
          max: def.max ?? 800,
        };
      };
      return {
        onMouseDown: startMouse,
        onTouchStart: startTouch,
        role: "separator" as const,
        "aria-label": `${col} 컬럼 폭 조절`,
        className: "cursor-col-resize select-none",
        style: {
          touchAction: "none",
        } as React.CSSProperties,
      };
    },
    [widths, defs],
  );

  const resetWidth = useCallback(
    (col: K) => {
      const def = defs[col];
      if (!def) return;
      setWidths(prev => ({ ...prev, [col]: def.default }));
      try { localStorage.removeItem(storageKey(pageKey, col)); } catch { /**/ }
    },
    [defs, pageKey],
  );

  const resetAll = useCallback(() => {
    const next = {} as ColWidths<K>;
    for (const [col, def] of Object.entries(defs) as [K, ColDef][]) {
      next[col] = def.default;
      try { localStorage.removeItem(storageKey(pageKey, col)); } catch { /**/ }
    }
    setWidths(next);
  }, [defs, pageKey]);

  return { getWidth, resizerProps, resetWidth, resetAll };
}
