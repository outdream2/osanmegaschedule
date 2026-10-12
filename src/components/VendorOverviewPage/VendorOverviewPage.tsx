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
// 2026-10-12 · #13 Phase 3 · 방문예약 · slide drawer
const ReservationPage = React.lazy(() => import("../ReservationPage/ReservationPage").then(m => ({ default: m.ReservationPage })));
import { CalendarDots, X as XIcon } from "@phosphor-icons/react";

interface VendorOverviewPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

type InnerTabKey = "vendor-info" | "vendor-stock" | "order-history";

export const VendorOverviewPage: React.FC<VendorOverviewPageProps> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const [innerTab, setInnerTab] = useState<InnerTabKey>("vendor-info");
  // 2026-10-12 · #13 Phase 3 · 방문예약 slide drawer (RequestsPage drawer 공식 재사용)
  const [reservationDrawerOpen, setReservationDrawerOpen] = useState(false);

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
        <OverviewHero
          tone="emerald"
          title="거래처"
          description="탭에서 공급사 정보 · 재고확인 · 발주이력 상세 보기"
          right={
            <button
              type="button"
              onClick={() => setReservationDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold cursor-pointer transition-colors"
              title="방문예약 열기"
            >
              <CalendarDots size={14} weight="fill" />
              방문예약
            </button>
          }
        />
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

      {/* 2026-10-12 · #13 Phase 3 · 방문예약 slide drawer (RequestsPage drawer 공식 재사용) */}
      {reservationDrawerOpen && (
        <>
          <style>{`
            @keyframes vendorReservationSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
            @keyframes vendorReservationFadeIn { from { opacity: 0; } to { opacity: 1; } }
          `}</style>
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-40"
            style={{ animation: "vendorReservationFadeIn 200ms ease-out" }}
            onClick={() => setReservationDrawerOpen(false)}
            aria-hidden
          />
          <aside
            className="fixed right-0 top-0 bottom-0 w-full md:w-[720px] lg:w-[920px] bg-[#F4F7FA] z-50 shadow-[-8px_0_32px_rgba(15,23,42,0.12)] flex flex-col overflow-hidden"
            style={{ animation: "vendorReservationSlideIn 250ms ease-out" }}
            role="dialog"
            aria-modal="true"
          >
            <header className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2.5 md:px-4 md:py-3 border-b border-slate-200 bg-white">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-emerald-50 text-emerald-700 shrink-0">
                <CalendarDots size={14} weight="fill" />
              </span>
              <h2 className="text-[14px] md:text-[15px] font-semibold text-ink tracking-tight flex-1 min-w-0 truncate leading-tight">방문예약</h2>
              <button
                type="button"
                onClick={() => setReservationDrawerOpen(false)}
                className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] text-slate-500 hover:text-ink hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="닫기"
                title="닫기"
              >
                <XIcon size={14} />
              </button>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="방문예약 로딩 중..." size={16} tone="brand" /></div>}>
                <ReservationPage onBack={() => setReservationDrawerOpen(false)} authSession={authSession ?? null} />
              </Suspense>
            </div>
          </aside>
        </>
      )}
    </OperationsPageTemplate>
  );
};

export default VendorOverviewPage;
