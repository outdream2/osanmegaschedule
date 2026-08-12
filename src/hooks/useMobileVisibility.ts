// src/hooks/useMobileVisibility.ts
// 2026-08-12 · 프레임워크 준비 · 페이지별 모바일 사용여부 · mobile_visibility settings key
//   · 값 없거나 undefined 는 · 허용 (default true)
//   · false 로 명시된 페이지 · 모바일 접근 시 "PC 전용 화면입니다" 안내 표시
import { useCallback } from "react";
import { useKvSetting } from "./useKvSetting";
import { type MobileVisibilityMap, DEFAULT_MOBILE_VISIBILITY } from "../types";

function sanitize(raw: unknown): MobileVisibilityMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const next: MobileVisibilityMap = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "boolean") next[k] = v;
  }
  return next;
}

export function useMobileVisibility() {
  const { value, setValue, loaded, saveState, reload } = useKvSetting<MobileVisibilityMap>({
    key: "mobile_visibility",
    defaultValue: DEFAULT_MOBILE_VISIBILITY,
    sanitize,
  });
  /** 페이지가 모바일에서 허용되는지 · 값 없으면 true (기본 허용) */
  const isMobileAllowed = useCallback((pageKey: string): boolean => {
    return value[pageKey] !== false;
  }, [value]);
  /** 특정 페이지 모바일 허용/차단 토글 */
  const setMobileAllowed = useCallback((pageKey: string, allowed: boolean) => {
    setValue(prev => ({ ...prev, [pageKey]: allowed }));
  }, [setValue]);
  return { visibility: value, loaded, saveState, isMobileAllowed, setMobileAllowed, setAll: setValue, reload };
}

export default useMobileVisibility;
