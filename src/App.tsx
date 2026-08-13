/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
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
import { SIDEBAR_ENABLED, useSidebarWidth } from "./hooks/useSidebar";
import { SidebarProvider, SidebarInset } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { SideNav } from "./components/layout/SideNav";
import { useIsMobile } from "./hooks/use-mobile";
// 2026-08-12 · Phase 6 · 페이지별 모바일 최소 레벨 게이트 (PC 전용 안내)
import { MobileOnlyGate } from "./components/common/MobileOnlyGate";

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

type Page = "landing" | "schedule" | "reservation" | "display" | "scan" | "productarrival" | "ocr" | "requests" | "leave" | "permissions" | "lunch" | "stockcheck" | "stockarrivals" | "board" | "mypage" | "zone-labels" | "business-manage" | "hr-forms" | "pharmacist" | "approval-request" | "branding" | "company-info" | "season-settings" | "system-settings";

export default function App() {
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

  // 상품 캐시 prefetch · 로그인 즉시 아니라 상품 관련 페이지 진입 시로 지연 (2026-07-15 · B)
  //   상품 관련 페이지: scan/display/stockcheck/stockarrivals · 상품 데이터 필요
  //   나머지 페이지: 상품 데이터 안 씀 → prefetch 스킵으로 초기 로딩 부하 감소
  useEffect(() => {
    if (!authSession) return;
    const needsProducts: Page[] = ["scan", "productarrival", "display", "stockcheck", "stockarrivals"];
    if (needsProducts.includes(page)) prefetchProducts();
  }, [authSession, page]);

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

  const handleNavigate = (next: Exclude<Page, "landing">, auth?: AuthSession) => {
    if (auth) setAuthSession(auth);
    navigate(next);
  };

  const goBack = () => navigate("landing");

  const handleLogout = () => {
    clearAuthSession();
    // clearAuthSession already removes all megatown_* keys, but belt-and-suspenders:
    Object.keys(localStorage)
      .filter(k => k.startsWith("megatown_"))
      .forEach(k => localStorage.removeItem(k));
    window.location.replace("/");
  };

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

  if (page === "schedule") {
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

  // 2026-08-11 · 사이드바 V2 · flag ON 시만 SidebarProvider 로 감쌈 · OFF (기본) 는 기존 그대로
  // 2026-08-11 · 사이드바 V2 · 데스크탑만 사이드바 · 모바일은 기존 상단 헤더 + BottomNav (사용자 지시)
  if (SIDEBAR_ENABLED) {
    return <SidebarLayoutWrapper pageContent={pageContent} authSession={authSession} activePage={page as AppNavPage} navigate={navigate} handleLogout={handleLogout} timeoutWarningOverlay={timeoutWarningOverlay} />;
  }

  return (
    <>
      <MobileOnlyGate pageKey={page} authSession={authSession}>
        {pageContent}
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
