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
import { OverviewHero, OverviewInnerTabs, type OverviewInnerTab } from "../DisplayPage/overviews/OverviewHeader";
import { Spinner } from "../common/Spinner";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";
import { api } from "../../lib/apiClient";
// 2026-10-12 · #13 Phase 6 · 공급사 Supabase + ERP 둘 다 fetch · ERP 아닌 것 marker
import { useVendors, type Vendor } from "../../hooks/useVendors";
// 2026-10-12 · #13 Phase 2 · 각 탭 content · 기존 페이지 embedded render (self-contained)
const VendorManageSplit = React.lazy(() => import("../DisplayPage/VendorManageSplit").then(m => ({ default: m.VendorManageSplit })));
// 2026-10-12 · 사용자 지시 "공급사 클릭 slide drawer 는 공급사 정보 상세여야 · 목록 X" · 단일 공급사 상세 panel
const VendorDetailModalLazy = React.lazy(() => import("../LandingPage/VendorListEditor").then(m => ({ default: m.VendorDetailModal })));
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

  // 2026-10-12 · #13 Phase 6 · 공급사 Supabase vendors fetch (useVendors 캐시) · ERP 여부 ct_code 로 판정
  const { vendors } = useVendors();
  const vendorStats = useMemo(() => {
    const list = vendors as Vendor[];
    const total = list.length;
    const erpCount = list.filter(v => (v as any).ct_code).length;
    const nonErpCount = total - erpCount;
    const pendingApproval = list.filter(v => (v as any).approval_status && (v as any).approval_status !== "approved").length;
    const incomplete = list.filter(v =>
      !v.contact_name || !v.phone || !(v as any).business_number
    ).length;
    return { total, erpCount, nonErpCount, pendingApproval, incomplete };
  }, [vendors]);
  // 2026-10-12 · #13 Phase 3 · 방문예약 slide drawer (RequestsPage drawer 공식 재사용)
  const [reservationDrawerOpen, setReservationDrawerOpen] = useState(false);
  // 2026-10-12 · 사용자 지시 · 공급사 정보 클릭 → slide drawer (현황판에서 바로 수정)
  const [vendorInfoDrawerOpen, setVendorInfoDrawerOpen] = useState(false);

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
      // 2026-10-12 · fix · 실제 field 는 company_name (useVendors Vendor interface) · name/vendor_name 은 fallback
      const found = list.find((v: any) =>
        String(v?.company_name ?? v?.name ?? v?.vendor_name ?? "").trim() === vendorName.trim()
      );
      setMyVendor(found ?? null);
    }).catch(() => { if (alive) setMyVendor(null); });
    return () => { alive = false; };
  }, [vendorName]);

  // 공급사 재고 (로그인한 거래처 공급 상품)
  // 2026-10-12 · fix · `/api/vendor-stock` endpoint 존재 X → `/api/products-search?supplier=` 사용 (VendorStockPage 패턴)
  const [vendorProducts, setVendorProducts] = useState<any[] | null>(null);
  useEffect(() => {
    if (!vendorName) return;
    let alive = true;
    api.get<any>(`/api/products-search?supplier=${encodeURIComponent(vendorName)}&limit=1000`)
      .then(({ data }) => {
        if (!alive) return;
        const rows = Array.isArray(data?.products) ? data.products
          : Array.isArray(data?.rows) ? data.rows
          : Array.isArray(data) ? data : [];
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

  // 2026-10-12 · 사용자 "위의 큰 제목과 하얀 배경 현재 UI톤과 안맞잖아"
  //   · OperationsPageTemplate (큰 제목 + 하얀 배경) 폐기 · 홈 랜딩 톤 통일 (매장 overview 공식)
  return (
    <>
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
              // 2026-10-12 · Phase 6 · 상단 공급사 KPI 라인 (관리자 뷰) + 2-col 섹션들
              <div className="flex flex-col gap-4">
                {/* 2026-10-12 · #13 Phase 6 Step 2 · 공급사 전체 집계 KPI 라인 (관리자만)
                    Supabase vendors fetch (useVendors 캐시) · ERP marker (ct_code 유무) · 승인/저장 미완성 marker */}
                {isAdmin && vendorStats.total > 0 && (
                  <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-2.5 md:px-5 md:py-3 flex items-center gap-x-4 gap-y-1 flex-wrap leading-tight">
                    <div className="flex items-center gap-1.5">
                      <span className="w-[3px] h-[14px] bg-emerald-500 rounded-full shrink-0" />
                      <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">공급사</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[14px] text-slate-500 font-medium">전체</span>
                      <span className="text-[16px] font-bold tabular-nums text-ink">{vendorStats.total}</span>
                    </div>
                    <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[14px] text-slate-500 font-medium">ERP</span>
                      <span className="text-[16px] font-bold tabular-nums text-emerald-700">{vendorStats.erpCount}</span>
                    </div>
                    {vendorStats.nonErpCount > 0 && (
                      <>
                        <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
                        <div className="flex items-baseline gap-1" title="Supabase 에만 있고 ERP 에 없는 공급사">
                          <span className="text-[14px] text-amber-700 font-semibold">ERP 외</span>
                          <span className="text-[16px] font-bold tabular-nums text-amber-700">{vendorStats.nonErpCount}</span>
                        </div>
                      </>
                    )}
                    {vendorStats.pendingApproval > 0 && (
                      <>
                        <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
                        <div className="flex items-baseline gap-1" title="승인 요청하라">
                          <span className="text-[14px] text-rose-700 font-semibold">⚠ 승인 대기</span>
                          <span className="text-[16px] font-bold tabular-nums text-rose-700">{vendorStats.pendingApproval}</span>
                        </div>
                      </>
                    )}
                    {vendorStats.incomplete > 0 && (
                      <>
                        <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
                        <div className="flex items-baseline gap-1" title="연락처 / 사업자번호 미완성">
                          <span className="text-[14px] text-rose-600 font-medium">⚠ 미완성</span>
                          <span className="text-[16px] font-bold tabular-nums text-rose-600">{vendorStats.incomplete}</span>
                        </div>
                      </>
                    )}
                  </section>
                )}
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
                    {/* 2026-10-12 · 실제 달력 render · 가능 날짜 highlight (emerald bg) · 오늘 ring */}
                    <div className="flex-1">
                      <div className="text-[12px] text-slate-500 font-medium mb-1">
                        {calendarGrid.month}월 · 가능 날짜 <b className="text-emerald-700 tabular-nums">{calendarGrid.availCount}</b>건
                      </div>
                      <div className="grid grid-cols-7 gap-0.5">
                        {["일","월","화","수","목","금","토"].map(d => (
                          <div key={d} className="text-center text-[11px] text-slate-400 font-semibold py-1">{d}</div>
                        ))}
                        {calendarGrid.cells.map((c, i) => (
                          <button key={i} type="button"
                            disabled={!c.available}
                            onClick={() => c.available && setReservationDrawerOpen(true)}
                            className={`h-8 text-[12px] font-semibold tabular-nums rounded-md transition-colors ${
                              c.day === null ? "" :
                              c.available ? `bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer ${c.isToday ? "ring-2 ring-emerald-400" : ""}` :
                              `text-slate-300 ${c.isToday ? "ring-1 ring-slate-300" : ""}`
                            }`}
                          >
                            {c.day ?? ""}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                  {/* 공급사 정보 · 로그인 거래처 자기 자신 */}
                  <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 flex flex-col gap-3 cursor-pointer hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all"
                    onClick={() => {
                      // 2026-10-12 · 사용자 지시 "승인받은 사람만 볼 수 있게" · approval_status === "approved" 또는 admin 만 drawer 접근
                      if (myVendor?.approval_status === "approved" || isAdmin) {
                        setVendorInfoDrawerOpen(true);
                      }
                    }}
                    role="button" tabIndex={0}>
                    {/* 2026-10-12 · 사용자 지시 · 공급사 정보 UI 교체 · 2-section 레이아웃
                        · 상단 · "내 정보" compact header (공급사명 + ERP 뱃지 + 핵심 연락처 1-line)
                        · 하단 · field grid 2x3 (담당자/연락처/이메일/사업자번호/주소/계좌) · 미완성 field 빨강 라벨 */}
                    <div className="flex items-center gap-2">
                      <span className="w-[3px] h-[14px] bg-emerald-500 rounded-full shrink-0" />
                      <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">공급사 정보</h3>
                      {isAdmin && <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-semibold">관리자 · 테스트2</span>}
                      <span className="ml-auto text-[12px] text-slate-400">
                        {myVendor?.approval_status === "approved" || isAdmin ? "수정 →" : "승인 대기"}
                      </span>
                    </div>
                    <div className="flex-1">
                      {myVendor === null ? (
                        <div className="h-[160px] flex items-center justify-center text-[13px] text-slate-400">
                          {vendorName ? `"${vendorName}" 공급사 정보 없음` : "로그인 정보 없음"}
                        </div>
                      ) : (() => {
                        const name = myVendor.company_name ?? myVendor.name ?? myVendor.vendor_name ?? "-";
                        const manager = myVendor.contact_name ?? myVendor.manager ?? "";
                        const phone = myVendor.phone ?? myVendor.contact_phone ?? "";
                        const email = myVendor.email ?? "";
                        const teamLeadName = myVendor.team_lead_name ?? myVendor.manager_name ?? "";
                        const teamLeadPhone = myVendor.team_lead_phone ?? myVendor.manager_phone ?? "";
                        const teamLeadEmail = myVendor.team_lead_email ?? myVendor.manager_email ?? "";
                        const emergencyContact = myVendor.emergency_contact ?? myVendor.urgent_phone ?? "";
                        const specialNotes = myVendor.special_notes ?? myVendor.note ?? myVendor.memo ?? "";
                        const bizNum = myVendor.business_number ?? "";
                        const address = myVendor.address ?? "";
                        const isErp = !!myVendor.ct_code;
                        const approvalStatus = String(myVendor.approval_status ?? "");
                        // 2026-10-12 · 사용자 지시 · 담당자/팀장/긴급연락처/비고 field 추가
                        const Row: React.FC<{ label: string; value: string; warn?: boolean; mono?: boolean }> = ({ label, value, warn, mono }) => (
                          <div className="min-w-0 flex items-baseline gap-2 py-1 border-b border-slate-50 last:border-b-0">
                            <div className={`shrink-0 w-24 text-[12px] font-medium ${warn && !value ? "text-rose-500" : "text-slate-500"}`}>
                              {label}{warn && !value ? " ⚠" : ""}
                            </div>
                            <div className={`flex-1 min-w-0 text-[13.5px] font-semibold ${mono ? "tabular-nums" : ""} truncate ${value ? "text-ink" : "text-slate-300"}`} title={value || "-"}>
                              {value || "-"}
                            </div>
                          </div>
                        );
                        return (
                          <div className="flex flex-col gap-2.5">
                            {/* 상단 header · 상호 + ERP + 승인 뱃지 */}
                            <div className="flex items-start gap-2 pb-2 border-b border-slate-100">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[16px] md:text-[17px] font-bold text-ink truncate" title={name}>{name}</span>
                                  <span className={`shrink-0 inline-flex items-center h-[18px] px-1.5 rounded-sm text-[10px] font-bold tracking-wide ${
                                    isErp ? "bg-sky-50 text-sky-700 border border-sky-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                                  }`}>
                                    {isErp ? "ERP 연동" : "ERP 외"}
                                  </span>
                                  <span className={`shrink-0 inline-flex items-center h-[18px] px-1.5 rounded-sm text-[10px] font-bold tracking-wide ${
                                    approvalStatus === "approved"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-rose-50 text-rose-700 border border-rose-200"
                                  }`}>
                                    {approvalStatus === "approved" ? "승인됨" : "승인 대기"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {/* 세부 field · row list (사용자 지시 · 담당자/팀장/긴급연락처/비고 전부) */}
                            <div className="max-h-[260px] overflow-y-auto">
                              <Row label="담당자" value={manager} warn />
                              <Row label="담당자 전화" value={phone} warn mono />
                              <Row label="담당자 이메일" value={email} />
                              <Row label="팀장" value={teamLeadName} />
                              <Row label="팀장 전화" value={teamLeadPhone} mono />
                              <Row label="팀장 이메일" value={teamLeadEmail} />
                              <Row label="긴급연락처" value={emergencyContact} mono />
                              <Row label="사업자번호" value={bizNum} warn mono />
                              <Row label="주소" value={address} />
                              <Row label="비고" value={specialNotes} />
                            </div>
                          </div>
                        );
                      })()}
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
                      {vendorProducts && <span className="text-[12px] text-slate-500 tabular-nums">· {vendorProducts.length}건</span>}
                      <span className="ml-auto text-[12px] text-slate-400">탭 상세 →</span>
                    </div>
                    {/* 2026-10-12 · 공급사 공급 상품 상위 10 */}
                    <div className="flex-1 min-h-0 overflow-y-auto max-h-[220px]">
                      {vendorProducts === null ? (
                        <div className="h-[180px] flex items-center justify-center text-[13px] text-slate-400">조회 중...</div>
                      ) : vendorProducts.length === 0 ? (
                        <div className="h-[180px] flex items-center justify-center text-[13px] text-slate-400">공급 상품 없음</div>
                      ) : (
                        <ul className="divide-y divide-slate-100">
                          {vendorProducts.slice(0, 10).map((p: any, i: number) => (
                            <li key={p.product_code ?? i} className="flex items-center gap-2 py-1.5 text-[13px]">
                              <span className="text-[11px] text-slate-400 tabular-nums w-5 text-right">{i + 1}</span>
                              <span className="flex-1 min-w-0 truncate text-ink font-medium" title={p.product_name ?? p.name ?? "-"}>{p.product_name ?? p.name ?? "-"}</span>
                              <span className="shrink-0 text-slate-500 tabular-nums text-[12px]">현 <b className="text-ink">{Number(p.current_stock ?? 0).toLocaleString()}</b></span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                  <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 flex flex-col gap-3 cursor-pointer hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all"
                    onClick={() => setInnerTab("order-history")}
                    role="button" tabIndex={0}>
                    <div className="flex items-center gap-2">
                      <span className="w-[3px] h-[14px] bg-violet-500 rounded-full shrink-0" />
                      <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">발주이력</h3>
                      {orderHistory && <span className="text-[12px] text-slate-500 tabular-nums">· {orderHistory.length}건</span>}
                      <span className="ml-auto text-[12px] text-slate-400">탭 상세 →</span>
                    </div>
                    {/* 2026-10-12 · 최근 발주 10건 */}
                    <div className="flex-1 min-h-0 overflow-y-auto max-h-[220px]">
                      {orderHistory === null ? (
                        <div className="h-[180px] flex items-center justify-center text-[13px] text-slate-400">조회 중...</div>
                      ) : orderHistory.length === 0 ? (
                        <div className="h-[180px] flex items-center justify-center text-[13px] text-slate-400">발주이력 없음</div>
                      ) : (
                        <table className="w-full text-[12.5px]">
                          <thead className="text-left text-[11px] text-slate-500 font-semibold border-b border-slate-200">
                            <tr>
                              <th className="py-1.5 pr-2 whitespace-nowrap">발주일</th>
                              <th className="py-1.5 pr-2 whitespace-nowrap">발주번호</th>
                              <th className="py-1.5 px-2">상품</th>
                              <th className="py-1.5 px-2 text-right w-14">품목</th>
                              <th className="py-1.5 px-2 text-right w-16">수량</th>
                              <th className="py-1.5 px-2 text-right w-20">금액</th>
                              <th className="py-1.5 pl-2 text-center w-14">상태</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {orderHistory.slice(0, 10).map((o: any, i: number) => {
                              // 2026-10-12 · 사용자 지시 · 발주이력 column 자세히 · /api/order-history 응답 shape 참조
                              //   · order_number (발주서) · order_date / sent_at · items[] + product_names (grouped shape)
                              const items = Array.isArray(o.items) ? o.items : [];
                              const itemCount = items.length || Number(o.item_count ?? 0) || (o.product_name ? 1 : 0);
                              const totalQty = items.length > 0
                                ? items.reduce((s: number, it: any) => s + Number(it.order_qty ?? 0), 0)
                                : Number(o.order_qty ?? 0);
                              const totalAmount = Number(o.total_amount ?? o.amount ?? 0) || items.reduce((s: number, it: any) => s + (Number(it.order_qty ?? 0) * Number(it.unit_price ?? 0)), 0);
                              const productLabel = Array.isArray(o.product_names) && o.product_names.length > 0
                                ? (o.product_names.length === 1 ? String(o.product_names[0]) : `${o.product_names[0]} 외 ${o.product_names.length - 1}`)
                                : (o.product_name ?? "-");
                              const statusLabel = o.status === "ordered" ? "발주" : o.status === "matched" ? "매입" : o.status === "cancelled" ? "취소" : "기타";
                              const statusCls = o.status === "matched" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                : o.status === "ordered" ? "text-indigo-700 bg-indigo-50 border-indigo-200"
                                : "text-slate-500 bg-slate-50 border-slate-200";
                              return (
                                <tr key={o.order_number ?? o.order_id ?? o.id ?? i} className="hover:bg-slate-50/40">
                                  <td className="py-1.5 pr-2 text-slate-500 tabular-nums whitespace-nowrap">{String(o.order_date ?? o.sent_at ?? o.created_at ?? "").slice(0, 10)}</td>
                                  <td className="py-1.5 pr-2 text-slate-400 tabular-nums text-[11px] truncate max-w-[90px]" title={o.order_number ?? "-"}>{o.order_number ?? "-"}</td>
                                  <td className="py-1.5 px-2 text-ink font-medium truncate max-w-[180px]" title={productLabel}>{productLabel}</td>
                                  <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{itemCount}</td>
                                  <td className="py-1.5 px-2 text-right text-ink tabular-nums">{totalQty.toLocaleString()}</td>
                                  <td className="py-1.5 px-2 text-right text-ink tabular-nums font-semibold">{totalAmount > 0 ? totalAmount.toLocaleString() : "-"}</td>
                                  <td className="py-1.5 pl-2 text-center">
                                    <span className={`inline-flex items-center justify-center min-w-[38px] h-5 px-1 rounded border text-[10px] font-semibold ${statusCls}`}>{statusLabel}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
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

      {/* 2026-10-12 · 사용자 지시 · 공급사 정보 클릭 → slide drawer (수정 UI · VendorManageSplit embedded) */}
      {vendorInfoDrawerOpen && (
        <>
          <style>{`
            @keyframes vendorInfoSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
            @keyframes vendorInfoFadeIn { from { opacity: 0; } to { opacity: 1; } }
          `}</style>
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-40"
            style={{ animation: "vendorInfoFadeIn 200ms ease-out" }}
            onClick={() => setVendorInfoDrawerOpen(false)}
            aria-hidden
          />
          <aside
            className="fixed right-0 top-0 bottom-0 w-full md:w-[920px] lg:w-[1200px] bg-[#F4F7FA] z-50 shadow-[-8px_0_32px_rgba(15,23,42,0.12)] flex flex-col overflow-hidden"
            style={{ animation: "vendorInfoSlideIn 250ms ease-out" }}
            role="dialog"
            aria-modal="true"
            aria-label="공급사 정보 수정"
          >
            <header className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2.5 md:px-4 md:py-3 border-b border-slate-200 bg-white">
              <span className="w-[3px] h-[14px] bg-emerald-500 rounded-full shrink-0" aria-hidden />
              <h2 className="text-[14px] md:text-[15px] font-semibold text-ink tracking-tight flex-1 min-w-0 truncate leading-tight">공급사 정보 수정</h2>
              <button
                type="button"
                onClick={() => setVendorInfoDrawerOpen(false)}
                className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] text-slate-500 hover:text-ink hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="닫기"
                title="닫기"
              >
                <XIcon size={14} />
              </button>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="공급사 정보 로딩 중..." size={16} tone="brand" /></div>}>
                {/* 2026-10-12 · 사용자 지시 "공급사 정보가 나와야지 목록이 아니고" · myVendor 단일 상세 panel · 목록 제거 */}
                {myVendor ? (
                  <VendorDetailModalLazy vendor={myVendor as any} onClose={() => setVendorInfoDrawerOpen(false)} onSaved={() => { /* refresh 는 상위 fetch · noop */ }} panel />
                ) : (
                  <div className="flex-1 flex items-center justify-center py-16 text-[14px] text-slate-500">공급사 정보가 없습니다</div>
                )}
              </Suspense>
            </div>
          </aside>
        </>
      )}
    </>
  );
};

export default VendorOverviewPage;
