// src/hooks/useAppNavigation.ts
// 2026-09-20 · App.tsx Option C · Navigation Helpers 훅 추출 (사용자 지시)
//   · page state · popstate handler · navigate / handleNavigate / navigateInner / navigateInnerWithOptions · isHiddenPage
//   · App.tsx 에서 ~50 라인 제거 · 이 훅으로 이관
import React, { useState, useEffect, useCallback } from "react";
import type { AuthSession } from "../types";
import type { PagePermissions } from "../types";
import type { AppNavPage } from "../components/layout/AppNavHeader";
import { isAdminEssentialPage, deriveUserLevel } from "../lib/permissions";
import { devWarn } from "../lib/devLog";

export type Page =
  | "landing" | "schedule" | "reservation" | "display" | "scan"
  | "productarrival" | "ocr" | "requests" | "leave" | "permissions"
  | "lunch" | "stockcheck" | "stockarrivals" | "board" | "mypage"
  | "zone-labels" | "business-manage" | "hr-forms" | "pharmacist"
  | "approval-request" | "branding" | "company-info" | "season-settings"
  | "system-settings" | "vendor-stock" | "schedule-settings"
  | "order-settings" | "settings-hub"
  // 2026-09-24 · #352 · 거래처 발주이력 확인 페이지
  | "vendor-order-history"
  // 2026-10-12 · #13 · 거래처 그룹 현황판 (방문예약 drawer + 공급사/재고/발주이력 탭 통합)
  | "vendor-overview"
  // 2026-10-03 저녁 · Phase 2 · ERP 초기 데이터 구축 (관리자 lv9 · DRY-RUN 전용)
  | "admin-initial-build"
  // 2026-10-07 · 스케줄 V2 평가용 workspace (기존 "schedule" 과 병행)
  | "schedule-v2";

interface UseAppNavigationOpts {
  authSession: AuthSession | null;
  pagePerms: PagePermissions;
  setAuthSession: (s: AuthSession) => void;
  // 2026-10-09 · fix · 뒤로가기 subTab/nested 복원 · popstate 시 ActiveNavContext 로 전달
  onPopNav?: (page: Page, subTab: string | null, nested: string | null) => void;
}

export interface UseAppNavigationReturn {
  page: Page;
  setPage: React.Dispatch<React.SetStateAction<Page>>;
  pendingEditEmpId: number | null;
  setPendingEditEmpId: React.Dispatch<React.SetStateAction<number | null>>;
  bmInitialEmployeeId: number | null;
  setBmInitialEmployeeId: React.Dispatch<React.SetStateAction<number | null>>;
  bmInitialFromPage: Page | null;
  setBmInitialFromPage: React.Dispatch<React.SetStateAction<Page | null>>;
  navigate: (next: Page, subTab?: string | null, nested?: string | null) => void;
  handleNavigate: (next: Exclude<Page, "landing">, auth?: AuthSession) => void;
  navigateInner: (next: AppNavPage) => void;
  navigateInnerWithOptions: (next: AppNavPage, options?: { employeeId?: number | null; fromPage?: AppNavPage | null }) => void;
  goBack: () => void;
  isHiddenPage: (pageKey: string) => boolean;
}

