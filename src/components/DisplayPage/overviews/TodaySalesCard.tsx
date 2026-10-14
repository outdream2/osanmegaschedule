// src/components/DisplayPage/overviews/TodaySalesCard.tsx
// 2026-10-12 · 사용자 지시 · 오늘의 판매현황 (매출현황>상품별 sub tab 상단 default)
//   · /api/erp/sale-day-products · 오늘 자동 로딩
//   · columns · 마진율 / 매입가 / 판매가 / 수량 / 전체금액(매출)
//   · 홈 - 매출현황 상품별탭 연결 지점
//   · 상단 · 마진율별 bar chart (수량 + 금액) · bucket click → slide drawer
//     목적 · "마진이 적은데 많이 나간다거나 마진이 -이거나" 음수/저마진 품목 즉시 포착

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowsVertical, X as XIcon, Warning } from "@phosphor-icons/react";
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend } from "recharts";
import { api } from "../../../lib/apiClient";
import { Spinner } from "../../common/Spinner";

interface DaySaleProductItem {
  pcode: string | null;
  productName: string | null;
  unitSale: number | null;
  totalStock: number | null;
  saleTotal: number | null;
  margin: number | null;
  purchasePrice?: number | null;
  salePrice?: number | null;
  supplier?: string | null;
  lastPurchaseDate?: string | null;
}
interface DayProductApiResponse { ok: boolean; items?: DaySaleProductItem[]; error?: string; }

type SortKey = "name" | "qty" | "amount" | "margin" | "purchase" | "sale";
type SortDir = "asc" | "desc";

const fmt = (n: number | null | undefined): string => n == null ? "—" : Number(n).toLocaleString();
const todayYmd = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface ProductMeta { purchase_price: number | null; sale_price: number | null; supplier: string | null; last_purchase_date: string | null }

// 마진율 bucket · 음수/저/중/고 · 사용자 관심 "마진 적은데 수량 많음 or 음수"
interface MarginBucket { k: string; label: string; min: number; max: number; color: string; }
const MARGIN_BUCKETS: MarginBucket[] = [
  { k: "neg",   label: "손실 (<0%)",   min: -Infinity, max: 0,         color: "#DC2626" }, // rose-600
  { k: "0-10",  label: "저마진 0~10%", min: 0,          max: 10,        color: "#D97706" }, // amber-600
  { k: "10-20", label: "10~20%",       min: 10,         max: 20,        color: "#CA8A04" }, // yellow-600
  { k: "20-30", label: "20~30%",       min: 20,         max: 30,        color: "#64748B" }, // slate-500
  { k: "30-50", label: "30~50%",       min: 30,         max: 50,        color: "#059669" }, // emerald-600
  { k: "50+",   label: "고마진 50%+",  min: 50,         max: Infinity,  color: "#047857" }, // emerald-700
];

