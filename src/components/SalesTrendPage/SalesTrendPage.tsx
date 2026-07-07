import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, TrendingUp, Building2, LineChart, Package, X, Info } from "lucide-react";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import type { ProductInfo } from "../../lib/productsCache";

// ─── 유틸 ───────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(Number(n))) return "-";
  return Number(n).toLocaleString();
};
const fmtWon = (n: number | null | undefined): string => {
  if (n == null) return "-";
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  if (Math.abs(v) >= 1_0000_0000) return `${(v / 1_0000_0000).toFixed(1)}억`;
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(1)}만`;
  return v.toLocaleString() + "원";
};
// 재고관리와 동일 · YYYY-M-D 형식에서 M/D 추출
function extractMonthDay(raw: any): string | null {
  if (!raw) return null;
  try {
    if (raw instanceof Date) return `${raw.getMonth() + 1}/${raw.getDate()}`;
    const s = String(raw).trim();
    if (!s) return null;
    const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
    if (m) return `${Number(m[2])}/${Number(m[3])}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return `${d.getMonth() + 1}/${d.getDate()}`;
    return null;
  } catch { return null; }
}
const periodLabel = (start: string, end: string): string => {
  const m1 = /^\d{4}-(\d{2})-(\d{2})$/.exec(start);
  const m2 = /^\d{4}-(\d{2})-(\d{2})$/.exec(end);
  if (!m1 || !m2) return `${start} ~ ${end}`;
  return `${Number(m1[1])}/${Number(m1[2])} ~ ${Number(m2[1])}/${Number(m2[2])}`;
};

// ─── 타입 ───────────────────────────────────────────────────────────────────
type PeriodRow = {
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

// Y축 nice scale: 최댓값을 반올림해서 tick 값이 깔끔한 숫자가 되도록
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

// ─── 라인 + 막대 혼합 차트 (듀얼 축: 라인=상단 판매/매입, 막대=하단 재고 흐린 색) ────
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
const MultiLineChart: React.FC<LineChartProps> = ({ labels, series, height = 320 }) => {
  const W = 720;
  const H = height;
  const padL = 58, padR = 58, padT = 18, padB = 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const n = labels.length;
  if (n === 0) return <div className="text-center text-slate-400 text-xs py-8">데이터 없음</div>;

  const lineSeries = series.filter(s => s.kind !== "bar");
  const barSeries  = series.filter(s => s.kind === "bar");

  // 듀얼 축 스케일:
  //   라인(판매/매입): 상단 60% 영역 (padT ~ padT + 0.60 chartH)
  //   막대(재고):     하단 40% 영역 (padT + 0.60 chartH ~ H - padB)
  const lineAreaH = chartH * 0.60;
  const barAreaH  = chartH * 0.40;
  const lineTop = padT;
  const barTop  = padT + lineAreaH;

  const lineRaw = Math.max(1, ...lineSeries.flatMap(s => s.values));
  const barRaw  = Math.max(1, ...barSeries.flatMap(s => s.values));
  const lineScale = niceScale(lineRaw);
  const barScale  = niceScale(barRaw);
  const lineMax = lineScale.niceMax;
  const barMax  = barScale.niceMax;

  const xAt = (i: number) => padL + (n === 1 ? chartW / 2 : (chartW * i) / (n - 1));
  const yLine = (v: number) => lineTop + lineAreaH - (v / lineMax) * lineAreaH;
  const yBar  = (v: number) => barTop + barAreaH - (v / barMax) * barAreaH;

  // Y축 격자 (라인 · 막대 영역 각각 nice tick)
  const lineTicks = lineScale.ticks;
  const barTicks  = [barScale.ticks[0], barScale.ticks[Math.floor(barScale.ticks.length / 2)], barScale.ticks[barScale.ticks.length - 1]];

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
        {/* 라인 영역 격자 · 좌측 Y라벨 (판매/매입) */}
        {lineTicks.map((v, i) => (
          <g key={`ly-${i}`}>
            <line x1={padL} y1={yLine(v)} x2={W - padR} y2={yLine(v)} stroke="#e2e8f0" strokeDasharray="2 3" />
            <text x={padL - 6} y={yLine(v) + 3} textAnchor="end" fontSize="12" fill="#64748b">
              {Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}만` : fmt(Math.round(v))}
            </text>
          </g>
        ))}
        {/* 라인/막대 영역 구분선 */}
        <line x1={padL} y1={barTop} x2={W - padR} y2={barTop} stroke="#cbd5e1" strokeWidth={1.2} />
        {/* 막대 영역 우측 Y라벨 (재고) */}
        {barTicks.map((v, i) => (
          <g key={`by-${i}`}>
            <line x1={padL} y1={yBar(v)} x2={W - padR} y2={yBar(v)} stroke="#f1f5f9" strokeDasharray="1 3" />
            <text x={W - padR + 4} y={yBar(v) + 3} textAnchor="start" fontSize="12" fill="#818cf8">
              {Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}만` : fmt(Math.round(v))}
            </text>
          </g>
        ))}
        {/* 영역 라벨 (좌측 상단·좌측 중단) */}
        <text x={padL} y={padT + 8} fontSize="11" fill="#dc2626" fontWeight="bold">판매·종료재고 (좌축)</text>
        <text x={padL} y={barTop + 8} fontSize="11" fill="#10b981" fontWeight="bold">매입 (우축)</text>

        {/* X축 라벨 */}
        {labels.map((lb, i) => {
          if (n > 8 && i % Math.ceil(n / 8) !== 0 && i !== n - 1) return null;
          return (
            <text key={`x-${i}`} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#475569">
              {lb}
            </text>
          );
        })}

        {/* 매입 막대 (하단) · 0 값은 그리지 않음 */}
        {barSeries.map((s, si) => (
          <g key={`bar-${si}`}>
            {s.values.map((v, i) => {
              if (v <= 0) return null;
              const x = xAt(i) - (barSeries.length * barW) / 2 + si * barW;
              const y = yBar(v);
              const h = Math.max(1, yBar(0) - y);
              return (
                <g key={`b-${si}-${i}`}>
                  <rect
                    x={x} y={y}
                    width={barW * 0.85} height={h}
                    fill={s.color}
                    opacity={0.55}
                    rx={1.5}
                  />
                  <text
                    x={x + barW * 0.425}
                    y={y - 3}
                    textAnchor="middle"
                    fontSize="10"
                    fill={s.color}
                    fontWeight="bold"
                  >{fmt(v)}</text>
                </g>
              );
            })}
          </g>
        ))}

        {/* 판매·종료재고 라인 + 값 라벨 · 0값은 gap 처리 (다음 non-zero 점과 연결) */}
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
                  <text
                    x={xAt(i)}
                    y={yLine(v) - 8}
                    textAnchor="middle"
                    fontSize="11"
                    fill={s.color}
                    fontWeight="bold"
                  >{fmt(v)}</text>
                </g>
              ) : null)}
            </g>
          );
        })}

        {/* Hover crosshair */}
        {hoverIdx != null && (
          <g>
            <line x1={xAt(hoverIdx)} y1={padT} x2={xAt(hoverIdx)} y2={H - padB} stroke="#94a3b8" strokeDasharray="3 3" />
            {lineSeries.map((s, si) => (
              <circle key={`hc-${si}`} cx={xAt(hoverIdx)} cy={yLine(s.values[hoverIdx])} r={5.5} fill="white" stroke={s.color} strokeWidth={2.5} />
            ))}
          </g>
        )}
      </svg>
      {/* 범례 + hover 상세 */}
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

