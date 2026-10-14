// src/components/DisplayPage/RevenuePage.ProductsReport.tsx
// 2026-10-12 · 사용자 지시 "시간대별·월별·상품별 inner tab" · 상품별 매출 panel
//   · 공통 OverviewPeriodFilter + useOverviewPeriod hook 사용
//   · effectiveRange 기준 ERP sale-day-products 집계 (상품별)
//   · 홈 랜딩 톤 CARD + table (상품 · 수량 · 매출 · 마진)

import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/apiClient";
import { OverviewPeriodFilter, useOverviewPeriod } from "../common/OverviewPeriodFilter";
import { Spinner } from "../common/Spinner";

const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const fmt = (n: number): string => Math.round(n).toLocaleString("ko-KR");

interface DaySaleItem {
  pcode: string | null;
  productName: string | null;
  unitSale: number | null;
  totalStock: number | null;
  saleTotal: number | null;
  margin: number | null;
}

type SortKey = "name" | "qty" | "sale" | "margin" | "marginRate";

export const ProductsReportTab: React.FC = () => {
  const { selectedMonths, setSelectedMonths, quickRange, setQuickRange, effectiveRange } = useOverviewPeriod("14d");
  const [rawByDate, setRawByDate] = useState<Map<string, DaySaleItem[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "sale", dir: "desc" });

  // ERP sale-day-products chunked fetch
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const dates: string[] = [];
        const d0 = new Date(effectiveRange.from + "T00:00:00");
        const d1 = new Date(effectiveRange.to + "T00:00:00");
        for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          dates.push(`${y}-${m}-${day}`);
        }
        const CHUNK = 5;
        const result = new Map<string, DaySaleItem[]>();
        for (let i = 0; i < dates.length; i += CHUNK) {
          if (!alive) return;
          const batch = dates.slice(i, i + CHUNK);
          const results = await Promise.all(batch.map(dt =>
            api.get<{ items?: DaySaleItem[]; ok?: boolean }>(`/api/erp/sale-day-products?date=${dt}`)
              .then(r => ({ dt, items: Array.isArray(r.data?.items) ? r.data.items : [] }))
              .catch(() => ({ dt, items: [] as DaySaleItem[] })),
          ));
          for (const r of results) result.set(r.dt, r.items);
        }
        if (alive) setRawByDate(result);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "조회 실패");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [effectiveRange.from, effectiveRange.to]);

  // 상품별 집계
  const aggregated = useMemo(() => {
    const map = new Map<string, { pcode: string; name: string; qty: number; sale: number; margin: number }>();
    for (const items of rawByDate.values()) {
      for (const it of items) {
        const key = String(it.pcode ?? it.productName ?? "").trim();
        if (!key) continue;
        const prev = map.get(key) ?? { pcode: String(it.pcode ?? ""), name: String(it.productName ?? "-"), qty: 0, sale: 0, margin: 0 };
        prev.qty += Number(it.totalStock ?? 0);
        prev.sale += Number(it.saleTotal ?? 0);
        prev.margin += Number(it.margin ?? 0);
        map.set(key, prev);
      }
    }
    return Array.from(map.values());
  }, [rawByDate]);

  const sorted = useMemo(() => {
    const arr = [...aggregated];
    const dir = sort.dir === "asc" ? 1 : -1;
    const key = sort.key;
    arr.sort((a, b) => {
      if (key === "name") return dir * String(a.name).localeCompare(String(b.name), "ko");
      if (key === "qty") return dir * (a.qty - b.qty);
      if (key === "sale") return dir * (a.sale - b.sale);
      if (key === "margin") return dir * (a.margin - b.margin);
      /* marginRate */
      const ra = a.sale > 0 ? (a.margin / a.sale) * 100 : 0;
      const rb = b.sale > 0 ? (b.margin / b.sale) * 100 : 0;
      return dir * (ra - rb);
    });
    return arr;
  }, [aggregated, sort]);

  const toggleSort = (k: SortKey) => {
    setSort(prev => prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "name" ? "asc" : "desc" });
  };
  const arrow = (k: SortKey): string => sort.key !== k ? " ⇅" : sort.dir === "asc" ? " ▲" : " ▼";

  const totalSale = useMemo(() => aggregated.reduce((s, r) => s + r.sale, 0), [aggregated]);
  const totalQty = useMemo(() => aggregated.reduce((s, r) => s + r.qty, 0), [aggregated]);
  const totalMargin = useMemo(() => aggregated.reduce((s, r) => s + r.margin, 0), [aggregated]);
  const totalMarginRate = totalSale > 0 ? (totalMargin / totalSale) * 100 : 0;

  return (
    <div className="flex flex-col gap-3 md:gap-4 pt-3">
      {/* 공통 필터 toolbar */}
      <section className={`${CARD} px-4 py-2.5 md:px-5 md:py-3`}>
        <OverviewPeriodFilter
          selectedMonths={selectedMonths}
          onMonthsChange={setSelectedMonths}
          quickRange={quickRange}
          onQuickRangeChange={setQuickRange}
          periodLabel={`기간 ${effectiveRange.from} ~ ${effectiveRange.to} · ${effectiveRange.days}일`}
        />
      </section>

      {/* 요약 */}
      <section className={`${CARD} px-4 py-2.5 md:px-5 md:py-3`}>
        <div className="flex items-baseline gap-x-6 gap-y-1.5 flex-wrap text-[14px]">
          <span className="text-slate-500">상품수 <b className="text-ink tabular-nums ml-1">{fmt(aggregated.length)}</b>종</span>
          <span className="text-slate-500">총 수량 <b className="text-ink tabular-nums ml-1">{fmt(totalQty)}</b>개</span>
          <span className="text-slate-500">총 매출 <b className="text-rose-700 tabular-nums ml-1">{fmt(totalSale)}</b>원</span>
          <span className="text-slate-500">총 마진 <b className="text-emerald-700 tabular-nums ml-1">{fmt(totalMargin)}</b>원</span>
          <span className="text-slate-500">평균 마진율 <b className="text-amber-700 tabular-nums ml-1">{totalMarginRate.toFixed(1)}</b>%</span>
        </div>
      </section>

      {/* 상품별 테이블 */}
      <section className={`${CARD} overflow-hidden`}>
        <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
          <span className="w-[3px] h-[16px] bg-rose-500 rounded-full shrink-0" aria-hidden />
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">상품별 매출</h3>
          <span className="text-[13px] text-slate-500">· 매출 desc · 헤더 클릭 정렬</span>
        </header>
        <div className="overflow-y-auto max-h-[70vh]">
          {loading && aggregated.length === 0 ? (
            <div className="flex items-center justify-center py-16"><Spinner label="조회 중..." size={16} tone="brand" /></div>
          ) : error ? (
            <div className="text-center py-10 text-[14px] text-rose-500">{error}</div>
          ) : aggregated.length === 0 ? (
            <div className="text-center py-10 text-[14px] text-slate-400">데이터 없음</div>
          ) : (
            <table className="w-full text-[14px]">
              <thead className="sticky top-0 bg-slate-100 z-10">
                <tr className="border-b border-slate-200">
                  <th className="pl-5 pr-2 py-2 text-left text-[13px] font-semibold text-slate-700 w-10">#</th>
                  <th onClick={() => toggleSort("name")} className="px-2 py-2 text-left text-[13px] font-semibold text-slate-700 cursor-pointer select-none hover:bg-slate-200/60 transition-colors">상품명{arrow("name")}</th>
                  <th onClick={() => toggleSort("qty")} className="px-2 py-2 text-right text-[13px] font-semibold text-slate-700 w-24 cursor-pointer select-none hover:bg-slate-200/60 transition-colors">수량{arrow("qty")}</th>
                  <th onClick={() => toggleSort("sale")} className="px-2 py-2 text-right text-[13px] font-semibold text-slate-700 w-32 cursor-pointer select-none hover:bg-slate-200/60 transition-colors">매출{arrow("sale")}</th>
                  <th onClick={() => toggleSort("margin")} className="px-2 py-2 text-right text-[13px] font-semibold text-slate-700 w-28 cursor-pointer select-none hover:bg-slate-200/60 transition-colors">마진{arrow("margin")}</th>
                  <th onClick={() => toggleSort("marginRate")} className="px-2 pr-5 py-2 text-right text-[13px] font-semibold text-slate-700 w-24 cursor-pointer select-none hover:bg-slate-200/60 transition-colors">마진율{arrow("marginRate")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const marginRate = r.sale > 0 ? (r.margin / r.sale) * 100 : 0;
                  return (
                    <tr key={r.pcode || r.name || i} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
                      <td className="pl-5 pr-2 py-2 text-[13px] tabular-nums text-slate-400">{i + 1}</td>
                      <td className="px-2 py-2">
                        <div className="text-[14px] font-medium text-ink">{r.name}</div>
                        {r.pcode && <div className="text-[12px] text-slate-400 tabular-nums">{r.pcode}</div>}
                      </td>
                      <td className="px-2 py-2 text-right text-[14px] tabular-nums text-ink">{fmt(r.qty)}</td>
                      <td className="px-2 py-2 text-right text-[14px] tabular-nums font-semibold text-rose-700">{fmt(r.sale)}</td>
                      <td className="px-2 py-2 text-right text-[14px] tabular-nums font-semibold text-emerald-700">{fmt(r.margin)}</td>
                      <td className={`px-2 pr-5 py-2 text-right text-[14px] tabular-nums font-semibold ${marginRate >= 30 ? "text-emerald-700" : marginRate >= 15 ? "text-ink" : "text-rose-600"}`}>
                        {marginRate.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};

export default ProductsReportTab;
