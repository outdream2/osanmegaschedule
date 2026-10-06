// src/components/DisplayPage/RevenueFlowChart.tsx
// 2026-10-06 · 사용자 지시 · 매출 흐름 분석 (date / weekday toggle)
//   · 4 metric synchronized track (각 독립 Y scale · 공유 X축 · syncId)
//   · 매출/객단가/마진율 Line + 고객수 Bar
//   · hover 시 상단 unified tooltip strip 노출
//   · dual/triple Y-axis 금지 · normalization 금지
//
// 집계:
//   · date mode    · displayDateData 를 chronological · 각 날짜 metric
//   · weekday mode · 7 bucket (월~일) · 요일별 공정 비교
//       · avgRevenue   = totalRevenue / sampleDays
//       · avgCustomers = totalCustomers / sampleDays
//       · avgTicket    = totalRevenue / totalCustomers (고객 가중)
//       · marginRate   = totalMargin / totalRevenue × 100 (매출 가중)
//
// DATA SSOT · RevenuePage dateData 재사용 · API 재호출 X · 재집계만

import React, { useMemo, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { shortDateWithDow } from "../../lib/dateFormat";

// ── 타입 ────────────────────────────────────────────────────────────────────
interface HourlyRow {
  SaleDate?: string;
  SaleTime?: string;
  CustomerCnt?: number | string;
  SaleTotal?: number | string;
  Margin?: number | string;
}

export interface DateBlockLite {
  date: string;                // "YYYY-MM-DD"
  rowMap: Map<string, HourlyRow & { cumCust: number; cumSale: number }>;
  totalSale: number;
  totalCust: number;
  totalMargin: number;
}

type ViewMode = "date" | "weekday";

interface MetricRow {
  key: string;            // X key (date "10/06(화)" or weekday "월")
  rawDate?: string;       // weekday 모드에서 null
  revenue: number;        // 매출 (원)
  customers: number;      // 고객수 (명)
  avgTicket: number | null;    // 객단가 (원 · divide-by-zero 시 null)
  marginRate: number | null;   // 마진율 (%)
  sampleDays?: number;    // weekday 모드 전용 · 표본 일수
}

// ── 포맷 ────────────────────────────────────────────────────────────────────
function fmtWon(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString("ko-KR") + "원";
}
function fmtWonShort(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (abs >= 10000) return `${Math.round(n / 10000)}만`;
  return Math.round(n).toLocaleString("ko-KR");
}

const DOW_KO = ["월", "화", "수", "목", "금", "토", "일"] as const;

// ── 집계 helpers ────────────────────────────────────────────────────────────
function buildDateRows(dateData: DateBlockLite[]): MetricRow[] {
  // chronological (오래된 → 최신)
  const sorted = [...dateData].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((d) => {
    const revenue = d.totalSale;
    const customers = d.totalCust;
    const margin = d.totalMargin;
    return {
      key: shortDateWithDow(d.date),
      rawDate: d.date,
      revenue,
      customers,
      avgTicket: customers > 0 ? revenue / customers : null,
      marginRate: revenue > 0 ? (margin / revenue) * 100 : null,
    };
  });
}

function buildWeekdayRows(dateData: DateBlockLite[]): MetricRow[] {
  // bucket · idx 0=월 ~ 6=일
  const buckets: { totalRevenue: number; totalCustomers: number; totalMargin: number; sampleDays: number }[] =
    Array.from({ length: 7 }, () => ({ totalRevenue: 0, totalCustomers: 0, totalMargin: 0, sampleDays: 0 }));

  for (const d of dateData) {
    // "YYYY-MM-DD" → Date
    const [y, m, day] = d.date.split("-").map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) continue;
    const js = new Date(y, m - 1, day);
    const jsDow = js.getDay();            // 0=일 ~ 6=토
    const idx = jsDow === 0 ? 6 : jsDow - 1; // 0=월 ~ 6=일
    const b = buckets[idx];
    b.totalRevenue += d.totalSale;
    b.totalCustomers += d.totalCust;
    b.totalMargin += d.totalMargin;
    b.sampleDays += 1;
  }

  return DOW_KO.map((label, i) => {
    const b = buckets[i];
    const avgRevenue = b.sampleDays > 0 ? b.totalRevenue / b.sampleDays : 0;
    const avgCustomers = b.sampleDays > 0 ? b.totalCustomers / b.sampleDays : 0;
    const weightedAvgTicket = b.totalCustomers > 0 ? b.totalRevenue / b.totalCustomers : null;
    const weightedMarginRate = b.totalRevenue > 0 ? (b.totalMargin / b.totalRevenue) * 100 : null;
    return {
      key: label,
      revenue: avgRevenue,
      customers: avgCustomers,
      avgTicket: weightedAvgTicket,
      marginRate: weightedMarginRate,
      sampleDays: b.sampleDays,
    };
  });
}

