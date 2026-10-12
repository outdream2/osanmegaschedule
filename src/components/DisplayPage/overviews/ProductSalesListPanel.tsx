// src/components/DisplayPage/overviews/ProductSalesListPanel.tsx
// 2026-10-12 · 사용자 지시 · 상품별 판매현황 리스트
//   · 홈 "오늘의 판매현황" 과 연결 · 판매 데이터 중심 compact 리스트
//   · 공통 OverviewPeriodFilter (MonthPills + QuickRangePills) 적용
//   · /api/stock-manage/top-sales (months_list) 호출 · 상품별 집계
//   · columns · 상품명·공급사·판매수량·매출·마진·현재고
//   · sort · 매출/판매수량/마진/현재고 header click 자동 정렬

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowsVertical, MagnifyingGlass } from "@phosphor-icons/react";
import { api } from "../../../lib/apiClient";
import { MonthPills, QuickRangePills, type QuickRangeKey } from "../../common/OverviewPeriodFilter";
import { Spinner } from "../../common/Spinner";

// top-sales API row shape (subset · 필요한 필드만)
interface TopSalesRow {
  product_name?: string | null;
  product_code?: string | null;
  pcode?: string | null;
  supplier_name?: string | null;
  sale_stock?: number | null;      // 판매 수량
  total_amount?: number | null;    // 매출 금액
  current_stock?: number | null;
  closing_stock?: number | null;
  purchase_price?: number | null;
  sale_price?: number | null;
  category?: string | null;
}

type SortKey = "sale" | "amount" | "margin" | "stock" | "name";
type SortDir = "asc" | "desc";

const fmt = (n: number | null | undefined): string => {
  if (n == null) return "—";
  return Number(n).toLocaleString();
};

const curYm = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

interface Props {
  /** 홈 "오늘의 판매현황" 과 연결 설명 (optional subtitle) */
  linkedToHome?: boolean;
}

