// src/components/DisplayPage/overviews/PurchaseArrivalOverview.tsx
// 2026-10-09 · 사용자 지시 · 매입 재고현황 재구성
//   · 매입이력 카드 + 일별 매입금액 차트 + 매입이상목록 + 실재고(ERP vs 실제센수량) 금액 비교
//   · 홈 톤 통일 · CARD rounded-[12px] · plain accent · 2-tier typography

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Package, Warning, Scales } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import { api } from "../../../lib/apiClient";
// 2026-10-09 · 사용자 지시 · 실재고테이블 페이지 옮겨와서 현황 옆 inner tab 으로 통합
import { RealStockTablePage } from "../RealStockTablePage";

export interface PurchaseArrivalOverviewProps { onSelectSubTab: (sub: DpSubTabKey) => void; }

// 2026-10-09 · 사용자 지시 · 카드 클릭 → 해당 full-page subTab 이동
//   · 매입이력 → "purchase" (OrderManagePage · purchase-history inner default)
//   · 매입이상 → "overview-order-return" (발주·반품 현황 · match inner tab 안)
//   · 실재고 비교 → "purchase" (purchase > scan 실재고확인 inner tab)

// 홈 톤 CARD (HomeDashboard 패턴)
const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

type AnyRow = Record<string, any>;
type PurchaseRow = { purchase_date?: string; amount?: number | string; product_code?: string; product_name?: string; supplier?: string; qty?: number | string; unit_price?: number | string };
type MatchRow = { product_code?: string; product_name?: string; supplier?: string; order_qty?: number; purchase_qty?: number; order_date?: string; order_number?: string; match_status?: string; exception_type?: string };
type InvCheckRow = { product_code: string; product_name: string | null; checked_at: string; warehouse1_stock: number | null; warehouse2_stock: number | null; store1_stock: number | null; store2_stock: number | null; store3_stock: number | null };
type ProductRow = { product_code: string; product_name?: string; supplier?: string; current_stock?: number | null; purchase_price?: number | null };

const ymdDaysAgo = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const today = () => ymdDaysAgo(0);
const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

type LocationKey = "warehouse1_stock" | "warehouse2_stock" | "store1_stock" | "store2_stock" | "store3_stock";

type InnerTabKey = "overview" | "real-stock";

