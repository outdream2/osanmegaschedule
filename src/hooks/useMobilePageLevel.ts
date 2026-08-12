// src/hooks/useMobilePageLevel.ts
// 2026-08-12 · Phase 6 · 페이지별 모바일 최소 레벨 · mobile_min_level settings key
//   · 값 없거나 undefined 는 · 0 (모두 허용)
//   · userLevel >= getMinLevel(pageKey) 이면 접근 가능 · 아니면 "PC 전용 화면입니다" 안내
//   · MobileVisibilityMap (boolean) 대체 · 하위호환 위해 useMobileVisibility 는 유지
import { useCallback } from "react";
import { useKvSetting } from "./useKvSetting";
import { type MobileMinLevelMap, DEFAULT_MOBILE_MIN_LEVEL } from "../types";

function sanitize(raw: unknown): MobileMinLevelMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const next: MobileMinLevelMap = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 9) {
      next[k] = Math.floor(v);
    }
  }
  return next;
}

export function useMobilePageLevel() {
  const { value, setValue, loaded, saveState, reload } = useKvSetting<MobileMinLevelMap>({
    key: "mobile_min_level",
    defaultValue: DEFAULT_MOBILE_MIN_LEVEL,
    sanitize,
  });

  /** 페이지의 모바일 접근 최소 레벨 · 값 없으면 0 (모두 허용) */
  const getMinLevel = useCallback((pageKey: string): number => {
    const v = value[pageKey];
    return typeof v === "number" ? v : 0;
  }, [value]);

  /** 특정 페이지 · 최소 레벨 지정 · 0 은 삭제(모두 허용)로 정규화 */
  const setMinLevel = useCallback((pageKey: string, level: number) => {
    setValue(prev => {
      const next = { ...prev };
      if (!Number.isFinite(level) || level <= 0) {
        delete next[pageKey];
      } else {
        next[pageKey] = Math.min(9, Math.max(0, Math.floor(level)));
      }
      return next;
    });
  }, [setValue]);

  /** userLevel 이 pageKey 의 최소 레벨 이상인지 · 모바일 접근 판정 */
  const canAccessOnMobile = useCallback((pageKey: string, userLevel: number): boolean => {
    return userLevel >= getMinLevel(pageKey);
  }, [getMinLevel]);

  return {
    minLevelMap: value,
    loaded,
    saveState,
    getMinLevel,
    setMinLevel,
    canAccessOnMobile,
    setAll: setValue,
    reload,
  };
}

export default useMobilePageLevel;
