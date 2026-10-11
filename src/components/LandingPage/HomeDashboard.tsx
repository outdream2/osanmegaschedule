// 2026-10-07 · FINAL VISUAL SPEC (사용자 제공) · STRICT PRESENTATION ONLY
//   · BEHAVIOR DELTA = 0 · 기존 API/handler/state/route/permission 유지
//   · 금지: hero image · gradient card · nested card · sparkline · donut · fake data
//   · 금지: Greeting 32+ · KPI 30+ · Sales amount 30+
//   · 레이아웃: Greeting → KPI 4 → (Sales 9 | Tasks 3) → Quick Actions → (Today Sales 8 | Alerts 4)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package, Scan, Calendar, MessageSquare, PlusCircle, CalendarPlus, History,
  ChevronRight,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend, ComposedChart, Line } from "recharts";
import { api } from "../../lib/apiClient";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";
import { StockArrivalList } from "./StockArrivalList";
// 2026-10-10 · 사용자 지시 · 입고알림페이지 홈 랜딩에서 클릭 → 오른쪽 slide-in drawer · StockArrivalPage lazy embed
import { X as XIcon } from "lucide-react";
const StockArrivalPageLazy = React.lazy(() => import("../StockArrivalPage/StockArrivalPage").then(m => ({ default: m.StockArrivalPage })));
// 2026-10-08 · 사용자 지시 · 판매현황 상품 클릭 → 상품정보 모달
import { ProductInfoModal } from "../DisplayPage/ProductInfoModal";
import type { ProductInfo } from "../../lib/productsCache";

// ─────────────────────────────────────────────────────────────
// Typography scale (STRICT per spec)
// ─────────────────────────────────────────────────────────────
// 2026-10-08 · 사용자 지시 · 전체 폰트 리밸런싱 (v3) · 2-tier 통일
//   · tier A (data/body/section/button): 15/16  — 모든 표시 데이터·버튼·섹션 제목
//   · tier B (label/meta/aux):            14/15  — 보조 라벨·메타정보
//   · hero 숫자 (salesAmount): clamp(17, 1.4vw, 19)  — 유일한 "큰 숫자"
//   · hero greeting title: 15/17 (조금만 더 큼 · 지배적 X)
const T = {
  eyebrow:      "text-[14px] md:text-[15px] text-slate-500 font-medium",
  heroTitle:    "text-[15px] md:text-[17px] font-bold text-ink leading-[1.25] tracking-tight",
  heroDesc:     "text-[14px] md:text-[15px] text-slate-500",
  sectionTitle: "text-[15px] md:text-[16px] font-semibold text-ink tracking-tight",
  kpiLabel:     "text-[14px] md:text-[15px] text-slate-500 font-medium",
  kpiValue:     { fontSize: "clamp(15px, 1.3vw, 17px)" } as React.CSSProperties,
  salesAmount:  { fontSize: "clamp(17px, 1.4vw, 19px)" } as React.CSSProperties,
  taskLabel:    "text-[15px] md:text-[16px] text-ink font-medium",
  taskCount:    "text-[15px] md:text-[16px] font-semibold tabular-nums",
  tableHeader:  "text-[14px] md:text-[15px] text-slate-500 font-medium",
  tableBody:    "text-[15px] md:text-[16px] text-ink",
  qaLabel:      "text-[15px] md:text-[16px] text-ink font-medium",
  meta:         "text-[14px] md:text-[15px] text-slate-500",
} as const;

const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

interface HourlyRow { SaleDate: string; SaleTime: string; CustomerCnt: number; SaleTotal: number; }
interface HourlyApiResponse { ok: boolean; schemaMismatch?: boolean; rows?: HourlyRow[]; error?: string; }

interface DaySaleProductItem {
  pcode: string | null; productName: string | null;
  unitSale: number | null; totalStock: number | null;
  saleTotal: number | null; margin: number | null;
}
interface DayProductApiResponse {
  ok: boolean; items?: DaySaleProductItem[]; error?: string;
}

export interface HomeDashboardProps {
  authSession: AuthSession;
  leavePendingCount: number;
  requestsCounts: {
    display: number; order: number; lunch: number; inventory: number;
    return: number; resignation: number; vendor: number;
  };
  paymentPendingCount: number;
  isAdmin: boolean;
  isManagerOrAdmin: boolean;
  onNavigate: (page: Exclude<AppNavPage, "landing">, auth?: AuthSession) => void;
  setActiveByPage: (page: AppNavPage, subTab: string | null) => void;
}

