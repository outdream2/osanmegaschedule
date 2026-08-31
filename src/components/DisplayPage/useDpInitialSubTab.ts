// src/components/DisplayPage/useDpInitialSubTab.ts
// 2026-08-25 · Framework Phase 4 · large-file 분리 · DisplayPage.tsx 서브탭 초기화 로직 이관
//   · dpHiddenSubs 감지 시 · 우선순위대로 next 로 자동 이동
//   · sessionStorage.dpInitialSubTab · localStorage.sidebar.subtab.display 진입 처리
//   · window "sidebar:subtab" CustomEvent 리스너

import { useEffect } from "react";
import { DP_SUBTAB_DEFAULTS } from "./DisplayPage.helpers";
import type { DpSubTabKey } from "./DisplayPage.types";
import { SK_SUBTAB_DISPLAY } from "../../lib/storageKeys";

export function useDpInitialSubTab(
  dpSubTab: DpSubTabKey,
  setDpSubTab: (v: DpSubTabKey) => void,
  dpHiddenSubs: Set<DpSubTabKey>,
) {
  // 숨김된 서브탭 · 우선순위대로 next 로 이동
  useEffect(() => {
    if (dpHiddenSubs.has(dpSubTab)) {
      const priority: DpSubTabKey[] = ["purchase-order", "purchase", "payment", "statistics", "store", "stock-arrivals", "vendor-manage"];
      const next = priority.find(k => !dpHiddenSubs.has(k));
      if (next) setDpSubTab(next);
    }
  }, [dpSubTab, dpHiddenSubs, setDpSubTab]);

  // sessionStorage/localStorage 서브탭 진입 처리 · 1회
  useEffect(() => {
    try {
      const req = sessionStorage.getItem("dpInitialSubTab") as DpSubTabKey | null;
      if (req) {
        sessionStorage.removeItem("dpInitialSubTab");
        if (DP_SUBTAB_DEFAULTS.some(t => t.key === req)) { setDpSubTab(req); return; }
      }
      const sbReq = localStorage.getItem(SK_SUBTAB_DISPLAY) as DpSubTabKey | null;
      if (sbReq) {
        localStorage.removeItem(SK_SUBTAB_DISPLAY);
        if (DP_SUBTAB_DEFAULTS.some(t => t.key === sbReq)) setDpSubTab(sbReq);
      }
    } catch { /* silent */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 사이드바 V2 CustomEvent 서브탭 이동
  useEffect(() => {
    const onSubTab = (e: Event) => {
      const detail = (e as CustomEvent<{ page: string; subTab: string }>).detail;
      if (detail?.page !== "display") return;
      const sub = detail.subTab as DpSubTabKey;
      if (DP_SUBTAB_DEFAULTS.some(t => t.key === sub)) setDpSubTab(sub);
    };
    window.addEventListener("sidebar:subtab", onSubTab);
    return () => window.removeEventListener("sidebar:subtab", onSubTab);
  }, [setDpSubTab]);
}
