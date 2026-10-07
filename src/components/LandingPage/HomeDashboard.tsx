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
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { api } from "../../lib/apiClient";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";

// ─────────────────────────────────────────────────────────────
// Typography scale (DESKTOP + MOBILE) · spec 기반 고정
// ─────────────────────────────────────────────────────────────
const T = {
  eyebrow:    "text-[12px] sm:text-[13px] text-slate-500 font-medium tracking-wide",
  heroTitle:  "text-[24px] sm:text-[28px] md:text-[30px] font-bold text-ink tracking-tight leading-[1.2]",
  heroDesc:   "text-[13px] sm:text-[14px] text-slate-500 leading-[1.5]",
  sectionTitle: "text-[16px] sm:text-[17px] font-semibold text-ink tracking-tight",
  cardLabel:  "text-[12px] sm:text-[13px] text-slate-500 font-medium",
  // spec: desktop 26-28 · mobile 18-21 · tabular-nums tracking-tight
  kpiValue:   { fontSize: "clamp(19px, 2.6vw, 28px)" } as React.CSSProperties,
  taskLabel:  "text-[13px] sm:text-[14px] text-ink font-medium",
  taskCount:  "text-[13px] sm:text-[14px] font-semibold tabular-nums",
  qaTitle:    "text-[14px] sm:text-[15px] font-semibold text-ink",
  qaDesc:     "text-[12px] sm:text-[13px] text-slate-500 leading-[1.45]",
  meta:       "text-[12px] sm:text-[13px] text-slate-500",
} as const;

