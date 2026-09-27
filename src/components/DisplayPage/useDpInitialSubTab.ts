// src/components/DisplayPage/useDpInitialSubTab.ts
// 2026-08-25 · Framework Phase 4 · large-file 분리 · DisplayPage.tsx 서브탭 초기화 로직 이관
// 2026-09-27 · 네비게이션 SSOT · useActiveNav Context 이관 (사용자 지시)
//   · CustomEvent("sidebar:subtab") 리스너 제거 · self-dispatch loop 로직 소멸
//   · localStorage("sidebar.subtab.display") 진입 처리 제거 · activeNav 감지로 대체
//   · sessionStorage.dpInitialSubTab · 유지 (별개 채널 · 특수 진입 route)

import { useEffect } from "react";
import { DP_SUBTAB_DEFAULTS } from "./DisplayPage.helpers";
import type { DpSubTabKey } from "./DisplayPage.types";
import type { ActiveNav } from "../../contexts/ActiveNavContext";

export function useDpInitialSubTab(
  dpSubTab: DpSubTabKey,
  setDpSubTab: (v: DpSubTabKey) => void,
  dpHiddenSubs: Set<DpSubTabKey>,
  activeNav?: ActiveNav | null,
) {
  // 숨김된 서브탭 · 우선순위대로 next 로 이동
  useEffect(() => {
    if (dpHiddenSubs.has(dpSubTab)) {
      const priority: DpSubTabKey[] = ["purchase-order", "purchase", "payment", "statistics", "store", "stock-arrivals", "vendor-manage"];
      const next = priority.find(k => !dpHiddenSubs.has(k));
      if (next) setDpSubTab(next);
    }
  }, [dpSubTab, dpHiddenSubs, setDpSubTab]);

  // sessionStorage · 특수 진입 route (기능 유지)
  useEffect(() => {
    try {
      const req = sessionStorage.getItem("dpInitialSubTab") as DpSubTabKey | null;
      if (req) {
        sessionStorage.removeItem("dpInitialSubTab");
        if (DP_SUBTAB_DEFAULTS.some(t => t.key === req)) { setDpSubTab(req); return; }
      }
    } catch { /* silent */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2026-09-27 · 네비게이션 SSOT · activeNav.subTab 변화 감지 · 사이드바 재클릭 대응
  useEffect(() => {
    if (!activeNav) return;
    if (activeNav.itemKey !== "display") return;
    const sub = activeNav.subTab as DpSubTabKey | null | undefined;
    if (!sub) return;
    if (sub === dpSubTab) return;
    if (DP_SUBTAB_DEFAULTS.some(t => t.key === sub)) setDpSubTab(sub);
  }, [activeNav, dpSubTab, setDpSubTab]);
}
