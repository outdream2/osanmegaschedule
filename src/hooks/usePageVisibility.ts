// src/hooks/usePageVisibility.ts
// 2026-08-23 · #188 · 페이지별 표시 (PC/모바일 각각) · 프레임워크 통일 훅
//   · settings "page_visibility" · JSON · { [pageKey]: { pc, mobile } }
//   · 값 없거나 undefined 는 · 둘 다 true (기본 노출)
//   · 자동 마이그레이션 · 기존 mobile_min_level 레벨 5+ → mobile OFF
//   · 사이드바 gate · 공통헤더 · 뷰포트별 필터

import { useCallback, useEffect, useRef } from "react";
import { useKvSetting } from "./useKvSetting";
import { useMobilePageLevel } from "./useMobilePageLevel";
import { type PageVisibilityMap, DEFAULT_PAGE_VISIBILITY } from "../types";

export type Viewport = "pc" | "mobile";

function sanitize(raw: unknown): PageVisibilityMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const next: PageVisibilityMap = {};
  for (const [k, v] of Object.entries(r)) {
    if (!v || typeof v !== "object") continue;
    const entry = v as Record<string, unknown>;
    const pc = typeof entry.pc === "boolean" ? entry.pc : true;
    const mobile = typeof entry.mobile === "boolean" ? entry.mobile : true;
    next[k] = { pc, mobile };
  }
  return next;
}

/**
 * 페이지 · 뷰포트별 노출 여부 훅
 *   · 기본 · 둘 다 true (모두 노출)
 *   · 자동 마이그레이션 · 첫 조회 시 · page_visibility 비어있으면 · mobile_min_level 읽어서 변환
 *     · 레벨 5+ → mobile OFF · 그 외 mobile ON · PC 는 항상 ON
 */
export function usePageVisibility() {
  const { value, setValue, loaded, saveState, reload } = useKvSetting<PageVisibilityMap>({
    key: "page_visibility",
    defaultValue: DEFAULT_PAGE_VISIBILITY,
    sanitize,
  });

  // 자동 마이그레이션 · 기존 mobile_min_level → page_visibility · 한 번만 실행
  const { minLevelMap: legacyLevel, loaded: legacyLoaded } = useMobilePageLevel();
  const migratedRef = useRef(false);

  useEffect(() => {
    if (migratedRef.current) return;
    if (!loaded || !legacyLoaded) return;
    // 이미 page_visibility 값 있으면 skip
    if (Object.keys(value).length > 0) {
      migratedRef.current = true;
      return;
    }
    // legacy · 레벨 정보 없으면 skip (마이그레이션 대상 없음)
    if (Object.keys(legacyLevel).length === 0) {
      migratedRef.current = true;
      return;
    }
    // 마이그레이션 실행 · 레벨 5+ → mobile OFF
    const next: PageVisibilityMap = {};
    for (const [pageKey, level] of Object.entries(legacyLevel)) {
      if (typeof level === "number" && level >= 5) {
        next[pageKey] = { pc: true, mobile: false };
      }
    }
    if (Object.keys(next).length > 0) {
      setValue(next);
      console.log("[usePageVisibility] 자동 마이그레이션 · mobile_min_level → page_visibility", next);
    }
    migratedRef.current = true;
  }, [loaded, legacyLoaded, value, legacyLevel, setValue]);

  /** 특정 페이지 · 특정 뷰포트에서 노출 여부 · 값 없으면 true (기본)
   *  2026-08-27 · 사용자 지시 · composite key ("group:sub") fallback · leaf key 조회
   *    · 예: "approval-request:lunch" 저장 없으면 · "lunch" 조회 · 개별 페이지 설정 자동 상속
   *    · PermissionsPage 는 leaf key 만 편집 · SideNav 는 composite 조회 · 불일치 방지
   */
  const isVisible = useCallback((pageKey: string, viewport: Viewport): boolean => {
    let entry = value[pageKey];
    if (!entry && pageKey.includes(":")) {
      const leaf = pageKey.split(":").pop() ?? "";
      if (leaf) entry = value[leaf];
    }
    if (!entry) return true;
    return viewport === "pc" ? (entry.pc !== false) : (entry.mobile !== false);
  }, [value]);

  /** 페이지 · 뷰포트 토글 */
  const setVisible = useCallback((pageKey: string, viewport: Viewport, visible: boolean) => {
    setValue(prev => {
      const cur = prev[pageKey] ?? { pc: true, mobile: true };
      const next: PageVisibilityMap = {
        ...prev,
        [pageKey]: { ...cur, [viewport]: visible },
      };
      // 둘 다 true 로 돌아오면 · 삭제 (기본값과 동일 · 데이터 최소화)
      const entry = next[pageKey]!;
      if (entry.pc !== false && entry.mobile !== false) {
        delete next[pageKey];
      }
      return next;
    });
  }, [setValue]);

  return { visibility: value, loaded, saveState, isVisible, setVisible, setAll: setValue, reload };
}

export default usePageVisibility;
