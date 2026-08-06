// src/components/StockManagePage/SupplierTab.tsx
// 공급사현황 탭 — StockManagePage 에서 분리 · OrderManagePage 결제 탭에서도 사용
// 2026-08-03 · 독립 컴포넌트로 추출

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVendors } from "../../hooks/useVendors";
import { Building2, Loader2 as LoaderIcon, ChevronRight, ChevronDown, X as XIcon } from "lucide-react";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { VendorDetailModal } from "../LandingPage/VendorListEditor";
import { getProductsMap, lookupProduct, type ProductInfo } from "../../lib/productsCache";
import { SeasonButtons } from "../common/SeasonButtons";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { ProductPurchaseHistoryModal } from "./ProductPurchaseHistoryModal";
import { LoadingState } from "../common/LoadingState";
import { EmptyState } from "../common/EmptyState";
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { fmtWonCompact } from "../../lib/format";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}
const fmtWon = fmtWonCompact;

type SupplierAgg = {
  supplier: string;
  supplier_code: string | null;
  names?: string[];
  code_conflict?: boolean;
  purchaseQty: number; purchaseAmount: number; saleQty: number; saleAmount?: number;
  itemCount: number; totalStockAmount: number;
};

type SupListSortKey = "totalStockAmount" | "saleQty" | "saleAmount" | "purchaseQty" | "itemCount" | "supplier" | "avgCycleDays";
type SupDetailSortKey = "name" | "current" | "cycle" | "purchase_date" | "purchase_qty" | "min_order" | "total_amount" | "purchase_price" | "sale_qty" | "sale_amount";
type SupplierGroup = "stock" | "purchase" | "sale";

export interface SupplierTabProps {
  /**
   * 임베디드 모드 · 외부 컨테이너 안에 좌측 공급사 리스트만 렌더
   *   - true → 상단 큰 필터바(카드) · 리사이저 · 우측 상세 패널 모두 skip · 컴팩트 필터바만 렌더
   *   - 매입이력 by-vendor 등 다른 화면에서 공급사 리스트 재사용용
   */
  embedded?: boolean;
  /**
   * 공급사 row 클릭 콜백 · 외부가 우측 상세를 담당하는 경우 사용
   *   - 제공 시 · 내부 우측 패널 열기 대신 콜백만 호출
   *   - embedded=true 조합 시 · 내부 상품 리스트 fetch 도 skip (부모가 자체 fetch)
   */
  onSupplierClick?: (supplierName: string) => void;
  /**
   * 외부 제어 · 시각적으로 강조할 공급사명 (embedded 모드 selection sync)
   */
  selectedSupplierName?: string | null;
  /**
   * 판매 컬럼(판매량·판매액) 숨김 · embedded=true + 매입이력 컨텍스트에서 사용
   *   - default false (하위호환 · 기존 StockManagePage 등 변경 없음)
   */
  hideSaleColumns?: boolean;
  /**
   * 매입현황 확장 컬럼(매입액) 표시 · embedded=true + 매입이력 컨텍스트에서 사용
   *   - default false (하위호환)
   */
  showExtraPurchaseColumns?: boolean;
  /**
   * 매입주기(일) 컬럼 표시 · embedded=true + 매입이력 컨텍스트에서 사용
   *   - default false (하위호환 · 통계/재고관리 화면 영향 없음)
   *   - true 일 때 · /api/supplier-purchase-summary?days=90 병렬 fetch → avg_cycle_days 매핑
   */
  showCycleColumn?: boolean;
}

