// src/components/ApprovalCenterPage/ApprovalCenterPage.tsx
// 승인대기 통합 wrapper · 2026-08-03 · #180
// - 내부 2탭: 연차승인 (LeavePage embed) · 사직서승인 (ResignationApprovalPage)
// - 각 탭 라벨 옆 · pending 갯수 rose 배지
// - approval-count-updated CustomEvent 로 실시간 갱신
//   · 60초 폴링 fallback (동일 세션 · 다른 탭 처리 반영)
//
// 2026-08-03 (#183) · 공통 TabBar 로 리팩터 · duplicate 스타일 흡수
// 2026-08-05 · 관리자(level>=8) long-press 드래그 재정렬 (useSortableTabs · tabOrder.approvalCenter)
import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDots, SignOut } from "@phosphor-icons/react";
import { Spinner } from "../common/Spinner";
import { LeavePage } from "../LeavePage/LeavePage";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";
import { TabBar, type TabDef } from "../common/TabBar";
import { useSortableTabs } from "../../hooks/useSortableTabs";
// 2026-08-21 · Framework Phase 3 · fetch → apiClient
import { api } from "../../lib/apiClient";

const ResignationApprovalPage = React.lazy(() => import("../ResignationApprovalPage/ResignationApprovalPage"));

interface ApprovalCenterPageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  embedded?: boolean;
  /** 부모(BusinessManagePage) 서브탭 라벨 배지에 반영하기 위한 콜백 */
  onCountsChange?: (counts: { leave: number; resignation: number }) => void;
}

type ACTab = "leave" | "resignation";

const ApprovalCenterPage: React.FC<ApprovalCenterPageProps> = (props) => {
  const { onCountsChange } = props;
  const [tab, setTab] = useState<ACTab>("leave");
  const [leaveCount, setLeaveCount] = useState<number>(0);
  const [resignCount, setResignCount] = useState<number>(0);

  const loadCounts = useCallback(async () => {
    try {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient · 개별 error 흡수 유지
      const [lRes, rRes] = await Promise.all([
        api.get<{ count?: number }>("/api/leave-requests/pending-count").catch(() => null),
        api.get<{ count?: number }>("/api/resignations/pending-count").catch(() => null),
      ]);
      const lc = Number(lRes?.data?.count ?? 0);
      const rc = Number(rRes?.data?.count ?? 0);
      setLeaveCount(lc);
      setResignCount(rc);
      onCountsChange?.({ leave: lc, resignation: rc });
    } catch {
      // no-op
    }
  }, [onCountsChange]);

  // 초기 로드 · 60초 폴링 · CustomEvent 실시간
  useEffect(() => {
    loadCounts();
    const iv = setInterval(loadCounts, 60_000);
    const handler = () => loadCounts();
    window.addEventListener("approval-count-updated", handler);
    return () => {
      clearInterval(iv);
      window.removeEventListener("approval-count-updated", handler);
    };
  }, [loadCounts]);

  const TABS: TabDef<ACTab>[] = useMemo(() => [
    { key: "leave",       label: "연차승인",   icon: CalendarDots, color: "teal", badge: leaveCount  },
    { key: "resignation", label: "사직서승인", icon: SignOut,      color: "rose", badge: resignCount },
  ], [leaveCount, resignCount]);

  const isAdmin = (props.authSession?.level ?? 0) >= 8;
  const sortable = useSortableTabs<TabDef<ACTab>>("tabOrder.approvalCenter", TABS, isAdmin);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── 내부 2탭 바 · 공통 TabBar (level 2) · rose 배지 · 관리자 long-press 재정렬 ── */}
      <TabBar<ACTab>
        level={2}
        tabs={sortable.tabs}
        activeKey={tab}
        onSelect={setTab}
        badgeColor="rose"
        maxWidth={1400}
        sortable={{ getTabProps: sortable.getTabProps, isDragging: sortable.isDragging }}
      />

      {/* ── 내부 탭 컨텐츠 ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "leave" && (
          <LeavePage
            onBack={props.onBack}
            authSession={props.authSession}
            onNavigate={props.onNavigate}
            onLogout={props.onLogout}
            embedded
          />
        )}
        {tab === "resignation" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="사직서 승인 로딩 중..." size={16} tone="brand" /></div>}>
            <ResignationApprovalPage authSession={props.authSession} />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default ApprovalCenterPage;
