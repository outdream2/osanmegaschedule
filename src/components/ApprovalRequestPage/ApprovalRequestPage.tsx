// src/components/ApprovalRequestPage/ApprovalRequestPage.tsx
// 2026-08-12 · 승인요청 통합 페이지
//   · 서브탭: 연차승인(leave) · 점심불참(lunch) · 서류작성(document-writer)
//   · 각 서브탭 · 기존 페이지 컴포넌트 · embedded 렌더 (자체 헤더 skip)
//   · 사이드바 V2 (PC) 활성 시 · TabBar 숨김 · 사이드바가 서브탭 담당
//   · sidebar:subtab CustomEvent · page="approval-request" 수신 시 setSubTab
//   · 초기 서브탭 · localStorage("sidebar.subtab.approval-request") · 없으면 "leave"
import React, { Suspense, useEffect, useState } from "react";
import { CalendarDots, Coffee, PencilLine } from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { SIDEBAR_ENABLED } from "../../hooks/useSidebar";
import { useIsMobile } from "../../hooks/use-mobile";
import { TabBar, type TabDef } from "../common/TabBar";
import { LeavePage } from "../LeavePage/LeavePage";
import { LunchPage } from "../LunchPage/LunchPage";
import type { AuthSession } from "../../types";

// DocumentWriterPage · lazy (초기 진입 시 필요할 때만)
const DocumentWriterPage = React.lazy(() => import("../DocumentWriterPage/DocumentWriterPage"));

interface ApprovalRequestPageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

type ArSubTab = "leave" | "lunch" | "document-writer";

const STORAGE_KEY = "sidebar.subtab.approval-request";

const TABS: TabDef<ArSubTab>[] = [
  { key: "leave",           label: "연차승인", icon: CalendarDots, color: "sky"    },
  { key: "lunch",           label: "점심불참", icon: Coffee,       color: "amber"  },
  { key: "document-writer", label: "서류작성", icon: PencilLine,   color: "violet" },
];

function readInitialSubTab(): ArSubTab {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "leave" || raw === "lunch" || raw === "document-writer") {
      localStorage.removeItem(STORAGE_KEY);
      return raw;
    }
  } catch {
    // silent (SSR · quota 등)
  }
  return "leave";
}

const ApprovalRequestPage: React.FC<ApprovalRequestPageProps> = ({
  onBack,
  authSession,
  onNavigate,
  onLogout,
}) => {
  const [subTab, setSubTab] = useState<ArSubTab>(() => readInitialSubTab());
  const isMobile = useIsMobile();

  // 사이드바 V2 · 같은 페이지 내 서브탭 재클릭 대응 (CustomEvent)
  useEffect(() => {
    const onSubTab = (e: Event) => {
      const detail = (e as CustomEvent<{ page: string; subTab: string; nested?: string | null }>).detail;
      if (detail?.page !== "approval-request") return;
      const next = detail.subTab as ArSubTab;
      if (next === "leave" || next === "lunch" || next === "document-writer") {
        setSubTab(next);
      }
    };
    window.addEventListener("sidebar:subtab", onSubTab);
    return () => window.removeEventListener("sidebar:subtab", onSubTab);
  }, []);

  // 각 서브페이지에 공통 props (embedded=true 로 자체 헤더 skip 요청)
  const commonSubPageProps = {
    onBack,
    authSession,
    onNavigate,
    onLogout,
    embedded: true,
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── 공용 상단 헤더 ── */}
      <AppNavHeader
        activePage={"approval-request" as AppNavPage}
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* ── 서브탭 바 · 공통 TabBar (level 2) ── */}
      {/* 사이드바 V2 (PC) 활성 시 · 사이드바가 서브탭 담당 · TabBar 숨김 (모바일 유지) */}
      {!(SIDEBAR_ENABLED && !isMobile) && (
        <TabBar<ArSubTab>
          level={2}
          tabs={TABS}
          activeKey={subTab}
          onSelect={setSubTab}
        />
      )}

      {/* ── 서브탭 컨텐츠 ── */}
      <main className="flex-1 flex flex-col min-h-0">
        {subTab === "leave" && (
          <LeavePage {...commonSubPageProps} />
        )}
        {subTab === "lunch" && (
          <LunchPage {...commonSubPageProps} />
        )}
        {subTab === "document-writer" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 py-16">서류작성 로딩 중...</div>}>
            <DocumentWriterPage {...commonSubPageProps} />
          </Suspense>
        )}
      </main>
    </div>
  );
};

export default ApprovalRequestPage;