export const ProductSalesListPanel: React.FC<Props> = ({ linkedToHome = true }) => {
  // 2026-10-12 · 공통 period filter · default = 현재 월
  const [selectedMonths, setSelectedMonths] = useState<string[]>([curYm()]);
  const [quickRange, setQuickRange] = useState<QuickRangeKey>(null);

  const [rows, setRows] = useState<TopSalesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const effectiveMonths = selectedMonths.length > 0 ? selectedMonths : [curYm()];

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ml = effectiveMonths.join(",");
      const { data } = await api.get<{ rows?: TopSalesRow[] }>(
        `/api/stock-manage/top-sales?limit=2000&months_list=${encodeURIComponent(ml)}`,
      );
      setRows(Array.isArray(data?.rows) ? data.rows! : []);
    } catch (err) {
      console.error("[ProductSalesListPanel] fetch failed", err);
      setError(err instanceof Error ? err.message : "조회 실패");
      setRows([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMonths.join(",")]);
  useEffect(() => { void load(); }, [load]);

  // 검색 필터 + 정렬
  const displayRows = useMemo(() => {
    let filtered = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(r => {
        const name = String(r.product_name ?? "").toLowerCase();
        const code = String(r.product_code ?? r.pcode ?? "").toLowerCase();
        const sup = String(r.supplier_name ?? "").toLowerCase();
        return name.includes(q) || code.includes(q) || sup.includes(q);
      });
    }
    const sign = sortDir === "desc" ? -1 : 1;
    const marginOf = (r: TopSalesRow) => {
      const sp = Number(r.sale_price ?? 0);
      const pp = Number(r.purchase_price ?? 0);
      if (sp <= 0) return 0;
      return ((sp - pp) / sp) * 100;
    };
    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "sale":   return sign * (Number(a.sale_stock ?? 0) - Number(b.sale_stock ?? 0));
        case "amount": return sign * (Number(a.total_amount ?? 0) - Number(b.total_amount ?? 0));
        case "margin": return sign * (marginOf(a) - marginOf(b));
        case "stock":  return sign * (Number(a.current_stock ?? a.closing_stock ?? 0) - Number(b.current_stock ?? b.closing_stock ?? 0));
        case "name":   return sign * String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko");
        default:       return 0;
      }
    });
    return sorted;
  }, [rows, search, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(prev => prev === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const SortIcon: React.FC<{ k: SortKey }> = ({ k }) =>
    sortKey !== k ? <ArrowsVertical size={10} className="text-slate-300" />
    : sortDir === "desc" ? <ArrowDown size={10} className="text-brand-deep" weight="bold" />
    : <ArrowUp size={10} className="text-brand-deep" weight="bold" />;

  const totalSaleQty = useMemo(() => displayRows.reduce((s, r) => s + Number(r.sale_stock ?? 0), 0), [displayRows]);
  const totalAmount = useMemo(() => displayRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0), [displayRows]);

  return (
    <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
      {/* Header · title + 공통 period filter */}
      <header className="px-5 pt-4 pb-3 border-b border-slate-100 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-[3px] h-[14px] bg-rose-500 rounded-full shrink-0" aria-hidden />
            <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">상품별 판매현황</h3>
            {linkedToHome && (
              <span className="text-[12.5px] md:text-[13px] text-slate-400 font-medium">· 홈 "오늘의 판매현황" 연계</span>
            )}
            <span className="text-[13px] md:text-[14px] font-medium text-slate-400 tabular-nums">· {displayRows.length}건</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[12.5px] text-slate-500 font-medium">
              합계 · 수량 <b className="text-ink tabular-nums">{fmt(totalSaleQty)}</b> · 매출 <b className="text-ink tabular-nums">{fmt(totalAmount)}</b>원
            </span>
          </div>
        </div>
        <div className="flex items-start gap-3 flex-wrap">
          {/* 공통 period filter */}
          <MonthPills selectedMonths={selectedMonths} onChange={setSelectedMonths} monthCount={6} />
          <QuickRangePills value={quickRange} onChange={setQuickRange} showMonthMode={false} />
          {/* 검색 */}
          <div className="relative ml-auto">
            <MagnifyingGlass size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="상품명·코드·공급사 검색"
              className="h-7 pl-7 pr-2 text-[13px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint min-w-[220px]"
            />
          </div>
        </div>
      </header>

      {/* body · table */}
      <div className="flex-1 min-h-0 overflow-auto">
        {loading && displayRows.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={14} tone="zinc" label="판매 데이터 조회 중..." labelSize={13} />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-[13px] text-rose-600 font-medium">
            조회 실패 · {error}
          </div>
        ) : displayRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-[14px] text-slate-500 font-medium">선택한 기간에 판매 데이터 없음</div>
            <div className="text-[12.5px] text-slate-400 mt-1">월을 다르게 선택해보세요</div>
          </div>
        ) : (
          <table className="w-full text-[13px] md:text-[14px] tabular-nums">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-right w-10 text-[11.5px] font-semibold text-slate-500">No</th>
                <th className="px-3 py-2 text-left text-[11.5px] font-semibold text-slate-500">
                  <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-ink">
                    상품명 <SortIcon k="name" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left text-[11.5px] font-semibold text-slate-500 hidden md:table-cell">공급사</th>
                <th className="px-3 py-2 text-right text-[11.5px] font-semibold text-slate-500">
                  <button type="button" onClick={() => toggleSort("sale")} className="inline-flex items-center gap-1 hover:text-ink">
                    판매수량 <SortIcon k="sale" />
                  </button>
                </th>
                <th className="px-3 py-2 text-right text-[11.5px] font-semibold text-slate-500">
                  <button type="button" onClick={() => toggleSort("amount")} className="inline-flex items-center gap-1 hover:text-ink">
                    매출 <SortIcon k="amount" />
                  </button>
                </th>
                <th className="px-3 py-2 text-right text-[11.5px] font-semibold text-slate-500 hidden lg:table-cell">
                  <button type="button" onClick={() => toggleSort("margin")} className="inline-flex items-center gap-1 hover:text-ink">
                    마진율 <SortIcon k="margin" />
                  </button>
                </th>
                <th className="px-3 py-2 text-right text-[11.5px] font-semibold text-slate-500 hidden md:table-cell">
                  <button type="button" onClick={() => toggleSort("stock")} className="inline-flex items-center gap-1 hover:text-ink">
                    현재고 <SortIcon k="stock" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r, i) => {
                const sp = Number(r.sale_price ?? 0);
                const pp = Number(r.purchase_price ?? 0);
                const margin = sp > 0 ? ((sp - pp) / sp) * 100 : null;
                const stock = r.current_stock ?? r.closing_stock ?? null;
                return (
                  <tr key={`${r.product_code ?? r.pcode ?? i}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-1.5 text-right text-slate-400 text-[12.5px]">{i + 1}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-col min-w-0">
                        <span className="text-ink font-medium truncate" title={r.product_name ?? ""}>{r.product_name ?? "—"}</span>
                        <span className="text-[11.5px] text-slate-400 tabular-nums truncate">{r.product_code ?? r.pcode ?? ""}</span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-slate-600 truncate hidden md:table-cell max-w-[160px]" title={r.supplier_name ?? ""}>
                      {r.supplier_name ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold text-ink">{fmt(r.sale_stock)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-emerald-700">{fmt(r.total_amount)}</td>
                    <td className="px-3 py-1.5 text-right hidden lg:table-cell">
                      {margin == null ? <span className="text-slate-400">—</span>
                        : margin < 0 ? <span className="text-rose-600 font-semibold">−{Math.abs(margin).toFixed(1)}%</span>
                        : <span className="text-emerald-700 font-semibold">{margin.toFixed(1)}%</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right hidden md:table-cell text-slate-600">{fmt(stock)}</td>
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

export default ProductSalesListPanel;