const fmtWon = (n: number): string => `${Math.round(n).toLocaleString("ko-KR")}원`;
// 2026-10-09 · 사용자 지시 · 예상 월매출액 "12.34억원" 포맷
const fmtEok = (n: number): string => `${(n / 1e8).toFixed(2)}억원`;
const todayYmd = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const parseHour = (t: string): number => {
  const n = Number(String(t).padStart(2, "0").slice(0, 2));
  return Number.isFinite(n) ? n : 0;
};

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  authSession, leavePendingCount, requestsCounts, paymentPendingCount,
  isAdmin, isManagerOrAdmin, onNavigate, setActiveByPage,
}) => {
  // 2026-10-10 · 사용자 지시 · 입고알림 slide-in drawer (사이드바 메뉴 → 홈 랜딩 shortcut 이관)
  const [stockArrivalDrawer, setStockArrivalDrawer] = useState(false);
  const [hourlyRows, setHourlyRows] = useState<HourlyRow[] | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);
  // 2026-10-09 · 사용자 지시 · 예상 월매출액 (매출현황 헤더 옆 노출) · 월 saleTotal 기반 projection
  const [monthProjectionWon, setMonthProjectionWon] = useState<number | null>(null);
  // 2026-10-09 · 사용자 지시 · 매출현황 주간 tab · 7일 range hourly data
  const [weekHourlyRows, setWeekHourlyRows] = useState<HourlyRow[] | null>(null);
  const [weekSalesLoading, setWeekSalesLoading] = useState(false);
  const [dayProducts, setDayProducts] = useState<DaySaleProductItem[] | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  // 2026-10-08 · 사용자 지시 · 오늘 매입건수 (TodayTasks 매입이력 count)
  const [todayPurchaseCount, setTodayPurchaseCount] = useState(0);
  // 2026-10-08 · 사용자 지시 · 홈 링크된 count 전부 실시간 조회 (발주 필요 · 유통기한 임박)
  const [lowStockCount, setLowStockCount] = useState(0);
  const [expiryImminentCount, setExpiryImminentCount] = useState(0);
  // 2026-10-09 · 사용자 지시 · 매입발주현황 1주 · 1달 chart 데이터
  const [weekPurchases, setWeekPurchases] = useState<Array<{ date: string; amount: number; count: number }>>([]);
  const [weekOrders, setWeekOrders] = useState<Array<{ date: string; count: number }>>([]);
  const [monthPurchases, setMonthPurchases] = useState<Array<{ date: string; amount: number; count: number }>>([]);
  const [monthOrders, setMonthOrders] = useState<Array<{ date: string; count: number }>>([]);
  // 2026-10-09 · 사용자 지시 · 직원현황 데이터
  const [staffStats, setStaffStats] = useState<{ total: number; onDuty: number; off: number } | null>(null);
  // 2026-10-08 · 사용자 지시 · 상품 클릭 시 상품정보 모달
  const [selectedProduct, setSelectedProduct] = useState<ProductInfo | null>(null);

  // 2026-10-09 · 사용자 지시 · 상품 클릭 디버깅 로그 (안 나옴 분석)
  const handleProductClick = useCallback(async (pcode: string | null) => {
    console.log("[HomeDashboard.productClick] pcode=", pcode);
    if (!pcode) {
      console.warn("[HomeDashboard.productClick] skip · pcode is null/empty");
      return;
    }
    try {
      const url = `/api/products/${encodeURIComponent(pcode)}`;
      console.log("[HomeDashboard.productClick] GET", url);
      const r = await api.get<ProductInfo>(url);
      console.log("[HomeDashboard.productClick] response data=", r.data);
      if (!r.data) {
        console.warn("[HomeDashboard.productClick] empty data · modal skip");
        return;
      }
      setSelectedProduct(r.data);
      console.log("[HomeDashboard.productClick] setSelectedProduct done · modal should open");
    } catch (e) {
      console.error("[HomeDashboard.productClick] FAILED", e);
    }
  }, []);

  const loadSales = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    setSalesLoading(true); setSalesError(null);
    try {
      const y = todayYmd();
      const r = await api.get<HourlyApiResponse>(`/api/erp/sale-hourly-report?from=${y}&to=${y}`);
      if (!r.data.ok) throw new Error(r.data.error ?? "매출 조회 실패");
      setHourlyRows(r.data.rows ?? []);
    } catch (e) { setSalesError((e as Error).message); setHourlyRows(null); }
    finally { setSalesLoading(false); }
  }, [isManagerOrAdmin]);

  // 2026-10-09 · 사용자 지시 · 예상 월매출액 projection · year-overview cache (현재 월 saleTotal → 평균 × 총일수)
  const loadMonthProjection = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      interface YearOverviewApiResponse { ok: boolean; results?: Record<string, { saleTotal: number } | null>; }
      const r = await api.get<YearOverviewApiResponse>(`/api/erp/sale-year-overview?year=${year}`);
      if (!r.data.ok || !r.data.results) { setMonthProjectionWon(null); return; }
      const row = r.data.results[String(month)];
      const saleTotal = row ? Number(row.saleTotal ?? 0) : 0;
      if (saleTotal <= 0) { setMonthProjectionWon(null); return; }
      const daysInMonth = new Date(year, month, 0).getDate();
      const pastDays = now.getDate();
      if (pastDays <= 0) { setMonthProjectionWon(null); return; }
      setMonthProjectionWon((saleTotal / pastDays) * daysInMonth);
    } catch { setMonthProjectionWon(null); }
  }, [isManagerOrAdmin]);

  // 2026-10-09 · 사용자 지시 · 주간 매출 (7일 range)
  const loadWeekSales = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    setWeekSalesLoading(true);
    try {
      const to = todayYmd();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 6);
      const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;
      const r = await api.get<HourlyApiResponse>(`/api/erp/sale-hourly-report?from=${from}&to=${to}`);
      if (!r.data.ok) throw new Error(r.data.error ?? "주간 매출 조회 실패");
      setWeekHourlyRows(r.data.rows ?? []);
    } catch { setWeekHourlyRows(null); }
    finally { setWeekSalesLoading(false); }
  }, [isManagerOrAdmin]);

  const loadDayProducts = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    setProductsLoading(true); setProductsError(null);
    try {
      const y = todayYmd();
      const r = await api.get<DayProductApiResponse>(`/api/erp/sale-day-products?date=${y}`);
      if (!r.data.ok) throw new Error(r.data.error ?? "판매현황 조회 실패");
      setDayProducts(r.data.items ?? []);
    } catch (e) { setProductsError((e as Error).message); setDayProducts(null); }
    finally { setProductsLoading(false); }
  }, [isManagerOrAdmin]);

  // 2026-10-08 · 사용자 지시 · 매입이력 3일 이내 (today-2 ~ today)
  const loadTodayPurchases = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    try {
      const to = todayYmd();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 2); // today 포함 3일
      const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;
      const r = await api.get<{ rows?: unknown[] }>(`/api/purchase-details?from=${from}&to=${to}&no_cycle=1&per_page=500`);
      setTodayPurchaseCount(Array.isArray(r.data?.rows) ? r.data.rows.length : 0);
    } catch { setTodayPurchaseCount(0); }
  }, [isManagerOrAdmin]);

  // 2026-10-08 · 발주 필요 상품 개수 (low-stock · current < optimal)
  const loadLowStock = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    try {
      const r = await api.get<unknown[]>("/api/stock-manage/low-stock");
      setLowStockCount(Array.isArray(r.data) ? r.data.length : 0);
    } catch { setLowStockCount(0); }
  }, [isManagerOrAdmin]);

  // 2026-10-08 · 유통기한 임박 (90일 이내 · 클라이언트 필터)
  const loadExpiryImminent = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    try {
      const r = await api.get<Array<{ expiry_date?: string | null }>>("/api/products/expiry-imminent");
      const list = Array.isArray(r.data) ? r.data : [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 90);
      const cutoffYmd = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
      const count = list.filter(it => it.expiry_date && it.expiry_date <= cutoffYmd).length;
      setExpiryImminentCount(count);
    } catch { setExpiryImminentCount(0); }
  }, [isManagerOrAdmin]);

  // 2026-10-09 · 사용자 지시 · N일 매입 집계 helper
  const fetchPurchasesByDays = useCallback(async (days: number): Promise<Array<{ date: string; amount: number; count: number }>> => {
    const to = todayYmd();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - (days - 1));
    const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;
    const r = await api.get<{ rows?: Array<{ purchase_date?: string; amount?: number | string }> }>(`/api/purchase-details?from=${from}&to=${to}&no_cycle=1&per_page=5000`);
    const rows = Array.isArray(r.data?.rows) ? r.data.rows : [];
    const byDate = new Map<string, { amount: number; count: number }>();
    for (const row of rows) {
      const d = String(row.purchase_date ?? "").slice(0, 10);
      if (!d) continue;
      const amt = Number(row.amount ?? 0);
      const prev = byDate.get(d) ?? { amount: 0, count: 0 };
      byDate.set(d, { amount: prev.amount + amt, count: prev.count + 1 });
    }
    const result: Array<{ date: string; amount: number; count: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const v = byDate.get(ds) ?? { amount: 0, count: 0 };
      result.push({ date: ds, amount: v.amount, count: v.count });
    }
    return result;
  }, []);

  // 2026-10-09 · N일 발주 집계 helper
  const fetchOrdersByDays = useCallback(async (days: number): Promise<Array<{ date: string; count: number }>> => {
    const r = await api.get<{ orders?: Array<{ sent_at?: string; requested_at?: string }> }>(`/api/order-history?days=${days}`);
    const orders = Array.isArray(r.data?.orders) ? r.data.orders : [];
    const byDate = new Map<string, number>();
    for (const o of orders) {
      const d = String(o.sent_at ?? o.requested_at ?? "").slice(0, 10);
      if (!d) continue;
      byDate.set(d, (byDate.get(d) ?? 0) + 1);
    }
    const result: Array<{ date: string; count: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      result.push({ date: ds, count: byDate.get(ds) ?? 0 });
    }
    return result;
  }, []);

  const loadWeekPurchases = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    try { setWeekPurchases(await fetchPurchasesByDays(7)); } catch { setWeekPurchases([]); }
  }, [isManagerOrAdmin, fetchPurchasesByDays]);
  const loadWeekOrders = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    try { setWeekOrders(await fetchOrdersByDays(7)); } catch { setWeekOrders([]); }
  }, [isManagerOrAdmin, fetchOrdersByDays]);
  const loadMonthPurchases = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    try { setMonthPurchases(await fetchPurchasesByDays(30)); } catch { setMonthPurchases([]); }
  }, [isManagerOrAdmin, fetchPurchasesByDays]);
  const loadMonthOrders = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    try { setMonthOrders(await fetchOrdersByDays(30)); } catch { setMonthOrders([]); }
  }, [isManagerOrAdmin, fetchOrdersByDays]);

  // 2026-10-09 · 직원현황 (총원 · 근무 · 비번)
  const loadStaffStats = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    try {
      const r = await api.get<Array<{ status?: string }>>("/api/employees");
      const list = Array.isArray(r.data) ? r.data : [];
      const total = list.length;
      const active = list.filter((e) => (e.status ?? "active") === "active").length;
      setStaffStats({ total, onDuty: active, off: total - active });
    } catch { setStaffStats(null); }
  }, [isManagerOrAdmin]);

  useEffect(() => { void loadSales(); }, [loadSales]);
  useEffect(() => { void loadWeekSales(); }, [loadWeekSales]);
  useEffect(() => { void loadMonthProjection(); }, [loadMonthProjection]);
  useEffect(() => { void loadDayProducts(); }, [loadDayProducts]);
  useEffect(() => { void loadTodayPurchases(); }, [loadTodayPurchases]);
  useEffect(() => { void loadLowStock(); }, [loadLowStock]);
  useEffect(() => { void loadExpiryImminent(); }, [loadExpiryImminent]);
  useEffect(() => { void loadWeekPurchases(); }, [loadWeekPurchases]);
  useEffect(() => { void loadWeekOrders(); }, [loadWeekOrders]);
  useEffect(() => { void loadMonthPurchases(); }, [loadMonthPurchases]);
  useEffect(() => { void loadMonthOrders(); }, [loadMonthOrders]);
  useEffect(() => { void loadStaffStats(); }, [loadStaffStats]);

  // 2026-10-08 · 사용자 지시 · ERP 변화 자동 반영 · 3-way refresh
  //   · (1) 60s 폴링 · (2) tab 재진입 시 즉시 · (3) 윈도우 focus 시 즉시
  useEffect(() => {
    if (!isManagerOrAdmin) return;
    const refreshAll = () => {
      void loadTodayPurchases();
      void loadLowStock();
      void loadExpiryImminent();
      void loadSales();
      void loadWeekSales();
      void loadDayProducts();
      void loadWeekPurchases();
      void loadWeekOrders();
      void loadStaffStats();
    };
    const id = setInterval(refreshAll, 60_000);
    const onVisibility = () => { if (document.visibilityState === "visible") refreshAll(); };
    const onFocus = () => refreshAll();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [isManagerOrAdmin, loadTodayPurchases, loadLowStock, loadExpiryImminent, loadSales, loadWeekSales, loadDayProducts, loadWeekPurchases, loadWeekOrders, loadStaffStats]);

  const now = new Date();
  const today = todayYmd();
  const curHour = now.getHours();

  const todayRows = useMemo(() =>
    (hourlyRows ?? []).filter(r => r.SaleDate === today && parseHour(r.SaleTime) <= curHour),
    [hourlyRows, today, curHour]);
  const todaySale = useMemo(() => todayRows.reduce((a, r) => a + Number(r.SaleTotal ?? 0), 0), [todayRows]);
  const todayCust = useMemo(() => todayRows.reduce((a, r) => a + Number(r.CustomerCnt ?? 0), 0), [todayRows]);
  const avgOrder = todayCust > 0 ? todaySale / todayCust : 0;

  const totalApprovals = leavePendingCount + requestsCounts.resignation + (isAdmin ? requestsCounts.vendor : 0);
  const totalPending = totalApprovals + requestsCounts.display + requestsCounts.order + (isAdmin ? paymentPendingCount : 0);

  // 2026-10-08 · 사용자 지시 · 상단 Hero 제거 · 날짜는 헤더에서 표시 · greetingDesc 삭제 (dead code)
  const name = authSession.employeeName;
  const rank = authSession.employeeRank;

  const goTo = (page: Exclude<AppNavPage, "landing">, sub?: string) => () => {
    if (sub) setActiveByPage(page, sub);
    onNavigate(page, authSession);
  };

  // 2026-10-08 · 사용자 지시 · 반품필요 + 유통기한 임박 제거 · 매입이력(3일)을 발주 필요 바로 아래로 이동
  //   · 발주 필요 = low-stock 상품 수 (current < optimal)
  const taskItems: TaskItem[] = [
    { label: "연차 승인", count: leavePendingCount, onClick: () => { setActiveByPage("requests", "leave"); onNavigate("requests", authSession); } },
    ...(isAdmin ? [{ label: "거래처 승인", count: requestsCounts.vendor, onClick: () => { setActiveByPage("requests", "vendor"); onNavigate("requests", authSession); } }] : []),
    { label: "진열 요청", count: requestsCounts.display, onClick: () => { setActiveByPage("requests", "display"); onNavigate("requests", authSession); } },
    { label: "발주 필요", count: lowStockCount, onClick: () => { setActiveByPage("display", "purchase-order"); onNavigate("display", authSession); } },
    ...(isManagerOrAdmin ? [{ label: "매입이력(3일)", count: todayPurchaseCount, onClick: () => { setActiveByPage("display", "purchase"); onNavigate("display", authSession); } }] : []),
    { label: "사직서 승인", count: requestsCounts.resignation, onClick: () => { setActiveByPage("requests", "resignation"); onNavigate("requests", authSession); } },
  ];

  return (
    // Page content container · max-w per spec · padding 24
    <div className="w-full max-w-[1240px] mx-auto flex flex-col gap-3 md:gap-4">
      {/* ═ 2026-10-08 · 사용자 지시 · 상단 Hero greeting + 승인요청 inline 섹션 모두 제거
            · 자리에 compact greeting line 하나로 통합
            · 포맷: "안녕하세요, 홍길동 이사님. 현재 3건의 업무가 진행중입니다."
            · 세로바 amber accent · (관리자) 업무건수 bold · (직원) 인사말만 ═ */}
      <section className="flex items-center gap-2 py-0.5 px-1">
        <span className="w-[3px] h-[14px] bg-amber-500 rounded-full shrink-0" />
        {isManagerOrAdmin ? (
          <span className="text-[14px] md:text-[15px] text-slate-700">
            안녕하세요, <strong className="font-semibold text-ink">{name}{rank ? ` ${rank}` : ""}</strong>님.
            {totalPending > 0 ? (
              <> 현재 <strong className="font-semibold text-amber-700 tabular-nums">{totalPending}</strong>건의 업무가 진행중입니다.</>
            ) : (
              <> 대기 중인 업무가 없습니다.</>
            )}
          </span>
        ) : (
          <span className="text-[14px] md:text-[15px] text-slate-700">
            안녕하세요, <strong className="font-semibold text-ink">{name}{rank ? ` ${rank}` : ""}</strong>님. 오늘도 좋은 하루 되세요.
          </span>
        )}
      </section>

      {/* ═ Quick Actions · 2026-10-08 · 사용자 지시 · 맨위로 올림 (greeting 바로 아래)
            · role-exclusive (admin → 관리자용만 · employee → 직원용만) ═ */}
      <section className={`${CARD} px-3 py-2.5 md:px-4 md:py-3`}>
        {/* 직원용 · 직원 전용 노출 */}
        {!isManagerOrAdmin && (
          <div className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-3">
            <div className="flex items-center gap-1.5 shrink-0 md:w-[88px] md:pr-3 md:border-r md:border-slate-200">
              <span className="w-[3px] h-[14px] bg-sky-500 rounded-full" />
              <span className="text-[14px] md:text-[15px] font-semibold text-sky-700 tracking-tight">직원용</span>
            </div>
            <div className="hidden md:flex items-center flex-wrap gap-x-5 gap-y-1">
              <QuickBtn tone="sky" icon={<Calendar size={16} />} label="스케줄표" onClick={goTo("schedule")} />
              <QuickBtn tone="sky" icon={<Scan size={16} />} label="실재고 확인" onClick={goTo("scan")} />
              <QuickBtn tone="sky" icon={<MessageSquare size={16} />} label="이슈 공유" onClick={goTo("board")} />
              <QuickBtn tone="sky" icon={<CalendarPlus size={16} />} label="연차신청" onClick={() => { setActiveByPage("approval-request", "leave"); onNavigate("approval-request", authSession); }} />
            </div>
            <div className="md:hidden grid grid-cols-4 gap-1">
              <QuickBtn tone="sky" icon={<Calendar size={16} />} label="스케줄" onClick={goTo("schedule")} />
              <QuickBtn tone="sky" icon={<Scan size={16} />} label="실재고" onClick={goTo("scan")} />
              <QuickBtn tone="sky" icon={<MessageSquare size={16} />} label="이슈" onClick={goTo("board")} />
              <QuickBtn tone="sky" icon={<CalendarPlus size={16} />} label="연차신청" onClick={() => { setActiveByPage("approval-request", "leave"); onNavigate("approval-request", authSession); }} />
            </div>
          </div>
        )}

        {/* 관리자용 · 관리자 전용 노출 */}
        {isManagerOrAdmin && (
          <div className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-3">
            <div className="flex items-center gap-1.5 shrink-0 md:w-[88px] md:pr-3 md:border-r md:border-slate-200">
              <span className="w-[3px] h-[14px] bg-violet-500 rounded-full" />
              <span className="text-[14px] md:text-[15px] font-semibold text-violet-700 tracking-tight">관리자용</span>
            </div>
            <div className="hidden md:flex items-center flex-wrap gap-x-5 gap-y-1">
              <QuickBtn tone="violet" icon={<Package size={16} />} label="상품입고" onClick={goTo("productarrival")} />
              <QuickBtn tone="violet" icon={<History size={16} />} label="매입이력" onClick={goTo("display", "purchase")} />
              <QuickBtn tone="violet" icon={<PlusCircle size={16} />} label="발주등록" onClick={goTo("display", "purchase-order")} />
            </div>
            <div className="md:hidden grid grid-cols-3 gap-1">
              <QuickBtn tone="violet" icon={<Package size={16} />} label="상품입고" onClick={goTo("productarrival")} />
              <QuickBtn tone="violet" icon={<History size={16} />} label="매입이력" onClick={goTo("display", "purchase")} />
              <QuickBtn tone="violet" icon={<PlusCircle size={16} />} label="발주등록" onClick={goTo("display", "purchase-order")} />
            </div>
          </div>
        )}
      </section>

      {/* ═ 매출현황 + 오늘판매현황 (단일 섹션 · 효율적 배치) · 2026-10-08 · 사용자 지시
            · 왼쪽(col-8): 매출카드(top) + 오늘업무/입고알림 2열(bottom)
            · 오른쪽(col-4): 판매현황 full-height
            · 매출카드 아래 빈 공간 활용 · 판매현황은 세로 길게 유지 ═ */}
      {isManagerOrAdmin ? (
        <>
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 md:gap-4">
            {/* 왼쪽(col-8): 매출현황 + 매입발주현황(tabbed) */}
            <div className="min-w-0 lg:col-span-8 flex flex-col gap-2.5 md:gap-4">
              <SalesOverviewCard
                loading={salesLoading}
                error={salesError}
                rows={todayRows}
                todaySale={todaySale}
                todayCust={todayCust}
                avgOrder={avgOrder}
                curHour={curHour}
                onOpen={goTo("display", "revenue")}
                weekRows={weekHourlyRows}
                weekLoading={weekSalesLoading}
                monthProjectionWon={monthProjectionWon}
              />
              {/* 2026-10-09 · 사용자 지시 · 매입발주현황 (매출현황처럼 tabbed · 1주 chart) */}
              <PurchaseOrderOverviewCard
                weekPurchases={weekPurchases}
                weekOrders={weekOrders}
                monthPurchases={monthPurchases}
                monthOrders={monthOrders}
                onOpenPurchase={() => { setActiveByPage("display", "purchase"); onNavigate("display", authSession); }}
                onOpenOrder={() => { setActiveByPage("display", "purchase-order"); onNavigate("display", authSession); }}
              />
            </div>
            {/* 오른쪽(col-4): 직원현황 + 오늘업무 + 입고알림 · absolute (왼쪽이 row 높이 결정) · gap 축소 (overflow fix) */}
            <div className="min-w-0 lg:col-span-4 lg:relative">
              {/* 2026-10-09 · 사용자 지시 · 오늘 업무 삐져나옴 fix · 전체 밸런스 · absolute inset-0 내부 flex overflow-hidden + 자식 min-h-0 */}
              <div className="lg:absolute lg:inset-0 flex flex-col gap-2 md:gap-2.5 overflow-hidden">
                {/* 2026-10-09 · 사용자 지시 · 직원현황 추가 (입고알림 위) */}
                <div className="shrink-0">
                  <StaffStatusCard
                    stats={staffStats}
                    onOpen={() => onNavigate("business-manage", authSession)}
                  />
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <TodayTasksCard
                    totalBadge={totalPending}
                    items={taskItems}
                    onOpenAll={() => { setActiveByPage("requests", "leave"); onNavigate("requests", authSession); }}
                  />
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <StockArrivalList
                    isVendor={false}
                    compact
                    onOpenInputPage={() => setStockArrivalDrawer(true)}
                  />
                </div>
              </div>
            </div>
          </section>
          {/* 2026-10-09 · 사용자 지시 · 오늘의 판매현황 (full width · 아래 가로 긴 테이블) */}
          <section>
            <TodaySalesTable
              loading={productsLoading}
              error={productsError}
              items={dayProducts ?? []}
              onOpen={goTo("display", "revenue")}
              onProductClick={handleProductClick}
            />
          </section>
        </>
      ) : (
        // 직원 뷰 · 매출/판매 없음 · 오늘업무만 full-width
        <section>
          <TodayTasksCard
            totalBadge={totalPending}
            items={taskItems}
            onOpenAll={() => { setActiveByPage("requests", "leave"); onNavigate("requests", authSession); }}
          />
        </section>
      )}

      {/* 2026-10-08 · 사용자 지시 · 판매현황 상품 클릭 → 상품정보 모달 */}
      {selectedProduct && (
        <ProductInfoModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onProductUpdate={(updates) => setSelectedProduct(prev => prev ? { ...prev, ...updates } : prev)}
        />
      )}

      {/* 2026-10-10 · 사용자 지시 · 입고알림 slide-in Drawer · 홈 랜딩 shortcut 클릭 시 오른쪽 slide-in
          · 다른 drawer 들과 톤 통일 (RequestsPage 패턴) · StockArrivalPage embedded 로 통째 render */}
      {stockArrivalDrawer && (
        <>
          <style>{`
            @keyframes stockArrivalDrawerSlideIn {
              from { transform: translateX(100%); }
              to   { transform: translateX(0); }
            }
            @keyframes stockArrivalDrawerFadeIn {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
          `}</style>
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-40"
            style={{ animation: "stockArrivalDrawerFadeIn 200ms ease-out" }}
            onClick={() => setStockArrivalDrawer(false)}
            aria-hidden
          />
          <aside
            className="fixed right-0 top-0 bottom-0 w-full md:w-[720px] lg:w-[840px] bg-[#F4F7FA] z-50 shadow-[-8px_0_32px_rgba(15,23,42,0.12)] flex flex-col"
            style={{ animation: "stockArrivalDrawerSlideIn 250ms ease-out" }}
            role="dialog"
            aria-modal="true"
          >
            <header className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2.5 md:px-4 md:py-3 border-b border-slate-200 bg-white">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-slate-100 text-slate-600 shrink-0">
                <Package size={14} weight="fill" />
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-[14px] md:text-[15px] font-semibold text-ink tracking-tight truncate leading-tight">입고 알림</h2>
              </div>
              <button
                type="button"
                onClick={() => setStockArrivalDrawer(false)}
                className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] text-slate-500 hover:text-ink hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="닫기"
                title="닫기"
              >
                <XIcon size={14} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto">
              <React.Suspense fallback={<div className="p-6 text-center text-[14px] text-slate-500">불러오는 중...</div>}>
                <StockArrivalPageLazy
                  embedded
                  authSession={authSession}
                  onBack={() => setStockArrivalDrawer(false)}
                  onNavigate={onNavigate as any}
                  onLogout={() => { /* drawer 내부라 noop */ }}
                />
              </React.Suspense>
            </div>
          </aside>
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// SectionLabel · accent bar + title (above section)
// ─────────────────────────────────────────────────────────────
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-2 mb-1.5 md:mb-2">
    <span className="w-[3px] h-[14px] bg-slate-400 rounded-full" />
    <span className="text-[14px] md:text-[15px] font-semibold text-slate-600 tracking-tight">{children}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────
// KpiCell · 통합 card 내부 1 cell (no border · divide-x로 구분)
// ─────────────────────────────────────────────────────────────
interface KpiCellProps {
  icon?: React.ReactNode;      // 2026-10-08 · optional · 텍스트 전용 셀 지원 (방문객 · 객단가)
  iconBg?: string;
  label: string;
  value: string;
  loading?: boolean;
  error?: boolean;
  onClick: () => void;
}

const KpiCell: React.FC<KpiCellProps> = ({ icon, iconBg, label, value, loading, error, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-left cursor-pointer min-w-0 p-2 sm:p-3 min-h-[64px] sm:min-h-[76px] flex flex-row items-center gap-2 sm:gap-2.5 hover:bg-slate-50/60 transition-colors"
  >
    {icon && (
      <span className={`inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-[8px] shrink-0 ${iconBg ?? ""}`}>{icon}</span>
    )}
    <div className="flex flex-col min-w-0 gap-0.5">
      <span className={`${T.kpiLabel} break-keep leading-tight`}>{label}</span>
      {loading ? (
        <SkeletonBar className="h-5 w-20 sm:h-6 sm:w-28" />
      ) : error ? (
        <div className="text-[14px] sm:text-[15px] text-rose-500 font-semibold">조회 실패</div>
      ) : (
        <div
          className="font-bold tabular-nums text-ink leading-tight whitespace-nowrap tracking-tight"
          style={{ fontSize: "clamp(16px, 1.7vw, 19px)" }}
          title={value}
        >
          {value}
        </div>
      )}
    </div>
  </button>
);

const SkeletonBar: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = "", style }) => (
  <div className={`bg-slate-200/70 rounded animate-pulse ${className}`} style={style} />
);

// ─────────────────────────────────────────────────────────────
// SalesOverviewCard · 9-col · 280-320px · Summary 30% + Chart 70%
// ─────────────────────────────────────────────────────────────
interface SalesOverviewProps {
  loading: boolean;
  error: string | null;
  rows: HourlyRow[];
  todaySale: number;
  todayCust: number;
  avgOrder: number;
  curHour: number;
  onOpen: () => void;
  // 2026-10-09 · 사용자 지시 · 주간 탭 추가
  weekRows: HourlyRow[] | null;
  weekLoading: boolean;
  // 2026-10-09 · 사용자 지시 · 매출현황 헤더 옆 "예상월매출액 X.XX억원"
  monthProjectionWon: number | null;
}

const SalesOverviewCard: React.FC<SalesOverviewProps> = ({ loading, error, rows, todaySale, todayCust, avgOrder, curHour, onOpen, weekRows, weekLoading, monthProjectionWon }) => {
  // 2026-10-09 · tab · 오늘 (hourly) · 주간 (daily)
  const [tab, setTab] = useState<"today" | "week">("today");
  const isWeek = tab === "week";
  const chartData = useMemo(() =>
    rows
      .map(r => ({ hour: parseHour(r.SaleTime), sale: Number(r.SaleTotal ?? 0) }))
      .sort((a, b) => a.hour - b.hour)
      .map(d => ({ label: `${d.hour}시`, sale: d.sale, isNow: d.hour === curHour })),
    [rows, curHour]);

  // 2026-10-09 · 주간 chart data (일별 집계 · 7일)
  const weekChartData = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const r of weekRows ?? []) {
      const d = String(r.SaleDate ?? "").slice(0, 10);
      if (!d) continue;
      byDate.set(d, (byDate.get(d) ?? 0) + Number(r.SaleTotal ?? 0));
    }
    const result: Array<{ label: string; sale: number; isNow: boolean }> = [];
    const today = todayYmd();
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      result.push({ label: `${dt.getMonth() + 1}/${dt.getDate()}`, sale: byDate.get(ds) ?? 0, isNow: ds === today });
    }
    return result;
  }, [weekRows]);

  const weekSaleTotal = useMemo(() => weekChartData.reduce((a, d) => a + d.sale, 0), [weekChartData]);
  const weekDailyAvg = weekChartData.length > 0 ? weekSaleTotal / weekChartData.length : 0;

  return (
    <div className={`${CARD} w-full flex flex-col`}>
      {/* Header · 2026-10-09 · 사용자 지시 · 오늘/주간 탭 추가 */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="w-[3px] h-[16px] bg-blue-500 rounded-full shrink-0" />
          <h3 className={T.sectionTitle}>매출 현황</h3>
          {/* 2026-10-09 · 사용자 지시 · 예상월매출액 inline (평균×총일수) · 12.34억원 포맷 */}
          {monthProjectionWon != null && monthProjectionWon > 0 && (
            <span className="text-[12.5px] md:text-[13.5px] font-semibold text-cyan-700 tabular-nums whitespace-nowrap"
              title="평균 일 매출 × 당월 총일수 = 월말 예상 총매출">
              (예상월매출액 {fmtEok(monthProjectionWon)})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setTab("today")}
              className={`px-2.5 py-1 rounded-md text-[13px] font-medium transition-colors ${
                !isWeek ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >오늘</button>
            <button
              type="button"
              onClick={() => setTab("week")}
              className={`px-2.5 py-1 rounded-md text-[13px] font-medium transition-colors ${
                isWeek ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >주간</button>
          </div>
          <button type="button" onClick={onOpen} className="text-[13px] md:text-[14px] text-blue-600 font-semibold hover:underline cursor-pointer flex items-center gap-0.5">
            상세 <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Summary + Chart · 2026-10-09 · 사용자 지시 · 오늘/주간 탭별 분기 */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-10 gap-0">
        <div className="md:col-span-3 px-5 py-4 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col gap-3">
          {!isWeek ? (
            <>
              <div>
                <div className={T.kpiLabel}>오늘 매출</div>
                {loading && rows.length === 0 ? (
                  <SkeletonBar className="h-8 w-40 mt-1" />
                ) : (
                  <div className="font-bold tabular-nums text-ink leading-tight tracking-tight mt-0.5" style={T.salesAmount}>
                    {error ? "-" : rows.length === 0 ? "-" : fmtWon(todaySale)}
                  </div>
                )}
              </div>
              <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <span className={T.kpiLabel}>방문객</span>
                  <span className="text-[15px] md:text-[16px] font-semibold tabular-nums text-ink">
                    {rows.length === 0 ? "-" : `${todayCust.toLocaleString("ko-KR")}명`}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className={T.kpiLabel}>객단가</span>
                  <span className="text-[15px] md:text-[16px] font-semibold tabular-nums text-ink">
                    {todayCust === 0 ? "-" : fmtWon(avgOrder)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className={T.kpiLabel}>현재 시간</span>
                  <span className="text-[15px] md:text-[16px] font-semibold tabular-nums text-ink">{curHour}시</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className={T.kpiLabel}>주간 매출</div>
                {weekLoading && weekSaleTotal === 0 ? (
                  <SkeletonBar className="h-8 w-40 mt-1" />
                ) : (
                  <div className="font-bold tabular-nums text-ink leading-tight tracking-tight mt-0.5" style={T.salesAmount}>
                    {weekSaleTotal === 0 ? "-" : fmtWon(weekSaleTotal)}
                  </div>
                )}
              </div>
              <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <span className={T.kpiLabel}>일평균</span>
                  <span className="text-[15px] md:text-[16px] font-semibold tabular-nums text-ink">
                    {weekSaleTotal === 0 ? "-" : fmtWon(weekDailyAvg)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className={T.kpiLabel}>기간</span>
                  <span className="text-[15px] md:text-[16px] font-semibold tabular-nums text-ink">7일</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Chart · 2026-10-09 · 사용자 지시 · 오늘(시간대별) · 주간(일별) 분기 */}
        <div className="md:col-span-7 h-[180px] md:h-[220px] px-3 py-3">
          {(() => {
            const data = isWeek ? weekChartData : chartData;
            const isLoadingNow = isWeek ? (weekLoading && data.every(d => d.sale === 0)) : (loading && rows.length === 0);
            const isErrorNow = !isWeek && error;
            if (isErrorNow) {
              return <div className="h-full flex items-center justify-center text-[14px] md:text-[15px] text-rose-500">ERP 조회 실패</div>;
            }
            if (isLoadingNow) {
              return (
                <div className="h-full px-2 flex items-end gap-1.5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <SkeletonBar key={i} className="flex-1" style={{ height: `${30 + Math.sin(i * 1.3) * 30 + 60}%` }} />
                  ))}
                </div>
              );
            }
            if (data.length === 0 || data.every(d => d.sale === 0)) {
              return <div className="h-full flex items-center justify-center text-[14px] md:text-[15px] text-slate-400">데이터 없음</div>;
            }
            return (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-end gap-3 pb-2 shrink-0">
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: "#93c5fd" }} />
                    <span>{isWeek ? "일별 매출" : "매출"}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: "#2563eb" }} />
                    <span>{isWeek ? "오늘" : "현재 시간"}</span>
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 13, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 13, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(0)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`} />
                      <Tooltip
                        formatter={(v: number) => fmtWon(v)}
                        contentStyle={{ fontSize: 14, borderRadius: 8, padding: "6px 10px", border: "1px solid #e2e8f0" }}
                        cursor={{ fill: "rgba(59,130,246,0.06)" }}
                      />
                      <Bar dataKey="sale" radius={[3, 3, 0, 0]}>
                        {data.map((d, i) => (
                          <Cell key={i} fill={d.isNow ? "#2563eb" : "#93c5fd"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// TodayTasksCard · 3-col · divide-y rows · pending orange emphasis
// ─────────────────────────────────────────────────────────────
interface TaskItem { label: string; count: number; onClick: () => void; }
interface TodayTasksCardProps {
  totalBadge: number;
  items: TaskItem[];
  onOpenAll: () => void;
}

const TodayTasksCard: React.FC<TodayTasksCardProps> = ({ totalBadge, items, onOpenAll }) => {
  const allZero = items.every(it => it.count === 0);
  // 2026-10-08 · 사용자 지시 · 모바일에서는 default 접힘 · 데스크톱(lg+)은 항상 펼침
  //   · lg: 미디어쿼리 매치 → initial expanded true · 모바일 → false
  const [mobileExpanded, setMobileExpanded] = useState(false);
  return (
    // 2026-10-09 · 사용자 지시 · 삐져나옴 fix · lg:min-h 제거 · parent flex-1 에서 자연 크기 결정
    <div className={`${CARD} w-full h-full flex flex-col overflow-hidden`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
        <button
          type="button"
          onClick={() => setMobileExpanded(v => !v)}
          className="flex items-center gap-2 lg:cursor-default lg:pointer-events-none"
          aria-expanded={mobileExpanded}
          aria-label="오늘 업무 펼치기/접기"
        >
          <span className="w-[3px] h-[16px] bg-amber-500 rounded-full" />
          <h3 className={T.sectionTitle}>오늘 업무</h3>
          <span className={`text-[13px] font-semibold tabular-nums px-2 py-0.5 rounded-full ${totalBadge > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
            {totalBadge}
          </span>
          <ChevronRight size={14} className={`text-slate-300 lg:hidden transition-transform ${mobileExpanded ? "rotate-90" : ""}`} />
        </button>
        <button type="button" onClick={onOpenAll} className="text-[14px] text-blue-600 font-semibold hover:underline cursor-pointer flex items-center gap-0.5">
          전체보기 <ChevronRight size={13} />
        </button>
      </div>
      {/* 2026-10-08 · 모바일에서 접힘 default · lg+ 는 항상 노출 · 긴 리스트는 내부 scroll */}
      <div className={`${mobileExpanded ? "block" : "hidden"} lg:block flex-1 min-h-0 overflow-y-auto`}>
        {allZero ? (
          <div className="flex items-center justify-center text-[14px] md:text-[15px] text-slate-400 py-8 lg:py-0 lg:h-full">
            처리할 업무가 없습니다
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                onClick={it.onClick}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-slate-50/70 transition-colors cursor-pointer"
              >
                <span className={`${T.taskLabel} ${it.count === 0 ? "text-slate-400" : ""}`}>{it.label}</span>
                <span className="flex items-center gap-1.5">
                  <span className={`${T.taskCount} ${it.count === 0 ? "text-slate-400" : "text-amber-700"}`}>{it.count}</span>
                  <ChevronRight size={13} className="text-slate-300" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// QuickBtn · compact horizontal button · 2026-10-08 · tone prop 추가 (role 컬러 포인트)
// ─────────────────────────────────────────────────────────────
type QuickBtnTone = "slate" | "sky" | "violet" | "emerald";
const QB_TONE: Record<QuickBtnTone, { bg: string; text: string; hover: string }> = {
  slate:   { bg: "bg-slate-100",   text: "text-slate-600",   hover: "hover:bg-slate-50" },
  sky:     { bg: "bg-sky-50",      text: "text-sky-600",     hover: "hover:bg-sky-50/70" },
  violet:  { bg: "bg-violet-50",   text: "text-violet-600",  hover: "hover:bg-violet-50/70" },
  emerald: { bg: "bg-emerald-50",  text: "text-emerald-600", hover: "hover:bg-emerald-50/70" },
};
// 2026-10-08 · ApprovalInline 삭제 (승인요청 섹션 자체 제거 · 사용자 지시)

const QuickBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; tone?: QuickBtnTone }> = ({ icon, label, onClick, tone = "slate" }) => {
  const t = QB_TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 md:gap-2 h-9 md:h-10 px-2 md:px-3 rounded-[8px] text-slate-700 ${t.hover} hover:text-ink transition-colors cursor-pointer min-w-0`}
    >
      <span className={`inline-flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-[8px] ${t.bg} ${t.text} shrink-0`}>
        {icon}
      </span>
      <span className={`${T.qaLabel} break-keep`}>{label}</span>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
// TodaySalesTable · dense table · 7-col (No/상품명/바코드/카테고리/수량/매출/시간)
// ─────────────────────────────────────────────────────────────
interface TodaySalesTableProps {
  loading: boolean;
  error: string | null;
  items: DaySaleProductItem[];
  onOpen: () => void;
  // 2026-10-08 · 사용자 지시 · 상품 클릭 시 상품정보 모달 open
  onProductClick?: (pcode: string | null) => void;
}

// 2026-10-08 · 사용자 지시 · TodaySalesTable · 상품 · 마진율 · 수량만 (매출 컬럼 제거)
type SalesSortKey = "name" | "qty" | "margin";
type SortDir = "asc" | "desc";

const TodaySalesTable: React.FC<TodaySalesTableProps> = ({ loading, error, items, onOpen, onProductClick }) => {
  // 2026-10-08 · fix · 단일 state object (atomic update · React batching 분리 setState 이슈 방지)
  const [sort, setSort] = useState<{ key: SalesSortKey; dir: SortDir }>({ key: "margin", dir: "desc" });
  const { key: sortKey, dir: sortDir } = sort;

  const handleSort = (key: SalesSortKey) => {
    setSort(prev => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: key === "qty" || key === "margin" ? "desc" : "asc" };
    });
  };

  // 2026-10-08 · fix · useMemo deps 에 sort 객체 자체 포함 (destructure cache 이슈 방지)
  const topItems = useMemo(() => {
    const { key: sk, dir: sd } = sort;
    const filtered = items.filter(it => Number(it.saleTotal ?? 0) > 0);
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sk === "name") {
        cmp = String(a.productName ?? "").localeCompare(String(b.productName ?? ""), "ko");
      } else if (sk === "qty") {
        cmp = Number(a.totalStock ?? 0) - Number(b.totalStock ?? 0);
      } else {
        const ra = Number(a.saleTotal ?? 0) > 0 ? Number(a.margin ?? 0) / Number(a.saleTotal) : 0;
        const rb = Number(b.saleTotal ?? 0) > 0 ? Number(b.margin ?? 0) / Number(b.saleTotal) : 0;
        cmp = ra - rb;
      }
      const final = sd === "asc" ? cmp : -cmp;
      if (final === 0) {
        return String(a.productName ?? "").localeCompare(String(b.productName ?? ""), "ko");
      }
      return final;
    });
    return sorted;
  }, [items, sort]);

  const sortIndicator = (key: SalesSortKey) => {
    if (sortKey !== key) return <span className="text-[11px] text-slate-400 leading-none">↕</span>;
    return <span className="text-[12px] text-emerald-700 font-black leading-none">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };
  const thActiveBg = (key: SalesSortKey) => (sortKey === key ? "bg-emerald-50/70 text-emerald-800" : "");

  return (
    // 2026-10-09 · 사용자 지시 · 왼쪽 col 로 이동 (SalesCard 아래) · 고정 높이 (들쭉날쭉 방지)
    //   · 1646 items 가 natural height 로 밀어붙이는 문제 fix · 고정 h + overflow scroll
    <div className={`${CARD} w-full flex flex-col h-[420px] md:h-[480px]`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-[16px] bg-emerald-500 rounded-full" />
          <h3 className={T.sectionTitle}>오늘의 판매현황</h3>
          <span className="text-[12px] text-slate-400 tabular-nums">({topItems.length})</span>
          {/* 2026-10-08 · 사용자 지시 · 현재 정렬 상태 pill (digest 값 제거) */}
          <span className="text-[11px] font-semibold tabular-nums text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
            {sortKey === "name" ? "상품" : sortKey === "qty" ? "수량" : "마진율"} {sortDir === "asc" ? "↑" : "↓"}
          </span>
        </div>
        <button type="button" onClick={onOpen} className="text-[14px] text-blue-600 font-semibold hover:underline cursor-pointer flex items-center gap-0.5">
          전체보기 <ChevronRight size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {loading && items.length === 0 ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <SkeletonBar className="h-4 w-48" />
                <SkeletonBar className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-[14px] md:text-[15px] text-rose-500 py-10">ERP 조회 실패</div>
        ) : topItems.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[14px] md:text-[15px] text-slate-400 py-10">오늘 판매된 상품이 없습니다</div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgba(226,232,240,1)]">
              <tr>
                <th className={`${T.tableHeader} text-left px-3 py-2 w-8`}>#</th>
                {/* 2026-10-08 · 사용자 지시 fix · 활성 컬럼 bg emerald + 아이콘 극대화 */}
                <th
                  className={`${T.tableHeader} text-left px-3 py-2 cursor-pointer select-none hover:bg-slate-100 transition-colors ${thActiveBg("name")}`}
                  onClick={() => handleSort("name")}
                  aria-sort={sortKey === "name" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <span className="inline-flex items-center gap-1">상품 {sortIndicator("name")}</span>
                </th>
                <th
                  className={`${T.tableHeader} text-right px-3 py-2 w-20 cursor-pointer select-none hover:bg-slate-100 transition-colors ${thActiveBg("margin")}`}
                  onClick={() => handleSort("margin")}
                  aria-sort={sortKey === "margin" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <span className="inline-flex items-center gap-1 justify-end w-full whitespace-nowrap">마진율 {sortIndicator("margin")}</span>
                </th>
                <th
                  className={`${T.tableHeader} text-right pl-3 pr-4 py-2 w-20 cursor-pointer select-none hover:bg-slate-100 transition-colors ${thActiveBg("qty")}`}
                  onClick={() => handleSort("qty")}
                  aria-sort={sortKey === "qty" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <span className="inline-flex items-center gap-1 justify-end w-full whitespace-nowrap">수량 {sortIndicator("qty")}</span>
                </th>
              </tr>
            </thead>
            {/* 2026-10-08 · fix · tbody key = sort state → sort 변경 시 강제 remount (DOM 재사용 이슈 방지) */}
            <tbody key={`${sortKey}-${sortDir}`} className="divide-y divide-slate-100">
              {topItems.map((it, i) => {
                const sale = Number(it.saleTotal ?? 0);
                const qty = Number(it.totalStock ?? 0);
                const marginAmt = Number(it.margin ?? 0);
                const marginRate = sale > 0 ? (marginAmt / sale) * 100 : 0;
                // key 에 index 포함 → 동일 pcode 재사용 방지 · 매 render 신규 DOM 보장
                return (
                  <tr key={`${sortKey}-${sortDir}-${i}-${it.pcode ?? ""}`} className="hover:bg-slate-50/60 transition-colors text-[14px] md:text-[15px]">
                    <td className="px-3 py-2 tabular-nums text-slate-400 align-top">{i + 1}</td>
                    <td className="px-3 py-2 font-medium leading-snug align-top text-ink">
                      {/* 2026-10-08 · 사용자 지시 · 말줄임표 금지 · 전체 노출 (wrap) · 클릭 → 상품정보 모달
                            · 2026-10-08 · 상품데이터 폰트 -1 (tableBody 15/16 → 14/15) */}
                      {onProductClick ? (
                        <button
                          type="button"
                          onClick={() => {
                            // 2026-10-09 · 사용자 지시 · 상품 클릭 디버깅 로그
                            console.log("[TodaySalesTable.rowClick]", { idx: i, pcode: it.pcode, productName: it.productName, hasPcode: !!it.pcode });
                            onProductClick(it.pcode);
                          }}
                          disabled={!it.pcode}
                          className="text-left break-words whitespace-normal hover:underline underline-offset-[3px] decoration-slate-300 cursor-pointer disabled:cursor-default disabled:no-underline"
                          title={!it.pcode ? "pcode 없음 (ERP 데이터 누락)" : "상품 정보 보기"}
                        >
                          {it.productName ?? "(상품명 없음)"}
                        </button>
                      ) : (
                        <span className="break-words whitespace-normal">{it.productName ?? "(상품명 없음)"}</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 tabular-nums text-right align-top font-semibold ${marginRate >= 30 ? "text-emerald-600" : marginRate >= 15 ? "text-slate-700" : "text-slate-400"}`}>
                      {sale > 0 ? `${marginRate.toFixed(1)}%` : "-"}
                    </td>
                    <td className="pl-3 pr-4 py-2 tabular-nums text-right align-top text-ink whitespace-nowrap">{qty.toLocaleString("ko-KR")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// 2026-10-08 · InventoryAlertsCard 삭제 (StockArrivalList compact 로 대체)

// ─────────────────────────────────────────────────────────────
// PurchaseOrderOverviewCard · 2026-10-09 · 사용자 지시 · 매출현황처럼 tabbed + chart
//   · tab: 매입 (1주 매입액) · 발주 (1주 발주건수) · summary + bar chart
// ─────────────────────────────────────────────────────────────
interface PurchaseOrderOverviewProps {
  onOpenPurchase: () => void;
  onOpenOrder: () => void;
}

const PurchaseOrderOverviewCard: React.FC<PurchaseOrderOverviewProps & {
  weekPurchases: Array<{ date: string; amount: number; count: number }>;
  weekOrders: Array<{ date: string; count: number }>;
  monthPurchases: Array<{ date: string; amount: number; count: number }>;
  monthOrders: Array<{ date: string; count: number }>;
}> = ({ weekPurchases, weekOrders, monthPurchases, monthOrders, onOpenPurchase, onOpenOrder }) => {
  // 2026-10-11 · 사용자 지시 · 매입/발주 tab 제거 · 두 정보 같이 노출 · 매입 상세로만 "전체" 네비
  const [period, setPeriod] = useState<"week" | "month">("week");
  const isWeek = period === "week";
  void onOpenOrder;

  // 2026-10-11 · 사용자 지시 · 매입 + 발주 하나의 그래프 (매입 bar · 발주 line)
  //   · chartData · 두 series merge by date · 각 x축 label 당 purchase (매출액) + order (건수)
  const chartData = useMemo(() => {
    const purSrc = isWeek ? weekPurchases : monthPurchases;
    const ordSrc = isWeek ? weekOrders : monthOrders;
    const map = new Map<string, { label: string; purchase: number; order: number }>();
    for (const d of purSrc) {
      const label = `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8, 10))}`;
      map.set(d.date, { label, purchase: d.amount, order: 0 });
    }
    for (const d of ordSrc) {
      const label = `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8, 10))}`;
      const prev = map.get(d.date);
      if (prev) prev.order = d.count;
      else map.set(d.date, { label, purchase: 0, order: d.count });
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  }, [isWeek, weekPurchases, monthPurchases, weekOrders, monthOrders]);

  // 2026-10-11 · 사용자 지시 · 매입 + 발주 정보 같이 표시 (tab 제거)
  const purchaseTotal = chartData.reduce((a, d) => a + d.purchase, 0);
  const purchaseToday = chartData.length > 0 ? chartData[chartData.length - 1].purchase : 0;
  const purchaseAvg = chartData.length > 0 ? purchaseTotal / chartData.length : 0;
  const orderTotal = chartData.reduce((a, d) => a + d.order, 0);
  const orderToday = chartData.length > 0 ? chartData[chartData.length - 1].order : 0;
  const orderAvg = chartData.length > 0 ? orderTotal / chartData.length : 0;
  const periodDays = isWeek ? 7 : 30;
  const hasPurchase = chartData.some(d => d.purchase > 0);
  const hasOrder = chartData.some(d => d.order > 0);

  return (
    <div className={`${CARD} w-full flex flex-col`}>
      {/* Header · accent bar + title + 1주/1달 period + 전체
          2026-10-11 · 사용자 지시 · 매입/발주 tab 제거 (chart 안에 두 series 동시 노출) */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-[3px] h-[16px] rounded-full bg-violet-500" />
          <h3 className={T.sectionTitle}>매입·발주 현황</h3>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 1주/1달 Period */}
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setPeriod("week")}
              className={`px-2.5 py-1 rounded-md text-[13px] font-medium transition-colors ${
                isWeek ? "bg-white text-slate-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >1주</button>
            <button
              type="button"
              onClick={() => setPeriod("month")}
              className={`px-2.5 py-1 rounded-md text-[13px] font-medium transition-colors ${
                !isWeek ? "bg-white text-slate-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >1달</button>
          </div>
          <button type="button" onClick={onOpenPurchase} className="text-[13px] text-blue-600 font-semibold hover:underline cursor-pointer flex items-center gap-0.5 ml-1">
            전체 <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Summary (left 30%) + Chart (right 70%)
          2026-10-11 · 사용자 "깔끔한 텍스트 · 컬러포인트만 살짝 · 매입액 글씨 크게 X · 글씨 크기 리밸런싱" ·
          매입 + 발주 동일 구조 · 숫자 text-[18px] 통일 · label 색상 subtle (violet-700 / amber-700 라벨만) */}
      <div className="grid grid-cols-1 md:grid-cols-10">
        <div className="md:col-span-3 px-5 py-4 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col gap-3">
          {/* 매입 섹션 */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="w-[6px] h-[6px] rounded-full bg-violet-500 shrink-0" />
              <span className="text-[13px] text-slate-500 font-medium">{isWeek ? "1주" : "1달"} 매입액</span>
            </div>
            <div className="text-[18px] md:text-[20px] font-bold tabular-nums text-ink leading-tight tracking-tight">{fmtWon(purchaseTotal)}</div>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-slate-500">오늘</span>
              <span className="tabular-nums text-slate-700 font-medium">{fmtWon(purchaseToday)}</span>
            </div>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-slate-500">일평균</span>
              <span className="tabular-nums text-slate-700 font-medium">{fmtWon(purchaseAvg)}</span>
            </div>
          </div>
          {/* 발주 섹션 */}
          <div className="pt-2 border-t border-slate-100 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="w-[6px] h-[6px] rounded-full bg-amber-500 shrink-0" />
              <span className="text-[13px] text-slate-500 font-medium">{isWeek ? "1주" : "1달"} 발주건수</span>
            </div>
            <div className="text-[18px] md:text-[20px] font-bold tabular-nums text-ink leading-tight tracking-tight">{orderTotal.toLocaleString("ko-KR")}<span className="text-[14px] text-slate-500 font-medium ml-0.5">건</span></div>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-slate-500">오늘</span>
              <span className="tabular-nums text-slate-700 font-medium">{orderToday.toLocaleString("ko-KR")}건</span>
            </div>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-slate-500">일평균</span>
              <span className="tabular-nums text-slate-700 font-medium">{Math.round(orderAvg).toLocaleString("ko-KR")}건</span>
            </div>
          </div>
          {/* 기간 */}
          <div className="pt-2 border-t border-slate-100 flex items-baseline justify-between text-[13px]">
            <span className="text-slate-500">기간</span>
            <span className="tabular-nums text-slate-700 font-medium">{periodDays}일</span>
          </div>
        </div>
        <div className="md:col-span-7 h-[180px] md:h-[220px] px-3 py-3">
          {chartData.length === 0 || (!hasPurchase && !hasOrder) ? (
            <div className="h-full flex items-center justify-center text-[14px] text-slate-400">데이터 없음</div>
          ) : (
            /* 2026-10-11 · 사용자 지시 · 매입(막대) + 발주(꺽은선) 하나의 그래프 (ComposedChart)
               · 좌측 YAxis · 매입액 · 우측 YAxis · 발주건수 */
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="purchase"
                  tick={{ fontSize: 12, fill: "#8b5cf6" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(0)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`}
                />
                <YAxis
                  yAxisId="order"
                  orientation="right"
                  tick={{ fontSize: 12, fill: "#f59e0b" }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(v: number, name: string) => name === "매입액" ? [fmtWon(v), name] : [`${v.toLocaleString("ko-KR")}건`, name]}
                  contentStyle={{ fontSize: 13, borderRadius: 8, padding: "6px 10px", border: "1px solid #e2e8f0" }}
                  cursor={{ fill: "rgba(139,92,246,0.06)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
                <Bar yAxisId="purchase" dataKey="purchase" name="매입액" radius={[3, 3, 0, 0]} fill="#8b5cf6" />
                <Line yAxisId="order" dataKey="order" name="발주건수" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// StaffStatusCard · 2026-10-09 · 사용자 지시 · 직원현황 (총원 · 근무 · 비번)
// ─────────────────────────────────────────────────────────────
const StaffStatusCard: React.FC<{ stats: { total: number; onDuty: number; off: number } | null; onOpen: () => void }> = ({ stats, onOpen }) => {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${CARD} w-full text-left cursor-pointer hover:bg-slate-50/40 transition-colors`}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-[14px] bg-indigo-500 rounded-full" />
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">직원 현황</h3>
        </div>
        <ChevronRight size={14} className="text-slate-400" />
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-100">
        <div className="px-3 py-2.5 text-center">
          <div className="text-[11px] text-slate-500 font-medium">총원</div>
          <div className="mt-0.5 text-[18px] font-bold tabular-nums text-ink leading-none">
            {stats?.total ?? "-"}
          </div>
        </div>
        <div className="px-3 py-2.5 text-center">
          <div className="text-[11px] text-slate-500 font-medium">근무</div>
          <div className="mt-0.5 text-[18px] font-bold tabular-nums text-emerald-700 leading-none">
            {stats?.onDuty ?? "-"}
          </div>
        </div>
        <div className="px-3 py-2.5 text-center">
          <div className="text-[11px] text-slate-500 font-medium">비번</div>
          <div className="mt-0.5 text-[18px] font-bold tabular-nums text-slate-500 leading-none">
            {stats?.off ?? "-"}
          </div>
        </div>
      </div>
    </button>
  );
};

export default HomeDashboard;
