/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from "react";
import { SK_AUTH_SESSION } from "./lib/storageKeys";
// 2026-09-17 · devLog 유틸 · production 번들 · 노이즈 제거
import { devLog, devWarn } from "./lib/devLog";
import SchedulePage from "./components/SchedulePage";
import { LandingPage } from "./components/LandingPage";
// 2026-09-04 · #23 · 공급사 재고확인 · 모달 → 전용 페이지 전환
import { VendorStockPage } from "./components/LandingPage/VendorStockPage";
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
// 2026-09-21 · #328 · iOS WebView 앱 · Expo 푸시 토큰 등록 + 배지 sync
import {
  savePushToken,
  deletePushToken,
  initPushTokenListener,
  initBadgeSync,
} from "./lib/pushNotifications";
import type { AuthSession } from "./types";
import type { AppNavPage } from "./components/layout/AppNavHeader";
import { useAppNavigation } from "./hooks/useAppNavigation";
import type { Page } from "./hooks/useAppNavigation";
import { prefetchProducts } from "./lib/productsCache";
import { loadZoneLabelsFromServer } from "./constants/zoneLabels";
// 2026-08-11 · 사이드바 V2 · feature flag (VITE_SIDEBAR_V2=true) · OFF 면 기존 헤더 그대로
import { useSidebarEnabled } from "./hooks/useSidebar";
import { useIsMobile } from "./hooks/use-mobile";
import { usePagePermissions } from "./hooks/usePagePermissions";
// 2026-08-16 · #113 · React lazy chunk 로드 실패 whitescreen 방지
import { ErrorBoundary } from "./components/common/ErrorBoundary";
// 2026-09-20 · App.tsx 슬림화 · Layout Wrapper 이관 · src/components/layout/AppLayout.tsx
import { SidebarLayoutWrapper } from "./components/layout/AppLayout";
// 2026-08-12 · Phase 6 · 페이지별 모바일 최소 레벨 게이트 (PC 전용 안내)
import { MobileOnlyGate } from "./components/common/MobileOnlyGate";
// 2026-08-29 · 사용자 크리티컬 · 메뉴설정 pc/mobile 언체크 · 라우팅 수준 gate
import { usePageVisibility } from "./hooks/usePageVisibility";
import { Spinner } from "./components/common/Spinner";

// 2026-09-09 · 사용자 지시 · React.Suspense fallback 통일 · Spinner 컴포넌트
const PageFallback = () => (
  <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
    <Spinner size={20} tone="brand" label="불러오는 중..." labelSize={16} />
  </div>
);

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
// 2026-09-04 · 스케줄 설정 (기본연차일 직군별)
const ScheduleSettingsPage = React.lazy(() => import("./components/ScheduleSettingsPage/ScheduleSettingsPage"));
// 2026-09-07 · 발주 설정 (SMTP·이메일)
const OrderSettingsPage = React.lazy(() => import("./components/OrderSettingsPage/OrderSettingsPage"));
// 2026-09-07 · 설정 허브 (모든 설정 통합 진입)
const SettingsHubPage = React.lazy(() => import("./components/SettingsHubPage/SettingsHubPage"));
// 2026-08-23 · #181 · ZoneSettingsPage 제거 · StoreZoneMap 인라인 편집만 유지
// 2026-09-02 · #74 · 창고 구역 설정 페이지 제거 (규칙 고정 · 수동 편집 불필요)

