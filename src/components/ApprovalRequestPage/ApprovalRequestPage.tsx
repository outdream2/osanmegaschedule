// src/components/ApprovalRequestPage/ApprovalRequestPage.tsx
// 2026-08-12 · 승인요청 통합 페이지
//   · 서브탭: 연차승인(leave) · 점심불참(lunch) · 서류작성(document-writer)
//   · 각 서브탭 · 기존 페이지 컴포넌트 · embedded 렌더 (자체 헤더 skip)
//   · 사이드바 V2 (PC) 활성 시 · TabBar 숨김 · 사이드바가 서브탭 담당
//   · sidebar:subtab CustomEvent · page="approval-request" 수신 시 setSubTab
//   · 초기 서브탭 · localStorage("sidebar.subtab.approval-request") · 없으면 "leave"
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { CalendarDots, Coffee, PencilLine } from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { useSidebarEnabled } from "../../hooks/useSidebar";
import { useIsMobile } from "../../hooks/use-mobile";
// 2026-08-17 · #131 · 페이지 안보이기 · 내부 subtab tab bar 필터
import { usePagePermissions } from "../../hooks/usePagePermissions";
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
  { key: "leave",           label: "연차신청",   icon: CalendarDots, color: "sky"    },
  { key: "lunch",           label: "점심불참",   icon: Coffee,       color: "amber"  },
  { key: "document-writer", label: "사직서 작성", icon: PencilLine,   color: "violet" },
];

function readInitialSubTab(): ArSubTab {
  // 2026-08-12 · StrictMode 이중 마운트 대비 · 읽기만 · 삭제는 mount 완료 후 useEffect 에서
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "leave" || raw === "lunch" || raw === "document-writer") return raw;
  } catch { /* SSR · quota */ }
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
  const SIDEBAR_ENABLED = useSidebarEnabled(); // 2026-08-16 · 로컬 상수 유지

  // 2026-08-17 · #131 · 페이지 안보이기 · 사용자 지시 · admin 도 hidden 적용 (subtab · 관리자도 안 보이게)
  //   · essential (설정 접근용) 이 아닌 일반 subtab · admin 이 hide 하면 admin 뷰에서도 사라짐
  const { perms: arPerms } = usePagePermissions();
  const arHiddenSubs = useMemo(() => {
    const set = new Set<ArSubTab>();
    const subs: ArSubTab[] = ["leave", "lunch", "document-writer"];
    for (const s of subs) {
      const perm = (arPerms as any)[`approval-request:${s}`];
      if (perm?.hidden === true) set.add(s);
    }
    return set;
  }, [arPerms]);

  // 현재 subtab hidden 시 · 첫번째 visible 로 이동
  useEffect(() => {
    if (arHiddenSubs.has(subTab)) {
      const priority: ArSubTab[] = ["leave", "lunch", "document-writer"];
      const next = priority.find(k => !arHiddenSubs.has(k));
      if (next) setSubTab(next);
    }
  }, [subTab, arHiddenSubs]);

  const visibleTabs = useMemo(() => TABS.filter(t => !arHiddenSubs.has(t.key)), [arHiddenSubs]);

  // 초기 마운트 완료 후 · localStorage 값 정리 (StrictMode 재마운트 후에도 유지되도록 mount 이후 삭제)
  useEffect(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* silent */ }
  }, []);

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
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* ── 공용 상단 헤더 ── */}
      <AppNavHeader
        activePage={"approval-request" as AppNavPage}
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* ── 서브탭 바 · 공통 TabBar (level 2) · 2026-08-17 · #131 · 안보이기 처리 filter ── */}
      {!(SIDEBAR_ENABLED && !isMobile) && visibleTabs.length > 0 && (
        <TabBar<ArSubTab>
          level={2}
          tabs={visibleTabs}
          activeKey={subTab}
          onSelect={setSubTab}
        />
      )}

      {/* ── 서브탭 컨텐츠 ── */}
      <main className="flex-1 flex flex-col min-h-0">
        {subTab === "leave" && (
          <LeavePage {...commonSubPageProps} mode="apply" />
        )}
        {subTab === "lunch" && (
          <LunchPage {...commonSubPageProps} />
        )}
        {subTab === "document-writer" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-zinc-400 py-16">사직서 로딩 중...</div>}>
            <DocumentWriterPage {...commonSubPageProps} allowedTabs={["resignation"]} />
          </Suspense>
        )}
      </main>
    </div>
  );
};

export default ApprovalRequestPage;
