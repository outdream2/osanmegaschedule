// src/components/ApprovalCenterPage/ApprovalCenterPage.tsx
// 2026-10-08 · 사용자 지시 · 승인 센터 통합 대시보드 (최신 트렌드 홈 톤)
//   · 기존 2탭 (연차/사직서) TabBar 완전 제거
//   · default view = ApprovalDashboard (3-card 홈 톤 · 연차·거래처·사직서)
//   · 각 카드 "전체보기 →" → 해당 상세 뷰 전환 (내부 state)
//   · 상세 뷰 → "← 대시보드" 뒤로가기 버튼 (헤더 최상단)
//   · 부모(BusinessManagePage) 서브탭 배지는 ApprovalDashboard 가 onCountsChange 로 알림

import React, { Suspense, useCallback, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { LeavePage } from "../LeavePage/LeavePage";
import { VendorApprovalPanel } from "../RequestsPage/VendorApprovalPanel";
import { ApprovalDashboard, type ApprovalDetailView } from "./ApprovalDashboard";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";

const ResignationApprovalPage = React.lazy(() => import("../ResignationApprovalPage/ResignationApprovalPage"));

interface ApprovalCenterPageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  embedded?: boolean;
  /** 부모(BusinessManagePage) 서브탭 라벨 배지 · 2026-10-08 · vendor 포함 3-way */
  onCountsChange?: (counts: { leave: number; resignation: number; vendor?: number }) => void;
}

const ApprovalCenterPage: React.FC<ApprovalCenterPageProps> = (props) => {
  const { onCountsChange } = props;
  const [view, setView] = useState<ApprovalDetailView | null>(null);

  const handleDashboardCounts = useCallback(
    (c: { leave: number; resignation: number; vendor: number }) => {
      onCountsChange?.({ leave: c.leave, resignation: c.resignation, vendor: c.vendor });
    },
    [onCountsChange],
  );

  const goBack = () => setView(null);

  // 상세 뷰 (연차 · 거래처 · 사직서)
  if (view !== null) {
    const titleMap: Record<ApprovalDetailView, string> = {
      leave: "연차 승인",
      vendor: "거래처 승인",
      resignation: "사직서 승인",
    };
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* 뒤로가기 바 */}
        <div className="flex items-center gap-2 px-3 md:px-4 py-2 border-b border-slate-200 bg-white">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[14px] font-semibold text-slate-600 hover:text-ink hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ArrowLeft size={15} /> 대시보드
          </button>
          <span className="text-slate-300">·</span>
          <span className="text-[14px] md:text-[15px] font-semibold text-ink">{titleMap[view]}</span>
        </div>

        {/* 상세 컨텐츠 */}
        <div className="flex-1 min-h-0 flex flex-col">
          {view === "leave" && (
            <LeavePage
              onBack={props.onBack}
              authSession={props.authSession}
              onNavigate={props.onNavigate}
              onLogout={props.onLogout}
              embedded
            />
          )}
          {view === "resignation" && (
            <Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="사직서 승인 로딩 중..." size={16} tone="brand" /></div>}>
              <ResignationApprovalPage authSession={props.authSession} />
            </Suspense>
          )}
          {view === "vendor" && (
            <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-4">
              <VendorApprovalPanel />
            </div>
          )}
        </div>
      </div>
    );
  }

  // 대시보드 (default)
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <ApprovalDashboard
        onOpenDetail={setView}
        onCountsChange={handleDashboardCounts}
      />
    </div>
  );
};

export default ApprovalCenterPage;
