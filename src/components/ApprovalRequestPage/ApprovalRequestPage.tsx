// src/components/ApprovalRequestPage/ApprovalRequestPage.tsx
// 2026-08-12 · 승인요청 통합 페이지
//   · 서브탭: 연차승인(leave) · 점심불참(lunch) · 서류작성(document-writer)
//   · 각 서브탭 · 기존 페이지 컴포넌트 · embedded 렌더 (자체 헤더 skip)
//   · 사이드바 V2 (PC) 활성 시 · TabBar 숨김 · 사이드바가 서브탭 담당
// 2026-09-27 · 네비게이션 SSOT · useActiveNav Context 로 이관 (localStorage · CustomEvent 제거)
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { PencilLine } from "@phosphor-icons/react";
// 2026-08-29 · #196 Phase 3 · 사이드바 · 서브탭 자동 파생
// 2026-09-24 · #354 · getGroupSubTabs 사용 · approvals 그룹 기준 (schedule 그룹 오매칭 방지)
import { getGroupSubTabs } from "../layout/sideNavGroups";
// 2026-09-27 · 네비게이션 SSOT · useActiveNav Context
import { useActiveNav } from "../../contexts/ActiveNavContext";
import { Spinner } from "../common/Spinner";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { useSidebarEnabled } from "../../hooks/useSidebar";
import { useIsMobile } from "../../hooks/use-mobile";
// 2026-08-17 · #131 · 페이지 안보이기 · 내부 subtab tab bar 필터
import { usePagePermissions } from "../../hooks/usePagePermissions";
import { TabBar, type TabDef } from "../common/TabBar";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { LeavePage } from "../LeavePage/LeavePage";
import { LunchPage } from "../LunchPage/LunchPage";
import type { AuthSession } from "../../types";
// 2026-08-20 · #175 · 퇴사예정 자만 사직서 작성 가능 · retire_date 파생
import { api } from "../../lib/apiClient";
import { getEmploymentStatus, canWriteResignation } from "../../lib/employmentStatus";

// DocumentWriterPage · lazy (초기 진입 시 필요할 때만)
const DocumentWriterPage = React.lazy(() => import("../DocumentWriterPage/DocumentWriterPage"));

interface ApprovalRequestPageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

type ArSubTab = "leave" | "lunch" | "document-writer";

// 2026-08-29 · #196 Phase 3 · TABS · sideNavGroups.getGroupSubTabs 자동 파생 (하드코드 제거)
//   · SIDE_NAV_GROUPS approvals 그룹 기준 · subTab (leave · lunch · document-writer) 자동 반영
//   · 사이드바 편집 시 · 이 페이지 서브탭 자동 동기 · 단일 소스 원칙
// 2026-09-24 · #354 · getGroupSubTabs("approvals") 사용 · schedule 그룹 오매칭 방지
//   · 기존 getPageSubTabs("approval-request") → schedule 그룹 안 "연차신청" 만 반환 (버그)
//   · 수정 후 → approvals 그룹 안 서류작성 탭 정확히 파생
const TABS: TabDef<ArSubTab>[] = getGroupSubTabs("approvals", "approval-request").map(it => ({
  key: (it.subTab as ArSubTab),
  label: it.label,
  icon: it.icon as any,
  color: it.color,
}));

