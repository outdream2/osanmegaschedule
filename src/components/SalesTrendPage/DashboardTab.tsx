// src/components/SalesTrendPage/DashboardTab.tsx
// 2026-08-31 · #36 B안 · 판매대시보드 탭 (신규)
//   · 상단 · KPI 카드 (판매액·판매수량·상품수·손실률·평균이익률)
//   · 중앙 · 재고흐름 테이블 (top-sales · 판매액/수량/손실/재고 정렬)
//   · 우측 · 상품 상세 슬롯 (SplitPanel 좌우 분할 · 데스크톱)
//   · 기간 필터 · PeriodSelector + SeasonButtons (프레임워크 통일)
//   · 엔드포인트 · /api/stock-manage/top-sales (기존 재사용)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, TrendingUp, Package, AlertTriangle, Percent, DollarSign,
  Boxes,
} from "lucide-react";
import { Card } from "../common/Card";
import { KpiCard } from "../common/KpiCard";
import { SearchBar } from "../common/SearchBar";
import { SeasonButtons } from "../common/SeasonButtons";
import { StatusPill } from "../common/StatusPill";
import { PeriodSelector, type PeriodOption } from "../common/PeriodSelector";
import { LoadingState } from "../common/LoadingState";
import { EmptyState } from "../common/EmptyState";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { fmtWon } from "../../lib/format";
import { matchesProductQuery } from "../../lib/productMatch";
import { api } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { API_LIMITS } from "../../constants/apiLimits";
import { getProductsMap, lookupProduct, type ProductInfo } from "../../lib/productsCache";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { calcLoss, type StockFlowRow } from "./StockFlowPanel";
import { fmt } from "./SalesTrendPage.helpers";

// ─── 정렬 키 ────────────────────────────────────────────────────────────────
type DashSortKey =
  | "name"
  | "sale_qty"
  | "sale_amount"     // sale_price · 서버 sort=amount 매핑
  | "closing_stock"   // 종료재고 · 서버 sort=closing
  | "loss"            // 클라이언트 계산
  | "profit_rate";    // 클라이언트 계산
type DashSortDir = "asc" | "desc";

// 서버 지원 정렬 컬럼만 서버에서 처리 · 나머지는 클라이언트 정렬
const SERVER_SORT_KEYS: DashSortKey[] = ["sale_qty", "sale_amount", "closing_stock"];
const toServerSort = (k: DashSortKey): string => {
  if (k === "sale_qty") return "sale";
  if (k === "sale_amount") return "amount";
  if (k === "closing_stock") return "closing";
  return "sale";
};

// ─── 기간 프리셋 · PeriodSelector 옵션 ─────────────────────────────────────
const PERIOD_OPTIONS: readonly PeriodOption<0 | 1 | 2 | 3 | 6>[] = [
  { value: 0, label: "10일", title: "최근 스냅샷 (10일 스냅)" },
  { value: 1, label: "1개월" },
  { value: 2, label: "2개월" },
  { value: 3, label: "3개월" },
  { value: 6, label: "6개월" },
] as const;

// ─── KPI 계산 ────────────────────────────────────────────────────────────────
interface DashboardKpis {
  totalSaleAmount: number;   // 판매액 합계 (수량 × 단가 근사)
  totalSaleQty: number;      // 판매수량 합계
  productCount: number;      // 판매 상품 수 (sale_qty > 0)
  totalLossQty: number;      // 손실 합계 (양수만 · calcLoss > 0)
  lossRatePct: number;       // 손실률 = 손실 합계 / 판매수량 합계 × 100
  avgProfitRatePct: number;  // 평균 이익률 (판매가/사입가 있는 상품 대상 · 판매수량 가중)
}

