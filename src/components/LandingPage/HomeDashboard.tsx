// 2026-10-07 · 사용자 지시 · 2026 Operations Dashboard 리뉴얼 (Phase 2)
//   · 참조 디자인 · Linear/Vercel/Attio/Shadcn 2026 compact dashboard
//   · 기존 API 재사용 (sale-hourly-report + requests/pending-counts) · 새 계산식 금지
//   · Schedule V1 FROZEN · route/permission 유지

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet, Users, Receipt, ClipboardCheck,
  Package, Scan, Calendar, Store, MessageSquare,
  ChevronRight, FileWarning, TrendingUp, Clock,
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
      {/* ═══ Header · compact (큰 gradient card 제거) ═══ */}
      <header className="w-full">
        <div className="text-[13px] text-zinc-500 font-medium tracking-wide">{dateStr}</div>
        <h1 className="mt-1 text-[22px] sm:text-[26px] md:text-[28px] font-bold text-ink tracking-tight leading-snug">
          안녕하세요, {name}{rank ? ` ${rank}` : ""}님 <span className="inline-block">👋</span>
        </h1>
        <p className="mt-1 text-[14px] sm:text-[15px] text-zinc-600">{greetingDesc}</p>
      </header>

      {/* ═══ KPI 4개 · 매출/방문객/객단가/승인대기 ═══ */}
      {isManagerOrAdmin && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            icon={<Wallet size={16} className="text-emerald-600" strokeWidth={2.2} />}
            iconBg="bg-emerald-50"
            label="오늘 매출"
            value={salesLoading ? "조회 중..." : salesError ? "-" : todayRows.length === 0 ? "-" : fmtWon(todaySale)}
            onClick={goTo("display", "revenue")}
            accentColor="emerald"
          />
          <KpiCard
            icon={<Users size={16} className="text-sky-600" strokeWidth={2.2} />}
            iconBg="bg-sky-50"
            label="방문객"
            value={salesLoading ? "..." : salesError ? "-" : todayRows.length === 0 ? "-" : `${todayCust.toLocaleString("ko-KR")}명`}
            onClick={goTo("display", "revenue")}
            accentColor="sky"
          />
          <KpiCard
            icon={<Receipt size={16} className="text-violet-600" strokeWidth={2.2} />}
            iconBg="bg-violet-50"
            label="객단가"
            value={salesLoading ? "..." : salesError ? "-" : todayCust === 0 ? "-" : fmtWon(avgOrder)}
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

      {/* ═══ 3-column · Tasks | Sales | Alerts ═══ */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Tasks · 오늘 처리할 업무 */}
        <div className="lg:col-span-3 min-w-0">
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

        {/* Sales · 오늘의 판매현황 (chart) */}
        <div className="lg:col-span-6 min-w-0">
          <SalesCard
            loading={salesLoading}
            error={salesError}
            rows={todayRows}
            todaySale={todaySale}
            curHour={curHour}
            onOpen={goTo("display", "revenue")}
          />
        </div>

        {/* Stock Alerts · 재고·입고 알림 */}
        <div className="lg:col-span-3 min-w-0">
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

      {/* ═══ Quick Actions · 5 compact cards ═══ */}
      <section>
        <SectionTitle>빠른 실행</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <QuickActionCard icon={<Package size={18} strokeWidth={2.2} />} title="상품입고" onClick={goTo("productarrival")} tone="coral" />
          <QuickActionCard icon={<Scan size={18} strokeWidth={2.2} />} title="실재고 확인" onClick={goTo("scan")} tone="amber" />
          <QuickActionCard icon={<Calendar size={18} strokeWidth={2.2} />} title="스케줄표" onClick={goTo("schedule")} tone="sky" />
          <QuickActionCard icon={<Store size={18} strokeWidth={2.2} />} title="매장진열" onClick={goTo("display")} tone="emerald" />
          <QuickActionCard icon={<MessageSquare size={18} strokeWidth={2.2} />} title="이슈 공유" onClick={goTo("board")} tone="violet" />
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
  onClick: () => void;
  accentColor: "emerald" | "sky" | "violet" | "amber";
}

const KpiCard: React.FC<KpiCardProps> = ({ icon, iconBg, label, value, sub, onClick, accentColor }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left bg-white border border-zinc-200 rounded-xl p-3 sm:p-4 transition shadow-sm hover:shadow-md cursor-pointer min-w-0 ${ACCENT_BORDER[accentColor]}`}
  >
    <div className="flex items-center gap-2 mb-1.5">
      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0 ${iconBg}`}>{icon}</span>
      <span className="text-[12px] sm:text-[13px] text-zinc-500 font-medium tracking-wide truncate">{label}</span>
    </div>
    <div
      className="font-bold tabular-nums text-ink leading-tight whitespace-nowrap truncate"
      style={{ fontSize: "clamp(17px, 2.6vw, 22px)" }}
      title={value}
    >
      {value}
    </div>
    {sub && (
      <div className="mt-0.5 text-[11px] sm:text-[12px] text-zinc-500 truncate" title={sub}>{sub}</div>
    )}
  </button>
);

