/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { SK_AUTH_SESSION } from "./lib/storageKeys";
import SchedulePage from "./components/SchedulePage";
import { LandingPage } from "./components/LandingPage";
import { ReservationPage } from "./components/ReservationPage";
import { DisplayPage } from "./components/DisplayPage";
import { ScanPage } from "./components/ScanPage/ScanPage";
import { ProductArrivalPage } from "./components/ProductArrivalPage/ProductArrivalPage";
import { OcrPage } from "./components/OcrPage";
import { RequestsPage } from "./components/RequestsPage/RequestsPage";
import { LeavePage } from "./components/LeavePage/LeavePage";
import { PermissionsPage } from "./components/PermissionsPage";
import { LunchPage } from "./components/LunchPage/LunchPage";
import { StockCheckPage } from "./components/StockCheckPage/StockCheckPage";
import { StockArrivalPage } from "./components/StockArrivalPage/StockArrivalPage";
import { BoardPage } from "./components/BoardPage/BoardPage";
import { MyPage } from "./components/MyPage";
import { AppFooter } from "./components/layout/AppFooter";
import { SessionTimeoutWarning } from "./components/common/SessionTimeoutWarning";
import { useAuth } from "./hooks/useAuth";
import { usePushSubscription } from "./hooks/usePushSubscription";
import type { AuthSession } from "./types";
import type { AppNavPage } from "./components/layout/AppNavHeader";
import { prefetchProducts } from "./lib/productsCache";
import { loadZoneLabelsFromServer } from "./constants/zoneLabels";
// 2026-08-11 · 사이드바 V2 · feature flag (VITE_SIDEBAR_V2=true) · OFF 면 기존 헤더 그대로
import { useSidebarEnabled, useSidebarWidth } from "./hooks/useSidebar";
import { usePagePermissions } from "./hooks/usePagePermissions";
import { isAdminEssentialPage, deriveUserLevel } from "./lib/permissions";
// 2026-08-16 · #113 · React lazy chunk 로드 실패 whitescreen 방지
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { SidebarProvider, SidebarInset } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { SideNav } from "./components/layout/SideNav";
import { useIsMobile } from "./hooks/use-mobile";
// 2026-08-12 · Phase 6 · 페이지별 모바일 최소 레벨 게이트 (PC 전용 안내)
import { MobileOnlyGate } from "./components/common/MobileOnlyGate";
// 2026-08-29 · 사용자 크리티컬 · 메뉴설정 pc/mobile 언체크 · 라우팅 수준 gate
import { usePageVisibility } from "./hooks/usePageVisibility";

// 관리자 전용 · 구역 라벨 편집 UI · lazy 로드 (초기 번들 축소)
const ZoneLabelsEditor = React.lazy(() => import("./components/ZoneLabelsEditor/ZoneLabelsEditor"));
// 2026-08-03 · 경영관리 통합 페이지 (직원관리 · 연차승인 · 점심불참 · 직원권한 서브탭) · lazy 로드
const BusinessManagePage = React.lazy(() => import("./components/BusinessManagePage/BusinessManagePage"));
// 2026-08-03 · 약사 전용 페이지 (교육자료·복약지도·문서) · lazy 로드
const PharmacistPage = React.lazy(() => import("./components/PharmacistPage/PharmacistPage"));
// 2026-08-03 · 각종 양식 (인사 문서 관리) · 경영관리 서브탭 및 별도 라우팅 진입 지원 · lazy 로드
const HrFormsPage = React.lazy(() => import("./components/HrFormsPage/HrFormsPage"));
// 2026-08-12 · 승인요청 통합 페이지 (연차승인·점심불참·서류작성 서브탭) · lazy 로드
const ApprovalRequestPage = React.lazy(() => import("./components/ApprovalRequestPage/ApprovalRequestPage"));
// 2026-08-12 · Phase 5 · 브랜딩·연락처·도장·모바일 가시성 통합 설정 페이지 · lazy 로드
const BrandingSettingsPage = React.lazy(() => import("./components/BrandingSettingsPage/BrandingSettingsPage"));
// 2026-08-12 · 회사정보 설정 페이지 (관리자 lv≥9)
const CompanyInfoSettingsPage = React.lazy(() => import("./components/CompanyInfoSettingsPage/CompanyInfoSettingsPage"));
// 2026-08-12 · 계절 정의 설정 (MyPage 에서 이동)
const SeasonSettingsPage = React.lazy(() => import("./components/SeasonSettingsPage/SeasonSettingsPage"));
// 2026-08-12 · 시스템 설정 (env 편집 · 서버 재시작 반영)
const SystemSettingsPage = React.lazy(() => import("./components/SystemSettingsPage/SystemSettingsPage"));
// 2026-08-23 · #181 · ZoneSettingsPage 제거 · StoreZoneMap 인라인 편집만 유지