const computeKpis = (rows: StockFlowRow[]): DashboardKpis => {
  let totalSaleAmount = 0;
  let totalSaleQty = 0;
  let productCount = 0;
  let totalLossQty = 0;
  let profitRateWeightedSum = 0;
  let profitRateWeight = 0;

  for (const r of rows) {
    const saleQty = Number(r.sale_qty ?? 0) || 0;
    const salePrice = Number(r.sale_price ?? 0) || 0;
    const purchasePrice = Number((r as any).purchase_price ?? 0) || 0;
    const loss = calcLoss(r);

    if (saleQty > 0) {
      productCount += 1;
      totalSaleQty += saleQty;
      if (salePrice > 0) totalSaleAmount += saleQty * salePrice;
    }
    if (loss > 0) totalLossQty += loss;
    if (saleQty > 0 && salePrice > 0 && purchasePrice > 0) {
      const rate = ((salePrice - purchasePrice) / salePrice) * 100;
      if (Number.isFinite(rate)) {
        profitRateWeightedSum += rate * saleQty;
        profitRateWeight += saleQty;
      }
    }
  }

  const lossRatePct = totalSaleQty > 0
    ? (totalLossQty / totalSaleQty) * 100
    : 0;
  const avgProfitRatePct = profitRateWeight > 0
    ? profitRateWeightedSum / profitRateWeight
    : 0;

  return {
    totalSaleAmount,
    totalSaleQty,
    productCount,
    totalLossQty,
    lossRatePct,
    avgProfitRatePct,
  };
};

// ─── 재고흐름 API 응답 · 자동 확장 상태 ─────────────────────────────────────
interface AutoExpanded {
  requested: number;
  effective: number;
  latestSnapshot: string | null;
}