export default function App() {
  // 2026-08-16 · 사이드바 활성 · 서버 KV 설정 (env 아님)
  const sidebarEnabled = useSidebarEnabled();
  // 2026-08-17 · #131 후속 · 페이지 렌더 레벨 hidden 차단 (사용자 지시 · "안보이기 선택하면 메뉴와 페이지 모두 안보여야")
  const { perms: pagePerms } = usePagePermissions();
  const {
    session: authSession,
    setSession: setAuthSession,
    clearSession: clearAuthSession,
    showTimeoutWarning,
    secondsRemaining,
    extendSession,
  } = useAuth();

  // 2026-09-20 · Option C · Navigation Helpers 훅 (page state · popstate · navigate 등 이관)
  const {
    page, setPage,
    pendingEditEmpId, setPendingEditEmpId,
    bmInitialEmployeeId, setBmInitialEmployeeId,
    bmInitialFromPage, setBmInitialFromPage,
    navigate,
    handleNavigate,
    navigateInner,
    navigateInnerWithOptions,
    goBack,
  } = useAppNavigation({ authSession, pagePerms, setAuthSession });

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
        devLog("[SSO] · 로그인 성공 · %s", data.name);
      } catch (e: any) {
        devWarn("[SSO] · consume 실패:", e?.message ?? e);
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
      devWarn("[auth-gate] unauthenticated · page='%s' · force landing", page);
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
      devLog(`[app-nav] page='${page}' viewport='${viewport}' hidden by menu setting · redirect to landing`);
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

  // 2026-09-21 · #328 · iOS WebView 앱 · Expo push token 등록 리스너 + 배지 sync
  //   · 이벤트 리스너 · 'osan-push-token' (앱 → 웹 매 페이지 로드) · 자동 서버 저장
  //   · 배지 sync · WebView 인 경우만 · leave pending count → setAppBadge · 60s + approval-count-updated
  //   · 언마운트 시 cleanup (SPA 특성상 실질 무한 유지)
  // 2026-09-21 · 랜딩 페이지 크래시 격리 · authSession 이 있을 때만 (로그인 후) initBadgeSync 실행
  //   · isInsideWebView() 체크 이후에도 · 랜딩 페이지 iOS WebView 진입 시 · 401 → SESSION_EXPIRED → handleLogout → 무한 reload 가능성
  //   · 로그인 전에는 push token listener 만 등록 (이벤트 대기) · badge sync 는 로그인 후 별도 useEffect 로 이동
  useEffect(() => {
    let cleanupListener: (() => void) | null = null;
    try {
      const c1 = initPushTokenListener();
      if (typeof c1 === "function") cleanupListener = c1;
    } catch (e) {
      devWarn(`[App] initPushTokenListener 실패 · ${(e as any)?.message ?? e}`);
    }
    return () => {
      try { cleanupListener?.(); } catch { /* silent */ }
    };
  }, []);

  // 2026-09-21 · 로그인 이후에만 · initBadgeSync (leave·resignation pending 조회) 실행
  //   · 미로그인 상태 · 401 → refresh 실패 → SESSION_EXPIRED → 무한 reload 방지
  useEffect(() => {
    if (!authSession) return;
    let cleanupBadge: (() => void) | null = null;
    try {
      const c = initBadgeSync();
      if (typeof c === "function") cleanupBadge = c;
    } catch (e) {
      devWarn(`[App] initBadgeSync 실패 · ${(e as any)?.message ?? e}`);
    }
    return () => {
      try { cleanupBadge?.(); } catch { /* silent */ }
    };
  }, [authSession]);

  // 2026-09-21 · #328 · 로그인 성공 후 push token 서버 저장 (localStorage 캐시 초기화 후 재등록)
  //   · authSession 새로 생성됨 감지 (login 이벤트) · 이전 캐시 clear → 강제 재등록
  //   · 재로그인 (같은 유저) 도 safe · 서버 upsert · 캐시 대체
  const previousEmployeeIdRef = useRef<number | null>(null);
  useEffect(() => {
    const currentId = authSession?.employeeId ?? null;
    const prevId = previousEmployeeIdRef.current;
    if (currentId && currentId !== prevId) {
      // 로그인 · 캐시 clear 후 재등록 (다른 유저로 전환 시에도 소유권 이전)
      try {
        localStorage.removeItem("pushToken");
      } catch { /* ignore */ }
      void savePushToken();
    }
    previousEmployeeIdRef.current = currentId;
  }, [authSession?.employeeId]);

  // 2026-08-05 · T3 인증 미들웨어 원복으로 · 부트 세션 체크도 제거
  //   · Render 배포 직전 T3 재도입 시 · 이 useEffect 도 함께 복구 필요 (docs/TASKS.md T3-defer)

  const handleLogout = () => {
    // 2026-08-18 · CRITICAL FIX · 무한 리로드 루프 방지
    //   문제: httpOnly JWT 쿠키가 invalid (e.g. secret 변경 · 만료) 상태에서
    //   handleLogout 이 서버 쿠키 clear 없이 window.location.replace("/") 만 하면
    //   reload 후에도 같은 무효 쿠키 → 401 → refresh 실패 → SESSION_EXPIRED → handleLogout 재귀 → LOOP
    //   해결: /api/auth/logout 먼저 호출 (Set-Cookie: mt_auth=; Max-Age=0) → 확실히 쿠키 제거 → reload
    // 2026-09-21 · #328 · iOS 앱 · push token 서버 삭제 (fire-and-forget · 401 되기 전 미리)
    void deletePushToken();
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
      // 2026-09-02 · Guard 완화 · localStorage OR React authSession 어느쪽이든 · 로그아웃 발화
      //   · 이전 · localStorage 만 체크 · React state 는 있는데 storage 는 없는 edge case · 로그아웃 안 됨
      // 2026-09-10 · #96 · 사용자 지시 · 미로그인 상태 + 로그인 화면 아니면 · 강제 리다이렉트
      //   · 이전 · 무시만 하고 리다이렉트 X · 사용자 어디로 가야할지 모름 · UI 는 로그인 상태로 보임
      const stored = localStorage.getItem(SK_AUTH_SESSION);
      const hasSession = !!stored || !!authSession;
      if (!hasSession) {
        // 이미 로그인 화면 (경로 "/") 이면 · loop 방지 무시
        if (window.location.pathname === "/" || window.location.pathname === "") {
          devLog("[SESSION_EXPIRED] 미로그인 · 이미 로그인 화면 · 무시 (loop 방지)");
          return;
        }
        // 로그인 화면 아니면 · 강제 리다이렉트
        devLog("[SESSION_EXPIRED] 미로그인 · 로그인 화면으로 강제 이동");
        window.location.replace("/");
        return;
      }
      // Guard 2 · 1초 이내 중복 발화 무시
      const now = Date.now();
      if (now - lastExpiredAtRef.current < 1000) return;
      lastExpiredAtRef.current = now;
      devLog("[SESSION_EXPIRED] 세션 만료 감지 · handleLogout 호출");
      handleLogout();
    };
    window.addEventListener("api-session-expired", onExpired);
    return () => window.removeEventListener("api-session-expired", onExpired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession]);

  const timeoutWarningOverlay = authSession && showTimeoutWarning ? (
    <SessionTimeoutWarning
      initialSeconds={secondsRemaining}
      onExtend={extendSession}
      onLogout={handleLogout}
    />
  ) : null;

  // 공통 props (모든 authenticated 페이지)
  const commonProps = {
    authSession: authSession!,
    onBack: goBack,
    onNavigate: navigateInner,
    onLogout: handleLogout,
  };

  // lazy 컴포넌트 Suspense 래퍼
  const Lazy = ({ Component, extraProps }: { Component: React.ComponentType<any>; extraProps?: Record<string, unknown> }) => (
    <React.Suspense fallback={<PageFallback />}>
      <Component {...commonProps} {...extraProps} />
    </React.Suspense>
  );

  // 페이지 렌더 매핑 테이블
  // 특수 케이스 3건 · 클로저로 외부 state/handler 접근
  type PageRenderer = () => React.ReactElement;
  const PAGE_MAP: Partial<Record<Page, PageRenderer>> = {
    schedule: () => (
      <SchedulePage
        {...commonProps}
        initialEditEmployeeId={pendingEditEmpId}
        onEditEmployeeHandled={() => setPendingEditEmpId(null)}
        onEditEmployeeAtStaffManage={(empId) => navigateInnerWithOptions("business-manage", { employeeId: empId, fromPage: "schedule" })}
      />
    ),
    reservation: () => <ReservationPage onBack={goBack} authSession={authSession!} />,
    scan: () => <ScanPage {...commonProps} />,
    productarrival: () => <ProductArrivalPage {...commonProps} />,
    ocr: () => <OcrPage {...commonProps} />,
    requests: () => <RequestsPage {...commonProps} />,
    leave: () => <LeavePage {...commonProps} />,
    // 2026-09-04 · DisplayPage · schedule 페이지 연동
    display: () => (
      <DisplayPage
        {...commonProps}
        onOpenEmployeeEdit={(id) => { setPendingEditEmpId(id); navigate("schedule"); }}
      />
    ),
    lunch: () => <LunchPage {...commonProps} />,
    stockcheck: () => <StockCheckPage {...commonProps} />,
    stockarrivals: () => <StockArrivalPage {...commonProps} />,
    board: () => <BoardPage {...commonProps} />,
    mypage: () => <MyPage {...commonProps} />,
    permissions: () => <PermissionsPage {...commonProps} />,
    // 2026-09-04 · #23 · vendor 로그인 시 employeeName → vendorName
    "vendor-stock": () => (
      <VendorStockPage {...commonProps} vendorName={authSession?.employeeName ?? ""} />
    ),
    "zone-labels": () => (
      <React.Suspense fallback={<PageFallback />}>
        <ZoneLabelsEditor authSession={authSession!} onBack={goBack} />
      </React.Suspense>
    ),
    // 2026-08-10 · business-manage · initialEmployeeId / initialFromPage 특수 케이스
    "business-manage": () => (
      <Lazy
        Component={BusinessManagePage}
        extraProps={{ initialEmployeeId: bmInitialEmployeeId, initialFromPage: bmInitialFromPage as AppNavPage | null }}
      />
    ),
    pharmacist: () => <Lazy Component={PharmacistPage} />,
    "hr-forms": () => <Lazy Component={HrFormsPage} />,
    "approval-request": () => <Lazy Component={ApprovalRequestPage} />,
    branding: () => <Lazy Component={BrandingSettingsPage} />,
    "company-info": () => <Lazy Component={CompanyInfoSettingsPage} />,
    "season-settings": () => <Lazy Component={SeasonSettingsPage} />,
    "system-settings": () => <Lazy Component={SystemSettingsPage} />,
    "schedule-settings": () => <Lazy Component={ScheduleSettingsPage} />,
    "order-settings": () => <Lazy Component={OrderSettingsPage} />,
    "settings-hub": () => <Lazy Component={SettingsHubPage} />,
  };

  const landingEl = (
    <LandingPage
      onNavigate={handleNavigate}
      authSession={authSession}
      onLogout={handleLogout}
      onAuthOnly={setAuthSession}
    />
  );

  // 2026-09-01 · 보안 P0 · 미인증 · LandingPage 강제 · 다른 페이지 접근 완전 차단
  //   · authSession null (로그아웃·세션만료·미로그인) 상태 · page 값 무시 · 오직 LandingPage 렌더
  //   · popstate·history 조작·직접 setPage 로 접근 시도 시 · 무조건 로그인 화면
  //   · SSO consume 진행 중 (setAuthSession 완료 전) 도 안전 · null 이면 landing
  const renderer = authSession ? PAGE_MAP[page] : undefined;
  let pageContent: React.ReactElement = renderer ? renderer() : landingEl;

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

// 2026-09-20 · App.tsx 슬림화 · SidebarLayoutWrapper 이관 → src/components/layout/AppLayout.tsx
