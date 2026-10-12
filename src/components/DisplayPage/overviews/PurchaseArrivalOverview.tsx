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
// 2026-10-12 · 사용자 지시 · 매입단가이상 inner tab · 상품별 매입단가 변동 추적
import { PurchasePriceVariationCard } from "./PurchasePriceVariationCard";
// 2026-10-12 · 사용자 지시 · 매입/발주 overlay chart (bar + line)
import { PurchaseOrderOverlayChart, type PurchaseOrderOverlayDatum } from "./PurchaseOrderOverlayChart";
// 2026-10-12 · 사용자 지시 · 재고·진열 현황 → 매입재고진열현황 inner tab 으로 이동
import { InventoryDisplayOverview } from "./InventoryDisplayOverview";
// 2026-10-12 · 사용자 지시 · 조회기간 필터 전체 통일 · 공통 QuickRangePills + MonthPills
import { QuickRangePills, MonthPills, type QuickRangeKey } from "../../common/OverviewPeriodFilter";
import { Spinner } from "../../common/Spinner";

export interface PurchaseArrivalOverviewProps { onSelectSubTab: (sub: DpSubTabKey) => void; }

// 2026-10-09 · 사용자 지시 · 카드 클릭 → 해당 full-page subTab 이동
//   · 매입이력 → "purchase" (OrderManagePage · purchase-history inner default)
//   · 매입이상 → "overview-order-return" (발주·반품 현황 · match inner tab 안)
//   · 실재고 비교 → "purchase" (purchase > scan 실재고확인 inner tab)

// 홈 톤 CARD (HomeDashboard 패턴)
const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

type AnyRow = Record<string, any>;
// 2026-10-12 · 사용자 리포트 "수량·공급사 안 나와" fix · API 실제 필드명 반영
//   · /api/purchase-details 응답 · quantity (not qty) · supplier_name (not supplier)
type PurchaseRow = {
  purchase_date?: string;
  amount?: number | string;
  product_code?: string;
  product_name?: string;
  supplier_name?: string;
  supplier?: string;  // backward compat (혹시 다른 소스)
  quantity?: number | string;
  qty?: number | string;  // backward compat
  unit_price?: number | string;
};
type MatchRow = { product_code?: string; product_name?: string; supplier?: string; order_qty?: number; purchase_qty?: number; order_date?: string; order_number?: string; match_status?: string; exception_type?: string };
type InvCheckRow = { product_code: string; product_name: string | null; checked_at: string; warehouse1_stock: number | null; warehouse2_stock: number | null; store1_stock: number | null; store2_stock: number | null; store3_stock: number | null };
type ProductRow = { product_code: string; product_name?: string; supplier?: string; current_stock?: number | null; purchase_price?: number | null; sale_price?: number | null };

const ymdDaysAgo = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const today = () => ymdDaysAgo(0);
const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

type LocationKey = "warehouse1_stock" | "warehouse2_stock" | "store1_stock" | "store2_stock" | "store3_stock";

// 2026-10-12 · 사용자 지시 "실재고테이블옆에 매입이력만들어 · 현황판 매입이력 누르면 일루 이동"
// 2026-10-12 · 사용자 지시 · 재고·진열 + 매입이상 inner tab 추가 (별도 메뉴 → 흡수)
type InnerTabKey = "overview" | "real-stock" | "purchase-history" | "inventory-display" | "exception" | "price-variation";

