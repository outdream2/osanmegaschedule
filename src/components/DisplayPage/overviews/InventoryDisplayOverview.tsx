// src/components/DisplayPage/overviews/InventoryDisplayOverview.tsx
// 2026-10-09 · GLOBAL UI · 재고·진열 Single-Page Operations Console
//   · L2 폐기 · shortcut 폐기 · modal-first
//   · Real · listExpiryImminentProducts · listInventoryChecks
//   · row click → ProductInventoryDetailModal (domain-specific · Shelf SSOT 보호)

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Package, Storefront, Clock, ListChecks, Warehouse, MapPin } from "@phosphor-icons/react";
import {
  OverviewPageHeader, OverviewToolbar, OverviewSection, OverviewKpi, OverviewTable,
  type OverviewTableColumn,
} from "./StoreOverviewPrimitives";
import { listExpiryImminentProducts } from "../../../lib/productsApi";
import { listInventoryChecks } from "../../../lib/inventoryChecksApi";
import { ProductInventoryDetailModal, type ProductInventoryDetailRow } from "./ProductInventoryDetailModal";
// 2026-10-10 · 사용자 지시 · 구역도 Bento 대시보드 · 매장(일반약/상비약) + 창고1 + 창고2 통합
//   · 홈 랜딩 톤 (HomeDashboard SSOT · CARD rounded-[12px] + border-slate-200 + thin shadow)
//   · 매대 이름 chip 그리드 · 실사 레이아웃 비복제 (사용자 "실사와 달라도 괜찮아")
import { useZoneDefs, classifyMajorZone, type ZoneDefWithRowIds } from "../../../hooks/useZoneDefs";
import { useKvSetting } from "../../../hooks/useKvSetting";
import {
  DEFAULT_WAREHOUSE_ZONES,
  WAREHOUSE_ZONES_KEY,
  type WarehouseZonesConfig,
  type WarehouseZoneItem,
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

  // 2026-10-10 · 창고2 · 4개 sub section 전부 합침 (단일 뷰로 노출)
  const warehouse2All = useMemo((): WarehouseZoneItem[] => {
    if (!whZones) return [];
    return [
      ...(whZones.warehouse2_inner ?? []),
      ...(whZones.warehouse2_center ?? []),
      ...(whZones.warehouse2_right ?? []),
      ...(whZones.warehouse2_cosmetics ?? []),
    ];
  }, [whZones]);
  const warehouse1 = whZones?.warehouse1 ?? [];

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

      {/* ═════════ 구역도 탭 · 판매·매출현황 패턴 · inner-inner tabs + section 그룹핑 ═════════
          · 사용자 지시 "판매·매출현황 식 · 다른 페이지 톤 · 글씨 아래 여백 줄여 · 최신 트렌드"
          · tight density (gap-2 · py-2) · leading-tight · 2026 트렌드 (Linear/Vercel/Attio) */}
      {innerTab === "map" && (
        <div className="px-4 sm:px-6 flex flex-col gap-3 md:gap-4">
          {/* 요약 KPI 라인 · tight · HomeDashboard quick-row 패턴 */}
          <section className={`${CARD} px-3 py-2 md:px-4 md:py-2.5`}>
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap leading-tight">
              <div className="flex items-center gap-1.5 shrink-0 md:pr-3 md:border-r md:border-slate-200">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-indigo-50 text-indigo-700 shrink-0">
                  <MapPin size={14} weight="fill" />
                </span>
                <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">구역도</span>
              </div>
              <ZoneKpi label="상비약" value={emergencyChips.length} tone="rose" />
              <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
              <ZoneKpi label="일반약" value={generalChips.length} tone="sky" />
              <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
              <ZoneKpi label="창고 1" value={warehouse1.length} tone="emerald" />
              <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
              <ZoneKpi label="창고 2" value={warehouse2All.length} tone="violet" />
            </div>
          </section>

          {/* inner-inner tabs · 판매·매출현황 pill 패턴 (여백 통일 · pt-1 제거) */}
          <div>
            <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              {([
                { key: "store", label: "매장",   count: emergencyChips.length + generalChips.length },
                { key: "wh1",   label: "창고 1", count: warehouse1.length },
                { key: "wh2",   label: "창고 2", count: warehouse2All.length },
              ] as const).map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setMapInnerTab(t.key)}
                  className={`h-8 px-3.5 rounded-md text-[14px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    mapInnerTab === t.key
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-600 hover:text-ink"
                  }`}
                >
                  {t.label}
                  <span className={`text-[12px] font-bold tabular-nums leading-none ${mapInnerTab === t.key ? "text-blue-700/70" : "text-slate-400"}`}>{t.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 매장 탭 · 섹션 그룹핑 (상비약 + 일반약 5 sub-section) */}
          {mapInnerTab === "store" && (
            <section className={`${CARD} overflow-hidden`}>
              <header className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 border-b border-slate-100 leading-tight">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-sky-50 text-sky-700 shrink-0">
                  <Storefront size={14} weight="fill" />
                </span>
                <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">매장 구역</span>
                <span className="ml-auto text-[13px] text-slate-500 font-medium tabular-nums">{emergencyChips.length + generalChips.length}구역</span>
              </header>
              <div className="p-3 md:p-4 flex flex-col gap-3">
                <ZoneSection title="상비약" subtitle="중앙 진열대 1~9" tone="rose" count={emergencyChips.length}>
                  <AisleGrid chips={emergencyChips} tone="rose" />
                </ZoneSection>
                {storeSections.topWall.length > 0 && (
                  <ZoneSection title="일반약" subtitle="상단 벽 10~21" tone="sky" count={storeSections.topWall.length}>
                    <ChipGrid chips={storeSections.topWall} tone="sky" />
                  </ZoneSection>
                )}
                {storeSections.center22.length > 0 && (
                  <ZoneSection title="일반약" subtitle="중앙 22" tone="sky" count={storeSections.center22.length}>
                    <ChipGrid chips={storeSections.center22} tone="sky" />
                  </ZoneSection>
                )}
                {storeSections.bottomWall.length > 0 && (
                  <ZoneSection title="일반약" subtitle="하단 벽 23~27" tone="sky" count={storeSections.bottomWall.length}>
                    <ChipGrid chips={storeSections.bottomWall} tone="sky" />
                  </ZoneSection>
                )}
                {storeSections.wing.length > 0 && (
                  <ZoneSection title="일반약" subtitle="윙 28~40" tone="sky" count={storeSections.wing.length}>
                    <ChipGrid chips={storeSections.wing} tone="sky" />
                  </ZoneSection>
                )}
                {storeSections.counter.length > 0 && (
                  <ZoneSection title="일반약" subtitle="카운터 41~46" tone="sky" count={storeSections.counter.length}>
                    <ChipGrid chips={storeSections.counter} tone="sky" />
                  </ZoneSection>
                )}
                {storeZones.length === 0 && (
                  <div className="py-6 text-center text-[14px] text-slate-400">매장 구역 데이터를 불러오는 중...</div>
                )}
              </div>
            </section>
          )}

          {/* 창고1 탭 */}
          {mapInnerTab === "wh1" && (
            <section className={`${CARD} overflow-hidden`}>
              <header className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 border-b border-slate-100 leading-tight">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-emerald-50 text-emerald-700 shrink-0">
                  <Warehouse size={14} weight="fill" />
                </span>
                <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">창고 1</span>
                <span className="ml-auto text-[13px] text-slate-500 font-medium tabular-nums">{warehouse1.length}구역</span>
              </header>
              <div className="p-3 md:p-4">
                <WarehouseGrid items={warehouse1} tone="emerald" emptyMsg="창고 1 데이터 없음" />
              </div>
            </section>
          )}

          {/* 창고2 탭 */}
          {mapInnerTab === "wh2" && (
            <section className={`${CARD} overflow-hidden`}>
              <header className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 border-b border-slate-100 leading-tight">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-violet-50 text-violet-700 shrink-0">
                  <Warehouse size={14} weight="fill" />
                </span>
                <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">창고 2</span>
                <span className="ml-auto text-[13px] text-slate-500 font-medium tabular-nums">{warehouse2All.length}구역</span>
              </header>
              <div className="p-3 md:p-4">
                <WarehouseGrid items={warehouse2All} tone="violet" emptyMsg="창고 2 데이터 없음" />
              </div>
            </section>
          )}
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

// ═════════ 구역도 Sub-components (홈 랜딩 톤 · tight density · 2026 트렌드) ═════════

/** inline KPI · HomeDashboard KpiMini 패턴 · leading-none */
const ZoneKpi: React.FC<{ label: string; value: number; tone: Tone }> = ({ label, value, tone }) => {
  const t = TONE[tone];
  return (
    <div className="flex items-baseline gap-1 leading-none">
      <span className="text-[14px] text-slate-500 font-medium">{label}</span>
      <span className={`text-[16px] font-bold tabular-nums ${t.text}`}>{value}</span>
    </div>
  );
};

/** section · 3px thin strip + title + subtitle + count · tight */
const ZoneSection: React.FC<{ title: string; subtitle?: string; tone: Tone; count: number; children: React.ReactNode }> = ({ title, subtitle, tone, count, children }) => {
  const t = TONE[tone];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-1.5 leading-none">
        <span className={`inline-block w-[3px] h-[12px] rounded-full ${t.strip} self-center`} />
        <span className={`text-[14px] font-semibold ${t.text} tracking-tight`}>{title}</span>
        {subtitle && <span className="text-[13px] text-slate-500 font-medium">{subtitle}</span>}
        <span className="text-[13px] text-slate-400 font-medium tabular-nums ml-auto">{count}</span>
      </div>
      {children}
    </div>
  );
};

/** 상비약 A/B pair grid · 중앙 진열대 1~9 · 각 column A·B 세로 쌍 (대략 위치) */
const AisleGrid: React.FC<{ chips: StoreChipItem[]; tone: Tone }> = ({ chips, tone }) => {
  // group by num · 각 num 당 { A, B, base }
  const byNum = new Map<number, { A?: StoreChipItem; B?: StoreChipItem; base?: StoreChipItem }>();
  for (const c of chips) {
    if (!byNum.has(c.num)) byNum.set(c.num, {});
    const g = byNum.get(c.num)!;
    if (c.side === "A") g.A = c;
    else if (c.side === "B") g.B = c;
    else g.base = c;
  }
  const nums = Array.from(byNum.keys()).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-1.5">
      {nums.map(n => {
        const g = byNum.get(n)!;
        return (
          <div key={`aisle-${n}`} className="flex flex-col gap-1">
            {g.A && <Chip chip={g.A} tone={tone} />}
            {g.B && <Chip chip={g.B} tone={tone} />}
            {g.base && <Chip chip={g.base} tone={tone} />}
          </div>
        );
      })}
    </div>
  );
};

/** 일반약 chip 그리드 · 벽/wing/카운터 · 가로 flow */
const ChipGrid: React.FC<{ chips: StoreChipItem[]; tone: Tone }> = ({ chips, tone }) => {
  if (chips.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
      {chips.map(c => <Chip key={`chip-${c.code}`} chip={c} tone={tone} />)}
    </div>
  );
};

/** 매대 chip · code pill + label · tight padding · leading-tight */
const Chip: React.FC<{ chip: StoreChipItem; tone: Tone }> = ({ chip, tone }) => {
  const t = TONE[tone];
  return (
    <div
      className="bg-white border border-slate-200 rounded-[8px] px-2 py-1.5 flex items-center gap-1.5 hover:border-slate-300 hover:shadow-[0_2px_6px_rgba(0,0,0,0.05)] transition-all cursor-default"
      title={chip.label}
    >
      <span className={`inline-flex items-center justify-center min-w-[26px] h-[20px] px-1 rounded-[5px] ${t.bg} ${t.text} text-[12px] font-bold tabular-nums shrink-0 leading-none`}>
        {chip.code}
      </span>
      <span className="text-[13px] text-ink font-medium flex-1 min-w-0 truncate leading-tight">
        {chip.label}
      </span>
    </div>
  );
};

/** 창고 매대 grid · WarehouseZoneItem · tag/hint 노출 */
const WarehouseGrid: React.FC<{ items: WarehouseZoneItem[]; tone: Tone; emptyMsg: string }> = ({ items, tone, emptyMsg }) => {
  const t = TONE[tone];
  if (items.length === 0) {
    return <div className="py-6 text-center text-[13px] text-slate-400">{emptyMsg}</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
      {items.map((it, idx) => (
        <div
          key={`${it.code}-${idx}`}
          className="bg-white border border-slate-200 rounded-[8px] px-2 py-1.5 flex items-start gap-1.5 hover:border-slate-300 hover:shadow-[0_2px_6px_rgba(0,0,0,0.05)] transition-all cursor-default"
          title={it.hint ?? it.label}
        >
          <span className={`inline-flex items-center justify-center min-w-[32px] h-[20px] px-1 rounded-[5px] ${t.bg} ${t.text} text-[12px] font-bold tabular-nums shrink-0 mt-0.5 leading-none`}>
            {it.code}
          </span>
          <div className="flex-1 min-w-0 flex flex-col gap-0 leading-tight">
            <span className="text-[13px] text-ink font-medium" title={it.label}>{it.label}</span>
            {it.tag && (
              <span className="text-[12px] text-slate-500 font-medium">{it.tag}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default InventoryDisplayOverview;