type Page = "landing" | "schedule" | "reservation" | "display" | "scan" | "productarrival" | "ocr" | "requests" | "leave" | "permissions" | "lunch" | "stockcheck" | "stockarrivals" | "board" | "mypage" | "zone-labels" | "business-manage" | "hr-forms" | "pharmacist" | "approval-request" | "branding" | "company-info" | "season-settings" | "system-settings";

export default function App() {
  // 2026-08-16 · 사이드바 활성 · 서버 KV 설정 (env 아님)
  const sidebarEnabled = useSidebarEnabled();
  // 2026-08-17 · #131 후속 · 페이지 렌더 레벨 hidden 차단 (사용자 지시 · "안보이기 선택하면 메뉴와 페이지 모두 안보여야")
  const { perms: pagePerms } = usePagePermissions();
  // 전역 모달 스크롤 잠금은 CSS :has() 셀렉터로 처리 (index.css) · JS 훅 불필요
  const [page, setPage] = useState<Page>("landing");
  const [pendingEditEmpId, setPendingEditEmpId] = useState<number | null>(null);
  // 2026-08-10 · A · 스케쥴 [수정] 라우팅 · business-manage 진입 시 · staff-manage 서브탭 + 이 직원 선택
  const [bmInitialEmployeeId, setBmInitialEmployeeId] = useState<number | null>(null);
  const [bmInitialFromPage, setBmInitialFromPage] = useState<Page | null>(null);
  const {
    session: authSession,
    setSession: setAuthSession,
    clearSession: clearAuthSession,
    showTimeoutWarning,
    secondsRemaining,
    extendSession,
  } = useAuth();

  // 2026-08-29 · #174 · SSO · 새 브라우저에서 ?sso={token} 감지 시 · 정식 쿠키 발급 · 자동 로그인
  //   · sso-consume 성공 시 · authSession 세팅 · URL 쿼리 정리
  //   · 실패 시 · 조용히 무시 (일반 랜딩 화면)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ssoToken = params.get("sso");
    if (!ssoToken) return;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      try {
        const { api } = await import("./lib/apiClient");
        const { data } = await api.post<{ id: number; name: string; role: any; level: number }>("/api/auth/sso-consume", { token: ssoToken });
        setAuthSession({
          employeeId: data.id,
          employeeName: data.name,
          role: data.role,
          level: data.level,
          loginAt: Date.now(),
          lastActiveAt: Date.now(),
        });
        console.log("[SSO] · 로그인 성공 · %s", data.name);
      } catch (e: any) {
        console.warn("[SSO] · consume 실패:", e?.message ?? e);
      } finally {
        // URL 쿼리 정리 · 다른 사람이 URL 복사 시 재사용 방지
        const url = new URL(window.location.href);
        url.searchParams.delete("sso");
        window.history.replaceState({}, "", url.toString());
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 상품 캐시 prefetch · 로그인 즉시 아니라 상품 관련 페이지 진입 시로 지연 (2026-07-15 · B)
  //   상품 관련 페이지: scan/display/stockcheck/stockarrivals · 상품 데이터 필요
  //   나머지 페이지: 상품 데이터 안 씀 → prefetch 스킵으로 초기 로딩 부하 감소
  useEffect(() => {
    if (!authSession) return;
    const needsProducts: Page[] = ["scan", "productarrival", "display", "stockcheck", "stockarrivals"];
    if (needsProducts.includes(page)) prefetchProducts();
  }, [authSession, page]);

  // 2026-09-01 · 보안 P0 · 미인증 · 현재 page 가 landing 이 아니면 · 즉시 강제 landing
  //   · 로그아웃·세션만료·미로그인 후 · 브라우저 뒤로가기·popstate 로 다른 page 로 복원되어도 무효화
  //   · history state 도 clean · 다시 앞으로가기 로 되돌아갈 수 없게
  useEffect(() => {
    if (!authSession && page !== "landing") {
      console.warn("[auth-gate] unauthenticated · page='%s' · force landing", page);
      setPage("landing");
      try { history.replaceState({ page: "landing" }, "", "/"); } catch { /* noop */ }
    }
  }, [authSession, page]);

  // 2026-08-29 · 사용자 크리티컬 · 메뉴설정 pc/mobile 언체크 시 · 라우팅 수준 gate
  //   · 사이드바·상단탭·하단탭·MenuCard 이미 gate 되지만 · URL/직접 setPage 로 접근 가능
  //   · isVisible(page, viewport) 검증 후 · false 면 랜딩 리다이렉트
  const isMobileViewport = useIsMobile();
  const { isVisible: isPageVisibleV, loaded: pageVisLoaded } = usePageVisibility();
  useEffect(() => {
    if (!pageVisLoaded) return;
    if (page === "landing") return;  // 랜딩은 항상 접근 허용
    const viewport: "pc" | "mobile" = isMobileViewport ? "mobile" : "pc";
    if (!isPageVisibleV(page, viewport)) {
      console.log(`[app-nav] page='${page}' viewport='${viewport}' hidden by menu setting · redirect to landing`);
      setPage("landing");
    }
  }, [page, isMobileViewport, isPageVisibleV, pageVisLoaded]);

  // 2026-07-31 · 구역 라벨 매핑 · 로그인 즉시 서버 로드 (파일 fallback 이후 override)
  useEffect(() => {
    if (!authSession) return;
    loadZoneLabelsFromServer();
  }, [authSession]);

  // 로그인 직후 웹푸시 자동 구독 (권한 팝업 1회 · 이미 구독됐으면 skip)
  usePushSubscription({ employeeId: authSession?.employeeId ?? null, auto: true });

  // 2026-08-05 · T3 인증 미들웨어 원복으로 · 부트 세션 체크도 제거
  //   · Render 배포 직전 T3 재도입 시 · 이 useEffect 도 함께 복구 필요 (docs/TASKS.md T3-defer)

  // Sync page state with browser History API so the back button works
  useEffect(() => {
    // Stamp the initial entry so popstate can always return here
    history.replaceState({ page: "landing" }, "");

    const onPop = (e: PopStateEvent) => {
      const p = (e.state as { page?: Page } | null)?.page;
      setPage(p ?? "landing");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Push a history entry whenever we move to a non-landing page
  const navigate = (next: Page) => {
    setPage(next);
    if (next === "landing") {
      history.replaceState({ page: "landing" }, "");
    } else {
      history.pushState({ page: next }, "");
    }
  };

  // 2026-08-17 · #131 · hidden 페이지 · nav+render 차단 (사용자 지시 · "안보이기 선택하면 메뉴와 페이지 모두 안보여야")
  //   · admin 은 essential (permissions/business-manage/account) 만 예외
  const isHiddenPage = React.useCallback((pageKey: string): boolean => {
    const perm = pagePerms[pageKey as keyof typeof pagePerms];
    if (!perm?.hidden) return false;
    const level = deriveUserLevel(authSession);
    if (level >= 9 && isAdminEssentialPage(pageKey)) return false;
    return true;
  }, [pagePerms, authSession]);

  const handleNavigate = (next: Exclude<Page, "landing">, auth?: AuthSession) => {
    if (auth) setAuthSession(auth);
    // 2026-09-01 · 보안 P0 · 미인증 + auth 파라미터 없음 → 이동 차단 · 로그인 유도
    if (!authSession && !auth) {
      console.warn(`[auth-gate] navigate blocked · unauthenticated → ${next}`);
      navigate("landing");
      return;
    }
    if (isHiddenPage(next)) {
      console.warn(`[App] Blocked navigation to hidden page: ${next}`);
      navigate("landing");
      return;
    }
    navigate(next);
  };

  // 렌더 시점에도 · 현재 page 가 hidden 이면 landing 으로 강제 (permissions 뒤늦게 로드된 경우 대비)
  React.useEffect(() => {
    if (page !== "landing" && isHiddenPage(page)) {
      console.warn(`[App] Current page hidden, redirecting to landing: ${page}`);
      navigate("landing");
    }
  }, [page, isHiddenPage]);

  const goBack = () => navigate("landing");

  const handleLogout = () => {
    // 2026-08-18 · CRITICAL FIX · 무한 리로드 루프 방지
    //   문제: httpOnly JWT 쿠키가 invalid (e.g. secret 변경 · 만료) 상태에서
    //   handleLogout 이 서버 쿠키 clear 없이 window.location.replace("/") 만 하면
    //   reload 후에도 같은 무효 쿠키 → 401 → refresh 실패 → SESSION_EXPIRED → handleLogout 재귀 → LOOP
    //   해결: /api/auth/logout 먼저 호출 (Set-Cookie: mt_auth=; Max-Age=0) → 확실히 쿠키 제거 → reload
    clearAuthSession();
    Object.keys(localStorage)
      .filter(k => k.startsWith("megatown_"))
      .forEach(k => localStorage.removeItem(k));
    // 서버 쿠키 clear · fire-and-forget · 실패해도 reload 진행 (best effort)
    fetch("/api/auth/logout", { method: "POST", credentials: "include" })
      .catch(() => { /* silent · 어차피 reload */ })
      .finally(() => { window.location.replace("/"); });
  };

  // 2026-08-17 · 사용자 지시 · "재로그인 필요하면 로그아웃 후 로그인화면으로" · "토큰만료 이후 프로세스 강화 로그인화면으로 강제 이동"
  //   · apiClient / main.tsx 인터셉터 · refresh 실패 시 SESSION_EXPIRED_EVENT dispatch · 이 리스너 → handleLogout (window.location.replace("/"))
  // 2026-08-18 · CRITICAL fix · 배포 후 무한 리로드 원인 · 로그아웃 상태에서 SESSION_EXPIRED 발화 시 handleLogout 재귀 loop
  //   · 미로그인 (localStorage 세션 없음) 상태에서 401 발생 → handleLogout → reload → 다시 401 → LOOP
  //   · 해결 1: localStorage 세션 없으면 no-op (이미 로그아웃 상태 · 할 일 없음)
  //   · 해결 2: 1초 내 중복 발화 무시 (belt-and-suspenders)
  const lastExpiredAtRef = useRef<number>(0);
  useEffect(() => {
    const onExpired = () => {
      // Guard 1 · 미로그인 상태면 no-op (loop 방지)
      const stored = localStorage.getItem(SK_AUTH_SESSION);
      if (!stored) {
        console.log("[SESSION_EXPIRED] 미로그인 상태 · 무시 (loop 방지)");
        return;
      }
      // Guard 2 · 1초 이내 중복 발화 무시
      const now = Date.now();
      if (now - lastExpiredAtRef.current < 1000) return;
      lastExpiredAtRef.current = now;
      handleLogout();
    };
    window.addEventListener("api-session-expired", onExpired);
    return () => window.removeEventListener("api-session-expired", onExpired);
  }, []);

  const timeoutWarningOverlay = authSession && showTimeoutWarning ? (
    <SessionTimeoutWarning
      initialSeconds={secondsRemaining}
      onExtend={extendSession}
      onLogout={handleLogout}
    />
  ) : null;

  // Simple navigation wrapper used by the shared AppNavHeader on inner pages.
  // The user is already authenticated here, so no AuthSession is required.
  // 2026-08-10 · business-manage 로 일반 탭 이동 시 초기 직원 선택 상태 초기화 (스케쥴 [수정] 라우팅 잔재 방지)
  const navigateInner = (next: AppNavPage) => {
    if (next === "business-manage") {
      setBmInitialEmployeeId(null);
      setBmInitialFromPage(null);
    }
    navigate(next as Page);
  };

  // 2026-08-10 · A · 옵션 파라미터 지원 (스케쥴 [수정] → StaffManage 오른쪽 상세 자동 선택)
  const navigateInnerWithOptions = (next: AppNavPage, options?: { employeeId?: number | null; fromPage?: AppNavPage | null }) => {
    if (next === "business-manage" && options?.employeeId != null) {
      setBmInitialEmployeeId(options.employeeId);
      setBmInitialFromPage((options.fromPage as Page | undefined) ?? page);
    } else {
      setBmInitialEmployeeId(null);
      setBmInitialFromPage(null);
    }
    navigate(next as Page);
  };

  let pageContent: React.ReactElement;

  // 2026-09-01 · 보안 P0 · 미인증 · LandingPage 강제 · 다른 페이지 접근 완전 차단
  //   · authSession null (로그아웃·세션만료·미로그인) 상태 · page 값 무시 · 오직 LandingPage 렌더
  //   · popstate·history 조작·직접 setPage 로 접근 시도 시 · 무조건 로그인 화면
  //   · SSO consume 진행 중 (setAuthSession 완료 전) 도 안전 · null 이면 landing
  if (!authSession) {
    pageContent = (
      <LandingPage
        onNavigate={handleNavigate}
        authSession={null}
        onLogout={handleLogout}
        onAuthOnly={setAuthSession}
      />
    );
  } else if (page === "schedule") {
    pageContent = (
      <SchedulePage
        onBack={goBack}
        onLogout={handleLogout}
        onNavigate={navigateInner}
        initialEditEmployeeId={pendingEditEmpId}
        onEditEmployeeHandled={() => setPendingEditEmpId(null)}
        authSession={authSession}
        onEditEmployeeAtStaffManage={(empId) => navigateInnerWithOptions("business-manage", { employeeId: empId, fromPage: "schedule" })}
      />
    );
  } else if (page === "reservation") {
    pageContent = <ReservationPage onBack={goBack} authSession={authSession} />;
  } else if (page === "scan") {
    pageContent = (
      <ScanPage
        onBack={goBack}
        authSession={authSession}
        onNavigate={navigateInner}
        onLogout={handleLogout}
      />
    );
  } else if (page === "productarrival") {
    pageContent = (
      <ProductArrivalPage
        onBack={goBack}
        authSession={authSession}
        onNavigate={navigateInner}
        onLogout={handleLogout}
      />
    );
  } else if (page === "ocr") {
    pageContent = (
      <OcrPage
        onBack={goBack}
        authSession={authSession}
        onNavigate={navigateInner}
        onLogout={handleLogout}
      />
    );
  } else if (page === "requests") {
    pageContent = (
      <RequestsPage
        onBack={goBack}
        authSession={authSession}
        onNavigate={navigateInner}
        onLogout={handleLogout}
      />
    );
  } else if (page === "leave") {
    pageContent = (
      <LeavePage
        onBack={goBack}
        authSession={authSession}
        onNavigate={navigateInner}
        onLogout={handleLogout}
      />
    );
  } else if (page === "display") {
    pageContent = (
      <DisplayPage
        onBack={goBack}
        authSession={authSession}
        onNavigate={navigateInner}
        onLogout={handleLogout}
        onOpenEmployeeEdit={(id) => {
          setPendingEditEmpId(id);
          navigate("schedule");
        }}
      />
    );
  } else if (page === "lunch") {
    pageContent = (
      <LunchPage
        onBack={goBack}
        authSession={authSession}
        onNavigate={navigateInner}
        onLogout={handleLogout}
      />
    );
  } else if (page === "stockcheck") {
    pageContent = <StockCheckPage onBack={goBack} authSession={authSession} onNavigate={navigateInner} onLogout={handleLogout} />;
  } else if (page === "stockarrivals") {
    pageContent = <StockArrivalPage authSession={authSession} onBack={goBack} onNavigate={navigateInner} onLogout={handleLogout} />;
  } else if (page === "board") {
    pageContent = (
      <BoardPage
        authSession={authSession}
        onBack={goBack}
        onNavigate={navigateInner}
        onLogout={handleLogout}
      />
    );
  } else if (page === "mypage") {
    pageContent = (
      <MyPage
        authSession={authSession}
        onBack={goBack}
        onNavigate={navigateInner}
        onLogout={handleLogout}
      />
    );
  } else if (page === "permissions") {
    pageContent = (
      <PermissionsPage
        authSession={authSession}
        onBack={goBack}
        onLogout={handleLogout}
        onNavigate={navigateInner}
      />
    );
  } else if (page === "zone-labels") {
    pageContent = (
      <React.Suspense fallback={<div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-400 text-sm">불러오는 중...</div>}>
        <ZoneLabelsEditor authSession={authSession} onBack={goBack} />
      </React.Suspense>
    );
  } else if (page === "business-manage") {
    // 2026-08-03 · 경영관리 통합 페이지 (직원관리 · 연차승인 · 점심불참 · 직원권한 서브탭)
    pageContent = (
      <React.Suspense fallback={<div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-400 text-sm">불러오는 중...</div>}>
        <BusinessManagePage
          authSession={authSession}
          onBack={goBack}
          onNavigate={navigateInner}
          onLogout={handleLogout}
          initialEmployeeId={bmInitialEmployeeId}
          initialFromPage={bmInitialFromPage as AppNavPage | null}
        />
      </React.Suspense>
    );
  } else if (page === "pharmacist") {
    // 2026-08-03 · 약사 전용 페이지 · 교육자료·복약지도 등 · 약사 rank 만 접근
    pageContent = (
      <React.Suspense fallback={<div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-400 text-sm">불러오는 중...</div>}>
        <PharmacistPage
          authSession={authSession}
          onBack={goBack}
          onNavigate={navigateInner}
          onLogout={handleLogout}
        />
      </React.Suspense>
    );
  } else if (page === "hr-forms") {
    // 2026-08-03 · 각종 양식 (인사 문서 관리) · 별도 라우팅 진입 시 · BusinessManagePage 안 서브탭에서도 접근 가능
    pageContent = (
      <React.Suspense fallback={<div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-400 text-sm">불러오는 중...</div>}>
        <HrFormsPage authSession={authSession} onBack={goBack} onNavigate={navigateInner} onLogout={handleLogout} />
      </React.Suspense>
    );
  } else if (page === "approval-request") {
    // 2026-08-12 · 승인요청 통합 페이지 (연차승인·점심불참·서류작성 서브탭)
    pageContent = (
      <React.Suspense fallback={<div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-400 text-sm">불러오는 중...</div>}>
        <ApprovalRequestPage
          authSession={authSession}
          onBack={goBack}
          onNavigate={navigateInner}
          onLogout={handleLogout}
        />
      </React.Suspense>
    );
  } else if (page === "branding") {
    // 2026-08-12 · Phase 5 · 브랜딩·연락처·도장·모바일 가시성 통합 설정 페이지
    pageContent = (
      <React.Suspense fallback={<div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-400 text-sm">불러오는 중...</div>}>
        <BrandingSettingsPage
          authSession={authSession}
          onBack={goBack}
          onNavigate={navigateInner}
          onLogout={handleLogout}
        />
      </React.Suspense>
    );
  } else if (page === "company-info") {
    // 2026-08-12 · 회사정보 설정 페이지 (관리자 lv≥9)
    pageContent = (
      <React.Suspense fallback={<div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-400 text-sm">불러오는 중...</div>}>
        <CompanyInfoSettingsPage
          authSession={authSession}
          onBack={goBack}
          onNavigate={navigateInner}
          onLogout={handleLogout}
        />
      </React.Suspense>
    );
  } else if (page === "season-settings") {
    // 2026-08-12 · 계절 정의 설정 페이지 (관리자 lv≥9)
    pageContent = (
      <React.Suspense fallback={<div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-400 text-sm">불러오는 중...</div>}>
        <SeasonSettingsPage
          authSession={authSession}
          onBack={goBack}
          onNavigate={navigateInner}
          onLogout={handleLogout}
        />
      </React.Suspense>
    );
  } else if (page === "system-settings") {
    // 2026-08-12 · 시스템 설정 페이지 (env 편집 · 관리자 lv≥9)
    pageContent = (
      <React.Suspense fallback={<div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-400 text-sm">불러오는 중...</div>}>
        <SystemSettingsPage
          authSession={authSession}
          onBack={goBack}
          onNavigate={navigateInner}
          onLogout={handleLogout}
        />
      </React.Suspense>
    );
  } else {
    pageContent = (
      <LandingPage
        onNavigate={handleNavigate}
        authSession={authSession}
        onLogout={handleLogout}
        onAuthOnly={setAuthSession}
      />
    );
  }

  // 2026-08-16 · #113 · lazy chunk 로드 실패 whitescreen 방지 · pageContent 를 ErrorBoundary 로 wrap
  const wrappedContent = <ErrorBoundary>{pageContent}</ErrorBoundary>;

  // 2026-08-11 · 사이드바 V2 · flag ON 시만 SidebarProvider 로 감쌈 · OFF (기본) 는 기존 그대로
  // 2026-08-11 · 사이드바 V2 · 데스크탑만 사이드바 · 모바일은 기존 상단 헤더 + BottomNav (사용자 지시)
  if (sidebarEnabled) {
    return <SidebarLayoutWrapper pageContent={wrappedContent} authSession={authSession} activePage={page as AppNavPage} navigate={navigate} handleLogout={handleLogout} timeoutWarningOverlay={timeoutWarningOverlay} />;
  }

  return (
    <>
      <MobileOnlyGate pageKey={page} authSession={authSession}>
        {wrappedContent}
      </MobileOnlyGate>
      <AppFooter />
      {timeoutWarningOverlay}
    </>
  );
}

// 2026-08-11 · 사이드바 V2 · 데스크탑만 사이드바 · 모바일은 기존 헤더 fallback
interface SidebarLayoutProps {
  pageContent: React.ReactElement;
  authSession: AuthSession | null;
  activePage: AppNavPage;
  navigate: (page: Page) => void;
  handleLogout: () => void;
  timeoutWarningOverlay: React.ReactElement | null;
}
// 모바일 감지 · 모바일이면 기존 렌더 · 데스크탑이면 사이드바 · React hook rules 준수 위해 wrapper 컴포넌트 분리
const SidebarLayoutWrapper: React.FC<SidebarLayoutProps> = (props) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <>
        <MobileOnlyGate pageKey={props.activePage} authSession={props.authSession}>
          {props.pageContent}
        </MobileOnlyGate>
        <AppFooter />
        {props.timeoutWarningOverlay}
      </>
    );
  }
  return <SidebarLayout {...props} />;
};
const SIDEBAR_OPEN_KEY = "sidebar.open";
const readSidebarOpen = (): boolean => {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(SIDEBAR_OPEN_KEY);
  return raw === "false" ? false : true; // 기본 true
};

const SidebarLayout: React.FC<SidebarLayoutProps> = ({ pageContent, authSession, activePage, navigate, handleLogout, timeoutWarningOverlay }) => {
  const { width } = useSidebarWidth();
  // 2026-08-12 · PC 사이드바 접기 · localStorage 로 상태 유지 · 헤더 SidebarTrigger 로 토글
  const [sidebarOpen, setSidebarOpen] = React.useState<boolean>(readSidebarOpen);
  const handleOpenChange = React.useCallback((next: boolean) => {
    setSidebarOpen(next);
    try { localStorage.setItem(SIDEBAR_OPEN_KEY, String(next)); } catch { /* silent */ }
  }, []);
  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={handleOpenChange}
        style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}
      >
        <SideNav
          authSession={authSession}
          activePage={activePage}
          onNavigate={(p) => navigate(p as Page)}
          onLogout={handleLogout}
        />
        <SidebarInset>
          <MobileOnlyGate pageKey={activePage} authSession={authSession}>
            {pageContent}
          </MobileOnlyGate>
          <AppFooter />
        </SidebarInset>
        {timeoutWarningOverlay}
      </SidebarProvider>
    </TooltipProvider>
  );
};
