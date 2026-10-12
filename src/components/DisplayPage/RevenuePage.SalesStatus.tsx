// src/components/DisplayPage/RevenuePage.SalesStatus.tsx
// 2026-10-10 · #13 · 판매현황 대시보드 (다른 overview 메뉴 패턴 통일)
//
//   레이아웃 (OrderReturnOverview/PurchaseArrivalOverview 패턴 참고):
//     OverviewInnerTabs: [현황 | 구역별 판매현황]
//
//   현황 탭 섹션:
//     [상단 filter] 월 멀티선택 + 상비약 class filter
//     ① KPI 4-strip
//     ② 급상승 Top6
//     ③ 손실 Top6 (Dead stock)
//     ④ 카테고리별 (중분류 bar)
//     ⑤ 구역별 (location bar · 포맷 · 전체)
//     ⑥ 공급사 scorecard (G/Y/R)
//
//   구역별 판매현황 탭:
//     기존 CategoryTab (OrderManagePage/CategoryTab.tsx) lazy embed

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/apiClient";
import { useMonthFilter } from "../../hooks/useMonthFilter";
import { MonthToggleSelector, dateRangesFromMonths } from "../common/MonthToggleSelector";
// 2026-10-12 · 사용자 지시 · 조회기간 필터 전체 통일 · 공통 모듈 (QuickRangePills · QuickRangeKey SSOT)
import { QuickRangePills, type QuickRangeKey } from "../common/OverviewPeriodFilter";
import { formatDisplayLocation } from "../../lib/formatDisplayLocation";
import { OverviewInnerTabs, type OverviewInnerTab } from "./overviews/OverviewHeader";
// 2026-10-11 · 사용자 지시 · 구역별 판매 (요약) 에 매대 이름 · zone_defs 매핑
import { useZoneDefs } from "../../hooks/useZoneDefs";
// 2026-10-11 · 공통 함수 (SSOT) · 포맷 무관 location → zone label 매칭
import { getZoneLabelByLocation } from "../../lib/zoneClassification";
// 2026-10-11 · 사용자 지시 · drawer 안 "판매량 + 마진율" combo chart
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
// 2026-10-12 · 사용자 지시 대원칙 · 마진율 색상 (음수 빨강 "−" / 양수 초록) · 공통 유틸
import { formatMargin } from "../../lib/formatMargin";

const CategoryTab = React.lazy(() => import("../OrderManagePage/CategoryTab").then((m) => ({ default: m.CategoryTab })));
// 2026-10-12 · 사용자 지시 · 매출현황 → 판매현황 inner tab · HourlyReportTab + MonthlyReportTab 재사용
const HourlyReportTab = React.lazy(() => import("./RevenuePage").then((m) => ({ default: m.HourlyReportTab })));
const MonthlyReportTab = React.lazy(() => import("./RevenuePage").then((m) => ({ default: m.MonthlyReportTab })));
// 2026-10-11 · 사용자 지시 재확정 "매장-판매현황-상품별 판매현황 탭에 판매 메뉴 아래의 상품별 판매현황 (= FlowTab) 그대로 embed"
//   · 판매 메뉴 통계 > 상품현황 (= FlowTab · StockManagePage/FlowTab.tsx) 전체 재사용
//   · lazy · 좌 리스트 + 중앙 재고·매입·판매 테이블 + 우 상세 drawer 자체 완결
const FlowTab = React.lazy(() => import("../StockManagePage/FlowTab").then((m) => ({ default: m.FlowTab })));
// 2026-10-12 · 사용자 지시 "이 페이지는 상품판매현황리스트가 나와야지 · UI교체"
//   · FlowTab (상품현황 리스트 · 복잡) 대신 ProductSalesListPanel (판매 중심 compact 리스트) 사용
const ProductSalesListPanel = React.lazy(() => import("./overviews/ProductSalesListPanel").then((m) => ({ default: m.ProductSalesListPanel })));
// 2026-10-12 · 사용자 지시 "판매-손실추적도 판매현황 이너탭으로 이동" · 판매 메뉴 아래 손실추적 탭 (= LossTrackerTab) 재사용
const LossTrackerTab = React.lazy(() => import("../SalesTrendPage/LossTrackerTab").then((m) => ({ default: m.LossTrackerTab })));