// ── 공통 chart props (hover 동기화) ─────────────────────────────────────────
interface SharedChartProps {
  data: MetricRow[];
  xTickInterval: number | "preserveStartEnd";
  onHover: (idx: number | null) => void;
}

// ── 각 metric mini chart ────────────────────────────────────────────────────
const RevenueTrack: React.FC<SharedChartProps & { syncId: string }> = ({ data, xTickInterval, onHover, syncId }) => (
  <ResponsiveContainer width="100%" height={110}>
    <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 2 }} syncId={syncId}
      onMouseMove={(e: unknown) => { const t = e as { activeTooltipIndex?: number } | null; onHover(t?.activeTooltipIndex ?? null); }}
      onMouseLeave={() => onHover(null)}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
      <XAxis dataKey="key" tick={{ fontSize: 10, fill: "#71717a" }} interval={xTickInterval} />
      <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickFormatter={(v) => fmtWonShort(Number(v))} width={50} />
      <Tooltip content={() => null} cursor={{ stroke: "#f43f5e", strokeWidth: 1, strokeDasharray: "3 3" }} />
      <Line type="monotone" dataKey="revenue" stroke="#f43f5e" strokeWidth={2}
        dot={{ r: 2, strokeWidth: 1 }} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls={false} />
    </LineChart>
  </ResponsiveContainer>
);

const AvgTicketTrack: React.FC<SharedChartProps & { syncId: string }> = ({ data, xTickInterval, onHover, syncId }) => (
  <ResponsiveContainer width="100%" height={110}>
    <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 2 }} syncId={syncId}
      onMouseMove={(e: unknown) => { const t = e as { activeTooltipIndex?: number } | null; onHover(t?.activeTooltipIndex ?? null); }}
      onMouseLeave={() => onHover(null)}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
      <XAxis dataKey="key" tick={{ fontSize: 10, fill: "#71717a" }} interval={xTickInterval} />
      <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickFormatter={(v) => fmtWonShort(Number(v))} width={50} />
      <Tooltip content={() => null} cursor={{ stroke: "#10b981", strokeWidth: 1, strokeDasharray: "3 3" }} />
      <Line type="monotone" dataKey="avgTicket" stroke="#10b981" strokeWidth={2}
        dot={{ r: 2, strokeWidth: 1 }} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls={false} />
    </LineChart>
  </ResponsiveContainer>
);

const MarginRateTrack: React.FC<SharedChartProps & { syncId: string }> = ({ data, xTickInterval, onHover, syncId }) => (
  <ResponsiveContainer width="100%" height={110}>
    <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 2 }} syncId={syncId}
      onMouseMove={(e: unknown) => { const t = e as { activeTooltipIndex?: number } | null; onHover(t?.activeTooltipIndex ?? null); }}
      onMouseLeave={() => onHover(null)}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
      <XAxis dataKey="key" tick={{ fontSize: 10, fill: "#71717a" }} interval={xTickInterval} />
      <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} width={50} />
      <Tooltip content={() => null} cursor={{ stroke: "#6366f1", strokeWidth: 1, strokeDasharray: "3 3" }} />
      <Line type="monotone" dataKey="marginRate" stroke="#6366f1" strokeWidth={2}
        dot={{ r: 2, strokeWidth: 1 }} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls={false} />
    </LineChart>
  </ResponsiveContainer>
);

const CustomersTrack: React.FC<SharedChartProps & { syncId: string }> = ({ data, xTickInterval, onHover, syncId }) => (
  <ResponsiveContainer width="100%" height={110}>
    <BarChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 2 }} syncId={syncId}
      onMouseMove={(e: unknown) => { const t = e as { activeTooltipIndex?: number } | null; onHover(t?.activeTooltipIndex ?? null); }}
      onMouseLeave={() => onHover(null)}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
      <XAxis dataKey="key" tick={{ fontSize: 10, fill: "#71717a" }} interval={xTickInterval} />
      <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickFormatter={(v) => Math.round(Number(v)).toLocaleString()} width={50} />
      <Tooltip content={() => null} cursor={{ fill: "#0ea5e9", fillOpacity: 0.08 }} />
      <Bar dataKey="customers" fill="#0ea5e9" radius={[2, 2, 0, 0]} isAnimationActive={false} />
    </BarChart>
  </ResponsiveContainer>
);

