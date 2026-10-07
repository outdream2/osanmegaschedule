// 2026-10-07 · FINAL VISUAL SPEC (사용자 제공) · STRICT PRESENTATION ONLY
//   · BEHAVIOR DELTA = 0 · 기존 API/handler/state/route/permission 유지
//   · 금지: hero image · gradient card · nested card · sparkline · donut · fake data
//   · 금지: Greeting 32+ · KPI 30+ · Sales amount 30+
//   · 레이아웃: Greeting → KPI 4 → (Sales 9 | Tasks 3) → Quick Actions → (Today Sales 8 | Alerts 4)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet, Users, Receipt, ClipboardCheck,
  Package, Scan, Calendar, Store, MessageSquare, PlusCircle,
  ChevronRight,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import { api } from "../../lib/apiClient";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";

// ─────────────────────────────────────────────────────────────
// Typography scale (STRICT per spec)
// ─────────────────────────────────────────────────────────────
const T = {
  eyebrow:      "text-[13px] text-slate-500 font-medium",
  heroTitle:    "text-[26px] md:text-[28px] font-bold text-ink leading-[1.2] tracking-tight",
  heroDesc:     "text-[13px] md:text-[14px] text-slate-500",
  sectionTitle: "text-[15px] md:text-[16px] font-semibold text-ink tracking-tight",
  kpiLabel:     "text-[12px] md:text-[13px] text-slate-500 font-medium",
  kpiValue:     { fontSize: "clamp(20px, 2.2vw, 24px)" } as React.CSSProperties,
  salesAmount:  { fontSize: "clamp(22px, 2.4vw, 28px)" } as React.CSSProperties,
  taskLabel:    "text-[13px] md:text-[14px] text-ink font-medium",
  taskCount:    "text-[13px] md:text-[14px] font-semibold tabular-nums",
  tableHeader:  "text-[11px] md:text-[12px] text-slate-500 font-medium",
  tableBody:    "text-[12px] md:text-[13px] text-ink",
  qaLabel:      "text-[13px] text-ink font-medium",
  meta:         "text-[11px] md:text-[12px] text-slate-500",
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
  const [hourlyRows, setHourlyRows] = useState<HourlyRow[] | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [dayProducts, setDayProducts] = useState<DaySaleProductItem[] | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);

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

  useEffect(() => { void loadSales(); }, [loadSales]);
  useEffect(() => { void loadDayProducts(); }, [loadDayProducts]);

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

  const dayNames = ["일","월","화","수","목","금","토"];
  const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${dayNames[now.getDay()]}요일`;
  const name = authSession.employeeName;
  const rank = authSession.employeeRank;

  const greetingDesc = isManagerOrAdmin
    ? (totalPending > 0 ? `오늘도 좋은 하루 되세요. 현재 ${totalPending}건의 업무가 진행 중입니다.` : "오늘도 좋은 하루 되세요. 대기 중인 업무가 없습니다.")
    : "오늘도 좋은 하루 되세요.";

  const goTo = (page: Exclude<AppNavPage, "landing">, sub?: string) => () => {
    if (sub) setActiveByPage(page, sub);
    onNavigate(page, authSession);
  };

  const taskItems: TaskItem[] = [
    { label: "연차 승인", count: leavePendingCount, onClick: () => { setActiveByPage("requests", "leave"); onNavigate("requests", authSession); } },
    ...(isAdmin ? [{ label: "거래처 승인", count: requestsCounts.vendor, onClick: () => { setActiveByPage("requests", "vendor"); onNavigate("requests", authSession); } }] : []),
    { label: "진열 요청", count: requestsCounts.display, onClick: () => onNavigate("requests", authSession) },
    { label: "발주 요청", count: requestsCounts.order, onClick: goTo("display") },
    { label: "사직서 승인", count: requestsCounts.resignation, onClick: () => { setActiveByPage("requests", "resignation"); onNavigate("requests", authSession); } },
    ...(isAdmin && paymentPendingCount > 0 ? [{ label: "결제 대기", count: paymentPendingCount, onClick: goTo("business-manage") }] : []),
  ];

  return (
    // Page content container · max-w per spec · padding 24
    <div className="w-full max-w-[1240px] mx-auto flex flex-col gap-4 md:gap-5">
      {/* ═ Greeting · compact (hero image 없음 · gradient 없음 · 78-92px) ═ */}
      <header className="pt-1 pb-1">
        <div className={T.eyebrow}>{dateStr}</div>
        <h1 className={`mt-0.5 ${T.heroTitle}`}>
          안녕하세요, {name}{rank ? ` ${rank}` : ""}님 <span className="inline-block">👋</span>
        </h1>
        <p className={`mt-1 ${T.heroDesc}`}>{greetingDesc}</p>
      </header>

      {/* ═ KPI 4 · height 100-112 · radius 12 · pastel icon · value <=24px ═ */}
      {isManagerOrAdmin && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            icon={<Wallet size={18} className="text-emerald-600" strokeWidth={2.2} />}
            iconBg="bg-emerald-50"
            label="오늘 매출"
            value={todayRows.length === 0 ? "-" : fmtWon(todaySale)}
            loading={salesLoading && hourlyRows === null}
            error={!!salesError && hourlyRows === null}
            onClick={goTo("display", "revenue")}
          />
          <KpiCard
            icon={<Users size={18} className="text-sky-600" strokeWidth={2.2} />}
            iconBg="bg-sky-50"
            label="방문객"
            value={todayRows.length === 0 ? "-" : `${todayCust.toLocaleString("ko-KR")}명`}
            loading={salesLoading && hourlyRows === null}
            error={!!salesError && hourlyRows === null}
            onClick={goTo("display", "revenue")}
          />
          <KpiCard
            icon={<Receipt size={18} className="text-violet-600" strokeWidth={2.2} />}
            iconBg="bg-violet-50"
            label="객단가"
            value={todayCust === 0 ? "-" : fmtWon(avgOrder)}
            loading={salesLoading && hourlyRows === null}
            error={!!salesError && hourlyRows === null}
            onClick={goTo("display", "revenue")}
          />
          <KpiCard
            icon={<ClipboardCheck size={18} className="text-amber-600" strokeWidth={2.2} />}
            iconBg="bg-amber-50"
            label="승인 대기"
            value={`${totalApprovals.toLocaleString("ko-KR")}건`}
            onClick={() => { setActiveByPage("requests", "leave"); onNavigate("requests", authSession); }}
          />
        </section>
      )}

      {/* ═ Main grid · 관리자: 9/3 (Sales + Tasks) · 직원: Tasks full-width (매출 데이터 숨김) ═ */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4">
        {isManagerOrAdmin && (
          <div className="min-w-0 lg:col-span-9 flex">
            <SalesOverviewCard
              loading={salesLoading}
              error={salesError}
              rows={todayRows}
              todaySale={todaySale}
              curHour={curHour}
              onOpen={goTo("display", "revenue")}
            />
          </div>
        )}
        <div className={`min-w-0 flex ${isManagerOrAdmin ? "lg:col-span-3" : "lg:col-span-12"}`}>
          <TodayTasksCard
            totalBadge={totalPending}
            items={taskItems}
            onOpenAll={() => { setActiveByPage("requests", "leave"); onNavigate("requests", authSession); }}
          />
        </div>
      </section>

      {/* ═ Quick Actions · compact horizontal buttons · 74-86px row · no card decoration ═ */}
      <section className={`${CARD} px-4 py-3 flex items-center flex-wrap gap-x-5 gap-y-2`}>
        <div className={`${T.sectionTitle} shrink-0 pr-2 border-r border-slate-200`}>빠른 실행</div>
        <QuickBtn icon={<Package size={16} />} label="상품입고" onClick={goTo("productarrival")} />
        <QuickBtn icon={<Scan size={16} />} label="실재고 확인" onClick={goTo("scan")} />
        <QuickBtn icon={<Calendar size={16} />} label="스케줄표" onClick={goTo("schedule")} />
        <QuickBtn icon={<Store size={16} />} label="매장진열" onClick={goTo("display")} />
        <QuickBtn icon={<PlusCircle size={16} />} label="발주등록" onClick={goTo("display")} />
        <QuickBtn icon={<MessageSquare size={16} />} label="이슈 공유" onClick={goTo("board")} />
      </section>

      {/* ═ Bottom · 관리자: Today Sales 8 + Alerts 4 · 직원: Alerts만 full-width ═ */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4">
        {isManagerOrAdmin && (
          <div className="min-w-0 lg:col-span-8 flex">
            <TodaySalesTable
              loading={productsLoading}
              error={productsError}
              items={dayProducts ?? []}
              onOpen={goTo("display", "revenue")}
            />
          </div>
        )}
        <div className={`min-w-0 flex ${isManagerOrAdmin ? "lg:col-span-4" : "lg:col-span-12"}`}>
          <InventoryAlertsCard
            items={[
              { label: "실재고 확인 요청", count: requestsCounts.inventory, onClick: goTo("scan") },
              { label: "입고 예정 상품", count: 0, onClick: goTo("productarrival"), dim: true },
              { label: "유통기한 임박", count: 0, onClick: goTo("stockcheck"), dim: true },
              { label: "반품 요청", count: requestsCounts.return, onClick: goTo("requests") },
            ]}
          />
        </div>
      </section>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// KpiCard · white card · 1px border · pastel icon · value <=24
// ─────────────────────────────────────────────────────────────
interface KpiCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  loading?: boolean;
  error?: boolean;
  onClick: () => void;
}

const KpiCard: React.FC<KpiCardProps> = ({ icon, iconBg, label, value, loading, error, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`${CARD} text-left cursor-pointer min-w-0 p-4 min-h-[100px] flex items-center gap-3 hover:border-slate-300 transition-colors`}
  >
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-[10px] shrink-0 ${iconBg}`}>{icon}</span>
    <div className="flex flex-col min-w-0 gap-0.5">
      <span className={`${T.kpiLabel} break-keep`}>{label}</span>
      {loading ? (
        <SkeletonBar className="h-6 w-28" />
      ) : error ? (
        <div className="text-[14px] text-rose-500 font-semibold">조회 실패</div>
      ) : (
        <div
          className="font-bold tabular-nums text-ink leading-tight whitespace-nowrap tracking-tight"
          style={T.kpiValue}
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
  curHour: number;
  onOpen: () => void;
}

const SalesOverviewCard: React.FC<SalesOverviewProps> = ({ loading, error, rows, todaySale, curHour, onOpen }) => {
  const chartData = useMemo(() =>
    rows
      .map(r => ({ hour: parseHour(r.SaleTime), sale: Number(r.SaleTotal ?? 0) }))
      .sort((a, b) => a.hour - b.hour)
      .map(d => ({ label: `${d.hour}시`, sale: d.sale, isNow: d.hour === curHour })),
    [rows, curHour]);

  // 전일 매출 데이터 없음 → 섹션 숨김 (fake 금지)
  return (
    <div className={`${CARD} w-full flex flex-col min-h-[280px]`}>
      {/* Header · accent bar + title + metric selector right */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className="w-[3px] h-[16px] bg-blue-500 rounded-full" />
          <h3 className={T.sectionTitle}>매출 현황</h3>
          <span className={`${T.meta} ml-1`}>· 오늘</span>
        </div>
        <button type="button" onClick={onOpen} className="text-[13px] text-blue-600 font-semibold hover:underline cursor-pointer flex items-center gap-0.5">
          매출 상세 <ChevronRight size={13} />
        </button>
      </div>

      {/* Summary (left 30%) + Chart (right 70%) · desktop grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-10 gap-0">
        {/* Summary */}
        <div className="md:col-span-3 px-5 py-4 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col gap-3">
          <div>
            <div className={T.kpiLabel}>오늘 매출</div>
            {loading && rows.length === 0 ? (
              <SkeletonBar className="h-8 w-40 mt-1" />
            ) : (
              <div
                className="font-bold tabular-nums text-ink leading-tight tracking-tight mt-0.5"
                style={T.salesAmount}
              >
                {error ? "-" : rows.length === 0 ? "-" : fmtWon(todaySale)}
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className={T.kpiLabel}>현재 시간</span>
              <span className="text-[13px] font-semibold tabular-nums text-ink">{curHour}시</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className={T.kpiLabel}>집계 시간대</span>
              <span className="text-[13px] font-semibold tabular-nums text-ink">{rows.length}개</span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="md:col-span-7 min-h-[200px] px-3 py-3">
          {error ? (
            <div className="h-full flex items-center justify-center text-[13px] text-rose-500">ERP 조회 실패</div>
          ) : loading && rows.length === 0 ? (
            <div className="h-full px-2 flex items-end gap-1.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <SkeletonBar key={i} className="flex-1" style={{ height: `${30 + Math.sin(i * 1.3) * 30 + 60}%` }} />
              ))}
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[13px] text-slate-400">데이터 없음</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(0)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`} />
                <Tooltip
                  formatter={(v: number) => fmtWon(v)}
                  contentStyle={{ fontSize: 12, borderRadius: 8, padding: "6px 10px", border: "1px solid #e2e8f0" }}
                  cursor={{ fill: "rgba(59,130,246,0.06)" }}
                />
                <Bar dataKey="sale" radius={[3, 3, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.isNow ? "#2563eb" : "#93c5fd"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
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
  return (
    <div className={`${CARD} w-full flex flex-col min-h-[280px]`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <h3 className={T.sectionTitle}>오늘 처리할 업무</h3>
          <span className={`text-[12px] font-semibold tabular-nums px-2 py-0.5 rounded-full ${totalBadge > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
            {totalBadge}
          </span>
        </div>
        <button type="button" onClick={onOpenAll} className="text-[12px] text-blue-600 font-semibold hover:underline cursor-pointer flex items-center gap-0.5">
          전체보기 <ChevronRight size={12} />
        </button>
      </div>
      {allZero ? (
        <div className="flex-1 flex items-center justify-center text-[13px] text-slate-400">
          처리할 업무가 없습니다
        </div>
      ) : (
        <div className="divide-y divide-slate-100 flex-1">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={it.onClick}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/70 transition-colors cursor-pointer min-h-[48px]"
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
  );
};

// ─────────────────────────────────────────────────────────────
// QuickBtn · compact horizontal button (card 아님 · 작은 button)
// ─────────────────────────────────────────────────────────────
const QuickBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-2 h-10 px-3 rounded-[8px] text-slate-700 hover:bg-slate-50 hover:text-ink transition-colors cursor-pointer"
  >
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-[8px] bg-slate-100 text-slate-600 shrink-0">
      {icon}
    </span>
    <span className={T.qaLabel}>{label}</span>
  </button>
);

// ─────────────────────────────────────────────────────────────
// TodaySalesTable · dense table · 7-col (No/상품명/바코드/카테고리/수량/매출/시간)
// ─────────────────────────────────────────────────────────────
interface TodaySalesTableProps {
  loading: boolean;
  error: string | null;
  items: DaySaleProductItem[];
  onOpen: () => void;
}

const TodaySalesTable: React.FC<TodaySalesTableProps> = ({ loading, error, items, onOpen }) => {
  const topItems = useMemo(() =>
    [...items]
      .filter(it => Number(it.saleTotal ?? 0) > 0)
      .sort((a, b) => Number(b.saleTotal ?? 0) - Number(a.saleTotal ?? 0))
      .slice(0, 10),
    [items]);

  return (
    <div className={`${CARD} w-full flex flex-col min-h-[300px]`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <h3 className={T.sectionTitle}>오늘의 판매현황</h3>
          <span className={`${T.meta}`}>· 실시간 ERP</span>
        </div>
        <button type="button" onClick={onOpen} className="text-[12px] text-blue-600 font-semibold hover:underline cursor-pointer flex items-center gap-0.5">
          전체보기 <ChevronRight size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-x-auto">
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
          <div className="h-full flex items-center justify-center text-[13px] text-rose-500 py-10">ERP 조회 실패</div>
        ) : topItems.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[13px] text-slate-400 py-10">오늘 판매된 상품이 없습니다</div>
        ) : (
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className={`${T.tableHeader} text-left px-3 py-2 w-10`}>No</th>
                <th className={`${T.tableHeader} text-left px-3 py-2`}>상품명</th>
                <th className={`${T.tableHeader} text-left px-3 py-2 w-28 hidden md:table-cell`}>바코드</th>
                <th className={`${T.tableHeader} text-right px-3 py-2 w-16`}>수량</th>
                <th className={`${T.tableHeader} text-right px-3 py-2 w-28`}>매출</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topItems.map((it, i) => {
                const sale = Number(it.saleTotal ?? 0);
                const qty = Number(it.totalStock ?? 0);
                return (
                  <tr key={`${it.pcode ?? i}`} className="hover:bg-slate-50/60 transition-colors">
                    <td className={`${T.tableBody} px-3 py-2 tabular-nums text-slate-400`}>{i + 1}</td>
                    <td className={`${T.tableBody} px-3 py-2 font-medium break-keep leading-snug`}>{it.productName ?? "(상품명 없음)"}</td>
                    <td className={`${T.tableBody} px-3 py-2 tabular-nums text-slate-500 hidden md:table-cell`}>{it.pcode ?? "-"}</td>
                    <td className={`${T.tableBody} px-3 py-2 tabular-nums text-right`}>{qty.toLocaleString("ko-KR")}</td>
                    <td className={`${T.tableBody} px-3 py-2 tabular-nums text-right font-semibold text-ink`}>{fmtWon(sale)}</td>
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

// ─────────────────────────────────────────────────────────────
// InventoryAlertsCard · 4 rows · dense · count semantic emphasis
// ─────────────────────────────────────────────────────────────
interface AlertItem { label: string; count: number; onClick: () => void; dim?: boolean; }
interface AlertsProps { items: AlertItem[]; }

const InventoryAlertsCard: React.FC<AlertsProps> = ({ items }) => {
  const hasAny = items.some(it => it.count > 0 && !it.dim);
  return (
    <div className={`${CARD} w-full flex flex-col min-h-[300px]`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
        <h3 className={T.sectionTitle}>입고 · 재고 알림</h3>
      </div>
      {!hasAny ? (
        <div className="flex-1 flex items-center justify-center text-[13px] text-slate-400">
          확인할 알림이 없습니다
        </div>
      ) : (
        <div className="divide-y divide-slate-100 flex-1">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={it.onClick}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/70 transition-colors cursor-pointer min-h-[48px]"
            >
              <span className={`${T.taskLabel} ${it.count === 0 || it.dim ? "text-slate-400" : ""}`}>{it.label}</span>
              <span className="flex items-center gap-1.5">
                <span className={`${T.taskCount} ${it.count === 0 || it.dim ? "text-slate-400" : "text-rose-600"}`}>{it.count}</span>
                <ChevronRight size={13} className="text-slate-300" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default HomeDashboard;
