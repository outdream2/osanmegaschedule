// src/lib/stockPeriodUtils.tsx
// 재고 기간 유틸 · SalesTrendPage 와 StockManagePage 양쪽에서 공유
// (순환 참조 방지용 분리 파일)

import React, { useState } from "react";

// ─── 포맷 헬퍼 ────────────────────────────────────────────────────────────────
export const fmt = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(Number(n))) return "0";
  return Number(n).toLocaleString();
};
export const fmtWon = (n: number | null | undefined): string => {
  if (n == null) return "-";
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  if (Math.abs(v) >= 1_0000_0000) return `${(v / 1_0000_0000).toFixed(1)}억`;
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(1)}만`;
  return v.toLocaleString() + "원";
};

// ─── 기간 라벨 ───────────────────────────────────────────────────────────────
export const periodLabel = (start: string, end: string): string => {
  const m1 = /^\d{4}-(\d{2})-(\d{2})$/.exec(start);
  const m2 = /^\d{4}-(\d{2})-(\d{2})$/.exec(end);
  if (!m1 || !m2) return `${start} ~ ${end}`;
  return `${Number(m1[1])}/${Number(m1[2])} ~ ${Number(m2[1])}/${Number(m2[2])}`;
};

// ─── PeriodRow 타입 ───────────────────────────────────────────────────────────
export type PeriodRow = {
  period_start_date: string;
  snapshot_date: string;
  period_type: string | null;
  supplier_name?: string | null;
  product_name?: string | null;
  spec?: string | null;
  opening_stock?: number;
  purchase_qty?: number;
  sale_qty?: number;
  disposal_qty?: number;
  closing_stock?: number;
  supply_amount?: number;
  total_amount?: number;
  product_count?: number;
};

// ─── Y축 nice scale ───────────────────────────────────────────────────────────
function niceScale(maxVal: number): { niceMax: number; ticks: number[] } {
  if (!Number.isFinite(maxVal) || maxVal <= 0) return { niceMax: 1, ticks: [0, 1] };
  const exp = Math.floor(Math.log10(maxVal));
  const pow = Math.pow(10, exp);
  const mantissa = maxVal / pow;
  let niceMantissa: number;
  if (mantissa <= 1) niceMantissa = 1;
  else if (mantissa <= 2) niceMantissa = 2;
  else if (mantissa <= 2.5) niceMantissa = 2.5;
  else if (mantissa <= 5) niceMantissa = 5;
  else niceMantissa = 10;
  const niceMax = niceMantissa * pow;
  const stepCount = 4;
  const step = niceMax / stepCount;
  const ticks = Array.from({ length: stepCount + 1 }, (_, i) => i * step);
  return { niceMax, ticks };
}

// ─── 라인 + 막대 혼합 차트 ───────────────────────────────────────────────────
interface ChartSeries {
  label: string;
  color: string;
  values: number[];
  kind?: "line" | "bar";
  format?: "count" | "won";
}
interface LineChartProps {
  labels: string[];
  series: ChartSeries[];
  height?: number;
}
const MultiLineChartInner: React.FC<LineChartProps> = ({ labels, series, height = 320 }) => {
  const W = 720;
  const H = height;
  const padL = 58, padR = 58, padT = 18, padB = 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const n = labels.length;
  if (n === 0) return <div className="text-center text-slate-400 text-xs py-8">데이터 없음</div>;

  const lineSeries = series.filter(s => s.kind !== "bar");
  const barSeries = series.filter(s => s.kind === "bar");

  const lineAreaH = chartH * 0.60;
  const barAreaH = chartH * 0.40;
  const lineTop = padT;
  const barTop = padT + lineAreaH;

  const lineRaw = Math.max(1, ...lineSeries.flatMap(s => s.values));
  const barRaw = Math.max(1, ...barSeries.flatMap(s => s.values));
  const lineScale = niceScale(lineRaw);
  const barScale = niceScale(barRaw);
  const lineMax = lineScale.niceMax;
  const barMax = barScale.niceMax;

  const xAt = (i: number) => padL + (n === 1 ? chartW / 2 : (chartW * i) / (n - 1));
  const yLine = (v: number) => lineTop + lineAreaH - (v / lineMax) * lineAreaH;
  const yBar = (v: number) => barTop + barAreaH - (v / barMax) * barAreaH;

  const lineTicks = lineScale.ticks;
  const barTicks = [barScale.ticks[0], barScale.ticks[Math.floor(barScale.ticks.length / 2)], barScale.ticks[barScale.ticks.length - 1]];

  const slotW = n === 1 ? chartW * 0.4 : chartW / (n - 1) * 0.7;
  const barW = barSeries.length > 0 ? Math.max(6, slotW / barSeries.length) : 0;

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W - padL;
    if (x < 0 || x > chartW) { setHoverIdx(null); return; }
    const i = n === 1 ? 0 : Math.round((x / chartW) * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {lineTicks.map((v, i) => (
          <g key={`ly-${i}`}>
            <line x1={padL} y1={yLine(v)} x2={W - padR} y2={yLine(v)} stroke="#e2e8f0" strokeDasharray="2 3" />
            <text x={padL - 6} y={yLine(v) + 3} textAnchor="end" fontSize="12" fill="#64748b">
              {Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}만` : fmt(Math.round(v))}
            </text>
          </g>
        ))}
        <line x1={padL} y1={barTop} x2={W - padR} y2={barTop} stroke="#cbd5e1" strokeWidth={1.2} />
        {barTicks.map((v, i) => (
          <g key={`by-${i}`}>
            <line x1={padL} y1={yBar(v)} x2={W - padR} y2={yBar(v)} stroke="#f1f5f9" strokeDasharray="1 3" />
            <text x={W - padR + 4} y={yBar(v) + 3} textAnchor="start" fontSize="12" fill="#818cf8">
              {Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}만` : fmt(Math.round(v))}
            </text>
          </g>
        ))}
        <text x={padL} y={padT + 8} fontSize="11" fill="#dc2626" fontWeight="bold">판매·종료재고 (좌축)</text>
        <text x={padL} y={barTop + 8} fontSize="11" fill="#10b981" fontWeight="bold">매입 (우축)</text>

        {labels.map((lb, i) => {
          if (n > 8 && i % Math.ceil(n / 8) !== 0 && i !== n - 1) return null;
          return (
            <text key={`x-${i}`} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#475569">
              {lb}
            </text>
          );
        })}

        {barSeries.map((s, si) => (
          <g key={`bar-${si}`}>
            {s.values.map((v, i) => {
              if (v <= 0) return null;
              const x = xAt(i) - (barSeries.length * barW) / 2 + si * barW;
              const y = yBar(v);
              const h = Math.max(1, yBar(0) - y);
              return (
                <g key={`b-${si}-${i}`}>
                  <rect x={x} y={y} width={barW * 0.85} height={h} fill={s.color} opacity={0.55} rx={1.5} />
                  <text x={x + barW * 0.425} y={y - 3} textAnchor="middle" fontSize="10" fill={s.color} fontWeight="bold">
                    {fmt(v)}
                  </text>
                </g>
              );
            })}
          </g>
        ))}

        {lineSeries.map((s, si) => {
          const segments: Array<Array<{ i: number; v: number }>> = [];
          let curSeg: Array<{ i: number; v: number }> = [];
          for (let i = 0; i < s.values.length; i++) {
            const v = s.values[i];
            if (v > 0) curSeg.push({ i, v });
            else if (curSeg.length > 0) { segments.push(curSeg); curSeg = []; }
          }
          if (curSeg.length > 0) segments.push(curSeg);
          return (
            <g key={`line-${si}`}>
              {segments.map((seg, segIdx) => (
                <polyline
                  key={`seg-${si}-${segIdx}`}
                  points={seg.map(p => `${xAt(p.i)},${yLine(p.v)}`).join(" ")}
                  fill="none" stroke={s.color} strokeWidth={2.5}
                  strokeLinejoin="round" strokeLinecap="round"
                />
              ))}
              {s.values.map((v, i) => v > 0 ? (
                <g key={`p-${si}-${i}`}>
                  <circle cx={xAt(i)} cy={yLine(v)} r={3.5} fill="white" stroke={s.color} strokeWidth={2} />
                  <text x={xAt(i)} y={yLine(v) - 8} textAnchor="middle" fontSize="11" fill={s.color} fontWeight="bold">
                    {fmt(v)}
                  </text>
                </g>
              ) : null)}
            </g>
          );
        })}

        {hoverIdx != null && (
          <g>
            <line x1={xAt(hoverIdx)} y1={padT} x2={xAt(hoverIdx)} y2={H - padB} stroke="#94a3b8" strokeDasharray="3 3" />
            {lineSeries.map((s, si) => (
              <circle key={`hc-${si}`} cx={xAt(hoverIdx)} cy={yLine(s.values[hoverIdx])} r={5.5} fill="white" stroke={s.color} strokeWidth={2.5} />
            ))}
          </g>
        )}
      </svg>
      <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px]">
        {series.map((s, si) => (
          <div key={`lg-${si}`} className="flex items-center gap-1">
            {s.kind === "bar"
              ? <span className="w-3 h-2.5 rounded-sm" style={{ background: s.color, opacity: 0.35 }} />
              : <span className="w-3 h-0.5 rounded" style={{ background: s.color }} />
            }
            <span className="font-bold text-slate-600">{s.label}</span>
            {hoverIdx != null && (
              <span className="font-mono text-slate-800">
                {s.format === "won" ? fmtWon(s.values[hoverIdx]) : fmt(s.values[hoverIdx])}
              </span>
            )}
          </div>
        ))}
        {hoverIdx != null && (
          <span className="ml-auto text-slate-500 font-mono font-bold">{labels[hoverIdx]}</span>
        )}
      </div>
    </div>
  );
};

export const MultiLineChart = React.memo(MultiLineChartInner);

// ─── 기간 목록 생성 ─────────────────────────────────────────────────────────
function generatePeriods(rangeDays: number): Array<{ start: string; end: string; period_type: "early" | "mid" | "late" }> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - rangeDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const periods: Array<{ start: string; end: string; period_type: "early" | "mid" | "late" }> = [];
  let year = cutoff.getFullYear();
  let month = cutoff.getMonth() + 1;

  while (true) {
    const mm = String(month).padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    periods.push({ start: `${year}-${mm}-01`, end: `${year}-${mm}-10`, period_type: "early" });
    periods.push({ start: `${year}-${mm}-11`, end: `${year}-${mm}-20`, period_type: "mid" });
    periods.push({ start: `${year}-${mm}-21`, end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`, period_type: "late" });
    if (year === today.getFullYear() && month === today.getMonth() + 1) break;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return periods.filter(p => p.end >= cutoffStr && p.start <= todayStr);
}