// 오늘 기준 최근 N일 범위의 10일 기간 목록 생성 (초/중/하순 별)
//   - 없는 기간은 0 값의 placeholder row 로 채움
//   - 결과: 시간순 정렬된 완전한 기간 목록
function padDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function lastDayOfMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}
function generatePeriods(rangeDays: number): Array<{ start: string; end: string; period_type: "early" | "mid" | "late" }> {
  const now = new Date();
  const todayStr = padDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - rangeDays);
  const cutoffStr = padDate(cutoff.getFullYear(), cutoff.getMonth() + 1, cutoff.getDate());
  const periods: Array<{ start: string; end: string; period_type: "early" | "mid" | "late" }> = [];
  // cutoff 이 속한 달부터 오늘 이 속한 달까지 각 초/중/하순 나열
  let year = cutoff.getFullYear();
  let month = cutoff.getMonth() + 1; // 1-based
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    // 초순
    periods.push({ start: padDate(year, month, 1),  end: padDate(year, month, 10), period_type: "early" });
    // 중순
    periods.push({ start: padDate(year, month, 11), end: padDate(year, month, 20), period_type: "mid" });
    // 하순
    periods.push({ start: padDate(year, month, 21), end: padDate(year, month, lastDayOfMonth(year, month)), period_type: "late" });
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  // cutoff 이전 · today 이후 기간 filter
  return periods.filter(p => p.end >= cutoffStr && p.start <= todayStr);
}

// 실제 rows 를 기간 목록에 매핑 · 없는 기간은 0 값 placeholder
function fillPeriodsWithRows<T extends { period_start_date: string; snapshot_date: string }>(
  rows: T[],
  rangeDays: number,
  makeEmpty: (start: string, end: string, periodType: "early" | "mid" | "late") => T,
): T[] {
  const periods = generatePeriods(rangeDays);
  const byStart = new Map<string, T>();
  for (const r of rows) byStart.set(String(r.period_start_date), r);
  return periods.map(p => byStart.get(p.start) ?? makeEmpty(p.start, p.end, p.period_type));
}

// 10일 기간 rows → 월별 aggregation (같은 YYYY-MM 끼리 합산)
// 유량(purchase/sale/disposal): SUM · 재고: 마지막 스냅샷 값 · 금액: SUM
function aggregateToMonths<T extends {
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
    // 유량: SUM
    agg.purchase_qty += Number(r.purchase_qty ?? 0) || 0;
    agg.sale_qty     += Number(r.sale_qty ?? 0) || 0;
    agg.disposal_qty += Number(r.disposal_qty ?? 0) || 0;
    agg.supply_amount += Number(r.supply_amount ?? 0) || 0;
    agg.total_amount  += Number(r.total_amount ?? 0) || 0;
    // 재고 시작=가장 이른 스냅샷의 opening
    if (r.snapshot_date < (agg._first_snap ?? r.snapshot_date)) {
      agg._first_snap = r.snapshot_date;
      agg.opening_stock = Number(r.opening_stock ?? 0) || 0;
    }
    // 재고 종료=가장 늦은 스냅샷의 closing
    if (r.snapshot_date > (agg._last_snap ?? "")) {
      agg._last_snap = r.snapshot_date;
      agg.snapshot_date = r.snapshot_date;
      agg.closing_stock = Number(r.closing_stock ?? 0) || 0;
    }
    // product_count 는 최댓값 (같은 월에 같은 상품이 중복 카운트되지 않도록)
    agg.product_count = Math.max(agg.product_count, Number(r.product_count ?? 0) || 0);
  }
  // 내부 헬퍼 필드 제거
  return Array.from(byMonth.values())
    .map(v => { const { _first_snap, _last_snap, ...rest } = v as any; void _first_snap; void _last_snap; return rest as T; })
    .sort((a, b) => a.period_start_date.localeCompare(b.period_start_date));
}

