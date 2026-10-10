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

  // 2026-10-10 · 구역도 데이터 · 매장 zone_defs + 창고 KV (readonly)
  const { zones: storeZones } = useZoneDefs();
  const { value: whZones } = useKvSetting<WarehouseZonesConfig>({
    key: WAREHOUSE_ZONES_KEY,
    defaultValue: DEFAULT_WAREHOUSE_ZONES,
  });

  // 2026-10-10 · 매장 2분법 · 상비약 (중앙상비약존) vs 일반약 (상담·뷰티식품·카운터·기타)
  //   · 사용자 지시 · "일반약 상비약 부분 나뉘고 · 매대 이름이 나오면 되니까"
  const { emergencyZones, generalZones } = useMemo(() => {
    const emer: ZoneDefWithRowIds[] = [];
    const regu: ZoneDefWithRowIds[] = [];
    for (const z of storeZones) {
      const loc = z.__location ?? z.label ?? "";
      if (classifyMajorZone(loc) === "중앙상비약존") emer.push(z);
      else regu.push(z);
    }
    const sortByNum = (a: ZoneDefWithRowIds, b: ZoneDefWithRowIds) => a.num - b.num;
    emer.sort(sortByNum);
    regu.sort(sortByNum);
    return { emergencyZones: emer, generalZones: regu };
  }, [storeZones]);

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
    <div className="flex flex-col gap-4 min-h-0 pb-6 bg-[#F4F7FA]">
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

      {/* ═════════ 구역도 탭 · Bento 대시보드 ═════════
          · 사용자 지시 "대시보드 · 최신 트렌드 · 멋지고 깔끔 팬시 · 한눈에 · 홈 랜딩 톤"
          · 매장 (상비약 + 일반약 2 섹션) · 창고1 · 창고2 - 3-way Bento
          · 각 매대 ZoneChip · code pill + 매대명 · 홈 랜딩 subtle color + icon tile */}
      {innerTab === "map" && (
        <div className="px-4 sm:px-6 flex flex-col gap-4">
          {/* 요약 KPI 라인 · HomeDashboard quick-row 패턴 */}
          <section className={`${CARD} px-3 py-2.5 md:px-4 md:py-3`}>
            <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
              <div className="flex items-center gap-1.5 shrink-0 md:pr-3 md:border-r md:border-slate-200">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-indigo-50 text-indigo-700 shrink-0">
                  <MapPin size={14} weight="fill" />
                </span>
                <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">구역도</span>
              </div>
              <ZoneKpi label="상비약" value={emergencyZones.length} tone="rose" />
              <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
              <ZoneKpi label="일반약" value={generalZones.length} tone="sky" />
              <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
              <ZoneKpi label="창고 1" value={warehouse1.length} tone="emerald" />
              <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
              <ZoneKpi label="창고 2" value={warehouse2All.length} tone="violet" />
            </div>
          </section>

          {/* Bento grid · 매장(2fr) + 창고1·2 세로 스택(1fr) · md 이하 1-col */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 매장 · lg 2-col · 상비약 + 일반약 2 섹션 */}
            <section className={`${CARD} lg:col-span-2 overflow-hidden flex flex-col`}>
              <header className="flex items-center gap-2 px-3 py-2.5 md:px-4 md:py-3 border-b border-slate-100">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-sky-50 text-sky-700 shrink-0">
                  <Storefront size={14} weight="fill" />
                </span>
                <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">매장</span>
                <span className="ml-auto text-[13px] md:text-[14px] text-slate-500 font-medium tabular-nums">{storeZones.length}구역</span>
              </header>
              <div className="p-3 md:p-4 flex flex-col gap-4">
                <ZoneGroup title="상비약" tone="rose" count={emergencyZones.length}>
                  {emergencyZones.map(z => (
                    <StoreZoneChip key={`emer-${z.num}`} zone={z} tone="rose" />
                  ))}
                </ZoneGroup>
                <ZoneGroup title="일반약" tone="sky" count={generalZones.length}>
                  {generalZones.map(z => (
                    <StoreZoneChip key={`regu-${z.num}`} zone={z} tone="sky" />
                  ))}
                </ZoneGroup>
                {storeZones.length === 0 && (
                  <div className="py-8 text-center text-[14px] text-slate-400">매장 구역 데이터를 불러오는 중...</div>
                )}
              </div>
            </section>

            {/* 창고1 · 창고2 세로 스택 */}
            <div className="flex flex-col gap-4">
              <section className={`${CARD} overflow-hidden flex flex-col`}>
                <header className="flex items-center gap-2 px-3 py-2.5 md:px-4 md:py-3 border-b border-slate-100">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-emerald-50 text-emerald-700 shrink-0">
                    <Warehouse size={14} weight="fill" />
                  </span>
                  <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">창고 1</span>
                  <span className="ml-auto text-[13px] md:text-[14px] text-slate-500 font-medium tabular-nums">{warehouse1.length}구역</span>
                </header>
                <div className="p-3 md:p-4">
                  <WarehouseGrid items={warehouse1} tone="emerald" emptyMsg="창고 1 데이터 없음" />
                </div>
              </section>

              <section className={`${CARD} overflow-hidden flex flex-col`}>
                <header className="flex items-center gap-2 px-3 py-2.5 md:px-4 md:py-3 border-b border-slate-100">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-violet-50 text-violet-700 shrink-0">
                    <Warehouse size={14} weight="fill" />
                  </span>
                  <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">창고 2</span>
                  <span className="ml-auto text-[13px] md:text-[14px] text-slate-500 font-medium tabular-nums">{warehouse2All.length}구역</span>
                </header>
                <div className="p-3 md:p-4">
                  <WarehouseGrid items={warehouse2All} tone="violet" emptyMsg="창고 2 데이터 없음" />
                </div>
              </section>
            </div>
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

// ═════════ 구역도 Sub-components (홈 랜딩 톤) ═════════

/** inline KPI (요약 라인) · HomeDashboard KpiMini 패턴 */
const ZoneKpi: React.FC<{ label: string; value: number; tone: Tone }> = ({ label, value, tone }) => {
  const t = TONE[tone];
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[14px] md:text-[15px] text-slate-500 font-medium">{label}</span>
      <span className={`text-[16px] md:text-[17px] font-bold tabular-nums leading-none ${t.text}`}>{value}</span>
      <span className="text-[13px] text-slate-400 font-medium">구역</span>
    </div>
  );
};

/** 섹션 (상비약·일반약) · 3px thin label strip + title + count + grid children */
const ZoneGroup: React.FC<{ title: string; tone: Tone; count: number; children: React.ReactNode }> = ({ title, tone, count, children }) => {
  const t = TONE[tone];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-[3px] h-[14px] rounded-full ${t.strip}`} />
        <span className={`text-[14px] md:text-[15px] font-semibold ${t.text} tracking-tight`}>{title}</span>
        <span className="text-[13px] md:text-[14px] text-slate-500 font-medium tabular-nums">{count}구역</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {children}
      </div>
    </div>
  );
};

/** 매장 매대 chip · code (num + A/B) + label */
const StoreZoneChip: React.FC<{ zone: ZoneDefWithRowIds; tone: Tone }> = ({ zone, tone }) => {
  const t = TONE[tone];
  const code = zone.__location ?? String(zone.num);
  const label = zone.label || zone.category || "-";
  return (
    <div className="bg-white border border-slate-200 rounded-[8px] px-2.5 py-2 flex items-center gap-2 hover:border-slate-300 hover:shadow-[0_2px_6px_rgba(0,0,0,0.05)] transition-all cursor-default">
      <span className={`inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-[6px] ${t.bg} ${t.text} text-[13px] font-bold tabular-nums shrink-0`}>
        {code}
      </span>
      <span className="text-[14px] text-ink font-medium flex-1 min-w-0" title={label}>
        {label}
      </span>
    </div>
  );
};

/** 창고 매대 grid · WarehouseZoneItem[] · code pill + label */
const WarehouseGrid: React.FC<{ items: WarehouseZoneItem[]; tone: Tone; emptyMsg: string }> = ({ items, tone, emptyMsg }) => {
  const t = TONE[tone];
  if (items.length === 0) {
    return <div className="py-6 text-center text-[13px] text-slate-400">{emptyMsg}</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map((it, idx) => (
        <div
          key={`${it.code}-${idx}`}
          className="bg-white border border-slate-200 rounded-[8px] px-2.5 py-2 flex items-start gap-2 hover:border-slate-300 hover:shadow-[0_2px_6px_rgba(0,0,0,0.05)] transition-all cursor-default"
        >
          <span className={`inline-flex items-center justify-center min-w-[32px] h-6 px-1.5 rounded-[6px] ${t.bg} ${t.text} text-[13px] font-bold tabular-nums shrink-0 mt-0.5`}>
            {it.code}
          </span>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-[14px] text-ink font-medium leading-tight" title={it.label}>{it.label}</span>
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
