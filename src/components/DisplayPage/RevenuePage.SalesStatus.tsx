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
import { formatDisplayLocation } from "../../lib/formatDisplayLocation";
import { OverviewInnerTabs, type OverviewInnerTab } from "./overviews/OverviewHeader";
// 2026-10-11 · 사용자 지시 · 구역별 판매 (요약) 에 매대 이름 · zone_defs 매핑
import { useZoneDefs } from "../../hooks/useZoneDefs";
// 2026-10-11 · 사용자 지시 · drawer 안 "판매량 + 마진율" combo chart
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

const CategoryTab = React.lazy(() => import("../OrderManagePage/CategoryTab").then((m) => ({ default: m.CategoryTab })));

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

type InnerTabKey = "overview" | "zone" | "supplier" | "product";
type ClassFilter = "all" | "pre" | "general" | "unknown";
type Status = "good" | "warn" | "risk";
function statusToPill(s: Status) {
  if (s === "good") return { label: "정상", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s === "warn") return { label: "주의", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "위험", cls: "bg-rose-50 text-rose-700 border-rose-200" };
}

export const SalesStatus: React.FC = () => {
  const [innerTab, setInnerTab] = useState<InnerTabKey>("overview");
  const { selectedMonths, setSelectedMonths } = useMonthFilter();
  const [classFilter, setClassFilter] = useState<ClassFilter>("all");
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

  const { curDates, prevDates, periodLabel } = useMemo(() => {
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
  }, [selectedMonths]);

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
    return { totalQty, activeProducts, activeSuppliers: activeSupSet.size, action };
  }, [filteredItems, filteredMetaEntries, metaMap, prodAgg, nDays]);

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

  const topDead = useMemo(() => {
    const list: Array<{ pcode: string; name: string | null; stock: number; unitCost: number; value: number }> = [];
    for (const [pcode, meta] of filteredMetaEntries) {
      const stock = Number(meta.current_stock ?? 0);
      if (stock <= 0) continue;
      const unitCost = Number(meta.purchase_price ?? 0);
      if (unitCost <= 0) continue;
      const sold = prodAgg.get(pcode);
      if (sold && sold.qty > 0) continue;
      list.push({ pcode, name: meta.product_name ?? pcode, stock, unitCost, value: stock * unitCost });
    }
    list.sort((a, b) => b.value - a.value);
    return list.slice(0, 6);
  }, [filteredMetaEntries, prodAgg]);

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

  const tabs: ReadonlyArray<OverviewInnerTab<InnerTabKey>> = [
    { k: "overview", label: "현황",              tone: "indigo",  count: null },
    { k: "zone",     label: "구역별 판매현황",   tone: "amber",   count: null },
    { k: "supplier", label: "공급사별 판매현황", tone: "emerald", count: supplierScore.length || null },
    { k: "product",  label: "상품별 판매현황",   tone: "rose",    count: (topRising.length + topDead.length) || null },
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

      {/* 2026-10-11 · 사용자 지시 · 통합 대시보드 (매대 리스트 + slide drawer)
          좌측 매대 리스트 + 매대 row 클릭 → 우측 slide drawer (매대 상품 상세) */}
      {innerTab === "zone" ? (
        <div className="min-w-0 px-4 sm:px-6 pt-3 flex flex-col gap-4">
          {/* 상단 filter · 월 선택 + 기간 라벨 */}
          <div className="flex items-start gap-3 flex-wrap">
            <MonthToggleSelector selectedMonths={selectedMonths} onChange={setSelectedMonths} maxMonths={6} minOne />
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
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
                  {zoneRanking.map((z) => {
                    const pct = (z.sale / maxSale) * 100;
                    const label =
                      locationToLabel.get(String(z.loc ?? "")) ??
                      locationToLabel.get(String(z.loc ?? "").toUpperCase()) ??
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
                    <th className="text-left px-3 py-2">공급사</th>
                    <th className="text-right px-3 py-2 w-16">품목</th>
                    <th className="text-right px-3 py-2 w-16">수량</th>
                    <th className="text-right px-3 py-2 w-24">매출</th>
                    <th className="text-right px-3 py-2 w-16">마진</th>
                    <th className="text-right px-3 py-2 w-24">재고가치</th>
                    <th className="text-right px-3 py-2 w-16">재고일수</th>
                    <th className="text-center px-3 py-2 w-16">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {status === "loading" && supplierScore.length === 0 && (<tr><td colSpan={8} className="text-center py-8 text-slate-400 text-[14px]">조회 중...</td></tr>)}
                  {supplierScore.map((s) => {
                    const p = statusToPill(s.st);
                    return (
                      <tr key={s.sup} onClick={() => setDrawerKey(`sup::${s.sup}`)}
                        className="hover:bg-emerald-50/60 h-8 text-ink cursor-pointer transition-colors">
                        <td className="px-3 py-1.5 font-medium break-keep">{s.sup}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtNum(s.skuCount)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtNum(s.qty)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtWonShort(s.sale)}원</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${(s.marginPct ?? 0) >= 20 ? "text-emerald-600" : (s.marginPct ?? 0) >= 10 ? "text-slate-700" : "text-rose-600"}`}>{s.marginPct === null ? "-" : `${s.marginPct.toFixed(1)}%`}</td>
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
        /* 2026-10-11 · 사용자 "UI톤 최근 수정 중 페이지로" · sm:px-6 + pt-3 통일 */
        <div className="px-4 sm:px-6 pt-3 flex flex-col gap-4">
          <div className="flex items-start gap-3 flex-wrap">
            <MonthToggleSelector selectedMonths={selectedMonths} onChange={setSelectedMonths} maxMonths={6} minOne />
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

          {/* 2026-10-11 · 사용자 지시 · 상품별 판매현황 KPI 4-strip 제거 (총 판매수량·판매 활성 상품·활성 공급사·조치 필요) · 공간 낭비 */}

          {/* 2026-10-11 · 사용자 지시 "이건 현황판에 있어야지" · 급상승+손실 섹션 · 현황판(overview) + 상품별 탭 둘 다 노출 */}
          {(innerTab === "overview" || innerTab === "product") && (
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
                  {topRising.map((it, i) => (
                    <tr key={it.key} onClick={() => setDrawerKey(it.key)}
                      className="hover:bg-emerald-50/60 h-8 text-ink cursor-pointer transition-colors">
                      <td className="px-3 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium break-keep">{it.name ?? "-"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmtNum(it.prevQty)} → <span className="text-ink font-semibold">{fmtNum(it.curQty)}</span></td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-emerald-600">+{it.growthPct.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">손실 많은 제품 Top 6</h3>
                <span className="text-[12px] text-rose-600 font-semibold">▼ Dead Stock</span>
              </div>
              <table className="w-full text-[14px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[13px] font-medium">
                  <tr>
                    <th className="text-left px-3 py-2 w-8">#</th>
                    <th className="text-left px-3 py-2">상품명</th>
                    <th className="text-right px-3 py-2 w-16">재고</th>
                    <th className="text-right px-3 py-2 w-24">재고가치</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {status === "loading" && topDead.length === 0 && (<tr><td colSpan={4} className="text-center py-8 text-slate-400 text-[14px]">조회 중...</td></tr>)}
                  {status === "success" && topDead.length === 0 && (<tr><td colSpan={4} className="text-center py-8 text-slate-400 text-[14px]">Dead stock 없음</td></tr>)}
                  {topDead.map((it, i) => (
                    <tr key={it.pcode} className="hover:bg-slate-50/50 h-8 text-ink">
                      <td className="px-3 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium break-keep">{it.name ?? "-"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(it.stock)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-rose-600">{fmtWonShort(it.value)}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          )}

          {/* 2026-10-11 · overview 전용 섹션 (카테고리/구역/공급사 요약) · product 탭에서는 숨김 */}
          {innerTab === "overview" && (<>
          {/* 2026-10-11 · 사용자 지시 · "카테고리별 판매 (중분류)" 섹션 제거 (데이터 없음 · 공간 낭비) */}

          <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4 md:p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">구역별 판매 (요약)</h3>
              <span className="text-[13px] text-slate-500 font-medium">TOP 10 · 상세는 상단 "구역별 판매현황" 탭</span>
            </div>
            {zoneRanking.length === 0 ? (
              <div className="h-[120px] flex items-center justify-center text-[14px] text-slate-400">{status === "loading" ? "조회 중..." : "데이터 없음"}</div>
            ) : (() => {
              // 2026-10-11 · 사용자 지시 · 현황 탭 요약은 TOP 10 만 노출 (전체는 상단 "구역별 판매현황" 탭 CategoryTab)
              const top10 = zoneRanking.slice(0, 10);
              const maxSale = Math.max(1, ...top10.map((z) => z.sale));
              return (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
                  {top10.map((z) => {
                    const pct = (z.sale / maxSale) * 100;
                    const label =
                      locationToLabel.get(String(z.loc ?? "")) ??
                      locationToLabel.get(String(z.loc ?? "").toUpperCase()) ??
                      "";
                    return (
                      <li key={z.loc} className="flex items-center gap-2 text-[14px] min-w-0">
                        {/* 2026-10-11 · 사용자 "배지 쓰지마 깔끔한 텍스트 위주" · code pill 제거 · 텍스트만 */}
                        <div className="shrink-0 flex items-baseline gap-1.5 w-32 min-w-0">
                          <span className="shrink-0 text-[13px] font-semibold text-ink tabular-nums">{z.loc}</span>
                          <span className="text-[13px] text-slate-600 truncate" title={label || z.loc}>{label || "-"}</span>
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
              );
            })()}
          </section>

          <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">공급사 Scorecard</h3>
              <span className="text-[13px] text-slate-500 font-medium">정상 · 주의 · 위험 (재고일수·마진율)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[13px] font-medium">
                  <tr>
                    <th className="text-left px-3 py-2">공급사</th>
                    <th className="text-right px-3 py-2 w-16">품목</th>
                    <th className="text-right px-3 py-2 w-16">수량</th>
                    <th className="text-right px-3 py-2 w-24">매출</th>
                    <th className="text-right px-3 py-2 w-16">마진</th>
                    <th className="text-right px-3 py-2 w-24">재고가치</th>
                    <th className="text-right px-3 py-2 w-16">재고일수</th>
                    <th className="text-center px-3 py-2 w-16">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {status === "loading" && supplierScore.length === 0 && (<tr><td colSpan={8} className="text-center py-8 text-slate-400 text-[14px]">조회 중...</td></tr>)}
                  {supplierScore.map((s) => {
                    const p = statusToPill(s.st);
                    return (
                      <tr key={s.sup} className="hover:bg-slate-50/50 h-8 text-ink">
                        <td className="px-3 py-1.5 font-medium break-keep">{s.sup}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtNum(s.skuCount)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtNum(s.qty)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtWonShort(s.sale)}원</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${(s.marginPct ?? 0) >= 20 ? "text-emerald-600" : (s.marginPct ?? 0) >= 10 ? "text-slate-700" : "text-rose-600"}`}>{s.marginPct === null ? "-" : `${s.marginPct.toFixed(1)}%`}</td>
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
                          return (
                            <tr key={`${p.pcode ?? p.name ?? i}`} className="hover:bg-slate-50/60 h-8 text-ink">
                              <td className="px-3 py-1.5 font-medium break-keep">{p.name ?? "-"}</td>
                              <td className="px-3 py-1.5 text-[13px] text-slate-600 tabular-nums">{loc || <span className="text-slate-300">-</span>}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtNum(p.qty)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtWonShort(p.sale)}원</td>
                              <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${(marginPct ?? 0) >= 20 ? "text-emerald-600" : (marginPct ?? 0) >= 10 ? "text-slate-700" : "text-rose-600"}`}>{marginPct === null ? "-" : `${marginPct.toFixed(1)}%`}</td>
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
