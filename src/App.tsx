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
import { OcrPage } from "./components/OcrPage";
import { RequestsPage } from "./components/RequestsPage";
import { LeavePage } from "./components/LeavePage/LeavePage";
import { PermissionsPage } from "./components/PermissionsPage";
import { LunchPage } from "./components/LunchPage/LunchPage";
import { StockCheckPage } from "./components/StockCheckPage/StockCheckPage";
import { SynonymPage } from "./components/SynonymPage";
import { StockArrivalPage } from "./components/StockArrivalPage";
import { SessionTimeoutWarning } from "./components/SessionTimeoutWarning";
import { useAuth } from "./hooks/useAuth";
import type { AuthSession } from "./types";
import { prefetchProducts } from "./lib/productsCache";

type Page = "landing" | "schedule" | "reservation" | "display" | "scan" | "ocr" | "requests" | "leave" | "permissions" | "lunch" | "stockcheck" | "synonyms" | "stockarrivals";

export default function App() {
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

  // Prefetch product list as soon as user is authenticated
  useEffect(() => {
    if (authSession) prefetchProducts();
  }, [authSession]);

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
      history.back(); // let browser pop back to the landing entry
    } else {
      history.pushState({ page: next }, "");
    }
  };

  const handleNavigate = (next: "schedule" | "reservation" | "display" | "scan" | "ocr" | "requests" | "leave" | "permissions" | "lunch" | "stockcheck" | "synonyms" | "stockarrivals", auth?: AuthSession) => {
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
  const navigateInner = (next: "schedule" | "display" | "requests" | "leave" | "scan" | "ocr" | "lunch") => navigate(next);

  let pageContent: React.ReactElement;

  if (page === "schedule") {
    pageContent = (
      <SchedulePage
        onBack={goBack}
        onLogout={handleLogout}
        onNavigateToDisplay={() => navigate("display")}
        onNavigateToRequests={() => navigate("requests")}
        onNavigateToLeave={() => navigate("leave")}
        onNavigateToScan={() => navigate("scan")}
        onNavigateToOcr={() => navigate("ocr")}
        onNavigateToLunch={() => navigate("lunch")}
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
        onNavigateToSchedule={() => navigate("schedule")}
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
    pageContent = <StockCheckPage onBack={goBack} />;
  } else if (page === "synonyms") {
    pageContent = <SynonymPage authSession={authSession} onBack={goBack} />;
  } else if (page === "stockarrivals") {
    pageContent = <StockArrivalPage authSession={authSession} onBack={goBack} />;
  } else if (page === "permissions") {
    pageContent = (
      <PermissionsPage
        authSession={authSession}
        onBack={goBack}
        onLogout={handleLogout}
      />
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
      {timeoutWarningOverlay}
    </>
  );
}