export const PurchaseArrivalOverview: React.FC<PurchaseArrivalOverviewProps> = ({ onSelectSubTab }) => {
  // 2026-10-09 · 사용자 지시 · 현황 | 실재고테이블 inner tab
  const [innerTab, setInnerTab] = useState<InnerTabKey>("overview");
  // 2026-10-09 · 사용자 지시 · 위치별 bar 클릭 → 해당 위치 상품 리스트 drawer
  const [locDrawer, setLocDrawer] = useState<{ key: LocationKey; label: string } | null>(null);
  const [period, setPeriod] = useState<"7" | "14" | "30">("14");
  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null);
  const [matchData, setMatchData] = useState<any>(null);
  const [invChecks, setInvChecks] = useState<InvCheckRow[] | null>(null);
  const [productsMap, setProductsMap] = useState<Map<string, ProductRow>>(new Map());

  // 1. 매입이력 (purchase-details)
  useEffect(() => {
    let alive = true;
    const to = today();
    const from = ymdDaysAgo(Number(period) - 1);
    api.get<{ rows?: PurchaseRow[] }>(`/api/purchase-details?from=${from}&to=${to}&no_cycle=1&per_page=5000`)
      .then(({ data }) => { if (alive) setPurchases(Array.isArray(data?.rows) ? data.rows : []); })
      .catch(() => { if (alive) setPurchases([]); });
    return () => { alive = false; };
  }, [period]);

  // 2. 매입이상 (order-purchase-match)
  useEffect(() => {
    let alive = true;
    api.get<any>(`/api/order-purchase-match?days=${period}`)
      .then(({ data }) => { if (alive) setMatchData(data ?? {}); })
      .catch(() => { if (alive) setMatchData({}); });
    return () => { alive = false; };
  }, [period]);

  // 3. 실재고 (inventory-checks)
  useEffect(() => {
    let alive = true;
    api.get<InvCheckRow[]>("/api/inventory-checks")
      .then(({ data }) => { if (alive) setInvChecks(Array.isArray(data) ? data : []); })
      .catch(() => { if (alive) setInvChecks([]); });
    return () => { alive = false; };
  }, []);

  // 4. products map (current_stock + purchase_price join)
  useEffect(() => {
    let alive = true;
    api.get<Record<string, ProductRow>>("/api/products-map?fields=slim&include_inactive=1&include_hidden=1")
      .then(({ data }) => {
        if (!alive) return;
        const m = new Map<string, ProductRow>();
        for (const [code, p] of Object.entries(data ?? {})) {
          m.set(String(code), p);
        }
        setProductsMap(m);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // ─── 집계 ───────────────────────────
  const daily = useMemo(() => {
    const n = Number(period);
    const map = new Map<string, { amount: number; count: number }>();
    for (let i = n - 1; i >= 0; i--) map.set(ymdDaysAgo(i), { amount: 0, count: 0 });
    for (const r of (purchases ?? [])) {
      const d = String(r.purchase_date ?? "").slice(0, 10);
      if (!d || !map.has(d)) continue;
      const amt = Number(r.amount ?? 0);
      const prev = map.get(d)!;
      map.set(d, { amount: prev.amount + amt, count: prev.count + 1 });
    }
    return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }));
  }, [purchases, period]);

  const totalAmount = useMemo(() => daily.reduce((s, d) => s + d.amount, 0), [daily]);
  const totalCount = useMemo(() => daily.reduce((s, d) => s + d.count, 0), [daily]);
  const avgAmount = daily.length > 0 ? Math.round(totalAmount / daily.length) : 0;

  const historyRows = useMemo(() => (purchases ?? []).slice().sort((a, b) =>
    String(b.purchase_date ?? "").localeCompare(String(a.purchase_date ?? ""))
  ), [purchases]);

  const exceptionRows = useMemo<MatchRow[]>(() => {
    const ex = Array.isArray(matchData?.exceptions) ? matchData.exceptions : [];
    const um = Array.isArray(matchData?.unmatched) ? matchData.unmatched : [];
    return [...ex, ...um];
  }, [matchData]);

  // 실재고 비교: ERP (current_stock × purchase_price) vs 실제 (sum stocks × purchase_price)
  const stockCompare = useMemo(() => {
    const list = (invChecks ?? []).map(ic => {
      const p = productsMap.get(ic.product_code);
      const unit = Number(p?.purchase_price ?? 0);
      const erpStock = Number(p?.current_stock ?? 0);
      const realStock = Number(ic.warehouse1_stock ?? 0) + Number(ic.warehouse2_stock ?? 0)
        + Number(ic.store1_stock ?? 0) + Number(ic.store2_stock ?? 0) + Number(ic.store3_stock ?? 0);
      const erpAmount = erpStock * unit;
      const realAmount = realStock * unit;
      return {
        code: ic.product_code,
        name: ic.product_name ?? p?.product_name ?? ic.product_code,
        supplier: p?.supplier ?? "-",
        unit, erpStock, realStock, erpAmount, realAmount,
        diffStock: realStock - erpStock, diffAmount: realAmount - erpAmount,
        checked_at: ic.checked_at,
      };
    });
    const totalReal = list.reduce((s, x) => s + x.realAmount, 0);
    const realCount = list.length;
    // 2026-10-09 · 사용자 지시 · ERP 재고자산 전체 (products 전체) · 제품수 포함
    //   · ERP = 모든 products 의 current_stock × purchase_price 합계 (대원칙 #1)
    //   · 제품수 = current_stock > 0 인 products 개수
    let totalErp = 0;
    let erpCount = 0;
    for (const p of productsMap.values()) {
      const s = Number(p.current_stock ?? 0);
      const u = Number(p.purchase_price ?? 0);
      if (s > 0 && u > 0) totalErp += s * u;
      if (s > 0) erpCount++;
    }
    const totalDiff = totalReal - totalErp;
    const mismatchCount = list.filter(x => x.diffStock !== 0).length;
    return { list, totalErp, totalReal, totalDiff, mismatchCount, erpCount, realCount };
  }, [invChecks, productsMap]);

  // 2026-10-09 · 사용자 지시 · 창고1·창고2·매장1·매장2·매장3 재고금액 분포 (실재고 × 사입단가)
  const locationStock = useMemo(() => {
    const bucket = [
      { label: "창고1", key: "warehouse1_stock", amount: 0, qty: 0 },
      { label: "창고2", key: "warehouse2_stock", amount: 0, qty: 0 },
      { label: "매장1", key: "store1_stock", amount: 0, qty: 0 },
      { label: "매장2", key: "store2_stock", amount: 0, qty: 0 },
      { label: "매장3", key: "store3_stock", amount: 0, qty: 0 },
    ];
    for (const ic of (invChecks ?? [])) {
      const unit = Number(productsMap.get(ic.product_code)?.purchase_price ?? 0);
      for (const b of bucket) {
        const q = Number((ic as any)[b.key] ?? 0);
        if (q > 0) {
          b.qty += q;
          b.amount += q * unit;
        }
      }
    }
    const totalQty = bucket.reduce((s, b) => s + b.qty, 0);
    const totalAmt = bucket.reduce((s, b) => s + b.amount, 0);
    return { bucket, totalQty, totalAmt };
  }, [invChecks, productsMap]);

  // ─── Render helpers ────────────────────
  const maxDaily = Math.max(1, ...daily.map(d => d.amount));

  return (
    <div className="flex flex-col gap-5 min-h-0 pb-6 bg-[#F4F7FA]">
      {/* 2026-10-09 · 사용자 지시 · 발주반품현황 상단 디자인 적용 · compact inline hero */}
      <section className="flex items-center gap-2 py-0.5 px-4 sm:px-6 pt-4">
        <span className="w-[3px] h-[14px] bg-sky-500 rounded-full shrink-0" />
        <span className="text-[14px] md:text-[15px] text-slate-700">
          <strong className="font-semibold text-ink">매입 재고현황</strong> · 매입이력 · 일별 매입금액 · 매입이상 · 실재고 vs ERP 재고자산 비교
        </span>
        <select value={period} onChange={(e) => setPeriod(e.target.value as any)}
          className="ml-auto h-8 px-2.5 text-[13px] font-semibold text-ink border border-slate-200 rounded-md bg-white outline-none focus:ring-2 focus:ring-brand-tint cursor-pointer">
          <option value="7">최근 7일</option><option value="14">최근 14일</option><option value="30">최근 30일</option>
        </select>
      </section>

      {/* 2026-10-09 · 사용자 지시 · inner tab bar · OrderReturnOverview 패턴 (count badge + 활성 bottom bar · 프로세스 connector X) */}
      <div className="px-4 sm:px-6">
        <nav className="flex items-stretch border-b border-slate-200 overflow-x-auto -mb-px" aria-label="매입 재고 inner tabs">
          {([
            { k: "overview",   label: "현황",         tone: { bar: "bg-sky-500",    soft: "bg-sky-50" },    count: null },
            { k: "real-stock", label: "실재고테이블", tone: { bar: "bg-violet-500", soft: "bg-violet-50" }, count: null },
          ] as { k: InnerTabKey; label: string; tone: { bar: string; soft: string }; count: number | null }[]).map(t => {
            const active = innerTab === t.k;
            return (
              <button key={t.k} type="button" onClick={() => setInnerTab(t.k)}
                className={`relative shrink-0 px-2.5 h-10 text-[14px] md:text-[15px] font-medium transition-colors cursor-pointer inline-flex items-baseline gap-1.5 whitespace-nowrap ${
                  active ? "text-ink font-semibold" : "text-slate-500 hover:text-ink"
                }`}
              >
                <span>{t.label}</span>
                {t.count != null && (
                  <span className={`text-[13px] md:text-[14px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full ${active ? t.tone.soft + " text-ink" : "bg-slate-100 text-slate-500"}`}>{t.count.toLocaleString()}</span>
                )}
                {active && <span className={`absolute left-0 right-0 -bottom-px h-[2px] ${t.tone.bar} rounded-full`} />}
              </button>
            );
          })}
        </nav>
      </div>

      {innerTab === "real-stock" ? (
        <div className="px-4 sm:px-6"><RealStockTablePage /></div>
      ) : (<>

      {/* 상단 요약 · 단일 라인 inline text (사용자 지시 · KPI card 배지 폐기 · 공간 절약) */}
      <div className="px-4 sm:px-6">
        <div className="flex items-baseline gap-x-6 gap-y-1.5 flex-wrap text-[14px]">
          <span className="text-slate-500">{period}일 매입액 <b className="text-brand-deep tabular-nums ml-1">{fmt(totalAmount)}</b>원</span>
          <span className="text-slate-500">건수 <b className="text-ink tabular-nums ml-1">{fmt(totalCount)}</b>건</span>
          <span className="text-slate-500">매입이상 <b className={`tabular-nums ml-1 ${exceptionRows.length > 0 ? "text-rose-600" : "text-ink"}`}>{fmt(exceptionRows.length)}</b>건</span>
          <span className="text-slate-500">실재고 차이
            <b className={`tabular-nums ml-1 ${stockCompare.totalDiff === 0 ? "text-ink" : stockCompare.totalDiff > 0 ? "text-blue-700" : "text-rose-600"}`}>
              {stockCompare.totalDiff > 0 ? "+" : ""}{fmt(stockCompare.totalDiff)}
            </b>원
          </span>
        </div>
      </div>

      {/* 2-col · LEFT 2fr (chart + history) · RIGHT 1fr (exceptions + stock-compare summary) */}
      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
        <div className="flex flex-col gap-4">
          {/* 일별 매입금액 chart · 2026-10-09 사용자 지시 · 홈 톤 · 긴 좌측 레일 제거 · title 앞 inline 3px 세로줄 */}
          <section className={`${CARD} overflow-hidden`}>
            <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
              <span className="w-[3px] h-[16px] bg-sky-500 rounded-full shrink-0" aria-hidden />
              <div className="min-w-0">
                <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">일별 매입금액</h3>
                <p className="text-[13px] md:text-[14px] text-slate-500 mt-0.5">최근 {period}일 · 총 {fmt(totalAmount)}원 · 일평균 {fmt(avgAmount)}원</p>
              </div>
            </header>
            <div className="px-5 py-4">
              <div className="flex items-end gap-1 h-[160px] border-b border-slate-100 pt-2">
                {daily.map(d => {
                  const h = maxDaily > 0 ? Math.round((d.amount / maxDaily) * 100) : 0;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col justify-end items-center group min-w-0" title={`${d.date} · ${fmt(d.amount)}원 · ${d.count}건`}>
                      <div className={`w-full rounded-t ${d.amount > 0 ? "bg-brand-deep/80 group-hover:bg-brand-deep" : "bg-slate-100"} transition-colors`}
                        style={{ height: `${Math.max(h, 2)}%` }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[11px] md:text-[12px] font-medium text-slate-500 tabular-nums">
                <span>{daily[0]?.date.slice(5) ?? ""}</span>
                <span>{daily[Math.floor(daily.length / 2)]?.date.slice(5) ?? ""}</span>
                <span>{daily[daily.length - 1]?.date.slice(5) ?? ""}</span>
              </div>
            </div>
          </section>

          {/* 위치별 재고 · 2026-10-09 사용자 지시 · 홈 톤 · inline 3px 세로줄 (violet) */}
          <section className={`${CARD} overflow-hidden`}>
            <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
              <span className="w-[3px] h-[16px] bg-violet-500 rounded-full shrink-0" aria-hidden />
              <Package size={18} weight="fill" className="text-slate-500" />
              <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">위치별 재고현황</h3>
              <span className="text-[14px] text-slate-500 font-medium">· 실재고 × 사입단가 · 총 {fmt(locationStock.totalAmt)}원 ({fmt(locationStock.totalQty)}개)</span>
              {/* 2026-10-09 · 사용자 지시 · 같은 페이지의 "실재고테이블" inner tab 으로 이동 (E-4 fix · onSelectSubTab("purchase") 오연결 수정) */}
              <button type="button" onClick={() => setInnerTab("real-stock")}
                className="ml-auto inline-flex items-center gap-0.5 text-[13px] md:text-[14px] font-semibold text-violet-700 hover:text-violet-900 cursor-pointer transition-colors">
                실재고테이블 →
              </button>
            </header>
            <div className="px-5 py-4">
              {(() => {
                // 2026-10-09 · 사용자 지시 · 가로 배치 · 수직 bar + 위치 label
                const maxAmt = Math.max(1, ...locationStock.bucket.map(b => b.amount));
                const colors = ["bg-brand-deep", "bg-brand-deep/70", "bg-violet-500", "bg-violet-500/80", "bg-violet-500/60"];
                return (
                  <div className="grid grid-cols-5 gap-3">
                    {locationStock.bucket.map((b, i) => {
                      const hPct = Math.round((b.amount / maxAmt) * 100);
                      const totalPct = locationStock.totalAmt > 0 ? ((b.amount / locationStock.totalAmt) * 100).toFixed(1) : "0";
                      return (
                        <button key={b.key} type="button"
                          onClick={() => setLocDrawer({ key: b.key as LocationKey, label: b.label })}
                          className="flex flex-col items-center min-w-0 cursor-pointer group text-left"
                          title={`${b.label} 상품 리스트 보기`}
                        >
                          {/* 수직 bar · hover 강조 */}
                          <div className="w-full h-[140px] flex items-end bg-slate-50 group-hover:bg-slate-100 rounded-md p-2 transition-colors">
                            <div className={`w-full ${colors[i]} rounded-sm transition-all group-hover:brightness-110`}
                              style={{ height: `${Math.max(hPct, 2)}%` }} />
                          </div>
                          {/* 라벨 + 금액 */}
                          <div className="mt-2 text-center w-full">
                            <div className="text-[13px] md:text-[14px] font-medium text-ink group-hover:text-brand-deep transition-colors">{b.label}</div>
                            <div className="text-[13px] md:text-[14px] font-bold text-ink tabular-nums mt-0.5 truncate">{fmt(b.amount)}원</div>
                            <div className="text-[12px] text-slate-500 tabular-nums mt-0.5">
                              {fmt(b.qty)}개 · {totalPct}%
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </section>

          {/* 매입이력 · 2026-10-09 사용자 지시 · 홈 톤 · inline 3px 세로줄 (slate) */}
          <section className={`${CARD} overflow-hidden`}>
            <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
              <span className="w-[3px] h-[16px] bg-slate-500 rounded-full shrink-0" aria-hidden />
              <Package size={18} weight="fill" className="text-slate-500" />
              <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">매입이력</h3>
              <span className="text-[14px] text-slate-500 font-medium">· 최근 {period}일 · {historyRows.length}건</span>
              <button type="button" onClick={() => onSelectSubTab("purchase")}
                className="ml-auto inline-flex items-center gap-0.5 text-[13px] md:text-[14px] font-semibold text-brand-deep hover:text-[#0d3a5c] cursor-pointer transition-colors">
                전체보기 →
              </button>
            </header>
            <div className="max-h-[360px] overflow-y-auto">
              <table className="w-full text-[14px]">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-slate-200">
                    <th className="pl-5 pr-3 py-2 text-left text-[13px] md:text-[14px] font-semibold text-slate-500 w-[108px]">일자</th>
                    <th className="px-3 py-2 text-left text-[13px] md:text-[14px] font-semibold text-slate-500">상품</th>
                    <th className="px-3 py-2 text-left text-[13px] md:text-[14px] font-semibold text-slate-500 w-[130px]">공급사</th>
                    <th className="px-3 py-2 text-right text-[13px] md:text-[14px] font-semibold text-slate-500 w-[70px]">수량</th>
                    <th className="px-3 py-2 text-right text-[13px] md:text-[14px] font-semibold text-slate-500 w-[90px]">단가</th>
                    <th className="px-3 pr-5 py-2 text-right text-[13px] md:text-[14px] font-semibold text-slate-500 w-[112px]">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-[13px] text-slate-500">{purchases == null ? "불러오는 중..." : "매입이력이 없습니다"}</td></tr>
                  ) : historyRows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
                      <td className="pl-5 pr-3 py-2 text-[13px] md:text-[14px] tabular-nums text-slate-500">{String(r.purchase_date ?? "").slice(0, 10)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col"><span className="text-[14px] text-ink font-medium truncate">{r.product_name ?? "-"}</span><span className="text-[12px] md:text-[13px] text-slate-500 tabular-nums">{r.product_code ?? ""}</span></div>
                      </td>
                      <td className="px-3 py-2 text-[13px] md:text-[14px] text-ink truncate">{r.supplier ?? "-"}</td>
                      <td className="px-3 py-2 text-right text-[14px] tabular-nums text-ink">{fmt(Number(r.qty ?? 0))}</td>
                      <td className="px-3 py-2 text-right text-[14px] tabular-nums text-slate-500">{fmt(Number(r.unit_price ?? 0))}</td>
                      <td className="px-3 pr-5 py-2 text-right text-[14px] tabular-nums font-semibold text-ink">{fmt(Number(r.amount ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* RIGHT · 매입이상 + 실재고 비교 */}
        <div className="flex flex-col gap-4">
          {/* 매입이상 · 2026-10-09 사용자 지시 · 홈 톤 · inline 3px 세로줄 (rose) */}
          <section className={`${CARD} overflow-hidden`}>
            <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
              <span className="w-[3px] h-[16px] bg-rose-500 rounded-full shrink-0" aria-hidden />
              <Warning size={18} weight="fill" className="text-slate-500" />
              <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">매입이상</h3>
              <span className="text-[14px] text-slate-500 font-medium">· {exceptionRows.length}건</span>
              <button type="button" onClick={() => { try { sessionStorage.setItem("overview-order-return.innerTab", "exception"); } catch {} onSelectSubTab("overview-order-return"); }}
                className="ml-auto inline-flex items-center gap-0.5 text-[13px] md:text-[14px] font-semibold text-brand-deep hover:text-[#0d3a5c] cursor-pointer transition-colors">
                전체보기 →
              </button>
            </header>
            {/* 2026-10-09 · 사용자 지시 · 날짜 · 상품 · 처리현황 column */}
            <div className="max-h-[320px] overflow-y-auto">
              {exceptionRows.length === 0 ? (
                <div className="py-8 text-center text-[13px] md:text-[14px] text-slate-500">{matchData == null ? "불러오는 중..." : "매입이상이 없습니다"}</div>
              ) : (
                <table className="w-full text-[14px]">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-200">
                      <th className="pl-5 pr-2 py-1.5 text-left text-[12px] md:text-[13px] font-semibold text-slate-500 w-[72px]">날짜</th>
                      <th className="px-2 py-1.5 text-left text-[12px] md:text-[13px] font-semibold text-slate-500">상품</th>
                      <th className="px-2 pr-5 py-1.5 text-left text-[12px] md:text-[13px] font-semibold text-slate-500 w-[108px]">처리현황</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptionRows.slice(0, 50).map((r, i) => {
                      const oq = Number(r.order_qty ?? 0);
                      const pq = Number(r.purchase_qty ?? 0);
                      const diff = pq - oq;
                      const status = r.exception_type ?? r.match_status ?? (diff !== 0 ? "수량 불일치" : "미확인");
                      const statusCls = status.includes("완료") ? "text-emerald-700"
                        : status.includes("미") || status.includes("불일치") ? "text-rose-600" : "text-amber-700";
                      return (
                        <tr key={i}
                          onClick={() => { try { sessionStorage.setItem("overview-order-return.innerTab", "exception"); } catch {} onSelectSubTab("overview-order-return"); }}
                          className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/60 cursor-pointer transition-colors"
                          title="클릭 · 발주·매입대조 상품 리스트로 이동"
                        >
                          <td className="pl-5 pr-2 py-2 text-[13px] tabular-nums text-slate-500 align-top">
                            {String(r.order_date ?? "").slice(5, 10) || "-"}
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="text-[13px] md:text-[14px] text-ink font-medium truncate">{r.product_name ?? r.product_code ?? "-"}</div>
                            <div className="text-[12px] text-slate-500 tabular-nums truncate mt-0.5">
                              {r.supplier ?? "-"} · 발주 {fmt(oq)} / 매입 <span className={diff === 0 ? "" : "text-rose-600 font-semibold"}>{fmt(pq)}</span>
                            </div>
                          </td>
                          <td className={`px-2 pr-5 py-2 text-[13px] font-semibold align-top ${statusCls}`}>{status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* 실재고 vs ERP · 2026-10-09 사용자 지시 · 홈 톤 · inline 3px 세로줄 (amber) */}
          <section className={`${CARD} overflow-hidden`}>
            <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
              <span className="w-[3px] h-[16px] bg-amber-500 rounded-full shrink-0" aria-hidden />
              <Scales size={18} weight="fill" className="text-slate-500" />
              <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">실재고현황 vs ERP 재고자산</h3>
              {/* 2026-10-09 · 사용자 지시 · 실재고테이블 → 링크 일단 삭제 */}
            </header>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-[14px]">
                <div className="bg-slate-50 border border-slate-100 rounded-md px-3 py-2">
                  <div className="text-[12px] md:text-[13px] text-slate-500 font-medium">ERP 재고자산</div>
                  <div className="text-[16px] md:text-[17px] font-bold text-ink tabular-nums mt-0.5">{fmt(stockCompare.totalErp)}원</div>
                  <div className="text-[12px] text-slate-500 mt-0.5">현재고 × 사입단가 · 제품수 <b className="text-ink tabular-nums">{fmt(stockCompare.erpCount)}</b></div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-md px-3 py-2">
                  <div className="text-[12px] md:text-[13px] text-slate-500 font-medium">실재고현황</div>
                  <div className="text-[16px] md:text-[17px] font-bold text-ink tabular-nums mt-0.5">{fmt(stockCompare.totalReal)}원</div>
                  <div className="text-[12px] text-slate-500 mt-0.5">실재고 × 사입단가 · 제품수 <b className="text-ink tabular-nums">{fmt(stockCompare.realCount)}</b></div>
                </div>
              </div>
              <div className={`rounded-md px-3 py-2.5 ${stockCompare.totalDiff === 0 ? "bg-emerald-50 border border-emerald-100" : stockCompare.totalDiff > 0 ? "bg-blue-50 border border-blue-100" : "bg-rose-50 border border-rose-100"}`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-semibold text-slate-700">차이</span>
                  <span className={`text-[16px] font-bold tabular-nums ${stockCompare.totalDiff === 0 ? "text-emerald-700" : stockCompare.totalDiff > 0 ? "text-blue-700" : "text-rose-700"}`}>
                    {stockCompare.totalDiff > 0 ? "+" : ""}{fmt(stockCompare.totalDiff)}원
                  </span>
                </div>
                <div className="text-[12px] md:text-[13px] text-slate-500 mt-1">
                  재고 불일치 {stockCompare.mismatchCount}건 / 체크 {stockCompare.list.length}건
                </div>
              </div>
            </div>
            {/* 상세 리스트 (불일치 상위) */}
            {stockCompare.list.length > 0 && (
              <div className="max-h-[260px] overflow-y-auto border-t border-slate-100">
                <table className="w-full text-[13px] md:text-[14px]">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-200">
                      <th className="pl-5 pr-2 py-1.5 text-left text-[12px] font-semibold text-slate-500">상품</th>
                      <th className="px-2 py-1.5 text-right text-[12px] font-semibold text-slate-500">ERP</th>
                      <th className="px-2 py-1.5 text-right text-[12px] font-semibold text-slate-500">실재고</th>
                      <th className="px-2 pr-5 py-1.5 text-right text-[12px] font-semibold text-slate-500">차액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockCompare.list
                      .filter(x => x.diffStock !== 0)
                      .sort((a, b) => Math.abs(b.diffAmount) - Math.abs(a.diffAmount))
                      .slice(0, 30)
                      .map((x, i) => (
                        <tr key={i} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/60">
                          <td className="pl-5 pr-2 py-1.5">
                            <div className="text-[13px] md:text-[14px] text-ink truncate max-w-[200px]">{x.name}</div>
                            <div className="text-[12px] text-slate-500 tabular-nums">{x.code}</div>
                          </td>
                          <td className="px-2 py-1.5 text-right text-[13px] tabular-nums text-slate-500">{fmt(x.erpStock)}</td>
                          <td className="px-2 py-1.5 text-right text-[13px] tabular-nums text-ink">{fmt(x.realStock)}</td>
                          <td className={`px-2 pr-5 py-1.5 text-right text-[13px] tabular-nums font-semibold ${x.diffAmount === 0 ? "text-ink" : x.diffAmount > 0 ? "text-blue-700" : "text-rose-600"}`}>
                            {x.diffAmount > 0 ? "+" : ""}{fmt(x.diffAmount)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      </>)}

      {/* 2026-10-09 · 사용자 지시 · 위치별 상품 리스트 drawer (right-side slide) */}
      <LocationStockDrawer
        location={locDrawer}
        invChecks={invChecks ?? []}
        productsMap={productsMap}
        onClose={() => setLocDrawer(null)}
      />
    </div>
  );
};

// ─── 위치별 상품 리스트 drawer (holmes · 홈 톤) ─────────────────────────
const LocationStockDrawer: React.FC<{
  location: { key: LocationKey; label: string } | null;
  invChecks: InvCheckRow[];
  productsMap: Map<string, ProductRow>;
  onClose: () => void;
}> = ({ location, invChecks, productsMap, onClose }) => {
  useEffect(() => {
    if (!location) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [location, onClose]);

  const open = location != null;
  const items = useMemo(() => {
    if (!location) return [];
    return invChecks
      .map(ic => {
        const qty = Number((ic as any)[location.key] ?? 0);
        if (qty <= 0) return null;
        const p = productsMap.get(ic.product_code);
        const unit = Number(p?.purchase_price ?? 0);
        return {
          code: ic.product_code,
          name: ic.product_name ?? p?.product_name ?? ic.product_code,
          supplier: p?.supplier ?? "-",
          qty, unit, amount: qty * unit,
          checked_at: ic.checked_at,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => b.amount - a.amount);
  }, [location, invChecks, productsMap]);

  const totalQty = items.reduce((s, x) => s + x.qty, 0);
  const totalAmt = items.reduce((s, x) => s + x.amount, 0);

  return (
    <>
      <div onClick={onClose} aria-hidden
        className={`fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 transition-opacity duration-200 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      />
      <aside role="dialog" aria-modal="true"
        className={`fixed top-0 right-0 h-dvh w-full sm:max-w-[520px] bg-white shadow-[-16px_0_48px_-16px_rgba(15,23,42,0.18)] z-50 flex flex-col transition-transform duration-250 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {location && (
          <>
            <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-slate-500">실재고 위치</div>
                <h3 className="text-[16px] md:text-[17px] font-semibold text-ink tracking-tight mt-0.5">
                  {location.label} 상품 리스트
                </h3>
                <p className="text-[13px] text-slate-500 mt-1">
                  총 <b className="text-ink tabular-nums">{Math.round(totalAmt).toLocaleString("ko-KR")}</b>원 ·
                  <b className="text-ink tabular-nums ml-1">{Math.round(totalQty).toLocaleString("ko-KR")}</b>개 · {items.length}종
                </p>
              </div>
              <button type="button" onClick={onClose}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
                aria-label="닫기">
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="py-16 text-center text-[14px] text-slate-500">
                  {location.label}에 재고가 있는 상품이 없습니다
                </div>
              ) : (
                <table className="w-full text-[14px]">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-200">
                      <th className="pl-5 pr-2 py-2 text-left text-[12px] md:text-[13px] font-semibold text-slate-500">상품</th>
                      <th className="px-2 py-2 text-right text-[12px] md:text-[13px] font-semibold text-slate-500 w-[60px]">수량</th>
                      <th className="px-2 py-2 text-right text-[12px] md:text-[13px] font-semibold text-slate-500 w-[88px]">단가</th>
                      <th className="px-2 pr-5 py-2 text-right text-[12px] md:text-[13px] font-semibold text-slate-500 w-[108px]">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((x, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
                        <td className="pl-5 pr-2 py-2">
                          <div className="text-[13px] md:text-[14px] text-ink font-medium truncate">{x.name}</div>
                          <div className="text-[12px] text-slate-500 tabular-nums truncate mt-0.5">
                            {x.code} · {x.supplier}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right text-[14px] tabular-nums text-ink font-semibold">
                          {x.qty.toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right text-[13px] md:text-[14px] tabular-nums text-slate-500">
                          {x.unit > 0 ? x.unit.toLocaleString() : "-"}
                        </td>
                        <td className="px-2 pr-5 py-2 text-right text-[14px] tabular-nums font-semibold text-ink">
                          {x.amount > 0 ? x.amount.toLocaleString() : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
};

export default PurchaseArrivalOverview;