export function useAppNavigation({ authSession, pagePerms, setAuthSession, onPopNav }: UseAppNavigationOpts): UseAppNavigationReturn {
  const [page, setPage] = useState<Page>("landing");
  const [pendingEditEmpId, setPendingEditEmpId] = useState<number | null>(null);
  // 2026-08-10 · A · 스케쥴 [수정] 라우팅 · business-manage 진입 시 · staff-manage 서브탭 + 이 직원 선택
  const [bmInitialEmployeeId, setBmInitialEmployeeId] = useState<number | null>(null);
  const [bmInitialFromPage, setBmInitialFromPage] = useState<Page | null>(null);

  // 2026-10-09 · fix · onPopNav 를 ref 로 보관 (deps 바뀌어도 listener 유지)
  const onPopNavRef = React.useRef(onPopNav);
  useEffect(() => { onPopNavRef.current = onPopNav; }, [onPopNav]);

  // Sync page state with browser History API so the back button works
  useEffect(() => {
    // Stamp the initial entry so popstate can always return here
    try { history.replaceState({ page: "landing", subTab: null, nested: null }, ""); } catch { /* noop */ }

    const onPop = (e: PopStateEvent) => {
      const s = (e.state as { page?: Page; subTab?: string | null; nested?: string | null } | null) ?? null;
      const p: Page = s?.page ?? "landing";
      setPage(p);
      // 2026-10-09 · subTab/nested 복원 · ActiveNavContext 에 전달 (App.tsx bridge)
      if (onPopNavRef.current) onPopNavRef.current(p, s?.subTab ?? null, s?.nested ?? null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Push a history entry whenever we move to a non-landing page
  // 2026-10-09 · fix · subTab/nested 지원 (history 에 전부 저장 · back 시 복원)
  const navigate = useCallback((next: Page, subTab?: string | null, nested?: string | null) => {
    setPage(next);
    const state = { page: next, subTab: subTab ?? null, nested: nested ?? null };
    try {
      if (next === "landing") {
        history.replaceState(state, "");
      } else {
        history.pushState(state, "");
      }
    } catch { /* noop */ }
  }, []);

  // 2026-08-17 · #131 · hidden 페이지 · nav+render 차단 (사용자 지시 · "안보이기 선택하면 메뉴와 페이지 모두 안보여야")
  //   · admin 은 essential (permissions/business-manage/account) 만 예외
  const isHiddenPage = useCallback((pageKey: string): boolean => {
    const perm = pagePerms[pageKey as keyof typeof pagePerms];
    if (!perm?.hidden) return false;
    const level = deriveUserLevel(authSession);
    if (level >= 9 && isAdminEssentialPage(pageKey)) return false;
    return true;
  }, [pagePerms, authSession]);

  const handleNavigate = useCallback((next: Exclude<Page, "landing">, auth?: AuthSession) => {
    if (auth) setAuthSession(auth);
    // 2026-09-01 · 보안 P0 · 미인증 + auth 파라미터 없음 → 이동 차단 · 로그인 유도
    if (!authSession && !auth) {
      devWarn(`[auth-gate] navigate blocked · unauthenticated → ${next}`);
      navigate("landing");
      return;
    }
    if (isHiddenPage(next)) {
      devWarn(`[App] Blocked navigation to hidden page: ${next}`);
      navigate("landing");
      return;
    }
    navigate(next);
  }, [authSession, navigate, isHiddenPage, setAuthSession]);

  // 렌더 시점에도 · 현재 page 가 hidden 이면 landing 으로 강제 (permissions 뒤늦게 로드된 경우 대비)
  useEffect(() => {
    if (page !== "landing" && isHiddenPage(page)) {
      devWarn(`[App] Current page hidden, redirecting to landing: ${page}`);
      navigate("landing");
    }
  }, [page, isHiddenPage, navigate]);

  // Simple navigation wrapper used by the shared AppNavHeader on inner pages.
  // The user is already authenticated here, so no AuthSession is required.
  // 2026-08-10 · business-manage 로 일반 탭 이동 시 초기 직원 선택 상태 초기화 (스케쥴 [수정] 라우팅 잔재 방지)
  const navigateInner = useCallback((next: AppNavPage) => {
    if (next === "business-manage") {
      setBmInitialEmployeeId(null);
      setBmInitialFromPage(null);
    }
    navigate(next as Page);
  }, [navigate]);

  // 2026-08-10 · A · 옵션 파라미터 지원 (스케쥴 [수정] → StaffManage 오른쪽 상세 자동 선택)
  const navigateInnerWithOptions = useCallback((next: AppNavPage, options?: { employeeId?: number | null; fromPage?: AppNavPage | null }) => {
    if (next === "business-manage" && options?.employeeId != null) {
      setBmInitialEmployeeId(options.employeeId);
      setBmInitialFromPage((options.fromPage as Page | undefined) ?? page);
    } else {
      setBmInitialEmployeeId(null);
      setBmInitialFromPage(null);
    }
    navigate(next as Page);
  }, [navigate, page]);

  const goBack = useCallback(() => navigate("landing"), [navigate]);

  return {
    page,
    setPage,
    pendingEditEmpId,
    setPendingEditEmpId,
    bmInitialEmployeeId,
    setBmInitialEmployeeId,
    bmInitialFromPage,
    setBmInitialFromPage,
    navigate,
    handleNavigate,
    navigateInner,
    navigateInnerWithOptions,
    goBack,
    isHiddenPage,
  };
}
