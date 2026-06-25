/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import SchedulePage from "./components/SchedulePage";
import { LandingPage } from "./components/LandingPage";
import { ReservationPage } from "./components/ReservationPage";
import { DisplayPage } from "./components/DisplayPage";
import { useAuth } from "./hooks/useAuth";
import type { AuthSession } from "./types";

type Page = "landing" | "schedule" | "reservation" | "display";

export default function App() {
  const [page, setPage] = useState<Page>("landing");
  const [pendingEditEmpId, setPendingEditEmpId] = useState<number | null>(null);
  const { session: authSession, setSession: setAuthSession, clearSession: clearAuthSession } = useAuth();

  const handleNavigate = (next: "schedule" | "reservation" | "display", auth?: AuthSession) => {
    if (auth) {
      setAuthSession(auth);
    } else if (next === "reservation") {
      // 외부용 페이지 — 인증 세션 보유 시에도 외부 컨텍스트로 들어가니 굳이 건드리지 않음
    }
    setPage(next);
  };

  const goBack = () => {
    setPage("landing");
  };

  const handleLogout = () => {
    clearAuthSession();
    localStorage.removeItem("megatown_admin");
    setPage("landing");
  };

  if (page === "schedule") {
    return (
      <SchedulePage
        onBack={goBack}
        onLogout={handleLogout}
        onNavigateToDisplay={() => setPage("display")}
        initialEditEmployeeId={pendingEditEmpId}
        onEditEmployeeHandled={() => setPendingEditEmpId(null)}
        authSession={authSession}
      />
    );
  }
  if (page === "reservation") {
    return <ReservationPage onBack={() => setPage("landing")} authSession={authSession} />;
  }
  if (page === "display") {
    return (
      <DisplayPage
        onBack={goBack}
        onNavigateToSchedule={() => setPage("schedule")}
        onOpenEmployeeEdit={(id) => {
          setPendingEditEmpId(id);
          setPage("schedule");
        }}
      />
    );
  }
  return <LandingPage onNavigate={handleNavigate} authSession={authSession} onLogout={handleLogout} />;
}