interface HourlyRow { SaleDate: string; SaleTime: string; CustomerCnt: number; SaleTotal: number; }
interface HourlyApiResponse { ok: boolean; schemaMismatch?: boolean; rows?: HourlyRow[]; error?: string; }

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

  useEffect(() => { void loadSales(); }, [loadSales]);

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

      {/* ═══ 통합 Metrics Bar · 매출/방문객/객단가/승인대기 하나의 카드로 통합
            · 2026 trend · divide-x subtle · soft hover · smooth transition
            · 최신 깔끔·고급·세련 톤 (화려함 제거) ═══ */}
      {isManagerOrAdmin && (
        <section>
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
              {
                icon: <ClipboardCheck size={18} strokeWidth={2.2} />,
                tone: "amber",
                label: "승인 대기",
                value: `${totalApprovals.toLocaleString("ko-KR")}건`,
                sub: totalApprovals > 0
                  ? [
                      leavePendingCount > 0 ? `연차 ${leavePendingCount}` : null,
                      requestsCounts.resignation > 0 ? `사직서 ${requestsCounts.resignation}` : null,
                      (isAdmin && requestsCounts.vendor > 0) ? `거래처 ${requestsCounts.vendor}` : null,
                    ].filter(Boolean).join(" · ")
                  : undefined,
                onClick: () => { setActiveByPage("requests", "leave"); onNavigate("requests", authSession); },
              },
            ]}
          />
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

      {/* ═══ Row 3 · Alerts (full-width list) ═══ */}
      <section>
        <StockAlertsCard
          items={[
            { label: "실재고 확인 요청", count: requestsCounts.inventory, onClick: goTo("scan") },
            { label: "입고 예정 상품", count: 0, onClick: goTo("productarrival"), dim: true },
            { label: "유통기한 임박", count: 0, onClick: goTo("stockcheck"), dim: true },
            { label: "반품 요청", count: requestsCounts.return, onClick: goTo("requests") },
          ]}
        />
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
type MetricTone = "emerald" | "sky" | "violet" | "amber";
const METRIC_TONE: Record<MetricTone, { iconBg: string; iconText: string; hoverBg: string }> = {
  emerald: { iconBg: "bg-emerald-50", iconText: "text-emerald-600", hoverBg: "hover:bg-emerald-50/30" },
  sky:     { iconBg: "bg-sky-50",     iconText: "text-sky-600",     hoverBg: "hover:bg-sky-50/30" },
  violet:  { iconBg: "bg-violet-50",  iconText: "text-violet-600",  hoverBg: "hover:bg-violet-50/30" },
  amber:   { iconBg: "bg-amber-50",   iconText: "text-amber-600",   hoverBg: "hover:bg-amber-50/30" },
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

const UnifiedMetricsCard: React.FC<UnifiedMetricsCardProps> = ({ metrics, loading, error }) => (
  <div className="bg-white border border-slate-200 rounded-2xl shadow-[0_1px_2px_rgba(10,20,40,0.04)] overflow-hidden">
    <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-slate-100">
      {metrics.map((m, i) => {
        const t = METRIC_TONE[m.tone];
        return (
          <button
            key={i}
            type="button"
            onClick={m.onClick}
            className={`text-left px-4 sm:px-5 py-4 sm:py-5 min-h-[112px] flex flex-col justify-between min-w-0 ${t.hoverBg} transition cursor-pointer group`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`inline-flex items-center justify-center w-9 h-9 rounded-[10px] shrink-0 ${t.iconBg} ${t.iconText} transition-transform group-hover:scale-105`}>
                {m.icon}
              </span>
              <span className="text-[12px] sm:text-[13px] text-slate-500 font-medium tracking-wide break-keep">{m.label}</span>
            </div>
            <div className="mt-2">
              {loading ? (
                <SkeletonBar className="h-7 w-28" />
              ) : error ? (
                <div className="text-[13px] text-rose-500 font-semibold">조회 실패</div>
              ) : (
                <div
                  className="font-bold tabular-nums text-ink leading-[1.15] whitespace-nowrap tracking-tight"
                  style={{ fontSize: "clamp(19px, 2.6vw, 26px)" }}
                  title={m.value}
                >
                  {m.value}
                </div>
              )}
              {m.sub && !loading && !error && (
                <div className="mt-1 text-[11px] sm:text-[12px] text-slate-500 break-keep leading-snug">{m.sub}</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  </div>
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

interface TaskItem { label: string; count: number; onClick: () => void; }
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
  onOpen: () => void;
  onRetry: () => void;
}

const SalesCard: React.FC<SalesCardProps> = ({ loading, error, rows, todaySale, curHour, onOpen, onRetry }) => {
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
            <div className="font-bold tabular-nums text-emerald-700 leading-tight tracking-tight" style={{ fontSize: "clamp(22px, 3.2vw, 30px)" }}>
              {error ? "-" : rows.length === 0 ? "-" : fmtWon(todaySale)}
            </div>
          )}
          <div className={`${T.meta} mb-1`}>누적 매출</div>
        </div>
      </div>
      <div className="flex-1 min-h-[170px] px-2 pb-3">
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
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 8, left: 8 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: number) => fmtWon(v)}
                contentStyle={{ fontSize: 12, borderRadius: 8, padding: "6px 10px", border: "1px solid #e2e8f0" }}
                cursor={{ fill: "rgba(16,185,129,0.04)" }}
              />
              <Bar dataKey="sale" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.isNow ? "#059669" : "#10b981"} fillOpacity={d.isNow ? 1 : 0.5} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

interface StockAlertItem { label: string; count: number; onClick: () => void; dim?: boolean; }
interface StockAlertsCardProps { items: StockAlertItem[]; }

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

const QA_TONE: Record<QuickActionCardProps["tone"], { bg: string; icon: string }> = {
  coral:   { bg: "bg-rose-50",     icon: "text-rose-600" },
  amber:   { bg: "bg-amber-50",    icon: "text-amber-600" },
  sky:     { bg: "bg-sky-50",      icon: "text-sky-600" },
  emerald: { bg: "bg-emerald-50",  icon: "text-emerald-600" },
  violet:  { bg: "bg-violet-50",   icon: "text-violet-600" },
};

const QuickActionCard: React.FC<QuickActionCardProps> = ({ icon, title, desc, onClick, tone }) => {
  const t = QA_TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${CARD_BASE} ${CARD_HOVER} cursor-pointer text-left flex flex-col gap-2.5 min-w-0 p-4 sm:p-[18px] min-h-[140px]`}
    >
      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-[10px] shrink-0 ${t.bg} ${t.icon}`}>
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
