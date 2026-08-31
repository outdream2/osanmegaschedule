// src/hooks/useActiveSubTab.ts
// 2026-08-31 · 사용자 지시 · 브레드크럼 · 사이드바 하위메뉴 활성 표시 공용 훅
//   · SideNav.tsx 에 인라인 정의되어 있던 로직 · 프레임워크 원칙 · 공용 위치 이관
//   · localStorage(sidebar.subtab.{page}) · CustomEvent("sidebar:subtab") 리슨
//   · SideNav + AppNavHeader(Breadcrumb) 등 여러 소비자 공유

import { useEffect, useState } from "react";
import type { AppNavPage } from "../components/layout/AppNavHeader";
import { subTabStorageKey } from "../components/layout/sideNavGroups";

export function useActiveSubTab(currentPage: AppNavPage): string | null {
  const [activeSubTab, setActiveSubTab] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(subTabStorageKey(currentPage));
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(subTabStorageKey(currentPage));
      setActiveSubTab(raw);
    } catch { /* silent */ }
  }, [currentPage]);

  useEffect(() => {
    const onSubTab = (e: Event) => {
      const detail = (e as CustomEvent<{ page: string; subTab: string; nested?: string | null }>).detail;
      if (!detail) return;
      if (detail.page !== currentPage) return;
      setActiveSubTab(detail.subTab ?? null);
    };
    window.addEventListener("sidebar:subtab", onSubTab);
    return () => window.removeEventListener("sidebar:subtab", onSubTab);
  }, [currentPage]);

  return activeSubTab;
}
