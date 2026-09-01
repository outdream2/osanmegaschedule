// src/components/SalesTrendPage/DashboardCharts.tsx
// 2026-09-01 · 사용자 지시 · 판매 대시보드 · 차트 다양화 · 최신 트렌드 (Linear · Vercel · Ramp 톤)
//   · 리스트업 위주 → 대시보드 답게 · 인사이트 중심 · 차트 카드 그리드
//   · ChartCard 프리미티브 · recharts 활용
//
// 3-column 차트 그리드:
//   1. Top 10 판매액 (horizontal bar) · 매출 견인 상품
//   2. 카테고리 분포 (donut) · 매출 구조
//   3. 이익률 분포 (histogram bar) · 이익 상태 · 손실 위험 시각화

import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Cell as PieCell,
  CartesianGrid, LabelList,
} from "recharts";
import { ChartCard } from "../common/ChartCard";
import { fmtWon } from "../../lib/format";
import { calcLoss, type StockFlowRow } from "./StockFlowPanel";
import { TrendingUp, PieChart as PieIcon, Percent, AlertTriangle } from "lucide-react";

// ─── 색상 팔레트 · Linear/Vercel 톤 (deep blue · teal · violet · rose · amber)
const CHART_COLORS = [
  "#0A2E4A", // brand-deep (dominant)
  "#0EA5E9", // sky
  "#14B8A6", // teal
  "#8B5CF6", // violet
  "#F59E0B", // amber
  "#EF4444", // rose
  "#10B981", // emerald
  "#EC4899", // pink
  "#6366F1", // indigo
  "#84CC16", // lime
];

// 카테고리 분류 (LandingPage/공급사에서 추출)
function classifyCategory(name: string, supplier: string | null): string {
  const n = String(name ?? "").toLowerCase();
  const s = String(supplier ?? "").toLowerCase();
  if (/파스|고약|밴드/.test(n)) return "외용제";
  if (/스킨|로션|크림|화장|샴푸/.test(n) || /화장품/.test(s)) return "화장품";
  if (/음료|비타|드링|박카스/.test(n)) return "음료";
  if (/식품|영양|건강/.test(n)) return "건강식품";
  if (/마스크|장갑|위생|소독/.test(n)) return "위생용품";
  if (/타이레놀|해열|진통|감기|알약|정|캡슐/.test(n)) return "일반의약품";
  return "기타";
}