// ─── 정렬 화살표 ────────────────────────────────────────────────────────────
const arrow = (k: DashSortKey, current: DashSortKey, dir: DashSortDir) =>
  k !== current ? " ⇅" : dir === "desc" ? " ▼" : " ▲";

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────
export const DashboardTab: React.FC = () => {
  const { toast, showError } = useToast();

  // 기간 · 계절
  const [months, setMonths] = useState<0 | 1 | 2 | 3 | 6>(1);
  const [season, setSeason] = useState<SeasonKey | null>(null);

  // 리스트 · 정렬 · 검색
  const [rows, setRows] = useState<StockFlowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<DashSortKey>("sale_qty");
  const [dir, setDir] = useState<DashSortDir>("desc");
  const [limit, setLimit] = useState<number>(300);
  const [query, setQuery] = useState("");
  const [snapshot, setSnapshot] = useState<string>("");
  const [autoExpanded, setAutoExpanded] = useState<AutoExpanded | null>(null);

  // 선택된 상품 (우측 상세 패널)
  const [selected, setSelected] = useState<ProductInfo | null>(null);

  // 좌우 분할 폭 (SplitPanel resize)
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem("megatown_dashboard_left_w"));
      return Number.isFinite(v) && v > 0 ? v : 780;
    } catch { return 780; }
  });
  useEffect(() => {
    try { localStorage.setItem("megatown_dashboard_left_w", String(leftWidth)); } catch { /**/ }
  }, [leftWidth]);
  const leftWidthRef = useRef(leftWidth);
  useEffect(() => { leftWidthRef.current = leftWidth; }, [leftWidth]);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startW: leftWidthRef.current };
    const move = (ev: MouseEvent) => {
      const r = resizeRef.current; if (!r) return;
      setLeftWidth(Math.min(1100, Math.max(480, r.startW + (ev.clientX - r.startX))));
    };
    const up = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ─── 데이터 로드 ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const serverSort = SERVER_SORT_KEYS.includes(sort) ? toServerSort(sort) : "sale";
        const buildParams = (m: number) => {
          const p = new URLSearchParams({
            sort: serverSort,
            dir,
            limit: String(limit),
          });
          if (season) p.set("season", season);
          else if (m > 0) p.set("months", String(m));
          return p;
        };
        const fetchOnce = (m: number) =>
          api.get<any>(`/api/stock-manage/top-sales?${buildParams(m)}`);

        let { data: j } = await fetchOnce(months);
        let effectiveMonths: number = months;
        const initialCount = Array.isArray(j?.rows) ? j.rows.length : 0;

        // stock_history 스냅샷 stale 대비 · 자동 확장 (StockFlowPanel 동일 패턴)
        if (initialCount === 0 && !season && months > 0 && months < 12) {
          for (const nextM of [2, 3, 6, 12].filter(x => x > months)) {
            try {
              const resp = await fetchOnce(nextM);
              if (Array.isArray(resp.data?.rows) && resp.data.rows.length > 0) {
                j = resp.data;
                effectiveMonths = nextM;
                break;
              }
            } catch { /* 다음 시도 */ }
          }
        }

        if (cancelled) return;
        setRows(Array.isArray(j?.rows) ? j.rows : []);
        if (j?.snapshot_date) setSnapshot(j.snapshot_date);
        if (effectiveMonths !== months) {
          setAutoExpanded({
            requested: months,
            effective: effectiveMonths,
            latestSnapshot: j?.snapshot_date ?? null,
          });
        } else {
          setAutoExpanded(null);
        }
      } catch (err) {
        if (cancelled) return;
        setAutoExpanded(null);
        showError(`판매 대시보드 로드 실패: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, dir, limit, months, season]);

  // ─── 표시 데이터 · 필터 + 클라 정렬 (loss · profit_rate · name) ─────────
  const displayRows = useMemo(() => {
    const q = query.trim();
    let filtered = rows.filter(p => {
      if (q && !matchesProductQuery(p as any, q)) return false;
      return true;
    });
    const sign = dir === "asc" ? 1 : -1;
    if (sort === "loss") {
      filtered = [...filtered].sort((a, b) => sign * (calcLoss(a) - calcLoss(b)));
    } else if (sort === "name") {
      filtered = [...filtered].sort((a, b) =>
        sign * String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko"));
    } else if (sort === "profit_rate") {
      const rate = (r: any) => {
        const sp = Number(r.sale_price ?? 0);
        const pp = Number(r.purchase_price ?? 0);
        return sp > 0 && pp > 0 ? (sp - pp) / sp : -Infinity;
      };
      filtered = [...filtered].sort((a, b) => sign * (rate(a) - rate(b)));
    }
    // 서버 정렬 키는 이미 서버에서 정렬됨 (재정렬 불필요)
    return filtered;
  }, [rows, sort, dir, query]);

  // ─── KPI 계산 (전체 rows 기준 · 필터/정렬 무관하게 스냅샷 요약) ─────────
  const kpis = useMemo(() => computeKpis(rows), [rows]);

  // ─── 상품 클릭 · 상세 로드 ──────────────────────────────────────────────
  const onProductClick = useCallback(async (p: StockFlowRow) => {
    const code = String(p.product_code ?? "").trim();
    if (!code) return;
    const partial: ProductInfo = {
      code,
      name: String(p.product_name ?? ""),
      spec: String(p.spec ?? ""),
      current_stock: p.current_stock ?? null,
      optimal_stock: p.optimal_stock ?? null,
      supplier: p.supplier ?? null,
      location: (p as any).location ?? (p as any).real_map ?? null,
      real_map: (p as any).real_map ?? null,
    };
    setSelected(partial);
    try {
      let full = lookupProduct(code);
      if (!full) {
        const map = await getProductsMap();
        full = map[code] ?? map[code.replace(/^0+/, "")] ?? null;
      }
      if (full) {
        setSelected(prev => {
          if (!prev || prev.code !== code) return prev;
          const overlay: Record<string, any> = {};
          for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) overlay[k] = v;
          return { ...full, ...overlay, code, name: full.name || prev.name };
        });
      }
    } catch { /* 캐시 실패 시 partial 유지 */ }
  }, []);

  const toggleSort = (k: DashSortKey) => {
    if (sort === k) setDir(d => (d === "desc" ? "asc" : "desc"));
    else { setSort(k); setDir("desc"); }
  };

  // ─── 렌더 ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}

      {/* ── 상단 · 헤더 · 기간 필터 ─────────────────────────────────────── */}
      <Card className="p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <BarChart3 size={18} className="text-brand-deep shrink-0" />
          <span className={`${TEXT.section} text-ink`}>판매 대시보드</span>
          {snapshot && (
            <StatusPill tone="sky" size="xs">스냅샷 {snapshot}</StatusPill>
          )}
          {autoExpanded && (
            <StatusPill tone="amber" size="xs">
              {autoExpanded.requested}개월 → {autoExpanded.effective}개월 자동확장
            </StatusPill>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`${TEXT.caption} text-ink-soft shrink-0`}>기간</span>
          <PeriodSelector
            options={PERIOD_OPTIONS}
            value={months}
            onChange={(v) => { setMonths(v); setSeason(null); }}
            accent="teal"
            size="sm"
            ariaLabel="판매 대시보드 기간 선택"
          />
          <SeasonButtons
            value={season}
            onChange={(v) => { setSeason(v); if (v) setMonths(0); }}
            size="sm"
            hideLabel
          />
          <div className="ml-auto flex items-center gap-2">
            <span className={`${TEXT.caption} text-ink-soft`}>상위</span>
            <div className="inline-flex bg-zinc-100 rounded-md p-0.5">
              {[100, 300, 1000, 2000, 50000].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setLimit(n)}
                  className={`px-2 py-1 text-[12px] font-bold rounded transition ${
                    limit === n
                      ? "bg-white text-brand-deep shadow-sm ring-1 ring-zinc-200"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  {n === 50000 ? "전체" : `Top ${n}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ── KPI 카드 그리드 ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <KpiCard
          icon={DollarSign}
          label="판매액"
          value={fmtWon(kpis.totalSaleAmount)}
          tone="teal"
          hint={`${fmt(kpis.totalSaleQty)}개 판매`}
        />
        <KpiCard
          icon={TrendingUp}
          label="판매수량"
          value={fmt(kpis.totalSaleQty)}
          unit="개"
          tone="sky"
          hint={`${fmt(kpis.productCount)}개 상품`}
        />
        <KpiCard
          icon={Package}
          label="판매 상품수"
          value={fmt(kpis.productCount)}
          unit="종"
          tone="violet"
          hint="판매 발생 상품 수"
        />
        <KpiCard
          icon={AlertTriangle}
          label="손실 합계"
          value={fmt(kpis.totalLossQty)}
          unit="개"
          tone="rose"
          hint={`손실률 ${kpis.lossRatePct.toFixed(1)}%`}
        />
        <KpiCard
          icon={Percent}
          label="평균 이익률"
          value={`${kpis.avgProfitRatePct.toFixed(1)}%`}
          tone="emerald"
          hint="판매수량 가중 평균"
        />
      </div>

      {/* ── 좌 · 재고흐름 테이블 · 우 · 상품 상세 ───────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-2 items-stretch lg:min-h-[560px]">
        {/* 좌 · 리스트 */}
        <div
          className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-2"
          style={{
            width:
              typeof window !== "undefined" && window.innerWidth >= 1024
                ? leftWidth
                : undefined,
          }}
        >
          <div className={`${CARD_BASE} flex flex-col overflow-hidden relative`}>
            <span
              aria-hidden
              className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-10"
            />
            {/* 검색 바 · 상단 필수 (SplitListPanel 원칙 참조) */}
            <div className="px-3 py-2 border-b border-zinc-100">
              <SearchBar
                value={query}
                onChange={setQuery}
                placeholder={
                  limit >= 50000
                    ? "전체 상품 검색"
                    : "TOP 리스트 내 검색"
                }
                resultCount={displayRows.length}
                historyKey="megatown_dashboard_search"
                accent="indigo"
                widthClass="w-full"
              />
            </div>

            <div className="relative flex-1 min-h-0 overflow-auto max-h-[60vh]">
              {loading && displayRows.length > 0 && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-[1px] pointer-events-none">
                  <LoadingState tone="slate" size="compact" label="데이터 로딩중..." />
                </div>
              )}
              {displayRows.length === 0 && loading ? (
                <LoadingState tone="slate" size="compact" label="데이터 로딩중..." />
              ) : displayRows.length === 0 && !loading ? (
                <EmptyState
                  icon={Boxes}
                  title={rows.length === 0 ? "판매 데이터 없음" : "해당 상품 없음"}
                  hint={
                    rows.length === 0
                      ? "선택 기간의 재고 스냅샷이 없습니다. 재고관리 화면에서 스냅샷을 임포트해 주세요."
                      : "검색어에 해당하는 상품이 없습니다"
                  }
                  size="compact"
                />
              ) : (
                <table
                  className={`w-full text-[13px] ${loading ? "opacity-40 transition-opacity" : ""}`}
                >
                  <thead className="sticky top-0 bg-zinc-50 border-b-2 border-line z-10 shadow-sm">
                    <tr className="text-[12px] text-zinc-500 uppercase tracking-wider">
                      <th className="text-left px-1 py-1.5 w-8">#</th>
                      <th
                        onClick={() => toggleSort("name")}
                        className={`text-left px-2 py-1.5 min-w-[140px] cursor-pointer select-none hover:bg-zinc-100 ${
                          sort === "name" ? "text-zinc-800 font-bold" : ""
                        }`}
                      >
                        상품명{arrow("name", sort, dir)}
                      </th>
                      <th
                        onClick={() => toggleSort("sale_qty")}
                        className={`text-right px-1 py-1.5 w-16 cursor-pointer select-none hover:bg-orange-100 bg-orange-50/60 ${
                          sort === "sale_qty" ? "text-orange-700 font-bold" : "text-orange-500"
                        }`}
                      >
                        판매{arrow("sale_qty", sort, dir)}
                      </th>
                      <th
                        onClick={() => toggleSort("sale_amount")}
                        className={`text-right px-1 py-1.5 w-20 cursor-pointer select-none hover:bg-indigo-100 bg-indigo-50/60 ${
                          sort === "sale_amount" ? "text-indigo-700 font-bold" : "text-indigo-500"
                        }`}
                        title="판매가 기준 (products.sale_price)"
                      >
                        판매가{arrow("sale_amount", sort, dir)}
                      </th>
                      <th
                        onClick={() => toggleSort("profit_rate")}
                        className={`text-right px-1 py-1.5 w-16 cursor-pointer select-none hover:bg-emerald-100 bg-emerald-50/60 ${
                          sort === "profit_rate"
                            ? "text-emerald-800 font-bold"
                            : "text-emerald-600"
                        }`}
                        title="(판매가 − 사입가) / 판매가 × 100"
                      >
                        이익률{arrow("profit_rate", sort, dir)}
                      </th>
                      <th
                        onClick={() => toggleSort("loss")}
                        className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-rose-100 bg-rose-50/60 ${
                          sort === "loss" ? "text-rose-700 font-bold" : "text-rose-500"
                        }`}
                        title="(시작재고 − 판매) − 종료재고"
                      >
                        손실{arrow("loss", sort, dir)}
                      </th>
                      <th
                        onClick={() => toggleSort("closing_stock")}
                        className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-zinc-100 bg-zinc-50/60 ${
                          sort === "closing_stock" ? "text-zinc-800 font-bold" : "text-zinc-500"
                        }`}
                      >
                        재고{arrow("closing_stock", sort, dir)}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {displayRows.map((p, i) => {
                      const loss = calcLoss(p);
                      const salePrice = Number(p.sale_price ?? 0);
                      const purchasePrice = Number((p as any).purchase_price ?? 0);
                      const profitRate =
                        salePrice > 0 && purchasePrice > 0
                          ? ((salePrice - purchasePrice) / salePrice) * 100
                          : null;
                      const isSelected =
                        selected && String(selected.code) === String(p.product_code);
                      return (
                        <tr
                          key={`dash-${p.product_code}-${i}`}
                          className={`transition cursor-pointer ${
                            isSelected
                              ? "bg-teal-50 border-l-4 border-teal-500"
                              : "hover:bg-zinc-50/60"
                          }`}
                          onClick={() => onProductClick(p)}
                        >
                          <td className="px-1 py-1.5 text-[12px] font-bold text-brand-deep align-top tabular-nums">
                            {i + 1}
                          </td>
                          <td className="px-2 py-1.5 align-top">
                            <div
                              className="text-[13px] font-medium text-zinc-800 break-words whitespace-normal leading-tight"
                              title={p.product_name}
                            >
                              {p.product_name}
                            </div>
                            {p.supplier && (
                              <div className="text-[11px] text-zinc-400 break-words whitespace-normal mt-0.5">
                                {p.supplier}
                              </div>
                            )}
                          </td>
                          <td className="text-right px-1 py-1.5 tabular-nums font-bold text-orange-700 bg-orange-50/40 align-top">
                            {fmt(Number(p.sale_qty ?? 0))}
                          </td>
                          <td
                            className="text-right px-1 py-1.5 tabular-nums text-indigo-700 font-bold bg-indigo-50/40 align-top"
                            title={salePrice > 0 ? `${salePrice.toLocaleString()}원` : undefined}
                          >
                            {salePrice > 0 ? fmtWon(salePrice) : "-"}
                          </td>
                          <td
                            className={`text-right px-1 py-1.5 tabular-nums font-bold bg-emerald-50/40 align-top ${
                              profitRate == null
                                ? "text-zinc-400"
                                : profitRate >= 30
                                ? "text-emerald-700"
                                : profitRate >= 10
                                ? "text-emerald-600"
                                : "text-rose-600"
                            }`}
                            title={
                              profitRate != null
                                ? `(판매가 ${salePrice.toLocaleString()} - 사입가 ${purchasePrice.toLocaleString()}) / 판매가 = ${profitRate.toFixed(2)}%`
                                : "판매가 또는 사입가 미설정"
                            }
                          >
                            {profitRate == null ? "-" : `${profitRate.toFixed(1)}%`}
                          </td>
                          <td
                            className={`text-right px-1 py-1.5 tabular-nums bg-rose-50/40 align-top ${
                              loss > 0
                                ? "text-rose-600 font-bold"
                                : loss < 0
                                ? "text-emerald-600 font-bold"
                                : "text-zinc-400"
                            }`}
                            title={`손실 = (시작${fmt(Number(p.opening_stock ?? 0))} − 판매${fmt(Number(p.sale_qty ?? 0))}) − 종료${fmt(Number(p.closing_stock ?? 0))}`}
                          >
                            {loss === 0
                              ? "0"
                              : loss > 0
                              ? `-${fmt(loss)}`
                              : `+${fmt(Math.abs(loss))}`}
                          </td>
                          <td className="text-right px-1 py-1.5 tabular-nums text-zinc-700 font-semibold bg-zinc-50/40 align-top">
                            {fmt(Number(p.closing_stock ?? 0))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Resize handle (desktop only) */}
        <div
          onMouseDown={onResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-sky-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절"
        >
          <span className="text-[9px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">
            ||
          </span>
        </div>

        {/* 우 · 상품 상세 패널 */}
        <ProductDetailRightPanel
          selected={selected}
          onClose={() => setSelected(null)}
          onProductUpdate={(u) =>
            setSelected(prev => (prev ? { ...prev, ...u } : prev))
          }
          onRealMapUpdate={(v) =>
            setSelected(prev => (prev ? { ...prev, real_map: v } : prev))
          }
          showChart={true}
          context="stock-manage"
          editable={true}
          emptySub="상품을 클릭하면 상세 정보와 판매 추이가 표시됩니다"
        />
      </div>
    </div>
  );
};

export default DashboardTab;