export const SupplierTab: React.FC<SupplierTabProps> = ({
  embedded = false,
  onSupplierClick,
  selectedSupplierName = null,
  hideSaleColumns = false,
  showExtraPurchaseColumns = false,
  showCycleColumn = false,
}) => {
  const { getWidth, resizerProps } = useColumnResize("supplierTab", {
    toggle:      { default: 28,  min: 24, max: 50  },
    num:         { default: 36,  min: 24, max: 60  },
    supplier:    { default: 160, min: 80, max: 360 },
    stock_amt:   { default: 96,  min: 60, max: 200 },
    item_cnt:    { default: 64,  min: 50, max: 120 },
    pur_qty:     { default: 80,  min: 50, max: 160 },
    pur_amt:     { default: 96,  min: 60, max: 200 },
    cycle_days:  { default: 64,  min: 50, max: 120 },
    sale_qty:    { default: 80,  min: 50, max: 160 },
    sale_amt:    { default: 96,  min: 60, max: 200 },
  });
  const [loading, setLoading] = useState(false);

  // 기간 필터
  const [supplierMonths, setSupplierMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(0);
  const [supplierSeason, setSupplierSeason] = useState<SeasonKey | null>(null);

  // 공급사 목록
  const [xlsxSuppliers, setXlsxSuppliers] = useState<SupplierAgg[]>([]);
  const { vendorCategoryMap, findVendorByName } = useVendors();
  const [supplierBalanceMap, setSupplierBalanceMap] = useState<Record<string, { balance: number; invoice_date: string | null }>>({});
  // 공급사별 매입주기 (일) · showCycleColumn=true 일 때만 fetch
  //   · key · 정규화 (VAT 미포함 제거 · trim · lower) 공급사명
  const [supplierCycleMap, setSupplierCycleMap] = useState<Record<string, number | null>>({});
  // 공급사명 → avg_cycle_days lookup · 정렬·렌더에서 공용
  const cycleFor = useCallback((supplierName: string | null | undefined): number | null => {
    if (!supplierName) return null;
    const cleaned = supplierName.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim().toLowerCase();
    if (cleaned in supplierCycleMap) return supplierCycleMap[cleaned];
    return null;
  }, [supplierCycleMap]);

  // 정렬·필터
  const [supListSort, setSupListSort] = useState<{ key: SupListSortKey; dir: "asc" | "desc" }>({ key: "totalStockAmount", dir: "desc" });
  const toggleSupListSort = (k: SupListSortKey) => {
    setSupListSort(prev => prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "supplier" ? "asc" : "desc" });
  };
  const [supListLimit, setSupListLimit] = useState<number>(999999);
  const [supListCategory, setSupListCategory] = useState<"전체" | "위탁" | "선결제" | "60일회전" | "90일회전" | "기타">("전체");

  // 그룹 헤더 접기 · embedded (매입이력 컨텍스트) 는 매입현황만 펼치기 · 재고/판매 접기 (사용자 요청 2026-08-04)
  const [supplierGroupCollapsed, setSupplierGroupCollapsed] = useState<Set<SupplierGroup>>(
    () => embedded ? new Set<SupplierGroup>(["stock", "sale"]) : new Set<SupplierGroup>()
  );
  const toggleSupplierGroup = (g: SupplierGroup) => setSupplierGroupCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isSupplierGroupCollapsed = (g: SupplierGroup) => supplierGroupCollapsed.has(g);

  // 합계 행 접기/펼치기 (사용자 요청 · 2026-08-06 · T-TEST-매입이력-합계접기)
  //   · 기본 접힘 (사용자 명시) · localStorage 명시적 "0" 저장 시 펼침
  const [totalsCollapsed, setTotalsCollapsed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("megatown_supplier_totals_collapsed");
      return v !== "0"; // "0" 명시적 펼침 · 그 외 (null·"1") 접힘
    } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem("megatown_supplier_totals_collapsed", totalsCollapsed ? "1" : "0"); } catch { /* noop */ }
  }, [totalsCollapsed]);

  // 좌우 패널 폭
  const [supplierPanelWidth, setSupplierPanelWidth] = useState<number>(() => {
    const defaultW = typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.6) : 800;
    try { const v = Number(localStorage.getItem("megatown_stockmanage_supplier_w")); return Number.isFinite(v) && v > 0 ? v : defaultW; } catch { return defaultW; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_stockmanage_supplier_w", String(supplierPanelWidth)); } catch { /**/ } }, [supplierPanelWidth]);
  const supplierPanelWidthRef = useRef(supplierPanelWidth);
  useEffect(() => { supplierPanelWidthRef.current = supplierPanelWidth; }, [supplierPanelWidth]);
  const supplierResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onSupplierResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    supplierResizeRef.current = { startX: e.clientX, startW: supplierPanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = supplierResizeRef.current; if (!r) return; setSupplierPanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { supplierResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  // 선택 공급사 (우측 패널)
  const [supplierSelectedKey, setSupplierSelectedKey] = useState<string | null>(null);

  // 외부 selectedSupplierName · xlsxSuppliers 로드 후 · 내부 selectedKey 동기화
  //   embedded 모드 · 부모가 선택 상태를 제어할 때 시각적 강조용
  useEffect(() => {
    if (!selectedSupplierName) return;
    if (xlsxSuppliers.length === 0) return;
    const norm = (s: string) => s.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim().toLowerCase();
    const target = norm(selectedSupplierName);
    const found = xlsxSuppliers.find(s => norm(s.supplier ?? "") === target);
    if (found) {
      const k = `${found.supplier_code ?? "-"}::${found.supplier}`;
      setSupplierSelectedKey(prev => (prev === k ? prev : k));
    }
  }, [selectedSupplierName, xlsxSuppliers]);

  // 우측 패널 · 선택 공급사 상세 정렬
  const [supDetailSort, setSupDetailSort] = useState<{ key: SupDetailSortKey; dir: "asc" | "desc" }>({ key: "total_amount", dir: "desc" });
  const toggleSupDetailSort = (k: SupDetailSortKey) => {
    setSupDetailSort(prev => prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "name" ? "asc" : "desc" });
  };

  // 확장 리스트 (공급사 클릭 시 fetch)
  const [supplierRowsMap, setSupplierRowsMap] = useState<Record<string, any[] | null>>({});
  const [supplierRowsLoading, setSupplierRowsLoading] = useState<Set<string>>(new Set());
  const supplierFetchedRef = useRef<Set<string>>(new Set());
  const supplierInflightRef = useRef<Set<string>>(new Set());

  // 공급사 정보 모달 (VendorDetailModal)
  const [supplierDetailModal, setSupplierDetailModal] = useState<any | null>(null);

  // 상품 매입 이력 모달
  const [productPurchaseModal, setProductPurchaseModal] = useState<{ product_code: string; product_name: string } | null>(null);

  // 우측 패널용 선택 상품 (공급사 우측 패널 → 상품명 클릭 시)
  const [flowSelectedProduct, setFlowSelectedProduct] = useState<ProductInfo | null>(null);
  const loadFlowSelectedProduct = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    const partial: ProductInfo = { code, name: String(p.product_name ?? ""), spec: String(p.spec ?? ""), current_stock: p.current_stock ?? null, optimal_stock: p.optimal_stock ?? null, supplier: p.supplier ?? null, real_map: p.real_map ?? null };
    setFlowSelectedProduct(partial);
    try {
      let full = lookupProduct(code);
      if (!full) { const map = await getProductsMap(); full = map[code] ?? map[code.replace(/^0+/, "")] ?? null; }
      if (full) setFlowSelectedProduct(prev => { if (!prev || prev.code !== code) return prev; const o: Record<string, any> = {}; for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) o[k] = v; return { ...full, ...o, code, name: full.name || prev.name }; });
    } catch { /**/ }
  }, []);

  // 공급사 리스트 정렬
  const sortedXlsxSuppliers = useMemo(() => {
    const { key, dir } = supListSort;
    const mult = dir === "asc" ? 1 : -1;
    return [...xlsxSuppliers].sort((a, b) => {
      if (key === "supplier") return mult * String(a.supplier ?? "").localeCompare(String(b.supplier ?? ""), "ko");
      if (key === "avgCycleDays") {
        // null 은 정렬 끝으로 (desc 일 때도 asc 일 때도 뒤로)
        const va = cycleFor(a.supplier);
        const vb = cycleFor(b.supplier);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return mult * (va - vb);
      }
      return mult * (Number((a as any)[key] ?? 0) - Number((b as any)[key] ?? 0));
    });
  }, [xlsxSuppliers, supListSort, cycleFor]);

  const displayedXlsxSuppliers = useMemo(() => {
    const filtered = supListCategory === "전체"
      ? sortedXlsxSuppliers
      : sortedXlsxSuppliers.filter(sup => {
          const nm = String(sup.supplier ?? "").trim();
          const cat = vendorCategoryMap[nm] ?? null;
          return cat === supListCategory;
        });
    return filtered.slice(0, supListLimit);
  }, [sortedXlsxSuppliers, supListLimit, supListCategory, vendorCategoryMap]);

  // 합계 (필터/제한된 visible rows 기준)
  const supListTotals = useMemo(() => {
    let stock = 0, item = 0, purchase = 0, purchaseAmt = 0, saleQ = 0, saleA = 0;
    for (const s of displayedXlsxSuppliers) {
      stock += Number(s.totalStockAmount ?? 0);
      item  += Number(s.itemCount ?? 0);
      purchase += Number(s.purchaseQty ?? 0);
      purchaseAmt += Number(s.purchaseAmount ?? 0);
      saleQ += Number(s.saleQty ?? 0);
      saleA += Number(s.saleAmount ?? 0);
    }
    return { stock, item, purchase, purchaseAmt, saleQ, saleA };
  }, [displayedXlsxSuppliers]);

  const supplierSelectedObj = useMemo(() =>
    supplierSelectedKey ? xlsxSuppliers.find(s => `${s.supplier_code ?? "-"}::${s.supplier}` === supplierSelectedKey) ?? null : null,
    [supplierSelectedKey, xlsxSuppliers]);

  // 공급사 클릭 시 상품 리스트 fetch
  const toggleSupplierExpand = useCallback(async (sup: SupplierAgg) => {
    const key = `${sup.supplier_code ?? "-"}::${sup.supplier}`;
    let isCurrentlyExpanded = false;
    setSupplierSelectedKey(prev => { if (prev === key) { isCurrentlyExpanded = true; } return key; });
    // 외부 콜백 · 우측 상세를 외부가 담당하는 경우
    if (onSupplierClick) {
      const cleaned = sup.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "";
      onSupplierClick(cleaned || String(sup.supplier ?? ""));
      // embedded 모드 · 내부 우측 패널 미렌더 → 상품 리스트 fetch 불필요
      if (embedded) return;
    }
    // 이미 fetch했거나 진행중이면 skip
    if (supplierFetchedRef.current.has(key) || supplierInflightRef.current.has(key)) return;
    supplierInflightRef.current.add(key);
    setSupplierRowsLoading(prev => { const n = new Set(prev); n.add(key); return n; });
    try {
      const params = new URLSearchParams({ sort: "sale", dir: "desc", limit: "5000" });
      if (sup.supplier_code) params.set("supplier_code", sup.supplier_code);
      else if (sup.supplier) params.set("supplier", sup.supplier);
      const res = await fetch(`/api/stock-manage/top-sales?${params}`);
      const rows = res.ok ? (await res.json()).rows : [];
      setSupplierRowsMap(prev => ({ ...prev, [key]: Array.isArray(rows) ? rows : [] }));
      supplierFetchedRef.current.add(key);
    } catch {
      setSupplierRowsMap(prev => ({ ...prev, [key]: [] }));
    } finally {
      supplierInflightRef.current.delete(key);
      setSupplierRowsLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, [embedded, onSupplierClick]);

  // 공급사 상세 모달 오픈 · 캐시 활용 (inline fetch 제거)
  const openSupplierDetailModal = useCallback((supplierName: string) => {
    if (!supplierName) return;
    const found = findVendorByName(supplierName);
    if (found) { setSupplierDetailModal(found); return; }
    alert(`공급사 정보 없음: ${supplierName}`);
  }, [findVendorByName]);

  // 우측 패널 상세 정렬 helper
  const sortSupDetailRows = (rows: any[]): any[] => {
    const { key, dir } = supDetailSort;
    const mult = dir === "asc" ? 1 : -1;
    const detailCycleDays = (r: any): number => {
      const cnt = Number(r.purchase_count ?? 0);
      if (cnt < 2) return 0;
      const firstDate = String(r.first_purchase_date ?? r.last_purchase_date ?? "");
      const lastDate = String(r.last_purchase_date ?? "");
      if (!firstDate || !lastDate || firstDate === lastDate) return 0;
      const days = Math.round((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (86400 * 1000));
      return cnt > 1 ? Math.round(days / (cnt - 1)) : 0;
    };
    return [...rows].sort((a, b) => {
      let va: any, vb: any;
      if (key === "name") { va = String(a.product_name ?? ""); vb = String(b.product_name ?? ""); }
      else if (key === "current") { va = Number(a.current_stock ?? 0); vb = Number(b.current_stock ?? 0); }
      else if (key === "cycle") { va = detailCycleDays(a); vb = detailCycleDays(b); }
      else if (key === "purchase_date") { va = String(a.last_purchase_date ?? ""); vb = String(b.last_purchase_date ?? ""); }
      else if (key === "purchase_qty") { va = Number(a.purchase_total_qty ?? a.purchase_qty ?? 0); vb = Number(b.purchase_total_qty ?? b.purchase_qty ?? 0); }
      else if (key === "min_order") { va = Number(a.min_order ?? 0); vb = Number(b.min_order ?? 0); }
      else if (key === "purchase_price") { va = Number(a.purchase_price ?? 0); vb = Number(b.purchase_price ?? 0); }
      else if (key === "sale_qty") { va = Number(a.sale_qty ?? 0); vb = Number(b.sale_qty ?? 0); }
      else if (key === "sale_amount") { va = Number(a.total_amount ?? 0); vb = Number(b.total_amount ?? 0); }
      else { va = Number(a.current_stock ?? 0) * Number(a.purchase_price ?? 0); vb = Number(b.current_stock ?? 0) * Number(b.purchase_price ?? 0); }
      if (typeof va === "string") return va.localeCompare(String(vb), "ko") * mult;
      return (va - vb) * mult;
    });
  };

  // 데이터 fetch (공급사별 매입 집계)
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50000" });
      if (supplierSeason) params.set("season", supplierSeason);
      else if (supplierMonths > 0) params.set("months", String(supplierMonths));
      const res = await fetch(`/api/stock-manage/supplier-purchases?${params}`);
      if (res.ok) {
        const data = await res.json();
        setXlsxSuppliers(Array.isArray(data.rows) ? data.rows : []);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [supplierSeason, supplierMonths]);

  useEffect(() => { fetchData(); }, [fetchData]);


  // 잔고 맵 로드
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/supplier-balances");
        if (!res.ok) return;
        const j = await res.json();
        const rows: any[] = Array.isArray(j?.balances) ? j.balances : [];
        const map: Record<string, { balance: number; invoice_date: string | null }> = {};
        for (const r of rows) {
          const name = String(r.supplier_name ?? "").trim();
          if (!name) continue;
          if (!(name in map)) map[name] = { balance: Number(r.balance ?? 0), invoice_date: r.invoice_date ?? null };
        }
        setSupplierBalanceMap(map);
      } catch { /* ignore */ }
    })();
  }, []);

  // 매입주기 맵 로드 · showCycleColumn=true 일 때만
  //   · /api/supplier-purchase-summary?days=90 · avg_cycle_days 필드 사용
  //   · 성능 이슈 · 이미 PurchaseHistoryTab 이 fetch 하는 데이터 · SupplierTab 이 다시 fetch (초기 phase OK · 후속 리팩토링에서 shared context 로 승격 가능)
  useEffect(() => {
    if (!showCycleColumn) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/supplier-purchase-summary?days=90");
        if (!res.ok) return;
        const j = await res.json();
        const rows: any[] = Array.isArray(j?.suppliers) ? j.suppliers : [];
        const map: Record<string, number | null> = {};
        const norm = (s: string) => s.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim().toLowerCase();
        for (const r of rows) {
          const nm = String(r.supplier ?? "").trim();
          if (!nm) continue;
          const v = r.avg_cycle_days;
          const cycle = v == null ? null : Number(v);
          const key = norm(nm);
          if (!(key in map)) map[key] = Number.isFinite(cycle as number) ? (cycle as number) : null;
        }
        if (!cancelled) setSupplierCycleMap(map);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [showCycleColumn]);

  // ── 좌측 리스트 카드 내부 (헤더 + 분류 + 정렬 + 테이블) · embedded/non-embedded 공용 ──
  const renderSupplierListCard = () => (
    <>
      {/* 카드 헤더 */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-slate-100 bg-white shrink-0">
        <Building2 size={14} className="text-sky-500 shrink-0" />
        <span className={`${TEXT.body} text-slate-800`}>공급사별 현황</span>
        <span className="text-[11px] font-semibold tabular-nums text-slate-400 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
          {displayedXlsxSuppliers.length}{supListLimit < xlsxSuppliers.length ? `/${xlsxSuppliers.length}` : ""}개 사
        </span>
      </div>

      {/* 분류 필터 */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 bg-white shrink-0 flex-wrap">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-0.5">분류</span>
        {([
          { k: "전체" as const, activeCls: "bg-slate-700 text-white shadow-sm" },
          { k: "위탁" as const, activeCls: "bg-violet-500 text-white shadow-sm" },
          { k: "선결제" as const, activeCls: "bg-rose-500 text-white shadow-sm" },
          { k: "60일회전" as const, activeCls: "bg-emerald-500 text-white shadow-sm" },
          { k: "90일회전" as const, activeCls: "bg-teal-500 text-white shadow-sm" },
          { k: "기타" as const, activeCls: "bg-slate-500 text-white shadow-sm" },
        ]).map(o => (
          <button key={o.k} onClick={() => setSupListCategory(o.k)}
            className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${supListCategory === o.k ? o.activeCls : "text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200"}`}>
            {o.k}
          </button>
        ))}
      </div>

      {/* 정렬 행 */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 bg-white shrink-0 flex-wrap">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-0.5">정렬</span>
        {([
          { k: "totalStockAmount" as SupListSortKey, label: "재고자산", color: "amber", hideWhenNoSale: false, showOnlyWithCycle: false },
          { k: "saleQty" as SupListSortKey, label: "판매량", color: "emerald", hideWhenNoSale: true, showOnlyWithCycle: false },
          { k: "saleAmount" as SupListSortKey, label: "판매액", color: "emerald", hideWhenNoSale: true, showOnlyWithCycle: false },
          { k: "purchaseQty" as SupListSortKey, label: "매입", color: "amber", hideWhenNoSale: false, showOnlyWithCycle: false },
          { k: "avgCycleDays" as SupListSortKey, label: "주기", color: "amber", hideWhenNoSale: false, showOnlyWithCycle: true },
          { k: "itemCount" as SupListSortKey, label: "상품수", color: "slate", hideWhenNoSale: false, showOnlyWithCycle: false },
          { k: "supplier" as SupListSortKey, label: "공급사명", color: "sky", hideWhenNoSale: false, showOnlyWithCycle: false },
        ]).filter(o => !(hideSaleColumns && o.hideWhenNoSale) && !(o.showOnlyWithCycle && !showCycleColumn)).map(o => {
          const active = supListSort.key === o.k;
          const arrow = active ? (supListSort.dir === "desc" ? " ▼" : " ▲") : "";
          const activeMap: Record<string, string> = {
            amber: "bg-amber-500 text-white shadow-sm",
            emerald: "bg-emerald-500 text-white shadow-sm",
            sky: "bg-sky-500 text-white shadow-sm",
            slate: "bg-slate-700 text-white shadow-sm",
          };
          return (
            <button key={o.k} onClick={() => toggleSupListSort(o.k)}
              className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${active ? activeMap[o.color] : "text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200"}`}>
              {o.label}{arrow}
            </button>
          );
        })}
      </div>

      {/* 테이블 영역 */}
      <div className="relative flex-1 overflow-auto">
        {loading && xlsxSuppliers.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 text-[12px] text-sky-700 font-semibold py-1.5 mx-3 mt-2 bg-sky-50 border border-sky-200 rounded-md">
            <LoaderIcon size={12} className="animate-spin" /> 조건 변경 · 새로 불러오는 중...
          </div>
        )}
        {xlsxSuppliers.length === 0 ? (
          loading ? (
            <LoadingState tone="sky" size="compact" label="데이터 로딩중..." />
          ) : (
            <EmptyState icon={Building2} title="데이터 없음" size="compact" />
          )
        ) : (
          <table className={`w-full text-[13px] ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`} style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="sticky top-0 z-10">
              {/* 그룹 헤더 */}
              <tr className="text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200">
                <th colSpan={3} className="bg-slate-50 text-slate-400 text-left px-3 py-1.5">기본정보</th>
                <th colSpan={isSupplierGroupCollapsed("stock") ? 1 : 2}
                  className="bg-sky-50 text-sky-600 text-center px-3 py-1.5 cursor-pointer select-none hover:bg-sky-100 transition"
                  onClick={() => toggleSupplierGroup("stock")}
                  title={isSupplierGroupCollapsed("stock") ? "재고현황 펼치기" : "재고현황 접기"}>
                  <span className="inline-flex items-center gap-1">
                    {isSupplierGroupCollapsed("stock") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}재고현황
                  </span>
                </th>
                <th colSpan={isSupplierGroupCollapsed("purchase") ? 1 : (1 + (showExtraPurchaseColumns ? 1 : 0) + (showCycleColumn ? 1 : 0))}
                  className="bg-amber-50 text-amber-600 text-center px-3 py-1.5 cursor-pointer select-none hover:bg-amber-100 transition"
                  onClick={() => toggleSupplierGroup("purchase")}
                  title={isSupplierGroupCollapsed("purchase") ? "매입현황 펼치기" : "매입현황 접기"}>
                  <span className="inline-flex items-center gap-1">
                    {isSupplierGroupCollapsed("purchase") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}매입현황
                  </span>
                </th>
                {!hideSaleColumns && (
                  <th colSpan={isSupplierGroupCollapsed("sale") ? 1 : 2}
                    className="bg-rose-50 text-rose-600 text-center px-3 py-1.5 cursor-pointer select-none hover:bg-rose-100 transition"
                    onClick={() => toggleSupplierGroup("sale")}
                    title={isSupplierGroupCollapsed("sale") ? "판매현황 펼치기" : "판매현황 접기"}>
                    <span className="inline-flex items-center gap-1">
                      {isSupplierGroupCollapsed("sale") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}판매현황
                    </span>
                  </th>
                )}
              </tr>
              {/* 서브 헤더 · 리사이즈 지원 */}
              <tr className="text-[11px] font-semibold text-slate-500 border-b border-slate-200 bg-white">
                <th className="relative text-center py-2" style={{ width: getWidth("toggle"), minWidth: getWidth("toggle") }}>
                  <span {...resizerProps("toggle")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-center py-2" style={{ width: getWidth("num"), minWidth: getWidth("num") }}>
                  #
                  <span {...resizerProps("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-left px-3 py-2 cursor-pointer select-none hover:bg-slate-50 transition" style={{ width: getWidth("supplier"), minWidth: getWidth("supplier") }} onClick={() => toggleSupListSort("supplier")} title="공급사명 정렬">
                  공급사 {supListSort.key === "supplier" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-slate-300">⇅</span>}
                  <span {...resizerProps("supplier")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                </th>
                {isSupplierGroupCollapsed("stock") ? <th className="bg-sky-50/20" style={{ width: 16 }}></th> : (
                  <>
                    <th className="relative text-right px-3 py-2 cursor-pointer select-none bg-sky-50/60 hover:bg-sky-100 transition text-sky-700" style={{ width: getWidth("stock_amt"), minWidth: getWidth("stock_amt") }} onClick={() => toggleSupListSort("totalStockAmount")} title="재고자산 정렬">
                      재고자산 {supListSort.key === "totalStockAmount" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-sky-300">⇅</span>}
                      <span {...resizerProps("stock_amt")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                    </th>
                    <th className="relative text-right px-3 py-2 cursor-pointer select-none bg-sky-50/40 hover:bg-sky-100 transition text-sky-600" style={{ width: getWidth("item_cnt"), minWidth: getWidth("item_cnt") }} onClick={() => toggleSupListSort("itemCount")} title="상품수 정렬">
                      상품수 {supListSort.key === "itemCount" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-sky-300">⇅</span>}
                      <span {...resizerProps("item_cnt")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                    </th>
                  </>
                )}
                {isSupplierGroupCollapsed("purchase") ? <th className="bg-amber-50/20" style={{ width: 16 }}></th> : (
                  <>
                    <th className="relative text-right px-3 py-2 cursor-pointer select-none bg-amber-50/60 hover:bg-amber-100 transition text-amber-600" style={{ width: getWidth("pur_qty"), minWidth: getWidth("pur_qty") }} onClick={() => toggleSupListSort("purchaseQty")} title="매입수량 정렬">
                      매입수량 {supListSort.key === "purchaseQty" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-amber-300">⇅</span>}
                      <span {...resizerProps("pur_qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                    </th>
                    {showExtraPurchaseColumns && (
                      <th className="relative text-right px-3 py-2 bg-amber-50/80 text-amber-700" style={{ width: getWidth("pur_amt"), minWidth: getWidth("pur_amt") }} title="매입액 (공급가액 합계 · stock_history.supply_amount)">
                        매입액
                        <span {...resizerProps("pur_amt")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                      </th>
                    )}
                    {showCycleColumn && (
                      <th
                        className="relative text-right px-3 py-2 cursor-pointer select-none bg-amber-50/50 hover:bg-amber-100 transition text-amber-700"
                        style={{ width: getWidth("cycle_days"), minWidth: getWidth("cycle_days") }}
                        onClick={() => toggleSupListSort("avgCycleDays")}
                        title="매입주기 정렬 (최근 90일 평균)"
                      >
                        매입주기(일) {supListSort.key === "avgCycleDays" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-amber-300">⇅</span>}
                        <span {...resizerProps("cycle_days")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                      </th>
                    )}
                  </>
                )}
                {!hideSaleColumns && (
                  isSupplierGroupCollapsed("sale") ? <th className="bg-rose-50/20" style={{ width: 16 }}></th> : (
                    <>
                      <th className="relative text-right px-3 py-2 cursor-pointer select-none bg-rose-50/60 hover:bg-rose-100 transition text-rose-600" style={{ width: getWidth("sale_qty"), minWidth: getWidth("sale_qty") }} onClick={() => toggleSupListSort("saleQty")} title="판매량 정렬">
                        판매량 {supListSort.key === "saleQty" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-rose-300">⇅</span>}
                        <span {...resizerProps("sale_qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                      </th>
                      <th className="relative text-right px-3 py-2 cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition text-rose-700" style={{ width: getWidth("sale_amt"), minWidth: getWidth("sale_amt") }} onClick={() => toggleSupListSort("saleAmount")} title="판매액 정렬">
                        판매액 {supListSort.key === "saleAmount" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-rose-300">⇅</span>}
                        <span {...resizerProps("sale_amt")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                      </th>
                    </>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* 합계 요약 행 · 필터/제한된 visible 공급사 기준 · 접기/펼치기 (2026-08-06) */}
              {totalsCollapsed ? (
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px]">
                  <td colSpan={99} className="px-3 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => setTotalsCollapsed(false)}
                      className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 font-semibold cursor-pointer"
                      title="합계 펼치기"
                    >
                      <span className="text-[13px]">▾</span> Σ 합계 펼치기 ({displayedXlsxSuppliers.length}개 사)
                    </button>
                  </td>
                </tr>
              ) : (
              <tr className="bg-slate-100 border-b-2 border-slate-300 font-black text-slate-800 text-[12px]">
                <td className="text-center py-1.5">
                  <button
                    type="button"
                    onClick={() => setTotalsCollapsed(true)}
                    className="text-slate-500 hover:text-slate-700 cursor-pointer text-[10px]"
                    title="합계 접기"
                  >▴ Σ</button>
                </td>
                <td className="text-center py-1.5 text-slate-500">-</td>
                <td className="text-left px-3 py-1.5 text-slate-800 font-black">합계 <span className="text-slate-500 font-bold">({displayedXlsxSuppliers.length}개 사)</span></td>
                {isSupplierGroupCollapsed("stock") ? <td className="bg-slate-100" /> : (
                  <>
                    <td className="text-right px-3 py-1.5 tabular-nums font-black text-slate-800 bg-sky-100/60">{fmtWon(supListTotals.stock)}</td>
                    <td className="text-right px-3 py-1.5 tabular-nums font-black text-slate-800 bg-sky-100/40">{supListTotals.item.toLocaleString()}</td>
                  </>
                )}
                {isSupplierGroupCollapsed("purchase") ? <td className="bg-slate-100" /> : (
                  <>
                    <td className="text-right px-3 py-1.5 tabular-nums font-black text-amber-700 bg-amber-100/40">{supListTotals.purchase.toLocaleString()}</td>
                    {showExtraPurchaseColumns && (
                      <td className="text-right px-3 py-1.5 tabular-nums font-black text-amber-800 bg-amber-100/60">{fmtWon(supListTotals.purchaseAmt)}</td>
                    )}
                    {showCycleColumn && (
                      <td className="text-right px-3 py-1.5 text-amber-400 bg-amber-100/40" title="합계 없음 · 개별 공급사별 값">-</td>
                    )}
                  </>
                )}
                {!hideSaleColumns && (
                  isSupplierGroupCollapsed("sale") ? <td className="bg-slate-100" /> : (
                    <>
                      <td className="text-right px-3 py-1.5 tabular-nums font-black text-rose-700 bg-rose-100/40">{supListTotals.saleQ.toLocaleString()}</td>
                      <td className="text-right px-3 py-1.5 tabular-nums font-black text-rose-700 bg-rose-100/60">{fmtWon(supListTotals.saleA)}</td>
                    </>
                  )
                )}
              </tr>
              )}
              {displayedXlsxSuppliers.map((sup, i) => {
                const key = `${sup.supplier_code ?? "-"}::${sup.supplier}`;
                const isExpanded = supplierRowsMap[key] != null;
                const isSelected = supplierSelectedKey === key;
                return (
                  <tr key={key}
                    onClick={() => { toggleSupplierExpand(sup); setSupplierSelectedKey(key); }}
                    className={`cursor-pointer transition-colors ${isSelected ? "bg-sky-50 hover:bg-sky-100/70" : "hover:bg-slate-50/60"}`}
                    title="클릭 → 오른쪽 패널에 상세">
                    <td className="text-center align-middle py-1.5">
                      {isExpanded ? <ChevronDown size={13} className="text-sky-400 mx-auto" /> : <ChevronRight size={13} className="text-slate-300 mx-auto" />}
                    </td>
                    <td className="text-center align-middle py-1.5 text-[11px] font-semibold text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="text-left px-3 py-1.5 align-middle">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(() => {
                          const nm = sup.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "";
                          const cat = vendorCategoryMap[nm] ?? vendorCategoryMap[sup.supplier ?? ""] ?? null;
                          return <VendorCategoryBadge category={cat} />;
                        })()}
                        <span className={`text-[13px] font-semibold break-words whitespace-normal leading-tight ${isSelected ? "text-sky-800" : "text-slate-700"}`}>
                          {sup.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim()}
                        </span>
                        {sup.supplier_code && <span className="text-[10px] tabular-nums text-slate-400 shrink-0 font-mono bg-slate-100 rounded px-1" title="공급사코드">#{sup.supplier_code}</span>}
                        {sup.code_conflict && <span className="text-[11px] font-semibold text-amber-500 shrink-0" title="같은 이름에 여러 공급사코드가 존재">⚠</span>}
                      </div>
                    </td>
                    {isSupplierGroupCollapsed("stock") ? <td className="bg-sky-50/20 w-4"></td> : (
                      <>
                        <td className="text-right px-3 py-1.5 align-middle text-[13px] font-semibold text-sky-700 tabular-nums bg-sky-50/40" title="재고자산">{fmtWon(sup.totalStockAmount)}</td>
                        <td className="text-right px-3 py-1.5 align-middle text-[12px] font-semibold text-sky-600 tabular-nums bg-sky-50/20" title="취급 상품 종수">{sup.itemCount}</td>
                      </>
                    )}
                    {isSupplierGroupCollapsed("purchase") ? <td className="bg-amber-50/20 w-4"></td> : (
                      <>
                        <td className="text-right px-3 py-1.5 align-middle text-[13px] font-semibold text-amber-700 tabular-nums bg-amber-50/30" title="매입수량">{fmt(sup.purchaseQty)}</td>
                        {showExtraPurchaseColumns && (
                          <td className="text-right px-3 py-1.5 align-middle text-[13px] font-semibold text-amber-800 tabular-nums bg-amber-50/50" title="매입액 (공급가액 합계)">{fmtWon(Number(sup.purchaseAmount ?? 0))}</td>
                        )}
                        {showCycleColumn && (() => {
                          const c = cycleFor(sup.supplier);
                          return (
                            <td
                              className="text-right px-3 py-1.5 align-middle text-[13px] font-semibold text-amber-700 tabular-nums bg-amber-50/40"
                              title={c == null ? "최근 90일 매입 이력 부족" : `평균 매입주기 ${c}일 (최근 90일)`}
                            >
                              {c == null ? <span className="text-slate-300">-</span> : `${c}일`}
                            </td>
                          );
                        })()}
                      </>
                    )}
                    {!hideSaleColumns && (
                      isSupplierGroupCollapsed("sale") ? <td className="bg-rose-50/20 w-4"></td> : (
                        <>
                          <td className="text-right px-3 py-1.5 align-middle text-[13px] font-semibold text-rose-600 tabular-nums bg-rose-50/20" title="판매수량">{fmt(sup.saleQty)}</td>
                          <td className="text-right px-3 py-1.5 align-middle text-[13px] font-semibold text-rose-700 tabular-nums bg-rose-50/30" title="판매액">{fmtWon(Number(sup.saleAmount ?? 0))}</td>
                        </>
                      )
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );

  // ── embedded 모드 · 좌측 리스트만 (부모 SplitPanel 안에 배치) ─────────────
  if (embedded) {
    return (
      <div className="w-full h-full min-h-0 flex flex-col gap-2">
        {/* 컴팩트 상단 필터바 (기간 · Top N · 새로고침) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">기간</span>
            <div className="flex flex-wrap bg-slate-50 border border-slate-200 rounded-md p-0.5 gap-0.5">
              <button onClick={() => { setSupplierSeason(null); setSupplierMonths(0); }}
                className={`px-1.5 h-5 text-[10px] font-semibold rounded transition cursor-pointer ${!supplierSeason && supplierMonths === 0 ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>10일</button>
              {[1, 2, 3, 4, 5, 6].map(m => (
                <button key={m} onClick={() => { setSupplierSeason(null); setSupplierMonths(m as any); }}
                  className={`px-1.5 h-5 text-[10px] font-semibold rounded transition cursor-pointer ${!supplierSeason && supplierMonths === m ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{m}개월</button>
              ))}
            </div>
          </div>
          <SeasonButtons value={supplierSeason} onChange={(v) => { setSupplierSeason(v); if (v) setSupplierMonths(0); }} size="sm" hideLabel />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">Top N</span>
            <div className="inline-flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
              {[{ v: 100, label: "100" }, { v: 300, label: "300" }, { v: 1000, label: "1k" }, { v: 2000, label: "2k" }, { v: 999999, label: "전체" }].map(o => (
                <button key={o.v} onClick={() => setSupListLimit(o.v)}
                  className={`text-[10px] font-semibold h-5 px-1.5 rounded transition whitespace-nowrap cursor-pointer ${supListLimit === o.v ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >{o.label}</button>
              ))}
            </div>
          </div>
          <button type="button" onClick={fetchData} disabled={loading}
            className="ml-auto w-6 h-6 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-slate-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer" title="새로고침">
            <LoaderIcon size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        {/* 좌측 리스트 카드 */}
        <div className={`${CARD_BASE} flex-1 min-h-0 flex flex-col`}>
          {renderSupplierListCard()}
        </div>
        {/* 공급사 상세 모달 (embedded 에서도 사용 가능하도록 유지) */}
        {supplierDetailModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={() => setSupplierDetailModal(null)}>
            <div className="relative w-full max-w-3xl max-h-[90vh] overflow-auto bg-white rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
              <VendorDetailModal vendor={supplierDetailModal} onClose={() => setSupplierDetailModal(null)} onSaved={() => setSupplierDetailModal(null)} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* ── 상단 필터바 ── */}
      <div className={`${CARD_BASE} px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2`}>
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-sky-500 shrink-0" />
          <span className={`${TEXT.body} text-slate-800`}>공급사현황</span>
          <span className="text-[11px] font-semibold text-sky-600 bg-sky-50 rounded-full px-2 py-0.5 border border-sky-200 tabular-nums">{displayedXlsxSuppliers.length}개 사</span>
          <span className={`${TEXT.caption} text-slate-400 hidden sm:inline`}>행 클릭 → 우측 상품 리스트 · 상품명 클릭 → 상세</span>
        </div>
        {/* 조회기간 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">기간</span>
          <div className="flex flex-wrap bg-slate-50 border border-slate-200 rounded-md p-0.5 gap-0.5">
            <button onClick={() => { setSupplierSeason(null); setSupplierMonths(0); }}
              className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!supplierSeason && supplierMonths === 0 ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>10일</button>
            {[1, 2, 3, 4, 5, 6].map(m => (
              <button key={m} onClick={() => { setSupplierSeason(null); setSupplierMonths(m as any); }}
                className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!supplierSeason && supplierMonths === m ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{m}개월</button>
            ))}
          </div>
        </div>
        <SeasonButtons value={supplierSeason} onChange={(v) => { setSupplierSeason(v); if (v) setSupplierMonths(0); }} size="sm" hideLabel />
        {/* Top N */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">Top N</span>
          <div className="inline-flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
            {[{ v: 100, label: "100" }, { v: 300, label: "300" }, { v: 1000, label: "1k" }, { v: 2000, label: "2k" }, { v: 999999, label: "전체" }].map(o => (
              <button key={o.v} onClick={() => setSupListLimit(o.v)}
                className={`text-[11px] font-semibold h-6 px-2 rounded transition whitespace-nowrap cursor-pointer ${supListLimit === o.v ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >{o.label}</button>
            ))}
          </div>
        </div>
        <button type="button" onClick={fetchData} disabled={loading}
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-slate-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer" title="새로고침">
          <LoaderIcon size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── 하단 좌우 split ── */}
      <div className="flex flex-col lg:flex-row gap-2 lg:min-h-[520px]">
        {/* 좌측: 공급사 리스트 */}
        <div className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
          style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? supplierPanelWidth : undefined }}>
          <div className={`${CARD_BASE} flex-1 min-h-0 flex flex-col overflow-hidden`}>
            {renderSupplierListCard()}
          </div>
        </div>

        {/* 리사이즈 핸들 */}
        <div onMouseDown={onSupplierResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-sky-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절">
          <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 우측: 공급사 상세 */}
        <div className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0 transition-transform duration-150 ${supplierSelectedObj ? "fixed inset-0 z-50 bg-slate-50 overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible" : ""}`}>
          {supplierSelectedObj && (
            <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-slate-200 shadow-md">
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => setSupplierSelectedKey(null)}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer shrink-0" title="닫기">
                  <XIcon size={16} strokeWidth={2.4} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-black text-slate-800 break-keep whitespace-normal leading-tight">{supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim()}</div>
                  <div className="text-[10px] tabular-nums text-slate-500 break-words whitespace-normal leading-tight">
                    {supplierSelectedObj.supplier_code ? `#${supplierSelectedObj.supplier_code}` : ""} · 재고자산 {fmtWon(supplierSelectedObj.totalStockAmount)}
                  </div>
                </div>
              </div>
            </div>
          )}
          {!supplierSelectedObj ? (
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
              <Building2 size={40} className="mb-3 opacity-30" />
              <div className="text-sm font-bold">리스트에서 공급사를 클릭하세요</div>
              <div className="text-[11px] mt-1">재고자산 요약 · 상품 리스트</div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Building2 size={16} className="text-sky-600 shrink-0" />
                {(() => {
                  const nm = supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "";
                  return <VendorCategoryBadge category={vendorCategoryMap[nm] ?? vendorCategoryMap[supplierSelectedObj.supplier ?? ""] ?? null} />;
                })()}
                <span className="text-base font-black text-slate-800 break-keep">{supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim()}</span>
                {supplierSelectedObj.supplier_code && <span className="text-[10px] tabular-nums text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">#{supplierSelectedObj.supplier_code}</span>}
                <button type="button"
                  onClick={() => openSupplierDetailModal(supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "")}
                  className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-black text-sky-700 bg-sky-50 border border-sky-300 hover:bg-sky-100 cursor-pointer transition"
                  title="공급사 정보 조회·수정">
                  <Building2 size={11} /> 조회
                </button>
              </div>
              {(() => {
                const supName = supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "";
                const balInfo = supplierBalanceMap[supName] ?? supplierBalanceMap[supplierSelectedObj.supplier ?? ""] ?? null;
                return (
                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center" title={balInfo?.invoice_date ? `기준일 ${balInfo.invoice_date}` : "최신 잔고 없음"}>
                      <div className="text-[10px] text-amber-600 font-semibold">최신잔고</div>
                      <div className="text-sm font-black text-amber-700 mt-0.5">{balInfo ? fmtWon(balInfo.balance) : "-"}</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                      <div className="text-[10px] text-emerald-600 font-semibold">재고자산</div>
                      <div className="text-sm font-black text-emerald-700 mt-0.5">{fmtWon(supplierSelectedObj.totalStockAmount)}</div>
                    </div>
                    <div className="bg-sky-50 border border-sky-200 rounded-lg p-2 text-center">
                      <div className="text-[10px] text-sky-600 font-semibold">매입수량</div>
                      <div className="text-sm font-black text-sky-700 mt-0.5">{fmt(supplierSelectedObj.purchaseQty)}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                      <div className="text-[10px] text-slate-500 font-semibold">취급상품</div>
                      <div className="text-sm font-black text-slate-700 mt-0.5">{fmt(supplierSelectedObj.itemCount)}종</div>
                    </div>
                  </div>
                );
              })()}
              {/* 상품 리스트 */}
              {(() => {
                const key = `${supplierSelectedObj.supplier_code ?? "-"}::${supplierSelectedObj.supplier}`;
                const rows = supplierRowsMap[key];
                const isLoading = supplierRowsLoading.has(key);
                if (isLoading) return <div className="flex items-center gap-2 text-[11px] text-slate-400 py-4"><LoaderIcon size={12} className="animate-spin" />상품 로드 중...</div>;
                if (!rows) return <div className="text-[11px] text-slate-400 py-4">공급사를 클릭하면 상품 리스트가 로드됩니다</div>;
                if (rows.length === 0) return <div className="text-[11px] text-slate-400 py-4">상품 데이터 없음</div>;
                const supDetailArrow = (k: SupDetailSortKey) => supDetailSort.key === k ? (supDetailSort.dir === "desc" ? " ▼" : " ▲") : " ⇅";
                const sortedDetail = sortSupDetailRows(rows);
                const fmtPurchaseDate = (d: string | null | undefined): string => {
                  if (!d) return "-";
                  const dt = new Date(d);
                  if (isNaN(dt.getTime())) return "-";
                  return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`;
                };
                const detailCycleStr = (r: any): string => {
                  const cnt = Number(r.purchase_count ?? 0);
                  if (cnt < 2) return "-";
                  const firstDate = String(r.first_purchase_date ?? r.last_purchase_date ?? "");
                  const lastDate = String(r.last_purchase_date ?? "");
                  if (!firstDate || !lastDate || firstDate === lastDate) return "-";
                  const days = Math.round((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (86400 * 1000));
                  const cycle = cnt > 1 ? Math.round(days / (cnt - 1)) : 0;
                  return cycle > 0 ? `${cycle}일` : "-";
                };
                return (
                  <div className="overflow-auto max-h-[60vh] rounded-lg border border-slate-100">
                    <table className="w-full text-[12px] min-w-[560px]">
                      <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                        <tr className="text-[11px] text-slate-400 uppercase tracking-wider">
                          <th className="text-left px-1 py-1.5 w-6">#</th>
                          <th onClick={() => toggleSupDetailSort("name")} className={`text-left px-1 py-1.5 cursor-pointer select-none hover:bg-slate-50 transition ${supDetailSort.key === "name" ? "text-slate-800 font-black" : ""}`} title="상품명 정렬">상품명{supDetailArrow("name")}</th>
                          <th onClick={() => toggleSupDetailSort("current")} className={`text-right px-1 py-1.5 w-12 cursor-pointer select-none hover:bg-amber-50/60 transition ${supDetailSort.key === "current" ? "text-amber-700 font-black" : "text-amber-500"}`} title="현재고 정렬">현재고{supDetailArrow("current")}</th>
                          <th onClick={() => toggleSupDetailSort("cycle")} className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-slate-50/60 transition ${supDetailSort.key === "cycle" ? "text-slate-700 font-black" : "text-slate-400"}`} title="매입주기 정렬">매입주기{supDetailArrow("cycle")}</th>
                          <th onClick={() => toggleSupDetailSort("purchase_date")} className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-slate-50/60 transition ${supDetailSort.key === "purchase_date" ? "text-slate-700 font-black" : "text-slate-400"}`} title="최근매입일 정렬">최근매입일{supDetailArrow("purchase_date")}</th>
                          <th onClick={() => toggleSupDetailSort("purchase_qty")} className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-slate-50 transition ${supDetailSort.key === "purchase_qty" ? "text-slate-800 font-black" : ""}`} title="매입수량 정렬">매입수량{supDetailArrow("purchase_qty")}</th>
                          <th onClick={() => toggleSupDetailSort("purchase_price")} className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-amber-50/60 transition ${supDetailSort.key === "purchase_price" ? "text-amber-700 font-black" : "text-amber-600"}`} title="매입단가 정렬">매입단가{supDetailArrow("purchase_price")}</th>
                          <th onClick={() => toggleSupDetailSort("sale_qty")} className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-rose-50/60 transition ${supDetailSort.key === "sale_qty" ? "text-rose-700 font-black" : "text-rose-600"}`} title="판매량 정렬">판매량{supDetailArrow("sale_qty")}</th>
                          <th onClick={() => toggleSupDetailSort("sale_amount")} className={`text-right px-1 py-1.5 w-16 cursor-pointer select-none hover:bg-rose-50/60 transition ${supDetailSort.key === "sale_amount" ? "text-rose-800 font-black" : "text-rose-700"}`} title="판매금액 정렬">판매금액{supDetailArrow("sale_amount")}</th>
                          <th onClick={() => toggleSupDetailSort("total_amount")} className={`text-right px-1 py-1.5 w-16 cursor-pointer select-none hover:bg-slate-100 transition ${supDetailSort.key === "total_amount" ? "text-emerald-700 font-black" : "text-emerald-500"}`} title="재고금액 정렬">재고금액{supDetailArrow("total_amount")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sky-100">
                        {sortedDetail.slice(0, 200).map((r, ri) => {
                          const purchPrice = Number(r.purchase_price ?? 0);
                          const saleQty = Number(r.sale_qty ?? 0);
                          const saleAmt = Number(r.total_amount ?? 0);
                          const curStock = Number(r.current_stock ?? 0);
                          const stockValue = curStock > 0 && purchPrice > 0 ? curStock * purchPrice : 0;
                          return (
                            <tr key={`supdet-${r.product_code ?? ri}`} className="hover:bg-slate-50/60 transition-all duration-150 align-top">
                              <td className="px-1 py-1 text-[11px] text-slate-400">{ri + 1}</td>
                              <td className="px-1 py-1 break-words whitespace-normal leading-tight">
                                <button type="button" onClick={() => loadFlowSelectedProduct(r)} className="text-left text-[12px] font-semibold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer transition break-words whitespace-normal">{r.product_name}</button>
                              </td>
                              <td className="text-right px-1 py-1 text-[11px] tabular-nums text-amber-700">{fmt(curStock)}</td>
                              <td className="text-right px-1 py-1 text-[11px] tabular-nums text-slate-500">{detailCycleStr(r)}</td>
                              <td className="text-right px-1 py-1 tabular-nums">
                                {r.product_code && r.last_purchase_date ? (
                                  <button type="button"
                                    onClick={() => setProductPurchaseModal({ product_code: String(r.product_code), product_name: r.product_name ?? "" })}
                                    className="text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                                    title={`${r.last_purchase_date} · 매입 이력 보기`}
                                  >{fmtPurchaseDate(r.last_purchase_date)}</button>
                                ) : (
                                  <span className="text-slate-500">{fmtPurchaseDate(r.last_purchase_date)}</span>
                                )}
                              </td>
                              <td className="text-right px-1 py-1 text-[11px] tabular-nums text-slate-700">{fmt(Number(r.purchase_total_qty ?? r.purchase_qty ?? 0))}</td>
                              <td className="text-right px-1 py-1 text-[11px] tabular-nums text-amber-700 font-semibold">{purchPrice > 0 ? purchPrice.toLocaleString() : "-"}</td>
                              <td className="text-right px-1 py-1 text-[11px] tabular-nums text-rose-600 font-semibold">{saleQty > 0 ? fmt(saleQty) : "-"}</td>
                              <td className="text-right px-1 py-1 text-[11px] tabular-nums text-rose-700 font-semibold">{saleAmt > 0 ? fmtWon(saleAmt) : "-"}</td>
                              <td className="text-right px-1 py-1 text-[11px] tabular-nums font-bold text-emerald-700">{stockValue > 0 ? fmtWon(stockValue) : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {rows.length > 200 && <div className="text-[10px] text-slate-400 text-center py-1">상위 200개만 표시 · 전체 {rows.length}개</div>}
                  </div>
                );
              })()}

              {/* 상품명 클릭 시 우측 상세 패널 (ProductDetailRightPanel) */}
              {flowSelectedProduct && (
                <ProductDetailRightPanel
                  selected={flowSelectedProduct}
                  onClose={() => setFlowSelectedProduct(null)}
                  onProductUpdate={(u) => setFlowSelectedProduct(prev => prev ? { ...prev, ...u } : prev)}
                  onRealMapUpdate={(v) => setFlowSelectedProduct(prev => prev ? { ...prev, real_map: v } : prev)}
                  showChart={true}
                  context="stock-manage"
                  editable={true}
                  emptyMessage="상품명을 클릭하세요"
                  onSupplierInfoOpen={(nm) => openSupplierDetailModal(nm)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* 공급사 상세 모달 */}
      {supplierDetailModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={() => setSupplierDetailModal(null)}>
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-auto bg-white rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <VendorDetailModal vendor={supplierDetailModal} onClose={() => setSupplierDetailModal(null)} onSaved={() => setSupplierDetailModal(null)} />
          </div>
        </div>
      )}

      {/* 매입 이력 모달 */}
      {productPurchaseModal && (
        <ProductPurchaseHistoryModal
          productCode={productPurchaseModal.product_code}
          productName={productPurchaseModal.product_name}
          onClose={() => setProductPurchaseModal(null)}
        />
      )}
    </div>
  );
};

export default SupplierTab;
