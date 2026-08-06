// src/components/OrderManagePage/TrendingTab.tsx
// 판매 급상승 탭 · 2026-08-03 · StockManagePage.tsx 에서 이동
//   최근 window일 판매 vs 이전 window일 판매 비교
//   신규 진입 (prior=0, recent>0) 상단 · 성장률 desc

import React, { useEffect, useMemo, useState } from "react";
import { TrendingUp, AlertTriangle, Loader2 as LoaderIcon, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { getProductsMap } from "../../lib/productsCache";
import { matchClassFilter, type ClassFilter } from "../../utils/productClassify";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
// T-CSS Phase 2 · 2026-08-06
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";

// ─── 타입 ───────────────────────────────────────────────────────────────────
interface TrendingRow {
  product_code: string;
  product_name: string;
  supplier: string | null;
  recent_sale: number;
  prior_sale: number;
  growth_rate: number | null;
  absolute_delta: number;
  newly_trending: boolean;
  current_stock: number;
  optimal_stock: number;
  sale_price: number;
  below_optimal: boolean;
}

interface PeriodBucketRow {
  product_code: string;
  product_name: string;
  supplier: string | null;
  recent_sale: number;
  prior_sale: number;
  growth_rate: number | null;
  absolute_delta: number;
  newly_trending: boolean;
  current_stock: number;
}

interface PeriodBucket {
  label: string;
  sublabel: string;
  vsLabel: string;
  from: string;
  to: string;
  prior_from: string;
  prior_to: string;
  rows: PeriodBucketRow[];
  total: number;
  loading: boolean;
  error: boolean;
}

// ─── 날짜 유틸 ──────────────────────────────────────────────────────────────
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
function buildMonthlyBuckets(): Omit<PeriodBucket, "rows" | "total" | "loading" | "error">[] {
  const today = new Date();
  const buckets: Omit<PeriodBucket, "rows" | "total" | "loading" | "error">[] = [];
  for (let i = 0; i < 6; i++) {
    const refDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const y = refDate.getFullYear();
    const m = refDate.getMonth() + 1;
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = lastDayOfMonth(y, m);
    const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const prevDate = new Date(y, m - 2, 1);
    const py = prevDate.getFullYear();
    const pm = prevDate.getMonth() + 1;
    const prior_from = `${py}-${String(pm).padStart(2, "0")}-01`;
    const priorLast = lastDayOfMonth(py, pm);
    const prior_to = `${py}-${String(pm).padStart(2, "0")}-${String(priorLast).padStart(2, "0")}`;
    const mLabel = `${y}-${String(m).padStart(2, "0")}`;
    buckets.push({
      label: mLabel,
      sublabel: `${m}/1 ~ ${m}/${lastDay}`,
      vsLabel: `vs ${py}-${String(pm).padStart(2, "0")}`,
      from,
      to,
      prior_from,
      prior_to,
    });
  }
  return buckets;
}
function buildDecadalBuckets(): Omit<PeriodBucket, "rows" | "total" | "loading" | "error">[] {
  const today = new Date();
  type Decade = { year: number; month: number; decade: 1 | 2 | 3 };
  const decades: Decade[] = [];
  for (let mi = 0; mi < 2; mi++) {
    const refDate = new Date(today.getFullYear(), today.getMonth() - mi, 1);
    const y = refDate.getFullYear();
    const m = refDate.getMonth() + 1;
    for (const d of [3, 2, 1] as const) {
      decades.push({ year: y, month: m, decade: d });
    }
  }
  const decadeLabel = (d: 1 | 2 | 3) => d === 1 ? "초순" : d === 2 ? "중순" : "하순";
  const decadeRange = (y: number, m: number, d: 1 | 2 | 3): { from: string; to: string } => {
    const mm = String(m).padStart(2, "0");
    if (d === 1) return { from: `${y}-${mm}-01`, to: `${y}-${mm}-10` };
    if (d === 2) return { from: `${y}-${mm}-11`, to: `${y}-${mm}-20` };
    const last = lastDayOfMonth(y, m);
    return { from: `${y}-${mm}-21`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
  };
  const prevDecade = (d: Decade): Decade => {
    if (d.decade === 1) {
      const prev = new Date(d.year, d.month - 2, 1);
      return { year: prev.getFullYear(), month: prev.getMonth() + 1, decade: 3 };
    }
    return { year: d.year, month: d.month, decade: (d.decade - 1) as 1 | 2 | 3 };
  };
  return decades.map(d => {
    const cur = decadeRange(d.year, d.month, d.decade);
    const prev = prevDecade(d);
    const pr = decadeRange(prev.year, prev.month, prev.decade);
    return {
      label: `${d.month}월 ${decadeLabel(d.decade)}`,
      sublabel: `${d.month}/${cur.from.slice(8)} ~ ${d.month}/${cur.to.slice(8)}`,
      vsLabel: `vs ${prev.month}월 ${decadeLabel(prev.decade)} (${prev.year}-${String(prev.month).padStart(2, "0")})`,
      from: cur.from,
      to: cur.to,
      prior_from: pr.from,
      prior_to: pr.to,
    };
  });
}

// ─── 공용 SortIcon ───────────────────────────────────────────────────────────
// 표 헤더 우측 정렬 방향 아이콘 · 훅 상태 프롭 전달 (2026-08-05)
const SortIcon: React.FC<{ k: string; sortKey: string; sortDir: "asc" | "desc" }> = ({ k, sortKey, sortDir }) => {
  if (sortKey !== k) return <ArrowUpDown size={10} className="text-slate-300 ml-1 inline-block align-middle" />;
  return sortDir === "asc"
    ? <ArrowUp size={10} className="text-indigo-500 ml-1 inline-block align-middle" />
    : <ArrowDown size={10} className="text-indigo-500 ml-1 inline-block align-middle" />;
};

// ─── PeriodBucketCard ────────────────────────────────────────────────────────
const PeriodBucketCard: React.FC<{
  bucket: PeriodBucket;
  onProductClick?: (p: any) => void;
}> = ({ bucket, onProductClick }) => {
  const fmt = (n: number) => n.toLocaleString();
  return (
    <div className={`${CARD_BASE} overflow-hidden flex flex-col`}>
      <div className="px-4 py-3 bg-indigo-50/50 border-b border-indigo-100 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-slate-800">{bucket.label}</span>
            <span className="text-[11px] text-slate-500">({bucket.sublabel})</span>
            {!bucket.loading && !bucket.error && (
              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100 border border-indigo-200 rounded-full px-2 py-0.5 tabular-nums">
                {bucket.total}건
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{bucket.vsLabel}</div>
        </div>
      </div>
      {bucket.loading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
          <div className="w-5 h-5 border-2 border-indigo-100 border-t-indigo-400 rounded-full animate-spin" />
          <span className="text-[11px]">불러오는 중...</span>
        </div>
      ) : bucket.error ? (
        <div className="flex items-center justify-center py-8 text-[11px] text-rose-400 gap-1.5">
          <AlertTriangle size={14} />
          <span>데이터 로드 실패</span>
        </div>
      ) : bucket.rows.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-[11px] text-slate-400 gap-1.5">
          <TrendingUp size={14} className="opacity-30" />
          <span>급상승 상품 없음</span>
        </div>
      ) : (
        <ol className="divide-y divide-slate-50">
          {bucket.rows.map((r, i) => (
            <li key={r.product_code} className="flex items-start gap-2 px-4 py-2.5 hover:bg-indigo-50/20 transition">
              <span className="text-[11px] font-semibold text-slate-400 tabular-nums w-4 shrink-0 mt-0.5">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onProductClick?.({ product_code: r.product_code, product_name: r.product_name, supplier: r.supplier })}
                    className="text-[12px] font-semibold text-slate-700 hover:text-indigo-700 hover:underline text-left break-words cursor-pointer transition"
                  >
                    {r.product_name}
                  </button>
                  {r.newly_trending && (
                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100 border border-indigo-200 rounded px-1.5 py-0.5 shrink-0">신규</span>
                  )}
                </div>
                {r.supplier && <div className="text-[10px] text-slate-400 mt-0.5">{r.supplier}</div>}
                <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] tabular-nums">
                  <span className="font-semibold text-indigo-700">현재 {fmt(r.recent_sale)}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-400">이전 {fmt(r.prior_sale)}</span>
                  <span className="text-slate-300">·</span>
                  <span className={`font-bold ${r.absolute_delta > 0 ? "text-indigo-600" : r.absolute_delta < 0 ? "text-rose-500" : "text-slate-400"}`}>
                    {r.absolute_delta > 0 ? `+${fmt(r.absolute_delta)}` : fmt(r.absolute_delta)}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className={`font-semibold ${r.newly_trending ? "text-indigo-600" : (r.growth_rate ?? 0) > 0 ? "text-indigo-500" : "text-slate-400"}`}>
                    {r.newly_trending ? "NEW" : r.growth_rate != null ? `${r.growth_rate > 0 ? "+" : ""}${r.growth_rate}%` : "-"}
                  </span>
                  {r.current_stock > 0 && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400">재고 {fmt(r.current_stock)}</span>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

// ─── PeriodTrendingSection ───────────────────────────────────────────────────
const PeriodTrendingSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  buckets: PeriodBucket[];
  onProductClick?: (p: any) => void;
}> = ({ title, icon, buckets, onProductClick }) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <span className="text-indigo-500 shrink-0">{icon}</span>
        <span className="text-[13px] font-bold text-slate-700">{title}</span>
        <div className="flex-1 h-px bg-indigo-100" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {buckets.map((b, i) => (
          <PeriodBucketCard key={i} bucket={b} onProductClick={onProductClick} />
        ))}
      </div>
    </div>
  );
};

// ─── TrendingTab (main export) ───────────────────────────────────────────────
export const TrendingTab: React.FC<{ onProductClick?: (p: any) => void }> = ({ onProductClick }) => {
  const { getWidth, resizerProps } = useColumnResize("trendingTab", {
    num:     { default: 36,  min: 28, max: 60  },
    name:    { default: 200, min: 100, max: 400 },
    recent:  { default: 64,  min: 40, max: 120 },
    prior:   { default: 64,  min: 40, max: 120 },
    growth:  { default: 64,  min: 40, max: 120 },
    delta:   { default: 64,  min: 40, max: 120 },
    current: { default: 56,  min: 40, max: 100 },
    optimal: { default: 56,  min: 40, max: 100 },
  });
  const [rows, setRows] = useState<TrendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [windowDays, setWindowDays] = useState<7 | 14 | 30 | 60 | 90>(30);
  const [onlyShortage, setOnlyShortage] = useState(false);
  const [meta, setMeta] = useState<{ recent_from: string; prior_from: string; total: number } | null>(null);
  // 상비약/일반약/전체 3-way 필터 (localStorage 저장) · 기본값: 상비약
  const [classFilter, setClassFilter] = useState<ClassFilter>(() => {
    try {
      const v = localStorage.getItem("megatown_trending_classfilter");
      return v === "stationery" || v === "general" || v === "all" ? v : "stationery";
    } catch { return "stationery"; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_trending_classfilter", classFilter); } catch { /**/ } }, [classFilter]);
  // 상품 real_map 매핑 (products.json 캐시)
  const [productRealMapById, setProductRealMapById] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    getProductsMap().then(map => {
      if (!alive) return;
      const m: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(map)) m[k] = (v as any)?.real_map ?? null;
      setProductRealMapById(m);
    }).catch(() => { /* 캐시 없으면 필터 미분류 처리 */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stock-manage/trending?window=${windowDays}&limit=1000`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(j => {
        setRows(Array.isArray(j.rows) ? j.rows : []);
        setMeta({ recent_from: j.recent_from ?? "", prior_from: j.prior_from ?? "", total: Number(j.total ?? 0) });
      })
      .catch(() => { setRows([]); setMeta(null); })
      .finally(() => setLoading(false));
  }, [windowDays]);

  // classFilter 를 제외한 기타 조건이 적용된 base list (탭 카운트 계산용)
  const baseFiltered = rows;

  // 3-way tab 카운트 (상비약/일반약/전체)
  const essentialCount = useMemo(() =>
    baseFiltered.filter(r => matchClassFilter(productRealMapById[String(r.product_code)] ?? null, "stationery")).length,
    [baseFiltered, productRealMapById]);
  const generalCount = useMemo(() =>
    baseFiltered.filter(r => matchClassFilter(productRealMapById[String(r.product_code)] ?? null, "general")).length,
    [baseFiltered, productRealMapById]);
  const allCount = baseFiltered.length;

  // classFilter + onlyShortage 적용된 최종 필터링 리스트 (정렬 전)
  const filtered = useMemo(() => {
    let list = classFilter === "all" ? baseFiltered :
      baseFiltered.filter(r => matchClassFilter(productRealMapById[String(r.product_code)] ?? null, classFilter));
    if (onlyShortage) list = list.filter(r => r.below_optimal);
    return list;
  }, [baseFiltered, classFilter, productRealMapById, onlyShortage]);

  // 정렬 컬럼 · 툴바 버튼과 표 헤더 클릭 모두 동일 상태 조작 (T30 · useSortableTable)
  //   - growth  : 신규진입(newly_trending) 상단 후 성장률 desc
  //   - delta   : 증가량 desc
  //   - recent  : 최근 판매 desc
  //   - shortage: 부족량(적정-현재) desc
  //   - name    : 상품명 asc (한글 로케일)
  //   - prior   : 이전 판매 desc
  //   - current : 현재고 desc
  //   - optimal : 적정재고 desc
  type SortKey = "growth" | "delta" | "recent" | "shortage" | "name" | "prior" | "current" | "optimal";
  const sortComparators = useMemo<Record<SortKey, Comparator<TrendingRow>>>(() => ({
    // growth: newly_trending 우선 (항상 상단), 그다음 성장률 큰 순
    //   defaultDir="desc" 이므로 desc 방향에서 이 asc-비교의 결과가 부호반전됨
    //   → asc-return 값을 "성장률 asc" 로 두면 desc 클릭 시 큰 순으로 나옴
    //   newly_trending 은 방향과 무관하게 항상 상단이어야 하므로 sign 을 안 타는 별도 처리 필요
    //   → 훅이 sign 만 곱하므로 newly_trending 도 정렬 방향을 타게 됨.
    //     desc 기본값에서만 신규 상단이 보장되므로 여기서는 desc-우선 정렬을 가정하고
    //     신규 상단 로직도 desc-friendly 로 작성 (b - a 관점)
    growth: (a, b) => {
      if (a.newly_trending !== b.newly_trending) return a.newly_trending ? 1 : -1; // desc 시 부호반전 → 신규가 상단
      return (a.growth_rate ?? -999999) - (b.growth_rate ?? -999999);
    },
    delta:    (a, b) => a.absolute_delta - b.absolute_delta,
    recent:   (a, b) => a.recent_sale - b.recent_sale,
    shortage: (a, b) => (a.optimal_stock - a.current_stock) - (b.optimal_stock - b.current_stock),
    name:     (a, b) => a.product_name.localeCompare(b.product_name, "ko"),
    prior:    (a, b) => a.prior_sale - b.prior_sale,
    current:  (a, b) => a.current_stock - b.current_stock,
    optimal:  (a, b) => a.optimal_stock - b.optimal_stock,
  }), []);
  const { sorted: displayed, sortKey, sortDir, toggleSort, setSort } =
    useSortableTable<TrendingRow, SortKey>(filtered, "growth", sortComparators, "desc");

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="flex flex-col gap-2">
      {/* ── 카드: 헤더 툴바 + 컨트롤 ── */}
      <div className={`${CARD_BASE} overflow-hidden`}>
        {/* h-12 툴바 */}
        <div className="flex items-center gap-2 px-4 h-12 border-b border-indigo-100 bg-indigo-50/40 shrink-0">
          <TrendingUp size={14} className="text-indigo-500 shrink-0" />
          <span className="text-[13px] font-semibold text-slate-800">판매 급상승</span>
          {meta && (
            <span className="text-[11px] font-medium text-indigo-700 bg-indigo-100 rounded-full px-2 py-0.5 tabular-nums">
              {fmt(meta.total)}건
            </span>
          )}
          <span className="text-[11px] text-slate-400 hidden sm:block">
            {meta ? `최근 ${windowDays}일 (${meta.recent_from} ~) vs 이전 ${windowDays}일 비교` : `최근 ${windowDays}일 vs 이전 기간 판매 비교 · 신규진입 상단`}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                fetch(`/api/stock-manage/trending?window=${windowDays}&limit=1000`)
                  .then(r => r.ok ? r.json() : { rows: [] })
                  .then(j => {
                    setRows(Array.isArray(j.rows) ? j.rows : []);
                    setMeta({ recent_from: j.recent_from ?? "", prior_from: j.prior_from ?? "", total: Number(j.total ?? 0) });
                  })
                  .catch(() => { setRows([]); setMeta(null); })
                  .finally(() => setLoading(false));
              }}
              disabled={loading}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-slate-400 hover:text-indigo-500 transition disabled:opacity-40 cursor-pointer"
              title="새로고침"
            >
              <LoaderIcon size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        {/* 컨트롤 행 */}
        <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap border-b border-slate-100 bg-white">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">비교기간</span>
          <div className="inline-flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
            {([7, 14, 30, 60, 90] as const).map(w => (
              <button key={w} onClick={() => setWindowDays(w as 7 | 14 | 30 | 60 | 90)}
                className={`h-7 px-2.5 text-[11px] font-semibold rounded transition cursor-pointer ${windowDays === w ? "bg-indigo-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {w}일
              </button>
            ))}
          </div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">정렬</span>
          <div className="inline-flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
            {([
              { k: "growth" as const, label: "성장률" },
              { k: "delta" as const, label: "증가량" },
              { k: "recent" as const, label: "최근판매" },
              { k: "shortage" as const, label: "재고부족" },
            ]).map(o => (
              <button key={o.k} onClick={() => setSort(o.k, "desc")}
                className={`h-7 px-2.5 text-[11px] font-semibold rounded transition cursor-pointer ${sortKey === o.k ? "bg-indigo-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {o.label}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer ml-auto">
            <input type="checkbox" checked={onlyShortage} onChange={e => setOnlyShortage(e.target.checked)} className="w-3.5 h-3.5 accent-indigo-500" />
            재고 부족만
          </label>
        </div>
      </div>

      {/* ── 테이블 카드 ── */}
      <div className={`${CARD_BASE} overflow-hidden`}>
        {/* 상비약/일반약/전체 3-way 필터 (좌측 리스트 상단) */}
        <div className="flex items-center gap-1 border-b-2 border-slate-200 bg-white px-2 pt-1">
          <button type="button" onClick={() => setClassFilter("stationery")}
            className={`relative px-4 py-2 ${TEXT.body} font-black leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "stationery" ? "text-violet-700" : "text-slate-400 hover:text-slate-600"}`}>
            상비약 <span className={`${TEXT.caption} text-slate-400 ml-1 tabular-nums`}>({essentialCount})</span>
            {classFilter === "stationery" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-violet-500" />}
          </button>
          <button type="button" onClick={() => setClassFilter("general")}
            className={`relative px-4 py-2 ${TEXT.body} font-black leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "general" ? "text-sky-700" : "text-slate-400 hover:text-slate-600"}`}>
            일반약 <span className={`${TEXT.caption} text-slate-400 ml-1 tabular-nums`}>({generalCount})</span>
            {classFilter === "general" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-sky-500" />}
          </button>
          <button type="button" onClick={() => setClassFilter("all")}
            className={`relative px-4 py-2 ${TEXT.body} font-black leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "all" ? "text-slate-800" : "text-slate-400 hover:text-slate-600"}`}>
            전체 <span className={`${TEXT.caption} text-slate-400 ml-1 tabular-nums`}>({allCount})</span>
            {classFilter === "all" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-slate-500" />}
          </button>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-400">
            <div className="w-9 h-9 border-4 border-indigo-100 border-t-indigo-400 rounded-full animate-spin" />
            <span className="text-[12px] font-semibold">불러오는 중...</span>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2 text-slate-400">
            <TrendingUp size={28} className="opacity-20" />
            <div className="text-[12px] font-semibold">{onlyShortage ? "재고 부족인 급상승 상품 없음" : "급상승 상품 없음"}</div>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-[12px]" style={{ tableLayout: "fixed" }}>
              <thead className="sticky top-0 z-10">
                {/* 컬럼 그룹 헤더 */}
                <tr className="text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th colSpan={2} className="bg-slate-50 text-slate-400 text-left px-3 py-1.5">기본정보</th>
                  <th colSpan={2} className="bg-indigo-50 text-indigo-600 text-center px-3 py-1.5">판매량 비교</th>
                  <th colSpan={2} className="bg-indigo-100 text-indigo-700 text-center px-3 py-1.5">성장 지표</th>
                  <th colSpan={2} className="bg-slate-50 text-slate-400 text-center px-3 py-1.5">재고현황</th>
                </tr>
                {/* 서브헤더 · 리사이즈 지원 */}
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider bg-white">
                  <th className="relative text-center px-2 py-1.5" style={{ width: getWidth("num"), minWidth: getWidth("num") }}>
                    #
                    <span {...resizerProps("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                  </th>
                  <th
                    onClick={() => toggleSort("name")}
                    title="상품명 정렬"
                    className="relative text-left px-2 py-1.5 cursor-pointer select-none hover:bg-indigo-50/30 transition"
                    style={{ width: getWidth("name"), minWidth: getWidth("name") }}
                  >
                    상품명<SortIcon k="name" sortKey={sortKey} sortDir={sortDir} />
                    <span {...resizerProps("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th
                    onClick={() => toggleSort("recent")}
                    title="최근 판매 정렬"
                    className="relative text-right px-2 py-1.5 bg-indigo-50/50 text-indigo-600 cursor-pointer select-none hover:bg-indigo-100/60 transition"
                    style={{ width: getWidth("recent"), minWidth: getWidth("recent") }}
                  >
                    최근{windowDays}일<SortIcon k="recent" sortKey={sortKey} sortDir={sortDir} />
                    <span {...resizerProps("recent")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th
                    onClick={() => toggleSort("prior")}
                    title="이전 판매 정렬"
                    className="relative text-right px-2 py-1.5 bg-indigo-50/30 text-indigo-500 cursor-pointer select-none hover:bg-indigo-100/60 transition"
                    style={{ width: getWidth("prior"), minWidth: getWidth("prior") }}
                  >
                    이전{windowDays}일<SortIcon k="prior" sortKey={sortKey} sortDir={sortDir} />
                    <span {...resizerProps("prior")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th
                    onClick={() => toggleSort("growth")}
                    title="성장률 정렬 · 신규진입 상단"
                    className="relative text-right px-2 py-1.5 bg-indigo-100/60 text-indigo-700 cursor-pointer select-none hover:bg-indigo-200/60 transition"
                    style={{ width: getWidth("growth"), minWidth: getWidth("growth") }}
                  >
                    성장률<SortIcon k="growth" sortKey={sortKey} sortDir={sortDir} />
                    <span {...resizerProps("growth")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th
                    onClick={() => toggleSort("delta")}
                    title="증가량 정렬"
                    className="relative text-right px-2 py-1.5 bg-indigo-50/60 text-indigo-600 cursor-pointer select-none hover:bg-indigo-100/60 transition"
                    style={{ width: getWidth("delta"), minWidth: getWidth("delta") }}
                  >
                    증가량<SortIcon k="delta" sortKey={sortKey} sortDir={sortDir} />
                    <span {...resizerProps("delta")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th
                    onClick={() => toggleSort("current")}
                    title="현재고 정렬"
                    className="relative text-right px-2 py-1.5 text-slate-500 cursor-pointer select-none hover:bg-slate-100/60 transition"
                    style={{ width: getWidth("current"), minWidth: getWidth("current") }}
                  >
                    현재고<SortIcon k="current" sortKey={sortKey} sortDir={sortDir} />
                    <span {...resizerProps("current")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th
                    onClick={() => toggleSort("optimal")}
                    title="적정재고 정렬"
                    className="relative text-right px-2 py-1.5 text-slate-400 cursor-pointer select-none hover:bg-slate-100/60 transition"
                    style={{ width: getWidth("optimal"), minWidth: getWidth("optimal") }}
                  >
                    적정<SortIcon k="optimal" sortKey={sortKey} sortDir={sortDir} />
                    <span {...resizerProps("optimal")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayed.map((r, i) => (
                  <tr key={r.product_code} className={`hover:bg-indigo-50/20 transition ${r.newly_trending ? "bg-indigo-50/10" : ""}`}>
                    <td className="text-center px-2 py-2 text-[11px] font-medium text-slate-400 tabular-nums align-top">{i + 1}</td>
                    <td className="text-left px-2 py-2 align-top">
                      <button onClick={() => onProductClick?.({ product_code: r.product_code, product_name: r.product_name, supplier: r.supplier })}
                        className="text-left text-[12px] font-semibold text-slate-700 hover:text-indigo-700 hover:underline break-words whitespace-normal leading-snug cursor-pointer transition">
                        {r.product_name}
                      </button>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {r.supplier && <span className="text-[10px] text-slate-400">{r.supplier}</span>}
                        {r.newly_trending && (
                          <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100 border border-indigo-200 rounded px-1.5 py-0.5">신규진입</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right px-2 py-2 text-[12px] font-semibold text-indigo-700 tabular-nums align-top bg-indigo-50/30">{fmt(r.recent_sale)}</td>
                    <td className="text-right px-2 py-2 text-[12px] font-medium text-slate-400 tabular-nums align-top bg-indigo-50/10">{fmt(r.prior_sale)}</td>
                    <td className={`text-right px-2 py-2 text-[12px] font-bold tabular-nums align-top bg-indigo-50/40 ${r.newly_trending ? "text-indigo-600" :
                      (r.growth_rate ?? 0) >= 50 ? "text-indigo-700" :
                        (r.growth_rate ?? 0) > 0 ? "text-indigo-600" :
                          "text-slate-400"
                      }`}>
                      {r.newly_trending ? "NEW" : r.growth_rate != null ? `${r.growth_rate > 0 ? "+" : ""}${r.growth_rate}%` : "-"}
                    </td>
                    <td className={`text-right px-2 py-2 text-[12px] font-semibold tabular-nums align-top bg-indigo-50/20 ${r.absolute_delta > 0 ? "text-indigo-600" : r.absolute_delta < 0 ? "text-rose-500" : "text-slate-400"}`}>
                      {r.absolute_delta > 0 ? `+${fmt(r.absolute_delta)}` : fmt(r.absolute_delta)}
                    </td>
                    <td className={`text-right px-2 py-2 text-[12px] font-semibold tabular-nums align-top ${r.below_optimal ? "text-rose-500" : "text-slate-600"}`}
                      title={r.below_optimal ? `현재고 부족 · ${r.current_stock} < 적정 ${r.optimal_stock}` : ""}>
                      {fmt(r.current_stock)}
                    </td>
                    <td className="text-right px-2 py-2 text-[12px] font-medium text-slate-400 tabular-nums align-top">{r.optimal_stock > 0 ? fmt(r.optimal_stock) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
