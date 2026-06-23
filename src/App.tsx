/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import SchedulePage from "./components/SchedulePage";
import { LandingPage } from "./components/LandingPage";
import { ReservationPage } from "./components/ReservationPage";

type Page = "landing" | "schedule" | "reservation";

export default function App() {
  const [page, setPage] = useState<Page>("landing");

  if (page === "schedule") {
    return <SchedulePage onBack={() => setPage("landing")} />;
  }
  if (page === "reservation") {
    return <ReservationPage onBack={() => setPage("landing")} />;
  }
  return <LandingPage onNavigate={setPage} />;
}
