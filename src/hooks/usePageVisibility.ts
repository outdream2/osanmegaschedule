// src/hooks/usePageVisibility.ts
// 2026-08-23 · #188 · 페이지별 표시 · 프레임워크 통일 훅
// 2026-10-06 · 사용자 최종 정책 · "메뉴 visibility는 화면 종류와 관계없이 하나"
//   · PC SideNav · Responsive Header · Mobile BottomNav 모두 **동일 visibility 값** 사용
//   · pc/mobile 별도 저장 금지 · 항상 pc===mobile 유지
//   · 기존 데이터 호환 · canonical = pc 값 사용 (SideNav 가 사용자 기준)
//   · viewport parameter 는 signature 호환성 위해 유지 but 결과에 영향 X
//   · 자동 마이그레이션 (mobile_min_level → mobile OFF) · 제거 · divergence 재발 방지

import { useCallback } from "react";
import { useKvSetting } from "./useKvSetting";
import { type PageVisibilityMap, DEFAULT_PAGE_VISIBILITY } from "../types";

export type Viewport = "pc" | "mobile";

// 2026-10-06 · 레거시 데이터 정규화 · 저장시점에 pc=mobile 강제
//   · { pc: true, mobile: false } 같은 divergence 가 저장되어 있으면 canonical pc 로 통일 (mobile=pc)
function sanitize(raw: unknown): PageVisibilityMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const next: PageVisibilityMap = {};
  for (const [k, v] of Object.entries(r)) {
    if (!v || typeof v !== "object") continue;
    const entry = v as Record<string, unknown>;
    // canonical = pc 값 · mobile 은 pc 로 강제 통일
    const canonical = typeof entry.pc === "boolean" ? entry.pc : true;
    next[k] = { pc: canonical, mobile: canonical };
  }
  return next;
}

/**
 * 페이지 노출 여부 훅 · 2026-10-06 · 단일 visibility 정책
 *   · 기본 · true (모두 노출)
 *   · viewport parameter 는 signature 호환 유지 · 결과는 **동일**
 *   · 자동 마이그레이션 (mobile_min_level) 제거
 */
export function usePageVisibility() {
  const { value, setValue, loaded, saveState, reload } = useKvSetting<PageVisibilityMap>({
    key: "page_visibility",
    defaultValue: DEFAULT_PAGE_VISIBILITY,
    sanitize,
  });

  /** 페이지 노출 여부 · viewport 무관 · 같은 값 반환
   *  2026-08-27 · composite key ("group:sub") fallback · leaf key 조회
   *  2026-08-31 · #55 · 양방향 fallback · leaf ↔ composite
   *  2026-10-06 · viewport 분기 제거 · PC/mobile/top 모두 동일 결과
   *    · canonical = pc 값 (sanitize 에서 mobile=pc 로 통일되어 있음)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isVisible = useCallback((pageKey: string, _viewport?: Viewport): boolean => {
    let entry = value[pageKey];
    // 1. composite → leaf fallback
    if (!entry && pageKey.includes(":")) {
      const leaf = pageKey.split(":").pop() ?? "";
      if (leaf) entry = value[leaf];
    }
    // 2. leaf → composite fallback
    if (!entry && !pageKey.includes(":")) {
      for (const k of Object.keys(value)) {
        if (k.endsWith(`:${pageKey}`)) { entry = value[k]; break; }
      }
    }
    if (!entry) return true;
    // 2026-10-06 · canonical = pc · mobile 은 sanitize 에서 pc 로 통일됨
    return entry.pc !== false;
  }, [value]);

  /** 페이지 노출 토글 · 2026-10-06 · pc + mobile 동시 저장 (divergence 방지)
   *  viewport parameter 는 signature 호환 유지 but 양쪽 동일하게 저장
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setVisible = useCallback((pageKey: string, _viewport: Viewport, visible: boolean) => {
    setValue(prev => {
      const next: PageVisibilityMap = {
        ...prev,
        // pc + mobile 둘 다 동일 값 저장
        [pageKey]: { pc: visible, mobile: visible },
      };
      // 둘 다 true 로 돌아오면 · 삭제 (기본값과 동일 · 데이터 최소화)
      if (visible) {
        delete next[pageKey];
      }
      return next;
    });
  }, [setValue]);

  return { visibility: value, loaded, saveState, isVisible, setVisible, setAll: setValue, reload };
}

export default usePageVisibility;
