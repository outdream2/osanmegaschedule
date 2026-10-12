// src/components/BusinessManagePage/BusinessManagePage.tsx
// 경영관리 페이지 · 2026-08-03
//   상단: AppNavHeader (activePage="business-manage")
//   서브탭: 직원관리 · 연차승인 · 점심불참 · 직원권한 (DisplayPage 서브탭 스타일 벤치마크)
//   각 서브탭 · 기존 페이지 임베드 (embedded prop 전달 → 자체 AppNavHeader skip)
// 2026-09-27 · 네비게이션 SSOT · useActiveNav Context 로 이관 (localStorage · CustomEvent 제거)
import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
// 2026-10-11 · #14 · 통합 대시보드 + 업무요청 흡수 아이콘 추가 (SquaresFour · CheckSquare)
// 2026-10-11 · #14 X안 · CalendarDots · ForkKnife 제거 (승인대기·점심불참 탭 삭제됨)
// 2026-10-11 · #14-P3 · 사용자 지시 · inner tab 재편 · L2 TabBar 아이콘 2개만 (SquaresFour · FileText)
import { FileText, SquaresFour, type Icon as PhIcon } from "@phosphor-icons/react";
// 2026-09-27 · 네비게이션 SSOT · useActiveNav Context
import { useActiveNav } from "../../contexts/ActiveNavContext";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { useSidebarEnabled } from "../../hooks/useSidebar";
import { useIsMobile } from "../../hooks/use-mobile";
// 2026-08-17 · #131 · 페이지 안보이기 · 내부 subtab 필터
import { usePagePermissions } from "../../hooks/usePagePermissions";
// 2026-10-11 · #14-P3 · LunchPage · subTab 제거됨 (경영현황 Overview 안 inner tab 외 render 안함)
import { useSortableTabs } from "../../hooks/useSortableTabs";
import type { AuthSession } from "../../types";
import { TabBar, type TabDef as CommonTabDef } from "../common/TabBar";
// 2026-10-08 · GLOBAL UI · Operations template migration
import { OperationsPageTemplate } from "../common/OperationsPageTemplate";
import { TEXT, PAGE_CONTAINER_CLS } from "../../styles/tokens";
// 2026-08-21 · Framework Phase 3 · fetch → apiClient
// 2026-09-14 · leaveApi · resignationsApi 프리미티브
import { getLeavePendingCount } from "../../lib/leaveApi";
import { getResignationPendingCount } from "../../lib/resignationsApi";
import { Spinner } from "../common/Spinner";

// 2026-08-03 · 각종 양식 페이지 · lazy 로드 (초기 진입 시에만 필요)
const HrFormsPage = React.lazy(() => import("../HrFormsPage/HrFormsPage"));
// 2026-10-11 · #14-P3 · 경영현황 Overview · 매장 overview 공통 UI (OverviewHero + OverviewInnerTabs)
//   · 5-way inner tabs 조립 (현황/직원관리/업무요청/인건비분석/근로계약서작성)
//   · 기존 Dashboard/StaffManagePage/DocumentWriterPage/RequestsPage/WageAnalysis 는 Overview 안에서 lazy embed
const BusinessOverview = React.lazy(() => import("./BusinessManagePage.Overview"));

interface BusinessManagePageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** 2026-08-10 · A · 스케쥴 [수정] 라우팅 · 진입 시 staff-manage 서브탭 + 이 직원 자동 선택 */
  initialEmployeeId?: number | null;
  /** 2026-08-10 · A · 진입 시 이전 페이지 (뒤로가기용 · staff-manage 상단 [← 스케쥴] 버튼) */
  initialFromPage?: AppNavPage | null;
}

// 2026-10-11 · #14-P3 · L2 subTab 2개로 축소 (dashboard · hr-forms)
//   · 다른 subTab 값들 (staff-manage · requests · document-writer · wage-analysis) 은 BusinessOverview 안 innerTab 으로 흡수
//   · 하위 호환 · 기존 subTab 값 → dashboard + initialInnerTab 매핑
type BmSubTab = "dashboard" | "hr-forms";
type BmInnerKey = "overview" | "staff-manage" | "requests" | "wage-analysis" | "contract";

// 색상 · 공통 TabBar 프리셋 (COLOR_MAP · TabBar.tsx 내부)
type TabColor = "sky" | "amber" | "violet" | "teal" | "indigo" | "rose" | "emerald" | "orange" | "slate";

interface TabDef {
  key: BmSubTab;
  label: string;
  // Phosphor Icon 컴포넌트 (weight 는 "regular"|"bold"|"fill"|... 유니온 · 문자열 유니온 대신 원본 Icon 타입 사용)
  icon: PhIcon;
  color: TabColor;
}

