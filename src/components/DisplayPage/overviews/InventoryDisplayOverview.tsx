// src/components/DisplayPage/overviews/InventoryDisplayOverview.tsx
// 2026-10-09 · GLOBAL UI · 재고·진열 Single-Page Operations Console
//   · L2 폐기 · shortcut 폐기 · modal-first
//   · Real · listExpiryImminentProducts · listInventoryChecks
//   · row click → ProductInventoryDetailModal (domain-specific · Shelf SSOT 보호)

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Package, Storefront, Clock, ListChecks, Warehouse, MapPin, CaretRight, CaretDown } from "@phosphor-icons/react";
import {
  OverviewPageHeader, OverviewToolbar, OverviewSection, OverviewKpi, OverviewTable,
  type OverviewTableColumn,
} from "./StoreOverviewPrimitives";
import { listExpiryImminentProducts } from "../../../lib/productsApi";
import { listInventoryChecks } from "../../../lib/inventoryChecksApi";
import { ProductInventoryDetailModal, type ProductInventoryDetailRow } from "./ProductInventoryDetailModal";
// 2026-10-10 · 사용자 지시 · 구역도 세로탭 + 매대 리스트 + 매대 클릭 → 상품 리스트 아코디언
//   · 홈 랜딩 톤 (HomeDashboard SSOT · CARD rounded-[12px] + border-slate-200 + thin shadow)
//   · 실재고(inventory_checks) + products.purchase_price 로 매대별 제품수·재고자산 집계
import { useZoneDefs } from "../../../hooks/useZoneDefs";
import { useKvSetting } from "../../../hooks/useKvSetting";
import { getProductsMap, type ProductInfo } from "../../../lib/productsCache";
import {
  DEFAULT_WAREHOUSE_ZONES,
  WAREHOUSE_ZONES_KEY,
  type WarehouseZonesConfig,
} from "../../../constants/warehouseZoneDefaults";

export interface InventoryDisplayOverviewProps { onSelectSubTab: (sub: any) => void; }

type AnyRow = Record<string, any>;

// 2026-10-10 · 사용자 지시 · inner tab · "현황" / "구역도" 2탭 · 홈 톤 pill 패턴
type InnerTab = "overview" | "map";
// 2026-10-10 · 사용자 지시 · 구역도 inner-inner tab (판매·매출현황 패턴) · 매장/창고1/창고2
type MapInnerTab = "store" | "wh1" | "wh2";

// 2026-10-10 · 매장 매대 chip · code (1A·22·35 등) + 매대 이름 (subA/subB category)
interface StoreChipItem {
  code: string;
  label: string;
  num: number;
  side: "A" | "B" | null;
}

// 2026-10-10 · 홈 랜딩 공식 CARD (HomeDashboard SSOT · rounded-[12px] + border-slate-200 + thin shadow)
const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

// 2026-10-10 · tone registry · HomeDashboard subtle 색상 (gradient X · pastel X)
type Tone = "sky" | "indigo" | "emerald" | "rose" | "amber" | "violet";
const TONE: Record<Tone, { bg: string; text: string; strip: string }> = {
  sky:     { bg: "bg-sky-50",     text: "text-sky-700",     strip: "bg-sky-500"     },
  indigo:  { bg: "bg-indigo-50",  text: "text-indigo-700",  strip: "bg-indigo-500"  },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", strip: "bg-emerald-500" },
  rose:    { bg: "bg-rose-50",    text: "text-rose-700",    strip: "bg-rose-500"    },
  amber:   { bg: "bg-amber-50",   text: "text-amber-700",   strip: "bg-amber-500"   },
  violet:  { bg: "bg-violet-50",  text: "text-violet-700",  strip: "bg-violet-500"  },
};

