/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import SchedulePage from "./components/SchedulePage";
import { LandingPage } from "./components/LandingPage";
import { ReservationPage } from "./components/ReservationPage";
import { DisplayPage } from "./components/DisplayPage";

type Page = "landing" | "schedule" | "reservation" | "display";

export default function App() {
  const [page, setPage] = useState<Page>("landing");
  const [pendingEditEmpId, setPendingEditEmpId] = useState<number | null>(null);

  if (page === "schedule") {
    return (
      <SchedulePage
        onBack={() => setPage("landing")}
        initialEditEmployeeId={pendingEditEmpId}
        onEditEmployeeHandled={() => setPendingEditEmpId(null)}
      />
    );
  }
  if (page === "reservation") {
    return <ReservationPage onBack={() => setPage("landing")} />;
  }
  if (page === "display") {
    return (
      <DisplayPage
        onBack={() => setPage("landing")}
        onOpenEmployeeEdit={(id) => {
          setPendingEditEmpId(id);
          setPage("schedule");
        }}
      />
    );
  }
  return <LandingPage onNavigate={setPage} />;
}