// ─── rows → 기간 목록 매핑 ────────────────────────────────────────────────
export function fillPeriodsWithRows<T extends { period_start_date: string; snapshot_date: string }>(
  rows: T[],
  rangeDays: number,
  makeEmpty: (start: string, end: string, periodType: "early" | "mid" | "late") => T,
): T[] {
  const periods = generatePeriods(rangeDays);
  const byStart = new Map<string, T>();
  for (const r of rows) byStart.set(String(r.period_start_date), r);
  return periods.map(p => byStart.get(p.start) ?? makeEmpty(p.start, p.end, p.period_type));
}

// ─── 10일 기간 rows → 월별 aggregation ──────────────────────────────────────
export function aggregateToMonths<T extends {
  period_start_date: string; snapshot_date: string; period_type: string | null;
  opening_stock?: number; purchase_qty?: number; sale_qty?: number; disposal_qty?: number;
  closing_stock?: number; supply_amount?: number; total_amount?: number; product_count?: number;
  supplier_name?: string | null; product_name?: string | null; spec?: string | null;
}>(rows: T[]): T[] {
  const byMonth = new Map<string, T>();
  for (const r of rows) {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(r.period_start_date);
    if (!m) continue;
    const key = `${m[1]}-${m[2]}`;
    if (!byMonth.has(key)) {
      byMonth.set(key, { ...r, period_start_date: `${key}-01`, snapshot_date: r.snapshot_date, period_type: null } as T);
      const agg = byMonth.get(key)! as any;
      agg.opening_stock = Number(r.opening_stock ?? 0) || 0;
      agg.purchase_qty = 0;
      agg.sale_qty = 0;
      agg.disposal_qty = 0;
      agg.closing_stock = Number(r.closing_stock ?? 0) || 0;
      agg.supply_amount = 0;
      agg.total_amount = 0;
      agg.product_count = 0;
      agg._first_snap = r.snapshot_date;
      agg._last_snap = r.snapshot_date;
    }
    const agg = byMonth.get(key)! as any;
    agg.purchase_qty += Number(r.purchase_qty ?? 0) || 0;
    agg.sale_qty += Number(r.sale_qty ?? 0) || 0;
    agg.disposal_qty += Number(r.disposal_qty ?? 0) || 0;
    agg.supply_amount += Number(r.supply_amount ?? 0) || 0;
    agg.total_amount += Number(r.total_amount ?? 0) || 0;
    if (r.snapshot_date < (agg._first_snap ?? r.snapshot_date)) {
      agg._first_snap = r.snapshot_date;
      agg.opening_stock = Number(r.opening_stock ?? 0) || 0;
    }
    if (r.snapshot_date > (agg._last_snap ?? "")) {
      agg._last_snap = r.snapshot_date;
      agg.snapshot_date = r.snapshot_date;
      agg.closing_stock = Number(r.closing_stock ?? 0) || 0;
    }
    agg.product_count = Math.max(agg.product_count, Number(r.product_count ?? 0) || 0);
  }
  return Array.from(byMonth.values())
    .map(v => { const { _first_snap, _last_snap, ...rest } = v as any; void _first_snap; void _last_snap; return rest as T; })
    .sort((a, b) => a.period_start_date.localeCompare(b.period_start_date));
}
