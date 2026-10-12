// src/components/DisplayPage/overviews/PurchaseArrivalOverview.tsx
// 2026-10-09 · 사용자 지시 · 매입 재고현황 재구성
//   · 매입이력 카드 + 일별 매입금액 차트 + 매입이상목록 + 실재고(ERP vs 실제센수량) 금액 비교
//   · 홈 톤 통일 · CARD rounded-[12px] · plain accent · 2-tier typography

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Package, Warning, Scales } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import { api } from "../../../lib/apiClient";
// 2026-10-09 · UI-4 · 공통 모듈
import { OverviewHero, OverviewInnerTabs, type OverviewInnerTab } from "./OverviewHeader";
// 2026-10-12 · 사용자 지시 · "재고·진열 현황의 기간별 필터 적용" · 월 멀티 선택기 통합
import { useMonthFilter } from "../../../hooks/useMonthFilter";
import { MonthToggleSelector, dateRangesFromMonths } from "../../common/MonthToggleSelector";
// 2026-10-09 · 사용자 지시 · 실재고테이블 페이지 옮겨와서 현황 옆 inner tab 으로 통합
import { RealStockTablePage } from "../RealStockTablePage";
// 2026-10-12 · 사용자 지시 · 매입이상 공통 Card (현재고 column 포함 · "병합")
import { PurchaseExceptionCard } from "./PurchaseExceptionCard";
// 2026-10-12 · 사용자 지시 · 매입/발주 overlay chart (bar + line)
import { PurchaseOrderOverlayChart, type PurchaseOrderOverlayDatum } from "./PurchaseOrderOverlayChart";

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

// 2026-10-12 · 사용자 지시 "실재고테이블옆에 매입이력만들어 · 현황판 매입이력 누르면 일루 이동"
type InnerTabKey = "overview" | "real-stock" | "purchase-history";

