// src/components/SalesTrendPage/SupplierTrendTab.tsx
// 2026-08-22 · Framework Phase 4 · SalesTrendPage.tsx 에서 분리
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Building2, X } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { SeasonButtons } from "../common/SeasonButtons";
import { api } from "../../lib/apiClient";
import { API_LIMITS } from "../../constants/apiLimits";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { fmt } from "./SalesTrendPage.helpers";

// ─── 타입 ────────────────────────────────────────────────────────────────────
type SupplierAggRow = {
  supplier: string;
  supplier_code: string | null;
  code_conflict?: boolean;
  saleQty: number;
  saleAmount?: number;
  itemCount: number;
};
type SupRowsSortKey = "name" | "sale" | "purchase_price" | "sale_price" | "profit_rate" | "sale_amount";
type SupRowsSortDir = "asc" | "desc";

const PERIOD_PRESETS: { key: 0 | 1 | 3 | 6; label: string }[] = [
  { key: 0, label: "전체" },
  { key: 1, label: "1개월" },
  { key: 3, label: "3개월" },
  { key: 6, label: "6개월" },
];

// ─── 공급사별 판매추이 탭 ────────────────────────────────────────────────────
const SupplierTrendTab: React.FC<{
  granularity: "10day" | "month";
  chartRangeDays: number;
  activeTab?: "product" | "supplier";
  onTabChange?: (t: "product" | "supplier") => void;
  onProductClick?: (p: any) => void;
}> = ({ onProductClick }) => {
  const [suppliers, setSuppliers] = useState<SupplierAggRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [topN, setTopN] = useState<number>(100);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [supplierRowsMap, setSupplierRowsMap] = useState<Record<string, any[] | null>>({});
  const [supplierRowsLoading, setSupplierRowsLoading] = useState<Set<string>>(new Set());
  const supplierFetchedRef = useRef<Set<string>>(new Set());
  const supplierInflightRef = useRef<Set<string>>(new Set());
  const [supRowsSort, setSupRowsSort] = useState<{ key: SupRowsSortKey; dir: SupRowsSortDir }>({ key: "sale_amount", dir: "desc" });
  const [periodMonths, setPeriodMonths] = useState<0 | 1 | 3 | 6>(0);
  const [season, setSeason] = useState<SeasonKey | null>(null);

  const toggleSupRowsSort = (k: SupRowsSortKey) => {
    setSupRowsSort(prev => prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "name" ? "asc" : "desc" });
  };

  const derivePurchasePrice = (r: any): number => {
    const p = Number(r.purchase_price ?? 0);
    if (p > 0) return p;
    const amt = Number(r.purchase_last_amount ?? r.purchase_total_amount ?? 0);
    const qty = Number(r.purchase_total_qty ?? r.purchase_qty ?? 0);
    return qty > 0 ? Math.round(amt / qty) : 0;
  };
  const deriveProfitRate = (r: any): number => {
    const sp = Number(r.sale_price ?? 0);
    const pp = derivePurchasePrice(r);
    return sp > 0 && pp > 0 ? ((sp - pp) / sp) * 100 : -Infinity;
  };
  const sortSupRows = (rows: any[]): any[] => {
    const { key, dir } = supRowsSort;
    const mult = dir === "asc" ? 1 : -1;
    const getVal = (r: any): any => {
      if (key === "name") return String(r.product_name ?? "");
      if (key === "sale") return Number(r.sale_qty ?? 0);
      if (key === "sale_amount") return Number(r.sale_qty ?? 0) * Number(r.sale_price ?? 0);
      if (key === "sale_price") return Number(r.sale_price ?? 0);
      if (key === "profit_rate") return deriveProfitRate(r);
      return derivePurchasePrice(r);
    };
    return [...rows].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (typeof va === "string") return va.localeCompare(String(vb), "ko") * mult;
      return (va - vb) * mult;
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({ limit: String(API_LIMITS.MEDIUM) });
        if (season) params.set("season", season);
        else if (periodMonths > 0) params.set("months", String(periodMonths));
        const { data } = await api.get<any>(`/api/stock-manage/supplier-purchases?${params}`);
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
          saleAmount: Number(x.saleAmount ?? 0) || 0,
          itemCount: Number(x.itemCount ?? 0) || 0,
        })).filter((x: SupplierAggRow) => x.supplier);
        list.sort((a, b) => (b.saleAmount ?? 0) - (a.saleAmount ?? 0));
        setSuppliers(list);
        supplierFetchedRef.current.clear();
        setExpandedSuppliers(new Set());
        setSupplierRowsMap({});
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [periodMonths, season]);

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
      const params = new URLSearchParams({ sort: "sale", dir: "desc", limit: String(API_LIMITS.LARGE) });
      if (sup.supplier_code) params.set("supplier_code", sup.supplier_code);
      else if (sup.supplier) params.set("supplier", sup.supplier);
      if (season) params.set("season", season);
      else if (periodMonths > 0) params.set("months", String(periodMonths));
      const { data: j } = await api.get<any>(`/api/stock-manage/top-sales?${params}`);
      const rows = Array.isArray(j?.rows) ? j.rows : [];
      setSupplierRowsMap(prev => ({ ...prev, [key]: rows }));
      supplierFetchedRef.current.add(key);
    } catch {
      setSupplierRowsMap(prev => ({ ...prev, [key]: [] }));
    } finally {
      supplierInflightRef.current.delete(key);
      setSupplierRowsLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, [periodMonths, season]);

  const filteredSuppliers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(s => s.supplier.toLowerCase().includes(q));
  }, [suppliers, query]);

  const visibleSuppliers = useMemo(
    () => (topN === 0 ? filteredSuppliers : filteredSuppliers.slice(0, topN)),
    [filteredSuppliers, topN],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white rounded-xl border border-line p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <Building2 size={14} className="text-sky-600" />
            <span className="text-sm font-bold text-zinc-700">공급사별 판매현황<span className="text-[10px] font-semibold text-zinc-400 ml-1">(판매액 내림차순)</span></span>
          </div>
          <span className="text-[11px] font-bold text-zinc-500 shrink-0">
            {visibleSuppliers.length}개 사<span className="text-zinc-400 font-semibold"> / 총 {filteredSuppliers.length}개</span>
          </span>
        </div>
        {/* 필터 바 */}
        <div className="flex items-center gap-2 mb-2 flex-wrap text-[11px]">
          <span className="text-zinc-500 font-bold text-[10px] shrink-0">기간</span>
          <div className="inline-flex bg-zinc-100/80 border border-line/60 rounded-lg p-0.5 shadow-inner">
            {PERIOD_PRESETS.map(p => (
              <button key={p.key} type="button" onClick={() => { setPeriodMonths(p.key); setSeason(null); }}
                className={`px-2 py-1 text-[10px] font-bold rounded transition cursor-pointer ${!season && periodMonths === p.key ? "bg-white text-sky-700 shadow-sm ring-1 ring-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <SeasonButtons value={season} onChange={(v) => { setSeason(v); if (v) setPeriodMonths(0); }} size="sm" hideLabel />
          <span className="text-zinc-500 font-bold text-[10px] shrink-0 ml-1">Top N</span>
          <div className="inline-flex bg-zinc-100/80 border border-line/60 rounded-lg p-0.5 shadow-inner" title="판매액 내림차순 상위 N개만 표시">
            {([100, 300, 1000, 2000, 0] as const).map(n => (
              <button key={n} type="button" onClick={() => setTopN(n)}
                className={`px-2 py-1 text-[10px] font-bold rounded transition cursor-pointer ${topN === n ? "bg-white text-sky-700 shadow-sm ring-1 ring-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`}>
                {n === 0 ? "전체" : `Top ${n}`}
              </button>
            ))}
          </div>
        </div>
        {/* 검색 */}
        <div className="mb-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="공급사명 검색"
              className="w-full pl-7 pr-8 py-1.5 text-xs border border-line rounded-lg focus:outline-none focus:border-brand-deep bg-white" />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-600">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-sky-600 font-semibold mb-2 flex items-center gap-1">
          <span className="text-sky-400">▶</span> 공급사 클릭 → 판매액 내림차순 상품 리스트 펼치기 · 상품명 클릭 → 상세 모달
        </p>
        {loading && suppliers.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 py-1.5 mb-1 bg-sky-50 border border-sky-200 rounded-md">
            <Spinner size={11} tone="sky" label="조건 변경 · 새로 불러오는 중..." labelSize={10} />
          </div>
        )}
        <div className="max-h-[50vh] overflow-y-auto pr-2 relative">
          {loading && suppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="w-10 h-10 border-4 border-line border-t-orange-500 rounded-full animate-spin" />
              <div className="text-xs font-bold text-zinc-600">데이터 로딩중...</div>
            </div>
          ) : visibleSuppliers.length === 0 ? (
            <div className="text-center text-[11px] text-zinc-300 py-6">데이터 없음</div>
          ) : (
            <div className={`divide-y divide-zinc-50 ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
              {visibleSuppliers.map((sup, i) => {
                const key = `${sup.supplier_code ?? "-"}::${sup.supplier}`;
                const isExpanded = expandedSuppliers.has(key);
                const isLoading = supplierRowsLoading.has(key);
                const rows = supplierRowsMap[key];
                return (
                  <div key={key} className="py-2">
                    <button
                      type="button"
                      onClick={() => toggleSupplierExpand(sup)}
                      className="w-full flex items-center justify-between gap-2 hover:bg-sky-50/50 -mx-1 px-1 py-0.5 rounded-lg transition cursor-pointer"
                      title={isExpanded ? "상세 접기" : "상세 펼치기 (판매액 내림차순)"}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-zinc-400 text-xs transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                        <span className="text-[10px] font-bold text-sky-600 shrink-0">{i + 1}</span>
                        <Building2 size={11} className="text-sky-500 shrink-0" />
                        <span className="text-xs font-bold text-zinc-700 break-words whitespace-normal leading-tight">{sup.supplier}</span>
                        {sup.supplier_code && (
                          <span className="text-[9px] tabular-nums text-zinc-400 shrink-0" title="공급사코드">#{sup.supplier_code}</span>
                        )}
                        {sup.code_conflict && (
                          <span className="text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded px-1 shrink-0"
                            title="같은 이름에 여러 공급사코드가 존재 — 중복 의심">⚠</span>
                        )}
                      </div>
                      <span className="text-[11px] font-bold text-orange-700 shrink-0" title={`판매액 합계 · 판매수량 ${fmt(sup.saleQty)}개`}>{fmt(sup.saleAmount ?? 0)}원</span>
                    </button>
                    <div className="flex items-center justify-end mt-0.5">
                      <span className="text-[10px] text-zinc-400 shrink-0 text-right" title={`상품 ${sup.itemCount}종`}>
                        <span className="text-zinc-500 font-semibold">상품 {sup.itemCount}종</span>
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="mt-2 border-t border-sky-100 pt-2 bg-sky-50/30 -mx-2 px-3 py-2 rounded-lg">
                        {isLoading ? (
                          <div className="flex flex-col items-center justify-center gap-3 py-6">
                            <div className="w-8 h-8 border-4 border-line border-t-orange-500 rounded-full animate-spin" />
                            <div className="text-xs font-bold text-zinc-600">데이터 로딩중...</div>
                          </div>
                        ) : !rows || rows.length === 0 ? (
                          <div className="text-center text-[11px] text-zinc-300 py-6">상품 데이터 없음</div>
                        ) : (
                          <div className="max-h-[50vh] overflow-auto">
                            <table className="w-full text-xs sm:min-w-[520px]">
                              <thead className="sticky top-0 bg-zinc-50 border-b-2 border-line z-10 shadow-sm">
                                <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
                                  <th className="text-left px-0.5 py-1.5 w-6">#</th>
                                  {([
                                    { k: "name" as SupRowsSortKey, label: "상품명", align: "text-left", color: "slate" as const },
                                    { k: "sale" as SupRowsSortKey, label: "판매수량", align: "text-right", w: "w-12", color: "orange" as const },
                                    { k: "sale_amount" as SupRowsSortKey, label: "판매액", align: "text-right", w: "w-16", color: "orange" as const },
                                    { k: "sale_price" as SupRowsSortKey, label: "판매가", align: "text-right", w: "w-14", color: "slate" as const },
                                    { k: "purchase_price" as SupRowsSortKey, label: "사입가", align: "text-right", w: "w-14", color: "emerald" as const },
                                    { k: "profit_rate" as SupRowsSortKey, label: "이익률", align: "text-right", w: "w-12", color: "emerald" as const },
                                  ]).map(col => {
                                    const active = supRowsSort.key === col.k;
                                    const activeCls = { slate: "text-zinc-800", orange: "text-orange-700", emerald: "text-emerald-800" }[col.color];
                                    const inactiveCls = { slate: "text-zinc-500", orange: "text-orange-500", emerald: "text-emerald-600" }[col.color];
                                    const hoverCls = { slate: "hover:bg-zinc-50", orange: "hover:bg-orange-50/40", emerald: "hover:bg-emerald-50/40" }[col.color];
                                    const bgCls = { slate: "", orange: "bg-orange-50/40", emerald: "bg-emerald-50/40" }[col.color];
                                    return (
                                      <th key={col.k}
                                        onClick={(e) => { e.stopPropagation(); toggleSupRowsSort(col.k); }}
                                        className={`${col.align} px-0.5 py-1.5 ${col.w ?? ""} ${bgCls} cursor-pointer select-none ${hoverCls} transition ${active ? `${activeCls} font-bold` : inactiveCls}`}
                                        title={`${col.label} 정렬`}
                                      >
                                        <span className="inline-flex items-center gap-0.5">
                                          {col.label}
                                          {active ? (
                                            <span className="text-[9px]">{supRowsSort.dir === "asc" ? "▲" : "▼"}</span>
                                          ) : (
                                            <span className="text-[10px] text-zinc-300">⇅</span>
                                          )}
                                        </span>
                                      </th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-50">
                                {sortSupRows(rows).slice(0, 200).map((r, ri) => {
                                  const saleQty = Number(r.sale_qty ?? 0);
                                  const salePrice = Number(r.sale_price ?? 0);
                                  const purchasePrice = derivePurchasePrice(r);
                                  const saleAmount = saleQty * salePrice;
                                  const profitRate = salePrice > 0 && purchasePrice > 0 ? ((salePrice - purchasePrice) / salePrice) * 100 : null;
                                  return (
                                    <tr key={`${key}-${r.product_code ?? ri}`} className="hover:bg-zinc-50/60 transition align-top">
                                      <td className="px-0.5 py-1.5 text-[12px] font-bold text-orange-600">{ri + 1}</td>
                                      <td className="px-0.5 py-1.5 break-words whitespace-normal leading-tight">
                                        <button
                                          type="button"
                                          onClick={() => onProductClick?.(r)}
                                          className="text-left text-[13px] font-medium text-zinc-800 hover:text-indigo-600 hover:underline cursor-pointer transition break-words whitespace-normal leading-tight"
                                          title={`${r.product_name} — 클릭 시 상세 정보`}
                                        >{r.product_name}</button>
                                      </td>
                                      <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-orange-700 bg-orange-50/40">{fmt(saleQty)}</td>
                                      <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-orange-700 bg-orange-50/40">{saleAmount > 0 ? saleAmount.toLocaleString() : "-"}</td>
                                      <td className="text-right px-0.5 py-1.5 tabular-nums text-zinc-800">{salePrice > 0 ? salePrice.toLocaleString() : "-"}</td>
                                      <td className="text-right px-0.5 py-1.5 tabular-nums text-emerald-700 bg-emerald-50/40">{purchasePrice > 0 ? purchasePrice.toLocaleString() : "-"}</td>
                                      <td className={`text-right px-0.5 py-1.5 tabular-nums font-bold bg-emerald-50/40 ${profitRate == null ? "text-zinc-400" : profitRate >= 30 ? "text-emerald-700" : profitRate >= 10 ? "text-emerald-600" : "text-rose-600"}`}>{profitRate == null ? "-" : `${profitRate.toFixed(1)}%`}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {rows.length > 200 && (
                              <div className="text-[10px] text-zinc-400 text-center py-1">상위 200개만 표시 · 전체 {rows.length}개</div>
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

export default SupplierTrendTab;
