/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import SchedulePage from "./components/SchedulePage";
import { LandingPage } from "./components/LandingPage";
import { ReservationPage } from "./components/ReservationPage";
import { DisplayPage } from "./components/DisplayPage";
import { ScanPage } from "./components/ScanPage";
import { ProductArrivalPage } from "./components/ProductArrivalPage";
import { OcrPage } from "./components/OcrPage";
import { RequestsPage } from "./components/RequestsPage";
import { LeavePage } from "./components/LeavePage/LeavePage";
import { PermissionsPage } from "./components/PermissionsPage";
import { LunchPage } from "./components/LunchPage/LunchPage";
import { StockCheckPage } from "./components/StockCheckPage/StockCheckPage";
import { StockArrivalPage } from "./components/StockArrivalPage";
import { BoardPage } from "./components/BoardPage";
import { MyPage } from "./components/MyPage";
import { AppFooter } from "./components/AppFooter";
import { SessionTimeoutWarning } from "./components/SessionTimeoutWarning";
import { useAuth } from "./hooks/useAuth";
import { usePushSubscription } from "./hooks/usePushSubscription";
import type { AuthSession } from "./types";
import { prefetchProducts } from "./lib/productsCache";
import { loadZoneLabelsFromServer } from "./constants/zoneLabels";

// 관리자 전용 · 구역 라벨 편집 UI · lazy 로드 (초기 번들 축소)
const ZoneLabelsEditor = React.lazy(() => import("./components/ZoneLabelsEditor/ZoneLabelsEditor"));
// 2026-08-03 · 경영관리 통합 페이지 (직원관리 · 연차승인 · 점심불참 · 직원권한 서브탭) · lazy 로드
const BusinessManagePage = React.lazy(() => import("./components/BusinessManagePage/BusinessManagePage"));
// 2026-08-03 · 약사 전용 페이지 (교육자료·복약지도·문서) · lazy 로드
const PharmacistPage = React.lazy(() => import("./components/PharmacistPage/PharmacistPage"));
// 2026-08-03 · 각종 양식 (인사 문서 관리) · 경영관리 서브탭 및 별도 라우팅 진입 지원 · lazy 로드
const HrFormsPage = React.lazy(() => import("./components/HrFormsPage/HrFormsPage"));

type Page = "landing" | "schedule" | "reservation" | "display" | "scan" | "productarrival" | "ocr" | "requests" | "leave" | "permissions" | "lunch" | "stockcheck" | "stockarrivals" | "board" | "mypage" | "zone-labels" | "business-manage" | "hr-forms" | "pharmacist";

export default function App() {
  // 전역 모달 스크롤 잠금은 CSS :has() 셀렉터로 처리 (index.css) · JS 훅 불필요
  const [page, setPage] = useState<Page>("landing");
  const [pendingEditEmpId, setPendingEditEmpId] = useState<number | null>(null);
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
      const p = (e.state as any)?.page as Page | undefined;
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

  const handleNavigate = (next: "schedule" | "reservation" | "display" | "scan" | "productarrival" | "ocr" | "requests" | "leave" | "permissions" | "lunch" | "stockcheck" | "stockarrivals" | "board" | "mypage" | "zone-labels" | "business-manage" | "hr-forms", auth?: AuthSession) => {
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
  const navigateInner = (next: "landing" | "schedule" | "display" | "requests" | "leave" | "scan" | "productarrival" | "ocr" | "lunch" | "board" | "mypage" | "business-manage" | "stockcheck" | "zone-labels" | "hr-forms") => navigate(next as Page);

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
    pageContent = <StockCheckPage onBack={goBack} authSession={authSession} onNavigate={navigateInner as any} onLogout={handleLogout} />;
  } else if (page === "stockarrivals") {
    pageContent = <StockArrivalPage authSession={authSession} onBack={goBack} onNavigate={navigateInner} onLogout={handleLogout} />;
  } else if (page === "board") {
    pageContent = (
      <BoardPage
        authSession={authSession}
        onBack={goBack}
        onNavigate={navigateInner as any}
        onLogout={handleLogout}
      />
    );
  } else if (page === "mypage") {
    pageContent = (
      <MyPage
        authSession={authSession}
        onBack={goBack}
        onNavigate={navigateInner as any}
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
      <React.Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm">불러오는 중...</div>}>
        <ZoneLabelsEditor authSession={authSession} onBack={goBack} />
      </React.Suspense>
    );
  } else if (page === "business-manage") {
    // 2026-08-03 · 경영관리 통합 페이지 (직원관리 · 연차승인 · 점심불참 · 직원권한 서브탭)
    pageContent = (
      <React.Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm">불러오는 중...</div>}>
        <BusinessManagePage authSession={authSession} onBack={goBack} onNavigate={navigateInner} onLogout={handleLogout} />
      </React.Suspense>
    );
  } else if (page === "pharmacist") {
    // 2026-08-03 · 약사 전용 페이지 · 교육자료·복약지도 등 · 약사 rank 만 접근
    pageContent = (
      <React.Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm">불러오는 중...</div>}>
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
      <React.Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm">불러오는 중...</div>}>
        <HrFormsPage authSession={authSession} onBack={goBack} onNavigate={navigateInner} onLogout={handleLogout} />
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

  return (
    <>
      {pageContent}
      <AppFooter />
      {timeoutWarningOverlay}
    </>
  );
}