export const PurchaseArrivalOverview: React.FC<PurchaseArrivalOverviewProps> = ({ onSelectSubTab }) => {
  // 2026-10-09 · 사용자 지시 · 현황 | 실재고테이블 inner tab
  const [innerTab, setInnerTab] = useState<InnerTabKey>("overview");
  // 2026-10-09 · 사용자 지시 · 위치별 bar 클릭 → 해당 위치 상품 리스트 drawer
  const [locDrawer, setLocDrawer] = useState<{ key: LocationKey; label: string } | null>(null);
  const [period, setPeriod] = useState<"7" | "14" | "30">("14");
  // 2026-10-12 · 사용자 지시 · 일별 매입금액 chart · 일별/주간/월별 3-way 토글
  const [chartMode, setChartMode] = useState<"daily" | "weekly" | "monthly">("daily");
  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null);
  const [matchData, setMatchData] = useState<any>(null);
  const [invChecks, setInvChecks] = useState<InvCheckRow[] | null>(null);
  const [productsMap, setProductsMap] = useState<Map<string, ProductRow>>(new Map());
  // 2026-10-12 · 사용자 지시 · 재고·진열 현황 패턴 복제 · 월 멀티 선택기
  //   · selectedMonths 비어있으면 period (7/14/30일) · 아니면 선택 월 범위
  const { selectedMonths, setSelectedMonths } = useMonthFilter();

  // 월 멀티 → 날짜 범위 변환 (선택 안 하면 period 적용)
  const effectiveRange = useMemo(() => {
    if (selectedMonths.length > 0) {
      const ranges = dateRangesFromMonths(selectedMonths);
      if (ranges.length > 0) {
        // 가장 이른 startDate · 가장 늦은 endDate
        const from = ranges.reduce((min, r) => r.startDate < min ? r.startDate : min, ranges[0].startDate);
        const to = ranges.reduce((max, r) => r.endDate > max ? r.endDate : max, ranges[0].endDate);
        // period 일수 계산 (match API 용)
        const d1 = new Date(from + "T00:00:00");
        const d2 = new Date(to + "T00:00:00");
        const days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
        return { from, to, days };
      }
    }
    const to = today();
    const from = ymdDaysAgo(Number(period) - 1);
    return { from, to, days: Number(period) };
  }, [selectedMonths, period]);

  // 1. 매입이력 (purchase-details)
  useEffect(() => {
    let alive = true;
    api.get<{ rows?: PurchaseRow[] }>(`/api/purchase-details?from=${effectiveRange.from}&to=${effectiveRange.to}&no_cycle=1&per_page=5000`)
      .then(({ data }) => { if (alive) setPurchases(Array.isArray(data?.rows) ? data.rows : []); })
      .catch(() => { if (alive) setPurchases([]); });
    return () => { alive = false; };
  }, [effectiveRange.from, effectiveRange.to]);

  // 2. 매입이상 (order-purchase-match)
  useEffect(() => {
    let alive = true;
    api.get<any>(`/api/order-purchase-match?days=${effectiveRange.days}`)
      .then(({ data }) => { if (alive) setMatchData(data ?? {}); })
      .catch(() => { if (alive) setMatchData({}); });
    return () => { alive = false; };
  }, [effectiveRange.days]);

  // 2026-10-12 · 사용자 지시 · 발주 금액 overlay · /api/order-history fetch
  const [orderHistory, setOrderHistory] = useState<AnyRow[]>([]);
  useEffect(() => {
    let alive = true;
    api.get<{ orders?: AnyRow[] }>(`/api/order-history`)
      .then(({ data }) => { if (alive) setOrderHistory(Array.isArray(data?.orders) ? data.orders : []); })
      .catch(() => { if (alive) setOrderHistory([]); });
    return () => { alive = false; };
  }, []);

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
  // 2026-10-12 · effectiveRange 기반 daily bucket · from~to 날짜 전체 포함
  const daily = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    // from~to 사이 모든 날짜 bucket 생성
    const d0 = new Date(effectiveRange.from + "T00:00:00");
    const d1 = new Date(effectiveRange.to + "T00:00:00");
    for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      map.set(ymd, { amount: 0, count: 0 });
    }
    for (const r of (purchases ?? [])) {
      const dStr = String(r.purchase_date ?? "").slice(0, 10);
      if (!dStr || !map.has(dStr)) continue;
      const amt = Number(r.amount ?? 0);
      const prev = map.get(dStr)!;
      map.set(dStr, { amount: prev.amount + amt, count: prev.count + 1 });
    }
    return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }));
  }, [purchases, effectiveRange.from, effectiveRange.to]);

  const totalAmount = useMemo(() => daily.reduce((s, d) => s + d.amount, 0), [daily]);
  const totalCount = useMemo(() => daily.reduce((s, d) => s + d.count, 0), [daily]);
  const avgAmount = daily.length > 0 ? Math.round(totalAmount / daily.length) : 0;

  // 2026-10-12 · 사용자 지시 · chart 모드별 집계 (일별/주간/월별)
  //   · daily: 기존 N일 bucket 그대로
  //   · weekly: 7일씩 그룹핑 (뒤에서부터 · 최신 주 기준)
  //   · monthly: YYYY-MM 기준 그룹핑
  const chartData = useMemo(() => {
    if (chartMode === "daily") return daily;
    if (chartMode === "weekly") {
      const buckets: Array<{ date: string; amount: number; count: number }> = [];
      for (let i = daily.length - 1; i >= 0; i -= 7) {
        const start = Math.max(0, i - 6);
        const slice = daily.slice(start, i + 1);
        if (slice.length === 0) continue;
        const amount = slice.reduce((s, d) => s + d.amount, 0);
        const count = slice.reduce((s, d) => s + d.count, 0);
        const label = `${slice[0].date.slice(5)}~${slice[slice.length - 1].date.slice(5)}`;
        buckets.unshift({ date: label, amount, count });
      }
      return buckets;
    }
    const map = new Map<string, { amount: number; count: number }>();
    for (const d of daily) {
      const ym = d.date.slice(0, 7);
      const prev = map.get(ym) ?? { amount: 0, count: 0 };
      map.set(ym, { amount: prev.amount + d.amount, count: prev.count + d.count });
    }
    return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }));
  }, [daily, chartMode]);

  // 2026-10-12 · 사용자 지시 · 매입(bar) + 발주(line overlay) 통합 데이터
  //   · period 범위 일별 발주금액 bucket · chartMode 적용
  const overlayChartData: PurchaseOrderOverlayDatum[] = useMemo(() => {
    const n = Number(period);
    const orderDaily = new Map<string, number>();
    for (let i = n - 1; i >= 0; i--) orderDaily.set(ymdDaysAgo(i), 0);
    for (const o of orderHistory) {
      const d = String(o.order_date ?? o.created_at ?? "").slice(0, 10);
      if (!d || !orderDaily.has(d)) continue;
      orderDaily.set(d, (orderDaily.get(d) ?? 0) + Number(o.total_amount ?? 0));
    }
    // chartMode 그대로 적용 · daily 는 기존 chartData 와 1:1 매칭
    if (chartMode === "daily") {
      return chartData.map(d => ({ date: d.date, primary: d.amount, overlay: orderDaily.get(d.date) ?? 0 }));
    }
    if (chartMode === "weekly") {
      const dailyKeys = Array.from(orderDaily.keys()).sort();
      const buckets: PurchaseOrderOverlayDatum[] = [];
      for (let i = dailyKeys.length - 1; i >= 0; i -= 7) {
        const start = Math.max(0, i - 6);
        const slice = dailyKeys.slice(start, i + 1);
        if (slice.length === 0) continue;
        const label = `${slice[0].slice(5)}~${slice[slice.length - 1].slice(5)}`;
        const overlay = slice.reduce((s, k) => s + (orderDaily.get(k) ?? 0), 0);
        const primary = chartData.find(c => c.date === label)?.amount ?? 0;
        buckets.unshift({ date: label, primary, overlay });
      }
      return buckets;
    }
    // monthly
    const monthMap = new Map<string, number>();
    for (const [date, amt] of orderDaily.entries()) {
      const ym = date.slice(0, 7);
      monthMap.set(ym, (monthMap.get(ym) ?? 0) + amt);
    }
    return chartData.map(d => ({ date: d.date, primary: d.amount, overlay: monthMap.get(d.date) ?? 0 }));
  }, [chartData, orderHistory, period, chartMode]);

  const maxChart = useMemo(() => Math.max(1, ...chartData.map(d => d.amount)), [chartData]);
  const chartPeriodLabel = chartMode === "daily" ? `${period}일` : chartMode === "weekly" ? `${chartData.length}주` : `${chartData.length}개월`;
  const chartAvgLabel = chartMode === "daily" ? "일평균" : chartMode === "weekly" ? "주평균" : "월평균";
  const chartAvg = chartData.length > 0 ? Math.round(chartData.reduce((s, d) => s + d.amount, 0) / chartData.length) : 0;

  const historyRows = useMemo(() => (purchases ?? []).slice().sort((a, b) =>
    String(b.purchase_date ?? "").localeCompare(String(a.purchase_date ?? ""))
  ), [purchases]);

  const exceptionRows = useMemo<MatchRow[]>(() => {
    const ex = Array.isArray(matchData?.exceptions) ? matchData.exceptions : [];
    const um = Array.isArray(matchData?.unmatched) ? matchData.unmatched : [];
    return [...ex, ...um];
  }, [matchData]);

  // 2026-10-12 · 사용자 지시 · "매입이상 아래 매입단가 이상 카드 추가 · 매입이력 중 기간 필터 적용해서 단가 변화 있는 것만 리스트업"
  //   · 데이터 소스 · purchases (purchase_details · 기간 period 이미 적용됨)
  //   · 2026-10-12 fix · 사용자 리포트 "데이터 이상" · product_code + supplier 조합으로 그룹
  //     (같은 상품을 다른 공급사에서 매입 시 자연히 단가 다름 · 분리 필수)
  //   · 집계 · 조합 그룹 · unit_price 2개 이상 && 서로 다른 경우만 (실제 단가 변화)
  //   · 지표 · 최초/최종 단가 · 최소/최대 · 변화율 (max-min)/min · 매입 건수
  //   · 정렬 · 변화율 desc (큰 변화 상단)
  const priceAnomalies = useMemo(() => {
    const byKey = new Map<string, {
      code: string;
      name: string;
      supplier: string;
      records: Array<{ price: number; date: string; qty: number }>;
    }>();
    for (const r of purchases ?? []) {
      const code = String(r.product_code ?? "").trim();
      const supplier = String(r.supplier ?? "").trim();
      const price = Number(r.unit_price ?? 0);
      if (!code || !price || price <= 0) continue;
      const date = String(r.purchase_date ?? "").slice(0, 10);
      const qty = Number(r.qty ?? 0);
      // 공급사별 분리 · 같은 상품을 다른 공급사에서 매입 시 각각 집계
      const key = `${code}::${supplier}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          code,
          name: String(r.product_name ?? ""),
          supplier,
          records: [{ price, date, qty }],
        });
      } else {
        existing.records.push({ price, date, qty });
      }
    }
    // 2026-10-12 · 사용자 지시 "계속 진행" · row 클릭 drawer 를 위해 records 포함
    const result: Array<{
      code: string; name: string; supplier: string;
      min: number; max: number; count: number;
      diffPct: number; earliest: number; latest: number;
      earliestDate: string; latestDate: string;
      records: Array<{ price: number; date: string; qty: number }>;
    }> = [];
    for (const [, v] of byKey.entries()) {
      if (v.records.length < 2) continue;
      const prices = v.records.map(x => x.price);
      if (new Set(prices).size <= 1) continue;
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const diffPct = min > 0 ? ((max - min) / min) * 100 : 0;
      const sorted = v.records.slice().sort((a, b) => a.date.localeCompare(b.date));
      result.push({
        code: v.code, name: v.name, supplier: v.supplier,
        min, max, count: v.records.length, diffPct,
        earliest: sorted[0].price, latest: sorted[sorted.length - 1].price,
        earliestDate: sorted[0].date, latestDate: sorted[sorted.length - 1].date,
        records: sorted,
      });
    }
    return result.sort((a, b) => b.diffPct - a.diffPct);
  }, [purchases]);

  // 2026-10-12 · 사용자 지시 "계속 진행" · 매입단가 이상 row 클릭 → 상세 drawer (매입 timeline)
  const [priceDrawerCode, setPriceDrawerCode] = useState<string | null>(null);
  const priceDrawerItem = useMemo(
    () => priceAnomalies.find(p => p.code === priceDrawerCode) ?? null,
    [priceAnomalies, priceDrawerCode],
  );

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

  return (
    <div className="flex flex-col gap-1 md:gap-2 min-h-0 pb-6 bg-[#F4F7FA] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* 2026-10-09 · UI-4 · 공통 모듈 OverviewHero + OverviewInnerTabs
          2026-10-12 · 사용자 지시 · "재고·진열 현황의 기간별 필터 적용"
            · 월 멀티 선택기 (MonthToggleSelector) 추가 · 기존 period select 와 병행
            · 월 선택 시 selectedMonths 범위 사용 · 미선택 시 period 적용 */}
      <OverviewHero
        tone="sky"
        title="매입 재고현황"
        description="매입이력 · 일별 매입금액 · 매입이상 · 실재고 vs ERP 재고자산 비교"
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <MonthToggleSelector
              selectedMonths={selectedMonths}
              onChange={setSelectedMonths}
              maxMonths={6}
              minOne={false}
            />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              disabled={selectedMonths.length > 0}
              className="h-8 px-2.5 text-[13px] font-semibold text-ink border border-slate-200 rounded-md bg-white outline-none focus:ring-2 focus:ring-brand-tint cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title={selectedMonths.length > 0 ? "월 선택 중 · 기간 선택 비활성" : "기간 선택"}
            >
              <option value="7">최근 7일</option><option value="14">최근 14일</option><option value="30">최근 30일</option>
            </select>
          </div>
        }
      />
      <OverviewInnerTabs<InnerTabKey>
        ariaLabel="매입 재고 inner tabs"
        active={innerTab}
        onChange={setInnerTab}
        tabs={[
          { k: "overview",         label: "현황",         tone: "sky",     count: null },
          { k: "real-stock",       label: "실재고테이블", tone: "violet",  count: null },
          { k: "purchase-history", label: "매입이력",     tone: "emerald", count: purchases?.length ?? null },
        ] as const satisfies ReadonlyArray<OverviewInnerTab<InnerTabKey>>}
      />

      {innerTab === "real-stock" ? (
        <div className="px-4 sm:px-6"><RealStockTablePage /></div>
      ) : innerTab === "purchase-history" ? (
        <div className="px-4 sm:px-6 pt-3">
          <section className={`${CARD} overflow-hidden`}>
            <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
              <span className="w-[3px] h-[16px] bg-emerald-500 rounded-full shrink-0" aria-hidden />
              <Package size={18} weight="fill" className="text-slate-500" />
              <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">매입이력</h3>
              <span className="text-[14px] text-slate-500 font-medium">· 최근 {period}일 · {historyRows.length}건</span>
            </header>
            <div className="overflow-y-auto max-h-[70vh]">
              <table className="w-full text-[14px]">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-slate-200">
                    <th className="pl-5 pr-3 py-2 text-left text-[13px] md:text-[14px] font-semibold text-slate-500 w-[108px]">일자</th>
                    <th className="px-3 py-2 text-left text-[13px] md:text-[14px] font-semibold text-slate-500">상품</th>
                    <th className="px-3 py-2 text-left text-[13px] md:text-[14px] font-semibold text-slate-500 w-[140px]">공급사</th>
                    <th className="px-3 py-2 text-right text-[13px] md:text-[14px] font-semibold text-slate-500 w-[70px]">수량</th>
                    <th className="px-3 py-2 text-right text-[13px] md:text-[14px] font-semibold text-slate-500 w-[90px]">단가</th>
                    <th className="px-3 pr-5 py-2 text-right text-[13px] md:text-[14px] font-semibold text-slate-500 w-[112px]">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.length === 0 ? (
                    <tr><td colSpan={6} className="py-10 text-center text-[13px] text-slate-500">{purchases == null ? "불러오는 중..." : "매입이력이 없습니다"}</td></tr>
                  ) : historyRows.map((r, i) => (
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
      ) : (<>

      {/* 상단 요약 · 단일 라인 inline text (사용자 지시 · KPI card 배지 폐기 · 공간 절약)
          2026-10-11 · 사용자 "발주반품현황 여백이 마음에 들어" · nav 아래 pt-3 추가 (OverviewToolbar 리듬 복제) */}
      <div className="px-4 sm:px-6 pt-3">
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

      {/* 2026-10-12 · 사용자 지시 · "글씨 다 나오게 카드 길이 변경" · 2.3fr:1fr → 1.6fr:1.2fr (오른쪽 넓힘 · 매입이상 column 많아짐) */}
      {/* 2-col · LEFT 1.6fr (chart + history) · RIGHT 1.2fr (exceptions + stock-compare) · overflow-x 가능 */}
      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1.6fr_1.2fr] gap-4 items-start">
        <div className="flex flex-col gap-4">
          {/* 2026-10-12 · 사용자 지시 · 매입(bar) + 발주금액(Lollipop overlay) 통합 chart
              · 색상 "발주 녹색 · 매입 다른 색" · 매입 amber · 발주 emerald */}
          <PurchaseOrderOverlayChart
            title={`${chartMode === "daily" ? "일별" : chartMode === "weekly" ? "주간" : "월별"} 매입금액`}
            periodLabel={`최근 ${chartPeriodLabel}`}
            data={overlayChartData}
            primaryLabel="매입금액"
            overlayLabel="발주금액"
            barColor="#D97706"
            lineColor="#059669"
            stripColor="bg-amber-500"
            right={
              <div className="inline-flex items-center bg-slate-100 rounded-md p-0.5 shrink-0" role="tablist" aria-label="차트 모드">
                {([
                  { k: "daily", label: "일별" },
                  { k: "weekly", label: "주간" },
                  { k: "monthly", label: "월별" },
                ] as const).map(opt => (
                  <button
                    key={opt.k}
                    type="button"
                    onClick={() => setChartMode(opt.k)}
                    className={`px-2.5 h-7 text-[13px] font-semibold rounded transition-colors cursor-pointer ${
                      chartMode === opt.k ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"
                    }`}
                    role="tab"
                    aria-selected={chartMode === opt.k}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            }
          />

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
              {/* 2026-10-12 · 사용자 지시 "현황판 매입이력 누르면 일루 이동" · OrderManagePage 대신 같은 overview 안 매입이력 탭으로 이동 */}
              <button type="button" onClick={() => setInnerTab("purchase-history")}
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
          {/* 2026-10-12 · 사용자 지시 · 공통 모듈로 추출 (PurchaseExceptionCard · 발주반품현황 과 "병합")
              · 현재고 column 포함 · 자체 fetch · "매입재고현황정보도 매입이상에 나와야" 반영 */}
          <PurchaseExceptionCard
            period={Number(period)}
            onViewAll={() => { try { sessionStorage.setItem("overview-order-return.innerTab", "exception"); } catch {} onSelectSubTab("overview-order-return"); }}
          />

          {/* 2026-10-12 · 사용자 지시 · 매입이상 아래 "매입단가 이상" 카드
              · 매입이력 (period 적용) 중 같은 상품 단가 변화 있는 것만 리스트업 · 변화율 desc */}
          <section className={`${CARD} overflow-hidden`}>
            <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
              <span className="w-[3px] h-[16px] bg-rose-500 rounded-full shrink-0" aria-hidden />
              <Warning size={18} weight="fill" className="text-rose-500" />
              <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">매입단가 이상</h3>
              <span className="text-[13px] text-slate-500 font-medium">· 최근 {period}일 단가 변화</span>
              <span className={`ml-auto text-[14px] font-bold tabular-nums ${priceAnomalies.length > 0 ? "text-rose-700" : "text-slate-400"}`}>{priceAnomalies.length}건</span>
            </header>
            <div className="max-h-[320px] overflow-y-auto">
              {priceAnomalies.length === 0 ? (
                <div className="py-8 text-center text-[13px] md:text-[14px] text-slate-500">
                  {purchases == null ? "불러오는 중..." : "기간 내 단가 변화 상품 없음"}
                </div>
              ) : (
                <table className="w-full text-[14px]">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-200">
                      <th className="pl-5 pr-2 py-1.5 text-left text-[12px] md:text-[13px] font-semibold text-slate-500">상품 / 공급사</th>
                      <th className="px-2 py-1.5 text-right text-[12px] md:text-[13px] font-semibold text-slate-500 w-[120px]">최초 → 최종</th>
                      <th className="px-2 py-1.5 text-right text-[12px] md:text-[13px] font-semibold text-slate-500 w-[100px]">최소 / 최대</th>
                      <th className="px-2 py-1.5 text-right text-[12px] md:text-[13px] font-semibold text-slate-500 w-[70px]">변화율</th>
                      <th className="px-2 pr-5 py-1.5 text-right text-[12px] md:text-[13px] font-semibold text-slate-500 w-[50px]">건수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceAnomalies.slice(0, 50).map((p, i) => {
                      const trend = p.latest > p.earliest ? "up" : p.latest < p.earliest ? "down" : "flat";
                      const trendCls = trend === "up" ? "text-rose-600" : trend === "down" ? "text-emerald-700" : "text-slate-500";
                      const trendArrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "·";
                      return (
                        <tr
                          key={`${p.code}-${i}`}
                          onClick={() => setPriceDrawerCode(p.code)}
                          className="border-b border-slate-50 last:border-b-0 hover:bg-rose-50/40 cursor-pointer transition-colors"
                          title="클릭 · 매입 timeline 보기"
                        >
                          <td className="pl-5 pr-2 py-2 align-top">
                            <div className="text-[13px] md:text-[14px] text-ink font-medium truncate" title={p.name}>{p.name || p.code}</div>
                            <div className="text-[12px] text-slate-500 tabular-nums truncate mt-0.5" title={p.supplier}>
                              {p.supplier || "-"} · <span className="text-slate-400">{p.code}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right text-[13px] tabular-nums align-top whitespace-nowrap">
                            <div className="text-slate-500">{fmt(p.earliest)}</div>
                            <div className={`font-semibold ${trendCls}`}>{trendArrow} {fmt(p.latest)}</div>
                          </td>
                          <td className="px-2 py-2 text-right text-[12px] tabular-nums text-slate-500 align-top whitespace-nowrap">
                            <div>{fmt(p.min)}</div>
                            <div>{fmt(p.max)}</div>
                          </td>
                          <td className={`px-2 py-2 text-right text-[14px] font-bold tabular-nums align-top ${trendCls}`}>
                            {p.diffPct.toFixed(1)}%
                          </td>
                          <td className="px-2 pr-5 py-2 text-right text-[13px] tabular-nums text-slate-500 align-top">{p.count}</td>
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

      {/* 2026-10-12 · 사용자 지시 "계속 진행" · 매입단가 이상 row 클릭 · 상세 drawer · 매입 timeline */}
      {priceDrawerItem && (
        <>
          <style>{`@keyframes priceAnomalySlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setPriceDrawerCode(null)}
            aria-hidden
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] md:w-[600px] bg-white shadow-2xl flex flex-col"
            style={{ animation: "priceAnomalySlideIn 0.2s ease-out" }}
            role="dialog"
            aria-label="매입단가 변화 상세"
          >
            {/* header */}
            <header className="flex items-start gap-3 px-4 py-3 border-b border-slate-200 shrink-0">
              <span className="w-[3px] h-[16px] bg-rose-500 rounded-full shrink-0 mt-1.5" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-slate-500 font-medium">매입단가 변화 상세</div>
                <h3 className="text-[15px] md:text-[16px] font-semibold text-ink truncate" title={priceDrawerItem.name}>
                  {priceDrawerItem.name || priceDrawerItem.code}
                </h3>
                <div className="text-[12px] text-slate-500 tabular-nums mt-0.5 truncate">
                  {priceDrawerItem.supplier || "-"} · <span className="text-slate-400">{priceDrawerItem.code}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPriceDrawerCode(null)}
                className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-ink hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="닫기"
              >
                ✕
              </button>
            </header>

            {/* 요약 KPI */}
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/40 shrink-0 grid grid-cols-4 gap-3">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 font-medium">최초</div>
                <div className="text-[14px] font-bold text-slate-700 tabular-nums mt-0.5">{fmt(priceDrawerItem.earliest)}</div>
                <div className="text-[11px] text-slate-400 tabular-nums">{priceDrawerItem.earliestDate.slice(5)}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 font-medium">최종</div>
                <div className={`text-[14px] font-bold tabular-nums mt-0.5 ${priceDrawerItem.latest > priceDrawerItem.earliest ? "text-rose-600" : priceDrawerItem.latest < priceDrawerItem.earliest ? "text-emerald-700" : "text-slate-700"}`}>
                  {fmt(priceDrawerItem.latest)}
                </div>
                <div className="text-[11px] text-slate-400 tabular-nums">{priceDrawerItem.latestDate.slice(5)}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 font-medium">최소 / 최대</div>
                <div className="text-[13px] font-semibold text-slate-700 tabular-nums mt-0.5">
                  {fmt(priceDrawerItem.min)}
                </div>
                <div className="text-[13px] font-semibold text-slate-700 tabular-nums">
                  {fmt(priceDrawerItem.max)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 font-medium">변화율</div>
                <div className={`text-[16px] font-bold tabular-nums mt-0.5 ${priceDrawerItem.latest > priceDrawerItem.earliest ? "text-rose-600" : priceDrawerItem.latest < priceDrawerItem.earliest ? "text-emerald-700" : "text-slate-500"}`}>
                  {priceDrawerItem.diffPct.toFixed(1)}%
                </div>
                <div className="text-[11px] text-slate-400 tabular-nums">{priceDrawerItem.count}건</div>
              </div>
            </div>

            {/* timeline body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              <div className="text-[12px] text-slate-500 font-medium mb-2">매입 timeline · 날짜 asc</div>
              <ul className="space-y-1.5">
                {priceDrawerItem.records.map((rec, idx) => {
                  const prev = idx > 0 ? priceDrawerItem.records[idx - 1].price : null;
                  const delta = prev !== null ? rec.price - prev : 0;
                  const deltaPct = prev !== null && prev > 0 ? ((rec.price - prev) / prev) * 100 : 0;
                  const deltaCls = delta > 0 ? "text-rose-600" : delta < 0 ? "text-emerald-700" : "text-slate-400";
                  const deltaArrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "·";
                  return (
                    <li key={`${rec.date}-${idx}`} className="flex items-center gap-3 bg-slate-50/50 border border-slate-100 rounded-md px-3 py-2">
                      <span className="shrink-0 text-[11px] text-slate-400 tabular-nums w-5 text-right font-medium">{idx + 1}</span>
                      <div className="shrink-0 w-20">
                        <div className="text-[12px] text-slate-500 tabular-nums">{rec.date.slice(0, 10)}</div>
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <div className="text-[14px] font-bold text-ink tabular-nums">{fmt(rec.price)}원</div>
                      </div>
                      <div className="shrink-0 w-16 text-right">
                        <div className="text-[12px] text-slate-500 tabular-nums">{fmt(rec.qty)}개</div>
                      </div>
                      <div className={`shrink-0 w-20 text-right text-[13px] font-semibold tabular-nums ${deltaCls}`}>
                        {prev === null ? <span className="text-slate-300">—</span> : `${deltaArrow} ${Math.abs(deltaPct).toFixed(1)}%`}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </>
      )}
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
