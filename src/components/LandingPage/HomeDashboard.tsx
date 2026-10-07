// 2026-10-07 · 2026 Operations Dashboard · VISUAL POLISH PASS
//   · Target reference image (사용자 제공) 기반 typography/spacing/density 통일
//   · Typography scale 고정 (DESKTOP/MOBILE 분리) · text-sm/base/lg 등 generic 금지
//   · 기존 API 재사용 (sale-hourly-report + requests/pending-counts) · 새 계산식 금지
//   · Schedule V1 FROZEN · route/permission 유지 · 말줄임표 금지

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet, Users, Receipt, ClipboardCheck,
  Package, Scan, Calendar, Store, MessageSquare,
  ChevronRight, FileWarning, RotateCcw,
} from "lucide-react";
import { XAxis, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from "recharts";
import { api } from "../../lib/apiClient";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";

// ─────────────────────────────────────────────────────────────
// Typography scale (DESKTOP + MOBILE) · spec 기반 고정
// ─────────────────────────────────────────────────────────────
// 2026-10-07 · 사용자 지시 · 전체 라벨/글씨 +1 bump · 큰 여유있는 사이즈
const T = {
  eyebrow:    "text-[13px] sm:text-[14px] text-slate-500 font-medium tracking-wide",
  heroTitle:  "text-[25px] sm:text-[29px] md:text-[31px] font-bold text-ink tracking-tight leading-[1.2]",
  heroDesc:   "text-[14px] sm:text-[15px] text-slate-500 leading-[1.5]",
  sectionTitle: "text-[17px] sm:text-[18px] font-semibold text-ink tracking-tight",
  cardLabel:  "text-[13px] sm:text-[14px] text-slate-500 font-medium",
  kpiValue:   { fontSize: "clamp(17px, 2.1vw, 21px)" } as React.CSSProperties,
  taskLabel:  "text-[14px] sm:text-[15px] text-ink font-medium",
  taskCount:  "text-[14px] sm:text-[15px] font-semibold tabular-nums",
  qaTitle:    "text-[15px] sm:text-[16px] font-semibold text-ink",
  qaDesc:     "text-[13px] sm:text-[14px] text-slate-500 leading-[1.45]",
  meta:       "text-[13px] sm:text-[14px] text-slate-500",
} as const;

interface HourlyRow { SaleDate: string; SaleTime: string; CustomerCnt: number; SaleTotal: number; }
interface HourlyApiResponse { ok: boolean; schemaMismatch?: boolean; rows?: HourlyRow[]; error?: string; }

// 2026-10-07 · 오늘의 판매현황 상품 · RevenuePage 월달력 모달 endpoint 재사용 (SSOT)
interface DaySaleProductItem {
  pcode: string | null;
  productName: string | null;
  unitSale: number | null;
  totalStock: number | null;  // 수량
  saleTotal: number | null;
  margin: number | null;
}
// 2026-10-07 · 매출 구성 비율 · byClass (상비약/일반/뷰티/미분류)
interface DayClassStats { quantity: number | null; saleTotal: number | null; count: number; }
interface DayByClass {
  stationery: DayClassStats;  // 상비약
  general: DayClassStats;     // 일반
  cosmetics: DayClassStats;   // 뷰티
  unknown: DayClassStats;     // 미분류
}
interface DayProductApiResponse {
  ok: boolean;
  items?: DaySaleProductItem[];
  totals?: { quantity?: number | null; saleTotal?: number | null };
  byClass?: DayByClass;
  error?: string;
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

  // 2026-10-07 · 오늘의 판매현황 상품 + byClass 매출 구성 · RevenuePage DayDetailModal 과 동일 endpoint (SSOT)
  const [dayProducts, setDayProducts] = useState<DaySaleProductItem[] | null>(null);
  const [dayByClass, setDayByClass] = useState<DayByClass | null>(null);
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
    } catch (e) {
      setSalesError((e as Error).message); setHourlyRows(null);
    } finally { setSalesLoading(false); }
  }, [isManagerOrAdmin]);

  const loadDayProducts = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    setProductsLoading(true); setProductsError(null);
    try {
      const y = todayYmd();
      const r = await api.get<DayProductApiResponse>(`/api/erp/sale-day-products?date=${y}`);
      if (!r.data.ok) throw new Error(r.data.error ?? "판매현황 조회 실패");
      setDayProducts(r.data.items ?? []);
      setDayByClass(r.data.byClass ?? null);
    } catch (e) {
      setProductsError((e as Error).message); setDayProducts(null); setDayByClass(null);
    } finally { setProductsLoading(false); }
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
    ? (totalPending > 0
        ? `오늘 처리할 업무가 ${totalPending}건 있습니다.`
        : "오늘 대기 중인 승인/요청이 없습니다.")
    : "오늘도 좋은 하루 되세요.";

  const goTo = (page: Exclude<AppNavPage, "landing">, sub?: string) => () => {
    if (sub) setActiveByPage(page, sub);
    onNavigate(page, authSession);
  };

  return (
    // Content max-width 1240 · spec 31: section gap 32px desktop (gap-8 lg+)
    <div className="w-full mx-auto max-w-[1240px] flex flex-col gap-5 sm:gap-6 lg:gap-8">
      {/* ═══ Hero · compact · soft blue-gray abstract bg (pharmacy asset 없음 → spec fallback) ═══ */}
      <header className="w-full relative rounded-2xl overflow-hidden border border-slate-200/70 bg-gradient-to-br from-slate-50 via-white to-sky-50/40 px-5 sm:px-6 py-4 sm:py-5">
        {/* subtle depth · very low opacity · readability 우선 · no giant blob (spec 7) */}
        <div aria-hidden className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-sky-100/20 blur-2xl pointer-events-none" />
        <div className="relative">
          <div className={T.eyebrow}>{dateStr}</div>
          <h1 className={`mt-1 ${T.heroTitle}`}>
            안녕하세요, {name}{rank ? ` ${rank}` : ""}님 <span className="inline-block">👋</span>
          </h1>
          <p className={`mt-1.5 ${T.heroDesc}`}>{greetingDesc}</p>
        </div>
      </header>

      {/* ═══ Row 2 · 레퍼런스 매칭 · 3 metrics (sparkline 포함) + 승인업무 count card 분리 ═══ */}
      {isManagerOrAdmin && (
        <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* 3 metrics 통합 바 (col-span-3) */}
          <div className="lg:col-span-3 min-w-0">
            <UnifiedMetricsCard
              loading={salesLoading && hourlyRows === null}
              error={!!salesError && hourlyRows === null}
              metrics={[
                {
                  icon: <Wallet size={18} strokeWidth={2.2} />,
                  tone: "emerald",
                  label: "오늘 매출",
                  value: todayRows.length === 0 ? "-" : fmtWon(todaySale),
                  onClick: goTo("display", "revenue"),
                },
                {
                  icon: <Users size={18} strokeWidth={2.2} />,
                  tone: "sky",
                  label: "방문객",
                  value: todayRows.length === 0 ? "-" : `${todayCust.toLocaleString("ko-KR")}명`,
                  onClick: goTo("display", "revenue"),
                },
                {
                  icon: <Receipt size={18} strokeWidth={2.2} />,
                  tone: "violet",
                  label: "객단가",
                  value: todayCust === 0 ? "-" : fmtWon(avgOrder),
                  onClick: goTo("display", "revenue"),
                },
              ]}
            />
          </div>

          {/* 승인업무 big count card (col-span-1) · orange highlight · 레퍼런스 매칭 */}
          <div className="lg:col-span-1 min-w-0 flex">
            <ApprovalCountCard
              count={totalApprovals}
              breakdown={[
                leavePendingCount > 0 ? `연차 ${leavePendingCount}` : null,
                requestsCounts.resignation > 0 ? `사직서 ${requestsCounts.resignation}` : null,
                (isAdmin && requestsCounts.vendor > 0) ? `거래처 ${requestsCounts.vendor}` : null,
              ].filter(Boolean).join(" · ")}
              onClick={() => { setActiveByPage("requests", "leave"); onNavigate("requests", authSession); }}
            />
          </div>
        </section>
      )}

      {/* ═══ Row 2 · 레퍼런스 신규 · Sales (2/3 wide) + Tasks (1/3) 가로 split ═══ */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Sales · 중앙 · 가장 prominent · col-span-2 */}
        <div className="min-w-0 lg:col-span-2 flex">
          <SalesCard
            loading={salesLoading}
            error={salesError}
            rows={todayRows}
            todaySale={todaySale}
            curHour={curHour}
            byClass={dayByClass}
            onOpen={goTo("display", "revenue")}
            onRetry={() => void loadSales()}
          />
        </div>

        {/* Tasks · 우측 1/3 */}
        <div className="min-w-0 lg:col-span-1 flex">
          <TaskQueueCard
            title="오늘 처리할 업무"
            totalBadge={totalPending}
            items={[
              { label: "연차 승인", count: leavePendingCount, onClick: () => { setActiveByPage("requests", "leave"); onNavigate("requests", authSession); } },
              { label: "사직서 승인", count: requestsCounts.resignation, onClick: () => { setActiveByPage("requests", "resignation"); onNavigate("requests", authSession); } },
              ...(isAdmin ? [{ label: "거래처 승인", count: requestsCounts.vendor, onClick: () => { setActiveByPage("requests", "vendor"); onNavigate("requests", authSession); } }] : []),
              { label: "진열 요청", count: requestsCounts.display, onClick: () => onNavigate("requests", authSession) },
              { label: "발주 요청", count: requestsCounts.order, onClick: goTo("display") },
              ...(isAdmin && paymentPendingCount > 0 ? [{ label: "결제 대기", count: paymentPendingCount, onClick: goTo("business-manage") }] : []),
            ]}
          />
        </div>
      </section>

      {/* ═══ Row 4 · 오늘의 판매현황 (2/3) + 입고·재고 알림 (1/3) · 레퍼머 매칭 ═══ */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2 flex">
          <TodaySalesCard
            loading={productsLoading}
            error={productsError}
            items={dayProducts ?? []}
            onOpen={goTo("display", "revenue")}
          />
        </div>
        <div className="min-w-0 lg:col-span-1 flex">
          <StockAlertsCard
            items={[
              { label: "실재고 확인 요청", count: requestsCounts.inventory, onClick: goTo("scan") },
              { label: "입고 예정 상품", count: 0, onClick: goTo("productarrival"), dim: true },
              { label: "유통기한 임박", count: 0, onClick: goTo("stockcheck"), dim: true },
              { label: "반품 요청", count: requestsCounts.return, onClick: goTo("requests") },
            ]}
          />
        </div>
      </section>

      {/* ═══ Row 4 · Quick Actions · 5 cards full width ═══ */}
      <section>
        <SectionHeader>빠른 실행</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <QuickActionCard icon={<Package size={20} strokeWidth={2.2} />} title="상품입고" desc="바코드 스캔으로 입고 상품 등록" onClick={goTo("productarrival")} tone="coral" />
          <QuickActionCard icon={<Scan size={20} strokeWidth={2.2} />} title="실재고 확인" desc="바코드 스캔 · 실재고·진열보충 요청" onClick={goTo("scan")} tone="amber" />
          <QuickActionCard icon={<Calendar size={20} strokeWidth={2.2} />} title="스케줄표" desc="직원 월간 근무 스케줄 확인 및 관리" onClick={goTo("schedule")} tone="sky" />
          <QuickActionCard icon={<Store size={20} strokeWidth={2.2} />} title="매장진열" desc="매장 진열 상태 관리 · 보충 요청" onClick={goTo("display")} tone="emerald" />
          <QuickActionCard icon={<MessageSquare size={20} strokeWidth={2.2} />} title="이슈 공유" desc="질문·이슈·메모 공유 게시판" onClick={goTo("board")} tone="violet" />
        </div>
      </section>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════
// Sub components · typography/radius/shadow/border 통일
// ═════════════════════════════════════════════════════════════

const CARD_BASE = "bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(10,20,40,0.04)]";
const CARD_HOVER = "transition hover:border-slate-300 hover:shadow-[0_2px_6px_rgba(10,20,40,0.06)]";

// ─────────────────────────────────────────────────────────────
// UnifiedMetricsCard · 통합 metrics bar (단일 카드 · 내부 divider · 2026 trend)
// 최신 트렌드 핵심:
//   · 하나의 큰 흰 카드 · 내부 subtle divide-x/divide-y
//   · 각 cell · icon + label + value (vertical stack)
//   · Soft hover · 각 cell 개별 highlight
//   · Icon container · pastel bg · smooth tint 변화
//   · No multi-color 카드 bg (화려함 제거)
// ─────────────────────────────────────────────────────────────
// 2026-10-07 · 사용자 지시 · 컬러 포인트 · 약간 화려 · 2026 trend (gradient icon · colored shadow · subtle depth)
type MetricTone = "emerald" | "sky" | "violet" | "amber";
const METRIC_TONE: Record<MetricTone, { iconBg: string; iconText: string; hoverBg: string; valueText: string }> = {
  emerald: { iconBg: "bg-gradient-to-br from-emerald-100 to-emerald-50", iconText: "text-emerald-600", hoverBg: "hover:bg-emerald-50/50", valueText: "text-emerald-700" },
  sky:     { iconBg: "bg-gradient-to-br from-sky-100 to-sky-50",         iconText: "text-sky-600",     hoverBg: "hover:bg-sky-50/50",     valueText: "text-sky-700" },
  violet:  { iconBg: "bg-gradient-to-br from-violet-100 to-violet-50",   iconText: "text-violet-600",  hoverBg: "hover:bg-violet-50/50",  valueText: "text-violet-700" },
  amber:   { iconBg: "bg-gradient-to-br from-amber-100 to-amber-50",     iconText: "text-amber-600",   hoverBg: "hover:bg-amber-50/50",   valueText: "text-amber-700" },
};

interface MetricItem {
  icon: React.ReactNode;
  tone: MetricTone;
  label: string;
  value: string;
  sub?: string;
  onClick: () => void;
}
interface UnifiedMetricsCardProps {
  metrics: MetricItem[];
  loading?: boolean;
  error?: boolean;
}

// 2026-10-07 · 사용자 지시 · 컬러 포인트 · gradient icon · tone-adaptive value color · 2026 trend
const UnifiedMetricsCard: React.FC<UnifiedMetricsCardProps> = ({ metrics, loading, error }) => (
  <div className="bg-white border border-slate-200 rounded-2xl shadow-[0_1px_3px_rgba(10,20,40,0.04),0_6px_16px_-10px_rgba(10,20,40,0.08)] overflow-hidden h-full">
    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 h-full">
      {metrics.map((m, i) => {
        const t = METRIC_TONE[m.tone];
        return (
          <button
            key={i}
            type="button"
            onClick={m.onClick}
            className={`text-left px-5 py-4 min-h-[100px] flex items-center gap-3 min-w-0 ${t.hoverBg} transition-all duration-200 cursor-pointer group relative overflow-hidden`}
          >
            {/* subtle color accent on hover · bottom gradient line */}
            <span aria-hidden className={`absolute left-0 right-0 bottom-0 h-[2px] ${t.iconText.replace("text-", "bg-")} opacity-0 group-hover:opacity-80 transition-opacity`} />
            <span className={`inline-flex items-center justify-center w-11 h-11 rounded-[12px] shrink-0 ${t.iconBg} ${t.iconText} shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)] transition-transform group-hover:scale-105`}>
              {m.icon}
            </span>
            <div className="flex flex-col min-w-0 gap-0.5">
              <span className={T.cardLabel + " break-keep"}>{m.label}</span>
              {loading ? (
                <SkeletonBar className="h-6 w-28" />
              ) : error ? (
                <div className="text-[14px] text-rose-500 font-semibold">조회 실패</div>
              ) : (
                <div
                  className={`font-bold tabular-nums ${t.valueText} leading-tight whitespace-nowrap tracking-tight`}
                  style={T.kpiValue}
                  title={m.value}
                >
                  {m.value}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// ApprovalCountCard · 승인업무 count card (orange highlight · big number)
// 레퍼런스 Row 2 우측 분리 카드 매칭
// ─────────────────────────────────────────────────────────────
interface ApprovalCountCardProps {
  count: number;
  breakdown?: string;
  onClick: () => void;
}

// 2026 trend · gradient card bg · colored shadow · hover lift
const ApprovalCountCard: React.FC<ApprovalCountCardProps> = ({ count, breakdown, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="cursor-pointer min-w-0 w-full flex flex-col justify-between p-5 min-h-[100px] relative overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50 via-white to-orange-50/40 shadow-[0_1px_3px_rgba(217,119,6,0.08),0_6px_16px_-10px_rgba(217,119,6,0.25)] hover:shadow-[0_4px_12px_rgba(217,119,6,0.12),0_12px_24px_-10px_rgba(217,119,6,0.35)] transition-all duration-200 group text-left"
  >
    <div aria-hidden className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-amber-200/30 blur-2xl pointer-events-none" />
    <div className="relative flex items-center gap-3">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-[12px] shrink-0 bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-[0_2px_6px_rgba(217,119,6,0.3)] transition-transform group-hover:scale-105">
        <ClipboardCheck size={20} strokeWidth={2.2} />
      </span>
      <span className="text-[14px] sm:text-[15px] text-amber-900 font-semibold tracking-tight break-keep">오늘 처리할 업무</span>
    </div>
    <div className="relative mt-2 flex items-baseline gap-1.5">
      <div
        className="font-bold tabular-nums text-amber-700 leading-[1.1] tracking-tight"
        style={{ fontSize: "clamp(28px, 3.6vw, 36px)" }}
      >
        {count}
      </div>
      <div className="text-[14px] text-amber-700/70 font-semibold">건</div>
    </div>
    {breakdown && (
      <div className="relative mt-0.5 text-[12px] sm:text-[13px] text-amber-700/70 break-keep leading-snug font-medium">{breakdown}</div>
    )}
  </button>
);

const SkeletonBar: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = "", style }) => (
  <div className={`bg-slate-200/70 rounded animate-pulse ${className}`} style={style} />
);

const SectionHeader: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-center justify-between gap-2 mb-3">
    <div className="flex items-center gap-2.5">
      <span className="w-[3px] h-[18px] rounded-full bg-slate-400" />
      <span className={T.sectionTitle}>{children}</span>
    </div>
    {right}
  </div>
);

interface TaskItem { label: string; count: number; onClick: () => void; dotColor?: string; }
interface TaskQueueCardProps { title: string; totalBadge: number; items: TaskItem[]; }

const TaskQueueCard: React.FC<TaskQueueCardProps> = ({ title, totalBadge, items }) => {
  const allZero = items.every(it => it.count === 0);
  return (
    <div className={`${CARD_BASE} overflow-hidden min-h-[300px] w-full flex flex-col`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h3 className={T.sectionTitle}>{title}</h3>
        <span className={`text-[13px] font-bold tabular-nums px-2.5 py-0.5 rounded-full ${totalBadge > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
          {totalBadge}
        </span>
      </div>
      {allZero ? (
        <div className="flex-1 flex items-center justify-center text-[14px] text-slate-400">
          처리할 업무가 없습니다
        </div>
      ) : (
        <div className="divide-y divide-slate-100 flex-1">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={it.onClick}
              className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/60 transition cursor-pointer min-h-[46px]`}
            >
              <span className={`${T.taskLabel} ${it.count === 0 ? "text-slate-400" : ""}`}>{it.label}</span>
              <span className="flex items-center gap-1.5">
                <span className={`${T.taskCount} ${it.count === 0 ? "text-slate-400" : "text-amber-700"}`}>{it.count}</span>
                <ChevronRight size={14} className="text-slate-300" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface SalesCardProps {
  loading: boolean;
  error: string | null;
  rows: HourlyRow[];
  todaySale: number;
  curHour: number;
  byClass: DayByClass | null;
  onOpen: () => void;
  onRetry: () => void;
}

// 매출 구성 비율 · byClass → donut data · 상비약/일반/뷰티
const CLASS_LABEL: Record<keyof DayByClass, string> = {
  general: "일반", stationery: "상비약", cosmetics: "뷰티", unknown: "미분류",
};
const CLASS_COLOR: Record<keyof DayByClass, string> = {
  general: "#0ea5e9", stationery: "#10b981", cosmetics: "#ec4899", unknown: "#94a3b8",
};

const SalesCard: React.FC<SalesCardProps> = ({ loading, error, rows, todaySale, curHour, byClass, onOpen, onRetry }) => {
  const chartData = useMemo(() =>
    rows
      .map(r => ({ hour: parseHour(r.SaleTime), sale: Number(r.SaleTotal ?? 0) }))
      .sort((a, b) => a.hour - b.hour)
      .map(d => ({ label: `${d.hour}시`, sale: d.sale, isNow: d.hour === curHour })),
    [rows, curHour]);

  return (
    <div className={`${CARD_BASE} overflow-hidden min-h-[300px] w-full flex flex-col`}>
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className={T.sectionTitle}>오늘의 판매현황</h3>
          <span className="text-[12px] text-slate-400 shrink-0 font-medium">실시간 ERP</span>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="text-[13px] text-brand-deep font-semibold hover:underline cursor-pointer flex items-center gap-0.5 shrink-0"
        >
          매출 상세 <ChevronRight size={13} />
        </button>
      </div>
      <div className="px-5 pb-2">
        <div className="flex items-end gap-2">
          {loading && rows.length === 0 ? (
            <SkeletonBar className="h-8 w-44" />
          ) : (
            <div className="font-bold tabular-nums text-emerald-700 leading-tight tracking-tight" style={{ fontSize: "clamp(23px, 3.3vw, 31px)" }}>
              {error ? "-" : rows.length === 0 ? "-" : fmtWon(todaySale)}
            </div>
          )}
          <div className={`${T.meta} mb-1`}>누적 매출</div>
        </div>
      </div>
      {/* 좌 area chart (매출 추이) + 우 donut (매출 구성 비율 · 상비약/일반/뷰티) */}
      <div className="flex-1 min-h-[180px] grid grid-cols-1 md:grid-cols-5 gap-2 px-2 pb-3">
        <div className="md:col-span-3 min-h-[180px]">
          {error ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-[14px] text-rose-500">
              <div>ERP 조회 실패</div>
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 px-3 py-1 border border-rose-300 text-rose-600 rounded-md text-[13px] font-semibold hover:bg-rose-50 cursor-pointer"
              >
                <RotateCcw size={13} /> 다시 시도
              </button>
            </div>
          ) : loading && rows.length === 0 ? (
            <div className="h-full px-2 flex items-end gap-1.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <SkeletonBar key={i} className="flex-1" style={{ height: `${30 + Math.sin(i * 1.3) * 30 + 60}%` }} />
              ))}
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[14px] text-slate-400">데이터 없음</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 12, bottom: 8, left: 12 }}>
                <defs>
                  <linearGradient id="sales-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => fmtWon(v)}
                  contentStyle={{ fontSize: 12, borderRadius: 8, padding: "6px 10px", border: "1px solid #e2e8f0" }}
                  cursor={{ stroke: "#10b981", strokeOpacity: 0.3, strokeDasharray: "3 3" }}
                />
                <Area
                  dataKey="sale" type="monotone" stroke="#059669" strokeWidth={2}
                  fill="url(#sales-area)" isAnimationActive={false}
                  activeDot={{ r: 4, fill: "#059669", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        {/* 매출 구성 비율 donut · 상비약/일반/뷰티 */}
        <div className="md:col-span-2 min-h-[180px] flex flex-col">
          <div className="text-[13px] sm:text-[14px] text-slate-500 font-medium px-2 pt-1">매출 구성 비율</div>
          <SalesClassDonut byClass={byClass} />
        </div>
      </div>
    </div>
  );
};

// 매출 구성 donut · 상비약/일반/뷰티/(미분류)
const SalesClassDonut: React.FC<{ byClass: DayByClass | null }> = ({ byClass }) => {
  const data = useMemo(() => {
    if (!byClass) return [];
    const keys: Array<keyof DayByClass> = ["general", "stationery", "cosmetics", "unknown"];
    return keys
      .map(k => ({ key: k, name: CLASS_LABEL[k], value: Number(byClass[k]?.saleTotal ?? 0), color: CLASS_COLOR[k] }))
      .filter(d => d.value > 0);
  }, [byClass]);
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!byClass || total === 0) {
    return <div className="flex-1 flex items-center justify-center text-[13px] text-slate-400">데이터 없음</div>;
  }
  return (
    <div className="flex-1 grid grid-cols-5 gap-1 min-h-0">
      <div className="col-span-3 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius="55%" outerRadius="85%" paddingAngle={2} isAnimationActive={false} stroke="none">
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip
              formatter={(v: number, name) => [fmtWon(v), name]}
              contentStyle={{ fontSize: 12, borderRadius: 8, padding: "6px 10px", border: "1px solid #e2e8f0" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="col-span-2 flex flex-col justify-center gap-1.5 pr-2 min-w-0">
        {data.map((d) => {
          const pct = total > 0 ? (d.value / total * 100) : 0;
          return (
            <div key={d.key} className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="text-[13px] sm:text-[14px] text-slate-600 font-medium break-keep">{d.name}</span>
              <span className="ml-auto text-[13px] sm:text-[14px] text-slate-500 tabular-nums shrink-0">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface StockAlertItem { label: string; count: number; onClick: () => void; dim?: boolean; }
interface StockAlertsCardProps { items: StockAlertItem[]; }

// ─────────────────────────────────────────────────────────────
// TodaySalesCard · 오늘의 판매현황 · /api/erp/sale-day-products
// RevenuePage 월달력 일자 클릭 모달과 동일 endpoint 재사용 (SSOT · 계산 복제 X)
// ─────────────────────────────────────────────────────────────
interface TodaySalesCardProps {
  loading: boolean;
  error: string | null;
  items: DaySaleProductItem[];
  onOpen: () => void;
}

const TodaySalesCard: React.FC<TodaySalesCardProps> = ({ loading, error, items, onOpen }) => {
  // 상위 매출 TOP · 매출액 내림차순 · 7건
  const topItems = useMemo(() =>
    [...items]
      .filter(it => Number(it.saleTotal ?? 0) > 0)
      .sort((a, b) => Number(b.saleTotal ?? 0) - Number(a.saleTotal ?? 0))
      .slice(0, 7),
    [items]);

  return (
    <div className={`${CARD_BASE} overflow-hidden w-full flex flex-col`}>
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className={T.sectionTitle}>오늘의 판매현황</h3>
          <span className="text-[12px] text-slate-400 font-medium">실시간 ERP · TOP {topItems.length}</span>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="text-[13px] text-brand-deep font-semibold hover:underline cursor-pointer flex items-center gap-0.5 shrink-0"
        >
          전체보기 <ChevronRight size={13} />
        </button>
      </div>
      {loading && items.length === 0 ? (
        <div className="divide-y divide-slate-100 flex-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-3 flex items-center justify-between">
              <SkeletonBar className="h-4 w-40" />
              <SkeletonBar className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-[14px] text-rose-500 py-10">
          ERP 조회 실패
        </div>
      ) : topItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[14px] text-slate-400 py-10">
          오늘 판매된 상품이 없습니다
        </div>
      ) : (
        <div className="divide-y divide-slate-100 flex-1">
          {topItems.map((it, i) => {
            const sale = Number(it.saleTotal ?? 0);
            const qty = Number(it.totalStock ?? 0);
            return (
              <div key={`${it.pcode ?? i}`} className="px-5 py-3 flex items-center gap-3 min-w-0">
                <span className="w-5 text-[12px] font-bold tabular-nums text-slate-400 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] sm:text-[14px] font-medium text-ink break-keep leading-snug">
                    {it.productName ?? "(상품명 없음)"}
                  </div>
                  <div className="text-[11px] sm:text-[12px] text-slate-500 tabular-nums mt-0.5">
                    {qty > 0 && `${qty}개`}{qty > 0 && it.unitSale ? " · " : ""}{it.unitSale ? fmtWon(it.unitSale) : ""}
                  </div>
                </div>
                <div className="text-[13px] sm:text-[14px] font-bold tabular-nums text-emerald-700 whitespace-nowrap shrink-0">
                  {fmtWon(sale)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const StockAlertsCard: React.FC<StockAlertsCardProps> = ({ items }) => {
  const hasAny = items.some(it => it.count > 0 && !it.dim);
  return (
    <div className={`${CARD_BASE} overflow-hidden min-h-[300px] w-full flex flex-col`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileWarning size={16} className="text-amber-600 shrink-0" strokeWidth={2.2} />
          <h3 className={T.sectionTitle}>재고 · 입고 알림</h3>
        </div>
      </div>
      {!hasAny ? (
        <div className="flex-1 flex items-center justify-center text-[14px] text-slate-400">
          현재 확인할 알림이 없습니다
        </div>
      ) : (
        <div className="divide-y divide-slate-100 flex-1">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={it.onClick}
              className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/60 transition cursor-pointer min-h-[46px]`}
            >
              <span className={`${T.taskLabel} ${it.count === 0 || it.dim ? "text-slate-400" : ""}`}>{it.label}</span>
              <span className="flex items-center gap-1.5">
                <span className={`${T.taskCount} ${it.count === 0 || it.dim ? "text-slate-400" : "text-amber-700"}`}>{it.count}</span>
                <ChevronRight size={14} className="text-slate-300" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface QuickActionCardProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  tone: "coral" | "amber" | "sky" | "emerald" | "violet";
}

// 2026 trend · gradient icon · colored shadow · hover border accent
const QA_TONE: Record<QuickActionCardProps["tone"], { bg: string; icon: string; shadow: string; hoverBorder: string }> = {
  coral:   { bg: "bg-gradient-to-br from-rose-100 to-rose-50",       icon: "text-rose-600",    shadow: "shadow-[0_2px_6px_rgba(244,63,94,0.12)]",    hoverBorder: "hover:border-rose-200" },
  amber:   { bg: "bg-gradient-to-br from-amber-100 to-amber-50",     icon: "text-amber-600",   shadow: "shadow-[0_2px_6px_rgba(217,119,6,0.12)]",   hoverBorder: "hover:border-amber-200" },
  sky:     { bg: "bg-gradient-to-br from-sky-100 to-sky-50",         icon: "text-sky-600",     shadow: "shadow-[0_2px_6px_rgba(14,165,233,0.12)]",  hoverBorder: "hover:border-sky-200" },
  emerald: { bg: "bg-gradient-to-br from-emerald-100 to-emerald-50", icon: "text-emerald-600", shadow: "shadow-[0_2px_6px_rgba(16,185,129,0.12)]",  hoverBorder: "hover:border-emerald-200" },
  violet:  { bg: "bg-gradient-to-br from-violet-100 to-violet-50",   icon: "text-violet-600",  shadow: "shadow-[0_2px_6px_rgba(139,92,246,0.12)]",  hoverBorder: "hover:border-violet-200" },
};

const QuickActionCard: React.FC<QuickActionCardProps> = ({ icon, title, desc, onClick, tone }) => {
  const t = QA_TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(10,20,40,0.04)] transition-all duration-200 cursor-pointer text-left flex flex-col gap-2.5 min-w-0 p-[18px] min-h-[140px] group hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(10,20,40,0.08)] ${t.hoverBorder}`}
    >
      <span className={`inline-flex items-center justify-center w-11 h-11 rounded-[12px] shrink-0 ${t.bg} ${t.icon} ${t.shadow} transition-transform group-hover:scale-105`}>
        {icon}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className={`${T.qaTitle} break-keep`}>{title}</span>
        <span className={`${T.qaDesc} break-keep`}>{desc}</span>
      </div>
    </button>
  );
};

export default HomeDashboard;