// ─── 1. Top 10 판매액 · horizontal bar
const TopSalesChart: React.FC<{ rows: StockFlowRow[]; loading: boolean }> = ({ rows, loading }) => {
  const data = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const qty = Number(r.sale_qty ?? 0);
      const price = Number(r.sale_price ?? 0);
      if (qty <= 0 || price <= 0) continue;
      const name = String(r.product_name ?? "").trim();
      if (!name) continue;
      map.set(name, (map.get(name) ?? 0) + qty * price);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, amount]) => ({
        name: name.length > 20 ? name.slice(0, 20) + "..." : name,
        fullName: name,
        amount,
      }));
  }, [rows]);

  return (
    <ChartCard
      title="Top 10 판매액"
      icon={<TrendingUp size={14} className="text-brand-deep" />}
      description="매출 견인 상품"
      loading={loading}
      empty={data.length === 0}
      emptyMessage="판매 데이터 없음"
      minHeight={280}
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fontSize: 11, fill: "#52525b", fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(v: any) => [fmtWon(Number(v)) + "원", "판매액"]}
            labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.fullName ?? ""}
            contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
          />
          <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
            <LabelList
              dataKey="amount"
              position="right"
              formatter={(v: any) => fmtWon(Number(v))}
              style={{ fontSize: 10, fontWeight: 700, fill: "#3f3f46" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// ─── 2. 카테고리 분포 · donut
const CategoryDistChart: React.FC<{ rows: StockFlowRow[]; loading: boolean }> = ({ rows, loading }) => {
  const { data, total } = useMemo(() => {
    const map = new Map<string, number>();
    let t = 0;
    for (const r of rows) {
      const qty = Number(r.sale_qty ?? 0);
      const price = Number(r.sale_price ?? 0);
      if (qty <= 0 || price <= 0) continue;
      const cat = classifyCategory(String(r.product_name ?? ""), (r as any).supplier);
      const amount = qty * price;
      map.set(cat, (map.get(cat) ?? 0) + amount);
      t += amount;
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    return {
      data: sorted.map(([name, value], i) => ({ name, value, color: CHART_COLORS[i % CHART_COLORS.length] })),
      total: t,
    };
  }, [rows]);

  return (
    <ChartCard
      title="카테고리 분포"
      icon={<PieIcon size={14} className="text-brand-deep" />}
      description={`전체 ${fmtWon(total)}원`}
      loading={loading}
      empty={total === 0}
      emptyMessage="카테고리 데이터 없음"
      minHeight={280}
    >
      <div className="flex items-center gap-3 h-[260px]">
        <div className="w-[140px] h-[140px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={66}
                strokeWidth={2}
                stroke="#ffffff"
              >
                {data.map((entry, i) => (
                  <PieCell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: any) => [fmtWon(Number(v)) + "원", ""]}
                contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1 overflow-y-auto max-h-[240px]">
          {data.map((d) => {
            const pct = total > 0 ? (d.value / total) * 100 : 0;
            return (
              <div key={d.name} className="flex items-center gap-2 text-[12px]">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                <span className="flex-1 min-w-0 font-semibold text-zinc-700 truncate">{d.name}</span>
                <span className="tabular-nums font-bold text-zinc-800">{pct.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </ChartCard>
  );
};

// ─── 3. 이익률 분포 · histogram (구간별 상품 수)
const ProfitDistChart: React.FC<{ rows: StockFlowRow[]; loading: boolean }> = ({ rows, loading }) => {
  const { data, avgProfit, lossCount } = useMemo(() => {
    // 구간 · <0%, 0-10%, 10-20%, 20-30%, 30-40%, 40%+
    const buckets = [
      { label: "손실", min: -Infinity, max: 0, color: "#EF4444" },
      { label: "0-10%", min: 0, max: 10, color: "#F97316" },
      { label: "10-20%", min: 10, max: 20, color: "#F59E0B" },
      { label: "20-30%", min: 20, max: 30, color: "#84CC16" },
      { label: "30-40%", min: 30, max: 40, color: "#10B981" },
      { label: "40%+", min: 40, max: Infinity, color: "#0A2E4A" },
    ];
    const counts = buckets.map(b => ({ ...b, count: 0 }));
    let sumRate = 0;
    let n = 0;
    let losses = 0;
    for (const r of rows) {
      const sp = Number(r.sale_price ?? 0);
      const pp = Number((r as any).purchase_price ?? 0);
      const qty = Number(r.sale_qty ?? 0);
      if (qty <= 0 || sp <= 0 || pp <= 0) continue;
      const rate = ((sp - pp) / sp) * 100;
      if (!Number.isFinite(rate)) continue;
      sumRate += rate;
      n += 1;
      if (rate < 0) losses += 1;
      const bucket = counts.find(b => rate >= b.min && rate < b.max);
      if (bucket) bucket.count += 1;
    }
    return {
      data: counts,
      avgProfit: n > 0 ? sumRate / n : 0,
      lossCount: losses,
    };
  }, [rows]);

  const hasData = data.some(d => d.count > 0);

  return (
    <ChartCard
      title="이익률 분포"
      icon={<Percent size={14} className="text-brand-deep" />}
      description={
        <>
          평균 <span className="tabular-nums font-bold text-emerald-700">{avgProfit.toFixed(1)}%</span>
          {lossCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-rose-600 font-bold">
              <AlertTriangle size={11} />손실 {lossCount}종
            </span>
          )}
        </> as any
      }
      loading={loading}
      empty={!hasData}
      emptyMessage="이익률 데이터 없음"
      minHeight={280}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#52525b", fontWeight: 600 }}
            axisLine={{ stroke: "#e4e4e7" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(v: any) => [`${v}종`, "상품 수"]}
            contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
            <LabelList
              dataKey="count"
              position="top"
              formatter={(v: any) => (v > 0 ? v : "")}
              style={{ fontSize: 11, fontWeight: 700, fill: "#3f3f46" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// ─── DashboardCharts · 3-column grid wrapper
export interface DashboardChartsProps {
  rows: StockFlowRow[];
  loading?: boolean;
}

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ rows, loading = false }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <TopSalesChart rows={rows} loading={loading} />
      <CategoryDistChart rows={rows} loading={loading} />
      <ProfitDistChart rows={rows} loading={loading} />
    </div>
  );
};

export default DashboardCharts;
// 미사용 · reserved
void calcLoss;
