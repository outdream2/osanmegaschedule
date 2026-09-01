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
  ScatterChart, Scatter, ZAxis,
  RadialBarChart, RadialBar,
  AreaChart, Area,
} from "recharts";
import { ChartCard } from "../common/ChartCard";
import { fmtWon } from "../../lib/format";
import { calcLoss, type StockFlowRow } from "./StockFlowPanel";
import { TrendingUp, PieChart as PieIcon, Percent, AlertTriangle, PackageX, Building2, Activity, DollarSign, Gauge, TrendingDown } from "lucide-react";

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

// ─── 4. 손실 Top 10 · alert-oriented horizontal bar (rose 톤)
const LossTopChart: React.FC<{ rows: StockFlowRow[]; loading: boolean }> = ({ rows, loading }) => {
  const data = useMemo(() => {
    const scored = rows
      .map(r => ({
        name: String(r.product_name ?? "").trim(),
        loss: calcLoss(r),
        salePrice: Number(r.sale_price ?? 0),
      }))
      .filter(x => x.name && x.loss > 0);
    scored.sort((a, b) => b.loss - a.loss);
    return scored.slice(0, 10).map(x => ({
      name: x.name.length > 20 ? x.name.slice(0, 20) + "..." : x.name,
      fullName: x.name,
      loss: x.loss,
      lossAmount: x.loss * x.salePrice,
    }));
  }, [rows]);

  const totalLoss = useMemo(() => data.reduce((s, d) => s + d.loss, 0), [data]);

  return (
    <ChartCard
      title="손실 Top 10"
      icon={<PackageX size={14} className="text-rose-600" />}
      description={`총 손실 ${totalLoss.toLocaleString()}개 · 관리 대상`}
      loading={loading}
      empty={data.length === 0}
      emptyMessage="손실 없음"
      minHeight={280}
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 50, bottom: 4, left: 4 }}>
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
            formatter={(v: any, name: any) => {
              if (name === "loss") return [`${v}개`, "손실 수량"];
              return [v, name];
            }}
            labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.fullName ?? ""}
            contentStyle={{ background: "white", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 12px rgba(239,68,68,0.15)" }}
          />
          <Bar dataKey="loss" radius={[0, 4, 4, 0]} fill="#EF4444">
            <LabelList
              dataKey="loss"
              position="right"
              formatter={(v: any) => `${v}개`}
              style={{ fontSize: 10, fontWeight: 700, fill: "#b91c1c" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// ─── 5. 공급사 Top 10 매출 · bar chart
const SupplierTopChart: React.FC<{ rows: StockFlowRow[]; loading: boolean }> = ({ rows, loading }) => {
  const data = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    for (const r of rows) {
      const sup = String((r as any).supplier ?? "").trim();
      if (!sup) continue;
      const qty = Number(r.sale_qty ?? 0);
      const price = Number(r.sale_price ?? 0);
      if (qty <= 0 || price <= 0) continue;
      const cur = map.get(sup) ?? { amount: 0, count: 0 };
      cur.amount += qty * price;
      cur.count += 1;
      map.set(sup, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 10)
      .map(([name, v], i) => ({
        name: name.length > 12 ? name.slice(0, 12) + "..." : name,
        fullName: name,
        amount: v.amount,
        count: v.count,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [rows]);

  return (
    <ChartCard
      title="공급사 Top 10"
      icon={<Building2 size={14} className="text-brand-deep" />}
      description="매출 기여도 상위"
      loading={loading}
      empty={data.length === 0}
      emptyMessage="공급사 데이터 없음"
      minHeight={280}
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 20, right: 8, bottom: 40, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
          <XAxis
            dataKey="name"
            angle={-30}
            textAnchor="end"
            height={60}
            interval={0}
            tick={{ fontSize: 10, fill: "#52525b", fontWeight: 600 }}
            axisLine={{ stroke: "#e4e4e7" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: any) => {
              if (v >= 1e8) return `${(v / 1e8).toFixed(0)}억`;
              if (v >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
              return String(v);
            }}
          />
          <Tooltip
            formatter={(v: any) => [fmtWon(Number(v)) + "원", "매출"]}
            labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.fullName ?? ""}
            contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// ─── 6. 재고 vs 판매 산점도 · fast/slow mover 판별
const StockVsSalesScatter: React.FC<{ rows: StockFlowRow[]; loading: boolean }> = ({ rows, loading }) => {
  const data = useMemo(() => {
    return rows
      .map(r => ({
        name: String(r.product_name ?? "").trim(),
        sale: Number(r.sale_qty ?? 0),
        stock: Number((r as any).closing_stock ?? (r as any).current_stock ?? 0),
        loss: calcLoss(r),
      }))
      .filter(x => x.name && (x.sale > 0 || x.stock > 0))
      .slice(0, 300);
  }, [rows]);

  // 4분면 표시 · 판매↑ 재고↑ (안정) · 판매↑ 재고↓ (부족) · 판매↓ 재고↑ (악성) · 판매↓ 재고↓ (양호)
  return (
    <ChartCard
      title="재고 vs 판매 산점도"
      icon={<Activity size={14} className="text-violet-600" />}
      description="fast/slow mover 판별"
      loading={loading}
      empty={data.length === 0}
      emptyMessage="분석 데이터 없음"
      minHeight={280}
    >
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 12, right: 12, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
          <XAxis
            type="number"
            dataKey="sale"
            name="판매수량"
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={{ stroke: "#e4e4e7" }}
            label={{ value: "판매수량 →", position: "insideBottom", offset: -8, fontSize: 11, fill: "#52525b" }}
          />
          <YAxis
            type="number"
            dataKey="stock"
            name="재고"
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={{ stroke: "#e4e4e7" }}
            label={{ value: "재고 ↑", angle: -90, position: "insideLeft", fontSize: 11, fill: "#52525b" }}
          />
          <ZAxis range={[24, 24]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            formatter={(v: any, name: any) => {
              if (name === "판매수량") return [`${v}개`, name];
              if (name === "재고") return [`${v}개`, name];
              return [v, name];
            }}
            labelFormatter={() => ""}
            content={({ payload }: any) => {
              if (!payload || !payload.length) return null;
              const d = payload[0].payload;
              return (
                <div className="bg-white border border-line rounded-lg px-2.5 py-1.5 shadow-lg text-[12px]">
                  <div className="font-bold text-ink mb-0.5">{d.name}</div>
                  <div className="text-zinc-600">판매 <span className="tabular-nums font-bold text-brand-deep">{d.sale}개</span></div>
                  <div className="text-zinc-600">재고 <span className="tabular-nums font-bold text-emerald-700">{d.stock}개</span></div>
                  {d.loss > 0 && <div className="text-rose-600">손실 {d.loss}개</div>}
                </div>
              );
            }}
          />
          <Scatter data={data} fill="#8B5CF6" fillOpacity={0.55} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// ─── 7. 가격대별 판매 분포 · area chart (판매가 buckets)
const PriceBandChart: React.FC<{ rows: StockFlowRow[]; loading: boolean }> = ({ rows, loading }) => {
  const data = useMemo(() => {
    // 가격대 · 0-1천, 1-3천, 3-5천, 5-10천, 10-20천, 20-50천, 50천+
    const bands = [
      { label: "~1천", min: 0, max: 1000 },
      { label: "1-3천", min: 1000, max: 3000 },
      { label: "3-5천", min: 3000, max: 5000 },
      { label: "5-10천", min: 5000, max: 10000 },
      { label: "10-20천", min: 10000, max: 20000 },
      { label: "20-50천", min: 20000, max: 50000 },
      { label: "50천+", min: 50000, max: Infinity },
    ];
    return bands.map(b => {
      let qty = 0;
      let amount = 0;
      let count = 0;
      for (const r of rows) {
        const sp = Number(r.sale_price ?? 0);
        const sq = Number(r.sale_qty ?? 0);
        if (sq <= 0) continue;
        if (sp >= b.min && sp < b.max) {
          qty += sq;
          amount += sq * sp;
          count += 1;
        }
      }
      return { label: b.label, qty, amount, count };
    });
  }, [rows]);

  const total = useMemo(() => data.reduce((s, d) => s + d.amount, 0), [data]);
  const hasData = total > 0;

  return (
    <ChartCard
      title="가격대별 판매"
      icon={<DollarSign size={14} className="text-emerald-600" />}
      description={`전체 ${fmtWon(total)}원`}
      loading={loading}
      empty={!hasData}
      emptyMessage="가격 데이터 없음"
      minHeight={280}
    >
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#52525b", fontWeight: 600 }}
            axisLine={{ stroke: "#e4e4e7" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: any) => {
              if (v >= 1e8) return `${(v / 1e8).toFixed(0)}억`;
              if (v >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
              return String(v);
            }}
          />
          <Tooltip
            formatter={(v: any, name: any) => {
              if (name === "amount") return [fmtWon(Number(v)) + "원", "매출"];
              return [v, name];
            }}
            contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
          />
          <Area type="monotone" dataKey="amount" stroke="#10B981" strokeWidth={2.5} fill="url(#priceGradient)">
            <LabelList
              dataKey="count"
              position="top"
              formatter={(v: any) => (v > 0 ? `${v}종` : "")}
              style={{ fontSize: 10, fontWeight: 700, fill: "#059669" }}
            />
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// ─── 8. 재고 상태 게이지 · radial bar (건강도 종합 스코어)
const StockHealthGauge: React.FC<{ rows: StockFlowRow[]; loading: boolean }> = ({ rows, loading }) => {
  const { healthy, warning, critical, healthScore } = useMemo(() => {
    let h = 0, w = 0, c = 0;
    for (const r of rows) {
      const cur = Number((r as any).current_stock ?? 0);
      const opt = Number((r as any).optimal_stock ?? 0);
      if (opt <= 0) continue;
      const ratio = cur / opt;
      if (ratio < 0.3) c += 1;
      else if (ratio < 0.7) w += 1;
      else h += 1;
    }
    const total = h + w + c;
    const score = total > 0 ? Math.round((h * 1 + w * 0.5) / total * 100) : 0;
    return { healthy: h, warning: w, critical: c, healthScore: score };
  }, [rows]);

  const data = [
    { name: "critical", value: critical, fill: "#EF4444" },
    { name: "warning", value: warning, fill: "#F59E0B" },
    { name: "healthy", value: healthy, fill: "#10B981" },
  ];
  const totalCount = healthy + warning + critical;
  const scoreTone = healthScore >= 70 ? "text-emerald-600" : healthScore >= 40 ? "text-amber-600" : "text-rose-600";
  const scoreIcon = healthScore >= 70 ? Gauge : healthScore >= 40 ? Activity : TrendingDown;
  const ScoreIcon = scoreIcon;

  return (
    <ChartCard
      title="재고 건강도"
      icon={<Gauge size={14} className="text-brand-deep" />}
      description={`${totalCount}종 · 종합 ${healthScore}점`}
      loading={loading}
      empty={totalCount === 0}
      emptyMessage="재고 데이터 없음"
      minHeight={280}
    >
      <div className="flex items-center gap-3 h-[260px]">
        <div className="relative w-[160px] h-[160px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="100%"
              barSize={14}
              data={data}
              startAngle={90}
              endAngle={-270}
            >
              <RadialBar background dataKey="value" cornerRadius={7} />
              <Tooltip
                formatter={(v: any, name: any) => {
                  if (name === "value") {
                    const d = data.find(x => x.value === v);
                    const label = d?.name === "healthy" ? "건강" : d?.name === "warning" ? "주의" : "위험";
                    return [`${v}종`, label];
                  }
                  return [v, name];
                }}
                contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          {/* 중앙 · 스코어 · absolute overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <ScoreIcon size={14} className={scoreTone} />
            <span className={`text-[26px] font-extrabold tabular-nums leading-none mt-0.5 ${scoreTone}`}>
              {healthScore}
            </span>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">score</span>
          </div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-emerald-500 shrink-0" />
            <span className="text-[12px] font-semibold text-zinc-600 flex-1">건강 (70%+)</span>
            <span className="tabular-nums font-bold text-emerald-700 text-[13px]">{healthy}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-amber-500 shrink-0" />
            <span className="text-[12px] font-semibold text-zinc-600 flex-1">주의 (30-70%)</span>
            <span className="tabular-nums font-bold text-amber-700 text-[13px]">{warning}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-rose-500 shrink-0" />
            <span className="text-[12px] font-semibold text-zinc-600 flex-1">위험 (30% 미만)</span>
            <span className="tabular-nums font-bold text-rose-700 text-[13px]">{critical}</span>
          </div>
          {critical > 0 && (
            <div className="mt-1 pt-2 border-t border-zinc-100 text-[11px] font-bold text-rose-600 flex items-center gap-1">
              <AlertTriangle size={11} />
              긴급 발주 · {critical}종
            </div>
          )}
        </div>
      </div>
    </ChartCard>
  );
};

// ─── DashboardCharts · 다중 row grid (7 차트)
export interface DashboardChartsProps {
  rows: StockFlowRow[];
  loading?: boolean;
}

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ rows, loading = false }) => {
  return (
    <div className="flex flex-col gap-3">
      {/* Row 1 · 매출 인사이트 · Top 상품·카테고리·이익률 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <TopSalesChart rows={rows} loading={loading} />
        <CategoryDistChart rows={rows} loading={loading} />
        <ProfitDistChart rows={rows} loading={loading} />
      </div>
      {/* Row 2 · 재고·손실·공급사 인사이트 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <LossTopChart rows={rows} loading={loading} />
        <SupplierTopChart rows={rows} loading={loading} />
        <StockHealthGauge rows={rows} loading={loading} />
      </div>
      {/* Row 3 · 상세 분석 · scatter + area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <StockVsSalesScatter rows={rows} loading={loading} />
        <PriceBandChart rows={rows} loading={loading} />
      </div>
    </div>
  );
};

export default DashboardCharts;
