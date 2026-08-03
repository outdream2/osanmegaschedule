// src/components/BusinessManagePage/BusinessManagePage.tsx
// 경영관리 페이지 · 2026-08-03
//   상단: AppNavHeader (activePage="business-manage")
//   서브탭: 직원관리 · 연차승인 · 점심불참 · 직원권한 (DisplayPage 서브탭 스타일 벤치마크)
//   각 서브탭 · 기존 페이지 임베드 (embedded prop 전달 → 자체 AppNavHeader skip)
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { UserGear, CalendarDots, ForkKnife, FileText, NotePencil, type Icon as PhIcon } from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import { LunchPage } from "../LunchPage/LunchPage";
import { useSortableTabs } from "../../hooks/useSortableTabs";
import type { AuthSession } from "../../types";
import { TabBar, type TabDef as CommonTabDef } from "../common/TabBar";

// StaffManagePage · props 없음 · lazy 로드 (초기 진입 시에만 필요)
const StaffManagePage = React.lazy(() => import("../StaffManagePage/StaffManagePage"));
// 2026-08-03 · 각종 양식 페이지 · lazy 로드 (초기 진입 시에만 필요)
const HrFormsPage = React.lazy(() => import("../HrFormsPage/HrFormsPage"));
// 2026-08-03 · 서류작성 · 근로계약서·사직서 2탭 wrapper · lazy 로드
const DocumentWriterPage = React.lazy(() => import("../DocumentWriterPage/DocumentWriterPage"));
// 2026-08-03 · #180 · 승인대기 wrapper (연차승인 · 사직서승인 2탭 · pending 배지)
const ApprovalCenterPage = React.lazy(() => import("../ApprovalCenterPage/ApprovalCenterPage"));

interface BusinessManagePageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// 2026-08-03 · "leave" 는 하위 호환 · 실제 렌더는 "approval-center" 로 리다이렉트
type BmSubTab = "staff-manage" | "approval-center" | "lunch" | "hr-forms" | "document-writer";

// 색상 · 공통 TabBar 프리셋 (COLOR_MAP · TabBar.tsx 내부)
type TabColor = "sky" | "amber" | "violet" | "teal" | "indigo" | "rose" | "emerald" | "orange" | "slate";

interface TabDef {
  key: BmSubTab;
  label: string;
  // Phosphor Icon 컴포넌트 (weight 는 "regular"|"bold"|"fill"|... 유니온 · 문자열 유니온 대신 원본 Icon 타입 사용)
  icon: PhIcon;
  color: TabColor;
}

const TABS: TabDef[] = [
  { key: "staff-manage",     label: "직원관리",  icon: UserGear,       color: "emerald" },
  // 2026-08-03 · #180 · "연차승인" → "승인대기" · 내부 2탭 (연차·사직서) 으로 확장
  { key: "approval-center",  label: "승인대기",  icon: CalendarDots,   color: "teal"    },
  { key: "lunch",            label: "점심불참",  icon: ForkKnife,      color: "orange"  },
  { key: "hr-forms",         label: "각종양식",  icon: FileText,       color: "amber"   },
  { key: "document-writer",  label: "서류작성",  icon: NotePencil,     color: "indigo"  },
];

const BusinessManagePage: React.FC<BusinessManagePageProps> = ({
  onBack,
  authSession,
  onNavigate,
  onLogout,
}) => {
  const [subTab, setSubTab] = useState<BmSubTab>("staff-manage");

  // 2026-08-03 · 관리자(level>=8) 전용 · long-press 드래그 재정렬
  //   · storageKey "tabOrder.business" · memory feedback_tab_reorder 규칙 준수
  const isAdmin = (authSession?.level ?? 0) >= 8;
  const sortable = useSortableTabs<TabDef>("tabOrder.business", TABS, isAdmin);

  // 2026-08-03 · 페이지 진입(마운트) 시 · 서브탭 · 재정렬된 순서의 첫 탭으로 리셋
  //   · 사용자 요청 (모든 메뉴 진입 시 · 첫 서브탭 기본 표시)
  //   · localStorage 순서 반영 후 첫 원소 · 마운트 1회
  useEffect(() => {
    const firstKey = sortable.tabs[0]?.key as BmSubTab | undefined;
    // 하위 호환 · 이전 저장값 "leave" → "approval-center" 로 자동 리다이렉트
    const mapped: BmSubTab | undefined =
      (firstKey as unknown as string) === "leave" ? "approval-center" : firstKey;
    if (mapped) setSubTab(mapped);
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
      const [lRes, rRes] = await Promise.all([
        fetch("/api/leave-requests/pending-count").catch(() => null),
        fetch("/api/resignations/pending-count").catch(() => null),
      ]);
      const lJson = lRes && lRes.ok ? await lRes.json().catch(() => null) : null;
      const rJson = rRes && rRes.ok ? await rRes.json().catch(() => null) : null;
      setApprovalPending(Number(lJson?.count ?? 0) + Number(rJson?.count ?? 0));
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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── 공용 상단 헤더 ── */}
      <AppNavHeader
        activePage={"business-manage" as AppNavPage}
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* ── 서브탭 바 · 공통 TabBar (level 2) · long-press 드래그 지원 ── */}
      {/* 2026-08-03 · 관리자(level>=8) · 500ms long-press 후 드래그로 순서 변경 가능 */}
      {/* 2026-08-03 (#183) · 공통 TabBar 사용 · duplicate 스타일 흡수 · approval-center 배지 동적 매핑 */}
      <TabBar<BmSubTab>
        level={2}
        tabs={sortable.tabs.map((t): CommonTabDef<BmSubTab> => ({
          key: t.key,
          label: t.label,
          icon: t.icon,
          color: t.color,
          badge: (t.key === "approval-center" && showApprovalBadge) ? approvalPending : undefined,
        }))}
        activeKey={subTab}
        onSelect={setSubTab}
        badgeColor="rose"
        sortable={{
          getTabProps: (keyOrTab) => sortable.getTabProps(typeof keyOrTab === "string" ? keyOrTab : keyOrTab.key),
          isDragging: sortable.isDragging,
        }}
      />

      {/* ── 서브탭 컨텐츠 ── */}
      <main className="flex-1 flex flex-col min-h-0">
        {subTab === "staff-manage" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">직원관리 로딩 중...</div>}>
            <StaffManagePage onWriteContract={() => setSubTab("document-writer")} />
          </Suspense>
        )}
        {subTab === "approval-center" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">승인대기 로딩 중...</div>}>
            <ApprovalCenterPage
              {...commonSubPageProps}
              onCountsChange={(c) => setApprovalPending(c.leave + c.resignation)}
            />
          </Suspense>
        )}
        {subTab === "lunch" && (
          <LunchPage {...commonSubPageProps} />
        )}
        {subTab === "hr-forms" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">각종 양식 로딩 중...</div>}>
            <HrFormsPage {...commonSubPageProps} />
          </Suspense>
        )}
        {subTab === "document-writer" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">서류작성 로딩 중...</div>}>
            <DocumentWriterPage {...commonSubPageProps} />
          </Suspense>
        )}
      </main>
    </div>
  );
};

export default BusinessManagePage;
