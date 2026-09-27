// src/contexts/ActiveNavContext.tsx
// 2026-09-27 · 네비게이션 SSOT · ActiveNav Context 도입 (사용자 지시)
//   · 활성 사이드바 아이템 자체를 단일 진실 소스 (groupId + itemKey + subTab + nested)
//   · Breadcrumb · Header · Sidebar highlight 등 모든 컨슈머가 이 하나만 참조
//   · buildBreadcrumb 은 역추론이 아닌 lookup (SIDE_NAV_GROUPS.find(g => g.id === groupId))
//   · localStorage("sidebar.subtab.*") · CustomEvent("sidebar:subtab") · useActiveSubTab 훅 · 모두 대체
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { AppNavPage } from "../components/layout/AppNavHeader";
import type { SideNavItem } from "../components/layout/sideNavGroups";
import { SIDE_NAV_GROUPS } from "../components/layout/sideNavGroups";

export interface ActiveNav {
  groupId: string;
  itemKey: AppNavPage;
  subTab?: string | null;
  /** nested · 서브페이지 안의 이너 탭 (예: document-writer:contract) */
  nested?: string | null;
}

interface ActiveNavContextValue {
  activeNav: ActiveNav | null;
  setActiveNav: (next: ActiveNav | null) => void;
  /** 편의 · 페이지·서브탭 세팅 · 그룹은 SIDE_NAV_GROUPS 에서 자동 lookup */
  setActiveByPage: (page: AppNavPage, subTab?: string | null, nested?: string | null) => void;
}

const ActiveNavContext = createContext<ActiveNavContextValue | null>(null);

/** activeSubTab 이 없을 때 · page 단독 매칭 fallback · topTab.key === page 인 그룹 우선 */
function lookupItem(page: AppNavPage, subTab?: string | null): { groupId: string; item?: SideNavItem } {
  if (subTab) {
    for (const g of SIDE_NAV_GROUPS) {
      const it = g.items.find(i => i.key === page && i.subTab === subTab);
      if (it) return { groupId: g.id, item: it };
    }
  }
  const byTop = SIDE_NAV_GROUPS.find(g => g.topTab?.key === page);
  if (byTop) {
    const it = byTop.items.find(i => i.key === page);
    return { groupId: byTop.id, item: it };
  }
  const byItem = SIDE_NAV_GROUPS.find(g => g.items.some(i => i.key === page));
  if (byItem) {
    const it = byItem.items.find(i => i.key === page);
    return { groupId: byItem.id, item: it };
  }
  return { groupId: "" };
}

export const ActiveNavProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeNav, setActiveNav] = useState<ActiveNav | null>(null);

  const setActiveByPage = useCallback((page: AppNavPage, subTab?: string | null, nested?: string | null) => {
    const { groupId, item } = lookupItem(page, subTab);
    setActiveNav({
      groupId,
      itemKey: page,
      subTab: subTab ?? item?.subTab ?? null,
      nested: nested ?? null,
    });
  }, []);

  const value = useMemo(() => ({ activeNav, setActiveNav, setActiveByPage }), [activeNav, setActiveByPage]);
  return <ActiveNavContext.Provider value={value}>{children}</ActiveNavContext.Provider>;
};

export function useActiveNav(): ActiveNavContextValue {
  const ctx = useContext(ActiveNavContext);
  if (!ctx) throw new Error("useActiveNav must be used inside <ActiveNavProvider>");
  return ctx;
}

/** 하위 호환 · 기존 useActiveSubTab(page) 대체 · page 매칭 시만 subTab 반환 */
export function useActiveSubTabFromNav(page: AppNavPage): string | null {
  const { activeNav } = useActiveNav();
  if (!activeNav || activeNav.itemKey !== page) return null;
  return activeNav.subTab ?? null;
}

/** 편의 훅 · setActiveByPage 직접 접근 (안전한 옵션) · 페이지 마운트 시 사용 */
export function useSetActiveByPage(): (page: AppNavPage, subTab?: string | null, nested?: string | null) => void {
  const { setActiveByPage } = useActiveNav();
  return setActiveByPage;
}
