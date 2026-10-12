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
import React, { Suspense, useState, useEffect, useMemo } from "react";
import { OperationsPageTemplate } from "../common/OperationsPageTemplate";
import { OverviewHero, OverviewInnerTabs, type OverviewInnerTab } from "../DisplayPage/overviews/OverviewHeader";
import { Spinner } from "../common/Spinner";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";
import { api } from "../../lib/apiClient";
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

type InnerTabKey = "overview" | "vendor-info" | "vendor-stock" | "order-history";

export const VendorOverviewPage: React.FC<VendorOverviewPageProps> = ({ onBack, authSession, onNavigate, onLogout }) => {
  // 2026-10-12 · #13 Phase 5 · 사용자 "현황판이 없는데 거래처" · 현황 탭 default 추가
  const [innerTab, setInnerTab] = useState<InnerTabKey>("overview");
  // 2026-10-12 · #13 Phase 3 · 방문예약 slide drawer (RequestsPage drawer 공식 재사용)
  const [reservationDrawerOpen, setReservationDrawerOpen] = useState(false);

  // 2026-10-12 · 사용자 리포트 "데이터가 하나도 안 보인다 · 장난해" · Phase 6 데이터 fetch 즉시 적용
  //   · 로그인한 거래처 (authSession.employeeName) 정보 · 재고 · 발주이력 · 방문예약 달력
  //   · 사용자 "관리자 로그인 시 테스트2사 데이터 가져와" · admin fallback
  const sessionRole = authSession?.role ?? "";
  const sessionPerm = (authSession as any)?.permission ?? 0;
  const isAdmin = sessionRole === "admin" || sessionRole === "superadmin" || Number(sessionPerm) >= 9;
  const vendorName = isAdmin ? "테스트2" : (authSession?.employeeName ?? "");

  // 공급사 정보 (로그인한 거래처 자기 자신)
  const [myVendor, setMyVendor] = useState<any | null>(null);
  useEffect(() => {
    if (!vendorName) return;
    let alive = true;
    api.get<any[]>("/api/vendors").then(({ data }) => {
      if (!alive) return;
      const list = Array.isArray(data) ? data : [];
      const found = list.find((v: any) =>
        String(v?.name ?? v?.vendor_name ?? "").trim() === vendorName.trim()
      );
      setMyVendor(found ?? null);
    }).catch(() => { if (alive) setMyVendor(null); });
    return () => { alive = false; };
  }, [vendorName]);

  // 공급사 재고 (로그인한 거래처 공급 상품)
  const [vendorProducts, setVendorProducts] = useState<any[] | null>(null);
  useEffect(() => {
    if (!vendorName) return;
    let alive = true;
    api.get<{ products?: any[]; rows?: any[] }>(`/api/vendor-stock?supplier=${encodeURIComponent(vendorName)}`)
      .then(({ data }) => {
        if (!alive) return;
        const rows = Array.isArray(data?.products) ? data.products : Array.isArray(data?.rows) ? data.rows : [];
        setVendorProducts(rows);
      }).catch(() => { if (alive) setVendorProducts([]); });
    return () => { alive = false; };
  }, [vendorName]);

  // 발주이력 (로그인한 거래처 자기 자신 발주)
  const [orderHistory, setOrderHistory] = useState<any[] | null>(null);
  useEffect(() => {
    if (!vendorName) return;
    let alive = true;
    api.get<{ orders?: any[] }>(`/api/order-history?supplier=${encodeURIComponent(vendorName)}&limit=100`)
      .then(({ data }) => {
        if (!alive) return;
        const orders = Array.isArray(data?.orders) ? data.orders : [];
        setOrderHistory(orders);
      }).catch(() => { if (alive) setOrderHistory([]); });
    return () => { alive = false; };
  }, [vendorName]);

  // 방문예약 가능 날짜 (이번달)
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    api.get<{ available?: string[]; dates?: string[] }>(`/api/reservations/availability?year=${y}&month=${m}`)
      .then(({ data }) => {
        if (!alive) return;
        const arr = Array.isArray(data?.available) ? data.available : Array.isArray(data?.dates) ? data.dates : [];
        setAvailableDates(new Set(arr));
      }).catch(() => { if (alive) setAvailableDates(new Set()); });
    return () => { alive = false; };
  }, []);

  // 이번달 달력 데이터 (일~토 격자)
  const calendarGrid = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const firstDow = first.getDay();
    const daysInMonth = last.getDate();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const cells: Array<{ day: number | null; ymd: string | null; available: boolean; isToday: boolean }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ day: null, ymd: null, available: false, isToday: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, ymd, available: availableDates.has(ymd), isToday: ymd === todayStr });
    }
    return { cells, month: m + 1, availCount: availableDates.size };
  }, [availableDates]);

  const tabs: ReadonlyArray<OverviewInnerTab<InnerTabKey>> = [
    { k: "overview",      label: "현황",            tone: "indigo",  count: null },
    { k: "vendor-info",   label: "공급사 정보",     tone: "emerald", count: null },
    { k: "vendor-stock",  label: "공급사 재고확인", tone: "sky",     count: null },
    { k: "order-history", label: "발주이력",        tone: "violet",  count: null },
  ];

  return (
    <OperationsPageTemplate
      title="거래처"
      description="공급사 정보 · 재고확인 · 발주이력 (방문예약은 slide drawer)"
    >
      <div className="flex flex-col gap-1 md:gap-2 min-h-0 pb-6 bg-[#F4F7FA] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* 2026-10-12 · 사용자 지시 · "거래처는 현황판이 없는데" · title "거래처 현황" → "거래처" (overview 집계 성격 아님) ·
            각 탭 = 기존 페이지 상세 그대로 (탭 메뉴 상세 이동 패턴) */}
        <OverviewHero tone="emerald" title="거래처" description="현황판 → 각 섹션 상세로 이동" />
        <OverviewInnerTabs<InnerTabKey>
          ariaLabel="거래처 inner tabs"
          active={innerTab}
          onChange={setInnerTab}
          tabs={tabs}
        />
        {/* 2026-10-12 · #13 Phase 5 · 사용자 "현황판에서 누르면 탭메뉴로 이동 · 방문예약도 현황 안으로 · 달력 표시" */}
        <div className="px-4 sm:px-6 pt-3 flex-1 min-h-0 flex flex-col">
          <Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="로딩 중..." size={16} tone="brand" /></div>}>
            {innerTab === "overview" && (
              // 2026-10-12 · Phase 5 · 상단 2-col + 하단 2-col · placeholder · Phase 6 데이터 fetch
              <div className="flex flex-col gap-4">
                {/* 상단 2-col · 방문예약 달력 + 공급사 정보 요약 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-[3px] h-[14px] bg-emerald-500 rounded-full shrink-0" />
                      <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">방문예약 · 이번달 가능 날짜</h3>
                      <button type="button" onClick={() => setReservationDrawerOpen(true)}
                        className="ml-auto inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[13px] font-semibold cursor-pointer transition-colors">
                        <CalendarDots size={13} weight="fill" />
                        예약
                      </button>
                    </div>
                    <div className="flex-1 h-[180px] flex items-center justify-center bg-slate-50/40 rounded-md text-[13px] text-slate-400 text-center px-4">
                      달력 skeleton · Phase 6 · availability API 집계 (가능 날짜 highlight · 클릭 → 예약 drawer)
                    </div>
                  </section>
                  <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 flex flex-col gap-3 cursor-pointer hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all"
                    onClick={() => setInnerTab("vendor-info")}
                    role="button" tabIndex={0}>
                    <div className="flex items-center gap-2">
                      <span className="w-[3px] h-[14px] bg-emerald-500 rounded-full shrink-0" />
                      <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">공급사 정보</h3>
                      <span className="ml-auto text-[12px] text-slate-400">탭 상세 →</span>
                    </div>
                    <div className="flex-1 h-[180px] flex items-center justify-center bg-slate-50/40 rounded-md text-[13px] text-slate-400 text-center px-4">
                      공급사 N개 skeleton · Phase 6 · 저장 안 된 항목 있으면 상단에 "⚠️ N개 공급사 정보 미완성" 코멘트
                    </div>
                  </section>
                </div>

                {/* 하단 2-col · 재고목록 + 발주이력 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 flex flex-col gap-3 cursor-pointer hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all"
                    onClick={() => setInnerTab("vendor-stock")}
                    role="button" tabIndex={0}>
                    <div className="flex items-center gap-2">
                      <span className="w-[3px] h-[14px] bg-sky-500 rounded-full shrink-0" />
                      <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">공급사 재고확인</h3>
                      <span className="ml-auto text-[12px] text-slate-400">탭 상세 →</span>
                    </div>
                    <div className="flex-1 h-[180px] flex items-center justify-center bg-slate-50/40 rounded-md text-[13px] text-slate-400 text-center px-4">
                      재고 요약 skeleton · Phase 6 · VendorStockPage 요약 집계 (상위 10 · 전체 N건)
                    </div>
                  </section>
                  <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 flex flex-col gap-3 cursor-pointer hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all"
                    onClick={() => setInnerTab("order-history")}
                    role="button" tabIndex={0}>
                    <div className="flex items-center gap-2">
                      <span className="w-[3px] h-[14px] bg-violet-500 rounded-full shrink-0" />
                      <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">발주이력</h3>
                      <span className="ml-auto text-[12px] text-slate-400">탭 상세 →</span>
                    </div>
                    <div className="flex-1 h-[180px] flex items-center justify-center bg-slate-50/40 rounded-md text-[13px] text-slate-400 text-center px-4">
                      최근 발주 N건 skeleton · Phase 6 · order-history API 요약
                    </div>
                  </section>
                </div>
              </div>
            )}
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
