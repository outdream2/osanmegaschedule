// src/components/SalesTrendPage/SupplierTrendTab.tsx
// 2026-08-22 · Framework Phase 4 · SalesTrendPage.tsx 에서 분리
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Building2, X } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { SeasonButtons } from "../common/SeasonButtons";
import { MonthToggleSelector } from "../common/MonthToggleSelector";
import { useMonthFilter } from "../../hooks/useMonthFilter";
import { api } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { API_LIMITS } from "../../constants/apiLimits";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { fmt } from "./SalesTrendPage.helpers";
// 2026-09-11 · #106 · 사용자 지시 · 판매중/판매중지 필터 추가
import { SaleStatusFilter } from "../common/SaleStatusFilter";
import { useSaleStatusFilter } from "../../hooks/useSaleStatusFilter";
import { displayVendorName } from "../../utils/vendorNameNormalize";
// 2026-09-18 · 사용자 지시 · 공급사 검색 · (주)·주식회사 무시
import { matchesSupplierQuery } from "../../lib/supplierMatch";

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

// 2026-10-06 · 사용자 지시 · 월 멀티선택 통일 (STANDARD · MonthToggleSelector) · 1/3/6개월 preset 폐기

// ─── 공급사별 판매추이 탭 ────────────────────────────────────────────────────
const SupplierTrendTab: React.FC<{
  granularity: "10day" | "month";
  chartRangeDays: number;
  activeTab?: "product" | "supplier";
  onTabChange?: (t: "product" | "supplier") => void;
  onProductClick?: (p: any) => void;
}> = ({ onProductClick }) => {
  const { toast, showError } = useToast();
  const [suppliers, setSuppliers] = useState<SupplierAggRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  // 2026-09-11 · #107 · 사용자 지시 · TopN 완전 삭제 (dead code 정리)
  // 2026-09-11 · #106 · 사용자 지시 · 판매중/판매중지 필터 · storageKey 격리
  const { value: saleFilter, setValue: setSaleFilter, matches: saleMatches } = useSaleStatusFilter({ storageKey: "supplierTrend.saleFilter" });
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [supplierRowsMap, setSupplierRowsMap] = useState<Record<string, any[] | null>>({});
  const [supplierRowsLoading, setSupplierRowsLoading] = useState<Set<string>>(new Set());
  const supplierFetchedRef = useRef<Set<string>>(new Set());
  const supplierInflightRef = useRef<Set<string>>(new Set());
  const [supRowsSort, setSupRowsSort] = useState<{ key: SupRowsSortKey; dir: SupRowsSortDir }>({ key: "sale_amount", dir: "desc" });
  // 2026-10-06 · 사용자 지시 · 월 멀티선택 통일 (STANDARD · useMonthFilter + MonthToggleSelector)
  //   · periodMonths(number) → selectedMonths(string[]) · 비연속 월 지원 · default = []
  //   · "전체" 모드 유지 (selectedMonths=[] && !season)
  const { selectedMonths, setSelectedMonths, monthsList } = useMonthFilter({ initial: [] });
  const [season, setSeason] = useState<SeasonKey | null>(null);

  const toggleSupRowsSort = (k: SupRowsSortKey) => {
    setSupRowsSort(prev => prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "name" ? "asc" : "desc" });
  };

  const derivePurchasePrice = (r: any): number => {
    const p = Number(r.purchase_price ?? 0);
    if (p > 0) return p;
    const amt = Number(r.purchase_last_amount ?? r.purchase_total_amount ?? 0);
    const qty = Number(r.purchase_total_qty ?? r.buy_stock ?? 0);
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
      if (key === "sale") return Number(r.sale_stock ?? 0);
      if (key === "sale_amount") return Number(r.sale_stock ?? 0) * Number(r.sale_price ?? 0);
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
        else if (monthsList) params.set("months_list", monthsList);
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
          saleQty: Number(x.saleQty ?? x.sale_stock ?? 0) || 0,
          saleAmount: Number(x.saleAmount ?? 0) || 0,
          itemCount: Number(x.itemCount ?? 0) || 0,
        })).filter((x: SupplierAggRow) => x.supplier);
        list.sort((a, b) => (b.saleAmount ?? 0) - (a.saleAmount ?? 0));
        setSuppliers(list);
        supplierFetchedRef.current.clear();
        setExpandedSuppliers(new Set());
        setSupplierRowsMap({});
      } catch (err) {
        showError(`공급사 데이터 로드 실패: ${err instanceof Error ? err.message : String(err)}`);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [monthsList, season]);

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
      else if (monthsList) params.set("months_list", monthsList);
      const { data: j } = await api.get<any>(`/api/stock-manage/top-sales?${params}`);
      const rows = Array.isArray(j?.rows) ? j.rows : [];
      setSupplierRowsMap(prev => ({ ...prev, [key]: rows }));
      supplierFetchedRef.current.add(key);
    } catch (err) {
      setSupplierRowsMap(prev => ({ ...prev, [key]: [] }));
      showError(`상품 데이터 로드 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      supplierInflightRef.current.delete(key);
      setSupplierRowsLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, [monthsList, season]);

  const filteredSuppliers = useMemo(() => {
    const q = query.trim();
    if (!q) return suppliers;
    // 2026-09-18 · matchesSupplierQuery · "(주)녹십자" ↔ "녹십자" 양방향
    return suppliers.filter(s => matchesSupplierQuery({ supplier: s.supplier }, q));
  }, [suppliers, query]);

  // 2026-09-11 · #107 · TopN 삭제 · 전체 표시
  const visibleSuppliers = filteredSuppliers;

  return (
    <div className="flex flex-col gap-3">
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
      <div className="bg-white rounded-xl border border-line p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <Building2 size={14} className="text-sky-600" />
            <span className="text-sm font-bold text-zinc-700">공급사별 판매현황<span className="text-[14px] font-semibold text-zinc-400 ml-1">(판매액 내림차순)</span></span>
          </div>
          <span className="text-[15px] font-bold text-zinc-500 shrink-0">
            {visibleSuppliers.length}개 사<span className="text-zinc-400 font-semibold"> / 총 {filteredSuppliers.length}개</span>
          </span>
        </div>
        {/* 필터 바 · 2026-10-06 · 월 멀티선택 통일 (매입이력 STANDARD) · 비연속 월 지원 */}
        <div className="flex items-center gap-2 mb-2 flex-wrap text-[15px]">
          <span className="text-zinc-500 font-bold text-[14px] shrink-0">기간</span>
          <MonthToggleSelector
            selectedMonths={selectedMonths}
            onChange={months => { setSelectedMonths(months); setSeason(null); }}
            maxMonths={6}
            ariaLabel="공급사 트렌드 기간"
          />
          {selectedMonths.length > 0 && (
            <span className="text-[13px] text-ink-soft tabular-nums">{selectedMonths.length}개월 선택</span>
          )}
          {selectedMonths.length === 0 && !season && (
            <span className="text-[13px] text-ink-soft">전체</span>
          )}
          <SeasonButtons value={season} onChange={(v) => { setSeason(v); if (v) setSelectedMonths([]); }} size="sm" hideLabel />
          {/* 2026-09-11 · #106 · 사용자 지시 · 판매중/판매중지 필터 추가 · 확장된 상품 리스트에 적용 */}
          <SaleStatusFilter value={saleFilter} onChange={setSaleFilter} size="sm" />
        </div>
        {/* 검색 */}
        <div className="mb-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input lang="ko" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="공급사명 검색"
              className="w-full pl-7 pr-8 py-1.5 text-xs border border-line rounded-lg focus:outline-none focus:border-brand-deep bg-white" />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-600">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        <p className="text-[14px] text-sky-600 font-semibold mb-2 flex items-center gap-1">
          <span className="text-sky-400">▶</span> 공급사 클릭 → 판매액 내림차순 상품 리스트 펼치기 · 상품명 클릭 → 상세 모달
        </p>
        {loading && suppliers.length > 0 && (
          <Card variant="flat" bg="bg-sky-50" borderColor="border-sky-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mb-1">
            <Spinner size={11} tone="sky" label="조건 변경 · 새로 불러오는 중..." labelSize={10} />
          </Card>
        )}
        <div className="max-h-[50vh] overflow-y-auto pr-2 relative">
          {loading && suppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="w-10 h-10 border-4 border-line border-t-orange-500 rounded-full animate-spin" />
              <div className="text-xs font-bold text-zinc-600">데이터 로딩중...</div>
            </div>
          ) : visibleSuppliers.length === 0 ? (
            <div className="text-center text-[15px] text-zinc-300 py-6">데이터 없음</div>
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
                        <span className="text-[14px] font-bold text-sky-600 shrink-0">{i + 1}</span>
                        <Building2 size={11} className="text-sky-500 shrink-0" />
                        <span className="text-xs font-bold text-zinc-700 break-words whitespace-normal leading-tight">{displayVendorName(sup.supplier) || sup.supplier}</span>
                        {sup.supplier_code && (
                          <span className="text-[15px] tabular-nums text-zinc-400 shrink-0" title="공급사코드">#{sup.supplier_code}</span>
                        )}
                        {sup.code_conflict && (
                          <span className="text-[15px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded px-1 shrink-0"
                            title="같은 이름에 여러 공급사코드가 존재 — 중복 의심">⚠</span>
                        )}
                      </div>
                      <span className="text-[15px] font-bold text-orange-700 shrink-0" title={`판매액 합계 · 판매수량 ${fmt(sup.saleQty)}개`}>{fmt(sup.saleAmount ?? 0)}원</span>
                    </button>
                    <div className="flex items-center justify-end mt-0.5">
                      <span className="text-[14px] text-zinc-400 shrink-0 text-right" title={`상품 ${sup.itemCount}종`}>
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
                          <div className="text-center text-[15px] text-zinc-300 py-6">상품 데이터 없음</div>
                        ) : (
                          <div className="max-h-[50vh] overflow-auto">
                            <table className="w-full text-xs sm:min-w-[520px]">
                              <thead className="sticky top-0 bg-zinc-50 border-b-2 border-line z-10 shadow-sm">
                                <tr className="text-[15px] text-zinc-500 uppercase tracking-wider">
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
                                            <span className="text-[15px]">{supRowsSort.dir === "asc" ? "▲" : "▼"}</span>
                                          ) : (
                                            <span className="text-[14px] text-zinc-300">⇅</span>
                                          )}
                                        </span>
                                      </th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-50">
                                {/* 2026-09-11 · #106 · 사용자 지시 · 판매중/판매중지 필터 적용 (상품 sale_status) */}
                                {sortSupRows(rows).filter((r: any) => saleMatches(r.sale_status)).slice(0, 200).map((r, ri) => {
                                  const saleQty = Number(r.sale_stock ?? 0);
                                  const salePrice = Number(r.sale_price ?? 0);
                                  const purchasePrice = derivePurchasePrice(r);
                                  const saleAmount = saleQty * salePrice;
                                  const profitRate = salePrice > 0 && purchasePrice > 0 ? ((salePrice - purchasePrice) / salePrice) * 100 : null;
                                  return (
                                    <tr key={`${key}-${r.product_code ?? ri}`} className="hover:bg-zinc-50/60 transition align-top">
                                      <td className="px-0.5 py-1.5 text-[14px] font-bold text-orange-600">{ri + 1}</td>
                                      <td className="px-0.5 py-1.5 break-words whitespace-normal leading-tight">
                                        <button
                                          type="button"
                                          onClick={() => onProductClick?.(r)}
                                          className="text-left text-[15px] font-medium text-zinc-800 hover:text-indigo-600 hover:underline cursor-pointer transition break-words whitespace-normal leading-tight"
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
                              <div className="text-[14px] text-zinc-400 text-center py-1">상위 200개만 표시 · 전체 {rows.length}개</div>
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
