/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import SchedulePage from "./components/SchedulePage";
import { LandingPage } from "./components/LandingPage";
import { ReservationPage } from "./components/ReservationPage";
import { DisplayPage } from "./components/DisplayPage";
import { ScanPage } from "./components/ScanPage";
import { OcrPage } from "./components/OcrPage";
import { RequestsPage } from "./components/RequestsPage";
import { LeavePage } from "./components/LeavePage/LeavePage";
import { useAuth } from "./hooks/useAuth";
import type { AuthSession } from "./types";
import { prefetchProducts } from "./lib/productsCache";

type Page = "landing" | "schedule" | "reservation" | "display" | "scan" | "ocr" | "requests" | "leave";

export default function App() {
  const [page, setPage] = useState<Page>("landing");
  const [pendingEditEmpId, setPendingEditEmpId] = useState<number | null>(null);
  const { session: authSession, setSession: setAuthSession, clearSession: clearAuthSession } = useAuth();

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

  const handleNavigate = (next: "schedule" | "reservation" | "display" | "scan" | "ocr" | "requests" | "leave", auth?: AuthSession) => {
    if (auth) setAuthSession(auth);
    navigate(next);
  };

  const goBack = () => navigate("landing");

  const handleLogout = () => {
    clearAuthSession();
    Object.keys(localStorage)
      .filter(k => k.startsWith("megatown_"))
      .forEach(k => localStorage.removeItem(k));
    window.location.replace("/");
  };

  if (page === "schedule") {
    return (
      <SchedulePage
        onBack={goBack}
        onLogout={handleLogout}
        onNavigateToDisplay={() => navigate("display")}
        initialEditEmployeeId={pendingEditEmpId}
        onEditEmployeeHandled={() => setPendingEditEmpId(null)}
        authSession={authSession}
      />
    );
  }
  if (page === "reservation") {
    return <ReservationPage onBack={goBack} authSession={authSession} />;
  }
  if (page === "scan") {
    return <ScanPage onBack={goBack} />;
  }
  if (page === "ocr") {
    return <OcrPage onBack={goBack} />;
  }
  if (page === "requests") {
    return <RequestsPage onBack={goBack} authSession={authSession} />;
  }
  if (page === "leave") {
    return <LeavePage onBack={goBack} authSession={authSession} />;
  }
  if (page === "display") {
    return (
      <DisplayPage
        onBack={goBack}
        onNavigateToSchedule={() => navigate("schedule")}
        onOpenEmployeeEdit={(id) => {
          setPendingEditEmpId(id);
          navigate("schedule");
        }}
      />
    );
  }
  return <LandingPage onNavigate={handleNavigate} authSession={authSession} onLogout={handleLogout} onAuthOnly={setAuthSession} />;
}