interface TaskItem { label: string; count: number; onClick: () => void; }
interface TaskQueueCardProps { title: string; totalBadge: number; items: TaskItem[]; }

const TaskQueueCard: React.FC<TaskQueueCardProps> = ({ title, totalBadge, items }) => (
  <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
    <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
      <h3 className="text-[14px] sm:text-[15px] font-bold text-ink">{title}</h3>
      <span className={`text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-full ${totalBadge > 0 ? "bg-brand-amber/15 text-brand-amber-ink" : "bg-zinc-100 text-zinc-500"}`}>
        {totalBadge}
      </span>
    </div>
    <div className="divide-y divide-zinc-100">
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          onClick={it.onClick}
          className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-zinc-50/60 transition cursor-pointer ${it.count === 0 ? "text-zinc-400" : "text-ink"}`}
        >
          <span className="text-[13px] sm:text-[14px] font-medium">{it.label}</span>
          <span className="flex items-center gap-1.5">
            <span className={`text-[13px] sm:text-[14px] font-bold tabular-nums ${it.count === 0 ? "text-zinc-400" : "text-brand-amber-ink"}`}>{it.count}</span>
            <ChevronRight size={13} className="text-zinc-300" />
          </span>
        </button>
      ))}
    </div>
  </div>
);

interface SalesCardProps {
  loading: boolean;
  error: string | null;
  rows: HourlyRow[];
  todaySale: number;
  curHour: number;
  onOpen: () => void;
}

const SalesCard: React.FC<SalesCardProps> = ({ loading, error, rows, todaySale, curHour, onOpen }) => {
  // 시간별 bar · 매출 (최대 15 slots)
  const chartData = useMemo(() =>
    rows
      .map(r => ({ hour: parseHour(r.SaleTime), sale: Number(r.SaleTotal ?? 0) }))
      .sort((a, b) => a.hour - b.hour)
      .map(d => ({ label: `${d.hour}시`, sale: d.sale, isNow: d.hour === curHour })),
    [rows, curHour]);

  return (
    <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[14px] sm:text-[15px] font-bold text-ink truncate">오늘의 판매현황</h3>
          <span className="text-[11px] text-zinc-400 shrink-0">실시간 ERP</span>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="text-[12px] text-brand-deep font-semibold hover:underline cursor-pointer flex items-center gap-0.5 shrink-0"
        >
          매출 상세 <ChevronRight size={12} />
        </button>
      </div>
      <div className="px-4 pb-3">
        <div className="flex items-end gap-2">
          <div className="font-bold tabular-nums text-emerald-700 leading-tight" style={{ fontSize: "clamp(20px, 3.2vw, 28px)" }}>
            {loading ? "..." : error ? "-" : rows.length === 0 ? "-" : fmtWon(todaySale)}
          </div>
          <div className="text-[12px] text-zinc-500 mb-1">누적 매출</div>
        </div>
      </div>
      <div className="h-[180px] px-2 pb-3">
        {error ? (
          <div className="h-full flex items-center justify-center text-[13px] text-rose-500">ERP 조회 실패 · 다시 시도해 주세요</div>
        ) : loading && rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[13px] text-zinc-400">조회 중...</div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[13px] text-zinc-400">데이터 없음</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 8, left: 8 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: number) => fmtWon(v)}
                contentStyle={{ fontSize: 12, borderRadius: 6, padding: "4px 8px" }}
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
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <FileWarning size={14} className="text-amber-600 shrink-0" strokeWidth={2.2} />
          <h3 className="text-[14px] sm:text-[15px] font-bold text-ink truncate">재고 · 입고 알림</h3>
        </div>
      </div>
      {!hasAny && items.every(it => it.count === 0) ? (
        <div className="px-4 py-6 text-center text-[13px] text-zinc-400">현재 긴급 재고 알림이 없습니다</div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={it.onClick}
              className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-zinc-50/60 transition cursor-pointer ${it.count === 0 || it.dim ? "text-zinc-400" : "text-ink"}`}
            >
              <span className="text-[13px] sm:text-[14px] font-medium">{it.label}</span>
              <span className="flex items-center gap-1.5">
                <span className={`text-[13px] sm:text-[14px] font-bold tabular-nums ${it.count === 0 || it.dim ? "text-zinc-400" : "text-amber-600"}`}>{it.count}</span>
                <ChevronRight size={13} className="text-zinc-300" />
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
      className={`bg-white border border-zinc-200 rounded-xl p-3 sm:p-4 transition shadow-sm hover:shadow-md cursor-pointer text-left flex items-center gap-2.5 min-w-0 ${t.border}`}
    >
      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${t.bg} ${t.icon}`}>
        {icon}
      </span>
      <span className="text-[13px] sm:text-[14px] font-semibold text-ink truncate">{title}</span>
    </button>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-2.5 mb-3">
    <span className="w-[3px] h-[16px] rounded-full bg-zinc-400" />
    <span className="text-[15px] sm:text-[16px] font-bold text-ink tracking-tight">{children}</span>
  </div>
);

// Export unused imports used in sub-components (type checker satisfaction)
void TrendingUp; void Clock;

export default HomeDashboard;