export const TodaySalesCard: React.FC = () => {
  const [items, setItems] = useState<DaySaleProductItem[]>([]);
  const [productsMeta, setProductsMeta] = useState<Map<string, ProductMeta>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [drawerBucket, setDrawerBucket] = useState<MarginBucket | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const today = todayYmd();
      const [salesR, metaR] = await Promise.all([
        api.get<DayProductApiResponse>(`/api/erp/sale-day-products?date=${today}`),
        api.get<Record<string, { supplier?: string | null; purchase_price?: number | null; sale_price?: number | null; last_purchase_date?: string | null }>>(
          "/api/products-map?fields=slim&include_inactive=1&include_hidden=1",
        ).catch(() => ({ data: {} })),
      ]);
      if (!salesR.data.ok) throw new Error(salesR.data.error ?? "오늘 판매 조회 실패");
      setItems(salesR.data.items ?? []);
      const m = new Map<string, ProductMeta>();
      const rec = (metaR.data ?? {}) as Record<string, { supplier?: string | null; purchase_price?: number | null; sale_price?: number | null; last_purchase_date?: string | null }>;
      Object.entries(rec).forEach(([pcode, p]) => {
        m.set(pcode, {
          supplier: p?.supplier ?? null,
          purchase_price: p?.purchase_price != null ? Number(p.purchase_price) : null,
          sale_price: p?.sale_price != null ? Number(p.sale_price) : null,
          last_purchase_date: p?.last_purchase_date ?? null,
        });
      });
      setProductsMeta(m);
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const purchasePriceOf = useCallback((r: DaySaleProductItem): number | null => {
    if (r.purchasePrice != null) return Number(r.purchasePrice);
    if (r.pcode) return productsMeta.get(r.pcode)?.purchase_price ?? null;
    return null;
  }, [productsMeta]);
  const salePriceOf = useCallback((r: DaySaleProductItem): number | null => {
    if (r.salePrice != null) return Number(r.salePrice);
    if (r.unitSale != null) return Number(r.unitSale);
    if (r.pcode) return productsMeta.get(r.pcode)?.sale_price ?? null;
    return null;
  }, [productsMeta]);
  const marginRateOf = useCallback((r: DaySaleProductItem): number | null => {
    const sp = salePriceOf(r); const pp = purchasePriceOf(r);
    if (sp == null || sp <= 0) return null;
    const base = pp ?? 0;
    return ((sp - base) / sp) * 100;
  }, [salePriceOf, purchasePriceOf]);

  const bucketOf = useCallback((r: DaySaleProductItem): MarginBucket | null => {
    const rate = marginRateOf(r);
    if (rate == null) return null;
    return MARGIN_BUCKETS.find(b => rate >= b.min && rate < b.max) ?? null;
  }, [marginRateOf]);

  // bucket 집계
  const bucketStats = useMemo(() => {
    const map = new Map<string, { bucket: MarginBucket; qty: number; amount: number; count: number }>();
    for (const b of MARGIN_BUCKETS) map.set(b.k, { bucket: b, qty: 0, amount: 0, count: 0 });
    for (const r of items) {
      if (Number(r.saleTotal ?? 0) <= 0) continue;
      const b = bucketOf(r);
      if (!b) continue;
      const entry = map.get(b.k)!;
      entry.qty += Number(r.totalStock ?? 0);
      entry.amount += Number(r.saleTotal ?? 0);
      entry.count += 1;
    }
    return MARGIN_BUCKETS.map(b => map.get(b.k)!);
  }, [items, bucketOf]);

  const chartData = useMemo(() => bucketStats.map(b => ({
    label: b.bucket.label,
    bucketKey: b.bucket.k,
    color: b.bucket.color,
    qty: b.qty,
    amount: b.amount,
    count: b.count,
  })), [bucketStats]);

  // bucket drawer rows
  const drawerRows = useMemo(() => {
    if (!drawerBucket) return [];
    const list = items.filter(r => {
      if (Number(r.saleTotal ?? 0) <= 0) return false;
      const b = bucketOf(r);
      return b?.k === drawerBucket.k;
    });
    return list.sort((a, b) => Number(b.saleTotal ?? 0) - Number(a.saleTotal ?? 0));
  }, [items, drawerBucket, bucketOf]);

  // table rows (sort)
  const displayRows = useMemo(() => {
    const filtered = items.filter(it => Number(it.saleTotal ?? 0) > 0);
    const sign = sortDir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":     return sign * String(a.productName ?? "").localeCompare(String(b.productName ?? ""), "ko");
        case "qty":      return sign * (Number(a.totalStock ?? 0) - Number(b.totalStock ?? 0));
        case "amount":   return sign * (Number(a.saleTotal ?? 0) - Number(b.saleTotal ?? 0));
        case "margin":   return sign * ((marginRateOf(a) ?? -Infinity) - (marginRateOf(b) ?? -Infinity));
        case "purchase": return sign * ((purchasePriceOf(a) ?? 0) - (purchasePriceOf(b) ?? 0));
        case "sale":     return sign * ((salePriceOf(a) ?? 0) - (salePriceOf(b) ?? 0));
        default:         return 0;
      }
    });
  }, [items, sortKey, sortDir, marginRateOf, purchasePriceOf, salePriceOf]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(prev => prev === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };
  const SortIcon: React.FC<{ k: SortKey }> = ({ k }) =>
    sortKey !== k ? <ArrowsVertical size={10} className="text-slate-300" />
    : sortDir === "desc" ? <ArrowDown size={10} className="text-emerald-700" weight="bold" />
    : <ArrowUp size={10} className="text-emerald-700" weight="bold" />;

  const totalAmount = useMemo(() => displayRows.reduce((s, r) => s + Number(r.saleTotal ?? 0), 0), [displayRows]);
  const totalQty = useMemo(() => displayRows.reduce((s, r) => s + Number(r.totalStock ?? 0), 0), [displayRows]);

  // ESC 닫기
  useEffect(() => {
    if (!drawerBucket) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") setDrawerBucket(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerBucket]);

  return (
    <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
      <header className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-[3px] h-[14px] bg-emerald-500 rounded-full shrink-0" aria-hidden />
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">오늘의 판매현황</h3>
          <span className="text-[12.5px] text-slate-400 font-medium">· {todayYmd()}</span>
          <span className="text-[13px] md:text-[14px] text-slate-400 font-medium tabular-nums">· {displayRows.length}건</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] text-slate-500 font-medium">
            합계 · 수량 <b className="text-ink tabular-nums">{fmt(totalQty)}</b> · 매출 <b className="text-emerald-700 tabular-nums">{fmt(totalAmount)}</b>원
          </span>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="h-7 px-2.5 text-[12.5px] font-medium text-slate-500 hover:text-ink hover:bg-slate-50 rounded-md cursor-pointer transition-colors disabled:opacity-40">
            새로고침
          </button>
        </div>
      </header>

      {/* 마진율별 수량·금액 bar chart · click 시 drawer */}
      {!loading && !error && items.length > 0 && (
        <div className="px-5 py-3 border-b border-slate-100">
          {/* 2026-10-12 · 사용자 지시 · 막대 2개 설명 · 좌축 수량 (진한색) · 우축 금액 (연한색) · bar 클릭 drawer */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Warning size={13} className="text-amber-600" weight="bold" />
            <span className="text-[12.5px] md:text-[13px] font-medium text-slate-600">마진율별 수량·금액</span>
            <span className="text-[12px] text-slate-400">· bar 클릭 → 상품 리스트</span>
            <span className="ml-auto inline-flex items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-slate-400 shrink-0" aria-hidden />
                <span>진한 bar · 수량 (좌축)</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-slate-400/40 border border-slate-300 shrink-0" aria-hidden />
                <span>연한 bar · 금액 (우축)</span>
              </span>
            </span>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={{ stroke: "#CBD5E1" }} />
                <YAxis yAxisId="qty" orientation="left" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={{ stroke: "#CBD5E1" }}
                  label={{ value: "수량", angle: -90, position: "insideLeft", fontSize: 10, fill: "#94A3B8" }} />
                <YAxis yAxisId="amt" orientation="right" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={{ stroke: "#CBD5E1" }}
                  tickFormatter={(v) => `${(Number(v) / 10000).toFixed(0)}만`} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
                  formatter={(value: any, name: any) => {
                    if (name === "수량 (좌축)") return [Number(value).toLocaleString(), "수량"];
                    if (name === "금액 (우축)") return [`${Number(value).toLocaleString()}원`, "금액"];
                    return [value, name];
                  }}
                />
                {/* 2026-10-12 · Recharts Legend · 2 bar 설명 · 가운데 상단 */}
                <Legend
                  verticalAlign="top"
                  align="center"
                  height={24}
                  iconType="rect"
                  iconSize={10}
                  wrapperStyle={{ fontSize: 11, color: "#64748B" }}
                />
                <Bar yAxisId="qty" dataKey="qty" name="수량 (좌축)" radius={[4, 4, 0, 0]} cursor="pointer"
                  onClick={(d: any) => {
                    const b = MARGIN_BUCKETS.find(x => x.k === d.bucketKey);
                    if (b) setDrawerBucket(b);
                  }}>
                  {chartData.map((d) => (<Cell key={d.bucketKey} fill={d.color} />))}
                </Bar>
                <Bar yAxisId="amt" dataKey="amount" name="금액 (우축)" radius={[4, 4, 0, 0]} fillOpacity={0.4} cursor="pointer"
                  onClick={(d: any) => {
                    const b = MARGIN_BUCKETS.find(x => x.k === d.bucketKey);
                    if (b) setDrawerBucket(b);
                  }}>
                  {chartData.map((d) => (<Cell key={d.bucketKey + "-amt"} fill={d.color} />))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* legend · bucket pill */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {chartData.map(d => (
              <button
                key={d.bucketKey}
                type="button"
                onClick={() => {
                  const b = MARGIN_BUCKETS.find(x => x.k === d.bucketKey);
                  if (b) setDrawerBucket(b);
                }}
                disabled={d.count === 0}
                className="inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[11.5px] font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                style={{ borderColor: d.color + "40", color: d.color }}
                title={`${d.label} · ${d.count}건`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />
                {d.label} <span className="tabular-nums opacity-80">· {d.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 리스트 · scrollable (사용자 지시 "스크롤처리") */}
      <div className="flex-1 min-h-0 overflow-auto max-h-[480px]">
        {loading && displayRows.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size={14} tone="zinc" label="오늘 판매 조회 중..." labelSize={13} />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-[13px] text-rose-600 font-medium">
            ERP 조회 실패 · {error}
          </div>
        ) : displayRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-[14px] text-slate-500 font-medium">오늘 판매 없음</div>
            <div className="text-[12.5px] text-slate-400 mt-1">ERP 동기화 또는 매출 발생 후 확인</div>
          </div>
        ) : (
          <table className="w-full text-[13px] md:text-[14px] tabular-nums">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-right w-10 text-[11.5px] font-semibold text-slate-500">No</th>
                <th className="px-3 py-2 text-left text-[11.5px] font-semibold text-slate-500">
                  <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-ink">상품명 <SortIcon k="name" /></button>
                </th>
                <th className="px-3 py-2 text-right text-[11.5px] font-semibold text-slate-500">
                  <button type="button" onClick={() => toggleSort("margin")} className="inline-flex items-center gap-1 hover:text-ink">마진율 <SortIcon k="margin" /></button>
                </th>
                <th className="px-3 py-2 text-right text-[11.5px] font-semibold text-slate-500 hidden md:table-cell">
                  <button type="button" onClick={() => toggleSort("purchase")} className="inline-flex items-center gap-1 hover:text-ink">매입가 <SortIcon k="purchase" /></button>
                </th>
                <th className="px-3 py-2 text-right text-[11.5px] font-semibold text-slate-500 hidden md:table-cell">
                  <button type="button" onClick={() => toggleSort("sale")} className="inline-flex items-center gap-1 hover:text-ink">판매가 <SortIcon k="sale" /></button>
                </th>
                <th className="px-3 py-2 text-right text-[11.5px] font-semibold text-slate-500">
                  <button type="button" onClick={() => toggleSort("qty")} className="inline-flex items-center gap-1 hover:text-ink">수량 <SortIcon k="qty" /></button>
                </th>
                <th className="px-3 py-2 text-right text-[11.5px] font-semibold text-slate-500">
                  <button type="button" onClick={() => toggleSort("amount")} className="inline-flex items-center gap-1 hover:text-ink">전체금액 <SortIcon k="amount" /></button>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r, i) => {
                const pp = purchasePriceOf(r);
                const sp = salePriceOf(r);
                const rate = marginRateOf(r);
                return (
                  <tr key={`${r.pcode ?? i}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-1.5 text-right text-slate-400 text-[12.5px]">{i + 1}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-col min-w-0">
                        <span className="text-ink font-medium truncate" title={r.productName ?? ""}>{r.productName ?? "—"}</span>
                        {(() => {
                          const fb = r.pcode ? productsMeta.get(r.pcode) : null;
                          const supplier = r.supplier ?? fb?.supplier ?? null;
                          const lastP = r.lastPurchaseDate ?? fb?.last_purchase_date ?? null;
                          const parts: Array<React.ReactNode> = [];
                          if (r.pcode) parts.push(<span key="pc" className="tabular-nums">{r.pcode}</span>);
                          if (supplier) parts.push(<span key="sp" className="truncate">{supplier}</span>);
                          if (pp != null) parts.push(<span key="pp" className="tabular-nums">매입 {fmt(pp)}원</span>);
                          if (sp != null) parts.push(<span key="sl" className="tabular-nums">판매 {fmt(sp)}원</span>);
                          if (lastP) parts.push(<span key="lp" className="tabular-nums">최근매입 {String(lastP).slice(5)}</span>);
                          return (
                            <div className="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-slate-400 min-w-0">
                              {parts.map((p, idx) => (
                                <React.Fragment key={idx}>
                                  {idx > 0 && <span className="text-slate-300">·</span>}
                                  {p}
                                </React.Fragment>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {rate == null ? <span className="text-slate-400">—</span>
                        : rate < 0 ? <span className="text-rose-600 font-semibold">−{Math.abs(rate).toFixed(1)}%</span>
                        : <span className="text-emerald-700 font-semibold">{rate.toFixed(1)}%</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right hidden md:table-cell text-slate-600">{fmt(pp)}</td>
                    <td className="px-3 py-1.5 text-right hidden md:table-cell text-slate-600">{fmt(sp)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-ink">{fmt(r.totalStock)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-emerald-700">{fmt(r.saleTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 2026-10-12 · 사용자 지시 · bucket click 시 상품 리스트 slide drawer */}
      {drawerBucket && (
        <>
          <div className="fixed inset-0 bg-slate-900/30 z-40" onClick={() => setDrawerBucket(null)} aria-hidden />
          <aside
            role="dialog"
            aria-label={`${drawerBucket.label} 상품 리스트`}
            className="fixed top-0 right-0 bottom-0 w-full sm:w-[520px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200"
          >
            <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-[3px] h-[14px] rounded-full shrink-0" style={{ backgroundColor: drawerBucket.color }} aria-hidden />
                <h2 className="text-[15px] md:text-[16px] font-semibold text-ink truncate" style={{ color: drawerBucket.color }}>{drawerBucket.label}</h2>
                <span className="text-[12.5px] text-slate-400 font-medium tabular-nums">· {drawerRows.length}건</span>
              </div>
              <button type="button" onClick={() => setDrawerBucket(null)}
                className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="닫기">
                <XIcon size={14} weight="bold" />
              </button>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              {drawerRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="text-[13px] text-slate-500 font-medium">해당 마진율 구간 상품 없음</div>
                </div>
              ) : (
                <ul className="flex flex-col divide-y divide-slate-100">
                  {drawerRows.map((r, i) => {
                    const pp = purchasePriceOf(r);
                    const sp = salePriceOf(r);
                    const rate = marginRateOf(r);
                    return (
                      <li key={`drw-${r.pcode ?? i}`} className="py-2.5 flex items-start gap-2">
                        <span className="text-[11.5px] text-slate-400 tabular-nums shrink-0 w-6 text-right pt-0.5">{i + 1}</span>
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <span className="text-[14px] text-ink font-medium truncate" title={r.productName ?? ""}>{r.productName ?? "—"}</span>
                          <div className="flex items-center gap-2 text-[12px] text-slate-500 tabular-nums flex-wrap">
                            {rate != null && (rate < 0
                              ? <span className="text-rose-600 font-semibold">마진 −{Math.abs(rate).toFixed(1)}%</span>
                              : <span className="text-emerald-700 font-semibold">마진 {rate.toFixed(1)}%</span>)}
                            <span>매입 {fmt(pp)}</span>
                            <span>판매 {fmt(sp)}</span>
                            <span className="text-ink font-semibold">× {fmt(r.totalStock)}개</span>
                          </div>
                        </div>
                        <span className="text-[13.5px] font-bold text-emerald-700 tabular-nums shrink-0">{fmt(r.saleTotal)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <footer className="px-5 py-3 border-t border-slate-200 shrink-0 text-[12.5px] text-slate-500 font-medium">
              합계 수량 <b className="text-ink tabular-nums">{fmt(drawerRows.reduce((s, r) => s + Number(r.totalStock ?? 0), 0))}</b>
              <span className="mx-2">·</span>
              매출 <b className="text-emerald-700 tabular-nums">{fmt(drawerRows.reduce((s, r) => s + Number(r.saleTotal ?? 0), 0))}</b>원
            </footer>
          </aside>
        </>
      )}
    </div>
  );
};

export default TodaySalesCard;