// ─── 상품별 판매추이 탭 (좌측 재고흐름 리스트 · 우측 차트 · 폭조절) ─────────
// chartRangeDays 는 헤더 우측 pill 로 조절 (리스트의 조회기간과 독립)
const ProductTrendTab: React.FC<{ granularity: "10day" | "month"; chartRangeDays: number }> = ({ granularity, chartRangeDays }) => {
  const [selected, setSelected] = useState<any | null>(null);
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const rangeDays = chartRangeDays;
  // 정보확인 모달 (재고관리와 동일 · ProductInfoCard 표시)
  const [scanProductModal, setScanProductModal] = useState<ProductInfo | null>(null);
  const openScanProductModal = useCallback((p: any) => {
    const info: ProductInfo = {
      code: String(p.product_code ?? ""),
      name: String(p.product_name ?? ""),
      spec: String(p.spec ?? ""),
      current_stock: p.current_stock ?? null,
      optimal_stock: p.optimal_stock ?? null,
      supplier: p.supplier ?? p.supplier_name ?? null,
      real_map: p.real_map ?? null,
      warehouse_stock: p.warehouse_stock ?? null,
      store_stock: p.store_stock ?? null,
    };
    setScanProductModal(info);
  }, []);

  // 폭 조절 · localStorage 저장
  const [flowPanelWidth, setFlowPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_salestrend_flow_w")); return Number.isFinite(v) && v > 0 ? v : 640; } catch { return 640; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_salestrend_flow_w", String(flowPanelWidth)); } catch { /* ignore */ } }, [flowPanelWidth]);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startW: flowPanelWidth };
    const move = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const next = Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)));
      setFlowPanelWidth(next);
    };
    const up = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // 선택 상품의 시계열 조회 · 기간 변경 시 서버에서 해당 범위만 재조회
  const months = Math.max(1, Math.round(chartRangeDays / 30));
  useEffect(() => {
    if (!selected) { setRows([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/sales-trend/product?code=${encodeURIComponent(String(selected.product_code))}&months=${months}`);
        if (cancelled) return;
        if (r.ok) {
          const j = await r.json();
          if (!cancelled) setRows(Array.isArray(j.rows) ? j.rows : []);
        }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [selected, months]);

  // 기간 필터 적용 · 없는 기간은 0으로 채워 완전한 기간 목록 표시
  const filteredRows = useMemo(() => {
    const filled = fillPeriodsWithRows(
      rows,
      rangeDays,
      (start, end, period_type): PeriodRow => ({
        period_start_date: start,
        snapshot_date: end,
        period_type,
        opening_stock: 0, purchase_qty: 0, sale_qty: 0, disposal_qty: 0, closing_stock: 0,
        supply_amount: 0, total_amount: 0,
      })
    );
    return granularity === "month" ? aggregateToMonths(filled) : filled;
  }, [rows, rangeDays, granularity]);

  const chartData = useMemo(() => ({
    labels: filteredRows.map(r => granularity === "month"
      ? (() => { const m = /^(\d{4})-(\d{2})/.exec(r.period_start_date); return m ? `${Number(m[2])}월` : r.period_start_date; })()
      : periodLabel(r.period_start_date, r.snapshot_date)
    ),
    series: [
      { label: "매입",     color: "#10b981", kind: "bar" as const,  values: filteredRows.map(r => Number(r.purchase_qty ?? 0)), format: "count" as const },
      { label: "판매",     color: "#dc2626", kind: "line" as const, values: filteredRows.map(r => Number(r.sale_qty ?? 0)),     format: "count" as const },
      { label: "종료재고", color: "#6366f1", kind: "line" as const, values: filteredRows.map(r => Number(r.closing_stock ?? 0)), format: "count" as const },
    ],
  }), [filteredRows, granularity]);

  return (
    <div className="flex flex-col lg:flex-row gap-0 min-h-[520px]">
      {/* ── 좌측: 재고흐름 리스트 (검색+정렬+Top N 내장) ── */}
      <div className="min-h-0 max-h-[720px] w-full lg:w-auto lg:shrink-0" style={{ width: window.innerWidth >= 1024 ? flowPanelWidth : undefined }}>
        <StockFlowPanel
          onProductClick={(row) => setSelected(row)}
          selectedCode={selected ? String(selected.product_code) : null}
        />
      </div>

      {/* ── 리사이즈 핸들 (데스크탑만) ── */}
      <div
        onMouseDown={onResizeStart}
        className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-teal-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
        title="드래그하여 폭 조절"
      >
        <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
      </div>

      {/* ── 우측: 차트 + 표 ── */}
      <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0">
        {!selected ? (
          <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400">
            <Package size={40} className="mb-3 opacity-30" />
            <div className="text-sm font-bold">좌측 리스트에서 상품을 클릭하세요</div>
            <div className="text-[11px] mt-1">또는 검색 후 확인 버튼</div>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm flex-1 flex items-center justify-center">
            불러오는 중...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm flex-1 flex items-center justify-center flex-col">
            <div>기간 생성 실패</div>
            <div className="text-[10px] mt-2">#{selected.product_code}</div>
          </div>
        ) : (
          <>
            {/* 상품 요약 */}
            <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-xl p-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-base font-black text-slate-800 truncate">
                      {rows[0]?.product_name ?? selected.product_name}
                    </div>
                    <button
                      type="button"
                      onClick={() => openScanProductModal({ ...selected, ...(rows[0] ?? {}) })}
                      className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 rounded-lg px-2 py-1 cursor-pointer transition shadow-sm shrink-0"
                      title="상세 정보 · 실재고 입력 · 발주 요청"
                    >
                      <Info size={11} /> 정보확인
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">
                    #{selected.product_code} · {rows[0]?.supplier_name ?? selected.supplier ?? "-"}
                    {rows[0]?.spec ? ` · ${rows[0].spec}` : ""}
                  </div>
                </div>
                <div className="text-[11px] text-slate-500">
                  최근 <span className="font-black text-teal-600">{rangeDays}일</span>
                  {" · "}기간 <span className="font-black text-slate-800">{filteredRows.length}</span>개
                  {" · "}데이터 있음 <span className="font-black text-emerald-600">{filteredRows.filter(r => (r.purchase_qty ?? 0) > 0 || (r.sale_qty ?? 0) > 0 || (r.closing_stock ?? 0) > 0).length}</span>개
                </div>
              </div>
            </div>

            {/* 차트 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-1.5 mb-2">
                <LineChart size={14} className="text-teal-600" />
                <span className="text-sm font-black text-slate-700">기간별 판매 · 매입 · 종료재고</span>
              </div>
              <MultiLineChart {...chartData} />
            </div>

            {/* 표 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto px-3 sm:px-4">
                <table className="w-full text-xs min-w-[600px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="text-left p-2 font-black">기간</th>
                      <th className="text-right p-2 font-black text-slate-500">시작</th>
                      <th className="text-right p-2 font-black text-emerald-500">매입</th>
                      <th className="text-right p-2 font-black text-orange-500">판매</th>
                      <th className="text-right p-2 font-black text-rose-500">폐기</th>
                      <th className="text-right p-2 font-black text-slate-500">종료</th>
                      <th className="text-right p-2 font-black text-indigo-500">판매금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((r, i) => (
                      <tr key={`r-${i}`} className="hover:bg-teal-50/40">
                        <td className="p-2">
                          <div className="font-bold text-slate-800 font-mono">{periodLabel(r.period_start_date, r.snapshot_date)}</div>
                          <div className="text-[9px] text-slate-400">{r.period_type === "early" ? "초순" : r.period_type === "mid" ? "중순" : r.period_type === "late" ? "하순" : "-"}</div>
                        </td>
                        <td className="p-2 text-right font-mono text-slate-500">{fmt(r.opening_stock ?? 0)}</td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-700">{fmt(r.purchase_qty ?? 0)}</td>
                        <td className="p-2 text-right font-mono font-black text-orange-700">{fmt(r.sale_qty ?? 0)}</td>
                        <td className="p-2 text-right font-mono text-rose-600">{fmt(r.disposal_qty ?? 0)}</td>
                        <td className="p-2 text-right font-mono font-bold text-slate-700">{fmt(r.closing_stock ?? 0)}</td>
                        <td className="p-2 text-right font-mono font-bold text-indigo-700">{fmtWon(r.total_amount ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-black text-xs">
                    <tr>
                      <td className="p-2 text-right text-slate-500 uppercase">합계</td>
                      <td className="p-2"></td>
                      <td className="p-2 text-right font-mono text-emerald-700">
                        {fmt(filteredRows.reduce((n, r) => n + Number(r.purchase_qty ?? 0), 0))}
                      </td>
                      <td className="p-2 text-right font-mono text-orange-700">
                        {fmt(filteredRows.reduce((n, r) => n + Number(r.sale_qty ?? 0), 0))}
                      </td>
                      <td className="p-2 text-right font-mono text-rose-600">
                        {fmt(filteredRows.reduce((n, r) => n + Number(r.disposal_qty ?? 0), 0))}
                      </td>
                      <td className="p-2"></td>
                      <td className="p-2 text-right font-mono text-indigo-700">
                        {fmtWon(filteredRows.reduce((n, r) => n + Number(r.total_amount ?? 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 정보확인 모달 (재고관리 · 적정재고이하 상품 클릭과 동일) */}
      {scanProductModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setScanProductModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-sky-50 to-indigo-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shrink-0 shadow-md">
                  <Package size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-black text-slate-800 truncate">{scanProductModal.name}</div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">#{scanProductModal.code}</div>
                </div>
              </div>
              <button
                onClick={() => setScanProductModal(null)}
                className="text-slate-400 hover:text-slate-700 text-3xl leading-none font-black w-9 h-9 rounded-lg hover:bg-white/70 transition cursor-pointer flex items-center justify-center shrink-0"
              >×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
              <ProductInfoCard
                product={scanProductModal}
                context="stock-manage"
                editable
                onRealMapUpdate={(newValue) => {
                  setScanProductModal(prev => prev ? { ...prev, real_map: newValue } : prev);
                }}
                onProductUpdate={(updates) => {
                  setScanProductModal(prev => prev ? { ...prev, ...updates } : prev);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── 공급사별 판매추이 탭 (좌측 검색+리스트 · 우측 차트) ───────────────────
const SupplierTrendTab: React.FC<{ granularity: "10day" | "month"; chartRangeDays: number }> = ({ granularity, chartRangeDays }) => {
  const rangeDays = chartRangeDays;
  const [suppliers, setSuppliers] = useState<Array<{ name: string; sale?: number; purchase?: number; itemCount?: number }>>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(false);

  // 공급사 리스트 · 재고자산/매입 top-100
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/stock-manage/supplier-purchases?limit=200");
        if (r.ok) {
          const j = await r.json();
          const src = Array.isArray(j?.rows) ? j.rows : [];
          const list = src.map((x: any) => ({
            name: String(x.supplier ?? "").trim(),
            sale: Number(x.saleQty ?? x.sale_qty ?? 0) || 0,
            purchase: Number(x.purchaseQty ?? x.purchase_qty ?? 0) || 0,
            itemCount: Number(x.itemCount ?? 0) || 0,
          })).filter((x: any) => x.name);
          setSuppliers(list);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const months = Math.max(1, Math.round(chartRangeDays / 30));
  useEffect(() => {
    if (!selected) { setRows([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/sales-trend/supplier?name=${encodeURIComponent(selected)}&months=${months}`);
        if (cancelled) return;
        if (r.ok) {
          const j = await r.json();
          if (!cancelled) setRows(Array.isArray(j.rows) ? j.rows : []);
        }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [selected, months]);

  const filteredRows = useMemo(() => {
    const filled = fillPeriodsWithRows(
      rows,
      rangeDays,
      (start, end, period_type): PeriodRow => ({
        period_start_date: start,
        snapshot_date: end,
        period_type,
        opening_stock: 0, purchase_qty: 0, sale_qty: 0, disposal_qty: 0, closing_stock: 0,
        supply_amount: 0, total_amount: 0,
        product_count: 0,
      })
    );
    return granularity === "month" ? aggregateToMonths(filled) : filled;
  }, [rows, rangeDays, granularity]);
  const filteredList = useMemo(() => {
    const q = query.trim();
    if (!q) return suppliers;
    return suppliers.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
  }, [suppliers, query]);

  const chartData = useMemo(() => ({
    labels: filteredRows.map(r => granularity === "month"
      ? (() => { const m = /^(\d{4})-(\d{2})/.exec(r.period_start_date); return m ? `${Number(m[2])}월` : r.period_start_date; })()
      : periodLabel(r.period_start_date, r.snapshot_date)
    ),
    series: [
      { label: "매입",      color: "#10b981", kind: "bar" as const,  values: filteredRows.map(r => Number(r.purchase_qty ?? 0)),    format: "count" as const },
      { label: "판매",      color: "#dc2626", kind: "line" as const, values: filteredRows.map(r => Number(r.sale_qty ?? 0)),        format: "count" as const },
      { label: "종료재고",  color: "#6366f1", kind: "line" as const, values: filteredRows.map(r => Number(r.closing_stock ?? 0)),   format: "count" as const },
    ],
  }), [filteredRows, granularity]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 min-h-[520px]">
      {/* ── 좌측: 공급사 검색 + 리스트 ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0 max-h-[720px] overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="공급사명"
              className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400"
            />
            {query && (
              <button onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            {query.trim() ? `검색 (${filteredList.length})` : `공급사 (${suppliers.length})`}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredList.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-8">데이터 없음</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filteredList.map((s, i) => {
                const isSelected = selected === s.name;
                return (
                  <li key={`${s.name}-${i}`}>
                    <button
                      onClick={() => setSelected(s.name)}
                      className={`w-full text-left px-2.5 py-1.5 hover:bg-teal-50 transition flex items-center gap-2 ${isSelected ? "bg-teal-50 border-l-4 border-teal-500" : ""}`}
                    >
                      <span className={`text-[10px] font-black w-5 text-right shrink-0 ${i < 3 ? "text-teal-600" : "text-slate-400"}`}>{i + 1}</span>
                      <span className="flex-1 text-xs font-bold text-slate-800 truncate">{s.name}</span>
                      {(s.sale ?? 0) > 0 && (
                        <span className="text-[10px] font-mono font-black text-orange-600 shrink-0">{fmt(s.sale)}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── 우측: 차트 + 표 ── */}
      <div className="flex flex-col gap-3 min-h-0">
        {!selected ? (
          <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400">
            <Building2 size={40} className="mb-3 opacity-30" />
            <div className="text-sm font-bold">좌측 리스트에서 공급사를 클릭하세요</div>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm flex-1 flex items-center justify-center">
            불러오는 중...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm flex-1 flex items-center justify-center flex-col">
            <div>{rows.length === 0 ? "이 공급사의 이력이 없습니다" : `선택한 기간(${rangeDays}일) 이내 이력 없음`}</div>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-xl p-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-base font-black text-slate-800 truncate">{selected}</div>
                  <div className="text-[11px] text-slate-500">최근 <span className="font-black text-teal-600">{rangeDays}일</span> · 기간 <span className="font-black text-slate-800">{filteredRows.length}</span>개</div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-1.5 mb-2">
                <LineChart size={14} className="text-teal-600" />
                <span className="text-sm font-black text-slate-700">기간별 판매 · 매입 · 종료재고</span>
              </div>
              <MultiLineChart {...chartData} />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto px-3 sm:px-4">
                <table className="w-full text-xs min-w-[600px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="text-left p-2 font-black">기간</th>
                      <th className="text-right p-2 font-black text-slate-500">상품 수</th>
                      <th className="text-right p-2 font-black text-emerald-500">매입</th>
                      <th className="text-right p-2 font-black text-orange-500">판매</th>
                      <th className="text-right p-2 font-black text-slate-500">종료재고</th>
                      <th className="text-right p-2 font-black text-indigo-500">판매금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((r, i) => (
                      <tr key={`s-${i}`} className="hover:bg-teal-50/40">
                        <td className="p-2 font-mono font-bold text-slate-800">{periodLabel(r.period_start_date, r.snapshot_date)}</td>
                        <td className="p-2 text-right font-mono text-slate-600">{fmt(r.product_count ?? 0)}</td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-700">{fmt(r.purchase_qty ?? 0)}</td>
                        <td className="p-2 text-right font-mono font-black text-orange-700">{fmt(r.sale_qty ?? 0)}</td>
                        <td className="p-2 text-right font-mono text-slate-700">{fmt(r.closing_stock ?? 0)}</td>
                        <td className="p-2 text-right font-mono font-bold text-indigo-700">{fmtWon(r.total_amount ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── 재고흐름 패널 (재고관리 → 재고흐름과 동일 컬럼) ─────────────────────
// stockManage/top-sales endpoint 사용 · 정렬 · limit · 상품 클릭으로 판매추이 대상 선택
interface StockFlowRow {
  product_code: string;
  product_name: string;
  supplier: string | null;
  spec: string | null;
  opening_stock: number;
  purchase_qty: number;
  sale_qty: number;
  disposal_qty: number;
  closing_stock: number;
  total_amount: number;
  optimal_stock: number;
  current_stock?: number | null;
  sale_price?: number;
  last_purchase_date?: string | null;
}
type FlowSortKey = "name" | "opening" | "sale" | "purchase" | "amount" | "closing" | "current" | "loss";
type FlowSortDir = "asc" | "desc";

const StockFlowPanel: React.FC<{
  onProductClick: (row: StockFlowRow) => void;
  selectedCode?: string | null;
  months?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onMonthsChange?: (m: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void;
}> = ({ onProductClick, selectedCode, months: monthsProp, onMonthsChange }) => {
  const [rows, setRows] = useState<StockFlowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<FlowSortKey>("sale");
  const [dir, setDir]   = useState<FlowSortDir>("desc");
  const [limit, setLimit] = useState<number>(50000); // 전체가 기본
  const [snapshot, setSnapshot] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [monthsLocal, setMonthsLocal] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(0);
  const months = monthsProp ?? monthsLocal;
  const setMonths = onMonthsChange ?? setMonthsLocal;
  // 판매출고계 최소·최대 필터
  const [saleMin, setSaleMin] = useState<string>("");
  const [saleMax, setSaleMax] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const serverSort = (["sale","purchase","amount","closing"] as FlowSortKey[]).includes(sort) ? sort : "sale";
        const p = new URLSearchParams({ sort: serverSort, dir, limit: String(limit) });
        if (months > 0) p.set("months", String(months));
        else if (snapshot) p.set("snapshot_date", snapshot);
        const r = await fetch(`/api/stock-manage/top-sales?${p}`);
        if (r.ok) {
          const j = await r.json();
          setRows(Array.isArray(j.rows) ? j.rows : []);
          if (months === 0 && !snapshot && j.snapshot_date) setSnapshot(j.snapshot_date);
        }
      } finally { setLoading(false); }
    })();
  }, [sort, dir, limit, snapshot, months]);

  const toggleSort = (k: FlowSortKey) => {
    if (sort === k) setDir(dir === "desc" ? "asc" : "desc");
    else { setSort(k); setDir("desc"); }
  };
  const arrow = (k: FlowSortKey) => sort !== k ? " ⇅" : dir === "desc" ? " ▼" : " ▲";

  const displayRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = saleMin.trim() === "" ? null : Number(saleMin);
    const max = saleMax.trim() === "" ? null : Number(saleMax);
    let filtered = rows.filter(p => {
      if (q) {
        const hit = String(p.product_name ?? "").toLowerCase().includes(q)
          || String(p.product_code ?? "").includes(q)
          || String(p.supplier ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      const qty = Number(p.sale_qty ?? 0);
      if (min != null && Number.isFinite(min) && qty < min) return false;
      if (max != null && Number.isFinite(max) && qty > max) return false;
      return true;
    });
    const sign = dir === "asc" ? 1 : -1;
    if (sort === "loss") {
      const lossOf = (p: StockFlowRow) => Number(p.closing_stock) - Number(p.current_stock ?? 0);
      filtered = [...filtered].sort((a, b) => sign * (lossOf(a) - lossOf(b)));
    } else if (sort === "name") {
      filtered = [...filtered].sort((a, b) => sign * String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko"));
    } else if (sort === "opening") {
      filtered = [...filtered].sort((a, b) => sign * (Number(a.opening_stock ?? 0) - Number(b.opening_stock ?? 0)));
    } else if (sort === "current") {
      filtered = [...filtered].sort((a, b) => sign * (Number(a.current_stock ?? 0) - Number(b.current_stock ?? 0)));
    }
    return filtered;
  }, [rows, sort, dir, query, saleMin, saleMax]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50/50 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 shrink-0">
          <TrendingUp size={14} className="text-emerald-600" />
          <span className="text-sm font-black text-slate-700">재고 흐름</span>
          {snapshot && <span className="text-[10px] font-mono text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">{snapshot}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {[
            { v: 50000, label: "전체" },
            { v: 2000,  label: "Top 2000" },
            { v: 1000,  label: "Top 1000" },
            { v: 300,   label: "Top 300" },
            { v: 100,   label: "Top 100" },
          ].map(o => (
            <button key={o.v} onClick={() => setLimit(o.v)}
              className={`text-[10px] font-black px-1.5 py-0.5 rounded transition ${
                limit === o.v ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >{o.label}</button>
          ))}
        </div>
      </div>
      {/* 조회기간 선택: 10일(단일 스냅샷) or 1~6개월 aggregation · 변경 시 자동 재조회 */}
      <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1 flex-wrap text-[10px]">
        <span className="text-slate-500 font-black shrink-0 mr-1">조회기간</span>
        <button onClick={() => setMonths(0)}
          className={`px-1.5 py-0.5 rounded font-black transition ${
            months === 0 ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-100"
          }`}>10일</button>
        {[1, 2, 3, 4, 5, 6].map(m => (
          <button key={m} onClick={() => setMonths(m as any)}
            className={`px-1.5 py-0.5 rounded font-black transition ${
              months === m ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-100"
            }`}>{m}개월</button>
        ))}
        {months > 0 && (() => {
          const today = new Date();
          const start = new Date(today.getFullYear(), today.getMonth() - months, 1);
          const s = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
          const e = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          return (
            <span className="text-[10px] font-mono font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 ml-1">
              {s} ~ {e}
            </span>
          );
        })()}
      </div>
      <div className="px-3 py-2 border-b border-slate-100 flex flex-col gap-1.5">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={limit >= 50000 ? "전체 상품 검색" : "Top 리스트 내 검색"}
            className="w-full pl-7 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 bg-white"
          />
          {query && (
            <button onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-slate-500 font-black shrink-0">판매</span>
          <input type="number" min={0} value={saleMin}
            onChange={(e) => setSaleMin(e.target.value)} placeholder="최소"
            className="flex-1 min-w-0 px-1.5 py-1 border border-slate-200 rounded text-[11px] font-mono text-right focus:outline-none focus:border-orange-400" />
          <span className="text-slate-400 shrink-0">~</span>
          <input type="number" min={0} value={saleMax}
            onChange={(e) => setSaleMax(e.target.value)} placeholder="최대"
            className="flex-1 min-w-0 px-1.5 py-1 border border-slate-200 rounded text-[11px] font-mono text-right focus:outline-none focus:border-orange-400" />
          {(saleMin || saleMax) && (
            <button onClick={() => { setSaleMin(""); setSaleMax(""); }}
              className="text-[10px] font-black text-rose-500 hover:text-rose-700 px-1.5 py-1 rounded hover:bg-rose-50 transition cursor-pointer shrink-0">✕</button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[1px] pointer-events-none">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
            <div className="mt-3 text-xs font-black text-slate-600">데이터 로딩중...</div>
          </div>
        )}
        {displayRows.length === 0 && !loading ? (
          <div className="text-center text-xs text-slate-400 py-8">데이터 없음</div>
        ) : displayRows.length === 0 && loading ? (
          <div className="text-center text-xs text-slate-400 py-8">&nbsp;</div>
        ) : (
          <table className={`w-full text-xs ${loading ? "opacity-40 transition-opacity" : ""}`}>
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">
                <th className="text-left px-1 py-1.5 w-7">#</th>
                <th onClick={() => toggleSort("name")}
                  className={`text-left px-1 py-1.5 min-w-[100px] cursor-pointer select-none hover:bg-slate-50 ${sort === "name" ? "text-slate-800 font-black" : "text-slate-500"}`}
                >상품명{arrow("name")}</th>
                <th onClick={() => toggleSort("opening")}
                  className={`text-right px-0.5 py-1.5 w-12 cursor-pointer select-none hover:bg-slate-50 ${sort === "opening" ? "text-slate-800 font-black" : "text-slate-500"}`}
                >시작{arrow("opening")}</th>
                <th onClick={() => toggleSort("purchase")}
                  className={`text-right px-0.5 py-1.5 w-16 cursor-pointer select-none hover:bg-slate-50 ${sort === "purchase" ? "text-emerald-700 font-black" : "text-emerald-500"}`}
                  title="클릭: 매입 정렬 · 옆 (M/D)는 최근 매입일"
                >매입 <span className="text-[8px] font-normal text-slate-400">(M/D)</span>{arrow("purchase")}</th>
                <th onClick={() => toggleSort("sale")}
                  className={`text-right px-0.5 py-1.5 w-14 cursor-pointer select-none hover:bg-slate-50 ${sort === "sale" ? "text-orange-700 font-black" : "text-orange-500"}`}
                >판매{arrow("sale")}</th>
                <th onClick={() => toggleSort("closing")}
                  className={`text-right px-0.5 py-1.5 w-12 cursor-pointer select-none hover:bg-slate-50 ${sort === "closing" ? "text-slate-800 font-black" : "text-slate-500"}`}
                >종료{arrow("closing")}</th>
                <th onClick={() => toggleSort("current")}
                  className={`text-right px-0.5 py-1.5 w-12 cursor-pointer select-none hover:bg-slate-50 ${sort === "current" ? "text-amber-800 font-black" : "text-amber-600 font-black"}`}
                  title="ERP 현재고 (products.current_stock)"
                >현재고{arrow("current")}</th>
                <th onClick={() => toggleSort("loss")}
                  className={`text-right px-0.5 py-1.5 w-12 cursor-pointer select-none hover:bg-slate-50 ${sort === "loss" ? "text-rose-700 font-black" : "text-rose-500"}`}
                >손실{arrow("loss")}</th>
                <th onClick={() => toggleSort("amount")}
                  className={`text-right px-0.5 py-1.5 w-16 cursor-pointer select-none hover:bg-slate-50 ${sort === "amount" ? "text-indigo-700 font-black" : "text-indigo-500"}`}
                >판매가{arrow("amount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayRows.map((p, i) => {
                const cur = Number(p.current_stock ?? 0);
                const close = Number(p.closing_stock ?? 0);
                const loss = close - cur;
                const mismatch = close !== cur;
                return (
                  <tr
                    key={`sf-${p.product_code}-${i}`}
                    className={`transition cursor-pointer ${selectedCode === String(p.product_code) ? "bg-teal-50 border-l-4 border-teal-500" : "hover:bg-orange-50/30"}`}
                    onClick={() => onProductClick(p)}
                  >
                    <td className="px-0.5 py-1.5 text-[10px] font-black text-orange-600">{i + 1}</td>
                    <td className="px-1 py-1.5">
                      <div className="font-bold text-slate-700 truncate max-w-[160px]" title={p.product_name}>{p.product_name}</div>
                      {p.supplier && <div className="text-[9px] text-slate-400 truncate max-w-[160px]">{p.supplier}</div>}
                    </td>
                    <td className="text-right px-0.5 py-1.5 font-mono text-slate-500 text-[11px]">{fmt(p.opening_stock)}</td>
                    <td className="text-right px-0.5 py-1.5 font-mono text-emerald-600 text-[11px]" title={p.last_purchase_date ? `최근 매입: ${p.last_purchase_date}` : "매입 이력 없음"}>
                      {fmt(p.purchase_qty)}
                      {(() => {
                        const md = extractMonthDay(p.last_purchase_date);
                        return md ? <span className="text-[9px] text-slate-400 font-normal ml-0.5">({md})</span> : null;
                      })()}
                    </td>
                    <td className="text-right px-0.5 py-1.5 font-mono font-bold text-orange-700 text-[11px]">{fmt(p.sale_qty)}</td>
                    <td
                      className={`text-right px-0.5 py-1.5 font-mono text-[11px] ${close < 0 ? "text-rose-500 font-bold" : mismatch ? "text-red-600 font-black" : "text-slate-600"}`}
                      title={mismatch ? `종료 ${fmt(close)} ≠ 현재고 ${fmt(cur)} · 불일치` : "종료재고 (스냅샷)"}
                    >{fmt(close)}</td>
                    <td
                      className={`text-right px-0.5 py-1.5 font-mono font-black text-[11px] ${cur <= 0 ? "text-red-600" : mismatch ? "text-red-600" : "text-amber-700"}`}
                      title={mismatch ? `현재고 ${fmt(cur)} ≠ 종료 ${fmt(close)} · 불일치` : "ERP 현재고"}
                    >{fmt(cur)}</td>
                    <td
                      className={`text-right px-0.5 py-1.5 font-mono text-[11px] ${loss > 0 ? "text-rose-600 font-black" : loss < 0 ? "text-emerald-600 font-bold" : "text-slate-400"}`}
                      title={`손실 = 종료재고(${fmt(close)}) − 현재고(${fmt(cur)}) = ${loss > 0 ? "-" + fmt(loss) : loss < 0 ? "+" + fmt(Math.abs(loss)) : "0"}`}
                    >{loss === 0 ? "0" : loss > 0 ? `-${fmt(loss)}` : `+${fmt(Math.abs(loss))}`}</td>
                    <td className="text-right px-0.5 py-1.5 font-mono text-[10px] text-indigo-700 font-bold">{p.sale_price != null && p.sale_price > 0 ? fmtWon(p.sale_price) : "-"}</td>
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

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export const SalesTrendPage: React.FC = () => {
  const [tab, setTab] = useState<"product" | "supplier">("product");
  // X축 스케일: 초/중/말일 (10day) or 월별 (month)
  const [granularity, setGranularity] = useState<"10day" | "month">("10day");
  // 차트 조회기간 (리스트의 조회기간과는 독립적)
  const [chartMonths, setChartMonths] = useState<1 | 2 | 3 | 4 | 5 | 6>(3);
  const chartRangeDays = chartMonths * 30;

  return (
    <div className="flex-1 flex flex-col max-w-[1360px] mx-auto w-full px-2 sm:px-4 py-2 sm:py-4 gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2">
        {/* 좌: 제목 */}
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-teal-600" />
          <h2 className="text-lg font-black text-slate-800">판매추이</h2>
          <span className="text-[11px] font-semibold text-slate-400 hidden md:inline">10일 스냅샷</span>
        </div>
        {/* 중: 서브탭 */}
        <div className="flex justify-center">
          <div className="inline-flex bg-slate-100/70 border border-slate-200/60 rounded-2xl p-1 gap-0.5">
            {[
              { k: "product",  label: "상품별" },
              { k: "supplier", label: "공급사별" },
            ].map(t => (
              <button key={t.k} onClick={() => setTab(t.k as any)}
                className={`px-4 sm:px-5 py-1.5 text-xs font-black rounded-xl transition-all duration-200 cursor-pointer ${
                  tab === t.k
                    ? "bg-teal-100/60 text-teal-700 ring-1 ring-teal-200 shadow-sm"
                    : "text-teal-400/80 hover:bg-teal-50/60 hover:text-teal-600"
                }`}
              >{t.label}</button>
            ))}
          </div>
        </div>
        {/* 우: 차트 컨트롤 (전체기간 + X축 단위) — 그룹핑된 카드 */}
        <div className="flex justify-end overflow-x-auto scrollbar-none">
          <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur border border-teal-200/60 rounded-2xl px-2 py-1.5 shadow-sm shrink-0">
            {/* 전체 기간 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black text-teal-700 uppercase tracking-wider shrink-0 pl-1">전체기간</span>
              <div className="inline-flex bg-slate-100/80 border border-slate-200/60 rounded-lg p-0.5">
                {[1, 2, 3, 4, 5, 6].map(m => (
                  <button key={m} onClick={() => setChartMonths(m as any)}
                    className={`min-w-[26px] px-1.5 py-1 text-[11px] font-black rounded-md transition-all duration-150 cursor-pointer ${
                      chartMonths === m
                        ? "bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-800 hover:bg-white/70"
                    }`}
                  >{m}</button>
                ))}
                <span className="text-[10px] font-bold text-slate-400 self-center px-1">개월</span>
              </div>
            </div>
            <div className="w-px h-6 bg-slate-200" />
            {/* X축 단위 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black text-teal-700 uppercase tracking-wider shrink-0">X축</span>
              <div className="inline-flex bg-slate-100/80 border border-slate-200/60 rounded-lg p-0.5" title="한 데이터 포인트가 나타내는 기간">
                <button onClick={() => setGranularity("10day")}
                  className={`px-2.5 py-1 text-[11px] font-black rounded-md transition-all duration-150 cursor-pointer ${
                    granularity === "10day"
                      ? "bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800 hover:bg-white/70"
                  }`}
                >10일</button>
                <button onClick={() => setGranularity("month")}
                  className={`px-2.5 py-1 text-[11px] font-black rounded-md transition-all duration-150 cursor-pointer ${
                    granularity === "month"
                      ? "bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800 hover:bg-white/70"
                  }`}
                >월</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "product"  && <ProductTrendTab granularity={granularity} chartRangeDays={chartRangeDays} />}
        {tab === "supplier" && <SupplierTrendTab granularity={granularity} chartRangeDays={chartRangeDays} />}
      </div>
    </div>
  );
};

export default SalesTrendPage;