const ApprovalRequestPage: React.FC<ApprovalRequestPageProps> = ({
  onBack,
  authSession,
  onNavigate,
  onLogout,
}) => {
  // 2026-09-27 · 네비게이션 SSOT · useActiveNav · activeNav 로 initial 결정 · 사이드 채널 제거
  //   · 첫 탭 default 대원칙 · TABS[0] 기준 · localStorage 복원 X
  const { activeNav, setActiveByPage } = useActiveNav();
  const initialSubTab: ArSubTab = (() => {
    const s = activeNav?.itemKey === "approval-request" ? activeNav.subTab : null;
    if (s === "leave" || s === "lunch" || s === "document-writer") return s;
    return (TABS[0]?.key as ArSubTab) ?? "document-writer";
  })();
  const [subTab, _setSubTab] = useState<ArSubTab>(initialSubTab);
  // 2026-09-27 · 네비게이션 SSOT · setSubTab · activeNav 즉시 갱신
  //   · Header · Sidebar highlight · Breadcrumb 모두 동시 반영
  const setSubTab = React.useCallback((next: ArSubTab) => {
    _setSubTab(next);
    setActiveByPage("approval-request", next);
  }, [setActiveByPage]);
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

  // 2026-09-27 · 네비게이션 SSOT · activeNav.subTab 변화 감지 · 사이드바 재클릭 대응
  //   · 이전 · CustomEvent("sidebar:subtab") 리스너 · window 리스너 사이드 채널
  //   · 이후 · activeNav.subTab 변화 감지 · useEffect 하나로 통합
  useEffect(() => {
    if (activeNav?.itemKey !== "approval-request") return;
    const next = activeNav.subTab as ArSubTab | null | undefined;
    if ((next === "leave" || next === "lunch" || next === "document-writer") && next !== subTab) {
      _setSubTab(next);
    }
  }, [activeNav, subTab]);

  // 2026-09-27 · 페이지 mount 시 · activeNav 이 다른 페이지 상태이거나 subTab 미설정 · 현재 subTab 로 세팅
  //   · 딥링크 · 새로고침 · 페이지 진입 시 · Header · Sidebar highlight 정확히 반영
  useEffect(() => {
    if (activeNav?.itemKey !== "approval-request" || activeNav.subTab !== subTab) {
      setActiveByPage("approval-request", subTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <main className={`flex-1 flex flex-col min-h-0 ${PAGE_CONTAINER_CLS}`}>
        {subTab === "leave" && (
          <LeavePage {...commonSubPageProps} mode="apply" />
        )}
        {subTab === "lunch" && (
          <LunchPage {...commonSubPageProps} />
        )}
        {subTab === "document-writer" && (
          // 2026-09-08 · 사용자 지시 · 근로계약서 · 사직서 둘 다 접근 가능 (기존은 사직서만)
          //   · 근로계약서 · 접근 제한 없음 (직원 본인 계약서 조회·확인)
          //   · 사직서 · ResignationGate · 퇴사예정자만
          <Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="서류 로딩 중..." size={16} tone="brand" /></div>}>
            <DocumentWriterPage {...commonSubPageProps} allowedTabs={["contract", "resignation"]} />
          </Suspense>
        )}
      </main>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// #175 · ResignationGate · 사직서 작성 접근 제어
//   · 본인 employee.retire_date 조회 · 퇴사예정 (미래 날짜) 만 허용
//   · 재직·퇴사 · 안내 화면 표시 (관리자에게 요청)
//   · 관리자 (level >= 9) · 예외 · 항상 접근 허용
// ─────────────────────────────────────────────────────────────
interface ResignationGateProps {
  authSession: AuthSession | null;
  children: React.ReactNode;
}

const ResignationGate: React.FC<ResignationGateProps> = ({ authSession, children }) => {
  const [retireDate, setRetireDate] = useState<string | null | undefined>(undefined); // undefined = loading
  const level = authSession?.level ?? 0;
  const isAdmin = level >= 9;

  useEffect(() => {
    if (isAdmin) { setRetireDate(null); return; } // admin · 조회 스킵
    const id = authSession?.employeeId;
    if (!id) { setRetireDate(null); return; }
    let alive = true;
    api.get<{ retireDate?: string | null }>(`/api/employees/${id}`)
      .then((r) => { if (alive) setRetireDate(r.data?.retireDate ?? null); })
      .catch(() => { if (alive) setRetireDate(null); });
    return () => { alive = false; };
  }, [authSession?.employeeId, isAdmin]);

  // 로딩
  if (retireDate === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 py-16 text-[14px]">
        상태 확인 중…
      </div>
    );
  }

  // admin · 항상 접근
  if (isAdmin) return <>{children}</>;

  // 퇴사예정 · 허용
  if (canWriteResignation(retireDate)) return <>{children}</>;

  // 그 외 · 안내
  const status = getEmploymentStatus(retireDate);
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-16 px-4 text-center gap-2">
      <PencilLine size={32} weight="duotone" className="text-zinc-400" />
      <div className="text-[15px] font-bold text-zinc-700">
        {status === "retired" ? "이미 퇴사 처리되었습니다" : "사직서는 퇴사예정자만 작성할 수 있습니다"}
      </div>
      <div className="text-[15px] text-zinc-500 leading-relaxed max-w-md">
        {status === "retired"
          ? "퇴사일 이후에는 사직서를 작성할 수 없습니다. 관리자에게 문의하세요."
          : "먼저 관리자에게 퇴사일을 등록해 달라고 요청하세요. 등록 후 이 화면에서 사직서 작성이 가능합니다."}
      </div>
    </div>
  );
};

export default ApprovalRequestPage;