export const InventoryDisplayOverview: React.FC<InventoryDisplayOverviewProps> = () => {
  const [expiry, setExpiry] = useState<AnyRow[] | null>(null);
  const [checks, setChecks] = useState<AnyRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<ProductInventoryDetailRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // 2026-10-10 · inner tab · overview 기본 (대원칙 · 첫 탭 default)
  const [innerTab, setInnerTab] = useState<InnerTab>("overview");
  // 2026-10-10 · 구역도 inner-inner tab · 매장 기본
  const [mapInnerTab, setMapInnerTab] = useState<MapInnerTab>("store");
  // 2026-10-10 · 사용자 지시 · 매대 클릭 시 하단 상품 리스트 아코디언 expand
  const [expandedZone, setExpandedZone] = useState<string | null>(null);
  // 2026-10-10 · products.display_location + purchase_price 매칭용 cache
  const [productsMap, setProductsMap] = useState<Record<string, ProductInfo>>({});

  useEffect(() => {
    let alive = true;
    getProductsMap().then(m => { if (alive) setProductsMap(m); }).catch(() => { if (alive) setProductsMap({}); });
    return () => { alive = false; };
  }, []);

  // 2026-10-10 · 구역도 데이터 · 매장 zone_defs + 창고 KV (readonly)
  const { zones: storeZones } = useZoneDefs();
  const { value: whZones } = useKvSetting<WarehouseZonesConfig>({
    key: WAREHOUSE_ZONES_KEY,
    defaultValue: DEFAULT_WAREHOUSE_ZONES,
  });

  // 2026-10-10 · 사용자 재지시 · 대략 위치 반영 섹션 그룹핑
  //   · 상비약 (1-9) · A/B pair · 중앙 진열대
  //   · 일반약 10~21 (상단 벽) · 22 (중앙) · 23~27 (하단 벽) · 28~40 (윙) · 41~46 (카운터)
  const storeSections = useMemo(() => {
    const emer: StoreChipItem[] = [];
    const topWall: StoreChipItem[] = [];
    const center22: StoreChipItem[] = [];
    const bottomWall: StoreChipItem[] = [];
    const wing: StoreChipItem[] = [];
    const counter: StoreChipItem[] = [];
    for (const z of storeZones) {
      if (z.num >= 1 && z.num <= 9) {
        if (z.subA) emer.push({ code: z.__locationA ?? `${z.num}A`, label: z.subA, num: z.num, side: "A" });
        if (z.subB) emer.push({ code: z.__locationB ?? `${z.num}B`, label: z.subB, num: z.num, side: "B" });
        if (!z.subA && !z.subB && (z.category || z.label)) {
          emer.push({ code: String(z.num), label: z.category || z.label, num: z.num, side: null });
        }
      } else if (z.num === 22) {
        center22.push({ code: "22", label: z.category || z.label || "-", num: 22, side: null });
      } else if (z.num >= 10 && z.num <= 21) {
        topWall.push({ code: String(z.num), label: z.category || z.label || "-", num: z.num, side: null });
      } else if (z.num >= 23 && z.num <= 27) {
        bottomWall.push({ code: String(z.num), label: z.category || z.label || "-", num: z.num, side: null });
      } else if (z.num >= 28 && z.num <= 40) {
        wing.push({ code: String(z.num), label: z.category || z.label || "-", num: z.num, side: null });
      } else if (z.num >= 41 && z.num <= 46) {
        counter.push({ code: String(z.num), label: z.category || z.label || "-", num: z.num, side: null });
      }
    }
    const bySide = (a: StoreChipItem, b: StoreChipItem) =>
      a.num !== b.num ? a.num - b.num : (a.side ?? "").localeCompare(b.side ?? "");
    emer.sort(bySide); topWall.sort(bySide); bottomWall.sort(bySide); wing.sort(bySide); counter.sort(bySide);
    const emerCount = emer.length;
    const generalCount = topWall.length + center22.length + bottomWall.length + wing.length + counter.length;
    return { emer, topWall, center22, bottomWall, wing, counter, emerCount, generalCount };
  }, [storeZones]);
  const emergencyChips = storeSections.emer;
  const generalChips = useMemo(
    () => [...storeSections.topWall, ...storeSections.center22, ...storeSections.bottomWall, ...storeSections.wing, ...storeSections.counter],
    [storeSections],
  );

  // 2026-10-10 · 매대별 집계 (실재고 기준 + products.purchase_price)
  //   · 매장 매대 = products.display_location 그룹 (매대 코드 매칭)
  //   · 창고 매대 = warehouseZones KV (상품 매핑 X · code+label 노출)
  //   · 재고자산 = Σ (store1+store2+store3+warehouse1+warehouse2) × purchase_price
  interface ZoneProduct { code: string; name: string; stock: number; unitPrice: number; assetValue: number; }
  interface ZoneAgg {
    code: string;
    label: string;
    productCount: number;
    assetValue: number;
    products: ZoneProduct[];
  }

  // 매장 매대 집계 (display_location 기준)
  const storeZoneAggs = useMemo((): Map<string, ZoneAgg> => {
    const agg = new Map<string, ZoneAgg>();
    const safeChecks = Array.isArray(checks) ? checks : [];
    for (const chk of safeChecks) {
      const code = String(chk.product_code ?? "");
      if (!code) continue;
      const prod = productsMap[code];
      const loc = String(prod?.display_location ?? "").trim();
      if (!loc) continue;
      const s1 = Number(chk.store1_stock ?? 0);
      const s2 = Number(chk.store2_stock ?? 0);
      const s3 = Number(chk.store3_stock ?? 0);
      const w1 = Number(chk.warehouse1_stock ?? 0);
      const w2 = Number(chk.warehouse2_stock ?? 0);
      const totalStock = s1 + s2 + s3 + w1 + w2;
      const unitPrice = Number((prod as any)?.purchase_price ?? 0);
      const asset = totalStock * unitPrice;
      if (!agg.has(loc)) {
        // zone label 매칭 (zoneDefs 에서 category)
        const zd = storeZones.find(z => z.__location === loc || String(z.num) === loc || z.__locationA === loc || z.__locationB === loc);
        const zoneLabel = zd?.category || zd?.subA || zd?.subB || zd?.label || "-";
        agg.set(loc, { code: loc, label: zoneLabel, productCount: 0, assetValue: 0, products: [] });
      }
      const g = agg.get(loc)!;
      g.products.push({ code, name: String(chk.product_name ?? prod?.name ?? code), stock: totalStock, unitPrice, assetValue: asset });
      g.productCount += 1;
      g.assetValue += asset;
    }
    // 각 매대 products 재고자산 큰 순 정렬
    for (const z of agg.values()) z.products.sort((a, b) => b.assetValue - a.assetValue);
    return agg;
  }, [checks, productsMap, storeZones]);

  // 창고별 전체 집계 (매대 매핑 없음 · 창고1/2 각 상품 리스트)
  const warehouseAggs = useMemo((): { wh1: ZoneAgg; wh2: ZoneAgg } => {
    const build = (filter: "1" | "2"): ZoneAgg => {
      const products: ZoneProduct[] = [];
      let assetTotal = 0;
      const safeChecks = Array.isArray(checks) ? checks : [];
      for (const chk of safeChecks) {
        const code = String(chk.product_code ?? "");
        if (!code) continue;
        const stock = filter === "1" ? Number(chk.warehouse1_stock ?? 0) : Number(chk.warehouse2_stock ?? 0);
        if (stock <= 0) continue;
        const prod = productsMap[code];
        const unitPrice = Number((prod as any)?.purchase_price ?? 0);
        const asset = stock * unitPrice;
        products.push({ code, name: String(chk.product_name ?? prod?.name ?? code), stock, unitPrice, assetValue: asset });
        assetTotal += asset;
      }
      products.sort((a, b) => b.assetValue - a.assetValue);
      return { code: filter === "1" ? "창고1" : "창고2", label: filter === "1" ? "창고 1" : "창고 2", productCount: products.length, assetValue: assetTotal, products };
    };
    return { wh1: build("1"), wh2: build("2") };
  }, [checks, productsMap]);

  // 통화 포맷
  const fmtWon = (n: number): string => {
    if (!Number.isFinite(n) || n === 0) return "₩0";
    if (n >= 100_000_000) return `₩${(n / 100_000_000).toFixed(1)}억`;
    if (n >= 10_000_000) return `₩${Math.round(n / 1_000_000)}백만`;
    if (n >= 10_000) return `₩${Math.round(n / 10_000)}만`;
    return `₩${n.toLocaleString()}`;
  };

  // 2026-10-10 · warehouse zones KV · 창고 매대 매핑 (현재 UI 미사용 · 재사용 대비 로드만 유지)
  // whZones 는 상단에서 로드 · 매대 매핑 데이터 없으므로 창고 상품은 inventory_checks 로만 집계

  useEffect(() => {
    let alive = true;
    listExpiryImminentProducts().then((r: any) => { if (alive) setExpiry(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setExpiry([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  useEffect(() => {
    let alive = true;
    listInventoryChecks().then((r: any) => { if (alive) setChecks(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setChecks([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  const q = search.trim().toLowerCase();
  const expiryRows = useMemo(() => {
    if (!expiry) return [];
    return (q ? expiry.filter(r => String(r.product_name ?? "").toLowerCase().includes(q) || String(r.product_code ?? "").toLowerCase().includes(q)) : expiry).slice(0, 15);
  }, [expiry, q]);
  const checkRows = useMemo(() => {
    if (!checks) return [];
    return (q ? checks.filter(r => String(r.product_name ?? r.product_code ?? "").toLowerCase().includes(q)) : checks).slice(0, 10);
  }, [checks, q]);

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();

  const openDetail = useCallback((row: AnyRow) => {
    setDetail({
      id: row.id,
      product_code: row.product_code,
      product_name: row.product_name,
      barcode: row.barcode,
      category: row.category,
      current_stock: row.current_stock,
      optimal_stock: row.optimal_stock,
      expiry_date: row.expiry_date ?? row.expiry,
      shelf_positions: row.shelf_positions,
      display_location: row.display_location,
      checked_at: row.checked_at,
      created_at: row.created_at,
      qty: row.qty,
      quantity: row.quantity,
      note: row.note,
    });
  }, []);

  const expiryColumns: OverviewTableColumn[] = [
    { key: "code", label: "상품코드" },
    { key: "name", label: "상품명" },
    { key: "exp", label: "유통기한", align: "center" },
    { key: "stock", label: "재고", align: "right" },
  ];
  const expiryData = expiryRows.map(r => ({
    code: r.product_code ?? "-",
    name: r.product_name ?? "-",
    exp: r.expiry_date ?? r.expiry ?? "-",
    stock: r.current_stock != null ? Number(r.current_stock).toLocaleString() : "-",
    __onClick: () => openDetail(r),
  }));

  const checkColumns: OverviewTableColumn[] = [
    { key: "name", label: "상품" },
    { key: "when", label: "체크 일시", align: "center" },
    { key: "qty", label: "수량", align: "right" },
  ];
  const checkData = checkRows.map(r => ({
    name: r.product_name ?? r.product_code ?? "-",
    when: String(r.checked_at ?? r.created_at ?? "").slice(0, 16).replace("T", " ") || "-",
    qty: r.qty ?? r.quantity ?? "-",
    __onClick: () => openDetail(r),
  }));

  return (
    <div className="flex flex-col gap-3 md:gap-4 min-h-0 pb-6 bg-[#F4F7FA]">
      <OverviewPageHeader title="재고·진열" description="재고/실재고/유통기한/진열 업무를 한 페이지에서 처리합니다" />

      {/* 2026-10-10 · 사용자 지시 · inner tab · 현황 / 구역도 · 홈 톤 pill 패턴 (SalesOverview·CategoryTab 벤치) */}
      <div className="px-4 sm:px-6">
        <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {([
            { key: "overview", label: "현황" },
            { key: "map",      label: "구역도" },
          ] as const).map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setInnerTab(t.key)}
              className={`h-9 px-4 rounded-md text-[14px] font-semibold transition-colors cursor-pointer ${
                innerTab === t.key
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-600 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═════════ 구역도 탭 · 세로탭 + 매대 리스트 + 상품 아코디언 ═════════
          · 사용자 지시 "세로탭 · 매대별 제품수+재고자산 · 클릭 → 제품들 · 실재고 기준 · 정렬 · 보기 좋게"
          · 왼쪽 세로 nav (매장/창고1/창고2) + 오른쪽 매대 리스트 테이블
          · 매대 row 클릭 → 아래로 expand (그 매대 상품 리스트)
          · 실재고(inventory_checks) + products.purchase_price 집계 · 재고자산 = Σ stock × purchase_price */}
      {innerTab === "map" && (
        <div className="px-4 sm:px-6 flex flex-col gap-3 md:gap-4">
          {/* 요약 KPI 라인 */}
          <section className={`${CARD} px-3 py-2 md:px-4 md:py-2.5`}>
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap leading-tight">
              <div className="flex items-center gap-1.5 shrink-0 md:pr-3 md:border-r md:border-slate-200">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-indigo-50 text-indigo-700 shrink-0">
                  <MapPin size={14} weight="fill" />
                </span>
                <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">구역도</span>
              </div>
              <ZoneKpi label="매장" value={emergencyChips.length + generalChips.length} tone="sky" />
              <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
              <ZoneKpi label="창고 1" value={warehouseAggs.wh1.productCount} tone="emerald" />
              <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
              <ZoneKpi label="창고 2" value={warehouseAggs.wh2.productCount} tone="violet" />
              <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
              <div className="flex items-baseline gap-1 leading-none">
                <span className="text-[14px] text-slate-500 font-medium">총 재고자산</span>
                <span className="text-[16px] font-bold tabular-nums text-ink">
                  {fmtWon(
                    Array.from(storeZoneAggs.values()).reduce((s, g) => s + g.assetValue, 0)
                    + warehouseAggs.wh1.assetValue + warehouseAggs.wh2.assetValue
                  )}
                </span>
              </div>
            </div>
          </section>

          {/* 세로탭 + 매대 리스트 · 2-col grid (lg) · md 이하 세로 스택 */}
          <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-3 md:gap-4">
            {/* 좌측 세로 nav */}
            <aside className={`${CARD} overflow-hidden flex flex-col lg:self-start`}>
              <ul className="divide-y divide-slate-100">
                {([
                  { key: "store", label: "매장",   count: emergencyChips.length + generalChips.length, Icon: Storefront, tone: "sky" as Tone },
                  { key: "wh1",   label: "창고 1", count: warehouseAggs.wh1.productCount,              Icon: Warehouse,  tone: "emerald" as Tone },
                  { key: "wh2",   label: "창고 2", count: warehouseAggs.wh2.productCount,              Icon: Warehouse,  tone: "violet" as Tone },
                ] as const).map(t => {
                  const active = mapInnerTab === t.key;
                  const ton = TONE[t.tone];
                  return (
                    <li key={t.key}>
                      <button
                        type="button"
                        onClick={() => { setMapInnerTab(t.key); setExpandedZone(null); }}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors cursor-pointer group ${
                          active ? "bg-slate-50" : "hover:bg-slate-50/60"
                        }`}
                      >
                        {active && <span className={`absolute left-0 w-[3px] h-[20px] rounded-r-full ${ton.strip}`} aria-hidden />}
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-[8px] ${ton.bg} ${ton.text} shrink-0`}>
                          <t.Icon size={14} weight="fill" />
                        </span>
                        <span className={`flex-1 text-[14px] md:text-[15px] font-semibold tracking-tight ${active ? "text-ink" : "text-slate-600 group-hover:text-ink"}`}>
                          {t.label}
                        </span>
                        <span className={`text-[13px] font-bold tabular-nums leading-none ${active ? ton.text : "text-slate-400"}`}>
                          {t.count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            {/* 우측 content · 매대 리스트 or 창고 상품 리스트 */}
            <section className={`${CARD} overflow-hidden flex flex-col`}>
              {/* 매장 · 섹션별 그룹 + 매대 리스트 + 클릭 expand */}
              {mapInnerTab === "store" && (
                <>
                  <ZoneListHeader icon={Storefront} tone="sky" title="매장 매대" count={emergencyChips.length + generalChips.length} />
                  <ZoneListTable>
                    <ZoneListGroup title="상비약" subtitle="중앙 진열대 1~9" tone="rose" chips={emergencyChips} aggs={storeZoneAggs} expanded={expandedZone} onToggle={setExpandedZone} fmtWon={fmtWon} />
                    {storeSections.topWall.length > 0 && (
                      <ZoneListGroup title="일반약" subtitle="상단 벽 10~21" tone="sky" chips={storeSections.topWall} aggs={storeZoneAggs} expanded={expandedZone} onToggle={setExpandedZone} fmtWon={fmtWon} />
                    )}
                    {storeSections.center22.length > 0 && (
                      <ZoneListGroup title="일반약" subtitle="중앙 22" tone="sky" chips={storeSections.center22} aggs={storeZoneAggs} expanded={expandedZone} onToggle={setExpandedZone} fmtWon={fmtWon} />
                    )}
                    {storeSections.bottomWall.length > 0 && (
                      <ZoneListGroup title="일반약" subtitle="하단 벽 23~27" tone="sky" chips={storeSections.bottomWall} aggs={storeZoneAggs} expanded={expandedZone} onToggle={setExpandedZone} fmtWon={fmtWon} />
                    )}
                    {storeSections.wing.length > 0 && (
                      <ZoneListGroup title="일반약" subtitle="윙 28~40" tone="sky" chips={storeSections.wing} aggs={storeZoneAggs} expanded={expandedZone} onToggle={setExpandedZone} fmtWon={fmtWon} />
                    )}
                    {storeSections.counter.length > 0 && (
                      <ZoneListGroup title="일반약" subtitle="카운터 41~46" tone="sky" chips={storeSections.counter} aggs={storeZoneAggs} expanded={expandedZone} onToggle={setExpandedZone} fmtWon={fmtWon} />
                    )}
                    {storeZones.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-[14px] text-slate-400">매장 구역 데이터를 불러오는 중...</td></tr>
                    )}
                  </ZoneListTable>
                </>
              )}

              {/* 창고 1 · 상품 리스트 (매대 매핑 X · 전체 상품 asset desc 정렬) */}
              {mapInnerTab === "wh1" && (
                <>
                  <ZoneListHeader icon={Warehouse} tone="emerald" title="창고 1 상품" count={warehouseAggs.wh1.productCount} assetValue={warehouseAggs.wh1.assetValue} fmtWon={fmtWon} />
                  <WarehouseProductTable products={warehouseAggs.wh1.products} fmtWon={fmtWon} tone="emerald" />
                </>
              )}

              {/* 창고 2 */}
              {mapInnerTab === "wh2" && (
                <>
                  <ZoneListHeader icon={Warehouse} tone="violet" title="창고 2 상품" count={warehouseAggs.wh2.productCount} assetValue={warehouseAggs.wh2.assetValue} fmtWon={fmtWon} />
                  <WarehouseProductTable products={warehouseAggs.wh2.products} fmtWon={fmtWon} tone="violet" />
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ═════════ 현황 탭 · 기존 KPI + 섹션들 ═════════ */}
      {innerTab === "overview" && (<>
      <OverviewToolbar search={search} onSearch={setSearch} placeholder="상품명·코드 검색"
        right={
          <button type="button" onClick={() => setRefreshKey(k => k + 1)}
            className="h-10 px-3 text-[14px] font-medium text-ink border border-slate-200 rounded-lg bg-white hover:bg-slate-50 cursor-pointer transition-colors">새로고침</button>
        }
      />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<Clock size={18} weight="fill" />} label="유통기한 임박" value={kpiValue(expiry?.length)} unit="건" tone="amber" hint="만료 임박" />
        <OverviewKpi icon={<ListChecks size={18} weight="fill" />} label="실재고 체크" value={kpiValue(checks?.length)} unit="건" tone="brand" hint="누적 기록" />
        <OverviewKpi icon={<Package size={18} weight="fill" />} label="재고 부족" value="-" tone="rose" hint="재고부족 endpoint 통합 예정" />
        <OverviewKpi icon={<Storefront size={18} weight="fill" />} label="진열 요청" value="-" tone="violet" hint="StoreZoneMap 통합 예정" />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
        <OverviewSection
          title={<span>유통기한 임박 상품 <span className="ml-2 text-[13px] font-medium text-ink-soft">{expiryRows.length}건</span></span>}
          action={<span className="text-[12px] font-medium text-ink-soft">row 클릭 · 상세</span>}
        >
          <OverviewTable columns={expiryColumns} rows={expiryData} emptyMessage={expiry == null ? "불러오는 중..." : "임박 상품이 없습니다"} />
        </OverviewSection>

        <OverviewSection
          title={<span>실재고 체크 <span className="ml-2 text-[13px] font-medium text-ink-soft">{checkRows.length}건</span></span>}
          action={<span className="text-[12px] font-medium text-ink-soft">row 클릭 · 상세</span>}
        >
          <OverviewTable columns={checkColumns} rows={checkData} emptyMessage={checks == null ? "불러오는 중..." : "실재고 체크 기록이 없습니다"} />
        </OverviewSection>
      </div>

      <div className="px-4 sm:px-6">
        <OverviewSection title={<span>진열 · 상품정보 통합 안내</span>}>
          <div className="flex items-start gap-3 p-4 border border-violet-200 bg-violet-50 rounded-lg text-[14px]">
            <Storefront size={20} className="text-violet-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-violet-800">StoreZoneMap · ProductInfo · Shelf SSOT 보호</div>
              <div className="text-[13px] text-violet-700 mt-1">
                기존 매장 구역도 (StoreZoneMap) · 상품정보 · 진열 위치 관리 기능은 Shelf SSOT (formatCompactDisplayLocation ·
                ShelfPositionsBadge) 보호 범위를 유지하면서 ProductInventoryDetailModal로 통합 예정.
                재고부족 · 진열 요청 KPI는 해당 summary endpoint 확정 후 추가.
              </div>
            </div>
          </div>
        </OverviewSection>
      </div>
      </>)}

      <ProductInventoryDetailModal open={detail != null} onClose={() => setDetail(null)} row={detail} />
    </div>
  );
};

// ═════════ 구역도 Sub-components (홈 랜딩 톤 · 세로탭 + 매대 리스트 + 상품 아코디언) ═════════

/** inline KPI · HomeDashboard KpiMini 패턴 */
const ZoneKpi: React.FC<{ label: string; value: number; tone: Tone }> = ({ label, value, tone }) => {
  const t = TONE[tone];
  return (
    <div className="flex items-baseline gap-1 leading-none">
      <span className="text-[14px] text-slate-500 font-medium">{label}</span>
      <span className={`text-[16px] font-bold tabular-nums ${t.text}`}>{value}</span>
    </div>
  );
};

/** 리스트 상단 header · icon tile + title + count + optional asset */
const ZoneListHeader: React.FC<{
  icon: React.ElementType;
  tone: Tone;
  title: string;
  count: number;
  assetValue?: number;
  fmtWon?: (n: number) => string;
}> = ({ icon: Icon, tone, title, count, assetValue, fmtWon }) => {
  const t = TONE[tone];
  return (
    <header className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 border-b border-slate-100 leading-tight">
      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-[8px] ${t.bg} ${t.text} shrink-0`}>
        <Icon size={14} weight="fill" />
      </span>
      <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">{title}</span>
      <span className="text-[13px] text-slate-500 font-medium tabular-nums">({count})</span>
      {assetValue != null && fmtWon && (
        <span className="ml-auto flex items-baseline gap-1">
          <span className="text-[13px] text-slate-500 font-medium">재고자산</span>
          <span className={`text-[15px] font-bold tabular-nums ${t.text}`}>{fmtWon(assetValue)}</span>
        </span>
      )}
    </header>
  );
};

/** 테이블 wrapper · 공통 그리드 (코드 · 매대명 · 제품수 · 재고자산) */
const ZoneListTable: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left">
      <thead>
        <tr className="text-[13px] text-slate-500 font-medium border-b border-slate-100 bg-slate-50/40">
          <th className="px-3 md:px-4 py-2 w-[90px]">코드</th>
          <th className="px-3 py-2">매대명</th>
          <th className="px-3 py-2 text-right w-[90px]">제품수</th>
          <th className="px-3 md:px-4 py-2 text-right w-[130px]">재고자산</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {children}
      </tbody>
    </table>
  </div>
);

/** 섹션 그룹 (상비약/일반약) · header row + 매대 row들 (클릭 시 expand) */
const ZoneListGroup: React.FC<{
  title: string;
  subtitle: string;
  tone: Tone;
  chips: StoreChipItem[];
  aggs: Map<string, { code: string; label: string; productCount: number; assetValue: number; products: Array<{ code: string; name: string; stock: number; unitPrice: number; assetValue: number }> }>;
  expanded: string | null;
  onToggle: (code: string | null) => void;
  fmtWon: (n: number) => string;
}> = ({ title, subtitle, tone, chips, aggs, expanded, onToggle, fmtWon }) => {
  const t = TONE[tone];
  const sectionAssetTotal = chips.reduce((s, c) => s + (aggs.get(c.code)?.assetValue ?? 0), 0);
  const sectionProductTotal = chips.reduce((s, c) => s + (aggs.get(c.code)?.productCount ?? 0), 0);
  return (
    <>
      <tr className="bg-slate-50/60">
        <td colSpan={2} className="px-3 md:px-4 py-1.5">
          <div className="flex items-baseline gap-1.5 leading-none">
            <span className={`inline-block w-[3px] h-[12px] rounded-full ${t.strip} self-center`} />
            <span className={`text-[13px] font-semibold ${t.text} tracking-tight`}>{title}</span>
            <span className="text-[12px] text-slate-500 font-medium">{subtitle}</span>
          </div>
        </td>
        <td className="px-3 py-1.5 text-right text-[13px] text-slate-500 font-semibold tabular-nums">{sectionProductTotal}</td>
        <td className="px-3 md:px-4 py-1.5 text-right text-[13px] text-slate-600 font-semibold tabular-nums">{fmtWon(sectionAssetTotal)}</td>
      </tr>
      {chips.map(c => {
        const agg = aggs.get(c.code);
        const count = agg?.productCount ?? 0;
        const asset = agg?.assetValue ?? 0;
        const isExpanded = expanded === c.code;
        const hasProducts = count > 0;
        return (
          <React.Fragment key={`row-${c.code}`}>
            <tr
              onClick={() => hasProducts && onToggle(isExpanded ? null : c.code)}
              className={`transition-colors ${hasProducts ? "cursor-pointer hover:bg-slate-50/80" : "cursor-default"} ${isExpanded ? "bg-slate-50" : ""}`}
            >
              <td className="px-3 md:px-4 py-2">
                <div className="flex items-center gap-1.5">
                  {hasProducts && (
                    isExpanded
                      ? <CaretDown size={12} weight="bold" className="text-slate-500 shrink-0" />
                      : <CaretRight size={12} weight="bold" className="text-slate-400 shrink-0" />
                  )}
                  {!hasProducts && <span className="inline-block w-3" aria-hidden />}
                  <span className={`inline-flex items-center justify-center min-w-[28px] h-[20px] px-1 rounded-[5px] ${t.bg} ${t.text} text-[12px] font-bold tabular-nums leading-none`}>
                    {c.code}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2 text-[14px] text-ink font-medium leading-tight">
                <span className="line-clamp-1" title={c.label}>{c.label}</span>
              </td>
              <td className="px-3 py-2 text-right text-[14px] font-semibold text-ink tabular-nums">
                {count > 0 ? count : <span className="text-slate-300">0</span>}
              </td>
              <td className="px-3 md:px-4 py-2 text-right text-[14px] font-bold text-ink tabular-nums">
                {asset > 0 ? fmtWon(asset) : <span className="text-slate-300 font-medium">-</span>}
              </td>
            </tr>
            {isExpanded && agg && (
              <tr className="bg-slate-50/40">
                <td colSpan={4} className="px-3 md:px-4 py-3">
                  <ProductSubList products={agg.products} fmtWon={fmtWon} />
                </td>
              </tr>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

/** 창고 상품 flat 테이블 · 매대 매핑 X · 재고자산 큰 순 */
const WarehouseProductTable: React.FC<{
  products: Array<{ code: string; name: string; stock: number; unitPrice: number; assetValue: number }>;
  fmtWon: (n: number) => string;
  tone: Tone;
}> = ({ products, fmtWon, tone }) => {
  const t = TONE[tone];
  if (products.length === 0) {
    return <div className="py-8 text-center text-[14px] text-slate-400">창고 상품 데이터 없음</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-[13px] text-slate-500 font-medium border-b border-slate-100 bg-slate-50/40">
            <th className="px-3 md:px-4 py-2 w-[110px]">상품코드</th>
            <th className="px-3 py-2">상품명</th>
            <th className="px-3 py-2 text-right w-[80px]">재고</th>
            <th className="px-3 py-2 text-right w-[100px]">단가</th>
            <th className="px-3 md:px-4 py-2 text-right w-[130px]">재고자산</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map(p => (
            <tr key={`wh-${p.code}`} className="hover:bg-slate-50/60 transition-colors">
              <td className="px-3 md:px-4 py-2 text-[13px] text-slate-500 font-medium tabular-nums">{p.code}</td>
              <td className="px-3 py-2 text-[14px] text-ink font-medium leading-tight">
                <span className="line-clamp-1" title={p.name}>{p.name}</span>
              </td>
              <td className={`px-3 py-2 text-right text-[14px] font-semibold tabular-nums ${t.text}`}>{p.stock.toLocaleString()}</td>
              <td className="px-3 py-2 text-right text-[13px] text-slate-600 font-medium tabular-nums">{p.unitPrice > 0 ? `₩${p.unitPrice.toLocaleString()}` : "-"}</td>
              <td className="px-3 md:px-4 py-2 text-right text-[14px] font-bold text-ink tabular-nums">{p.assetValue > 0 ? fmtWon(p.assetValue) : <span className="text-slate-300 font-medium">-</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** 매대 상품 sub-list (아코디언 안) · 상품명 · 재고 · 단가 · 재고자산 · asset desc 정렬 */
const ProductSubList: React.FC<{
  products: Array<{ code: string; name: string; stock: number; unitPrice: number; assetValue: number }>;
  fmtWon: (n: number) => string;
}> = ({ products, fmtWon }) => {
  if (products.length === 0) {
    return <div className="py-4 text-center text-[13px] text-slate-400">상품 없음</div>;
  }
  return (
    <div className="bg-white border border-slate-200 rounded-[8px] overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="text-[12px] text-slate-500 font-medium border-b border-slate-100 bg-slate-50/60">
            <th className="px-3 py-1.5 w-[90px]">코드</th>
            <th className="px-3 py-1.5">상품명</th>
            <th className="px-3 py-1.5 text-right w-[70px]">재고</th>
            <th className="px-3 py-1.5 text-right w-[90px]">단가</th>
            <th className="px-3 py-1.5 text-right w-[110px]">재고자산</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map(p => (
            <tr key={`sub-${p.code}`} className="hover:bg-slate-50/40 transition-colors">
              <td className="px-3 py-1.5 text-[12px] text-slate-500 font-medium tabular-nums">{p.code}</td>
              <td className="px-3 py-1.5 text-[13px] text-ink font-medium leading-tight">
                <span className="line-clamp-1" title={p.name}>{p.name}</span>
              </td>
              <td className="px-3 py-1.5 text-right text-[13px] font-semibold text-ink tabular-nums">{p.stock.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right text-[12px] text-slate-600 font-medium tabular-nums">{p.unitPrice > 0 ? `₩${p.unitPrice.toLocaleString()}` : "-"}</td>
              <td className="px-3 py-1.5 text-right text-[13px] font-bold text-ink tabular-nums">{p.assetValue > 0 ? fmtWon(p.assetValue) : <span className="text-slate-300 font-medium">-</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default InventoryDisplayOverview;