// 2026-08-17 · 사용자 지시 · 점심불참 · 승인요청 그룹으로 이관 완료 · 경영 tab bar 에서 제거
//   · lunch subtab · ApprovalRequestPage 로 노출 · BusinessManagePage 에서 중복 제거
// 2026-10-11 · #14-P3 · L2 TabBar 2개로 축소 · 경영현황 안에서 inner tab 5개 (OverviewInnerTabs)
const TABS: TabDef[] = [
  { key: "dashboard", label: "경영현황", icon: SquaresFour, color: "violet" },
  { key: "hr-forms",  label: "각종양식", icon: FileText,    color: "amber"  },
];

const BusinessManagePage: React.FC<BusinessManagePageProps> = ({
  onBack,
  authSession,
  onNavigate,
  onLogout,
  initialEmployeeId,
  initialFromPage,
}) => {
  // 2026-09-27 · 네비게이션 SSOT · useActiveNav · activeNav 로 initial 결정
  const { activeNav, setActiveByPage } = useActiveNav();
  // 2026-10-11 · #14-P3 · 하위 호환 · 이전 subTab 값들 → dashboard + innerTab 매핑
  //   · leave/approval-center/requests → innerTab=requests
  //   · staff-manage → innerTab=staff-manage
  //   · document-writer → innerTab=contract
  //   · wage-analysis → innerTab=wage-analysis
  //   · hr-forms 만 L2 subTab 으로 유지
  const { initialBmSubTab, initialInnerTab } = (() => {
    const raw = activeNav?.itemKey === "business-manage" ? activeNav.subTab : null;
    if (raw === "hr-forms") return { initialBmSubTab: "hr-forms" as BmSubTab, initialInnerTab: null as BmInnerKey | null };
    if (raw === "staff-manage") return { initialBmSubTab: "dashboard" as BmSubTab, initialInnerTab: "staff-manage" as BmInnerKey };
    if (raw === "leave" || raw === "approval-center" || raw === "requests") {
      return { initialBmSubTab: "dashboard" as BmSubTab, initialInnerTab: "requests" as BmInnerKey };
    }
    if (raw === "document-writer" || raw === "document-writer:contract") {
      return { initialBmSubTab: "dashboard" as BmSubTab, initialInnerTab: "contract" as BmInnerKey };
    }
    if (raw === "wage-analysis") return { initialBmSubTab: "dashboard" as BmSubTab, initialInnerTab: "wage-analysis" as BmInnerKey };
    return { initialBmSubTab: "dashboard" as BmSubTab, initialInnerTab: null as BmInnerKey | null };
  })();
  const [subTab, _setSubTab] = useState<BmSubTab>(initialBmSubTab);
  // 2026-10-11 · #14-P3 · innerTab state (경영현황 안 5-way inner tab)
  const [innerTab, setInnerTab] = useState<BmInnerKey>(initialInnerTab ?? "overview");
  // 2026-09-27 · 네비게이션 SSOT · setSubTab · activeNav 즉시 갱신
  const setSubTab = React.useCallback((next: BmSubTab) => {
    _setSubTab(next);
    setActiveByPage("business-manage", next);
  }, [setActiveByPage]);
  const isBmMobile = useIsMobile();
  const SIDEBAR_ENABLED = useSidebarEnabled(); // 2026-08-16 · 로컬 상수 유지

  // 2026-08-17 · #131 · 사용자 지시 · admin 도 hidden 적용 (subtab 은 essential 아님)
  const { perms: bmPerms } = usePagePermissions();
  const bmHiddenSubs = useMemo(() => {
    const set = new Set<BmSubTab>();
    const subs: BmSubTab[] = ["dashboard", "hr-forms"];
    for (const s of subs) {
      const perm = (bmPerms as any)[`business-manage:${s}`];
      if (perm?.hidden === true) set.add(s);
    }
    return set;
  }, [bmPerms]);
  // 현재 subtab hidden 시 · 첫번째 visible 로 이동
  useEffect(() => {
    if (bmHiddenSubs.has(subTab)) {
      const priority: BmSubTab[] = ["dashboard", "hr-forms"];
      const next = priority.find(k => !bmHiddenSubs.has(k));
      if (next) setSubTab(next);
    }
  }, [subTab, bmHiddenSubs]);

  // 2026-08-10 · A · 스케쥴 [수정] 라우팅 · initialEmployeeId 진입 시 · dashboard + innerTab=staff-manage 강제 이동
  useEffect(() => {
    if (initialEmployeeId != null) {
      setSubTab("dashboard");
      setInnerTab("staff-manage");
    }
  }, [initialEmployeeId]);

  // 2026-08-03 · 관리자(level>=8) 전용 · long-press 드래그 재정렬
  //   · storageKey "tabOrder.business" · memory feedback_tab_reorder 규칙 준수
  const isAdmin = (authSession?.level ?? 0) >= 8;
  const sortable = useSortableTabs<TabDef>("tabOrder.business", TABS, isAdmin);

  // 2026-09-27 · 네비게이션 SSOT · activeNav 변화 감지 · 사이드바 재클릭 대응
  //   · 2026-10-11 · #14-P3 · 하위호환 · raw 가 inner key 면 dashboard + innerTab 로 매핑
  useEffect(() => {
    if (activeNav?.itemKey !== "business-manage") return;
    const raw = activeNav.subTab;
    if (raw === "hr-forms") {
      if (subTab !== "hr-forms") _setSubTab("hr-forms");
      return;
    }
    if (raw === "dashboard") {
      if (subTab !== "dashboard") _setSubTab("dashboard");
      return;
    }
    // inner tab 매핑 (dashboard + innerTab)
    const innerMap: Record<string, BmInnerKey> = {
      "staff-manage": "staff-manage",
      "leave": "requests",
      "approval-center": "requests",
      "requests": "requests",
      "document-writer": "contract",
      "document-writer:contract": "contract",
      "wage-analysis": "wage-analysis",
    };
    if (raw && innerMap[raw]) {
      if (subTab !== "dashboard") _setSubTab("dashboard");
      setInnerTab(innerMap[raw]);
    }
  }, [activeNav, subTab]);

  // 2026-09-27 · 페이지 mount 시 · activeNav 정착 (딥링크 / 새로고침 대비)
  useEffect(() => {
    if (activeNav?.itemKey !== "business-manage" || activeNav.subTab !== subTab) {
      setActiveByPage("business-manage", subTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 승인대기 pending 카운트 (연차 + 사직서 합계) · 서브탭 라벨 옆 배지 ──
  //   · 초기 · 60초 폴링 · CustomEvent("approval-count-updated") 실시간 갱신
  //   · 관리자(level>=2) 만 표시 (승인 권한 없는 사원에게 표시 X)
  const showApprovalBadge = (authSession?.level ?? 0) >= 2;
  const [approvalPending, setApprovalPending] = useState<number>(0);

  const loadApprovalCount = useCallback(async () => {
    if (!showApprovalBadge) return;
    try {
      // 2026-09-14 · leaveApi · resignationsApi 프리미티브 통합
      const [leaveCount, resignCount] = await Promise.all([
        getLeavePendingCount().catch(() => 0),
        getResignationPendingCount().catch(() => 0),
      ]);
      setApprovalPending(leaveCount + resignCount);
    } catch {
      // no-op
    }
  }, [showApprovalBadge]);

  useEffect(() => {
    loadApprovalCount();
    const iv = setInterval(loadApprovalCount, 60_000);
    const handler = () => loadApprovalCount();
    window.addEventListener("approval-count-updated", handler);
    return () => {
      clearInterval(iv);
      window.removeEventListener("approval-count-updated", handler);
    };
  }, [loadApprovalCount]);

  // 노프롭 서브페이지에 넘길 공통 props (embedded=true 로 자체 헤더 skip 요청)
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
        activePage={"business-manage" as AppNavPage}
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* 2026-10-11 · #14-P3 · L2 TabBar 축소 (경영현황 / 각종양식) · 내부 inner tabs 는 Overview 안에서 */}
      {/* 2026-10-12 · 사용자 지시 · 상단 큰제목 "경영관리 · 경영현황 · 각종 양식" 제거 (중복 · 사이드바/inner tab 에 이미 라벨 존재) · PageTemplate 는 title/description null 이면 header 전부 skip */}
      <OperationsPageTemplate
        tabs={!(SIDEBAR_ENABLED && !isBmMobile) ? (
          <TabBar<BmSubTab>
            level={2}
            tabs={sortable.tabs.filter(t => !bmHiddenSubs.has(t.key)).map((t): CommonTabDef<BmSubTab> => ({
              key: t.key,
              label: t.label,
              icon: t.icon,
              color: t.color,
              // 2026-10-11 · pending 뱃지 (연차+사직서) · 경영현황 라벨 옆
              badge: (t.key === "dashboard" && showApprovalBadge) ? approvalPending : undefined,
            }))}
            activeKey={subTab}
            onSelect={setSubTab}
            badgeColor="rose"
            sortable={{
              getTabProps: (keyOrTab) => sortable.getTabProps(typeof keyOrTab === "string" ? keyOrTab : keyOrTab.key),
              isDragging: sortable.isDragging,
            }}
          />
        ) : undefined}
      >
      <main className="flex-1 flex flex-col min-h-0">
        {/* 2026-10-11 · #14-P3 · 경영현황 Overview (OverviewHero + 5-way OverviewInnerTabs) */}
        {subTab === "dashboard" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="경영현황 로딩 중..." size={16} tone="brand" /></div>}>
            <BusinessOverview
              authSession={authSession}
              onBack={onBack}
              onNavigate={onNavigate}
              onLogout={onLogout}
              initialEmployeeId={initialEmployeeId}
              initialFromPage={initialFromPage}
              activeInnerTab={innerTab}
              onInnerTabChange={setInnerTab}
            />
          </Suspense>
        )}
        {subTab === "hr-forms" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="각종 양식 로딩 중..." size={16} tone="brand" /></div>}>
            <HrFormsPage {...commonSubPageProps} />
          </Suspense>
        )}
      </main>
      </OperationsPageTemplate>
    </div>
  );
};

export default BusinessManagePage;
