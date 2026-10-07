// 2026-10-07 · 사용자 지시 · 2026 Operations Dashboard 리뉴얼 (Phase 2)
//   · 참조 디자인 · Linear/Vercel/Attio/Shadcn 2026 compact dashboard
//   · 기존 API 재사용 (sale-hourly-report + requests/pending-counts) · 새 계산식 금지
//   · Schedule V1 FROZEN · route/permission 유지

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet, Users, Receipt, ClipboardCheck,
  Package, Scan, Calendar, Store, MessageSquare,
  ChevronRight, FileWarning, TrendingUp, Clock, RotateCcw,
} from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { api } from "../../lib/apiClient";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";

// 2026-10-07 · 재사용 · TodayRevenueKpiPanel 의 응답 타입 재구현 (dependency 추가 X)
interface HourlyRow { SaleDate: string; SaleTime: string; CustomerCnt: number; SaleTotal: number; }
interface HourlyApiResponse { ok: boolean; schemaMismatch?: boolean; rows?: HourlyRow[]; error?: string; }

export interface HomeDashboardProps {
  authSession: AuthSession;
  // 승인 대기 · LandingPage 에서 이미 fetch (중복 X)
  leavePendingCount: number;
  requestsCounts: {
    display: number;
    order: number;
    lunch: number;
    inventory: number;
    return: number;
    resignation: number;
    vendor: number;
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
  authSession,
  leavePendingCount,
  requestsCounts,
  paymentPendingCount,
  isAdmin,
  isManagerOrAdmin,
  onNavigate,
  setActiveByPage,
}) => {
  // ─── 매출 데이터 fetch (TodayRevenueKpiPanel 과 동일 endpoint · SSOT) ───
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
      setSalesError((e as Error).message);
      setHourlyRows(null);
    } finally { setSalesLoading(false); }
  }, [isManagerOrAdmin]);

  useEffect(() => { void loadSales(); }, [loadSales]);

  // ─── 집계 (서버 값 그대로 · 로컬 재계산 금지) ───
  const now = new Date();
  const today = todayYmd();
  const curHour = now.getHours();

  const todayRows = useMemo(() =>
    (hourlyRows ?? []).filter(r => r.SaleDate === today && parseHour(r.SaleTime) <= curHour),
    [hourlyRows, today, curHour]);
  const todaySale = useMemo(() => todayRows.reduce((a, r) => a + Number(r.SaleTotal ?? 0), 0), [todayRows]);
  const todayCust = useMemo(() => todayRows.reduce((a, r) => a + Number(r.CustomerCnt ?? 0), 0), [todayRows]);
  const avgOrder = todayCust > 0 ? todaySale / todayCust : 0;

  // 승인 대기 · 분해 (TodayStatusPanel 로직과 동일 gate 간소화 · 기존 count prop 그대로)
  const totalApprovals = leavePendingCount + requestsCounts.resignation + (isAdmin ? requestsCounts.vendor : 0);

  // ─── Date/Greeting ───
  const dayNames = ["일","월","화","수","목","금","토"];
  const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${dayNames[now.getDay()]}요일`;
  const name = authSession.employeeName;
  const rank = authSession.employeeRank;

  const greetingDesc = isManagerOrAdmin
    ? (totalApprovals > 0 || paymentPendingCount > 0
        ? `오늘 처리할 업무가 ${totalApprovals + paymentPendingCount}건 있습니다.`
        : "오늘 대기 중인 승인/요청이 없습니다.")
    : "오늘도 좋은 하루 되세요.";

  // ─── Nav helpers ───
  const goTo = (page: Exclude<AppNavPage, "landing">, sub?: string) => () => {
    if (sub) setActiveByPage(page, sub);
    onNavigate(page, authSession);
  };

  return (
    <div className="w-full flex flex-col gap-5">
      {/* ═══ Header · compact (큰 gradient card 제거) · 2026-10-07 글씨 bump up ═══ */}
      <header className="w-full">
        <div className="text-[14px] sm:text-[15px] text-zinc-500 font-medium tracking-wide">{dateStr}</div>
        <h1 className="mt-1 text-[24px] sm:text-[28px] md:text-[32px] font-bold text-ink tracking-tight leading-snug">
          안녕하세요, {name}{rank ? ` ${rank}` : ""}님 <span className="inline-block">👋</span>
        </h1>
        <p className="mt-1.5 text-[15px] sm:text-[16px] text-zinc-600">{greetingDesc}</p>
      </header>

      {/* ═══ KPI 4개 · 매출/방문객/객단가/승인대기 · section-level loading/error ═══ */}
      {isManagerOrAdmin && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            icon={<Wallet size={16} className="text-emerald-600" strokeWidth={2.2} />}
            iconBg="bg-emerald-50"
            label="오늘 매출"
            value={todayRows.length === 0 ? "-" : fmtWon(todaySale)}
            loading={salesLoading && hourlyRows === null}
            error={!!salesError && hourlyRows === null}
            onClick={goTo("display", "revenue")}
            accentColor="emerald"
          />
          <KpiCard
            icon={<Users size={16} className="text-sky-600" strokeWidth={2.2} />}
            iconBg="bg-sky-50"
            label="방문객"
            value={todayRows.length === 0 ? "-" : `${todayCust.toLocaleString("ko-KR")}명`}
            loading={salesLoading && hourlyRows === null}
            error={!!salesError && hourlyRows === null}
            onClick={goTo("display", "revenue")}
            accentColor="sky"
          />
          <KpiCard
            icon={<Receipt size={16} className="text-violet-600" strokeWidth={2.2} />}
            iconBg="bg-violet-50"
            label="객단가"
            value={todayCust === 0 ? "-" : fmtWon(avgOrder)}
            loading={salesLoading && hourlyRows === null}
            error={!!salesError && hourlyRows === null}
            onClick={goTo("display", "revenue")}
            accentColor="violet"
          />
          <KpiCard
            icon={<ClipboardCheck size={16} className="text-brand-amber-ink" strokeWidth={2.2} />}
            iconBg="bg-brand-amber-tint"
            label="승인 대기"
            value={`${totalApprovals.toLocaleString("ko-KR")}건`}
            sub={totalApprovals > 0
              ? [
                  leavePendingCount > 0 ? `연차 ${leavePendingCount}` : null,
                  requestsCounts.resignation > 0 ? `사직서 ${requestsCounts.resignation}` : null,
                  (isAdmin && requestsCounts.vendor > 0) ? `거래처 ${requestsCounts.vendor}` : null,
                ].filter(Boolean).join(" · ")
              : undefined}
            onClick={() => { setActiveByPage("requests", "leave"); onNavigate("requests", authSession); }}
            accentColor="amber"
          />
        </section>
      )}

      {/* 2026-10-07 · Phase 4 · 모바일 섹션 순서 (Tasks → QuickActions → Alerts → Sales)
          desktop 은 single 3-column grid + QuickActions row (아래)
          mobile 은 DOM 순서 그대로 스택 · DOM 순서를 모바일 우선 순서로 배치 */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* 1. Tasks · 오늘 처리할 업무 */}
        <div className="min-w-0 lg:col-span-3 lg:col-start-1 lg:row-start-1">
          <TaskQueueCard
            title="오늘 처리할 업무"
            totalBadge={totalApprovals + requestsCounts.display + requestsCounts.order + (isAdmin ? paymentPendingCount : 0)}
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

        {/* 2. Quick Actions · 모바일 두 번째 · desktop 은 아래 row 2 로 이동 */}
        <div className="min-w-0 lg:col-span-12 lg:col-start-1 lg:row-start-2">
          <SectionTitle>빠른 실행</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <QuickActionCard icon={<Package size={18} strokeWidth={2.2} />} title="상품입고" onClick={goTo("productarrival")} tone="coral" />
            <QuickActionCard icon={<Scan size={18} strokeWidth={2.2} />} title="실재고 확인" onClick={goTo("scan")} tone="amber" />
            <QuickActionCard icon={<Calendar size={18} strokeWidth={2.2} />} title="스케줄표" onClick={goTo("schedule")} tone="sky" />
            <QuickActionCard icon={<Store size={18} strokeWidth={2.2} />} title="매장진열" onClick={goTo("display")} tone="emerald" />
            <QuickActionCard icon={<MessageSquare size={18} strokeWidth={2.2} />} title="이슈 공유" onClick={goTo("board")} tone="violet" />
          </div>
        </div>

        {/* 3. Stock Alerts · 모바일 세 번째 · desktop 은 row 1 우측 */}
        <div className="min-w-0 lg:col-span-3 lg:col-start-10 lg:row-start-1">
          <StockAlertsCard
            items={[
              { label: "실재고 확인 요청", count: requestsCounts.inventory, onClick: goTo("scan") },
              { label: "입고 예정 상품", count: 0, onClick: goTo("productarrival"), dim: true },
              { label: "유통기한 임박", count: 0, onClick: goTo("stockcheck"), dim: true },
              { label: "반품 요청", count: requestsCounts.return, onClick: goTo("requests") },
            ]}
          />
        </div>

        {/* 4. Sales · 오늘의 판매현황 (chart) · 모바일 마지막 · desktop 은 row 1 중앙 */}
        <div className="min-w-0 lg:col-span-6 lg:col-start-4 lg:row-start-1">
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
      </section>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Sub components · compact 2026 trend (Linear/Vercel/Attio/Shadcn)
// ═══════════════════════════════════════════════════════════════

const ACCENT_BORDER: Record<string, string> = {
  emerald: "hover:border-emerald-200",
  sky: "hover:border-sky-200",
  violet: "hover:border-violet-200",
  amber: "hover:border-brand-amber/40",
};

interface KpiCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  error?: boolean;
  onClick: () => void;
  accentColor: "emerald" | "sky" | "violet" | "amber";
}

const KpiCard: React.FC<KpiCardProps> = ({ icon, iconBg, label, value, sub, loading, error, onClick, accentColor }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left bg-white border border-zinc-200 rounded-xl p-3.5 sm:p-4 transition shadow-sm hover:shadow-md cursor-pointer min-w-0 ${ACCENT_BORDER[accentColor]}`}
  >
    <div className="flex items-center gap-2 mb-2">
      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${iconBg}`}>{icon}</span>
      <span className="text-[13px] sm:text-[14px] text-zinc-500 font-semibold tracking-wide truncate">{label}</span>
    </div>
    {loading ? (
      <SkeletonBar className="h-6 w-24 mt-1" />
    ) : error ? (
      <div className="text-[14px] text-rose-500 font-semibold">조회 실패</div>
    ) : (
      <div
        className="font-bold tabular-nums text-ink leading-tight whitespace-nowrap truncate"
        style={{ fontSize: "clamp(20px, 3.0vw, 26px)" }}
        title={value}
      >
        {value}
      </div>
    )}
    {sub && !loading && !error && (
      <div className="mt-1 text-[12px] sm:text-[13px] text-zinc-500 truncate" title={sub}>{sub}</div>
    )}
  </button>
);

// 2026-10-07 · Phase 5 · Skeleton primitive (shimmer · 가벼운 inline)
const SkeletonBar: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = "", style }) => (
  <div className={`bg-zinc-200/70 rounded animate-pulse ${className}`} style={style} />
);

interface TaskItem { label: string; count: number; onClick: () => void; }
interface TaskQueueCardProps { title: string; totalBadge: number; items: TaskItem[]; }

const TaskQueueCard: React.FC<TaskQueueCardProps> = ({ title, totalBadge, items }) => {
  const allZero = items.every(it => it.count === 0);
  return (
    <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h3 className="text-[16px] sm:text-[17px] font-bold text-ink tracking-tight">{title}</h3>
        <span className={`text-[13px] font-bold tabular-nums px-2.5 py-0.5 rounded-full ${totalBadge > 0 ? "bg-brand-amber/15 text-brand-amber-ink" : "bg-zinc-100 text-zinc-500"}`}>
          {totalBadge}
        </span>
      </div>
      {allZero ? (
        <div className="px-4 py-6 text-center text-[14px] text-zinc-400">처리할 업무가 없습니다</div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={it.onClick}
              className={`w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50/60 transition cursor-pointer ${it.count === 0 ? "text-zinc-400" : "text-ink"}`}
            >
              <span className="text-[14px] sm:text-[15px] font-medium">{it.label}</span>
              <span className="flex items-center gap-1.5">
                <span className={`text-[15px] sm:text-[16px] font-bold tabular-nums ${it.count === 0 ? "text-zinc-400" : "text-brand-amber-ink"}`}>{it.count}</span>
                <ChevronRight size={14} className="text-zinc-300" />
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
  // 시간별 bar · 매출 (최대 15 slots)
  const chartData = useMemo(() =>
    rows
      .map(r => ({ hour: parseHour(r.SaleTime), sale: Number(r.SaleTotal ?? 0) }))
      .sort((a, b) => a.hour - b.hour)
      .map(d => ({ label: `${d.hour}시`, sale: d.sale, isNow: d.hour === curHour })),
    [rows, curHour]);

  return (
    <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[16px] sm:text-[17px] font-bold text-ink truncate tracking-tight">오늘의 판매현황</h3>
          <span className="text-[12px] text-zinc-400 shrink-0">실시간 ERP</span>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="text-[13px] text-brand-deep font-semibold hover:underline cursor-pointer flex items-center gap-0.5 shrink-0"
        >
          매출 상세 <ChevronRight size={13} />
        </button>
      </div>
      <div className="px-4 pb-3">
        <div className="flex items-end gap-2">
          {loading && rows.length === 0 ? (
            <SkeletonBar className="h-8 w-40" />
          ) : (
            <div className="font-bold tabular-nums text-emerald-700 leading-tight" style={{ fontSize: "clamp(22px, 3.4vw, 30px)" }}>
              {error ? "-" : rows.length === 0 ? "-" : fmtWon(todaySale)}
            </div>
          )}
          <div className="text-[13px] text-zinc-500 mb-1">누적 매출</div>
        </div>
      </div>
      <div className="h-[180px] px-2 pb-3">
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
              <SkeletonBar key={i} className="flex-1" style={{ height: `${30 + Math.sin(i * 1.3) * 30 + 60}%` } as React.CSSProperties} />
            ))}
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[14px] text-zinc-400">데이터 없음</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 8, left: 8 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: number) => fmtWon(v)}
                contentStyle={{ fontSize: 13, borderRadius: 6, padding: "4px 8px" }}
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
    <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileWarning size={16} className="text-amber-600 shrink-0" strokeWidth={2.2} />
          <h3 className="text-[16px] sm:text-[17px] font-bold text-ink truncate tracking-tight">재고 · 입고 알림</h3>
        </div>
      </div>
      {!hasAny ? (
        <div className="px-4 py-6 text-center text-[14px] text-zinc-400">현재 확인할 알림이 없습니다</div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={it.onClick}
              className={`w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50/60 transition cursor-pointer ${it.count === 0 || it.dim ? "text-zinc-400" : "text-ink"}`}
            >
              <span className="text-[14px] sm:text-[15px] font-medium">{it.label}</span>
              <span className="flex items-center gap-1.5">
                <span className={`text-[15px] sm:text-[16px] font-bold tabular-nums ${it.count === 0 || it.dim ? "text-zinc-400" : "text-amber-600"}`}>{it.count}</span>
                <ChevronRight size={14} className="text-zinc-300" />
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
  onClick: () => void;
  tone: "coral" | "amber" | "sky" | "emerald" | "violet";
}

const QA_TONE: Record<QuickActionCardProps["tone"], { bg: string; icon: string; border: string }> = {
  coral:   { bg: "bg-rose-50",     icon: "text-rose-600",       border: "hover:border-rose-200" },
  amber:   { bg: "bg-amber-50",    icon: "text-amber-600",      border: "hover:border-amber-200" },
  sky:     { bg: "bg-sky-50",      icon: "text-sky-600",        border: "hover:border-sky-200" },
  emerald: { bg: "bg-emerald-50",  icon: "text-emerald-600",    border: "hover:border-emerald-200" },
  violet:  { bg: "bg-violet-50",   icon: "text-violet-600",     border: "hover:border-violet-200" },
};

const QuickActionCard: React.FC<QuickActionCardProps> = ({ icon, title, onClick, tone }) => {
  const t = QA_TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-white border border-zinc-200 rounded-xl p-3.5 sm:p-4 transition shadow-sm hover:shadow-md cursor-pointer text-left flex items-center gap-3 min-w-0 ${t.border}`}
    >
      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${t.bg} ${t.icon}`}>
        {icon}
      </span>
      <span className="text-[14px] sm:text-[15px] font-semibold text-ink truncate">{title}</span>
    </button>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-2.5 mb-3">
    <span className="w-[3px] h-[18px] rounded-full bg-zinc-400" />
    <span className="text-[16px] sm:text-[18px] font-bold text-ink tracking-tight">{children}</span>
  </div>
);

// Export unused imports used in sub-components (type checker satisfaction)
void TrendingUp; void Clock;

export default HomeDashboard;
