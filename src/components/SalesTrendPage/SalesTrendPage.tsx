import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, TrendingUp, Building2, LineChart, Package, X, Info, Eye, EyeOff, CheckSquare, Square, Loader2, Award, Activity, Layers, PieChart, AlertOctagon } from "lucide-react";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import { getProductsMap, lookupProduct, type ProductInfo } from "../../lib/productsCache";
import { useHiddenManager } from "../../hooks/useHiddenManager";
import { useProductInfoSearch } from "../../hooks/useProductInfoSearch";
import { ProductManageView } from "../StockManagePage/StockManagePage";
import { ZONE_DEFS } from "../../constants/displayZones";
// 구역 코드 → 카테고리 설명 매핑 (매장 구역도의 ZONE_DEFS 그대로 사용)
//   real_map 형식 예: "1A", "1B", "2A", "9B", "22" 등
//   ZONE_DEFS 의 num + section 으로 매칭 · subA/subB 있으면 side 로 세분화
const ZONE_CATEGORY_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const z of ZONE_DEFS) {
    const nStr = String(z.num);
    if (z.subA && z.subB) {
      map[`${nStr}A`] = z.subA;
      map[`${nStr}B`] = z.subB;
    }
    map[nStr] = z.category;
  }
  return map;
})();
const zoneCategoryLabel = (zone: string): string => {
  if (!zone || zone === "미배치") return "미배치 상품";
  return ZONE_CATEGORY_MAP[zone.toUpperCase()] ?? ZONE_CATEGORY_MAP[zone.replace(/[AB]$/, "")] ?? "";
};

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
const MultiLineChartInner: React.FC<LineChartProps> = ({ labels, series, height = 320 }) => {
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

// React.memo · props 얕은 비교 · 그래프 모달 열림/닫힘 시 재렌더링 최소화
const MultiLineChart = React.memo(MultiLineChartInner);

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
const ProductTrendTab: React.FC<{
  granularity: "10day" | "month";
  chartRangeDays: number;
  onChartMonthsChange?: (m: 1 | 2 | 3 | 4 | 5 | 6) => void;
  onGranularityChange?: (g: "10day" | "month") => void;
  activeTab?: "product" | "supplier";
  onTabChange?: (t: "product" | "supplier") => void;
  /** 판매리스트 상품명 클릭과 동일한 상품 상세 정보 모달 오픈 */
  onOpenProductInfo?: (p: any) => void;
  /** 숨김 항목 관리 모달 오픈 */
  onOpenHiddenManager?: () => void;
}> = ({ granularity, chartRangeDays, onChartMonthsChange, onGranularityChange, activeTab, onTabChange, onOpenProductInfo, onOpenHiddenManager }) => {
  const [selected, setSelected] = useState<any | null>(null);
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const rangeDays = chartRangeDays;
  // 정보확인 모달 (재고관리와 완전 동일 · ProductInfoCard 표시 · 전체 product 캐시 병합)
  const [scanProductModal, setScanProductModal] = useState<ProductInfo | null>(null);
  const openScanProductModal = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    const partial: ProductInfo = {
      code,
      name: String(p.product_name ?? ""),
      spec: String(p.spec ?? ""),
      current_stock: p.current_stock ?? null,
      optimal_stock: p.optimal_stock ?? null,
      supplier: p.supplier ?? p.supplier_name ?? null,
      real_map: p.real_map ?? null,
      warehouse_stock: p.warehouse_stock ?? null,
      store_stock: p.store_stock ?? null,
    };
    setScanProductModal(partial);
    // 전체 상품 캐시에서 원본 조회 후 병합 (매입가·판매가·최근매입일·판매상태·유통기한·제조사·바코드 등)
    try {
      let full = lookupProduct(code);
      if (!full) {
        const map = await getProductsMap();
        full = map[code] ?? map[code.replace(/^0+/, "")] ?? null;
      }
      if (full) {
        setScanProductModal(prev => {
          if (!prev || prev.code !== code) return prev;
          const overlay: Record<string, any> = {};
          for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) overlay[k] = v;
          return { ...full, ...overlay, code, name: full.name || prev.name };
        });
      }
    } catch { /* 캐시 로드 실패 시 partial 만 유지 */ }
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

  // 선택 상품의 시계열: 상품 변경 시 1회만 max 범위(6개월) fetch → 기간 변경은 클라측 필터로 즉시 반영
  // 클라측 캐시 (상품 재선택 시 즉시 표시)
  const rowsCache = useRef<Map<string, PeriodRow[]>>(new Map());
  useEffect(() => {
    if (!selected) { setRows([]); return; }
    const code = String(selected.product_code);
    const cached = rowsCache.current.get(code);
    if (cached) {
      // 캐시 히트: 즉시 표시 (로딩 스피너 없음)
      setRows(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // 항상 최대 범위(6개월)만 요청 · 이후 기간 변경은 클라측 필터
        const r = await fetch(`/api/sales-trend/product?code=${encodeURIComponent(code)}&months=6`);
        if (cancelled) return;
        if (r.ok) {
          const j = await r.json();
          const list: PeriodRow[] = Array.isArray(j.rows) ? j.rows : [];
          rowsCache.current.set(code, list);
          if (!cancelled) setRows(list);
        }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [selected]);

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
      <div className="min-h-0 max-h-[75vh] lg:max-h-[720px] w-full lg:w-auto lg:shrink-0" style={{ width: window.innerWidth >= 1024 ? flowPanelWidth : undefined }}>
        <StockFlowPanel
          onProductClick={(row) => setSelected(row)}
          selectedCode={selected ? String(selected.product_code) : null}
          activeTab={activeTab}
          onTabChange={onTabChange}
          onOpenProductInfo={onOpenProductInfo}
          onOpenHiddenManager={onOpenHiddenManager}
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

      {/* ── 우측: 차트 + 표 · 모바일에서 상품 선택 시 fullscreen 모달로 표시 · GPU 가속 힌트 ── */}
      <div
        className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0 transition-transform duration-150 ${
          selected ? "fixed inset-0 z-50 bg-slate-50 overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible" : ""
        }`}
        style={{ willChange: selected ? "transform, opacity" : "auto", contain: selected ? "layout paint" : "none" }}
      >
        {/* 모바일 fullscreen 헤더 — 상품명 · 닫기 · 기간 · 정보확인 통합 · fixed 부모 내에서 sticky 잘 작동하도록 z-index 60 */}
        {selected && (
          <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-slate-200 shadow-md">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer shrink-0"
                title="닫기"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-black text-slate-800 truncate leading-tight">
                  {rows[0]?.product_name ?? selected.product_name}
                </div>
                <div className="text-[10px] font-mono text-slate-500 truncate">
                  #{selected.product_code} · {rows[0]?.supplier_name ?? selected.supplier ?? "-"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => openScanProductModal({ ...selected, ...(rows[0] ?? {}) })}
                className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 text-white flex items-center justify-center cursor-pointer shrink-0 shadow-sm"
                title="상세 정보"
              >
                <Info size={15} strokeWidth={2.4} />
              </button>
            </div>
            {/* 기간 셀렉터는 차트 카드 안으로 통합됨 · 여기서 제거 */}
          </div>
        )}
        {!selected ? (
          <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400">
            <Package size={40} className="mb-3 opacity-30" />
            <div className="text-sm font-bold">리스트에서 상품을 클릭하세요</div>
            <div className="text-[11px] mt-1">또는 검색 후 확인 버튼</div>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 flex flex-col items-center justify-center gap-3 mx-3 mt-3">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-teal-500 rounded-full animate-spin" />
            <div className="text-sm font-black text-slate-600">데이터 로딩중...</div>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm mx-3 mt-3">
            <div>기간 생성 실패</div>
            <div className="text-[10px] mt-2">#{selected.product_code}</div>
          </div>
        ) : (
          <div className="px-3 py-3 lg:p-0 flex flex-col gap-3">
            {/* 데스크탑용 상품 요약 (모바일에선 헤더에 통합) */}
            <div className="hidden lg:block bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-3">
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

            {/* 차트 · 상단에 기간/X축 컨트롤 (모달 안으로 이동됨) */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-1.5 shrink-0">
                  <LineChart size={14} className="text-teal-600" />
                  <span className="text-sm font-black text-slate-700">기간별 판매 · 매입 · 종료재고</span>
                </div>
                <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                  {/* 전체기간 */}
                  <div className="inline-flex items-center gap-1">
                    <span className="text-[9px] font-black text-teal-700 uppercase tracking-wider">기간</span>
                    <div className="inline-flex bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                      {[1, 2, 3, 4, 5, 6].map(m => {
                        const active = Math.round(chartRangeDays / 30) === m;
                        return (
                          <button
                            key={m}
                            onClick={() => onChartMonthsChange?.(m as any)}
                            className={`min-w-[24px] px-1.5 py-0.5 text-[10px] font-black rounded-md transition ${
                              active
                                ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white"
                            }`}
                          >{m}</button>
                        );
                      })}
                      <span className="text-[9px] font-bold text-slate-400 self-center px-1">개월</span>
                    </div>
                  </div>
                  {/* X축 단위 */}
                  <div className="inline-flex items-center gap-1">
                    <span className="text-[9px] font-black text-teal-700 uppercase tracking-wider">X축</span>
                    <div className="inline-flex bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                      <button
                        onClick={() => onGranularityChange?.("10day")}
                        className={`px-2 py-0.5 text-[10px] font-black rounded-md transition ${
                          granularity === "10day"
                            ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-sm"
                            : "text-slate-500 hover:text-slate-800 hover:bg-white"
                        }`}
                      >10일</button>
                      <button
                        onClick={() => onGranularityChange?.("month")}
                        className={`px-2 py-0.5 text-[10px] font-black rounded-md transition ${
                          granularity === "month"
                            ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-sm"
                            : "text-slate-500 hover:text-slate-800 hover:bg-white"
                        }`}
                      >월</button>
                    </div>
                  </div>
                </div>
              </div>
              <MultiLineChart {...chartData} />
            </div>

            {/* 표 · 그래프에 표시된 값(매입·판매·종료재고)만 · 재고리스트 스타일 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">
                      <th className="text-left px-2 py-1.5">기간</th>
                      <th className="text-right px-2 py-1.5 w-16 bg-emerald-50/60 text-emerald-500">매입</th>
                      <th className="text-right px-2 py-1.5 w-16 bg-orange-50/60 text-orange-500">판매</th>
                      <th className="text-right px-2 py-1.5 w-16 bg-indigo-50/60 text-indigo-500">종료재고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredRows.map((r, i) => (
                      <tr key={`r-${i}`} className="hover:bg-teal-50/30 transition">
                        <td className="px-2 py-1.5 align-top">
                          <div className="text-[13px] font-black text-slate-800 font-mono leading-tight">{periodLabel(r.period_start_date, r.snapshot_date)}</div>
                          <div className="text-[9px] text-slate-400">{r.period_type === "early" ? "초순" : r.period_type === "mid" ? "중순" : r.period_type === "late" ? "하순" : "-"}</div>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-[12px] font-bold text-emerald-700 bg-emerald-50/40 align-top">{fmt(r.purchase_qty ?? 0)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-[12px] font-black text-orange-700 bg-orange-50/40 align-top">{fmt(r.sale_qty ?? 0)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-[12px] font-bold text-indigo-700 bg-indigo-50/40 align-top">{fmt(r.closing_stock ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-[11px]">
                    <tr>
                      <td className="px-2 py-1.5 text-right font-black text-slate-500 uppercase">합계</td>
                      <td className="px-2 py-1.5 text-right font-mono font-black text-emerald-700 bg-emerald-50/40">
                        {fmt(filteredRows.reduce((n, r) => n + Number(r.purchase_qty ?? 0), 0))}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-black text-orange-700 bg-orange-50/40">
                        {fmt(filteredRows.reduce((n, r) => n + Number(r.sale_qty ?? 0), 0))}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-black text-indigo-700 bg-indigo-50/40">
                        {/* 종료재고는 합계 개념이 없어서 최종값 표시 */}
                        {fmt(Number(filteredRows[filteredRows.length - 1]?.closing_stock ?? 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
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

// ─── 공급사별 판매추이 탭 (재고관리 공급사재고와 동일 UI · 판매 관련 컬럼만) ─
//   2026-07-15: 좌우 레이아웃/차트/기간표 완전 제거 · 단일 리스트 + 인라인 확장 방식
//   헤더:  순위 · 공급사명 · 판매수량 합계 · 상품 종수
//   확장:  상품명(모달) · 판매수량 · 매입단가 · 현재고 (판매수량 내림차순)
type SupplierAggRow = {
  supplier: string;
  supplier_code: string | null;
  code_conflict?: boolean;
  saleQty: number;
  itemCount: number;
};
type SupRowsSortKey = "name" | "sale" | "purchase_price" | "current";
type SupRowsSortDir = "asc" | "desc";
const SupplierTrendTab: React.FC<{
  granularity: "10day" | "month";
  chartRangeDays: number;
  activeTab?: "product" | "supplier";
  onTabChange?: (t: "product" | "supplier") => void;
  onProductClick?: (p: any) => void;
}> = ({ onProductClick }) => {
  // 공급사 리스트 (판매수량 내림차순 · 재고관리와 동일 API)
  const [suppliers, setSuppliers] = useState<SupplierAggRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  // Top N 필터 · 판매수량 내림차순 상위 N개 · 0 = 전체
  const [topN, setTopN] = useState<number>(100);

  // 각 공급사별 상품 리스트 · 인라인 확장
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [supplierRowsMap, setSupplierRowsMap] = useState<Record<string, any[] | null>>({});
  const [supplierRowsLoading, setSupplierRowsLoading] = useState<Set<string>>(new Set());
  const supplierFetchedRef = useRef<Set<string>>(new Set());
  const supplierInflightRef = useRef<Set<string>>(new Set());

  // 확장 테이블 정렬 (헤더 클릭)
  const [supRowsSort, setSupRowsSort] = useState<{ key: SupRowsSortKey; dir: SupRowsSortDir }>({ key: "sale", dir: "desc" });
  const toggleSupRowsSort = (k: SupRowsSortKey) => {
    setSupRowsSort(prev => prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "name" ? "asc" : "desc" });
  };
  const sortSupRows = (rows: any[]): any[] => {
    const { key, dir } = supRowsSort;
    const mult = dir === "asc" ? 1 : -1;
    const getVal = (r: any): any => {
      if (key === "name") return String(r.product_name ?? "");
      if (key === "sale") return Number(r.sale_qty ?? 0);
      if (key === "current") return Number(r.current_stock ?? 0);
      // purchase_price · products.purchase_price 우선 · 없으면 매입 최근금액/수량
      const p = Number(r.purchase_price ?? 0);
      if (p > 0) return p;
      const amt = Number(r.purchase_last_amount ?? r.purchase_total_amount ?? 0);
      const qty = Number(r.purchase_total_qty ?? r.purchase_qty ?? 0);
      return qty > 0 ? Math.round(amt / qty) : 0;
    };
    return [...rows].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (typeof va === "string") return va.localeCompare(String(vb), "ko") * mult;
      return (va - vb) * mult;
    });
  };

  // 공급사 리스트 fetch · 재고관리와 동일 endpoint
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/stock-manage/supplier-purchases?limit=500`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const src = Array.isArray(data?.rows) ? data.rows : [];
        const cleanName = (raw: string): string => raw
          .replace(/\s*\(\s*[Vv][Aa][Tt]\s*미\s*포\s*함\s*\)\s*/g, "")
          .replace(/\s+/g, " ")
          .trim();
        const list: SupplierAggRow[] = src.map((x: any) => ({
          supplier: cleanName(String(x.supplier ?? "")),
          supplier_code: x.supplier_code ?? null,
          code_conflict: !!x.code_conflict,
          saleQty: Number(x.saleQty ?? x.sale_qty ?? 0) || 0,
          itemCount: Number(x.itemCount ?? 0) || 0,
        })).filter((x: SupplierAggRow) => x.supplier);
        // 판매수량 내림차순
        list.sort((a, b) => b.saleQty - a.saleQty);
        setSuppliers(list);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // 인라인 확장 · 클릭 시 상품 리스트 (판매출고계 내림차순) 로드
  const toggleSupplierExpand = useCallback(async (sup: SupplierAggRow) => {
    const key = `${sup.supplier_code ?? "-"}::${sup.supplier}`;
    let isCurrentlyExpanded = false;
    setExpandedSuppliers(prev => {
      isCurrentlyExpanded = prev.has(key);
      const next = new Set(prev);
      if (isCurrentlyExpanded) next.delete(key); else next.add(key);
      return next;
    });
    if (isCurrentlyExpanded) return;
    if (supplierFetchedRef.current.has(key) || supplierInflightRef.current.has(key)) return;
    supplierInflightRef.current.add(key);
    setSupplierRowsLoading(prev => { const n = new Set(prev); n.add(key); return n; });
    try {
      const params = new URLSearchParams({ sort: "sale", dir: "desc", limit: "5000" });
      if (sup.supplier_code) params.set("supplier_code", sup.supplier_code);
      else if (sup.supplier)  params.set("supplier", sup.supplier);
      const res = await fetch(`/api/stock-manage/top-sales?${params}`);
      const rows = res.ok ? (await res.json()).rows : [];
      setSupplierRowsMap(prev => ({ ...prev, [key]: Array.isArray(rows) ? rows : [] }));
      supplierFetchedRef.current.add(key);
    } catch {
      setSupplierRowsMap(prev => ({ ...prev, [key]: [] }));
    } finally {
      supplierInflightRef.current.delete(key);
      setSupplierRowsLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, []);

  // 검색 필터 적용 (판매수량 내림차순 유지)
  const filteredSuppliers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(s => s.supplier.toLowerCase().includes(q));
  }, [suppliers, query]);
  // Top N 적용 (0 = 전체)
  const visibleSuppliers = useMemo(
    () => (topN === 0 ? filteredSuppliers : filteredSuppliers.slice(0, topN)),
    [filteredSuppliers, topN],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        {/* 헤더 · 라벨 + Top N pill + 카운트 */}
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <Building2 size={14} className="text-sky-600" />
            <span className="text-sm font-black text-slate-700">공급사별 판매현황<span className="text-[10px] font-semibold text-slate-400 ml-1">(판매수량 내림차순)</span></span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Top N 필터 · sky */}
            <div className="inline-flex bg-slate-100 rounded-md p-0.5" title="판매수량 내림차순 상위 N개만 표시">
              {([100, 300, 1000, 2000, 0] as const).map(n => (
                <button key={n} type="button" onClick={() => setTopN(n)}
                  className={`px-1.5 py-0.5 text-[10px] font-black rounded transition ${topN === n ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}>
                  {n === 0 ? "전체" : `Top ${n}`}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-bold text-slate-500">
              {visibleSuppliers.length}개 사<span className="text-slate-400 font-semibold"> / 총 {filteredSuppliers.length}개</span>
            </span>
          </div>
        </div>
        {/* 검색 */}
        <div className="mb-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="공급사명 검색"
              className="w-full pl-7 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-400 bg-white" />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-sky-600 font-semibold mb-2 flex items-center gap-1">
          <span className="text-sky-400">▶</span> 공급사 클릭 → 판매수량 내림차순 상품 리스트 펼치기 · 상품명 클릭 → 상세 모달
        </p>
        {/* 공급사 리스트 (판매수량 내림차순) */}
        <div className="max-h-[50vh] overflow-y-auto pr-2">
          {loading && suppliers.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 size={14} className="animate-spin mr-2" />로딩...</div>
          ) : visibleSuppliers.length === 0 ? (
            <div className="text-center text-[11px] text-slate-300 py-6">데이터 없음</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {visibleSuppliers.map((sup, i) => {
                const key = `${sup.supplier_code ?? "-"}::${sup.supplier}`;
                const isExpanded = expandedSuppliers.has(key);
                const isLoading = supplierRowsLoading.has(key);
                const rows = supplierRowsMap[key];
                return (
                  <div key={key} className="py-2">
                    {/* 헤더 행 · 클릭시 상세 접기/펼치기 */}
                    <button
                      type="button"
                      onClick={() => toggleSupplierExpand(sup)}
                      className="w-full flex items-center justify-between gap-2 hover:bg-sky-50/50 -mx-1 px-1 py-0.5 rounded-lg transition cursor-pointer"
                      title={isExpanded ? "상세 접기" : "상세 펼치기 (판매수량 내림차순)"}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-slate-400 text-xs transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                        <span className="text-[10px] font-black text-sky-600 shrink-0">{i + 1}</span>
                        <Building2 size={11} className="text-sky-500 shrink-0" />
                        <span className="text-xs font-bold text-slate-700 break-words whitespace-normal leading-tight">{sup.supplier}</span>
                        {sup.supplier_code && (
                          <span className="text-[9px] font-mono text-slate-400 shrink-0" title="공급사코드">#{sup.supplier_code}</span>
                        )}
                        {sup.code_conflict && (
                          <span className="text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded px-1 shrink-0"
                            title="같은 이름에 여러 공급사코드가 존재 — 중복 의심">⚠</span>
                        )}
                      </div>
                      <span className="text-[11px] font-black text-orange-700 shrink-0" title="판매수량 합계">{fmt(sup.saleQty)}개</span>
                    </button>
                    <div className="flex items-center justify-end mt-0.5">
                      <span className="text-[10px] text-slate-400 shrink-0 text-right" title={`상품 ${sup.itemCount}종`}>
                        <span className="text-slate-500 font-semibold">상품 {sup.itemCount}종</span>
                      </span>
                    </div>
                    {/* 상세 리스트 · 판매수량 내림차순 · 확장 시 노출 */}
                    {isExpanded && (
                      <div className="mt-2 border-t border-sky-100 pt-2 bg-sky-50/30 -mx-2 px-3 py-2 rounded-lg">
                        {isLoading ? (
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 py-2">
                            <Loader2 size={11} className="animate-spin" /> 상품 로드 중...
                          </div>
                        ) : !rows || rows.length === 0 ? (
                          <div className="text-[11px] text-slate-400 py-2">상품 데이터 없음</div>
                        ) : (
                          <div className="max-h-[50vh] overflow-y-auto">
                            <table className="w-full text-[10px]">
                              <thead className="sticky top-0 bg-sky-50 z-10">
                                <tr className="text-slate-500 uppercase tracking-wider border-b border-sky-200">
                                  <th className="text-left px-1 py-1 w-6">#</th>
                                  {([
                                    { k: "name" as SupRowsSortKey,           label: "상품명",   align: "text-left"  },
                                    { k: "sale" as SupRowsSortKey,           label: "판매수량", align: "text-right", w: "w-14" },
                                    { k: "purchase_price" as SupRowsSortKey, label: "매입단가", align: "text-right", w: "w-16" },
                                    { k: "current" as SupRowsSortKey,        label: "현재고",   align: "text-right", w: "w-12" },
                                  ]).map(col => {
                                    const active = supRowsSort.key === col.k;
                                    return (
                                      <th key={col.k}
                                        onClick={(e) => { e.stopPropagation(); toggleSupRowsSort(col.k); }}
                                        className={`${col.align} px-1 py-1 ${col.w ?? ""} cursor-pointer select-none hover:text-sky-700 hover:bg-sky-100/50 transition ${active ? "text-sky-700 font-black" : ""}`}
                                        title={`${col.label} 정렬 (${active ? (supRowsSort.dir === "asc" ? "오름차순 · 클릭 → 내림차순" : "내림차순 · 클릭 → 오름차순") : "클릭하여 정렬"})`}
                                      >
                                        <span className="inline-flex items-center gap-0.5">
                                          {col.label}
                                          {active ? (
                                            <span className="text-[9px] text-sky-600">{supRowsSort.dir === "asc" ? "▲" : "▼"}</span>
                                          ) : (
                                            <span className="text-[8px] text-slate-300">⇅</span>
                                          )}
                                        </span>
                                      </th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-sky-100">
                                {sortSupRows(rows).slice(0, 200).map((r, ri) => {
                                  // 매입단가: products.purchase_price 우선 · 없으면 매입금액/수량 평균
                                  let unitPrice = Number(r.purchase_price ?? 0);
                                  if (!(unitPrice > 0)) {
                                    const amt = Number(r.purchase_last_amount ?? r.purchase_total_amount ?? 0);
                                    const qty = Number(r.purchase_total_qty ?? r.purchase_qty ?? 0);
                                    unitPrice = qty > 0 ? Math.round(amt / qty) : 0;
                                  }
                                  return (
                                    <tr key={`${key}-${r.product_code ?? ri}`} className="hover:bg-white transition align-top">
                                      <td className="px-1 py-1 text-slate-400">{ri + 1}</td>
                                      <td className="px-1 py-1 break-words whitespace-normal leading-tight">
                                        <button
                                          type="button"
                                          onClick={() => onProductClick?.(r)}
                                          className="text-left font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer transition break-words whitespace-normal leading-tight underline decoration-dotted decoration-indigo-400 underline-offset-2 hover:decoration-solid"
                                          title={`${r.product_name} — 클릭 시 상세 정보`}
                                        >{r.product_name}</button>
                                      </td>
                                      <td className="text-right px-1 py-1 font-mono font-black text-orange-700">{fmt(Number(r.sale_qty ?? 0))}</td>
                                      <td className="text-right px-1 py-1 font-mono text-slate-700" title={unitPrice > 0 ? `${unitPrice.toLocaleString()}원` : "매입단가 없음"}>{unitPrice > 0 ? unitPrice.toLocaleString() : "-"}</td>
                                      <td className="text-right px-1 py-1 font-mono text-amber-700">{fmt(Number(r.current_stock ?? 0))}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {rows.length > 200 && (
                              <div className="text-[10px] text-slate-400 text-center py-1">상위 200개만 표시 · 전체 {rows.length}개</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
  internal_qty?: number;
  adjustment_qty?: number;
  closing_stock: number;
  total_amount: number;
  optimal_stock: number;
  current_stock?: number | null;
  sale_price?: number;
  last_purchase_date?: string | null;
}

// 손실 = (시작재고 − 판매출고계) − 종료재고
// 양수 = 예상 종료재고보다 실제가 부족 (실 손실)
// 음수 = 예상보다 재고 많음 (매입/조정 있었을 수 있음)
// 주의: 매입/폐기/사내소비/조정은 이 단순 공식에서 무시됨 (툴팁에 함께 표시)
export const calcLoss = (r: { opening_stock?: number | null; sale_qty?: number | null; closing_stock?: number | null }) => {
  const opening = Number(r.opening_stock ?? 0);
  const sale    = Number(r.sale_qty      ?? 0);
  const close   = Number(r.closing_stock ?? 0);
  return (opening - sale) - close;
};
type FlowSortKey = "name" | "opening" | "sale" | "purchase" | "amount" | "closing" | "current" | "loss";
type FlowSortDir = "asc" | "desc";

const StockFlowPanel: React.FC<{
  onProductClick: (row: StockFlowRow) => void;
  selectedCode?: string | null;
  months?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onMonthsChange?: (m: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void;
  activeTab?: "product" | "supplier";
  onTabChange?: (t: "product" | "supplier") => void;
  onOpenProductInfo?: (p: any) => void;
  onOpenHiddenManager?: () => void;
}> = ({ onProductClick, selectedCode, months: monthsProp, onMonthsChange, activeTab, onTabChange, onOpenProductInfo, onOpenHiddenManager }) => {
  const [rows, setRows] = useState<StockFlowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<FlowSortKey>("sale");
  const [dir, setDir]   = useState<FlowSortDir>("desc");
  const [limit, setLimit] = useState<number>(100); // Top 100 기본 (초기 로딩 속도 개선)
  const [snapshot, setSnapshot] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [monthsLocal, setMonthsLocal] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(0);
  const months = monthsProp ?? monthsLocal;
  const setMonths = onMonthsChange ?? setMonthsLocal;
  // 기간 선택 · 확인 버튼 누르기 전 임시 값 (자동 fetch 방지)
  const [pendingMonths, setPendingMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(months);
  // 판매출고계 최소·최대 필터
  const [saleMin, setSaleMin] = useState<string>("");
  const [saleMax, setSaleMax] = useState<string>("");
  // 판매리스트 접기 · 펼치기 (2026-07-15 · 재고관리와 동일 패턴)
  const [saleListCollapsed, setSaleListCollapsed] = useState(false);
  // 벌크 숨김 · 선택된 상품 코드
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [bulkHiding, setBulkHiding] = useState(false);
  const toggleSelectCode = (code: string) => setSelectedCodes(prev => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });
  const bulkHide = async () => {
    if (selectedCodes.size === 0) return;
    // 로컬 리스트에서만 제외 · DB 수정 · 다른 페이지 연동 없음 (2026-07-15 · 사용자 정책)
    setRows(prev => prev.filter(r => !selectedCodes.has(String(r.product_code))));
    setSelectedCodes(new Set());
  };

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
      filtered = [...filtered].sort((a, b) => sign * (calcLoss(a) - calcLoss(b)));
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
      {/* ── 헤더 · 상품별/공급사별 탭 + 스냅샷 날짜 + 안내 ── */}
      <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-slate-200 bg-slate-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {/* 상품별/공급사별 세그먼트 탭 제거 (2026-07-15) · 상단 통합 5탭으로 대체 */}
            <TrendingUp size={14} className="text-orange-600" />
            {/* 스냅샷 날짜 · 재고관리와 동일 형식 */}
            {snapshot && (
              <span className="text-[10px] font-mono font-black text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
                {snapshot}
              </span>
            )}
            {/* 기간 라벨 · 초순/중순/하순 (재고관리 flowDateRange 동일 계산) */}
            {snapshot && (() => {
              const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(snapshot);
              if (!m) return null;
              const yyyy = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
              const today = new Date();
              const isToday = today.getFullYear() === yyyy && (today.getMonth() + 1) === mm && today.getDate() === dd;
              const endLabel = isToday ? "오늘" : `${mm}/${dd}`;
              let label = "", cls = "text-slate-600 bg-slate-100 border-slate-300";
              if (dd <= 10) { label = `${mm}월 초순 : ${mm}/1 ~ ${endLabel}`; cls = "text-sky-700 bg-sky-50 border-sky-300"; }
              else if (dd <= 20) { label = `${mm}월 중순 : ${mm}/11 ~ ${endLabel}`; cls = "text-indigo-700 bg-indigo-50 border-indigo-300"; }
              else {
                const lastDay = new Date(yyyy, mm, 0).getDate();
                const lastLabel = isToday && dd === lastDay ? "오늘" : `${mm}/${lastDay}`;
                label = `${mm}월 하순 : ${mm}/21 ~ ${lastLabel}`;
                cls = "text-purple-700 bg-purple-50 border-purple-300";
              }
              return (
                <span className={`text-[10px] font-black rounded-full px-2 py-0.5 border font-mono ${cls}`}>
                  {label}
                </span>
              );
            })()}
          </div>
          <div className="flex items-center gap-1 sm:shrink-0 overflow-x-auto scrollbar-none">
          {[
            { v: 100,   label: "Top 100" },
            { v: 300,   label: "Top 300" },
            { v: 1000,  label: "Top 1000" },
            { v: 2000,  label: "Top 2000" },
            { v: 50000, label: "전체" },
          ].map(o => (
            <button key={o.v} onClick={() => setLimit(o.v)}
              className={`text-[10px] font-black px-1.5 py-0.5 rounded transition ${
                limit === o.v ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >{o.label}</button>
          ))}
          </div>
        </div>
        {/* 안내 문구 — 사용자 팁 */}
        <p className="text-[10px] text-slate-500 font-semibold leading-tight">
          💡 상품명을 누르면 판매추이 그래프가 나옵니다
        </p>
      </div>
      {/* 조회기간 · 버튼 선택 후 [확인] 클릭 시 조회 (자동 조회 X) */}
      <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1 flex-wrap text-[10px]">
        <span className="text-slate-500 font-black shrink-0 mr-1">조회기간</span>
        <button onClick={() => setPendingMonths(0)}
          className={`px-1.5 py-0.5 rounded font-black transition ${
            pendingMonths === 0 ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-100"
          }`}>10일</button>
        {[1, 2, 3, 4, 5, 6].map(m => (
          <button key={m} onClick={() => setPendingMonths(m as any)}
            className={`px-1.5 py-0.5 rounded font-black transition ${
              pendingMonths === m ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-100"
            }`}>{m}개월</button>
        ))}
        {pendingMonths !== months ? (
          <button onClick={() => setMonths(pendingMonths)}
            className="ml-1 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-orange-500 text-white font-black hover:bg-orange-600 shadow-sm cursor-pointer transition animate-pulse"
            title="선택한 기간으로 조회">확인 →</button>
        ) : (
          <span className="ml-1 text-[9px] text-slate-400 font-semibold">조회 완료</span>
        )}
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
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={limit >= 50000 ? "전체 상품 검색" : "TOP 리스트 내 검색"}
              className="w-full pl-7 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 bg-white"
            />
            {query && (
              <button onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">
                <X size={12} />
              </button>
            )}
          </div>
          {onOpenProductInfo && (
            <button
              type="button"
              onClick={() => {
                const q = query.trim();
                if (displayRows.length > 0) onOpenProductInfo(displayRows[0]);
                else if (q) {
                  fetch(`/api/products-search?q=${encodeURIComponent(q)}`)
                    .then(r => r.ok ? r.json() : [])
                    .then(list => { if (Array.isArray(list) && list.length > 0) onOpenProductInfo(list[0]); })
                    .catch(() => {});
                }
              }}
              disabled={!query.trim() && displayRows.length === 0}
              title="선택 상품의 상세 정보 (판매리스트 상품명 클릭과 동일)"
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-black text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-2 py-1.5 cursor-pointer transition shadow-sm active:scale-95"
            >
              <Info size={12} /> 정보확인
            </button>
          )}
          {onOpenHiddenManager && (
            <button
              type="button"
              onClick={onOpenHiddenManager}
              title="숨김 처리된 상품 관리"
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-black text-amber-700 bg-white border border-amber-300 hover:bg-amber-50 rounded-lg px-2 py-1.5 cursor-pointer transition shadow-sm active:scale-95"
            >
              <EyeOff size={12} /> 숨김 관리
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
      {/* 리스트 · 판매리스트 · 접기/펼치기 (2026-07-15 · 재고관리와 동일 패턴) */}
      <div
        className="px-3 pt-1.5 pb-0.5 flex items-center gap-2 border-t border-slate-100 bg-white cursor-pointer select-none hover:bg-slate-50 transition"
        onClick={() => setSaleListCollapsed(v => !v)}
        title={saleListCollapsed ? "펼치기" : "접기"}
      >
        <span className={`text-slate-400 text-xs transition-transform ${saleListCollapsed ? "" : "rotate-90"}`}>▶</span>
        <span className="text-[11px] font-black text-slate-600">판매리스트</span>
        <span className="text-[10px] font-mono text-slate-400">({displayRows.length}건)</span>
      </div>
      <div className={`flex-1 overflow-auto relative max-h-[50vh] ${saleListCollapsed ? "hidden" : ""}`}>
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
              {selectedCodes.size > 0 && (
                <tr className="bg-rose-50 border-b border-rose-200">
                  <td colSpan={10} className="px-2 py-1.5">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-black text-rose-700">{selectedCodes.size}개 선택됨</span>
                      <button onClick={bulkHide} disabled={bulkHiding}
                        className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500 hover:bg-rose-600 text-white font-black shadow-sm disabled:opacity-50">
                        {bulkHiding ? <Loader2 size={11} className="animate-spin" /> : <EyeOff size={11} />}
                        선택 숨김
                      </button>
                      <button onClick={() => setSelectedCodes(new Set())}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-black">
                        <X size={11} /> 해제
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">
                <th className="text-center px-0.5 py-1.5 w-6">
                  <button onClick={() => {
                    if (selectedCodes.size === displayRows.length) setSelectedCodes(new Set());
                    else setSelectedCodes(new Set(displayRows.map(r => String(r.product_code))));
                  }} className="text-slate-400 hover:text-rose-500 transition inline-flex items-center justify-center" title="전체 선택/해제">
                    {selectedCodes.size === displayRows.length && displayRows.length > 0
                      ? <CheckSquare size={13} className="text-rose-500" />
                      : <Square size={13} />}
                  </button>
                </th>
                <th className="text-left px-0.5 py-1.5 w-6">#</th>
                <th onClick={() => toggleSort("name")}
                  className={`text-left px-1 py-1.5 min-w-[120px] cursor-pointer select-none hover:bg-slate-50 ${sort === "name" ? "text-slate-800 font-black" : "text-slate-500"}`}
                ><span className="inline-flex items-center gap-0.5">상품명{arrow("name")}</span></th>
                <th onClick={() => toggleSort("sale")}
                  className={`text-right px-0.5 py-1.5 w-14 cursor-pointer select-none hover:bg-orange-100 bg-orange-50/60 ${sort === "sale" ? "text-orange-700 font-black" : "text-orange-500"}`}
                ><span className="inline-flex items-center gap-0.5">판매{arrow("sale")}</span></th>
                <th onClick={() => toggleSort("current")}
                  className={`text-right px-0.5 py-1.5 w-12 cursor-pointer select-none hover:bg-amber-100 bg-amber-50/60 ${sort === "current" ? "text-amber-800 font-black" : "text-amber-600 font-black"}`}
                  title="ERP 현재고 (products.current_stock)"
                ><span className="inline-flex items-center gap-0.5">현재고{arrow("current")}</span></th>
                <th onClick={() => toggleSort("loss")}
                  className={`text-right px-0.5 py-1.5 w-12 cursor-pointer select-none hover:bg-rose-100 bg-rose-50/60 ${sort === "loss" ? "text-rose-700 font-black" : "text-rose-500"}`}
                ><span className="inline-flex items-center gap-0.5">손실{arrow("loss")}</span></th>
                <th onClick={() => toggleSort("amount")}
                  className={`text-right px-0.5 py-1.5 w-16 cursor-pointer select-none hover:bg-indigo-100 bg-indigo-50/60 ${sort === "amount" ? "text-indigo-700 font-black" : "text-indigo-500"}`}
                ><span className="inline-flex items-center gap-0.5">판매가{arrow("amount")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayRows.map((p, i) => {
                const cur = Number(p.current_stock ?? 0);
                const close = Number(p.closing_stock ?? 0);
                const loss = calcLoss(p);
                const mismatch = close !== cur;
                return (
                  <tr
                    key={`sf-${p.product_code}-${i}`}
                    className={`transition cursor-pointer ${selectedCode === String(p.product_code) ? "bg-teal-50 border-l-4 border-teal-500" : selectedCodes.has(String(p.product_code)) ? "bg-rose-50/50" : "hover:bg-orange-50/30"}`}
                    onClick={() => onProductClick(p)}
                  >
                    <td className="text-center px-0.5 py-1.5 align-top" onClick={(e) => { e.stopPropagation(); toggleSelectCode(String(p.product_code)); }}>
                      {selectedCodes.has(String(p.product_code))
                        ? <CheckSquare size={13} className="text-rose-500 inline" />
                        : <Square size={13} className="text-slate-300 hover:text-rose-500 inline" />}
                    </td>
                    <td className="px-0.5 py-1.5 text-[10px] font-black text-orange-600 align-top">{i + 1}</td>
                    <td className="px-1 py-1.5 align-top">
                      <div className="text-[13px] font-medium text-slate-800 break-words whitespace-normal leading-tight" title={p.product_name}>
                        {p.product_name}
                        {(p as any).min_order != null && (p as any).min_order > 0 && (
                          <span className="inline-flex items-center ml-1 px-1 py-0.5 rounded text-[9px] font-black text-sky-700 bg-sky-100 border border-sky-300 align-middle" title={`최소주문량 ${(p as any).min_order}`}>
                            최소{(p as any).min_order}
                          </span>
                        )}
                      </div>
                      {p.supplier && <div className="text-[9px] text-slate-400 break-words whitespace-normal">{p.supplier}</div>}
                    </td>
                    <td className="text-right px-0.5 py-1.5 font-mono font-bold text-orange-700 text-[11px] bg-orange-50/40 align-top">{fmt(p.sale_qty)}</td>
                    <td
                      className={`text-right px-0.5 py-1.5 font-mono font-black text-[11px] bg-amber-50/40 align-top ${cur <= 0 ? "text-red-600" : mismatch ? "text-red-600" : "text-amber-700"}`}
                      title={mismatch ? `현재고 ${fmt(cur)} ≠ 종료 ${fmt(close)} · 불일치` : "ERP 현재고"}
                    >{fmt(cur)}</td>
                    <td
                      className={`text-right px-0.5 py-1.5 font-mono text-[11px] bg-rose-50/40 align-top ${loss > 0 ? "text-rose-600 font-black" : loss < 0 ? "text-emerald-600 font-bold" : "text-slate-400"}`}
                      title={`손실 = (시작${fmt(Number(p.opening_stock))} − 판매${fmt(Number(p.sale_qty))}) − 종료${fmt(close)} = ${loss > 0 ? "-" + fmt(loss) : loss < 0 ? "+" + fmt(Math.abs(loss)) : "0"}${Number(p.purchase_qty) > 0 ? `\n입고: ${fmt(Number(p.purchase_qty))} (참고)` : ""}${Number(p.disposal_qty ?? 0) > 0 ? `\n폐기: ${fmt(Number(p.disposal_qty ?? 0))} (참고)` : ""}`}
                    >{loss === 0 ? "0" : loss > 0 ? `-${fmt(loss)}` : `+${fmt(Math.abs(loss))}`}</td>
                    <td className="text-right px-0.5 py-1.5 font-mono text-[10px] text-indigo-700 font-bold bg-indigo-50/40 align-top">{p.sale_price != null && p.sale_price > 0 ? fmtWon(p.sale_price) : "-"}</td>
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

// ─── 구역카테고리별 판매추이 (real_map 기준 · 2026-07-15) ─────────────────
//   top-sales + productsMap 조합 · 구역(real_map) 별 판매금액·수량 합계
//   화살표 클릭 → 해당 구역 상세 상품 리스트 노출
const ZoneCategoryContent: React.FC = () => {
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/stock-manage/top-sales?sort=sale&dir=desc&limit=50000").then(r => r.ok ? r.json() : { rows: [] }),
      getProductsMap(),
    ])
      .then(([s, p]) => { setSales(Array.isArray(s.rows) ? s.rows : []); setProducts(p ?? {}); })
      .catch(() => { setSales([]); setProducts({}); })
      .finally(() => setLoading(false));
  }, []);
  const grouped = useMemo(() => {
    // real_map 앞부분 (예: "1A", "2B", "9B") 로 그룹핑
    const map = new Map<string, { zone: string; saleQty: number; totalAmount: number; items: Array<{ code: string; name: string; saleQty: number; amount: number; currentStock: number }> }>();
    for (const r of sales) {
      const code = String(r.product_code ?? "");
      const p = products[code] ?? {};
      let zone = String(p.real_map ?? "").trim();
      if (!zone) zone = "미배치";
      // 앞 3자만 (예: "1A-01" → "1A")
      const key = zone.replace(/[-_].*$/, "").slice(0, 4) || "미배치";
      const cur = map.get(key) ?? { zone: key, saleQty: 0, totalAmount: 0, items: [] };
      const saleQty = Number(r.sale_qty ?? 0) || 0;
      const amount = Number(r.total_amount ?? 0) || 0;
      if (saleQty > 0 || amount > 0) {
        cur.saleQty += saleQty;
        cur.totalAmount += amount;
        cur.items.push({ code, name: String(r.product_name ?? ""), saleQty, amount, currentStock: Number(r.current_stock ?? 0) });
      }
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
  }, [sales, products]);
  const total = grouped.reduce((s, g) => s + g.totalAmount, 0);
  const fmt = (n: number) => n.toLocaleString();
  const fmtWon = (n: number) => n >= 1_0000_0000 ? `${(n/1_0000_0000).toFixed(1)}억` : n >= 10000 ? `${(n/10000).toFixed(1)}만` : `${n.toLocaleString()}원`;
  // 구역 색상 팔레트 (반복)
  const ZONE_COLORS = ["sky", "emerald", "amber", "rose", "indigo", "teal", "violet", "orange"];
  const colorForZone = (zone: string) => ZONE_COLORS[Math.abs(zone.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % ZONE_COLORS.length];
  return (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 size={14} className="animate-spin mr-2" />로딩...</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">데이터 없음</div>
      ) : (
        <div className="flex flex-col gap-2">
          {grouped.map(g => {
            const pct = total > 0 ? (g.totalAmount / total) * 100 : 0;
            const isOpen = expanded === g.zone;
            const color = colorForZone(g.zone);
            const barCls = { sky: "bg-sky-400", emerald: "bg-emerald-400", amber: "bg-amber-400", rose: "bg-rose-400", indigo: "bg-indigo-400", teal: "bg-teal-400", violet: "bg-violet-400", orange: "bg-orange-400" }[color]!;
            const textCls = { sky: "text-sky-700", emerald: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700", indigo: "text-indigo-700", teal: "text-teal-700", violet: "text-violet-700", orange: "text-orange-700" }[color]!;
            return (
              <div key={g.zone}>
                <button
                  onClick={() => setExpanded(prev => prev === g.zone ? null : g.zone)}
                  className="w-full flex flex-col gap-1 p-2 rounded-lg hover:bg-slate-50 border border-slate-200 cursor-pointer text-left transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-slate-400 text-xs transition-transform shrink-0 ${isOpen ? "rotate-90" : ""}`}>▶</span>
                      <span className={`text-sm font-black ${textCls} font-mono shrink-0`}>{g.zone}</span>
                      {/* 매장 구역도의 카테고리 설명 */}
                      {zoneCategoryLabel(g.zone) && (
                        <span className={`text-[11px] font-semibold ${textCls} truncate`} title={zoneCategoryLabel(g.zone)}>
                          {zoneCategoryLabel(g.zone)}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">· {g.items.length}개</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono text-slate-600">{fmt(g.saleQty)}판매</span>
                      <span className="text-xs font-black text-emerald-700">{fmtWon(g.totalAmount)}</span>
                      <span className="text-[10px] font-mono text-slate-400">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barCls} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </button>
                {isOpen && (
                  <div className="mt-1 ml-4 rounded-lg border border-slate-200 bg-slate-50/50 max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-[10px]">
                      <thead className="sticky top-0 bg-slate-50 z-10">
                        <tr className="text-slate-500 uppercase tracking-wider border-b border-slate-200">
                          <th className="text-left px-1 py-1 w-6">#</th>
                          <th className="text-left px-1 py-1">상품명</th>
                          <th className="text-right px-1 py-1 w-14 text-violet-500">판매</th>
                          <th className="text-right px-1 py-1 w-14">현재고</th>
                          <th className="text-right px-1 py-1 w-16 text-emerald-600">금액</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {g.items.sort((a, b) => b.amount - a.amount).slice(0, 200).map((it, i) => (
                          <tr key={`${g.zone}-${it.code}`} className="hover:bg-white align-top">
                            <td className="px-1 py-1 text-slate-400">{i + 1}</td>
                            <td className="px-1 py-1 break-words whitespace-normal leading-tight" title={it.name}>{it.name}</td>
                            <td className="text-right px-1 py-1 font-mono text-violet-700 font-bold">{fmt(it.saleQty)}</td>
                            <td className="text-right px-1 py-1 font-mono text-amber-700">{fmt(it.currentStock)}</td>
                            <td className="text-right px-1 py-1 font-mono font-bold text-emerald-700">{fmtWon(it.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {g.items.length > 200 && <div className="text-[10px] text-slate-400 text-center py-1">상위 200개만 · 전체 {g.items.length}개</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

// ─── 카테고리별 탭 (B 방식 · supplier 이름 패턴 기반 매핑 · 2026-07-15) ─────
//   supplier 명에서 접미어 추출 → 카테고리 자동 분류
//   나중에 vendors.category 로 A 방식 전환 가능
const CATEGORY_PATTERNS: Array<{ name: string; regex: RegExp; color: string }> = [
  { name: "제약·의약품",   regex: /제약|약품|양행|메디|팜|의약|파마/,          color: "sky"     },
  { name: "건강기능식품",  regex: /바이오|헬스|뉴트리|비타|건강|보약/,         color: "emerald" },
  { name: "화장품·뷰티",   regex: /화장|코스메틱|뷰티|스킨/,                    color: "rose"    },
  { name: "의료기기·용품", regex: /메디컬|MED|의료기기|장비|기구/i,             color: "indigo"  },
  { name: "생활·잡화",     regex: /생활|잡화|일용|가정/,                        color: "amber"   },
];
function classifySupplier(name: string): { category: string; color: string } {
  if (!name) return { category: "미분류", color: "slate" };
  for (const p of CATEGORY_PATTERNS) if (p.regex.test(name)) return { category: p.name, color: p.color };
  return { category: "기타", color: "slate" };
}

const CategoryTab: React.FC = () => {
  // 2026-07-15: 공급사분류 서브탭 제거 · 구역별만 유지 · 각 구역 설명 표시
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <PieChart size={14} className="text-violet-600" />
          <span className="text-sm font-black text-slate-700">구역별 카테고리별 매입 · 판매</span>
        </div>
        <span className="text-[10px] font-semibold text-slate-400">real_map 기반</span>
      </div>
      <ZoneCategoryContent />
    </div>
  );
};

// (구버전 · 공급사분류 · 2026-07-15 미사용 · 남겨두면 아래 삭제 예정)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CategoryTabSupplier_deprecated: React.FC = () => {
  const [rows, setRows] = useState<Array<{ supplier: string; supplier_code: string | null; saleQty: number; purchaseAmount: number; itemCount: number }>>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/stock-manage/supplier-purchases?limit=500`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(j => setRows(Array.isArray(j.rows) ? j.rows : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; color: string; saleQty: number; purchaseAmount: number; itemCount: number; suppliers: string[] }>();
    for (const r of rows) {
      const { category, color } = classifySupplier(r.supplier);
      const cur = map.get(category) ?? { name: category, color, saleQty: 0, purchaseAmount: 0, itemCount: 0, suppliers: [] };
      cur.saleQty += Number(r.saleQty ?? 0) || 0;
      cur.purchaseAmount += Number(r.purchaseAmount ?? 0) || 0;
      cur.itemCount += Number(r.itemCount ?? 0) || 0;
      cur.suppliers.push(r.supplier);
      map.set(category, cur);
    }
    return [...map.values()].sort((a, b) => b.purchaseAmount - a.purchaseAmount);
  }, [rows]);
  const total = grouped.reduce((s, x) => s + x.purchaseAmount, 0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const fmt = (n: number) => n.toLocaleString();
  const fmtWon = (n: number) => n >= 1_0000_0000 ? `${(n/1_0000_0000).toFixed(1)}억` : n >= 10000 ? `${(n/10000).toFixed(1)}만` : `${n.toLocaleString()}원`;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 size={14} className="animate-spin mr-2" />로딩...</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">데이터 없음</div>
      ) : (
        <div className="flex flex-col gap-2">
          {grouped.map(g => {
            const pct = total > 0 ? (g.purchaseAmount / total) * 100 : 0;
            const isOpen = expanded === g.name;
            const barCls = { sky: "bg-sky-400", emerald: "bg-emerald-400", rose: "bg-rose-400", indigo: "bg-indigo-400", amber: "bg-amber-400", slate: "bg-slate-400" }[g.color] ?? "bg-slate-400";
            const textCls = { sky: "text-sky-700", emerald: "text-emerald-700", rose: "text-rose-700", indigo: "text-indigo-700", amber: "text-amber-700", slate: "text-slate-700" }[g.color] ?? "text-slate-700";
            return (
              <div key={g.name}>
                <button
                  onClick={() => setExpanded(prev => prev === g.name ? null : g.name)}
                  className="w-full flex flex-col gap-1 p-2 rounded-lg hover:bg-slate-50 border border-slate-200 cursor-pointer text-left transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-slate-400 text-xs transition-transform shrink-0 ${isOpen ? "rotate-90" : ""}`}>▶</span>
                      <span className={`text-sm font-black ${textCls}`}>{g.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">{g.suppliers.length}개 사</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono text-slate-600">{fmt(g.saleQty)}판매</span>
                      <span className="text-xs font-black text-emerald-700">{fmtWon(g.purchaseAmount)}</span>
                      <span className="text-[10px] font-mono text-slate-400">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barCls} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </button>
                {isOpen && (
                  <div className="mt-1 ml-4 p-2 border-l-2 border-slate-200 bg-slate-50/50 rounded-r-lg">
                    <div className="flex flex-wrap gap-1">
                      {g.suppliers.slice(0, 30).map(s => (
                        <span key={s} className="text-[10px] font-mono text-slate-600 bg-white border border-slate-200 rounded px-1.5 py-0.5">{s}</span>
                      ))}
                      {g.suppliers.length > 30 && <span className="text-[10px] text-slate-400">+{g.suppliers.length - 30}...</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── 손실추적 탭 (2026-07-15 · closing_stock > current_stock 상품) ─────────
type LossSortKey = "name" | "supplier" | "opening" | "sale" | "current" | "expected" | "purchase" | "loss";
const LossTrackerTab: React.FC<{ onOpenProductInfo: (p: any) => void }> = ({ onOpenProductInfo }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [minLoss, setMinLoss] = useState<string>("5"); // 음수 허용 · string 으로 유지
  const [maxLoss, setMaxLoss] = useState<string>(""); // 빈 문자열이면 상한 없음
  const [topN, setTopN] = useState<number>(100); // Top N · 100/300/1000/2000/0(전체)
  const [sortKey, setSortKey] = useState<LossSortKey>("loss");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  useEffect(() => {
    setLoading(true);
    fetch(`/api/stock-manage/top-sales?sort=sale&dir=desc&limit=5000`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(j => setRows(Array.isArray(j.rows) ? j.rows : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);
  const filtered = useMemo(() => {
    const minN = minLoss.trim() === "" ? -Infinity : (Number(minLoss));  // 음수 허용
    const maxN = maxLoss.trim() === "" ? Infinity : (Number(maxLoss) || Infinity);
    const enriched = rows
      .map(r => ({ ...r, loss: calcLoss(r) }))
      .filter(r => r.loss >= minN && r.loss <= maxN);
    const sign = sortDir === "asc" ? 1 : -1;
    const getVal = (r: any): any => {
      switch (sortKey) {
        case "name":     return String(r.product_name ?? "");
        case "supplier": return String(r.supplier ?? "");
        case "opening":  return Number(r.opening_stock ?? 0);
        case "sale":     return Number(r.sale_qty ?? 0);
        case "current":  return Number(r.closing_stock ?? 0);
        case "expected": return Number(r.opening_stock ?? 0) - Number(r.sale_qty ?? 0);
        case "purchase": return Number(r.purchase_qty ?? 0);
        case "loss":     return Number(r.loss ?? 0);
      }
    };
    const sorted = [...enriched].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (typeof va === "number" && typeof vb === "number") return sign * (va - vb);
      return sign * String(va).localeCompare(String(vb), "ko");
    });
    return topN === 0 ? sorted : sorted.slice(0, topN);
  }, [rows, minLoss, maxLoss, sortKey, sortDir, topN]);
  const fmt = (n: number) => n.toLocaleString();
  const handleSort = (k: LossSortKey) => {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "name" || k === "supplier" ? "asc" : "desc"); }
  };
  const arrow = (k: LossSortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col gap-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AlertOctagon size={14} className="text-rose-600" />
          <span className="text-sm font-black text-slate-700">손실추적</span>
          <span className="text-[10px] text-slate-400">(시작재고 − 판매) − 종료재고</span>
        </div>
        <span className="text-[11px] font-bold text-slate-500">{filtered.length}건</span>
      </div>
      {/* 필터 바 */}
      <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
        {/* Top N 필터 · 100/300/1000/2000/전체 */}
        <div className="inline-flex bg-slate-100 rounded-md p-0.5">
          {([100, 300, 1000, 2000, 0] as const).map(n => (
            <button key={n} type="button" onClick={() => setTopN(n)}
              className={`px-1.5 py-0.5 text-[10px] font-black rounded transition ${topN === n ? "bg-white text-rose-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}>
              {n === 0 ? "전체" : `Top ${n}`}
            </button>
          ))}
        </div>
        <span className="text-slate-500 font-bold ml-1">손실 갯수</span>
        <input type="number" value={minLoss} onChange={e => setMinLoss(e.target.value)}
          placeholder="최소"
          title="음수 허용 (예: -5 → 재고 남는 상품도 표시)"
          className="w-16 border border-slate-200 rounded-lg px-1.5 py-1 font-mono text-right focus:outline-none focus:border-rose-400" />
        <span className="text-slate-400">~</span>
        <input type="number" value={maxLoss} onChange={e => setMaxLoss(e.target.value)}
          placeholder="최대"
          className="w-14 border border-slate-200 rounded-lg px-1.5 py-1 font-mono text-right focus:outline-none focus:border-rose-400" />
        <span className="text-slate-400">개</span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 size={14} className="animate-spin mr-2" />로딩...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">손실 상품 없음</div>
      ) : (
        <div className="overflow-auto max-h-[50vh] rounded-lg border border-slate-100">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
              <tr className="text-slate-500 text-[10px] uppercase tracking-wider">
                <th className="text-left px-2 py-1.5 w-6">#</th>
                <th onClick={() => handleSort("name")}
                  className={`text-left px-2 py-1.5 cursor-pointer select-none hover:bg-rose-50 transition ${sortKey === "name" ? "text-rose-700 font-black" : ""}`}>
                  <span className="inline-flex items-center gap-0.5">상품명{arrow("name")}</span>
                </th>
                <th onClick={() => handleSort("supplier")}
                  className={`text-left px-2 py-1.5 hidden sm:table-cell cursor-pointer select-none hover:bg-rose-50 transition ${sortKey === "supplier" ? "text-rose-700 font-black" : ""}`}>
                  <span className="inline-flex items-center gap-0.5">공급사{arrow("supplier")}</span>
                </th>
                <th onClick={() => handleSort("opening")}
                  className={`text-right px-2 py-1.5 w-14 cursor-pointer select-none hover:bg-rose-50 transition ${sortKey === "opening" ? "text-rose-700 font-black" : ""}`}
                  title="시작재고"><span className="inline-flex items-center gap-0.5">시작{arrow("opening")}</span></th>
                <th onClick={() => handleSort("sale")}
                  className={`text-right px-2 py-1.5 w-14 cursor-pointer select-none hover:bg-orange-50 transition ${sortKey === "sale" ? "text-orange-700 font-black" : "text-orange-500"}`}
                  title="판매출고계 · 실제 팔린 양"><span className="inline-flex items-center gap-0.5">판매{arrow("sale")}</span></th>
                <th onClick={() => handleSort("current")}
                  className={`text-right px-2 py-1.5 w-14 cursor-pointer select-none hover:bg-rose-50 transition ${sortKey === "current" ? "text-rose-700 font-black" : ""}`}
                  title="현재고 (products.current_stock)"><span className="inline-flex items-center gap-0.5">현재고{arrow("current")}</span></th>
                <th onClick={() => handleSort("expected")}
                  className={`text-right px-2 py-1.5 w-14 hidden md:table-cell cursor-pointer select-none hover:bg-indigo-50 transition ${sortKey === "expected" ? "text-indigo-700 font-black" : "text-indigo-500"}`}
                  title="시작 − 판매 = 예상 종료재고"><span className="inline-flex items-center gap-0.5">예상{arrow("expected")}</span></th>
                <th onClick={() => handleSort("purchase")}
                  className={`text-right px-2 py-1.5 w-14 hidden md:table-cell cursor-pointer select-none hover:bg-emerald-50 transition ${sortKey === "purchase" ? "text-emerald-700 font-black" : "text-emerald-500"}`}
                  title="입고계 (참고)"><span className="inline-flex items-center gap-0.5">입고{arrow("purchase")}</span></th>
                <th onClick={() => handleSort("loss")}
                  className={`text-right px-2 py-1.5 w-16 cursor-pointer select-none hover:bg-rose-100 transition ${sortKey === "loss" ? "text-rose-800 font-black" : "text-rose-600 font-black"}`}
                  title="예상 − 종료 (양수면 손실)"><span className="inline-flex items-center gap-0.5">손실{arrow("loss")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r, i) => {
                const open = Number(r.opening_stock ?? 0);
                const purch = Number(r.purchase_qty ?? 0);
                const sale = Number(r.sale_qty ?? 0);
                const close = Number(r.closing_stock ?? 0);
                const expected = open - sale;
                return (
                <tr key={r.product_code ?? i} className="hover:bg-rose-50/30 transition"
                    title={`예상 = 시작(${open}) − 판매(${sale}) = ${expected}\n실제 종료 = ${close}\n손실 = ${expected - close}${purch > 0 ? `\n※ 이 기간 입고 ${purch} 있음 (예상 계산에 미반영)` : ""}`}>
                  <td className="px-2 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => onOpenProductInfo(r)} className="text-left font-bold text-indigo-700 hover:text-indigo-900 underline decoration-dotted decoration-indigo-400 underline-offset-2">
                      {r.product_name}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-slate-500 hidden sm:table-cell truncate max-w-[160px]">{r.supplier}</td>
                  <td className="text-right px-2 py-1.5 font-mono text-slate-600">{fmt(open)}</td>
                  <td className="text-right px-2 py-1.5 font-mono text-orange-600 font-black">{fmt(sale)}</td>
                  <td className="text-right px-2 py-1.5 font-mono text-slate-600">{fmt(close)}</td>
                  <td className="text-right px-2 py-1.5 font-mono text-indigo-600 font-bold hidden md:table-cell">{fmt(expected)}</td>
                  <td className={`text-right px-2 py-1.5 font-mono text-slate-500 hidden md:table-cell ${purch > 0 ? "text-emerald-600 font-bold" : ""}`}>{fmt(purch)}</td>
                  <td className="text-right px-2 py-1.5 font-mono font-black text-rose-600">-{fmt(r.loss)}</td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export const SalesTrendPage: React.FC = () => {
  // 2026-07-15 · 통합 4탭 (판매순위 = 판매추이차트와 동일이라 제거)
  //   판매추이차트 (기본) · 공급사별 · 카테고리별 · 손실추적
  type SalesTab = "chart" | "supplier" | "category" | "loss" | "product";
  const [salesTab, setSalesTab] = useState<SalesTab>("chart");
  // 하위 컴포넌트 호환 · ProductTrendTab/SupplierTrendTab 에 넘길 activeTab
  const tab: "product" | "supplier" = salesTab === "supplier" ? "supplier" : "product";
  const setTab = (t: "product" | "supplier") => setSalesTab(t === "supplier" ? "supplier" : "chart");
  const [granularity, setGranularity] = useState<"10day" | "month">("10day");
  const [chartMonths, setChartMonths] = useState<1 | 2 | 3 | 4 | 5 | 6>(3);
  const chartRangeDays = chartMonths * 30;

  // 정보확인 검색 (2026-07-15 · useProductInfoSearch 훅으로 통합)
  const _pis = useProductInfoSearch();
  const infoSearchQuery = _pis.query;
  const setInfoSearchQuery = _pis.setQuery;
  const infoSearchResults = _pis.results;
  const setInfoSearchResults = _pis.setResults;
  const infoSelected = _pis.selected;
  const setInfoSelected = _pis.setSelected;
  const runInfoSearch = _pis.runSearch;

  // 판매리스트 상품명 클릭 시 나오는 화면과 동일 (ProductInfoCard 모달)
  const [scanProductModal, setScanProductModal] = useState<ProductInfo | null>(null);
  const openScanProductModal = useCallback(async (p: any) => {
    const code = String(p.product_code ?? p.code ?? "").trim();
    const partial: ProductInfo = {
      code,
      name: String(p.product_name ?? p.name ?? ""),
      spec: String(p.spec ?? ""),
      current_stock: p.current_stock ?? null,
      optimal_stock: p.optimal_stock ?? null,
      supplier: p.supplier ?? null,
      real_map: p.real_map ?? null,
      warehouse_stock: p.warehouse_stock ?? null,
      store_stock: p.store_stock ?? null,
    };
    setScanProductModal(partial);
    try {
      let full = lookupProduct(code);
      if (!full) {
        const map = await getProductsMap();
        full = map[code] ?? map[code.replace(/^0+/, "")] ?? null;
      }
      if (full) {
        setScanProductModal(prev => {
          if (!prev || prev.code !== code) return prev;
          const overlay: Record<string, any> = {};
          for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) overlay[k] = v;
          return { ...full, ...overlay, code, name: full.name || prev.name };
        });
      }
    } catch { /* 캐시 실패 시 partial 만 유지 */ }
  }, []);
  const openProductInfoModal = useCallback(async () => {
    let target = infoSelected;
    if (!target && infoSearchResults.length > 0) target = infoSearchResults[0];
    if (!target && infoSearchQuery.trim()) {
      try {
        const res = await fetch(`/api/products-search?q=${encodeURIComponent(infoSearchQuery.trim())}`);
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            target = list[0];
            setInfoSelected(list[0]);
            setInfoSearchResults([]);
          }
        }
      } catch { /* ignore */ }
    }
    if (!target) return;
    openScanProductModal(target);
  }, [infoSelected, infoSearchResults, infoSearchQuery, openScanProductModal]);

  // 숨김 관리 (2026-07-15 · useHiddenManager 훅 · 페이지별 격리 동작)
  //   unhide 성공 시 판매추이 자기 리스트만 갱신 · 재고관리 영향 없음
  //   (구체 갱신 로직은 각 서브탭 · 지금은 훅 자체 setList 만 필요)
  const _hm = useHiddenManager();
  const hiddenModalOpen = _hm.modalOpen;
  const setHiddenModalOpen = _hm.setModalOpen;
  const hiddenList = _hm.list;
  const hiddenLoading = _hm.loading;
  const hiddenUnhideBusyCode = _hm.unhideBusyCode;
  const loadHiddenList = _hm.load;
  const openHiddenManagerModal = _hm.open;
  const unhideProduct = _hm.unhide;

  return (
    <div className="flex-1 flex flex-col max-w-[1360px] mx-auto w-full px-3 sm:px-6 py-2 sm:py-4 gap-3">
      {/* 페이지 상단 제목 */}
      <div className="flex items-center gap-2 min-w-0">
        <TrendingUp size={18} className="text-teal-600 shrink-0" />
        <h2 className="text-lg font-black text-slate-800">판매추이</h2>
        <span className="text-[11px] font-semibold text-slate-400 hidden md:inline">10일 스냅샷</span>
      </div>

      {/* 통합 탭 바 (2026-07-15) · 모바일: 3열 grid 2줄 · 데스크탑: 한 줄 · 글씨 축소 없음 */}
      <div className="flex flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-x-0 sm:gap-1 border-b border-slate-200 sm:overflow-x-auto sm:scrollbar-none">
        {([
          { k: "chart" as SalesTab,    label: "판매추이차트", icon: Activity,     color: "amber" },
          { k: "supplier" as SalesTab, label: "공급사별",     icon: Building2,    color: "sky" },
          { k: "category" as SalesTab, label: "카테고리별",   icon: PieChart,     color: "violet" },
          { k: "loss" as SalesTab,     label: "손실추적",     icon: AlertOctagon, color: "rose" },
          { k: "product" as SalesTab,  label: "상품관리",     icon: Package,      color: "indigo" },
        ]).map(t => {
          const Icon = t.icon;
          const active = salesTab === t.k;
          const activeText = { sky: "text-sky-700", violet: "text-violet-700", amber: "text-amber-700", rose: "text-rose-700", indigo: "text-indigo-700" }[t.color]!;
          const activeBar  = { sky: "bg-sky-500",   violet: "bg-violet-500",   amber: "bg-amber-500",   rose: "bg-rose-500",   indigo: "bg-indigo-500"   }[t.color]!;
          return (
            <button key={t.k} onClick={() => setSalesTab(t.k)}
              className={`relative basis-1/3 sm:basis-auto flex-grow-0 flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-2 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-[13px] font-bold leading-tight transition-colors duration-150 ${active ? activeText : "text-slate-400 hover:text-slate-700"}`}>
              <Icon size={13} strokeWidth={active ? 2.4 : 1.8} className="hidden sm:inline-block shrink-0" />
              <span>{t.label}</span>
              {active && <span className={`absolute left-0 right-0 -bottom-px h-[2px] ${activeBar} rounded-t-sm`} />}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {salesTab === "chart"    && <ProductTrendTab granularity={granularity} chartRangeDays={chartRangeDays} onChartMonthsChange={setChartMonths} onGranularityChange={setGranularity} activeTab={"product"} onTabChange={setTab} onOpenProductInfo={openScanProductModal} onOpenHiddenManager={openHiddenManagerModal} />}
        {salesTab === "supplier" && <SupplierTrendTab granularity={granularity} chartRangeDays={chartRangeDays} activeTab={"supplier"} onTabChange={setTab} onProductClick={openScanProductModal} />}
        {salesTab === "category" && <CategoryTab />}
        {salesTab === "loss"     && <LossTrackerTab onOpenProductInfo={openScanProductModal} />}
        {salesTab === "product"  && <ProductManageView onProductClick={openScanProductModal} />}
      </div>

      {/* 정보확인 모달 (판매리스트 상품명 클릭과 동일 · ProductInfoCard) */}
      {scanProductModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-1 sm:p-4" onClick={() => setScanProductModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[98vh] sm:max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-teal-50 to-emerald-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center shrink-0 shadow-md">
                  <Package size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-black text-slate-800 truncate">{scanProductModal.name}</div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">#{scanProductModal.code}</div>
                </div>
              </div>
              <button onClick={() => setScanProductModal(null)} className="text-slate-400 hover:text-slate-700 text-3xl leading-none font-black w-9 h-9 rounded-lg hover:bg-white/70 transition cursor-pointer flex items-center justify-center shrink-0">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 bg-slate-50">
              <ProductInfoCard
                product={scanProductModal}
                context="stock-manage"
                editable
                onRealMapUpdate={(v) => setScanProductModal(prev => prev ? { ...prev, real_map: v } : prev)}
                onProductUpdate={(u) => setScanProductModal(prev => prev ? { ...prev, ...u } : prev)}
              />
            </div>
          </div>
        </div>
      )}

      {/* 숨김 항목 관리 모달 · 재고관리와 동일 */}
      {hiddenModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-1 sm:p-4" onClick={() => setHiddenModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[98vh] sm:max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md">
                  <EyeOff size={18} className="text-white" />
                </div>
                <div>
                  <div className="text-base font-black text-slate-800">숨김 항목 관리</div>
                  <div className="text-[11px] font-semibold text-slate-500 mt-0.5">숨김 처리된 상품 · 검색·발주 리스트에서 노출되지 않음</div>
                </div>
              </div>
              <button onClick={() => setHiddenModalOpen(false)} className="text-slate-400 hover:text-slate-700 text-3xl leading-none font-black w-9 h-9 rounded-lg hover:bg-white/70 transition cursor-pointer flex items-center justify-center shrink-0">×</button>
            </div>
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 bg-white">
              <span className="text-[11px] font-bold text-slate-500">
                총 <span className="text-amber-700 font-black">{hiddenList.length}</span>개 숨김
              </span>
              <button onClick={loadHiddenList} disabled={hiddenLoading}
                className="text-[10px] font-bold text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-400 rounded-lg px-2 py-1 cursor-pointer transition">
                {hiddenLoading ? "..." : "새로고침"}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50">
              {hiddenLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400 text-sm"><Loader2 size={14} className="animate-spin mr-2" />불러오는 중...</div>
              ) : hiddenList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                  <EyeOff size={28} className="opacity-40" />
                  <div className="text-sm font-bold">숨김 처리된 상품이 없습니다</div>
                  <div className="text-[11px]">정보확인 창에서 "숨기기"로 항목 추가 가능</div>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 bg-white">
                  {hiddenList.map((p) => {
                    const code = String(p.product_code ?? "");
                    const busy = hiddenUnhideBusyCode === code;
                    return (
                      <li key={`st-hidden-${code}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-amber-50/30 transition">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-black text-slate-800 truncate" title={p.product_name}>{p.product_name}</div>
                          <div className="text-[10px] font-mono text-slate-400 truncate">
                            #{code}
                            {p.supplier ? ` · ${p.supplier}` : ""}
                            {p.real_map ? ` · ${p.real_map}` : ""}
                            {p.current_stock != null ? ` · 재고 ${p.current_stock}` : ""}
                          </div>
                        </div>
                        <button onClick={() => unhideProduct(code)} disabled={busy}
                          className="shrink-0 flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-wait rounded-lg px-2.5 py-1.5 cursor-pointer transition"
                          title="숨김 해제 · 다시 검색·발주 리스트에 표시">
                          {busy ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
                          다시 표시
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesTrendPage;