// ── 메인 컴포넌트 ───────────────────────────────────────────────────────────
export const RevenueFlowChart: React.FC<{ dateData: DateBlockLite[] }> = ({ dateData }) => {
  const [viewMode, setViewMode] = useState<ViewMode>("date");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const rows: MetricRow[] = useMemo(
    () => (viewMode === "date" ? buildDateRows(dateData) : buildWeekdayRows(dateData)),
    [viewMode, dateData],
  );

  // X tick interval · 날짜가 많으면 자동 간격 조정 (data point는 그대로)
  const xTickInterval: number | "preserveStartEnd" = useMemo(() => {
    if (viewMode === "weekday") return 0;      // 요일 7개 전부 표시
    if (rows.length <= 10) return 0;           // 전부
    if (rows.length <= 20) return 1;           // 격일
    if (rows.length <= 40) return 3;           // 4일마다
    return "preserveStartEnd";
  }, [viewMode, rows.length]);

  const hoverRow = hoverIdx != null && hoverIdx >= 0 && hoverIdx < rows.length ? rows[hoverIdx] : null;

  const SYNC_ID = `rev-flow-${viewMode}`;

  if (dateData.length === 0) return null;

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-3 md:p-4 w-full min-w-0 max-w-full overflow-hidden">
      {/* 상단 · 제목 + viewMode toggle */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="text-[15px] md:text-[16px] font-bold text-zinc-800">매출 흐름 분석</div>
        <div className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 rounded-lg p-0.5">
          {(["date", "weekday"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setViewMode(v)}
              className={`px-3 py-1 text-[13px] font-semibold rounded-md transition cursor-pointer whitespace-nowrap ${
                viewMode === v ? "bg-brand-deep text-white shadow-sm" : "text-zinc-600 hover:bg-white"
              }`}>
              {v === "date" ? "날짜별" : "요일별"}
            </button>
          ))}
        </div>
      </div>

      {/* Unified hover tooltip strip · hover 시 노출 · 없으면 placeholder */}
      <div className="mb-2 min-h-[52px]">
        {hoverRow ? (
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2 text-[13px] tabular-nums">
            <span className="font-bold text-zinc-800 whitespace-nowrap">
              {viewMode === "weekday" ? `${hoverRow.key}요일 평균` : hoverRow.key}
            </span>
            <span className="whitespace-nowrap"><span className="text-rose-600 font-semibold">매출</span> {fmtWon(hoverRow.revenue)}</span>
            <span className="whitespace-nowrap"><span className="text-emerald-600 font-semibold">객단가</span> {hoverRow.avgTicket != null ? fmtWon(hoverRow.avgTicket) : "-"}</span>
            <span className="whitespace-nowrap"><span className="text-indigo-600 font-semibold">마진율</span> {hoverRow.marginRate != null ? `${hoverRow.marginRate.toFixed(1)}%` : "-"}</span>
            <span className="whitespace-nowrap"><span className="text-sky-600 font-semibold">고객수</span> {Math.round(hoverRow.customers).toLocaleString()}명</span>
            {viewMode === "weekday" && hoverRow.sampleDays != null && (
              <span className="whitespace-nowrap text-zinc-500">표본 {hoverRow.sampleDays}일</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-x-3 flex-wrap text-[12px] text-zinc-400 bg-zinc-50/60 border border-zinc-100 rounded-md px-3 py-2">
            <span>차트 위에 마우스를 올리면 상세값 표시</span>
            <span>·</span>
            <span className="text-rose-600 font-semibold">매출</span>
            <span className="text-emerald-600 font-semibold">객단가</span>
            <span className="text-indigo-600 font-semibold">마진율</span>
            <span className="text-sky-600 font-semibold">고객수</span>
          </div>
        )}
      </div>

      {/* 4 synchronized tracks · 각 metric 독립 Y scale · 공유 X축 (syncId) */}
      <div className="flex flex-col gap-1">
        <TrackHeader label="매출" color="text-rose-600" />
        <RevenueTrack data={rows} xTickInterval={xTickInterval} onHover={setHoverIdx} syncId={SYNC_ID} />
        <TrackHeader label="객단가" color="text-emerald-600" />
        <AvgTicketTrack data={rows} xTickInterval={xTickInterval} onHover={setHoverIdx} syncId={SYNC_ID} />
        <TrackHeader label="마진율" color="text-indigo-600" />
        <MarginRateTrack data={rows} xTickInterval={xTickInterval} onHover={setHoverIdx} syncId={SYNC_ID} />
        <TrackHeader label="고객수" color="text-sky-600" />
        <CustomersTrack data={rows} xTickInterval={xTickInterval} onHover={setHoverIdx} syncId={SYNC_ID} />
      </div>
    </div>
  );
};

const TrackHeader: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <div className={`text-[12px] font-semibold ${color} px-1 pt-1`}>{label}</div>
);

export default RevenueFlowChart;