export const PurchaseArrivalOverview: React.FC<PurchaseArrivalOverviewProps> = ({ onSelectSubTab }) => {
  // 2026-10-09 · 사용자 지시 · 현황 | 실재고테이블 inner tab
  const [innerTab, setInnerTab] = useState<InnerTabKey>("overview");
  // 2026-10-12 · 사용자 지시 "매입이력 접힌게 기본" · expandedSuppliers · default 모두 접힘 (Set 비어있음)
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  // 2026-10-12 · 사용자 지시 "페이징으로 다 보여줘" · 각 공급사 안 세부 row 노출 개수 · default 10 · "+N 더 보기" 로 10씩 확장
  const [visiblePerSupplier, setVisiblePerSupplier] = useState<Map<string, number>>(new Map());
  const PAGE_STEP = 10;
  // 2026-10-09 · 사용자 지시 · 위치별 bar 클릭 → 해당 위치 상품 리스트 drawer
  const [locDrawer, setLocDrawer] = useState<{ key: LocationKey; label: string } | null>(null);
  // 2026-10-12 · 공통 QuickRangePills · "today"/"7d"/"14d"/"30d" · default "today"
  //   · 사용자 지시 "기간필터들 기본값은 모두 오늘" · 전체 통일
  //   · 호환 periodDays (effective days) 유지 (match API · 라벨용)
  const [quickRange, setQuickRange] = useState<QuickRangeKey>("today");
  const periodDays = quickRange === "today" ? 1 : quickRange === "7d" ? 7 : quickRange === "14d" ? 14 : quickRange === "30d" ? 30 : 14;
  const period = String(periodDays) as "1" | "7" | "14" | "30";
  // 2026-10-12 · 사용자 지시 · 일별 매입금액 chart · 일별/주간/월별 3-way 토글
  const [chartMode, setChartMode] = useState<"daily" | "weekly" | "monthly">("daily");
  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null);
  const [matchData, setMatchData] = useState<any>(null);
  const [invChecks, setInvChecks] = useState<InvCheckRow[] | null>(null);
  const [productsMap, setProductsMap] = useState<Map<string, ProductRow>>(new Map());
  // 2026-10-12 · 사용자 지시 · 현황판 Spinner 전수 fix · productsMap 로딩 추적 (Map 은 null 체크 X)
  const [productsMapLoading, setProductsMapLoading] = useState<boolean>(true);
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
    // 2026-10-12 · 사용자 지시 "매입이력 다 안올라와" · per_page (Supabase 1000 cap) → limit 모드 (while loop · 전부 수집)
    api.get<{ rows?: PurchaseRow[] }>(`/api/purchase-details?from=${effectiveRange.from}&to=${effectiveRange.to}&no_cycle=1&limit=20000`)
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
    setProductsMapLoading(true);
    api.get<Record<string, ProductRow>>("/api/products-map?fields=slim&include_inactive=1&include_hidden=1")
      .then(({ data }) => {
        if (!alive) return;
        const m = new Map<string, ProductRow>();
        for (const [code, p] of Object.entries(data ?? {})) {
          m.set(String(code), p);
        }
        setProductsMap(m);
      })
      .catch(() => {})
      .finally(() => { if (alive) setProductsMapLoading(false); });
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
      // 2026-10-12 · 전수조사 fix · total(VAT 포함) ?? amount(공급가액) 우선순위 · PurchaseHistoryList 패턴 통일
      const amt = Number((r as any).total ?? r.amount ?? 0);
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

  // 2026-10-12 · 사용자 지시 · "공급사별로 정렬되어져서 공급사별로 보여야 돼"
  //   · 1차 · supplier_name asc (같은 공급사 그룹핑)
  //   · 2차 · purchase_date desc (최근 매입 상단)
  const historyRows = useMemo(() => (purchases ?? []).slice().sort((a, b) => {
    const sa = String(a.supplier_name ?? a.supplier ?? "").trim();
    const sb = String(b.supplier_name ?? b.supplier ?? "").trim();
    if (sa !== sb) return sa.localeCompare(sb, "ko");
    return String(b.purchase_date ?? "").localeCompare(String(a.purchase_date ?? ""));
  }), [purchases]);

  // 2026-10-12 · 사용자 지시 "공급사별 집계 + 현재고·마진율·수량·매입금액·판매가 노출" · bucket 확장
  //   · lastPurchaseDate (max purchase_date) · 공급사명 앞 inline 표시용
  //   · productsMap join · 현재고 · 평균 매입/판매가 · 마진율
  const supplierBuckets = useMemo(() => {
    const m = new Map<string, {
      rows: PurchaseRow[];
      totalQty: number;
      totalAmount: number;
      count: number;
      lastPurchaseDate: string;
      pcodes: Set<string>;
    }>();
    for (const r of historyRows) {
      const sup = String(r.supplier_name ?? r.supplier ?? "").trim() || "(공급사 미지정)";
      let b = m.get(sup);
      if (!b) { b = { rows: [], totalQty: 0, totalAmount: 0, count: 0, lastPurchaseDate: "", pcodes: new Set() }; m.set(sup, b); }
      b.rows.push(r);
      b.totalQty += Number(r.quantity ?? r.qty ?? 0);
      b.totalAmount += Number((r as any).total ?? r.amount ?? 0);
      b.count += 1;
      const pd = String(r.purchase_date ?? "").slice(0, 10);
      if (pd && pd > b.lastPurchaseDate) b.lastPurchaseDate = pd;
      if (r.product_code) b.pcodes.add(String(r.product_code));
    }
    return Array.from(m.entries()).map(([supplier, v]) => {
      // 공급사별 상품 집계 (productsMap join · 현재고·판매가·평균매입가)
      let stockSum = 0;
      let saleSum = 0;
      let saleCount = 0;
      let marginSum = 0;
      let marginCount = 0;
      for (const code of v.pcodes) {
        const p = productsMap.get(code);
        if (!p) continue;
        if (p.current_stock != null) stockSum += Number(p.current_stock);
        if (p.sale_price != null && p.sale_price > 0) {
          saleSum += Number(p.sale_price);
          saleCount += 1;
          if (p.purchase_price != null && p.purchase_price > 0) {
            const margin = ((Number(p.sale_price) - Number(p.purchase_price)) / Number(p.sale_price)) * 100;
            marginSum += margin;
            marginCount += 1;
          }
        }
      }
      const avgSale = saleCount > 0 ? saleSum / saleCount : 0;
      const avgMarginPct = marginCount > 0 ? marginSum / marginCount : 0;
      // 2026-10-12 · 사용자 지시 "공급사별로 묶고 그 안에서 날짜별로 다시 묶어야" · 2-tier 그룹 (공급사 → 날짜)
      //   · 각 날짜 그룹 집계 확장: 건수 · 수량 · 매입금액 · 현재고 · 판매가 · 마진율 (상품 수준 productsMap join)
      const dateMap = new Map<string, { rows: PurchaseRow[]; qty: number; amount: number; count: number }>();
      for (const r of v.rows) {
        const d = String(r.purchase_date ?? "").slice(0, 10) || "-";
        let dg = dateMap.get(d);
        if (!dg) { dg = { rows: [], qty: 0, amount: 0, count: 0 }; dateMap.set(d, dg); }
        dg.rows.push(r);
        dg.qty += Number(r.quantity ?? r.qty ?? 0);
        dg.amount += Number((r as any).total ?? r.amount ?? 0);
        dg.count += 1;
      }
      const dateGroups = Array.from(dateMap.entries())
        .map(([date, g]) => {
          // 날짜별 상품 집계 (productsMap join · 현재고·판매가·마진율)
          const codes = new Set<string>();
          for (const r of g.rows) if (r.product_code) codes.add(String(r.product_code));
          let dgStock = 0;
          let dgSaleSum = 0;
          let dgSaleCount = 0;
          let dgMarginSum = 0;
          let dgMarginCount = 0;
          for (const code of codes) {
            const p = productsMap.get(code);
            if (!p) continue;
            if (p.current_stock != null) dgStock += Number(p.current_stock);
            if (p.sale_price != null && p.sale_price > 0) {
              dgSaleSum += Number(p.sale_price);
              dgSaleCount += 1;
              if (p.purchase_price != null && p.purchase_price > 0) {
                dgMarginSum += ((Number(p.sale_price) - Number(p.purchase_price)) / Number(p.sale_price)) * 100;
                dgMarginCount += 1;
              }
            }
          }
          return {
            date,
            ...g,
            stockSum: dgStock,
            avgSale: dgSaleCount > 0 ? dgSaleSum / dgSaleCount : 0,
            avgMarginPct: dgMarginCount > 0 ? dgMarginSum / dgMarginCount : 0,
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date)); // 최근일 상단
      return {
        supplier,
        rows: v.rows,
        totalQty: v.totalQty,
        totalAmount: v.totalAmount,
        count: v.count,
        lastPurchaseDate: v.lastPurchaseDate,
        stockSum,
        avgSale,
        avgMarginPct,
        dateGroups,
      };
    }).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [historyRows, productsMap]);

  // 2026-10-12 · 날짜 sub-group expand state · key = "{supplier}|{date}"
  const [expandedDateGroups, setExpandedDateGroups] = useState<Set<string>>(new Set());
  const toggleDateGroup = (key: string) => {
    setExpandedDateGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  // 2026-10-12 · 사용자 지시 "공급사에 나오는 데이터 위에 컬럼넣어서 정렬" · 공급사 수준 정렬
  type SupplierSortKey = "lastDate" | "supplier" | "count" | "qty" | "stock" | "sale" | "margin" | "amount";
  const [supplierSort, setSupplierSort] = useState<{ key: SupplierSortKey; dir: "asc" | "desc" }>({ key: "amount", dir: "desc" });
  const toggleSupplierSort = (k: SupplierSortKey) => {
    setSupplierSort(prev => prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "supplier" ? "asc" : "desc" });
  };
  const supplierArrow = (k: SupplierSortKey): string => supplierSort.key !== k ? " ⇅" : supplierSort.dir === "asc" ? " ▲" : " ▼";
  const sortedSuppliers = useMemo(() => {
    const arr = [...supplierBuckets];
    const dir = supplierSort.dir === "asc" ? 1 : -1;
    const key = supplierSort.key;
    arr.sort((a, b) => {
      if (key === "lastDate") return dir * String(a.lastPurchaseDate ?? "").localeCompare(String(b.lastPurchaseDate ?? ""));
      if (key === "supplier") return dir * String(a.supplier).localeCompare(String(b.supplier), "ko");
      if (key === "count") return dir * (a.count - b.count);
      if (key === "qty") return dir * (a.totalQty - b.totalQty);
      if (key === "stock") return dir * (a.stockSum - b.stockSum);
      if (key === "sale") return dir * (a.avgSale - b.avgSale);
      if (key === "margin") return dir * (a.avgMarginPct - b.avgMarginPct);
      /* amount */
      return dir * (a.totalAmount - b.totalAmount);
    });
    return arr;
  }, [supplierBuckets, supplierSort]);

  // 2026-10-12 · 사용자 지시 "헤더자동정렬 + 공급사 안쪽 날짜별 정렬 최근 먼저" · 세부 row (공급사 안쪽) default date desc
  type HistorySortKey = "date" | "product" | "qty" | "unit" | "amount";
  const [historySort, setHistorySort] = useState<{ key: HistorySortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const toggleHistorySort = (k: HistorySortKey) => {
    setHistorySort(prev => prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "product" ? "asc" : "desc" });
  };
  const historyArrow = (k: HistorySortKey): string => historySort.key !== k ? " ⇅" : historySort.dir === "asc" ? " ▲" : " ▼";
  const sortRows = (rows: PurchaseRow[]): PurchaseRow[] => {
    const dir = historySort.dir === "asc" ? 1 : -1;
    const key = historySort.key;
    return [...rows].sort((a, b) => {
      if (key === "date") return dir * String(a.purchase_date ?? "").localeCompare(String(b.purchase_date ?? ""));
      if (key === "product") return dir * String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko");
      if (key === "qty") return dir * (Number(a.quantity ?? a.qty ?? 0) - Number(b.quantity ?? b.qty ?? 0));
      if (key === "unit") return dir * (Number(a.unit_price ?? 0) - Number(b.unit_price ?? 0));
      /* amount */
      return dir * (Number((a as any).total ?? a.amount ?? 0) - Number((b as any).total ?? b.amount ?? 0));
    });
  };

  const toggleSupplier = (sup: string) => {
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(sup)) next.delete(sup); else next.add(sup);
      return next;
    });
  };
  // 2026-10-12 · 페이징 · 공급사별 노출 개수 조회·확장
  const getVisible = (sup: string): number => visiblePerSupplier.get(sup) ?? PAGE_STEP;
  const expandSupplier = (sup: string, total: number) => {
    setVisiblePerSupplier(prev => {
      const next = new Map(prev);
      next.set(sup, Math.min((prev.get(sup) ?? PAGE_STEP) + PAGE_STEP, total));
      return next;
    });
  };
  const expandAllSupplier = (sup: string, total: number) => {
    setVisiblePerSupplier(prev => {
      const next = new Map(prev);
      next.set(sup, total);
      return next;
    });
  };

  const exceptionRows = useMemo<MatchRow[]>(() => {
    const ex = Array.isArray(matchData?.exceptions) ? matchData.exceptions : [];
    const um = Array.isArray(matchData?.unmatched) ? matchData.unmatched : [];
    return [...ex, ...um];
  }, [matchData]);

  // 2026-10-12 · 사용자 지시 "매입단가 달라진 거 체크하는 부분 request/response 넣어놨어 · 참고해서 API 적용"
  //   · 로컬 집계 폐기 → 전용 서버 API `/api/purchases/price-variance` (PriceVarianceTab 참고)
  //   · 응답 shape · PriceVarianceRow[] (purchase_detail_id, previous_price, current_price, change_rate, change_type, effective_review_status, ...)
  //   · 공급사 분리 · 이전 매입 매칭 · review status 서버 집계 (전부 서버 처리)
  type AnomalyRow = {
    purchaseDetailId: number;
    previousPurchaseDetailId: number | null;
    code: string;
    name: string;
    supplier: string;
    previousPrice: number | null;
    currentPrice: number;
    diffAmount: number | null;
    diffPct: number;        // |change_rate| * 100
    changeType: "PRICE_INCREASE" | "PRICE_DECREASE";
    purchaseDate: string;   // YYYY-MM-DD
    reviewStatus: string;   // PENDING | CONFIRMED_CHANGE | NEEDS_CHECK | RESOLVED
  };
  const [priceAnomalies, setPriceAnomalies] = useState<AnomalyRow[]>([]);
  const [priceAnomaliesTotal, setPriceAnomaliesTotal] = useState<number>(0);
  const [priceAnomaliesLoading, setPriceAnomaliesLoading] = useState<boolean>(false);
  // 2026-10-12 · 사용자 지시 · "전품목 검색은 탭 페이지에서만" · 현황판 compact · page_size 50 고정

  // months_list · selectedMonths 있으면 그것, 없으면 현재 월 (period 는 월 단위 API 와 매칭 X)
  const monthsListParam = useMemo(() => {
    if (selectedMonths.length > 0) return selectedMonths.join(",");
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, [selectedMonths]);

  useEffect(() => {
    let alive = true;
    setPriceAnomaliesLoading(true);
    const params = new URLSearchParams();
    params.set("months_list", monthsListParam);
    params.set("sort", "rate");          // 변화율 desc
    // 2026-10-12 · 사용자 지시 · 현황판 compact · page_size 50 고정 (전품목 검색은 탭 페이지로 이관)
    params.set("page_size", "50");
    api.get<any>(`/api/purchases/price-variance?${params}`)
      .then(({ data }) => {
        if (!alive) return;
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        setPriceAnomaliesTotal(Number(data?.total ?? rows.length));
        setPriceAnomalies(rows.map((r: any): AnomalyRow => ({
          purchaseDetailId: Number(r.purchase_detail_id),
          previousPurchaseDetailId: r.previous_purchase_detail_id != null ? Number(r.previous_purchase_detail_id) : null,
          code: String(r.product_code ?? ""),
          name: String(r.product_name ?? ""),
          supplier: String(r.supplier_name ?? ""),
          previousPrice: r.previous_price != null ? Number(r.previous_price) : null,
          currentPrice: Number(r.current_price),
          diffAmount: r.price_difference != null ? Number(r.price_difference) : null,
          diffPct: Math.abs(Number(r.change_rate ?? 0)) * 100,
          changeType: r.change_type,
          purchaseDate: String(r.purchase_date ?? "").slice(0, 10),
          reviewStatus: String(r.effective_review_status ?? "PENDING"),
        })));
      })
      .catch(() => { if (alive) { setPriceAnomalies([]); setPriceAnomaliesTotal(0); } })
      .finally(() => { if (alive) setPriceAnomaliesLoading(false); });
    return () => { alive = false; };
  }, [monthsListParam]);

  // 2026-10-12 · drawer · row 클릭 → 상세 매입 timeline (별도 history API 호출)
  const [priceDrawerCode, setPriceDrawerCode] = useState<number | null>(null); // purchaseDetailId
  const priceDrawerItem = useMemo(
    () => priceAnomalies.find(p => p.purchaseDetailId === priceDrawerCode) ?? null,
    [priceAnomalies, priceDrawerCode],
  );
  const [priceDrawerHistory, setPriceDrawerHistory] = useState<Array<{ purchase_date: string; unit_price: number; quantity: number }> | null>(null);
  useEffect(() => {
    if (priceDrawerCode == null) { setPriceDrawerHistory(null); return; }
    let alive = true;
    api.get<any>(`/api/purchases/price-variance/${priceDrawerCode}/history?limit=20`)
      .then(({ data }) => {
        if (!alive) return;
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        setPriceDrawerHistory(rows.map((h: any) => ({
          purchase_date: String(h.purchase_date ?? "").slice(0, 10),
          unit_price: Number(h.unit_price ?? 0),
          quantity: Number(h.quantity ?? 0),
        })));
      })
      .catch(() => { if (alive) setPriceDrawerHistory([]); });
    return () => { alive = false; };
  }, [priceDrawerCode]);

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
        title="매입·재고·진열 현황"
        description="매입이력 · 일별 매입금액 · 매입이상 · 실재고 vs ERP 재고자산 비교"
        right={
          <div className="flex items-center gap-2 flex-wrap">
            {/* 2026-10-12 · 사용자 지시 · 조회기간 필터 전체 통일 · MonthPills + QuickRangePills (pill 포맷) */}
            <MonthPills selectedMonths={selectedMonths} onChange={setSelectedMonths} monthCount={6} />
            <QuickRangePills value={quickRange} onChange={setQuickRange} showMonthMode={false} />
          </div>
        }
      />
      {/* 2026-10-12 · 사용자 지시 · "현황판 spinner 안나오는 부분 전수조사" fix
          · purchases/matchData/invChecks/productsMap 로딩 중 상단 banner */}
      {(purchases === null || matchData === null || invChecks === null || productsMapLoading) && (
        <div className="px-4 sm:px-6">
          <div className="flex items-center justify-center gap-2 py-2 bg-amber-50 border border-amber-100 rounded-md">
            <Spinner size={12} tone="amber" label="현황판 데이터 불러오는 중..." labelSize={13} />
          </div>
        </div>
      )}

      <OverviewInnerTabs<InnerTabKey>
        ariaLabel="매입 재고 inner tabs"
        active={innerTab}
        onChange={setInnerTab}
        tabs={[
          { k: "overview",          label: "현황",         tone: "sky",     count: null },
          { k: "real-stock",        label: "실재고테이블", tone: "violet",  count: null },
          { k: "purchase-history",  label: "매입이력",     tone: "emerald", count: purchases?.length ?? null },
          // 2026-10-12 · 사용자 지시 · 재고·진열 흡수
          { k: "inventory-display", label: "재고·진열",    tone: "amber",   count: null },
          // 2026-10-12 · 사용자 지시 · 매입이상 inner tab (매입단가 이상 full view)
          { k: "exception",         label: "매입이상",     tone: "rose",    count: exceptionRows.length || null },
          // 2026-10-12 · 사용자 지시 · "매입이상 뒤에 매입단가이상 탭" · 상품별 매입단가 변동 품목
          { k: "price-variation",   label: "매입단가이상", tone: "amber",   count: null },
        ] as const satisfies ReadonlyArray<OverviewInnerTab<InnerTabKey>>}
      />

      {innerTab === "real-stock" ? (
        <div className="px-4 sm:px-6"><RealStockTablePage /></div>
      ) : innerTab === "inventory-display" ? (
        <div className="px-4 sm:px-6"><InventoryDisplayOverview onSelectSubTab={onSelectSubTab} /></div>
      ) : innerTab === "exception" ? (
        /* 2026-10-12 · 사용자 지시 · 매입이상 full view inner tab (단가·수량 전부) · maxHeight 넓게 */
        <div className="px-4 sm:px-6 pt-3">
          <PurchaseExceptionCard
            period={Number(period)}
            maxHeight={9999}
            onViewAll={() => { try { sessionStorage.setItem("overview-order-return.innerTab", "match"); } catch {} onSelectSubTab("overview-order-return"); }}
          />
        </div>
      ) : innerTab === "price-variation" ? (
        /* 2026-10-12 · 사용자 지시 · 매입단가이상 inner tab · 상품별 매입단가 변동 추적 */
        <div className="px-4 sm:px-6 pt-3">
          <PurchasePriceVariationCard />
        </div>
      ) : innerTab === "purchase-history" ? (
        <div className="px-4 sm:px-6 pt-3">
          {/* 2026-10-12 · 사용자 지시 "매입이력 공급사별로 집계" · 공급사별 그룹 header (총 수량/금액/건수) + 접기/펼치기 세부 */}
          <section className={`${CARD} overflow-hidden`}>
            <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
              <span className="w-[3px] h-[16px] bg-emerald-500 rounded-full shrink-0" aria-hidden />
              <Package size={18} weight="fill" className="text-slate-500" />
              <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">매입이력 (공급사별)</h3>
              <span className="text-[14px] text-slate-500 font-medium">· 공급사 {supplierBuckets.length}곳 · 총 {historyRows.length}건</span>
            </header>
            <div className="overflow-y-auto max-h-[70vh]">
              <table className="w-full text-[14px]">
                {/* 2026-10-12 · 사용자 지시 "공급사에 나오는 데이터 위에 컬럼넣어서 정렬" · 공급사 수준 column header (정렬) */}
                <thead className="sticky top-0 bg-slate-100 z-10">
                  <tr className="border-b border-slate-200">
                    <th onClick={() => toggleSupplierSort("lastDate")} className="pl-5 pr-2 py-2 text-left text-[13px] font-semibold text-slate-700 w-[90px] whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/60 transition-colors">
                      최근매입일{supplierArrow("lastDate")}
                    </th>
                    <th onClick={() => toggleSupplierSort("supplier")} className="px-2 py-2 text-left text-[13px] font-semibold text-slate-700 cursor-pointer select-none hover:bg-slate-200/60 transition-colors">
                      공급사{supplierArrow("supplier")}
                    </th>
                    <th onClick={() => toggleSupplierSort("count")} className="px-2 py-2 text-right text-[13px] font-semibold text-slate-700 w-[64px] whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/60 transition-colors">
                      건수{supplierArrow("count")}
                    </th>
                    <th onClick={() => toggleSupplierSort("qty")} className="px-2 py-2 text-right text-[13px] font-semibold text-slate-700 w-[72px] whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/60 transition-colors">
                      수량{supplierArrow("qty")}
                    </th>
                    <th onClick={() => toggleSupplierSort("stock")} className="px-2 py-2 text-right text-[13px] font-semibold text-slate-700 w-[72px] whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/60 transition-colors">
                      현재고{supplierArrow("stock")}
                    </th>
                    <th onClick={() => toggleSupplierSort("sale")} className="px-2 py-2 text-right text-[13px] font-semibold text-slate-700 w-[90px] whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/60 transition-colors">
                      판매가{supplierArrow("sale")}
                    </th>
                    <th onClick={() => toggleSupplierSort("margin")} className="px-2 py-2 text-right text-[13px] font-semibold text-slate-700 w-[72px] whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/60 transition-colors">
                      마진율{supplierArrow("margin")}
                    </th>
                    <th onClick={() => toggleSupplierSort("amount")} className="px-2 pr-5 py-2 text-right text-[13px] font-semibold text-slate-700 w-[120px] whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/60 transition-colors">
                      매입금액{supplierArrow("amount")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSuppliers.length === 0 ? (
                    <tr><td colSpan={8} className="py-10 text-center text-[13px] text-slate-500">{purchases == null ? "불러오는 중..." : "매입이력이 없습니다"}</td></tr>
                  ) : sortedSuppliers.map((b) => {
                    // 2026-10-12 · 사용자 지시 "매입이력 접힌게 기본" · expanded set 반전 (default 접힘)
                    const expanded = expandedSuppliers.has(b.supplier);
                    return (
                      <React.Fragment key={b.supplier}>
                        {/* 2026-10-12 · 사용자 지시 "공급사 앞에 일자표시 · 현재고 마진율 수량 매입금액 판매가" 노출
                            · 최근매입일 (앞) · 공급사명 · 수량 · 매입금액 · 현재고 · 평균판매가 · 마진율 */}
                        {/* 2026-10-12 · 사용자 지시 "공급사 컬러 포인트 · 차이 눈에 들어오게" · 왼쪽 4px indigo strip + bg-indigo-50 */}
                        {/* 2026-10-12 · 공급사 bucket row · 각 column 분리 (thead 와 매칭) · 좌측 indigo strip · bg-indigo-50 */}
                        <tr
                          onClick={() => toggleSupplier(b.supplier)}
                          className="border-b-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 cursor-pointer transition-colors"
                          title={expanded ? "접기" : "펼치기"}
                        >
                          <td className="pl-5 pr-2 py-2.5 text-[13px] tabular-nums text-slate-600 whitespace-nowrap border-l-4 border-indigo-500">
                            <span className={`inline-block transition-transform text-indigo-500 mr-1.5 ${expanded ? "rotate-90" : ""}`} aria-hidden>▸</span>
                            <span className="font-semibold">{b.lastPurchaseDate || "-"}</span>
                          </td>
                          <td className="px-2 py-2.5 text-[15px] font-semibold text-ink truncate">{b.supplier}</td>
                          <td className="px-2 py-2.5 text-right text-[13px] tabular-nums text-slate-600">{fmt(b.count)}건</td>
                          <td className="px-2 py-2.5 text-right text-[14px] tabular-nums font-semibold text-ink">{fmt(b.totalQty)}</td>
                          <td className={`px-2 py-2.5 text-right text-[14px] tabular-nums font-semibold ${b.stockSum > 0 ? "text-ink" : "text-slate-300"}`}>{fmt(b.stockSum)}</td>
                          <td className="px-2 py-2.5 text-right text-[14px] tabular-nums text-ink">{b.avgSale > 0 ? fmt(b.avgSale) : "-"}</td>
                          <td className={`px-2 py-2.5 text-right text-[14px] tabular-nums font-semibold ${b.avgMarginPct >= 20 ? "text-emerald-700" : b.avgMarginPct >= 10 ? "text-ink" : b.avgMarginPct > 0 ? "text-rose-600" : "text-slate-300"}`}>{b.avgMarginPct > 0 ? `${b.avgMarginPct.toFixed(1)}%` : "-"}</td>
                          <td className="px-2 pr-5 py-2.5 text-right text-[14px] tabular-nums font-bold text-ink">{fmt(b.totalAmount)}원</td>
                        </tr>
                        {/* 세부 매입 row · 펼친 상태 · 2026-10-12 사용자 지시 "페이징으로 다 보여줘"
                            · default 10 row 노출 + "+N 더 보기" / "모두 보기" 버튼 */}
                        {/* 2026-10-12 · 사용자 지시 "헤더자동정렬" 반영 · sortRows 적용 · 상품명 들여쓰기 (공급사와 차이) */}
                        {/* 2026-10-12 · 사용자 지시 "날짜별로 묶어줘 + 건수/수량/현재고/판매가/마진율/매입금액"
                            · 공급사 → 날짜 → 상품 2-tier · 날짜 header 각 column 집계 */}
                        {expanded && (
                          <tr className="border-b border-indigo-100 bg-slate-50/40">
                            <td colSpan={8} className="pl-12 pr-5 py-2 border-l-4 border-indigo-200">
                              <table className="w-full text-[13px]">
                                <thead>
                                  <tr className="border-b border-slate-200 bg-white">
                                    <th className="pl-2 pr-2 py-1.5 text-left text-[12px] font-semibold text-slate-500 w-[80px] whitespace-nowrap">일자</th>
                                    <th className="px-2 py-1.5 text-left text-[12px] font-semibold text-slate-500">상품</th>
                                    <th className="px-2 py-1.5 text-right text-[12px] font-semibold text-slate-500 w-[56px] whitespace-nowrap">건수</th>
                                    <th className="px-2 py-1.5 text-right text-[12px] font-semibold text-slate-500 w-[64px] whitespace-nowrap">수량</th>
                                    <th className="px-2 py-1.5 text-right text-[12px] font-semibold text-slate-500 w-[64px] whitespace-nowrap">현재고</th>
                                    <th className="px-2 py-1.5 text-right text-[12px] font-semibold text-slate-500 w-[72px] whitespace-nowrap">판매가</th>
                                    <th className="px-2 py-1.5 text-right text-[12px] font-semibold text-slate-500 w-[64px] whitespace-nowrap">마진율</th>
                                    <th className="pl-2 pr-2 py-1.5 text-right text-[12px] font-semibold text-slate-500 w-[108px] whitespace-nowrap">매입금액</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {b.dateGroups.map((dg) => {
                                    const dgKey = `${b.supplier}|${dg.date}`;
                                    const dgExpanded = expandedDateGroups.has(dgKey);
                                    return (
                                    <React.Fragment key={dgKey}>
                                      {/* 2026-10-12 · 사용자 지시 "날짜별도 접을 수 있게" · default 접힘 · 클릭 토글 */}
                                      <tr
                                        onClick={() => toggleDateGroup(dgKey)}
                                        className="border-b border-emerald-100 bg-emerald-50/60 hover:bg-emerald-100/70 cursor-pointer transition-colors"
                                        title={dgExpanded ? "접기" : "펼치기"}
                                      >
                                        <td className="pl-2 pr-2 py-1.5 text-[13px] font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                                          <span className={`inline-block mr-1 transition-transform text-emerald-500 ${dgExpanded ? "rotate-90" : ""}`} aria-hidden>▸</span>
                                          {dg.date}
                                        </td>
                                        <td className="px-2 py-1.5 text-[12px] text-slate-500">{dg.rows.length}개 상품</td>
                                        <td className="px-2 py-1.5 text-right text-[13px] tabular-nums text-slate-700 font-medium">{fmt(dg.count)}</td>
                                        <td className="px-2 py-1.5 text-right text-[13px] tabular-nums font-semibold text-ink">{fmt(dg.qty)}</td>
                                        <td className={`px-2 py-1.5 text-right text-[13px] tabular-nums font-semibold ${dg.stockSum > 0 ? "text-ink" : "text-slate-300"}`}>{fmt(dg.stockSum)}</td>
                                        <td className="px-2 py-1.5 text-right text-[13px] tabular-nums text-ink">{dg.avgSale > 0 ? fmt(dg.avgSale) : "-"}</td>
                                        <td className={`px-2 py-1.5 text-right text-[13px] tabular-nums font-semibold ${dg.avgMarginPct >= 20 ? "text-emerald-700" : dg.avgMarginPct >= 10 ? "text-ink" : dg.avgMarginPct > 0 ? "text-rose-600" : "text-slate-300"}`}>{dg.avgMarginPct > 0 ? `${dg.avgMarginPct.toFixed(1)}%` : "-"}</td>
                                        <td className="pl-2 pr-2 py-1.5 text-right text-[13px] tabular-nums font-bold text-ink">{fmt(dg.amount)}원</td>
                                      </tr>
                                      {/* 날짜 안 상품 row · 들여쓰기 · dgExpanded 일 때만 */}
                                      {dgExpanded && dg.rows.map((r, i) => {
                                        const p = r.product_code ? productsMap.get(String(r.product_code)) : null;
                                        const pStock = p?.current_stock != null ? Number(p.current_stock) : null;
                                        const pSale = p?.sale_price != null ? Number(p.sale_price) : null;
                                        const pMargin = pSale != null && pSale > 0 && p?.purchase_price != null && Number(p.purchase_price) > 0
                                          ? ((pSale - Number(p.purchase_price)) / pSale) * 100
                                          : null;
                                        return (
                                          <tr key={`${b.supplier}-${dg.date}-${i}`} className="border-b border-slate-100 last:border-b-0 hover:bg-white/60 transition-colors">
                                            <td className="pl-2 pr-2 py-1 text-[12px] tabular-nums text-slate-300 whitespace-nowrap"></td>
                                            <td className="pl-6 pr-2 py-1">
                                              <span className="text-[13px] text-ink font-medium">{r.product_name ?? "-"}</span>
                                              <span className="text-[11px] text-slate-400 tabular-nums ml-1.5">{r.product_code ?? ""}</span>
                                            </td>
                                            <td className="px-2 py-1 text-right text-[12px] tabular-nums text-slate-400">1</td>
                                            <td className="px-2 py-1 text-right text-[13px] tabular-nums text-ink">{fmt(Number(r.quantity ?? r.qty ?? 0))}</td>
                                            <td className={`px-2 py-1 text-right text-[13px] tabular-nums ${pStock != null && pStock > 0 ? "text-slate-600" : "text-slate-300"}`}>{pStock != null ? fmt(pStock) : "-"}</td>
                                            <td className="px-2 py-1 text-right text-[13px] tabular-nums text-slate-500">{pSale != null && pSale > 0 ? fmt(pSale) : "-"}</td>
                                            <td className={`px-2 py-1 text-right text-[13px] tabular-nums ${pMargin != null && pMargin >= 20 ? "text-emerald-600" : pMargin != null && pMargin >= 10 ? "text-slate-600" : pMargin != null && pMargin > 0 ? "text-rose-500" : "text-slate-300"}`}>{pMargin != null && pMargin > 0 ? `${pMargin.toFixed(1)}%` : "-"}</td>
                                            <td className="pl-2 pr-2 py-1 text-right text-[13px] tabular-nums font-semibold text-ink">{fmt(Number((r as any).total ?? r.amount ?? 0))}</td>
                                          </tr>
                                        );
                                      })}
                                    </React.Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                        {expanded && b.rows.length > getVisible(b.supplier) && (
                          <tr className="border-b border-slate-100 bg-slate-50/40">
                            <td colSpan={8} className="px-5 py-2 text-center">
                              <div className="inline-flex items-center gap-2.5 text-[13px]">
                                <span className="text-slate-500 tabular-nums">
                                  {getVisible(b.supplier)}건 / 총 {b.rows.length}건
                                </span>
                                <span className="text-slate-300">·</span>
                                <button
                                  type="button"
                                  onClick={() => expandSupplier(b.supplier, b.rows.length)}
                                  className="font-semibold text-brand-deep hover:text-[#0d3a5c] transition-colors cursor-pointer"
                                >
                                  +{Math.min(PAGE_STEP, b.rows.length - getVisible(b.supplier))}건 더 보기 ▾
                                </button>
                                <span className="text-slate-300">·</span>
                                <button
                                  type="button"
                                  onClick={() => expandAllSupplier(b.supplier, b.rows.length)}
                                  className="font-semibold text-slate-600 hover:text-ink transition-colors cursor-pointer"
                                >
                                  모두 보기 ({b.rows.length - getVisible(b.supplier)}건)
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
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
                    {/* 2026-10-12 · 사용자 지시 · 날짜 줄바꿈 안되게 */}
                    <th className="pl-5 pr-3 py-2 text-left text-[13px] md:text-[14px] font-semibold text-slate-500 w-[108px] whitespace-nowrap">일자</th>
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
                      <td className="pl-5 pr-3 py-2 text-[13px] md:text-[14px] tabular-nums text-slate-500 whitespace-nowrap">{String(r.purchase_date ?? "").slice(0, 10)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col"><span className="text-[14px] text-ink font-medium truncate">{r.product_name ?? "-"}</span><span className="text-[12px] md:text-[13px] text-slate-500 tabular-nums">{r.product_code ?? ""}</span></div>
                      </td>
                      <td className="px-3 py-2 text-[13px] md:text-[14px] text-ink truncate">{r.supplier_name ?? r.supplier ?? "-"}</td>
                      <td className="px-3 py-2 text-right text-[14px] tabular-nums text-ink">{fmt(Number(r.quantity ?? r.qty ?? 0))}</td>
                      <td className="px-3 py-2 text-right text-[14px] tabular-nums text-slate-500">{fmt(Number(r.unit_price ?? 0))}</td>
                      <td className="px-3 pr-5 py-2 text-right text-[14px] tabular-nums font-semibold text-ink">{fmt(Number((r as any).total ?? r.amount ?? 0))}</td>
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
            onViewAll={() => { try { sessionStorage.setItem("overview-order-return.innerTab", "match"); } catch {} onSelectSubTab("overview-order-return"); }}
          />

          {/* 2026-10-12 · 사용자 지시 · "현황판 섹션 클릭 → 매입단가이상 페이지 (price-variation 탭) 이동"
              · section header 또는 "전체보기 →" 버튼 클릭 시 setInnerTab("price-variation") */}
          <section
            className={`${CARD} overflow-hidden cursor-pointer hover:border-rose-300 transition-colors`}
            onClick={() => setInnerTab("price-variation")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setInnerTab("price-variation"); } }}
            title="클릭 · 매입단가이상 탭으로 이동"
          >
            <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100 flex-wrap">
              <span className="w-[3px] h-[16px] bg-rose-500 rounded-full shrink-0" aria-hidden />
              <Warning size={18} weight="fill" className="text-rose-500" />
              <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight flex items-center gap-1.5">
                매입단가 변동 품목
                <span className="text-[12px] text-slate-400 font-medium">→</span>
              </h3>
              <span className="text-[13px] text-slate-500 font-medium tabular-nums">
                · {priceAnomalies.length} / {priceAnomaliesTotal}건 · {effectiveRange.from} ~ {effectiveRange.to}
              </span>
              <span className="ml-auto text-[12px] text-rose-600 font-semibold">전체보기 →</span>
            </header>
            <div className="max-h-[320px] overflow-y-auto">
              {priceAnomaliesLoading && priceAnomalies.length === 0 ? (
                <div className="py-8 text-center text-[13px] md:text-[14px] text-slate-500">불러오는 중...</div>
              ) : priceAnomalies.length === 0 ? (
                <div className="py-8 text-center text-[13px] md:text-[14px] text-slate-500">기간 내 단가 변화 상품 없음</div>
              ) : (
                <table className="w-full text-[14px]">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-200">
                      <th className="pl-5 pr-2 py-1.5 text-left text-[12px] md:text-[13px] font-semibold text-slate-500">상품 / 공급사</th>
                      <th className="px-2 py-1.5 text-left text-[12px] md:text-[13px] font-semibold text-slate-500 w-[90px] whitespace-nowrap">일자</th>
                      <th className="px-2 py-1.5 text-right text-[12px] md:text-[13px] font-semibold text-slate-500 w-[130px]">이전 → 현재</th>
                      <th className="px-2 py-1.5 text-right text-[12px] md:text-[13px] font-semibold text-slate-500 w-[80px]">변화율</th>
                      <th className="px-2 pr-5 py-1.5 text-center text-[12px] md:text-[13px] font-semibold text-slate-500 w-[76px]">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceAnomalies.map((p) => {
                      const isUp = p.changeType === "PRICE_INCREASE";
                      const trendCls = isUp ? "text-rose-600" : "text-emerald-700";
                      const trendArrow = isUp ? "▲" : "▼";
                      const statusCls = p.reviewStatus === "PENDING"
                        ? "text-rose-700 bg-rose-50 border-rose-200"
                        : p.reviewStatus === "CONFIRMED_CHANGE"
                          ? "text-sky-700 bg-sky-50 border-sky-200"
                          : p.reviewStatus === "NEEDS_CHECK"
                            ? "text-amber-700 bg-amber-50 border-amber-200"
                            : "text-slate-500 bg-slate-50 border-slate-200";
                      const statusLabel = p.reviewStatus === "PENDING" ? "미확인"
                        : p.reviewStatus === "CONFIRMED_CHANGE" ? "정상변동"
                        : p.reviewStatus === "NEEDS_CHECK" ? "확인요청"
                        : "처리완료";
                      return (
                        <tr
                          key={p.purchaseDetailId}
                          onClick={() => setPriceDrawerCode(p.purchaseDetailId)}
                          className="border-b border-slate-50 last:border-b-0 hover:bg-rose-50/40 cursor-pointer transition-colors"
                          title="클릭 · 매입 timeline 보기"
                        >
                          <td className="pl-5 pr-2 py-2 align-top">
                            <div className="text-[13px] md:text-[14px] text-ink font-medium truncate" title={p.name}>{p.name || p.code}</div>
                            <div className="text-[12px] text-slate-500 tabular-nums truncate mt-0.5" title={p.supplier}>
                              {p.supplier || "-"} · <span className="text-slate-400">{p.code}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-[12px] text-slate-500 tabular-nums align-top whitespace-nowrap">{p.purchaseDate.slice(5)}</td>
                          <td className="px-2 py-2 text-right text-[13px] tabular-nums align-top whitespace-nowrap">
                            <div className="text-slate-500">{p.previousPrice != null ? fmt(p.previousPrice) : "-"}</div>
                            <div className={`font-semibold ${trendCls}`}>{trendArrow} {fmt(p.currentPrice)}</div>
                          </td>
                          <td className={`px-2 py-2 text-right text-[14px] font-bold tabular-nums align-top ${trendCls}`}>
                            {isUp ? "+" : "−"}{p.diffPct.toFixed(1)}%
                          </td>
                          <td className="px-2 pr-5 py-2 text-center align-top">
                            <span className={`inline-flex items-center justify-center min-w-[48px] h-5 px-1.5 rounded border text-[11px] font-semibold ${statusCls}`}>{statusLabel}</span>
                          </td>
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

            {/* 요약 KPI · API 응답 shape · 이전/현재 2건 */}
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/40 shrink-0 grid grid-cols-3 gap-3">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 font-medium">이전 단가</div>
                <div className="text-[14px] font-bold text-slate-700 tabular-nums mt-0.5">
                  {priceDrawerItem.previousPrice != null ? fmt(priceDrawerItem.previousPrice) : "-"}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 font-medium">현재 단가</div>
                <div className={`text-[14px] font-bold tabular-nums mt-0.5 ${priceDrawerItem.changeType === "PRICE_INCREASE" ? "text-rose-600" : "text-emerald-700"}`}>
                  {fmt(priceDrawerItem.currentPrice)}
                </div>
                <div className="text-[11px] text-slate-400 tabular-nums">{priceDrawerItem.purchaseDate.slice(5)}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 font-medium">변화율</div>
                <div className={`text-[16px] font-bold tabular-nums mt-0.5 ${priceDrawerItem.changeType === "PRICE_INCREASE" ? "text-rose-600" : "text-emerald-700"}`}>
                  {priceDrawerItem.changeType === "PRICE_INCREASE" ? "+" : "−"}{priceDrawerItem.diffPct.toFixed(1)}%
                </div>
                <div className="text-[11px] text-slate-400 tabular-nums">
                  {priceDrawerItem.diffAmount != null && (priceDrawerItem.diffAmount >= 0 ? "+" : "−")}
                  {priceDrawerItem.diffAmount != null ? fmt(Math.abs(priceDrawerItem.diffAmount)) : "-"}원
                </div>
              </div>
            </div>

            {/* timeline body · /history API 응답 */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              <div className="text-[12px] text-slate-500 font-medium mb-2">매입 timeline · 최근 20건</div>
              {priceDrawerHistory == null ? (
                <div className="py-6 text-center text-[13px] text-slate-400">timeline 불러오는 중...</div>
              ) : priceDrawerHistory.length === 0 ? (
                <div className="py-6 text-center text-[13px] text-slate-400">이력 없음</div>
              ) : (
              <ul className="space-y-1.5">
                {priceDrawerHistory.map((rec, idx) => {
                  const prev = idx > 0 ? priceDrawerHistory[idx - 1].unit_price : null;
                  const delta = prev !== null ? rec.unit_price - prev : 0;
                  const deltaPct = prev !== null && prev > 0 ? ((rec.unit_price - prev) / prev) * 100 : 0;
                  const deltaCls = delta > 0 ? "text-rose-600" : delta < 0 ? "text-emerald-700" : "text-slate-400";
                  const deltaArrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "·";
                  return (
                    <li key={`${rec.purchase_date}-${idx}`} className="flex items-center gap-3 bg-slate-50/50 border border-slate-100 rounded-md px-3 py-2">
                      <span className="shrink-0 text-[11px] text-slate-400 tabular-nums w-5 text-right font-medium">{idx + 1}</span>
                      <div className="shrink-0 w-20">
                        <div className="text-[12px] text-slate-500 tabular-nums">{rec.purchase_date.slice(0, 10)}</div>
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <div className="text-[14px] font-bold text-ink tabular-nums">{fmt(rec.unit_price)}원</div>
                      </div>
                      <div className="shrink-0 w-16 text-right">
                        <div className="text-[12px] text-slate-500 tabular-nums">{fmt(rec.quantity)}개</div>
                      </div>
                      <div className={`shrink-0 w-20 text-right text-[13px] font-semibold tabular-nums ${deltaCls}`}>
                        {prev === null ? <span className="text-slate-300">—</span> : `${deltaArrow} ${Math.abs(deltaPct).toFixed(1)}%`}
                      </div>
                    </li>
                  );
                })}
              </ul>
              )}
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
