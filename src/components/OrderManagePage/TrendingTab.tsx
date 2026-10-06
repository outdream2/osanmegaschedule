// src/components/OrderManagePage/TrendingTab.tsx
// 판매 급상승 탭 · 2026-08-03 · StockManagePage.tsx 에서 이동
//   최근 window일 판매 vs 이전 window일 판매 비교
//   신규 진입 (prior=0, recent>0) 상단 · 성장률 desc

import React, { useEffect, useMemo, useState } from "react";
import { SK_TRENDING_CLASSFILTER } from "../../lib/storageKeys";
import { TrendingUp, AlertTriangle, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { useProductDetailModal, type ProductRef } from "../common/features/ProductDetailModal";
import { getProductsMap } from "../../lib/productsCache";
// 2026-08-31 · #13 · location 우선 · real_map fallback
import { resolveProductLocation } from "../../lib/productLocation";
import { matchClassFilter, type ClassFilter } from "../../utils/productClassify";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
// T-CSS Phase 2 · 2026-08-06
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { StatusPill } from "../common/StatusPill";
import { AccentBar } from "../common/AccentBar";
// 2026-08-23 · #185 · PageToolbar 프리미티브 통일
import { PageToolbar } from "../common/PageToolbar";
import { InlineLabel } from "../common/InlineLabel";
// 2026-10-06 · 월 멀티선택 공통 컴포넌트
import { MonthToggleSelector } from "../common/MonthToggleSelector";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";
// 2026-08-21 · Framework Phase 3 · fetch → apiClient
import { api } from "../../lib/apiClient";
// 2026-09-18 · 사용자 지시 · (주)·주식회사 표시 정제
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { useToast, toastClass } from "../../hooks/useToast";

// ─── 타입 ───────────────────────────────────────────────────────────────────
interface TrendingRow {
  product_code: string;
  // 2026-10-06 · fallback 금지 (DB 연동 우선) · products.product_name NULL 시 null 유지
  product_name: string | null;
  supplier: string | null;
  recent_sale: number;
  prior_sale: number;
  growth_rate: number | null;
  // 2026-10-06 · 사용자 지시 · absolute_delta → delta rename · 별도 개념 제거
  delta: number;
  newly_trending: boolean;
  current_stock: number;
  optimal_stock: number;
  sale_price: number;
  below_optimal: boolean;
}

interface PeriodBucketRow {
  product_code: string;
  // 2026-10-06 · fallback 금지 (DB 연동 우선) · products.product_name NULL 시 null 유지
  product_name: string | null;
  supplier: string | null;
  recent_sale: number;
  prior_sale: number;
  growth_rate: number | null;
  delta: number;
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
  if (sortKey !== k) return <ArrowUpDown size={10} className="text-zinc-300 ml-1 inline-block align-middle" />;
  return sortDir === "asc"
    ? <ArrowUp size={10} className="text-indigo-500 ml-1 inline-block align-middle" />
    : <ArrowDown size={10} className="text-indigo-500 ml-1 inline-block align-middle" />;
};

// ─── PeriodBucketCard ────────────────────────────────────────────────────────
const PeriodBucketCard: React.FC<{
  bucket: PeriodBucket;
  onProductClick?: (p: ProductRef) => void;
}> = ({ bucket, onProductClick }) => {
  const fmt = (n: number) => n.toLocaleString();
  return (
    <div className={`${CARD_BASE} overflow-hidden flex flex-col`}>
      {/* 2026-08-17 · 뉴트럴 헤더 + accent bar · 딥네이비 통일 */}
      <div className="px-4 py-3 bg-zinc-50/60 border-b border-line flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <AccentBar className="shrink-0" />
            <span className="text-[16px] font-bold text-ink tracking-tight">{bucket.label}</span>
            <span className="text-[15px] text-ink-soft">({bucket.sublabel})</span>
            {!bucket.loading && !bucket.error && (
              <StatusPill tone="indigo" size="md">{bucket.total}건</StatusPill>
            )}
          </div>
          <div className="text-[15px] text-ink-soft mt-0.5 font-medium">{bucket.vsLabel}</div>
        </div>
      </div>
      {bucket.loading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-zinc-400">
          <Spinner size={20} tone="sky" />
          <span className="text-[17px]">불러오는 중...</span>
        </div>
      ) : bucket.error ? (
        <div className="flex items-center justify-center py-8 text-[17px] text-rose-400 gap-1.5">
          <AlertTriangle size={14} />
          <span>데이터 로드 실패</span>
        </div>
      ) : bucket.rows.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-[17px] text-zinc-400 gap-1.5">
          <TrendingUp size={14} className="opacity-30" />
          <span>급상승 상품 없음</span>
        </div>
      ) : (
        <ol className="divide-y divide-zinc-50">
          {bucket.rows.map((r, i) => (
            <li key={r.product_code} className="flex items-start gap-2 px-4 py-2.5 hover:bg-indigo-50/20 transition">
              <span className="text-[17px] font-semibold text-zinc-400 tabular-nums w-4 shrink-0 mt-0.5">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onProductClick?.({ code: r.product_code, name: r.product_name ?? undefined })}
                    className="text-[16px] font-semibold text-zinc-700 hover:text-indigo-700 hover:underline text-left break-words cursor-pointer transition"
                  >
                    {r.product_name}
                  </button>
                  {r.newly_trending && (
                    <span className="text-[16px] font-semibold text-indigo-700 bg-indigo-100 border border-indigo-200 rounded px-1.5 py-0.5 shrink-0">신규</span>
                  )}
                </div>
                {r.supplier && <div className="text-[16px] text-zinc-400 mt-0.5">{displayVendorName(r.supplier) || r.supplier}</div>}
                <div className="flex items-center gap-2 mt-1 flex-wrap text-[17px] tabular-nums">
                  <span className="font-semibold text-indigo-700">현재 {fmt(r.recent_sale)}</span>
                  <span className="text-zinc-300">·</span>
                  <span className="text-zinc-400">이전 {fmt(r.prior_sale)}</span>
                  <span className="text-zinc-300">·</span>
                  <span className={`font-bold ${r.delta > 0 ? "text-indigo-600" : r.delta < 0 ? "text-rose-500" : "text-zinc-400"}`}>
                    {r.delta > 0 ? `+${fmt(r.delta)}` : fmt(r.delta)}
                  </span>
                  <span className="text-zinc-300">·</span>
                  <span className={`font-semibold ${r.newly_trending ? "text-indigo-600" : (r.growth_rate ?? 0) > 0 ? "text-indigo-500" : "text-zinc-400"}`}>
                    {r.newly_trending ? "NEW" : r.growth_rate != null ? `${r.growth_rate > 0 ? "+" : ""}${r.growth_rate}%` : "-"}
                  </span>
                  {r.current_stock > 0 && (
                    <>
                      <span className="text-zinc-300">·</span>
                      <span className="text-zinc-400">재고 {fmt(r.current_stock)}</span>
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
  onProductClick?: (p: ProductRef) => void;
}> = ({ title, icon, buckets, onProductClick }) => {
  return (
    <div className="flex flex-col gap-3">
      {/* 2026-08-17 · accent bar + 딥네이비 통일 */}
      <div className="flex items-center gap-2.5 px-1">
        <AccentBar className="shrink-0" />
        <span className="text-brand-deep shrink-0">{icon}</span>
        <span className="text-[16px] font-bold text-ink tracking-tight">{title}</span>
        <div className="flex-1 h-px bg-line" />
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
export const TrendingTab: React.FC = () => {
  const { openProduct, modalElement } = useProductDetailModal();
  const { toast, showError } = useToast();
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
  // 2026-10-06 · 사용자 지시 · days window → 월 멀티선택 전환 · default = 현재월
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => {
    const d = new Date();
    return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`];
  });
  const monthsListParamStr = useMemo(
    () => [...selectedMonths].sort((a, b) => a.localeCompare(b)).join(","),
    [selectedMonths],
  );
  const [meta, setMeta] = useState<{ recent_months: string[]; prior_months: string[]; recent_from: string; prior_from: string; total: number } | null>(null);
  // 상비약/일반약/전체 3-way 필터 (localStorage 저장) · 기본값: 상비약
  const [classFilter, setClassFilter] = useState<ClassFilter>(() => {
    try {
      const v = localStorage.getItem(SK_TRENDING_CLASSFILTER);
      return v === "stationery" || v === "general" || v === "all" ? v : "stationery";
    } catch { return "stationery"; }
  });
  useEffect(() => { try { localStorage.setItem(SK_TRENDING_CLASSFILTER, classFilter); } catch { /**/ } }, [classFilter]);
  // 2026-08-31 · #13 · location 우선 · real_map fallback · resolveProductLocation
  const [productRealMapById, setProductRealMapById] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    getProductsMap().then(map => {
      if (!alive) return;
      const m: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(map)) m[k] = resolveProductLocation(v);
      setProductRealMapById(m);
    }).catch(() => { /* 캐시 없으면 필터 미분류 처리 */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!monthsListParamStr) return;
    setLoading(true);
    // 2026-10-06 · 사용자 지시 · 월 멀티선택 (months_list) 서버 전달
    api.get<{ rows?: TrendingRow[]; recent_months?: string[]; prior_months?: string[]; recent_from?: string; prior_from?: string; total?: number }>(`/api/stock-manage/trending?months_list=${encodeURIComponent(monthsListParamStr)}&limit=1000`)
      .then(({ data: j }) => {
        setRows(Array.isArray(j?.rows) ? j.rows : []);
        setMeta({
          recent_months: Array.isArray(j?.recent_months) ? j.recent_months : [],
          prior_months:  Array.isArray(j?.prior_months)  ? j.prior_months  : [],
          recent_from:   j?.recent_from ?? "",
          prior_from:    j?.prior_from  ?? "",
          total:         Number(j?.total ?? 0),
        });
      })
      .catch((e: any) => { setRows([]); setMeta(null); showError(`급상승 로드 실패: ${e?.message ?? "네트워크 오류"}`); })
      .finally(() => setLoading(false));
  }, [monthsListParamStr, showError]);

  // classFilter 를 제외한 기타 조건이 적용된 base list (탭 카운트 계산용)
  const baseFiltered = rows;

  // 3-way tab 카운트 (상비약/일반약/전체)
  const essentialCount = useMemo(() =>
    baseFiltered.filter(r => matchClassFilter(productRealMapById[String(r.product_code)] ?? null, "stationery")).length,
    [baseFiltered, productRealMapById]);
  const generalCount = useMemo(() =>
    baseFiltered.filter(r => matchClassFilter(productRealMapById[String(r.product_code)] ?? null, "general")).length,
    [baseFiltered, productRealMapById]);
  const allCount = rows.length;

  // classFilter 적용된 최종 필터링 리스트 (정렬 전)
  const filtered = useMemo(() => {
    if (classFilter === "all") return rows;
    return rows.filter(r => matchClassFilter(productRealMapById[String(r.product_code)] ?? null, classFilter));
  }, [rows, classFilter, productRealMapById]);

  // 2026-10-06 · 사용자 지시 · default sort = delta desc > growth desc > recent desc
  //   · 서버와 동일 정렬 · 클라이언트가 recent desc 로 override 하지 않음
  //   · newly_trending 은 최상단 강제 X · badge/상태 표시만
  type SortKey = "delta" | "recent" | "growth" | "name" | "prior" | "current" | "optimal";
  const sortComparators = useMemo<Record<SortKey, Comparator<TrendingRow>>>(() => ({
    // delta: tiebreak with growth, then recent (서버 default 와 동일)
    delta:   (a, b) => {
      if (a.delta !== b.delta) return a.delta - b.delta;
      const ga = a.growth_rate ?? -1;
      const gb = b.growth_rate ?? -1;
      if (ga !== gb) return ga - gb;
      return a.recent_sale - b.recent_sale;
    },
    recent:  (a, b) => a.recent_sale - b.recent_sale,
    // growth: 성장률 asc (desc 클릭 시 큰 순) · newly 상단 강제 로직 제거
    growth:  (a, b) => (a.growth_rate ?? -999999) - (b.growth_rate ?? -999999),
    name:    (a, b) => (a.product_name ?? "").localeCompare(b.product_name ?? "", "ko"),
    prior:   (a, b) => a.prior_sale - b.prior_sale,
    current: (a, b) => a.current_stock - b.current_stock,
    optimal: (a, b) => a.optimal_stock - b.optimal_stock,
  }), []);
  const { sorted: displayed, sortKey, sortDir, toggleSort, setSort } =
    useSortableTable<TrendingRow, SortKey>(filtered, "delta", sortComparators, "desc");

  const fmt = (n: number) => n.toLocaleString();

  return (
    <>
    {toast && (
      <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
    )}
    <div className="flex flex-col gap-2">
      {/* 2026-08-23 · #185 · PageToolbar 프리미티브 통일 (CategoryTab 등 통계 서브탭 동일 패턴) */}
      <PageToolbar
        icon={<TrendingUp size={16} />}
        title="판매 급상승"
        count={meta?.total}
        leftSlot={
          <span className="text-[17px] text-ink-soft hidden sm:block">
            {meta && meta.recent_months.length > 0
              ? `선택 월 [${meta.recent_months.join(", ")}] vs 직전 [${meta.prior_months.join(", ")}] 판매 비교`
              : "월 선택 vs 직전 동일 개월 판매 비교"}
          </span>
        }
        right={
          <button
            type="button"
            onClick={() => {
              if (!monthsListParamStr) return;
              setLoading(true);
              api.get<{ rows?: TrendingRow[]; recent_months?: string[]; prior_months?: string[]; recent_from?: string; prior_from?: string; total?: number }>(`/api/stock-manage/trending?months_list=${encodeURIComponent(monthsListParamStr)}&limit=1000`)
                .then(({ data: j }) => {
                  setRows(Array.isArray(j?.rows) ? j.rows : []);
                  setMeta({
                    recent_months: Array.isArray(j?.recent_months) ? j.recent_months : [],
                    prior_months:  Array.isArray(j?.prior_months)  ? j.prior_months  : [],
                    recent_from:   j?.recent_from ?? "",
                    prior_from:    j?.prior_from  ?? "",
                    total:         Number(j?.total ?? 0),
                  });
                })
                .catch((e: any) => { setRows([]); setMeta(null); showError(`새로고침 실패: ${e?.message ?? "네트워크 오류"}`); })
                .finally(() => setLoading(false));
            }}
            disabled={loading}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-brand-tint hover:border-brand-deep text-ink-soft hover:text-brand-deep transition-colors disabled:opacity-40 cursor-pointer"
            title="새로고침"
          >
            {loading ? <Spinner size={14} tone="zinc" /> : <RefreshCw size={14} />}
          </button>
        }
      />

      {/* ── 카드: 컨트롤 ── */}
      <div className={`${CARD_BASE} overflow-hidden`}>
        {/* 2026-08-17 · 컨트롤 · 공용 FilterSortBar 톤 · accent bar + segmented pill · 딥네이비 */}
        <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap border-b border-line bg-white">
          {/* 비교 월 · 2026-10-06 · days window → 월 멀티선택 · 비연속 지원 · minOne (최소 1개월) */}
          <InlineLabel>비교 월</InlineLabel>
          <MonthToggleSelector
            selectedMonths={selectedMonths}
            onChange={setSelectedMonths}
            maxMonths={6}
            minOne
            ariaLabel="급상승 비교 월 선택"
          />
          <InlineLabel>정렬</InlineLabel>
          <div className="inline-flex bg-zinc-100 border border-line rounded-lg p-1 gap-0.5">
            {([
              // 2026-10-06 · 사용자 지시 · default = delta · 서버 정렬과 동일
              { k: "delta" as const,  label: "증가량" },
              { k: "growth" as const, label: "성장률" },
              { k: "recent" as const, label: "최근판매" },
            ]).map(o => (
              <button key={o.k} onClick={() => setSort(o.k, "desc")}
                className={`h-7 px-2.5 text-[16px] font-semibold rounded-md transition-colors cursor-pointer ${sortKey === o.k ? "bg-brand-deep text-white shadow-sm" : "text-ink hover:text-brand-deep hover:bg-white"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 테이블 카드 ── */}
      <div className={`${CARD_BASE} overflow-hidden`}>
        {/* 상비약/일반약/전체 3-way 필터 (좌측 리스트 상단) */}
        <div className="flex items-center gap-1 border-b-2 border-line bg-white px-2 pt-1">
          <button type="button" onClick={() => setClassFilter("stationery")}
            className={`relative px-4 py-2 ${TEXT.body} font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "stationery" ? "text-violet-700" : "text-zinc-400 hover:text-zinc-600"}`}>
            상비약 <span className={`${TEXT.caption} text-zinc-400 ml-1 tabular-nums`}>({essentialCount})</span>
            {classFilter === "stationery" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-violet-500" />}
          </button>
          <button type="button" onClick={() => setClassFilter("general")}
            className={`relative px-4 py-2 ${TEXT.body} font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "general" ? "text-sky-700" : "text-zinc-400 hover:text-zinc-600"}`}>
            일반약 <span className={`${TEXT.caption} text-zinc-400 ml-1 tabular-nums`}>({generalCount})</span>
            {classFilter === "general" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-sky-500" />}
          </button>
          <button type="button" onClick={() => setClassFilter("all")}
            className={`relative px-4 py-2 ${TEXT.body} font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "all" ? "text-zinc-800" : "text-zinc-400 hover:text-zinc-600"}`}>
            전체 <span className={`${TEXT.caption} text-zinc-400 ml-1 tabular-nums`}>({allCount})</span>
            {classFilter === "all" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-zinc-500" />}
          </button>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-zinc-400">
            <Spinner size={36} tone="sky" />
            <span className="text-[16px] font-semibold">불러오는 중...</span>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2 text-zinc-400">
            <TrendingUp size={28} className="opacity-20" />
            <div className="text-[16px] font-semibold">급상승 상품 없음</div>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-[16px]" style={{ tableLayout: "fixed" }}>
              {/* 2026-08-24 · v3 확산 · 그룹 헤더 제거 · 서브헤더만 · bg zinc-100/70 · Attio 톤 */}
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line text-[15px] sm:text-[16px] font-bold text-zinc-500 uppercase tracking-wider bg-zinc-100/70">
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
                    선택월<SortIcon k="recent" sortKey={sortKey} sortDir={sortDir} />
                    <span {...resizerProps("recent")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th
                    onClick={() => toggleSort("prior")}
                    title="이전 판매 정렬"
                    className="relative text-right px-2 py-1.5 bg-indigo-50/30 text-indigo-500 cursor-pointer select-none hover:bg-indigo-100/60 transition"
                    style={{ width: getWidth("prior"), minWidth: getWidth("prior") }}
                  >
                    직전월<SortIcon k="prior" sortKey={sortKey} sortDir={sortDir} />
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
                    className="relative text-right px-2 py-1.5 text-zinc-500 cursor-pointer select-none hover:bg-zinc-100/60 transition"
                    style={{ width: getWidth("current"), minWidth: getWidth("current") }}
                  >
                    현재고<SortIcon k="current" sortKey={sortKey} sortDir={sortDir} />
                    <span {...resizerProps("current")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th
                    onClick={() => toggleSort("optimal")}
                    title="적정재고 정렬"
                    className="relative text-right px-2 py-1.5 text-zinc-400 cursor-pointer select-none hover:bg-zinc-100/60 transition"
                    style={{ width: getWidth("optimal"), minWidth: getWidth("optimal") }}
                  >
                    적정<SortIcon k="optimal" sortKey={sortKey} sortDir={sortDir} />
                    <span {...resizerProps("optimal")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {displayed.map((r, i) => (
                  <tr key={r.product_code} className={`hover:bg-indigo-50/20 transition ${r.newly_trending ? "bg-indigo-50/10" : ""}`}>
                    <td className="text-center px-2 py-2 text-[17px] font-medium text-zinc-400 tabular-nums align-top">{i + 1}</td>
                    <td className="text-left px-2 py-2 align-top">
                      <button onClick={() => openProduct({ code: r.product_code, name: r.product_name ?? undefined })}
                        className="text-left text-[16px] font-semibold text-zinc-700 hover:text-indigo-700 hover:underline break-words whitespace-normal leading-snug cursor-pointer transition">
                        {r.product_name}
                      </button>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {r.supplier && <span className="text-[16px] text-zinc-400">{displayVendorName(r.supplier) || r.supplier}</span>}
                        {r.newly_trending && (
                          <span className="text-[16px] font-semibold text-indigo-700 bg-indigo-100 border border-indigo-200 rounded px-1.5 py-0.5">신규진입</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right px-2 py-2 text-[16px] font-semibold text-indigo-700 tabular-nums align-top bg-indigo-50/30">{fmt(r.recent_sale)}</td>
                    <td className="text-right px-2 py-2 text-[16px] font-medium text-zinc-400 tabular-nums align-top bg-indigo-50/10">{fmt(r.prior_sale)}</td>
                    <td className={`text-right px-2 py-2 text-[16px] font-bold tabular-nums align-top bg-indigo-50/40 ${r.newly_trending ? "text-indigo-600" :
                      (r.growth_rate ?? 0) >= 50 ? "text-indigo-700" :
                        (r.growth_rate ?? 0) > 0 ? "text-indigo-600" :
                          "text-zinc-400"
                      }`}>
                      {r.newly_trending ? "NEW" : r.growth_rate != null ? `${r.growth_rate > 0 ? "+" : ""}${r.growth_rate}%` : "-"}
                    </td>
                    <td className={`text-right px-2 py-2 text-[16px] font-semibold tabular-nums align-top bg-indigo-50/20 ${r.delta > 0 ? "text-indigo-600" : r.delta < 0 ? "text-rose-500" : "text-zinc-400"}`}>
                      {r.delta > 0 ? `+${fmt(r.delta)}` : fmt(r.delta)}
                    </td>
                    <td className={`text-right px-2 py-2 text-[16px] font-semibold tabular-nums align-top ${r.below_optimal ? "text-rose-500" : "text-zinc-600"}`}
                      title={r.below_optimal ? `현재고 부족 · ${r.current_stock} < 적정 ${r.optimal_stock}` : ""}>
                      {fmt(r.current_stock)}
                    </td>
                    <td className="text-right px-2 py-2 text-[14px] font-medium text-zinc-400 tabular-nums align-top">{r.optimal_stock > 0 ? fmt(r.optimal_stock) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    {modalElement}
    </>
  );
};
