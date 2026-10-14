// src/hooks/usePageVisibility.ts
// 2026-08-23 · #188 · 페이지별 표시 · 프레임워크 통일 훅
// 2026-10-06 · (DEPRECATED · 2026-10-13 override) · "메뉴 visibility 는 하나" 통일 정책
// 2026-10-13 · 사용자 재지시 · "PC/모바일 분리" 로 **재분리** (2026-10-06 통일 override)
//   · 모바일에서 리스트 안 보이는 페이지 → "PC 전용" 지정 가능
//   · PC 에서만 유용한 페이지 → 모바일 숨김 지정 가능
//   · 저장 UX · 체크 즉시 저장 X · **명시 "저장" 버튼** 눌러야 반영 (MobileVisibilitySection)
//   · 뷰포트 매핑 · PC 모드 = 태블릿 가로 포함 · 태블릿 세로 → RotateDeviceOverlay (AppLayout.tsx:33 기존)

import { useCallback } from "react";
import { useKvSetting } from "./useKvSetting";
import { type PageVisibilityMap, DEFAULT_PAGE_VISIBILITY } from "../types";

export type Viewport = "pc" | "mobile";

// 2026-10-13 · 사용자 재지시 · PC/모바일 분리 복원 (2026-10-06 통일 override)
//   · 과거 통일 저장 { pc:X, mobile:X } 데이터 그대로 수용 · divergence 도 그대로 보존
//   · 하위 호환 · 과거 데이터 손실 없음 · 신규 입력부터 분리 저장
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
 * 페이지 노출 여부 훅 · 2026-10-13 · PC/모바일 분리 정책 (2026-10-06 통일 override)
 *   · 기본 · true (둘 다 노출)
 *   · viewport 별 독립 저장 · 각각 체크박스 토글
 */
export function usePageVisibility() {
  const { value, setValue, loaded, saveState, reload, saveNow } = useKvSetting<PageVisibilityMap>({
    key: "page_visibility",
    defaultValue: DEFAULT_PAGE_VISIBILITY,
    sanitize,
  });

  /** 페이지 노출 여부 · 2026-10-13 · viewport 별 분리 (2026-10-06 통일 override)
   *  2026-08-27 · composite key ("group:sub") fallback · leaf key 조회
   *  2026-08-31 · #55 · 양방향 fallback · leaf ↔ composite
   */
  const isVisible = useCallback((pageKey: string, viewport: Viewport = "pc"): boolean => {
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
    return viewport === "mobile" ? entry.mobile !== false : entry.pc !== false;
  }, [value]);

  /** 페이지 노출 토글 · 2026-10-13 · viewport 별 분리 저장 (2026-10-06 통일 override)
   *  · PC 토글 → entry.pc 만 변경 · entry.mobile 유지
   *  · 모바일 토글 → entry.mobile 만 변경 · entry.pc 유지
   *  · 양쪽 모두 true 로 돌아오면 → 항목 삭제 (기본값과 동일 · 데이터 최소화)
   */
  const setVisible = useCallback((pageKey: string, viewport: Viewport, visible: boolean) => {
    setValue(prev => {
      const existing = prev[pageKey] ?? { pc: true, mobile: true };
      const nextEntry = {
        pc: viewport === "pc" ? visible : (existing.pc ?? true),
        mobile: viewport === "mobile" ? visible : (existing.mobile ?? true),
      };
      const next: PageVisibilityMap = { ...prev, [pageKey]: nextEntry };
      // 둘 다 true → 항목 삭제 (default = 둘 다 노출)
      if (nextEntry.pc && nextEntry.mobile) {
        delete next[pageKey];
      }
      return next;
    });
  }, [setValue]);

  return { visibility: value, loaded, saveState, isVisible, setVisible, setAll: setValue, reload, saveNow };
}

export default usePageVisibility;
