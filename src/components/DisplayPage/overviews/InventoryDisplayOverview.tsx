// src/components/DisplayPage/overviews/InventoryDisplayOverview.tsx
// 2026-10-09 · GLOBAL UI · 재고·진열 Single-Page Operations Console
//   · L2 폐기 · shortcut 폐기 · modal-first
//   · Real · listExpiryImminentProducts · listInventoryChecks
//   · row click → ProductInventoryDetailModal (domain-specific · Shelf SSOT 보호)

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Package, Storefront, Clock, ListChecks, Warehouse, MapPin, CaretRight, CaretDown, X } from "@phosphor-icons/react";
import {
  OverviewPageHeader, OverviewToolbar, OverviewSection, OverviewKpi, OverviewTable,
  type OverviewTableColumn,
} from "./StoreOverviewPrimitives";
// 2026-10-10 · 사용자 지시 · 현황 들어간 메뉴들 전부 공통 UI 모듈 통일 · OverviewPageHeader → OverviewHero
import { OverviewHero, OverviewInnerTabs, type OverviewInnerTab } from "./OverviewHeader";
import { listExpiryImminentProducts } from "../../../lib/productsApi";
import { listInventoryChecks } from "../../../lib/inventoryChecksApi";
import { Spinner } from "../../common/Spinner";
// 2026-10-12 · 사용자 지시 · 월 멀티 선택기 + 매대별 판매 집계 · 공통 모듈 재사용
import { MonthToggleSelector, dateRangesFromMonths } from "../../common/MonthToggleSelector";
import { useMonthFilter } from "../../../hooks/useMonthFilter";
import { ProductInventoryDetailModal, type ProductInventoryDetailRow } from "./ProductInventoryDetailModal";
// 2026-10-10 · 사용자 지시 · 구역도 세로탭 + 매대 리스트 + 매대 클릭 → 상품 리스트 아코디언
//   · 홈 랜딩 톤 (HomeDashboard SSOT · CARD rounded-[12px] + border-slate-200 + thin shadow)
//   · 실재고(inventory_checks) + products.purchase_price 로 매대별 제품수·재고자산 집계
import { useZoneDefs } from "../../../hooks/useZoneDefs";
// 2026-10-11 · 사용자 지시 · 매장구역 편집 모달 (텍스트 리스트 · 홈 랜딩 톤)
import { StoreZoneTextEditor } from "../../common/StoreZoneTextEditor";
import { Pencil } from "@phosphor-icons/react";
import { useKvSetting } from "../../../hooks/useKvSetting";
import { getProductsMap, type ProductInfo } from "../../../lib/productsCache";
import {
  DEFAULT_WAREHOUSE_ZONES,
  WAREHOUSE_ZONES_KEY,
  type WarehouseZonesConfig,
} from "../../../constants/warehouseZoneDefaults";
// 2026-10-11 · 사용자 지시 "실재고 테이블에서 가져와" · RealStockTable 과 동일 zone 매칭 로직
import { assignZonesToSlots } from "../../../lib/warehouseZoneMap";
// 2026-10-11 · 사용자 지시 · getProductsMap(/products.json) 에 category_code/display_location 없을 수 있음 · 실재고 테이블처럼 /api/products-map 직접 호출
import { api } from "../../../lib/apiClient";
// 2026-10-11 · 사용자 지시 · ERP 위치 → zone 분류 공통 함수 (SSOT · src/lib/zoneClassification)
import { classifyByZoneDefs, type ZoneClass } from "../../../lib/zoneClassification";

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
  // 2026-10-11 · 사용자 지시 · 일반약 섹션 5개 → 탭으로 전환 (좌우 2단 안 우측 영역)
  type GeneralSubTab = "topWall" | "center22" | "bottomWall" | "wing" | "counter";
  // 2026-10-12 · 사용자 지시 · 1단 구조 · 세로 nav 통합 · default "상비약"
  type StoreFilterKey = "all" | ZoneClass | GeneralSubTab;
  const [storeFilter, setStoreFilter] = useState<StoreFilterKey>("상비약");
  // 2026-10-10 · 사용자 지시 · 매대 클릭 시 하단 상품 리스트 아코디언 expand
  const [expandedZone, setExpandedZone] = useState<string | null>(null);
  // 2026-10-10 · products.display_location + purchase_price 매칭용 cache
  const [productsMap, setProductsMap] = useState<Record<string, ProductInfo>>({});
  // 2026-10-12 · 사용자 지시 · 로딩 중 spinner 노출 (fetch 완료 전 render skip)
  const [productsMapLoaded, setProductsMapLoaded] = useState<boolean>(false);
  const [checksLoaded, setChecksLoaded] = useState<boolean>(false);
  // 2026-10-12 · 사용자 지시 · 판매수 (pcode → qty) · 마진율은 Phase 2 (margin 집계 미완)
  const [saleQtyByCode, setSaleQtyByCode] = useState<Map<string, number>>(new Map());
  const { selectedMonths, setSelectedMonths } = useMonthFilter();
  // 2026-10-12 · 사용자 지시 · 기간 필터 pill (오늘·7일·14일·한달) · null = 월 선택기 사용
  type QuickRange = "today" | "7d" | "14d" | "30d" | null;
  const [quickRange, setQuickRange] = useState<QuickRange>(null);
  // 2026-10-12 · 사용자 지시 · 매장 매대 자동 헤더 정렬 · default = 재고자산 desc
  const [storeSortKey, setStoreSortKey] = useState<ZoneSortKey>("asset");
  const [storeSortDir, setStoreSortDir] = useState<SortDir>("desc");
  const toggleStoreSort = useCallback((k: ZoneSortKey) => {
    setStoreSortKey(prev => {
      if (prev === k) {
        setStoreSortDir(d => d === "asc" ? "desc" : "asc");
        return prev;
      }
      setStoreSortDir(k === "code" || k === "label" ? "asc" : "desc");
      return k;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    // 2026-10-11 · 사용자 지시 "실재고 테이블에서 가져와" · RealStockTablePage 와 동일 소스 · /api/products-map 직접 호출
    //   · getProductsMap(/products.json) 는 category_code/display_location 보장 안 됨
    //   · ProductInfo 는 [key:string]: any 포함 · any 배열 OK
    api.get<Record<string, any>>("/api/products-map?fields=slim&include_inactive=1")
      .then(r => {
        if (!alive) return;
        setProductsMap((r.data ?? {}) as any);
        setProductsMapLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setProductsMap({});
        setProductsMapLoaded(true);
      });
    return () => { alive = false; };
  }, []);

  // 2026-10-10 · 구역도 데이터 · 매장 zone_defs + 창고 KV (readonly)
  const { zones: storeZones, zonesRaw, updateZoneRaw } = useZoneDefs();
  // 2026-10-11 · 사용자 지시 · 매장구역 편집 모달 (텍스트 리스트)
  const [zoneEditorOpen, setZoneEditorOpen] = useState<boolean>(false);
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
  interface ZoneProduct { code: string; name: string; stock: number; unitPrice: number; assetValue: number; saleQty: number; }
  interface ZoneAgg {
    code: string;
    label: string;
    productCount: number;
    assetValue: number;
    // 2026-10-12 · 사용자 지시 · 판매수·재고수·재고자산 한눈
    totalStock: number;   // 재고수 (store*_stock 합)
    totalSale: number;    // 판매수 (ERP sale 집계)
    products: ZoneProduct[];
  }

  // 매장 매대 집계 · 2026-10-12 사용자 지시 재조립
  //   · 수량 = inventory_checks (실재고 테이블에 데이터 다 들어있음)
  //   · 매대 매칭 = ERP products.display_location → zone_defs (store*_zone 이 "-" 로 비어있음 보완)
  //   · 재고자산 = (store1+store2+store3) × products.purchase_price
  //   · 판매 = ERP saleQtyByCode
  const storeZoneAggs = useMemo((): Map<string, ZoneAgg> => {
    const agg = new Map<string, ZoneAgg>();
    const safeChecks = Array.isArray(checks) ? checks : [];
    const pushTo = (zoneCode: string, code: string, name: string, stock: number, unitPrice: number, saleQty: number) => {
      if (!zoneCode || stock <= 0) return;
      const asset = stock * unitPrice;
      if (!agg.has(zoneCode)) {
        const zd = storeZones.find(zn =>
          zn.__location === zoneCode || String(zn.num) === zoneCode ||
          zn.__locationA === zoneCode || zn.__locationB === zoneCode
        );
        const zoneLabel = zd?.category || zd?.subA || zd?.subB || zd?.label || "-";
        agg.set(zoneCode, { code: zoneCode, label: zoneLabel, productCount: 0, assetValue: 0, totalStock: 0, totalSale: 0, products: [] });
      }
      const g = agg.get(zoneCode)!;
      g.products.push({ code, name, stock, unitPrice, assetValue: asset, saleQty });
      g.productCount += 1;
      g.assetValue += asset;
      g.totalStock += stock;
      g.totalSale += saleQty;
    };
    // 2026-10-12 · 매대 번호 추출 helper · "5A 1열"/"21"/"벽>21>전체>전체" 등 다양한 포맷 지원
    //   · 앞부분 숫자+A/B 패턴 (예: "5A", "21", "1B") 매칭
    const extractZoneCode = (loc: string): string | null => {
      if (!loc) return null;
      // 1) 전체 숫자+AB (예: "5A", "21")
      const m1 = /^([0-9]+[ABab]?)/.exec(loc.trim());
      if (m1?.[1]) return m1[1].toUpperCase();
      // 2) "벽>21>...", "5매대>A>..." 포맷 안 숫자+AB 추출
      const m2 = /([0-9]+)(?:매대)?(?:>([ABab]))?/.exec(loc);
      if (m2?.[1]) return (m2[1] + (m2[2] ?? "")).toUpperCase();
      return null;
    };
    for (const chk of safeChecks) {
      const pcode = String(chk.product_code ?? "").trim();
      if (!pcode) continue;
      // 매장 총 수량 (store1+2+3) · 창고는 아래 warehouseAggs 가 처리
      const storeStock = Number(chk.store1_stock ?? 0) + Number(chk.store2_stock ?? 0) + Number(chk.store3_stock ?? 0);
      if (storeStock <= 0) continue;
      const prod = productsMap[pcode] as any;
      const unitPrice = Number(prod?.purchase_price ?? 0);
      const saleQty = saleQtyByCode.get(pcode) ?? 0;
      const name = String(chk.product_name ?? prod?.product_name ?? prod?.name ?? pcode);
      // 매대 매칭 · ERP products.display_location → extract code → zone_defs
      const loc = String(prod?.display_location ?? prod?.location ?? "").trim();
      const extracted = extractZoneCode(loc);
      if (!extracted) continue; // 추출 실패 → skip
      // zone_defs 와 match (__locationA/B 또는 __location 또는 num 과 비교)
      const zd = storeZones.find(zn =>
        zn.__location === extracted || String(zn.num) === extracted ||
        zn.__locationA === extracted || zn.__locationB === extracted ||
        // num 만 추출된 경우 ("21") num 자체 매칭
        String(zn.num) === extracted.replace(/[ABab]$/, "")
      );
      if (!zd) continue;
      const zoneCode = zd.__locationA === extracted ? zd.__locationA
        : zd.__locationB === extracted ? zd.__locationB
        : zd.__location ?? String(zd.num);
      pushTo(zoneCode, pcode, name, storeStock, unitPrice, saleQty);
    }
    for (const z of agg.values()) z.products.sort((a, b) => b.assetValue - a.assetValue);
    return agg;
  }, [checks, productsMap, storeZones, saleQtyByCode]);

  // 창고별 전체 집계 (매대 매핑 없음 · 창고1/2 각 상품 리스트)
  const warehouseAggs = useMemo((): { wh1: ZoneAgg; wh2: ZoneAgg } => {
    const build = (filter: "1" | "2"): ZoneAgg => {
      const products: ZoneProduct[] = [];
      let assetTotal = 0;
      let stockTotal = 0;
      let saleTotal = 0;
      const safeChecks = Array.isArray(checks) ? checks : [];
      for (const chk of safeChecks) {
        const code = String(chk.product_code ?? "");
        if (!code) continue;
        const stock = filter === "1" ? Number(chk.warehouse1_stock ?? 0) : Number(chk.warehouse2_stock ?? 0);
        if (stock <= 0) continue;
        const prod = productsMap[code];
        const unitPrice = Number((prod as any)?.purchase_price ?? 0);
        const asset = stock * unitPrice;
        // 2026-10-12 · 사용자 지시 · 창고에도 판매수 노출 · pcode별 매칭 (창고 판매 비율 안분은 생략 · 전량)
        const saleQty = saleQtyByCode.get(code) ?? 0;
        products.push({ code, name: String(chk.product_name ?? prod?.name ?? code), stock, unitPrice, assetValue: asset, saleQty });
        assetTotal += asset;
        stockTotal += stock;
        saleTotal += saleQty;
      }
      products.sort((a, b) => b.assetValue - a.assetValue);
      return { code: filter === "1" ? "창고1" : "창고2", label: filter === "1" ? "창고 1" : "창고 2", productCount: products.length, assetValue: assetTotal, totalStock: stockTotal, totalSale: saleTotal, products };
    };
    return { wh1: build("1"), wh2: build("2") };
  }, [checks, productsMap, saleQtyByCode]);

  // 금액 포맷 · 2026-10-12 · 사용자 지시 · 원화 기호(₩) 제거
  const fmtWon = (n: number): string => {
    if (!Number.isFinite(n) || n === 0) return "0";
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
    if (n >= 10_000_000) return `${Math.round(n / 1_000_000)}백만`;
    if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
    return `${n.toLocaleString()}`;
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
    listInventoryChecks()
      .then((r: any) => {
        if (!alive) return;
        setChecks(Array.isArray(r) ? r : []);
        setChecksLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setChecks([]);
        setChecksLoaded(true);
      });
    return () => { alive = false; };
  }, [refreshKey]);

  // 2026-10-12 · 사용자 지시 · "db참고하고. 조회버튼 누를떄만 실시간"
  //   · default · 서버 집계 API /api/stock-manage/top-sales (ERP 부하 X · DB 쿼리)
  //   · "조회" 버튼 클릭 시 · ERP sale-day-products 반복 호출 (실시간 · period 기반)
  const [refreshErp, setRefreshErp] = useState<number>(0);
  const [erpLoading, setErpLoading] = useState<boolean>(false);
  // DB default · mount + refreshKey
  useEffect(() => {
    let alive = true;
    api.get<{ rows?: any[] }>(`/api/stock-manage/top-sales?sort=sale&dir=desc&limit=5000`)
      .then(({ data }) => {
        if (!alive) return;
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        const map = new Map<string, number>();
        // 2026-10-12 · 사용자 "판매수 안 나와" fix · pcode + product_code 양쪽 identity 매핑
        //   · inventory_checks.product_code 가 두 identity 중 어느 쪽이든 매칭 성공
        for (const r of rows) {
          const pcode = String(r.pcode ?? "").trim();
          const productCode = String(r.product_code ?? "").trim();
          const qty = Number(r.sale_stock ?? 0) || 0;
          if (qty <= 0) continue;
          if (pcode) map.set(pcode, (map.get(pcode) ?? 0) + qty);
          if (productCode && productCode !== pcode) map.set(productCode, (map.get(productCode) ?? 0) + qty);
        }
        setSaleQtyByCode(map);
      })
      .catch(() => { if (alive) setSaleQtyByCode(new Map()); });
    return () => { alive = false; };
  }, [refreshKey]);
  // 실시간 ERP · 조회 버튼 클릭 시 (refreshErp 증가)
  useEffect(() => {
    if (refreshErp === 0) return;
    let alive = true;
    (async () => {
      setErpLoading(true);
      try {
        const addDay = (ymd: string, delta: number): string => {
          const d = new Date(ymd + "T00:00:00");
          d.setDate(d.getDate() + delta);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        };
        const dates: string[] = [];
        if (quickRange) {
          const dayCount = quickRange === "today" ? 1 : quickRange === "7d" ? 7 : quickRange === "14d" ? 14 : 30;
          const endC = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
          const startC = addDay(endC, -(dayCount - 1));
          for (let d = startC; d <= endC; d = addDay(d, 1)) dates.push(d);
        } else {
          const ranges = dateRangesFromMonths(selectedMonths);
          for (const r of ranges) {
            for (let d = r.startDate; d <= r.endDate; d = addDay(d, 1)) dates.push(d);
          }
        }
        if (dates.length === 0) return;
        const CHUNK = 5;
        const saleMap = new Map<string, number>();
        for (let i = 0; i < dates.length; i += CHUNK) {
          if (!alive) return;
          const batch = dates.slice(i, i + CHUNK);
          const results = await Promise.all(batch.map(d =>
            api.get<any>(`/api/erp/sale-day-products?date=${d}`).then(r => r.data).catch(() => ({ ok: false }))
          ));
          for (const res of results) {
            for (const it of (res?.items ?? [])) {
              const pcode = String(it.pcode ?? it.product_code ?? "").trim();
              if (!pcode) continue;
              const qty = Number(it.totalStock ?? it.qty ?? 0) || 0;
              if (qty <= 0) continue;
              saleMap.set(pcode, (saleMap.get(pcode) ?? 0) + qty);
            }
          }
        }
        if (alive) setSaleQtyByCode(saleMap);
      } finally {
        if (alive) setErpLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [refreshErp]);

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

  // 2026-10-12 · 사용자 지시 · 로딩 중 spinner · productsMap + checks fetch 완료 전까지 skeleton
  const dataLoading = !productsMapLoaded || !checksLoaded;

  return (
    <div className="flex flex-col gap-1 md:gap-2 min-h-0 pb-6 bg-[#F4F7FA] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* 2026-10-10 · 사용자 지시 · 공통 모듈 OverviewHero (발주반품현황·매출현황 패턴 통일) */}
      <OverviewHero
        tone="violet"
        title="재고·진열 현황"
        description="재고 / 실재고 / 유통기한 / 진열 업무"
        right={
          <button
            type="button"
            onClick={() => setZoneEditorOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-ink text-[13.5px] font-semibold cursor-pointer transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            title="매장구역 편집 · 매대 code 와 카테고리 매칭"
          >
            <Pencil size={13} weight="fill" />
            구역 편집
          </button>
        }
      />
      {/* 2026-10-11 · 사용자 지시 · 매장구역 편집 모달 · 텍스트 리스트 · 홈 랜딩 톤 */}
      <StoreZoneTextEditor
        open={zoneEditorOpen}
        onClose={() => setZoneEditorOpen(false)}
        zonesRaw={zonesRaw}
        onUpdate={updateZoneRaw}
      />

      {/* 2026-10-12 · 사용자 지시 · 데이터 로딩 중 spinner (실재고 테이블 fetch 완료 전) */}
      {dataLoading && (
        <div className="px-4 sm:px-6 pt-3">
          <div className={`${CARD} flex items-center justify-center py-16`}>
            <Spinner label="재고·진열 데이터 로딩 중..." size={16} tone="brand" />
          </div>
        </div>
      )}

      {/* 2026-10-10 · 사용자 지시 · 현황 탭 삭제 · 구역도 → 현황 단일 뷰 (UI-11 Step 1) */}

      {/* ═════════ 구역도 (= 현황) · 세로탭 + 매대 리스트 + 상품 아코디언 ═════════
          2026-10-11 · 사용자 "발주반품현황 여백이 마음에 들어" · nav 아래 pt-3 추가 (OverviewToolbar 리듬 복제) */}
      {!dataLoading && (
        <div className="px-4 sm:px-6 pt-3 flex flex-col gap-3 md:gap-4">
          {/* 2026-10-12 · 월 선택기 + 기간 필터 pill (오늘·7일·14일·한달) */}
          <section className={`${CARD} px-3 py-2 md:px-4 md:py-2.5 flex items-center gap-3 flex-wrap`}>
            <MonthToggleSelector selectedMonths={selectedMonths} onChange={setSelectedMonths} maxMonths={6} minOne />
            <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-md p-0.5" role="tablist" aria-label="기간 필터">
              {([
                { k: null,    label: "월별" },
                { k: "today" as const, label: "오늘" },
                { k: "7d"    as const, label: "7일" },
                { k: "14d"   as const, label: "14일" },
                { k: "30d"   as const, label: "한달" },
              ]).map(p => (
                <button
                  key={String(p.k)}
                  type="button"
                  onClick={() => setQuickRange(p.k)}
                  className={`h-7 px-2.5 rounded-sm text-[13px] font-semibold tabular-nums transition-colors cursor-pointer ${
                    quickRange === p.k ? "bg-white text-brand-deep shadow-sm" : "text-slate-500 hover:text-ink"
                  }`}
                  aria-selected={quickRange === p.k}
                  role="tab"
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* 2026-10-12 · 사용자 지시 · "조회버튼 누를때만 실시간" · ERP sale-day-products 반복 집계 */}
            <button
              type="button"
              onClick={() => setRefreshErp(r => r + 1)}
              disabled={erpLoading}
              className="h-7 px-3 rounded-md bg-slate-900 text-white text-[13px] font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title="ERP 실시간 판매 집계 (현재 기간 필터 기준)"
            >
              {erpLoading ? "조회 중..." : "실시간 조회"}
            </button>
            <span className="text-[13px] text-slate-500 font-medium ml-auto">
              집계 매대 <b className="text-ink tabular-nums">{storeZoneAggs.size}</b>곳 · 판매 상품 <b className={`tabular-nums ${saleQtyByCode.size === 0 ? "text-rose-600" : "text-ink"}`}>{saleQtyByCode.size}</b>건
            </span>
            {/* 2026-10-12 · 사용자 "판매데이터 안 나와" 조사 · saleMap vs inventory_checks 매칭 샘플 */}
            <div className="text-[12px] text-slate-500 bg-amber-50/60 border border-amber-200 rounded px-2 py-1.5 w-full font-mono tabular-nums overflow-x-auto">
              {saleQtyByCode.size === 0 ? (
                <>⚠️ saleMap 비어있음 · /api/stock-manage/top-sales 응답에 sale_stock&gt;0 row 없음</>
              ) : (
                <>
                  <b className="text-amber-700">saleMap 상위 3:</b>{" "}
                  {Array.from(saleQtyByCode.entries()).slice(0, 3).map(([k, v], i) => (
                    <span key={i} className="mr-2">[{k}:{v}]</span>
                  ))}
                  <span className="mx-2 text-slate-300">|</span>
                  <b className="text-amber-700">inv_checks → sale 매칭:</b>{" "}
                  {(checks ?? []).slice(0, 5).map((c: any, i: number) => {
                    const pc = String(c.product_code ?? "");
                    const hit = saleQtyByCode.get(pc);
                    return <span key={i} className={`mr-2 ${hit != null ? "text-emerald-700" : "text-rose-600"}`}>[{pc.slice(-5)}:{hit != null ? `✓${hit}` : "✗"}]</span>;
                  })}
                </>
              )}
            </div>
          </section>

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
              {/* 2026-10-12 · 사용자 지시 · 판매수·재고수·재고자산 한눈 */}
              <div className="flex items-baseline gap-1 leading-none">
                <span className="text-[14px] text-slate-500 font-medium">판매</span>
                <span className="text-[16px] font-bold tabular-nums text-emerald-700">
                  {(Array.from(storeZoneAggs.values()).reduce((s, g) => s + g.totalSale, 0)
                    + warehouseAggs.wh1.totalSale + warehouseAggs.wh2.totalSale).toLocaleString("ko-KR")}
                </span>
              </div>
              <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
              <div className="flex items-baseline gap-1 leading-none">
                <span className="text-[14px] text-slate-500 font-medium">재고</span>
                <span className="text-[16px] font-bold tabular-nums text-ink">
                  {(Array.from(storeZoneAggs.values()).reduce((s, g) => s + g.totalStock, 0)
                    + warehouseAggs.wh1.totalStock + warehouseAggs.wh2.totalStock).toLocaleString("ko-KR")}
                </span>
              </div>
              <span className="text-slate-300 text-[13px]" aria-hidden>·</span>
              <div className="flex items-baseline gap-1 leading-none">
                <span className="text-[14px] text-slate-500 font-medium">재고자산</span>
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
              {/* 매장 · 1단 구조 · 세로 nav (전체 + 상비약/뷰티/미분류 + 상단벽/중앙22/하단벽/윙/카운터) · 2026-10-12 사용자 지시 */}
              {mapInnerTab === "store" && (
                <>
                  <ZoneListHeader icon={Storefront} tone="sky" title="매장 매대" count={emergencyChips.length + generalChips.length} />
                  {storeZones.length === 0 ? (
                    <div className="py-6 text-center text-[14px] text-slate-400">매장 구역 데이터를 불러오는 중...</div>
                  ) : (() => {
                    // 2026-10-12 · 사용자 지시 · 전체 chips (매장 1-46) category 분류 (zone_defs 매칭) · 상비약·뷰티·냉장고·물약·미분류
                    const allChips = [...emergencyChips, ...generalChips];
                    const classified: Record<ZoneClass, StoreChipItem[]> = { "상비약": [], "뷰티": [], "냉장고": [], "물약": [], "미분류": [] };
                    for (const chip of allChips) {
                      const cls = classifyByZoneDefs(chip.code, storeZones);
                      classified[cls].push(chip);
                    }
                    // 2026-10-12 · 사용자 지시 · "중간탭은 상비약 일반약(1-12) 이런식" · 라벨에 매대 범위 괄호 표시
                    const navItems: Array<{ k: StoreFilterKey; label: string; count: number }> = [
                      { k: "all",        label: "전체",             count: allChips.length },
                      { k: "상비약",      label: "상비약 (1-9)",     count: classified["상비약"].length },
                      { k: "뷰티",        label: "뷰티",             count: classified["뷰티"].length },
                      { k: "냉장고",      label: "냉장고",           count: classified["냉장고"].length },
                      { k: "물약",        label: "물약",             count: classified["물약"].length },
                      { k: "미분류",      label: "미분류",           count: classified["미분류"].length },
                      { k: "topWall",    label: "상단 벽 (10-21)",  count: storeSections.topWall.length },
                      { k: "center22",   label: "중앙 (22)",        count: storeSections.center22.length },
                      { k: "bottomWall", label: "하단 벽 (23-27)",  count: storeSections.bottomWall.length },
                      { k: "wing",       label: "윙 (28-40)",       count: storeSections.wing.length },
                      { k: "counter",    label: "카운터 (41-46)",   count: storeSections.counter.length },
                    ];
                    const activeChips: StoreChipItem[] =
                      storeFilter === "all" ? allChips
                      : storeFilter === "상비약" || storeFilter === "뷰티" || storeFilter === "냉장고" || storeFilter === "물약" || storeFilter === "미분류" ? classified[storeFilter as ZoneClass]
                      : storeFilter === "topWall" ? storeSections.topWall
                      : storeFilter === "center22" ? storeSections.center22
                      : storeFilter === "bottomWall" ? storeSections.bottomWall
                      : storeFilter === "wing" ? storeSections.wing
                      : storeSections.counter;
                    const activeLabel = navItems.find(n => n.k === storeFilter)?.label ?? "전체";
                    const activeTone: Tone = storeFilter === "상비약" ? "rose"
                      : storeFilter === "뷰티" ? "rose"
                      : storeFilter === "냉장고" ? "sky"
                      : storeFilter === "물약" ? "indigo"
                      : "sky";
                    return (
                      <div className="grid grid-cols-[128px_1fr] gap-2 p-3 min-w-0">
                        <ul className="flex flex-col gap-0.5 border-r border-slate-100 pr-2">
                          {navItems.map(t => {
                            const active = storeFilter === t.k;
                            return (
                              <li key={t.k}>
                                <button
                                  type="button"
                                  onClick={() => setStoreFilter(t.k)}
                                  className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-md text-[13px] font-semibold text-left transition-colors cursor-pointer ${
                                    active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-ink"
                                  }`}
                                >
                                  <span>{t.label}</span>
                                  <span className={`text-[12px] tabular-nums ${active ? "text-slate-200" : "text-slate-400"}`}>{t.count}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        <div className="min-w-0">
                          <ZoneListTable sortKey={storeSortKey} sortDir={storeSortDir} onSort={toggleStoreSort}>
                            <ZoneListGroup
                              title={activeLabel}
                              subtitle=""
                              tone={activeTone}
                              chips={activeChips}
                              aggs={storeZoneAggs}
                              expanded={expandedZone}
                              onToggle={setExpandedZone}
                              fmtWon={fmtWon}
                              sortKey={storeSortKey}
                              sortDir={storeSortDir}
                            />
                          </ZoneListTable>
                        </div>
                      </div>
                    );
                  })()}
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

      {/* ═════════ 현황 탭 (삭제됨 · UI-11 Step 1 · 구역도 가 현황 역할) ═════════
          · 아래 블록은 기존 KPI/섹션 · 사용자 지시 · 숨김 (false 조건) · 추후 cleanup 삭제
          · ProductInventoryDetailModal 등 참조 유지 위해 블록 보존 · dead render */}
      {false && (<>
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

      {/* 2026-10-11 · 사용자 지시 · 매대 클릭 시 상세 drawer (slide-in right) · 위치 · 상품정보 · 단가 · 판매가 · 수량 */}
      {expandedZone && (() => {
        const agg = storeZoneAggs.get(expandedZone);
        if (!agg) return null;
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setExpandedZone(null)} aria-hidden />
            <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] md:w-[560px] bg-white shadow-2xl flex flex-col animate-[slide-in-right_0.2s_ease-out]"
              style={{ animation: "slide-in-right 0.2s ease-out" }}>
              <style>{`@keyframes slide-in-right { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
              <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-200">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center min-w-[32px] h-[22px] px-1.5 rounded-md bg-sky-50 text-sky-700 text-[13px] font-bold tabular-nums">{agg.code}</span>
                    <h3 className="text-[15px] md:text-[16px] font-semibold text-ink truncate" title={agg.label}>{agg.label}</h3>
                  </div>
                  <div className="mt-1 text-[13px] text-slate-500 font-medium">
                    제품수 <span className="text-ink font-semibold tabular-nums">{agg.productCount}</span>
                    <span className="mx-2 text-slate-300">·</span>
                    재고자산 <span className="text-ink font-semibold tabular-nums">{fmtWon(agg.assetValue)}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setExpandedZone(null)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-ink cursor-pointer" aria-label="닫기">
                  <X size={16} />
                </button>
              </header>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {agg.products.length === 0 ? (
                  <div className="py-10 text-center text-[14px] text-slate-400">상품 데이터 없음</div>
                ) : (
                  <table className="w-full text-[14px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[13px] font-medium sticky top-0 z-10">
                      <tr>
                        <th className="text-left px-3 py-2">상품명</th>
                        <th className="text-left px-3 py-2 w-[80px]">위치</th>
                        {/* 2026-10-12 · 사용자 지시 · 판매 (갯수) column · 월 멀티 선택기 기반 ERP sale 집계 */}
                        <th className="text-right px-3 py-2 w-[72px]" title={`선택 월(${selectedMonths.length}개월) 판매 수량`}>판매</th>
                        <th className="text-right px-3 py-2 w-[70px]">재고</th>
                        <th className="text-right px-3 py-2 w-[80px]">단가</th>
                        <th className="text-right px-3 py-2 w-[80px]">판매가</th>
                        <th className="text-right px-3 py-2 w-[90px]">자산</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {agg.products.map((p) => {
                        const meta = productsMap[p.code] as any;
                        const salePrice = Number(meta?.sale_price ?? 0);
                        const loc = meta?.display_location ?? meta?.location ?? null;
                        const saleQty = saleQtyByCode.get(p.code);
                        return (
                          <tr key={p.code} className="hover:bg-slate-50/60 h-8 text-ink">
                            <td className="px-3 py-1.5 font-medium break-keep">{p.name}</td>
                            <td className="px-3 py-1.5 text-[13px] text-slate-600 tabular-nums">{loc || <span className="text-slate-300">-</span>}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-emerald-700">
                              {saleQty != null && saleQty > 0 ? saleQty.toLocaleString("ko-KR") : <span className="text-slate-300">0</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{p.stock.toLocaleString("ko-KR")}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{p.unitPrice > 0 ? fmtWon(p.unitPrice) : <span className="text-slate-300">-</span>}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{salePrice > 0 ? fmtWon(salePrice) : <span className="text-slate-300">-</span>}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-bold">{p.assetValue > 0 ? fmtWon(p.assetValue) : <span className="text-slate-300 font-medium">-</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </aside>
          </>
        );
      })()}
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

/** 테이블 wrapper · 공통 그리드 (코드 · 매대명 · 제품수 · 판매수 · 재고자산)
 *  2026-10-12 · 사용자 지시 · 판매수 column + 자동 헤더 정렬 */
export type ZoneSortKey = "code" | "label" | "margin" | "sale" | "count" | "stock" | "asset";
export type SortDir = "asc" | "desc";
const ZoneListTable: React.FC<{
  children: React.ReactNode;
  sortKey: ZoneSortKey;
  sortDir: SortDir;
  onSort: (k: ZoneSortKey) => void;
}> = ({ children, sortKey, sortDir, onSort }) => {
  const arrow = (k: ZoneSortKey) => sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "";
  const headCls = "px-3 py-2 cursor-pointer hover:text-ink select-none";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-[13px] text-slate-500 font-medium border-b border-slate-100 bg-slate-50/40">
            {/* 2026-10-12 · 사용자 지시 · 컬럼순서 (마진율 → 판매수 → 제품수 → 재고수 → 재고자산) */}
            <th className={`${headCls} md:px-4 w-[80px]`} onClick={() => onSort("code")}>코드 <span className="text-slate-400">{arrow("code")}</span></th>
            <th className={headCls} onClick={() => onSort("label")}>매대명 <span className="text-slate-400">{arrow("label")}</span></th>
            <th className={`${headCls} text-right w-[72px]`} onClick={() => onSort("margin")}>마진율 <span className="text-slate-400">{arrow("margin")}</span></th>
            <th className={`${headCls} text-right w-[72px]`} onClick={() => onSort("sale")}>판매수 <span className="text-slate-400">{arrow("sale")}</span></th>
            <th className={`${headCls} text-right w-[72px]`} onClick={() => onSort("count")}>제품수 <span className="text-slate-400">{arrow("count")}</span></th>
            <th className={`${headCls} text-right w-[72px]`} onClick={() => onSort("stock")}>재고수 <span className="text-slate-400">{arrow("stock")}</span></th>
            <th className={`${headCls} md:px-4 text-right w-[110px]`} onClick={() => onSort("asset")}>재고자산 <span className="text-slate-400">{arrow("asset")}</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {children}
        </tbody>
      </table>
    </div>
  );
};

/** 섹션 그룹 (상비약/일반약) · header row + 매대 row들 (클릭 시 expand) */
const ZoneListGroup: React.FC<{
  title: string;
  subtitle: string;
  tone: Tone;
  chips: StoreChipItem[];
  // 2026-10-12 · 사용자 지시 · 판매수 column 추가 · totalSale/totalStock 포함
  aggs: Map<string, { code: string; label: string; productCount: number; assetValue: number; totalSale: number; totalStock: number; products: Array<{ code: string; name: string; stock: number; unitPrice: number; assetValue: number }> }>;
  expanded: string | null;
  onToggle: (code: string | null) => void;
  fmtWon: (n: number) => string;
  // 2026-10-12 · 사용자 지시 · 자동 헤더 정렬
  sortKey?: ZoneSortKey;
  sortDir?: SortDir;
}> = ({ title, subtitle, tone, chips, aggs, expanded, onToggle, fmtWon, sortKey = "asset", sortDir = "desc" }) => {
  // chips sort by sortKey
  const sortedChips = useMemo(() => {
    const arr = [...chips];
    const sign = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const ag = aggs.get(a.code);
      const bg = aggs.get(b.code);
      if (sortKey === "code")   return a.code.localeCompare(b.code, "ko") * sign;
      if (sortKey === "label")  return a.label.localeCompare(b.label, "ko") * sign;
      if (sortKey === "margin") return 0; // margin 데이터 미집계 · placeholder
      if (sortKey === "sale")   return ((ag?.totalSale ?? 0) - (bg?.totalSale ?? 0)) * sign;
      if (sortKey === "count")  return ((ag?.productCount ?? 0) - (bg?.productCount ?? 0)) * sign;
      if (sortKey === "stock")  return ((ag?.totalStock ?? 0) - (bg?.totalStock ?? 0)) * sign;
      return ((ag?.assetValue ?? 0) - (bg?.assetValue ?? 0)) * sign;
    });
    return arr;
  }, [chips, aggs, sortKey, sortDir]);
  const t = TONE[tone];
  const sectionAssetTotal = chips.reduce((s, c) => s + (aggs.get(c.code)?.assetValue ?? 0), 0);
  const sectionStockTotal = chips.reduce((s, c) => s + (aggs.get(c.code)?.totalStock ?? 0), 0);
  const sectionSaleTotal = chips.reduce((s, c) => s + (aggs.get(c.code)?.totalSale ?? 0), 0);
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
        {/* 2026-10-12 · 사용자 지시 · 컬럼 (마진율 → 판매 → 제품수 → 재고 → 자산) */}
        <td className="px-3 py-1.5 text-right text-[13px] text-slate-400 tabular-nums">-</td>
        <td className="px-3 py-1.5 text-right text-[13px] text-slate-500 font-semibold tabular-nums">{sectionSaleTotal > 0 ? sectionSaleTotal.toLocaleString() : "-"}</td>
        <td className="px-3 py-1.5 text-right text-[13px] text-slate-500 font-semibold tabular-nums">{chips.reduce((s, c) => s + (aggs.get(c.code)?.productCount ?? 0), 0)}</td>
        <td className="px-3 py-1.5 text-right text-[13px] text-slate-500 font-semibold tabular-nums">{sectionStockTotal > 0 ? sectionStockTotal.toLocaleString() : "-"}</td>
        <td className="px-3 md:px-4 py-1.5 text-right text-[13px] text-slate-600 font-semibold tabular-nums">{fmtWon(sectionAssetTotal)}</td>
      </tr>
      {sortedChips.map(c => {
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
              {/* 2026-10-12 · 사용자 지시 · 마진율 → 판매수 → 제품수 → 재고수 → 재고자산 */}
              <td className="px-3 py-2 text-right text-[14px] text-slate-400 tabular-nums">-</td>
              <td className="px-3 py-2 text-right text-[14px] font-semibold text-ink tabular-nums">
                {(agg?.totalSale ?? 0) > 0 ? agg!.totalSale.toLocaleString() : <span className="text-slate-300">-</span>}
              </td>
              <td className="px-3 py-2 text-right text-[14px] font-semibold text-ink tabular-nums">
                {count > 0 ? count : <span className="text-slate-300">0</span>}
              </td>
              <td className="px-3 py-2 text-right text-[14px] font-semibold text-ink tabular-nums">
                {(agg?.totalStock ?? 0) > 0 ? agg!.totalStock.toLocaleString() : <span className="text-slate-300">0</span>}
              </td>
              <td className="px-3 md:px-4 py-2 text-right text-[14px] font-bold text-ink tabular-nums">
                {asset > 0 ? fmtWon(asset) : <span className="text-slate-300 font-medium">-</span>}
              </td>
            </tr>
            {/* 2026-10-11 · 사용자 지시 · 아코디언 inline 삭제 · drawer 로 이동 */}
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
