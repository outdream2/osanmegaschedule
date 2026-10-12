// src/components/VendorOverviewPage/VendorOverviewPage.tsx
// 2026-10-12 · 사용자 지시 · 거래처 그룹 메뉴 통합 (업무요청 #6 패턴) Phase 1
//   · 상단 OverviewHero + OverviewInnerTabs (공급사 정보 · 공급사 재고확인 · 발주이력)
//   · 방문예약 · slide drawer (RequestsPage drawer 공식 재사용 · 다음 Phase)
//   · 각 탭 content · 기존 페이지 embedded render (다음 Phase)
//
// Phase 1 (현재): Hero + 탭 구조 skeleton + placeholder content
// Phase 2 (다음): 각 탭에 기존 페이지 embedded render
// Phase 3: 방문예약 slide drawer
// Phase 4: 사이드바 거래처 그룹 통합 (4개 메뉴 → 단일 "거래처")
import React, { Suspense, useState } from "react";
import { OperationsPageTemplate } from "../common/OperationsPageTemplate";
import { OverviewHero, OverviewInnerTabs, type OverviewInnerTab } from "../DisplayPage/overviews/OverviewHeader";
import { Spinner } from "../common/Spinner";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";
// 2026-10-12 · #13 Phase 2 · 각 탭 content · 기존 페이지 embedded render (self-contained)
const VendorManageSplit = React.lazy(() => import("../DisplayPage/VendorManageSplit").then(m => ({ default: m.VendorManageSplit })));
const VendorStockPage = React.lazy(() => import("../LandingPage/VendorStockPage").then(m => ({ default: m.VendorStockPage })));
const VendorOrderHistoryPage = React.lazy(() => import("../LandingPage/VendorOrderHistoryPage").then(m => ({ default: m.VendorOrderHistoryPage })));

interface VendorOverviewPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

type InnerTabKey = "vendor-info" | "vendor-stock" | "order-history";

export const VendorOverviewPage: React.FC<VendorOverviewPageProps> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const [innerTab, setInnerTab] = useState<InnerTabKey>("vendor-info");

  const tabs: ReadonlyArray<OverviewInnerTab<InnerTabKey>> = [
    { k: "vendor-info",   label: "공급사 정보",     tone: "emerald", count: null },
    { k: "vendor-stock",  label: "공급사 재고확인", tone: "sky",     count: null },
    { k: "order-history", label: "발주이력",        tone: "violet",  count: null },
  ];

  return (
    <OperationsPageTemplate
      title="거래처"
      description="공급사 정보 · 재고확인 · 발주이력 (방문예약은 slide drawer)"
    >
      <div className="flex flex-col gap-3 md:gap-4 min-h-0 pb-6 bg-[#F4F7FA]">
        {/* 2026-10-12 · 사용자 지시 · "거래처는 현황판이 없는데" · title "거래처 현황" → "거래처" (overview 집계 성격 아님) ·
            각 탭 = 기존 페이지 상세 그대로 (탭 메뉴 상세 이동 패턴) */}
        <OverviewHero tone="emerald" title="거래처" description="탭에서 공급사 정보 · 재고확인 · 발주이력 상세 보기" />
        <OverviewInnerTabs<InnerTabKey>
          ariaLabel="거래처 inner tabs"
          active={innerTab}
          onChange={setInnerTab}
          tabs={tabs}
        />
        {/* 2026-10-12 · #13 Phase 2 · 각 탭 content · 기존 페이지 embedded render */}
        <div className="px-4 sm:px-6 pt-3 flex-1 min-h-0 flex flex-col">
          <Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="로딩 중..." size={16} tone="brand" /></div>}>
            {innerTab === "vendor-info" && <VendorManageSplit />}
            {innerTab === "vendor-stock" && (
              <VendorStockPage onBack={onBack} authSession={authSession ?? null} onNavigate={onNavigate} onLogout={onLogout} vendorName={authSession?.employeeName ?? ""} />
            )}
            {innerTab === "order-history" && (
              <VendorOrderHistoryPage onBack={onBack} authSession={authSession ?? null} onNavigate={onNavigate} onLogout={onLogout} />
            )}
          </Suspense>
        </div>
      </div>
    </OperationsPageTemplate>
  );
};

export default VendorOverviewPage;