function fmtNum(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString("ko-KR");
}
function fmtWonShort(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (abs >= 10000) return `${Math.round(n / 10000).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}
function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function expandRange(startYmd: string, endYmd: string): string[] {
  const list: string[] = [];
  for (let d = startYmd; d <= endYmd; d = addDays(d, 1)) list.push(d);
  return list;
}
function fmtLoc(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const formatted = formatDisplayLocation(s);
  return formatted || s;
}

interface DaySaleItem {
  pcode: string | null;
  productName: string | null;
  buyerCorpName: string | null;
  totalStock: number | null;
  saleTotal: number | null;
  margin: number | null;
  location: string | null;
  class?: string | null;
}
interface DayProductsResp { ok: boolean; items?: DaySaleItem[]; totals?: { count?: number | null }; }
interface ProductMeta {
  pcode?: string | null;
  product_name?: string | null;
  supplier?: string | null;
  display_location?: string | null;
  current_stock?: number | null;
  purchase_price?: number | null;
  category?: string | null;
}

// 2026-10-12 · 사용자 지시 "판매-손실추적도 판매현황 이너탭으로 이동"
// 2026-10-12 · 사용자 지시 · 매출현황 → 판매현황 inner tab (현황 옆에)
type InnerTabKey = "overview" | "revenue" | "zone" | "supplier" | "product" | "loss";
type ClassFilter = "all" | "pre" | "general" | "unknown";
type Status = "good" | "warn" | "risk";
function statusToPill(s: Status) {
  if (s === "good") return { label: "정상", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s === "warn") return { label: "주의", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "위험", cls: "bg-rose-50 text-rose-700 border-rose-200" };
}

// 2026-10-12 · 사용자 지시 · 조회기간 필터 전체 통일 · 공통 모듈 (common/OverviewPeriodFilter) SSOT 로 이관
//   · inline QuickRangePills 정의 삭제 · import 로 교체 (상단 import 블록)

export const SalesStatus: React.FC = () => {
  const [innerTab, setInnerTab] = useState<InnerTabKey>("overview");
  // 2026-10-12 · 매출현황 inner tab · 시간대별/월별 sub tab
  // 2026-10-12 · 사용자 지시 · 매출현황 sub tab · 시간대별/월별/상품별 (3개)
  const [revenueSubTab, setRevenueSubTab] = useState<"hourly" | "monthly" | "product">("hourly");
  const { selectedMonths, setSelectedMonths } = useMonthFilter();
  const [classFilter, setClassFilter] = useState<ClassFilter>("all");
  // 2026-10-12 · Bento Cockpit · Collapse state (overview 구역별 · 공급사)
  const [zoneExpanded, setZoneExpanded] = useState(false);
  const [supplierExpanded, setSupplierExpanded] = useState(false);
  // 2026-10-12 · 사용자 지시 · 구역별 판매현황 inner tab · 오늘 / 7일 / 14일 / 30일 기간 필터 (월별 외 보조 필터)
  // 2026-10-12 · zonePeriod 삭제 · quickRange 로 통합 (SSOT)
  // 2026-10-11 · 사용자 지시 · 구역별 판매 (요약) 매대 이름 매핑
  //   · z.loc 은 fmtLoc 적용 포맷 ("벽 10", "진열대 1A" 등) · formatted key 도 추가
  const { zones: zoneDefsList } = useZoneDefs();
  const locationToLabel = useMemo(() => {
    const m = new Map<string, string>();
    const putBoth = (rawKey: string, label: string) => {
      const upper = rawKey.toUpperCase();
      if (!m.has(upper)) m.set(upper, label);
      const fmt = fmtLoc(rawKey);
      if (fmt && !m.has(fmt)) m.set(fmt, label);
    };
    for (const z of zoneDefsList) {
      // A/B 분리된 side 가 있으면 각 location (예: 1A, 1B) 별로 매핑 (서로 다른 label)
      if (z.__locationA && z.subA) putBoth(z.__locationA, z.subA);
      if (z.__locationB && z.subB) putBoth(z.__locationB, z.subB);
      // base (A/B 없음) 또는 location 단독
      if (z.__location && (z.category || z.label)) {
        putBoth(z.__location, z.category || z.label);
      }
      // num 단독 fallback (예: "22", "35")
      if (!z.__location && (z.category || z.label)) {
        putBoth(String(z.num), z.category || z.label);
      }
    }
    return m;
  }, [zoneDefsList]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [err, setErr] = useState<string>("");
  // 2026-10-11 · 사용자 지시 · 급상승 제품 row 클릭 → 상세 slide drawer
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  // 2026-10-11 · 사용자 지시 · 구역별 판매현황 · 매대 클릭 → 오른쪽 slide drawer (매대 상품 상세)
  const [zoneDrawerKey, setZoneDrawerKey] = useState<string | null>(null);
  type ZoneSortKey = "name" | "qty" | "sale" | "margin";
  const [zoneDrawerSort, setZoneDrawerSort] = useState<{ key: ZoneSortKey; dir: "asc" | "desc" }>({ key: "sale", dir: "desc" });
  const toggleZoneDrawerSort = (key: ZoneSortKey) => {
    setZoneDrawerSort((prev) => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "name" ? "asc" : "desc" });
  };
  // 2026-10-11 · 사용자 지시 · 공급사 Scorecard header 자동정렬
  type SupSortKey = "name" | "skus" | "qty" | "sale" | "margin" | "stockValue" | "stockDays";
  const [supSort, setSupSort] = useState<{ key: SupSortKey; dir: "asc" | "desc" }>({ key: "sale", dir: "desc" });
  const toggleSupSort = (key: SupSortKey) => {
    setSupSort((prev) => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "name" ? "asc" : "desc" });
  };
  const supSortArrow = (k: SupSortKey) => supSort.key === k ? (supSort.dir === "asc" ? "▲" : "▼") : "";
  // 2026-10-11 · 사용자 지시 · drawer 안 테이블 헤더 자동정렬
  type DrawerSortKey = "name" | "loc" | "qty" | "sale" | "margin";
  const [drawerSort, setDrawerSort] = useState<{ key: DrawerSortKey; dir: "asc" | "desc" }>({ key: "sale", dir: "desc" });
  const toggleDrawerSort = (key: DrawerSortKey) => {
    setDrawerSort((prev) => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "name" || key === "loc" ? "asc" : "desc" });
  };

  type ProdEntry = { pcode: string | null; name: string | null; supplier: string | null; location: string | null; cls: string | null; category: string | null; qty: number; sale: number; margin: number };
  const [prodAgg, setProdAgg] = useState<Map<string, ProdEntry>>(new Map());
  const [prevProdQty, setPrevProdQty] = useState<Map<string, number>>(new Map());
  const [metaMap, setMetaMap] = useState<Map<string, ProductMeta>>(new Map());

  // 2026-10-12 · 사용자 지시 · 기간 필터 pill (오늘·7일·14일·한달) · null = 월 선택기 사용
  // 2026-10-12 · 사용자 지시 · "기간필터들 기본값은 모두 오늘" · 전체 통일 default = "today"
  type QuickRange = "today" | "7d" | "14d" | "30d" | null;
  const [quickRange, setQuickRange] = useState<QuickRange>("today");

  const { curDates, prevDates, periodLabel } = useMemo(() => {
    // Quick range 우선 · null 이면 월 선택기 사용
    if (quickRange) {
      const dayCount = quickRange === "today" ? 1 : quickRange === "7d" ? 7 : quickRange === "14d" ? 14 : 30;
      const endC = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
      const startC = addDays(endC, -(dayCount - 1));
      const cur = expandRange(startC, endC);
      const endP = addDays(startC, -1);
      const startP = addDays(endP, -(dayCount - 1));
      const prev = expandRange(startP, endP);
      return { curDates: cur, prevDates: prev, periodLabel: dayCount === 1 ? "오늘" : `${startC} ~ ${endC}` };
    }
    const ranges = dateRangesFromMonths(selectedMonths);
    const cur: string[] = [];
    for (const r of ranges) cur.push(...expandRange(r.startDate, r.endDate));
    cur.sort();
    if (cur.length === 0) return { curDates: [], prevDates: [], periodLabel: "기간 선택 필요" };
    const startC = cur[0];
    const endC = cur[cur.length - 1];
    const totalDays = cur.length;
    const endP = addDays(startC, -1);
    const startP = addDays(endP, -(totalDays - 1));
    const prev = expandRange(startP, endP);
    return { curDates: cur, prevDates: prev, periodLabel: `${startC} ~ ${endC}` };
  }, [selectedMonths, quickRange]);

  const load = useCallback(async () => {
    if (curDates.length === 0) return;
    setStatus("loading"); setErr("");
    try {
      const meta = await api.get<Record<string, ProductMeta>>(`/api/products-map?fields=slim&include_inactive=1`);
      const m = new Map<string, ProductMeta>();
      for (const [code, p] of Object.entries(meta.data ?? {})) {
        if (!p) continue;
        const pcode = String((p as any).pcode ?? code).trim();
        if (pcode) m.set(pcode, p);
      }
      setMetaMap(m);

      const CHUNK = 5;
      const cur = new Map<string, ProdEntry>();
      for (let i = 0; i < curDates.length; i += CHUNK) {
        const batch = curDates.slice(i, i + CHUNK);
        const results = await Promise.all(batch.map((d) =>
          api.get<DayProductsResp>(`/api/erp/sale-day-products?date=${d}`).then((r) => r.data).catch(() => ({ ok: false } as DayProductsResp))
        ));
        for (const r of results) {
          for (const it of (r?.items ?? [])) {
            const key = String(it.pcode ?? it.productName ?? "").trim();
            if (!key) continue;
            const q = it.totalStock ?? 0;
            const s = it.saleTotal ?? 0;
            const mg = it.margin ?? 0;
            const prev = cur.get(key);
            const metaRow = it.pcode ? m.get(it.pcode) : null;
            if (prev) { prev.qty += q; prev.sale += s; prev.margin += mg; }
            else cur.set(key, {
              pcode: it.pcode, name: it.productName,
              supplier: it.buyerCorpName, location: it.location,
              cls: it.class ?? "unknown",
              category: metaRow?.category ?? null,
              qty: q, sale: s, margin: mg,
            });
          }
        }
      }
      setProdAgg(cur);

      const prev = new Map<string, number>();
      for (let i = 0; i < prevDates.length; i += CHUNK) {
        const batch = prevDates.slice(i, i + CHUNK);
        const results = await Promise.all(batch.map((d) =>
          api.get<DayProductsResp>(`/api/erp/sale-day-products?date=${d}`).then((r) => r.data).catch(() => ({ ok: false } as DayProductsResp))
        ));
        for (const r of results) {
          for (const it of (r?.items ?? [])) {
            const key = String(it.pcode ?? it.productName ?? "").trim();
            if (!key) continue;
            prev.set(key, (prev.get(key) ?? 0) + (it.totalStock ?? 0));
          }
        }
      }
      setPrevProdQty(prev);
      setStatus("success");
    } catch (e) {
      setErr((e as Error).message ?? "조회 실패");
      setStatus("error");
    }
  }, [curDates, prevDates]);

  // 2026-10-11 · 사용자 지시 "공급사별 월멀티선택 기간별 조회·로딩중" · zone 탭 제외 전부 load (overview/supplier/product · 월선택 변경 시 자동 재조회)
  useEffect(() => { if (innerTab !== "zone") load(); }, [load, innerTab]);

  const nDays = curDates.length;

  const filteredItems = useMemo(() => {
    const all = Array.from(prodAgg.values()).filter((x) => x.qty > 0);
    if (classFilter === "all") return all;
    return all.filter((x) => (x.cls ?? "unknown") === classFilter);
  }, [prodAgg, classFilter]);

  const filteredMetaEntries = useMemo(() => {
    const list: Array<[string, ProductMeta]> = [];
    for (const [pcode, meta] of metaMap) {
      if (classFilter !== "all") {
        const sold = prodAgg.get(pcode);
        const cls = sold?.cls ?? "unknown";
        if (cls !== classFilter) continue;
      }
      list.push([pcode, meta]);
    }
    return list;
  }, [metaMap, prodAgg, classFilter]);

  const kpi = useMemo(() => {
    const totalQty = filteredItems.reduce((s, x) => s + x.qty, 0);
    const totalSale = filteredItems.reduce((s, x) => s + x.sale, 0);
    const activeProducts = filteredItems.length;
    const activeSupSet = new Set<string>();
    for (const x of filteredItems) if (x.supplier) activeSupSet.add(x.supplier);
    let action = 0;
    for (const x of filteredItems) {
      const meta = x.pcode ? metaMap.get(x.pcode) : null;
      const stock = meta?.current_stock ?? 0;
      if (stock > 0 && x.qty > 0 && nDays > 0) {
        const daily = x.qty / nDays;
        const daysLeft = daily > 0 ? stock / daily : 999;
        if (daysLeft < 7) action += 1;
      }
    }
    for (const [pcode, meta] of filteredMetaEntries) {
      const stock = Number(meta.current_stock ?? 0);
      if (stock <= 0) continue;
      const sold = prodAgg.get(pcode);
      if (!sold || sold.qty === 0) action += 1;
    }
    // 2026-10-12 · 사용자 지시 "한눈에 재구성" · 전기 대비 성장률 추가
    //   · 전기 수량 합산 → 당기 vs 전기 성장률 (전기 sale 데이터 없어 수량 기준)
    let totalPrevQty = 0;
    for (const cur of filteredItems) {
      const key = String(cur.pcode ?? cur.name ?? "").trim();
      if (!key) continue;
      totalPrevQty += prevProdQty.get(key) ?? 0;
    }
    const growthPct = totalPrevQty > 0 ? ((totalQty - totalPrevQty) / totalPrevQty) * 100 : null;
    return { totalQty, totalSale, activeProducts, activeSuppliers: activeSupSet.size, action, totalPrevQty, growthPct };
  }, [filteredItems, filteredMetaEntries, metaMap, prodAgg, prevProdQty, nDays]);

  const topRising = useMemo(() => {
    const list: Array<{ key: string; name: string | null; curQty: number; prevQty: number; growthPct: number }> = [];
    for (const cur of filteredItems) {
      const key = String(cur.pcode ?? cur.name ?? "").trim();
      if (!key) continue;
      const prev = prevProdQty.get(key) ?? 0;
      if (prev < 3 || cur.qty < 3) continue;
      const growth = ((cur.qty - prev) / prev) * 100;
      if (growth <= 0) continue;
      list.push({ key, name: cur.name, curQty: cur.qty, prevQty: prev, growthPct: growth });
    }
    list.sort((a, b) => b.growthPct - a.growthPct);
    return list.slice(0, 6);
  }, [filteredItems, prevProdQty]);

  // 2026-10-12 · 사용자 지시 · "손실추적페이지에 나오는 정보가 여기 나오게해"
  //   · 손실추적 공식 통합 (calcLoss = (시작재고 - 판매) - 종료재고)
  //   · /api/stock-manage/top-sales fetch · loss desc Top 6 (실 손실 큰 순)
  //   · value field 는 재고가치 대신 loss (음수 가능 · 양수=실손실)
  const [lossRows, setLossRows] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    api.get<{ rows?: any[] }>(`/api/stock-manage/top-sales?sort=sale&dir=desc&limit=500`)
      .then(({ data }) => { if (alive) setLossRows(Array.isArray(data?.rows) ? data.rows : []); })
      .catch(() => { if (alive) setLossRows([]); });
    return () => { alive = false; };
  }, []);
  const topDead = useMemo(() => {
    // 손실 = (시작재고 - 판매출고계) - 종료재고 · 양수 = 실 손실
    const calc = (r: any): number => {
      const opening = Number(r.prv_stock ?? 0);
      const sale = Number(r.sale_stock ?? 0);
      const close = Number(r.closing_stock ?? 0);
      return (opening - sale) - close;
    };
    const list = lossRows
      .map(r => ({
        pcode: String(r.product_code ?? ""),
        name: r.product_name ?? r.product_code ?? null,
        stock: Number(r.closing_stock ?? 0),
        unitCost: Number(r.purchase_price ?? 0),
        value: calc(r),  // loss 금액 아닌 수량 · 음수 가능
      }))
      .filter(r => r.value > 0);  // 양수 (실 손실) 만
    list.sort((a, b) => b.value - a.value);
    return list.slice(0, 6);
  }, [lossRows]);

  const categoryRanking = useMemo(() => {
    const g = new Map<string, { sale: number; qty: number; count: number }>();
    for (const cur of filteredItems) {
      const cat = (cur.category ?? "").trim() || "미분류";
      const prev = g.get(cat);
      if (prev) { prev.sale += cur.sale; prev.qty += cur.qty; prev.count += 1; }
      else g.set(cat, { sale: cur.sale, qty: cur.qty, count: 1 });
    }
    const arr = Array.from(g.entries()).map(([cat, v]) => ({ cat, ...v }));
    arr.sort((a, b) => b.sale - a.sale);
    return arr;
  }, [filteredItems]);

  const zoneRanking = useMemo(() => {
    const g = new Map<string, { sale: number; qty: number; count: number }>();
    for (const cur of filteredItems) {
      const meta = cur.pcode ? metaMap.get(cur.pcode) : null;
      const rawLoc = cur.location ?? meta?.display_location ?? "";
      const loc = fmtLoc(rawLoc);
      if (!loc) continue;
      const prev = g.get(loc);
      if (prev) { prev.sale += cur.sale; prev.qty += cur.qty; prev.count += 1; }
      else g.set(loc, { sale: cur.sale, qty: cur.qty, count: 1 });
    }
    const arr = Array.from(g.entries()).map(([loc, v]) => ({ loc, ...v }));
    arr.sort((a, b) => b.sale - a.sale);
    return arr;
  }, [filteredItems, metaMap]);

  const supplierScore = useMemo(() => {
    const g = new Map<string, { skus: Set<string>; qty: number; sale: number; margin: number }>();
    for (const cur of filteredItems) {
      const key = String(cur.pcode ?? cur.name ?? "").trim();
      const sup = cur.supplier ?? "-";
      let bucket = g.get(sup);
      if (!bucket) { bucket = { skus: new Set(), qty: 0, sale: 0, margin: 0 }; g.set(sup, bucket); }
      bucket.skus.add(key);
      bucket.qty += cur.qty;
      bucket.sale += cur.sale;
      bucket.margin += cur.margin;
    }
    const metaStockBySup = new Map<string, number>();
    for (const [, m] of filteredMetaEntries) {
      const sup = (m.supplier ?? "").trim();
      if (!sup) continue;
      const s = Number(m.current_stock ?? 0);
      const u = Number(m.purchase_price ?? 0);
      if (s > 0 && u > 0) metaStockBySup.set(sup, (metaStockBySup.get(sup) ?? 0) + s * u);
    }
    const list = Array.from(g.entries()).map(([sup, v]) => {
      const totalStockValue = metaStockBySup.get(sup) ?? 0;
      const dailySale = nDays > 0 ? v.sale / nDays : 0;
      const daysOfStock = dailySale > 0 ? Math.round(totalStockValue / dailySale) : 999;
      const marginPct = v.sale > 0 ? (v.margin / v.sale) * 100 : null;
      let st: Status = "good";
      if (daysOfStock > 90 || (marginPct !== null && marginPct < 5)) st = "risk";
      else if (daysOfStock > 45 || (marginPct !== null && marginPct < 15)) st = "warn";
      return { sup, skuCount: v.skus.size, qty: v.qty, sale: v.sale, marginPct, stockValue: totalStockValue, daysOfStock, st };
    });
    list.sort((a, b) => b.sale - a.sale);
    return list;
  }, [filteredItems, filteredMetaEntries, nDays]);

  // 2026-10-11 · 사용자 지시 · 공급사별 Scorecard header 자동정렬
  const sortedSupplierScore = useMemo(() => {
    const arr = [...supplierScore];
    const mul = supSort.dir === "asc" ? 1 : -1;
    const key = supSort.key;
    arr.sort((a, b) => {
      if (key === "name") return mul * String(a.sup).localeCompare(String(b.sup));
      if (key === "skus") return mul * (a.skuCount - b.skuCount);
      if (key === "qty") return mul * (a.qty - b.qty);
      if (key === "sale") return mul * (a.sale - b.sale);
      if (key === "margin") return mul * ((a.marginPct ?? -Infinity) - (b.marginPct ?? -Infinity));
      if (key === "stockValue") return mul * (a.stockValue - b.stockValue);
      if (key === "stockDays") return mul * (a.daysOfStock - b.daysOfStock);
      return 0;
    });
    return arr;
  }, [supplierScore, supSort]);

  const tabs: ReadonlyArray<OverviewInnerTab<InnerTabKey>> = [
    { k: "overview", label: "현황",              tone: "indigo",  count: null },
    // 2026-10-12 · 사용자 지시 · 매출현황 → 현황 옆 inner tab
    { k: "revenue",  label: "매출현황",         tone: "emerald", count: null },
    { k: "zone",     label: "구역별 판매현황",   tone: "amber",   count: null },
    { k: "supplier", label: "공급사별 판매현황", tone: "emerald", count: supplierScore.length || null },
    // 2026-10-11 · product 탭 count · FlowTab 자체 집계 사용 · null
    { k: "product",  label: "상품별 판매현황",   tone: "rose",    count: null },
    // 2026-10-12 · 사용자 지시 "판매-손실추적도 판매현황 이너탭으로 이동"
    { k: "loss",     label: "손실추적",         tone: "rose",    count: null },
  ];

  return (
    // 2026-10-11 · 사용자 "구역별 판매현황 UI톤을 최근 수정 중 페이지로" ·
    //   발주반품/매입재고/재고진열/판매매출 공식 복제 · wrapper · nav 아래 pt-3 · sm:px-6
    <div className="flex flex-col gap-3 md:gap-4">
      <OverviewInnerTabs<InnerTabKey>
        ariaLabel="판매현황 inner tabs"
        active={innerTab}
        onChange={setInnerTab}
        tabs={tabs}
      />

      {/* 2026-10-12 · 사용자 지시 · 매출현황 inner tab · 시간대별/월별/상품별 (OverviewInnerTabs 패턴) */}
      {innerTab === "revenue" ? (
        <div className="flex flex-col gap-3">
          <OverviewInnerTabs<"hourly" | "monthly" | "product">
            ariaLabel="매출현황 세부 탭"
            active={revenueSubTab}
            onChange={setRevenueSubTab}
            tabs={[
              { k: "hourly",  label: "시간대별", tone: "indigo",  count: null },
              { k: "monthly", label: "월별",     tone: "emerald", count: null },
              // 2026-10-12 · 사용자 지시 · "상품별" 추가 · FlowTab (상품별 판매내역) render
              { k: "product", label: "상품별",   tone: "rose",    count: null },
            ]}
          />
          <div className="px-4 sm:px-6">
            <React.Suspense fallback={<div className="flex items-center justify-center py-10 text-[14px] text-slate-500">매출현황 로딩 중...</div>}>
              {revenueSubTab === "hourly" ? <HourlyReportTab />
                : revenueSubTab === "monthly" ? <MonthlyReportTab />
                : <ProductSalesListPanel />}
            </React.Suspense>
          </div>
        </div>
      ) : innerTab === "zone" ? (
        <div className="min-w-0 px-4 sm:px-6 pt-3 flex flex-col gap-4">
          {/* 상단 filter · 월 선택 + 기간 라벨 + 2026-10-12 사용자 지시 "오늘/7일/14일/30일 필터 추가" */}
          <div className="flex items-start gap-3 flex-wrap">
            <MonthToggleSelector selectedMonths={selectedMonths} onChange={setSelectedMonths} maxMonths={6} minOne />
            {/* 2026-10-12 · 사용자 지시 · 기간 필터 pill (오늘·7일·14일·한달) · quickRange SSOT · 전 tab 공유 */}
            <QuickRangePills value={quickRange} onChange={setQuickRange} />
            <div className="text-[13px] text-slate-500 font-medium ml-auto whitespace-nowrap">
              기간: <span className="tabular-nums text-ink">{periodLabel}</span>
              <span className="ml-2 text-slate-400 tabular-nums">· {nDays}일</span>
            </div>
          </div>

          {/* 매대 리스트 CARD · 전체 (zoneRanking 전체) · row 클릭 → drawer */}
          <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4 md:p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">구역별 매출 (전체)</h3>
              <span className="text-[13px] text-slate-500 font-medium">row 클릭 → 매대 상품 상세</span>
            </div>
            {zoneRanking.length === 0 ? (
              <div className="h-[120px] flex items-center justify-center text-[14px] text-slate-400">{status === "loading" ? "조회 중..." : "데이터 없음"}</div>
            ) : (() => {
              const maxSale = Math.max(1, ...zoneRanking.map((z) => z.sale));
              return (
                /* 2026-10-12 · 사용자 지시 "2단 → 3단" · md:grid-cols-2 → md:grid-cols-2 lg:grid-cols-3 */
                <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
                  {zoneRanking.map((z) => {
                    const pct = (z.sale / maxSale) * 100;
                    // 2026-10-11 · 사용자 지시 · fmtLoc 포맷 ("벽 10") 과 raw ("10") 양쪽 작동 보장
                    //   · 공통 함수 getZoneLabelByLocation (매대 번호 추출 → zone_defs lookup) 로 fallback
                    const label =
                      locationToLabel.get(String(z.loc ?? "")) ??
                      locationToLabel.get(String(z.loc ?? "").toUpperCase()) ??
                      getZoneLabelByLocation(z.loc, zoneDefsList) ??
                      "";
                    const isActive = zoneDrawerKey === z.loc;
                    return (
                      <li key={z.loc}>
                        <button
                          type="button"
                          onClick={() => setZoneDrawerKey(z.loc)}
                          className={`w-full flex items-center gap-2 text-[14px] min-w-0 rounded-md px-2 py-1 -mx-2 transition-colors cursor-pointer text-left ${isActive ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                        >
                          <div className="shrink-0 flex items-baseline gap-1.5 w-32 min-w-0">
                            <span className="shrink-0 text-[13px] font-semibold text-ink tabular-nums">{z.loc}</span>
                            <span className="text-[13px] text-slate-600 truncate" title={label || z.loc}>{label || "-"}</span>
                          </div>
                          <div className="flex-1 min-w-0 bg-slate-100 rounded-sm h-6 relative overflow-hidden">
                            <div className="absolute inset-y-0 left-0 bg-indigo-500/85 rounded-sm" style={{ width: `${pct}%` }} />
                            <span className="absolute inset-y-0 right-2 flex items-center text-[12px] font-semibold text-ink tabular-nums">{fmtWonShort(z.sale)}원</span>
                          </div>
                          <span className="shrink-0 w-14 text-right text-[12px] text-slate-500 tabular-nums">{fmtNum(z.qty)}개</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </section>
        </div>
      ) : innerTab === "supplier" ? (
        /* 2026-10-11 · 사용자 지시 · 공급사별 판매현황 탭 (현황판과 동일 톤) · 공급사 scorecard full view · 클릭 시 상세 drawer
           사용자 "UI톤 최근 수정 중 페이지로" · sm:px-6 + pt-3 통일 */
        <div className="px-4 sm:px-6 pt-3 flex flex-col gap-4">
          <div className="flex items-start gap-3 flex-wrap">
            <MonthToggleSelector selectedMonths={selectedMonths} onChange={setSelectedMonths} maxMonths={6} minOne />
            {/* 2026-10-12 · 사용자 지시 · 기간 필터 pill · 공급사 tab */}
            <QuickRangePills value={quickRange} onChange={setQuickRange} />
            <div className="inline-flex items-center gap-0 bg-slate-100 border border-slate-200 rounded-md p-0.5">
              {([
                { k: "all"     as ClassFilter, label: "전체"   },
                { k: "pre"     as ClassFilter, label: "상비약" },
                { k: "general" as ClassFilter, label: "일반약" },
                { k: "unknown" as ClassFilter, label: "미분류" },
              ]).map((t) => (
                <button key={t.k} type="button" onClick={() => setClassFilter(t.k)}
                  className={`px-3 h-7 rounded text-[13px] font-semibold transition-colors cursor-pointer ${classFilter === t.k ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-ink"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="text-[13px] text-slate-500 font-medium ml-auto whitespace-nowrap">
              기간: <span className="tabular-nums text-ink">{periodLabel}</span>
              <span className="ml-2 text-slate-400 tabular-nums">· {nDays}일</span>
            </div>
          </div>

          {/* 2026-10-11 · 사용자 지시 "KPI 4-strip 제거" · 공급사 scorecard 만 노출 */}
          {/* 공급사 scorecard full · 클릭 → drawer */}
          <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">공급사 Scorecard</h3>
              <span className="text-[13px] text-slate-500 font-medium">row 클릭 → 상세</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[13px] font-medium">
                  <tr>
                    <th className="text-left px-3 py-2 cursor-pointer select-none hover:text-ink" onClick={() => toggleSupSort("name")}>공급사 {supSortArrow("name")}</th>
                    <th className="text-right px-3 py-2 w-16 cursor-pointer select-none hover:text-ink" onClick={() => toggleSupSort("skus")}>품목 {supSortArrow("skus")}</th>
                    <th className="text-right px-3 py-2 w-16 cursor-pointer select-none hover:text-ink" onClick={() => toggleSupSort("qty")}>수량 {supSortArrow("qty")}</th>
                    <th className="text-right px-3 py-2 w-24 cursor-pointer select-none hover:text-ink" onClick={() => toggleSupSort("sale")}>매출 {supSortArrow("sale")}</th>
                    <th className="text-right px-3 py-2 w-16 cursor-pointer select-none hover:text-ink" onClick={() => toggleSupSort("margin")}>마진 {supSortArrow("margin")}</th>
                    <th className="text-right px-3 py-2 w-24 cursor-pointer select-none hover:text-ink" onClick={() => toggleSupSort("stockValue")}>재고가치 {supSortArrow("stockValue")}</th>
                    <th className="text-right px-3 py-2 w-16 cursor-pointer select-none hover:text-ink" onClick={() => toggleSupSort("stockDays")}>재고일수 {supSortArrow("stockDays")}</th>
                    <th className="text-center px-3 py-2 w-16">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {status === "loading" && sortedSupplierScore.length === 0 && (<tr><td colSpan={8} className="text-center py-8 text-slate-400 text-[14px]">조회 중...</td></tr>)}
                  {sortedSupplierScore.map((s) => {
                    const p = statusToPill(s.st);
                    return (
                      <tr key={s.sup} onClick={() => setDrawerKey(`sup::${s.sup}`)}
                        className="hover:bg-emerald-50/60 h-8 text-ink cursor-pointer transition-colors">
                        <td className="px-3 py-1.5 font-medium break-keep">{s.sup}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtNum(s.skuCount)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtNum(s.qty)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtWonShort(s.sale)}원</td>
                        {(() => { const m = formatMargin(s.marginPct); return <td className={`px-3 py-1.5 text-right ${m.className}`}>{m.text}</td>; })()}
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtWonShort(s.stockValue)}원</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${s.daysOfStock > 90 ? "text-rose-600" : s.daysOfStock > 45 ? "text-amber-600" : "text-emerald-600"}`}>{s.daysOfStock >= 999 ? "∞" : `${s.daysOfStock}일`}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={`inline-flex items-center justify-center min-w-[44px] h-6 px-2 rounded border text-[12px] font-semibold ${p.cls}`}>{p.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        /* 2026-10-12 · 사용자 지시 Bento Cockpit "한눈에" · gap-4 → gap-3 축소 (섹션 간 여백 압축) */
        <div className="px-4 sm:px-6 pt-3 flex flex-col gap-3">
          <div className="flex items-start gap-3 flex-wrap">
            <MonthToggleSelector selectedMonths={selectedMonths} onChange={setSelectedMonths} maxMonths={6} minOne />
            {/* 2026-10-12 · 사용자 지시 · 기간 필터 pill · overview tab */}
            <QuickRangePills value={quickRange} onChange={setQuickRange} />
            <div className="inline-flex items-center gap-0 bg-slate-100 border border-slate-200 rounded-md p-0.5">
              {([
                { k: "all"     as ClassFilter, label: "전체"   },
                { k: "pre"     as ClassFilter, label: "상비약" },
                { k: "general" as ClassFilter, label: "일반약" },
                { k: "unknown" as ClassFilter, label: "미분류" },
              ]).map((t) => (
                <button key={t.k} type="button" onClick={() => setClassFilter(t.k)}
                  className={`px-3 h-7 rounded text-[13px] font-semibold transition-colors cursor-pointer ${classFilter === t.k ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-ink"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="text-[13px] text-slate-500 font-medium ml-auto whitespace-nowrap">
              기간: <span className="tabular-nums text-ink">{periodLabel}</span>
              <span className="ml-2 text-slate-400 tabular-nums">· {nDays}일</span>
            </div>
          </div>

          {/* 2026-10-11 · 사용자 지시 · product 탭 안 급상승 Top6 + 손실 Top6 섹션 제거
              사유: "상품별 판매현황에 급상승 상품 내용은 들어가지 않아 · 급상승은 현황판에서 슬라이딩 drawer"
              → 현황 탭 (overview) 에서만 현황판 drawer 로 노출 · product 탭은 FlowTab 전용 */}

          {/* 2026-10-12 · 사용자 지시 "이 페이지는 상품판매현황리스트가 나와야지 · 오늘의 판매현황이랑 연결 · 판매데이터 가져와서 보여주기 · 기간 공통 필터 · UI교체"
              · 기존 FlowTab (복잡 통합 리스트) 제거 → ProductSalesListPanel (판매 중심 compact 리스트)
              · 공통 OverviewPeriodFilter (MonthPills + QuickRangePills) · top-sales API 호출 */}
          {innerTab === "product" && (
            <div className="min-w-0 px-4 sm:px-6">
              <React.Suspense fallback={<div className="flex items-center justify-center py-16 text-[14px] text-slate-500">상품별 판매현황 로딩 중...</div>}>
                <ProductSalesListPanel />
              </React.Suspense>
            </div>
          )}

          {/* 2026-10-12 · 사용자 지시 "판매-손실추적도 판매현황 이너탭으로 이동" · LossTrackerTab lazy embed */}
          {innerTab === "loss" && (
            <div className="min-w-0 px-4 sm:px-6 pt-3">
              <React.Suspense fallback={<div className="flex items-center justify-center py-16 text-[14px] text-slate-500">손실추적 로딩 중...</div>}>
                <LossTrackerTab onOpenProductInfo={() => { /* noop · overview 내 모달 X */ }} />
              </React.Suspense>
            </div>
          )}

          {/* 2026-10-11 · overview 전용 섹션 (KPI/급상승/손실/구역/공급사) · product 탭에서는 숨김 */}
          {innerTab === "overview" && (<>
          {/* 2026-10-11 · 사용자 지시 "원래써 붙여놔" · 삭제됐던 KPI/급상승/손실 섹션 복원 */}

          {/* 2026-10-12 · 사용자 승인 "응" (Bento Cockpit 안) · L1 KPI Hero row · 2026 Shopify/Vercel/Linear 공통 패턴
              · 홈 랜딩 톤 CARD compact · 전기 대비 delta pill · 폰트 14 하한 · 숫자 20px tabular */}
          {/* 2026-10-12 · 사용자 지시 · KPI 전체 섹션 제거 (당기 매출·판매수량·±% 전부) */}

          {/* 2026-10-12 · 사용자 지시 · "공급사 그거 위로 올리고 왼쪽 · 구역별판매 오른쪽 · 2 column 배치"
              · 공급사 Scorecard (하단) → 공급사 판매현황 (좌)
              · 구역별 판매 Collapse (유지) → 우
              · 라벨 "공급사 Scorecard" → "공급사 판매현황" */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 좌 · 공급사 판매현황 (아래에서 올림) */}
            {(() => {
              const nGood = sortedSupplierScore.filter(s => s.st === "good").length;
              const nWarn = sortedSupplierScore.filter(s => s.st === "warn").length;
              const nRisk = sortedSupplierScore.filter(s => s.st === "risk").length;
              return (
                <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-100 shrink-0 flex-wrap">
                    <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">공급사 판매현황</h3>
                    <span className="text-[13px] text-slate-500 tabular-nums">· {sortedSupplierScore.length}개</span>
                    <div className="flex items-center gap-1.5 text-[13px] tabular-nums">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold">정상 {nGood}</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 font-semibold">주의 {nWarn}</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-700 font-semibold">위험 {nRisk}</span>
                    </div>
                  </div>
                  {/* 2026-10-12 · 사용자 지시 · 펼치기 제거 · 리스트 항상 노출 + 스크롤 처리 */}
                  <div className="overflow-auto max-h-[480px] [scrollbar-width:thin]">
                    <table className="w-full text-[14px]">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[13px] font-medium sticky top-0 z-10">
                          <tr>
                            <th className="text-left px-3 py-2 cursor-pointer select-none hover:text-ink" onClick={() => toggleSupSort("name")}>공급사 {supSortArrow("name")}</th>
                            <th className="text-right px-3 py-2 w-14 cursor-pointer select-none hover:text-ink" onClick={() => toggleSupSort("skus")}>품목 {supSortArrow("skus")}</th>
                            <th className="text-right px-3 py-2 w-20 cursor-pointer select-none hover:text-ink" onClick={() => toggleSupSort("sale")}>매출 {supSortArrow("sale")}</th>
                            <th className="text-right px-3 py-2 w-14 cursor-pointer select-none hover:text-ink" onClick={() => toggleSupSort("margin")}>마진 {supSortArrow("margin")}</th>
                            <th className="text-right px-3 py-2 w-14 cursor-pointer select-none hover:text-ink" onClick={() => toggleSupSort("stockDays")}>재고일수 {supSortArrow("stockDays")}</th>
                            <th className="text-center px-3 py-2 w-14">상태</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {status === "loading" && sortedSupplierScore.length === 0 && (<tr><td colSpan={6} className="text-center py-8 text-slate-400 text-[14px]">조회 중...</td></tr>)}
                          {sortedSupplierScore.map((s) => {
                            const p = statusToPill(s.st);
                            return (
                              <tr key={s.sup} className="hover:bg-slate-50/50 h-8 text-ink">
                                <td className="px-3 py-1.5 font-medium break-keep truncate max-w-[160px]" title={s.sup}>{s.sup}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtNum(s.skuCount)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtWonShort(s.sale)}원</td>
                                {(() => { const m = formatMargin(s.marginPct); return <td className={`px-3 py-1.5 text-right ${m.className}`}>{m.text}</td>; })()}
                                <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${s.daysOfStock > 90 ? "text-rose-600" : s.daysOfStock > 45 ? "text-amber-600" : "text-emerald-600"}`}>{s.daysOfStock >= 999 ? "∞" : `${s.daysOfStock}일`}</td>
                                <td className="px-3 py-1.5 text-center">
                                  <span className={`inline-flex items-center justify-center min-w-[36px] h-6 px-1.5 rounded border text-[12px] font-semibold ${p.cls}`}>{p.label}</span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* 우 · 구역별 판매 Collapse (유지) */}
            <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3.5 md:p-4">
              <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">구역별 판매</h3>
                <button
                  type="button"
                  onClick={() => setZoneExpanded(v => !v)}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-deep hover:text-[#0d3a5c] cursor-pointer transition-colors"
                >
                  {zoneExpanded ? `접기 ▴` : `전체 ${zoneRanking.length}개 보기 ▾`}
                </button>
              </div>
              {zoneRanking.length === 0 ? (
                <div className="h-[80px] flex items-center justify-center text-[14px] text-slate-400">{status === "loading" ? "조회 중..." : "데이터 없음"}</div>
              ) : (() => {
                const maxSale = Math.max(1, ...zoneRanking.map((z) => z.sale));
                const visible = zoneExpanded ? zoneRanking : zoneRanking.slice(0, 6);
                return (
                  <div className={zoneExpanded ? "max-h-[420px] overflow-y-auto pr-1" : ""}>
                    <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5">
                      {visible.map((z) => {
                        const pct = (z.sale / maxSale) * 100;
                        const label =
                          locationToLabel.get(String(z.loc ?? "")) ??
                          locationToLabel.get(String(z.loc ?? "").toUpperCase()) ??
                          getZoneLabelByLocation(z.loc, zoneDefsList) ??
                          "";
                        return (
                          <li key={z.loc} className="flex items-center gap-2 text-[14px] min-w-0">
                            {/* 2026-10-12 · 사용자 지시 · 카테고리 크고 컬러 포인트 + zone_def label 과 일치 · raw "벽 10" → "10" */}
                            <div className="shrink-0 flex items-center w-24 min-w-0">
                              <span
                                className="shrink-0 text-[15px] md:text-[16px] font-bold text-indigo-700 tabular-nums truncate"
                                title={z.loc}
                              >
                                {label || z.loc || "-"}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0 bg-slate-100 rounded-sm h-6 relative overflow-hidden">
                              <div className="absolute inset-y-0 left-0 bg-indigo-500/85 rounded-sm" style={{ width: `${pct}%` }} />
                              <span className="absolute inset-y-0 right-2 flex items-center text-[12px] font-semibold text-ink tabular-nums">{fmtWonShort(z.sale)}원</span>
                            </div>
                            <span className="shrink-0 w-14 text-right text-[12px] text-slate-500 tabular-nums">{fmtNum(z.qty)}개</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}
            </div>
          </section>

          {/* 2026-10-12 · 사용자 지시 · "판매현황의 현황탭에 상품별 판매현황 추가" ·
              prodAgg 수량 Top 10 · 전체보기 click → product tab 이동 */}
          <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-100 flex-wrap">
              <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">상품별 판매현황</h3>
              <span className="text-[13px] text-slate-500 tabular-nums">· 상위 10개</span>
              <button
                type="button"
                onClick={() => setInnerTab("product")}
                className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-brand-deep hover:text-[#0d3a5c] cursor-pointer transition-colors"
                title="상품 탭으로 이동"
              >
                전체보기 →
              </button>
            </div>
            {(() => {
              const items = Array.from(prodAgg.values())
                .filter(p => Number(p.qty) > 0 || Number(p.sale) > 0)
                .sort((a, b) => Number(b.qty) - Number(a.qty))
                .slice(0, 10);
              if (items.length === 0) {
                return <div className="h-[80px] flex items-center justify-center text-[14px] text-slate-400">{status === "loading" ? "조회 중..." : "데이터 없음"}</div>;
              }
              return (
                <div className="overflow-auto max-h-[420px] [scrollbar-width:thin]">
                  <table className="w-full text-[14px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[13px] font-medium sticky top-0 z-10">
                      <tr>
                        <th className="text-left px-3 py-2 w-8">#</th>
                        <th className="text-left px-3 py-2">상품</th>
                        <th className="text-left px-3 py-2 w-28">공급사</th>
                        <th className="text-left px-3 py-2 w-20">매대</th>
                        <th className="text-right px-3 py-2 w-16">수량</th>
                        <th className="text-right px-3 py-2 w-24">매출</th>
                        <th className="text-right px-3 py-2 w-16">마진</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((p, i) => {
                        const key = p.pcode ?? `${p.name ?? ""}-${i}`;
                        const marginPct = Number(p.sale) > 0 ? (Number(p.margin) / Number(p.sale)) * 100 : 0;
                        const mFmt = formatMargin(marginPct);
                        const zoneLabel =
                          locationToLabel.get(String(p.location ?? "")) ??
                          locationToLabel.get(String(p.location ?? "").toUpperCase()) ??
                          getZoneLabelByLocation(p.location, zoneDefsList) ??
                          "";
                        return (
                          <tr key={key} onClick={() => setDrawerKey(key)} className="hover:bg-slate-50/50 h-8 text-ink cursor-pointer transition-colors">
                            <td className="px-3 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                            <td className="px-3 py-1.5 font-medium break-keep truncate max-w-[220px]" title={p.name ?? ""}>{p.name ?? "-"}</td>
                            <td className="px-3 py-1.5 text-slate-600 truncate max-w-[100px]" title={p.supplier ?? ""}>{p.supplier ?? "-"}</td>
                            <td className="px-3 py-1.5 text-indigo-700 font-semibold tabular-nums truncate max-w-[80px]" title={p.location ?? ""}>{zoneLabel || p.location || "-"}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-ink">{fmtNum(Number(p.qty))}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtWonShort(Number(p.sale))}원</td>
                            <td className={`px-3 py-1.5 text-right ${mFmt.className}`}>{mFmt.text}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </section>

          {/* ② 급상승 Top 6 + ③ 손실 Top 6 (2 column) */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">급상승 제품 Top 6</h3>
                <span className="text-[12px] text-emerald-600 font-semibold">▲ 성장률</span>
              </div>
              <table className="w-full text-[14px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[13px] font-medium">
                  <tr>
                    <th className="text-left px-3 py-2 w-8">#</th>
                    <th className="text-left px-3 py-2">상품명</th>
                    <th className="text-right px-3 py-2">전기 → 당기</th>
                    <th className="text-right px-3 py-2 w-20">성장률</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {status === "loading" && topRising.length === 0 && (<tr><td colSpan={4} className="text-center py-8 text-slate-400 text-[14px]">조회 중...</td></tr>)}
                  {status === "success" && topRising.length === 0 && (<tr><td colSpan={4} className="text-center py-8 text-slate-400 text-[14px]">급상승 상품 없음</td></tr>)}
                  {/* 2026-10-12 · Bento Cockpit · heatmap 셀 (성장률 농도 bg · Looker/Metabase 2026 패턴) */}
                  {topRising.map((it, i) => {
                    const g = it.growthPct;
                    const heatCls = g >= 100 ? "bg-emerald-100 text-emerald-800" : g >= 50 ? "bg-emerald-50 text-emerald-700" : "bg-emerald-50/50 text-emerald-700";
                    return (
                      <tr key={it.key} onClick={() => setDrawerKey(it.key)}
                        className="hover:bg-emerald-50/60 h-8 text-ink cursor-pointer transition-colors">
                        <td className="px-3 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium break-keep">{it.name ?? "-"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmtNum(it.prevQty)} → <span className="text-ink font-semibold">{fmtNum(it.curQty)}</span></td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${heatCls}`}>+{g.toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 2026-10-12 · 사용자 지시 · "손실추적 TOP6 누르면 손실추적 탭으로 이동" · section header 클릭 → innerTab="loss" */}
            <div
              onClick={() => setInnerTab("loss")}
              className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden cursor-pointer hover:border-rose-300 transition-colors"
              title="손실추적 탭으로 이동"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setInnerTab("loss"); } }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight flex items-center gap-1.5">
                  손실추적 TOP6
                  <span className="text-[12px] text-slate-400 font-medium">→</span>
                </h3>
                {/* 2026-10-12 · 사용자 지시 · 손실추적 공식 통합 · (시작재고 - 판매) - 종료재고 */}
                <span className="text-[12px] text-rose-600 font-semibold" title="(시작재고 − 판매) − 종료재고">▼ 손실 (수량)</span>
              </div>
              <table className="w-full text-[14px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[13px] font-medium">
                  <tr>
                    <th className="text-left px-3 py-2 w-8">#</th>
                    <th className="text-left px-3 py-2">상품명</th>
                    <th className="text-right px-3 py-2 w-16">종료재고</th>
                    <th className="text-right px-3 py-2 w-20">손실</th>
                    <th className="text-right px-3 py-2 w-24">손실가치</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lossRows.length === 0 && topDead.length === 0 && (<tr><td colSpan={5} className="text-center py-8 text-slate-400 text-[14px]">조회 중...</td></tr>)}
                  {lossRows.length > 0 && topDead.length === 0 && (<tr><td colSpan={5} className="text-center py-8 text-slate-400 text-[14px]">손실 없음</td></tr>)}
                  {(() => {
                    const maxV = Math.max(1, ...topDead.map(d => d.value));
                    return topDead.map((it, i) => {
                      const ratio = it.value / maxV;
                      const heatCls = ratio >= 0.66 ? "bg-rose-100 text-rose-800" : ratio >= 0.33 ? "bg-rose-50 text-rose-700" : "bg-rose-50/50 text-rose-700";
                      const lossValue = it.value * it.unitCost;
                      return (
                        <tr key={it.pcode} className="hover:bg-slate-50/50 h-8 text-ink">
                          <td className="px-3 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                          <td className="px-3 py-1.5 font-medium break-keep">{it.name ?? "-"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(it.stock)}</td>
                          <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${heatCls}`}>{fmtNum(it.value)}개</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-rose-700">
                            {lossValue > 0 ? `${fmtWonShort(lossValue)}원` : <span className="text-slate-300">-</span>}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </section>

          {/* 2026-10-11 · 사용자 지시 · "카테고리별 판매 (중분류)" 섹션 제거 (데이터 없음 · 공간 낭비) */}
          {/* 2026-10-12 · 사용자 지시 "구역별판매(요약) 이 부분 필요없어" · 하단 "구역별 판매 (요약)" 섹션 완전 제거 (위쪽 Collapse 와 중복) */}

          {/* 2026-10-12 · 사용자 지시 · 공급사 섹션 2 column 상단 wrapper 로 이동 완료 · 하단 중복 섹션 삭제 */}

          {/* 2026-10-11 · 사용자 지시 · 공급사 옆 "상품별 판매현황" 요약 섹션 완전 삭제 (중복)
              사유: product 탭 (= 상품별 판매현황) 에서 FlowTab 전체 노출 · 현황판 중복 금지 */}
          </>)}
        </div>
      )}

      {/* 2026-10-11 · 사용자 지시 · 상세 drawer · 급상승 상품 or 공급사 상품리스트 */}
      {drawerKey && (() => {
        const isSupplier = drawerKey.startsWith("sup::");
        const title = isSupplier ? drawerKey.slice(5) : (prodAgg.get(drawerKey)?.name ?? drawerKey);
        const subtitle = isSupplier ? "공급사 판매 상품" : "급상승 제품 상세";
        // 공급사 drawer · 필터된 당기 판매 상품 리스트 · drawerSort 적용
        const itemsRaw = isSupplier
          ? filteredItems.filter((x) => (x.supplier ?? "-") === drawerKey.slice(5))
          : [prodAgg.get(drawerKey)!].filter(Boolean);
        const items = isSupplier ? [...itemsRaw].sort((a, b) => {
          const dir = drawerSort.dir === "asc" ? 1 : -1;
          if (drawerSort.key === "name") return String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko") * dir;
          if (drawerSort.key === "loc") {
            const la = fmtLoc(a.location ?? (a.pcode ? metaMap.get(a.pcode)?.display_location : null));
            const lb = fmtLoc(b.location ?? (b.pcode ? metaMap.get(b.pcode)?.display_location : null));
            return la.localeCompare(lb, "ko", { numeric: true }) * dir;
          }
          if (drawerSort.key === "qty") return (a.qty - b.qty) * dir;
          if (drawerSort.key === "sale") return (a.sale - b.sale) * dir;
          if (drawerSort.key === "margin") {
            const ma = a.sale > 0 ? a.margin / a.sale : -1;
            const mb = b.sale > 0 ? b.margin / b.sale : -1;
            return (ma - mb) * dir;
          }
          return 0;
        }) : itemsRaw;
        if (items.length === 0 && !isSupplier) return null;
        // 급상승 전용 수치
        const main = isSupplier ? null : prodAgg.get(drawerKey) ?? null;
        const prev = isSupplier ? 0 : (prevProdQty.get(drawerKey) ?? 0);
        const mainMeta = !isSupplier && main?.pcode ? metaMap.get(main.pcode) : null;
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDrawerKey(null)} aria-hidden />
            <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] md:w-[640px] bg-white shadow-2xl flex flex-col"
              style={{ animation: "slide-in-right 0.2s ease-out" }}>
              <style>{`@keyframes slide-in-right { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
              <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-200">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-slate-500 font-medium">{subtitle}</div>
                  <h3 className="text-[15px] md:text-[16px] font-semibold text-ink truncate" title={title}>{title}</h3>
                </div>
                <button type="button" onClick={() => setDrawerKey(null)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-ink cursor-pointer" aria-label="닫기">✕</button>
              </header>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {/* 급상승 상품 상단 요약 (수량 + 판매 트렌드 차트) */}
                {!isSupplier && main && (
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/40">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <div><div className="text-[12px] text-slate-500 font-medium">공급사</div><div className="text-[14px] font-semibold text-ink truncate">{main.supplier ?? "-"}</div></div>
                      <div><div className="text-[12px] text-slate-500 font-medium">위치</div><div className="text-[14px] font-semibold text-ink tabular-nums">{main.location ?? mainMeta?.display_location ?? "-"}</div></div>
                      <div><div className="text-[12px] text-slate-500 font-medium">매입가</div><div className="text-[14px] font-semibold text-ink tabular-nums">{Number(mainMeta?.purchase_price ?? 0) > 0 ? fmtWonShort(Number(mainMeta?.purchase_price)) + "원" : "-"}</div></div>
                      <div><div className="text-[12px] text-slate-500 font-medium">판매가</div><div className="text-[14px] font-semibold text-ink tabular-nums">{Number((mainMeta as any)?.sale_price ?? 0) > 0 ? fmtWonShort(Number((mainMeta as any)?.sale_price)) + "원" : "-"}</div></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div><div className="text-[12px] text-slate-500 font-medium">전기 수량</div><div className="text-[18px] md:text-[20px] font-bold tabular-nums text-slate-700">{fmtNum(prev)}</div></div>
                      <div><div className="text-[12px] text-slate-500 font-medium">당기 수량</div><div className="text-[18px] md:text-[20px] font-bold tabular-nums text-ink">{fmtNum(main.qty)}</div></div>
                      <div><div className="text-[12px] text-slate-500 font-medium">성장률</div><div className="text-[18px] md:text-[20px] font-bold tabular-nums text-emerald-600">+{prev > 0 ? Math.round(((main.qty - prev) / prev) * 100) : 0}%</div></div>
                    </div>
                    {/* 2026-10-11 · 사용자 지시 "판매량과 마진율 같이 나오는 차트" · ComposedChart · Bar(수량)+Line(마진율) · dual Y axis */}
                    <div className="w-full" style={{ height: 120 }}>
                      <ResponsiveContainer>
                        <ComposedChart
                          data={[
                            { k: "전기", qty: prev, marginPct: null as number | null },
                            { k: "당기", qty: main.qty, marginPct: main.sale > 0 ? Math.round((main.margin / main.sale) * 1000) / 10 : null },
                          ]}
                          margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                        >
                          <XAxis dataKey="k" tick={{ fontSize: 12, fill: "#64748b" }} />
                          <YAxis yAxisId="qty" tick={{ fontSize: 11, fill: "#64748b" }} width={34} />
                          <YAxis yAxisId="margin" orientation="right" tick={{ fontSize: 11, fill: "#64748b" }} width={34} unit="%" />
                          <Tooltip
                            formatter={(v: any, k: any) => k === "qty"
                              ? [`${fmtNum(Number(v))}개`, "판매량"]
                              : v == null ? ["-", "마진율"] : [`${Number(v).toFixed(1)}%`, "마진율"]}
                            contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0" }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} iconType="rect" iconSize={10} />
                          <Bar yAxisId="qty" dataKey="qty" name="판매량" fill="#10b981" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                          <Line yAxisId="margin" type="monotone" dataKey="marginPct" name="마진율" stroke="#4f46e5" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                {/* 공급사: 상품 리스트 full */}
                {items.length === 0 ? (
                  <div className="py-10 text-center text-[14px] text-slate-400">상품 없음</div>
                ) : (() => {
                  // 2026-10-11 · 사용자 지시 · 헤더 자동정렬 · 각 th 클릭 시 toggle · 위치는 fmtLoc 공통함수 적용
                  const indicator = (k: DrawerSortKey) => drawerSort.key !== k ? "" : drawerSort.dir === "asc" ? " ▲" : " ▼";
                  const thCls = (align: "left" | "right") =>
                    `px-3 py-2 cursor-pointer select-none hover:text-ink transition-colors text-${align}`;
                  return (
                    <table className="w-full text-[14px]">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[13px] font-medium sticky top-0 z-10">
                        <tr>
                          <th className={thCls("left")} onClick={() => toggleDrawerSort("name")}>상품명{indicator("name")}</th>
                          <th className={`${thCls("left")} w-[80px]`} onClick={() => toggleDrawerSort("loc")}>위치{indicator("loc")}</th>
                          {/* 2026-10-11 · 사용자 지시 · 공급사 drawer 안 테이블에 매입가·판매가 column 추가 */}
                          <th className={`${thCls("right")} w-[72px]`}>매입가</th>
                          <th className={`${thCls("right")} w-[72px]`}>판매가</th>
                          <th className={`${thCls("right")} w-[70px]`} onClick={() => toggleDrawerSort("qty")}>수량{indicator("qty")}</th>
                          <th className={`${thCls("right")} w-[90px]`} onClick={() => toggleDrawerSort("sale")}>매출{indicator("sale")}</th>
                          <th className={`${thCls("right")} w-[70px]`} onClick={() => toggleDrawerSort("margin")}>마진{indicator("margin")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map((p, i) => {
                          const marginPct = p.sale > 0 ? (p.margin / p.sale) * 100 : null;
                          const meta = p.pcode ? metaMap.get(p.pcode) : null;
                          // 2026-10-11 · 사용자 지시 "위치부분 공통함수" · fmtLoc 적용 (ERP raw → 깔끔한 포맷)
                          const loc = fmtLoc(p.location ?? meta?.display_location);
                          const purchasePrice = meta?.purchase_price != null ? Number(meta.purchase_price) : null;
                          // 2026-10-11 · 판매가 is not in meta slim · derive from margin / sale (근사치) · meta 에 없을 수 있음
                          const salePrice = (meta as any)?.sale_price != null ? Number((meta as any).sale_price) : null;
                          // 2026-10-11 · 사용자 지시 · 마진 음수 명시적 "-" prefix + 괄호 (시각 강조)
                          const marginText = marginPct === null
                            ? "-"
                            : marginPct < 0
                              ? `−${Math.abs(marginPct).toFixed(1)}%`
                              : `${marginPct.toFixed(1)}%`;
                          return (
                            <tr key={`${p.pcode ?? p.name ?? i}`} className="hover:bg-slate-50/60 h-8 text-ink">
                              <td className="px-3 py-1.5 font-medium break-keep">{p.name ?? "-"}</td>
                              <td className="px-3 py-1.5 text-[13px] text-slate-600 tabular-nums">{loc || <span className="text-slate-300">-</span>}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{purchasePrice != null ? `${fmtNum(purchasePrice)}원` : <span className="text-slate-300">-</span>}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{salePrice != null ? `${fmtNum(salePrice)}원` : <span className="text-slate-300">-</span>}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtNum(p.qty)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtWonShort(p.sale)}원</td>
                              {(() => { const mm = formatMargin(marginPct); return <td className={`px-3 py-1.5 text-right ${mm.className}`}>{mm.text}</td>; })()}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </aside>
          </>
        );
      })()}

      {/* 2026-10-11 · 사용자 지시 · 구역별 판매현황 매대 클릭 → 오른쪽 slide drawer (매대 상품 상세) */}
      {zoneDrawerKey && (() => {
        const label =
          locationToLabel.get(String(zoneDrawerKey)) ??
          locationToLabel.get(String(zoneDrawerKey).toUpperCase()) ??
          "";
        // 이 매대 소속 상품 집계 · fmtLoc 매칭
        const items = Array.from(prodAgg.values()).filter((p) => {
          const meta = p.pcode ? metaMap.get(p.pcode) : null;
          const raw = p.location ?? meta?.display_location ?? "";
          return fmtLoc(raw) === zoneDrawerKey;
        });
        // 정렬
        const sorted = [...items].sort((a, b) => {
          const mul = zoneDrawerSort.dir === "asc" ? 1 : -1;
          if (zoneDrawerSort.key === "name") return mul * String(a.name ?? "").localeCompare(String(b.name ?? ""));
          if (zoneDrawerSort.key === "qty") return mul * (a.qty - b.qty);
          if (zoneDrawerSort.key === "margin") return mul * (a.margin - b.margin);
          return mul * (a.sale - b.sale);
        });
        const totalSale = items.reduce((s, p) => s + p.sale, 0);
        const totalQty = items.reduce((s, p) => s + p.qty, 0);
        const totalMargin = items.reduce((s, p) => s + p.margin, 0);
        const marginRate = totalSale > 0 ? (totalMargin / totalSale) * 100 : 0;
        const sortArrow = (k: ZoneSortKey) => zoneDrawerSort.key === k ? (zoneDrawerSort.dir === "asc" ? "▲" : "▼") : "";
        return (
          <>
            <style>{`
              @keyframes zoneDrawerSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
              @keyframes zoneDrawerFadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-40"
              style={{ animation: "zoneDrawerFadeIn 200ms ease-out" }}
              onClick={() => setZoneDrawerKey(null)}
              aria-hidden
            />
            <aside
              className="fixed right-0 top-0 bottom-0 w-full md:w-[640px] lg:w-[760px] bg-[#F4F7FA] z-50 shadow-[-8px_0_32px_rgba(15,23,42,0.12)] flex flex-col"
              style={{ animation: "zoneDrawerSlideIn 250ms ease-out" }}
              role="dialog"
              aria-modal="true"
            >
              <header className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2.5 md:px-4 md:py-3 border-b border-slate-200 bg-white">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-indigo-50 text-indigo-700 shrink-0 text-[13px] font-bold tabular-nums">
                  {zoneDrawerKey}
                </span>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[14px] md:text-[15px] font-semibold text-ink tracking-tight truncate leading-tight">
                    {label || zoneDrawerKey}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setZoneDrawerKey(null)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] text-slate-500 hover:text-ink hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="닫기"
                  title="닫기"
                >
                  ✕
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-3 md:p-4 flex flex-col gap-3 md:gap-4">
                {/* 요약 KPI · 매대 합계 */}
                <section className="grid grid-cols-3 gap-2">
                  <Kpi label="매출" value={status === "loading" ? "..." : fmtWonShort(totalSale)} suffix="원" />
                  <Kpi label="수량" value={status === "loading" ? "..." : fmtNum(totalQty)} suffix="개" />
                  <Kpi label="마진율" value={status === "loading" ? "..." : `${marginRate.toFixed(1)}`} suffix="%" />
                </section>

                {/* 상품 테이블 · 정렬 가능 */}
                <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                    <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">상품 ({fmtNum(items.length)}종)</h3>
                    <span className="text-[13px] text-slate-500 font-medium">header 클릭 → 정렬</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[14px]">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[13px] font-medium">
                        <tr>
                          <th className="text-left px-3 py-2 cursor-pointer hover:text-ink" onClick={() => toggleZoneDrawerSort("name")}>상품명 {sortArrow("name")}</th>
                          <th className="text-right px-3 py-2 w-16 cursor-pointer hover:text-ink" onClick={() => toggleZoneDrawerSort("qty")}>수량 {sortArrow("qty")}</th>
                          <th className="text-right px-3 py-2 w-24 cursor-pointer hover:text-ink" onClick={() => toggleZoneDrawerSort("sale")}>매출 {sortArrow("sale")}</th>
                          <th className="text-right px-3 py-2 w-20 cursor-pointer hover:text-ink" onClick={() => toggleZoneDrawerSort("margin")}>마진 {sortArrow("margin")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sorted.length === 0 && (<tr><td colSpan={4} className="text-center py-8 text-slate-400 text-[14px]">{status === "loading" ? "조회 중..." : "상품 없음"}</td></tr>)}
                        {sorted.map((p, idx) => (
                          <tr key={`${p.pcode ?? p.name ?? idx}`} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-3 py-2 text-ink leading-tight">
                              <div className="line-clamp-1" title={p.name ?? ""}>{p.name ?? "-"}</div>
                              {p.supplier && <div className="text-[12px] text-slate-400 line-clamp-1">{p.supplier}</div>}
                            </td>
                            <td className="text-right px-3 py-2 text-slate-600 tabular-nums">{fmtNum(p.qty)}</td>
                            <td className="text-right px-3 py-2 font-semibold text-ink tabular-nums">{fmtWonShort(p.sale)}</td>
                            <td className="text-right px-3 py-2 text-slate-600 tabular-nums">{fmtWonShort(p.margin)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </aside>
          </>
        );
      })()}
    </div>
  );
};

interface KpiProps { label: string; value: string; suffix?: string; tone?: "good" | "risk" | null }
const Kpi: React.FC<KpiProps> = ({ label, value, suffix, tone }) => {
  const toneCls = tone === "risk" ? "text-rose-600" : tone === "good" ? "text-emerald-600" : "text-ink";
  return (
    <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3 md:p-4 min-w-0">
      <div className="text-[13px] md:text-[14px] font-medium text-slate-500 mb-1 truncate">{label}</div>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className={`text-[20px] md:text-[22px] font-bold tabular-nums leading-tight break-all ${toneCls}`}>{value}</span>
        {suffix && <span className="text-[13px] text-slate-500 font-medium shrink-0">{suffix}</span>}
      </div>
    </div>
  );
};

export default SalesStatus;
