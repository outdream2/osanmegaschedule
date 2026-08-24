// src/components/StockManagePage/SupplierTab.tsx
// 공급사현황 탭 — StockManagePage 에서 분리 · OrderManagePage 결제 탭에서도 사용
// 2026-08-03 · 독립 컴포넌트로 추출
// 2026-08-17 · apiClient 마이그레이션

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/apiClient";
import { useVendors } from "../../hooks/useVendors";
import { Building2, Loader2 as LoaderIcon, ChevronRight, ChevronDown } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { getProductsMap, lookupProduct, type ProductInfo } from "../../lib/productsCache";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { ProductPurchaseHistoryModal } from "./ProductPurchaseHistoryModal";
import { LoadingState } from "../common/LoadingState";
import { EmptyState } from "../common/EmptyState";
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { fmtWonCompact } from "../../lib/format";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";
import { API_LIMITS } from "../../constants/apiLimits";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-21 · Framework Phase 4 · large-file 분리 · types + fmt
import type { SupplierAgg, SupListSortKey, SupDetailSortKey, SupplierGroup } from "./SupplierTab.types";
import { fmt } from "./SupplierTab.types";
// 2026-08-22 · Framework Phase 4 · 3섹션 별도 컴포넌트 이관
import { SupplierDetailPanel, SupplierDetailModalWrapper, ProductPurchaseHistoryModalWrapper, SupplierFilterBar } from "./SupplierTab.panels";
// 2026-08-23 · #198 Phase 3 · SplitListPanel v3 이관 · 프레임워크 통일
import { SplitListPanel } from "../common/SplitListPanel";

const fmtWon = fmtWonCompact;

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
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();
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
  // 2026-08-24 · #262 · 공급사 검색 · 리스트 상단 배치
  const [supplierSearch, setSupplierSearch] = useState<string>("");
  const [supListCategory, setSupListCategory] = useState<"전체" | "위탁" | "선결제" | "60회전" | "90회전" | "기타">("전체");

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
    let filtered = supListCategory === "전체"
      ? sortedXlsxSuppliers
      : sortedXlsxSuppliers.filter(sup => {
          const nm = String(sup.supplier ?? "").trim();
          const cat = vendorCategoryMap[nm] ?? null;
          return cat === supListCategory;
        });
    // 2026-08-24 · #262 · 검색 필터 · supplier + supplier_code · 대소문자 무시
    const q = supplierSearch.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(sup => {
        const nm = String(sup.supplier ?? "").toLowerCase();
        const code = String(sup.supplier_code ?? "").toLowerCase();
        return nm.includes(q) || code.includes(q);
      });
    }
    return filtered.slice(0, supListLimit);
  }, [sortedXlsxSuppliers, supListLimit, supListCategory, vendorCategoryMap, supplierSearch]);

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
      const params = new URLSearchParams({ sort: "sale", dir: "desc", limit: String(API_LIMITS.LARGE) });
      if (sup.supplier_code) params.set("supplier_code", sup.supplier_code);
      else if (sup.supplier) params.set("supplier", sup.supplier);
      const { data } = await api.get<any>(`/api/stock-manage/top-sales?${params}`);
      const rows = data?.rows ?? [];
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
    showError(`공급사 정보 없음: ${supplierName}`);
  }, [findVendorByName, showError]);

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
      const params = new URLSearchParams({ limit: String(API_LIMITS.MAX) });
      if (supplierSeason) params.set("season", supplierSeason);
      else if (supplierMonths > 0) params.set("months", String(supplierMonths));
      const { data } = await api.get<any>(`/api/stock-manage/supplier-purchases?${params}`);
      setXlsxSuppliers(Array.isArray(data.rows) ? data.rows : []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [supplierSeason, supplierMonths]);

  useEffect(() => { fetchData(); }, [fetchData]);


  // 잔고 맵 로드
  useEffect(() => {
    (async () => {
      try {
        const { data: j } = await api.get<any>("/api/supplier-balances");
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
        const { data: j } = await api.get<any>("/api/supplier-purchase-summary?days=90");
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
  // 2026-08-23 · #198 Phase 3 · SplitListPanel v3 이관 · 프레임워크 통일
  const renderSupplierListCard = () => (
    <SplitListPanel
      title={
        <span className="inline-flex items-center gap-1.5">
          <Building2 size={14} className="text-sky-500 shrink-0" />
          <span className={TEXT.body}>공급사별 현황</span>
        </span>
      }
      countDisplay={
        <span className="text-[15px] font-semibold tabular-nums text-zinc-400 bg-zinc-50 border border-line rounded px-1.5 py-0.5">
          {displayedXlsxSuppliers.length}{supListLimit < xlsxSuppliers.length ? `/${xlsxSuppliers.length}` : ""}개 사
        </span>
      }
      search={supplierSearch}
      onSearchChange={setSupplierSearch}
      searchPlaceholder="공급사명 · 코드 검색"
      searchInHeader={embedded}
      headerActions={embedded ? (
        <button type="button" onClick={fetchData} disabled={loading}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-line bg-white hover:bg-sky-50 hover:border-sky-300 text-zinc-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer" title="새로고침">
          <LoaderIcon size={13} className={loading ? "animate-spin" : ""} />
        </button>
      ) : undefined}
      filters={
        <div className="flex flex-col gap-1.5 w-full">
          {/* 2026-08-24 · 매입이력 embedded 모드 · 분류 필터 숨김 (사용자 지시) · 정렬만 유지 */}
          {!embedded && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[14px] font-semibold text-zinc-400 uppercase tracking-wider mr-0.5">분류</span>
            {([
              { k: "전체" as const, activeCls: "bg-zinc-700 text-white shadow-sm" },
              { k: "위탁" as const, activeCls: "bg-violet-500 text-white shadow-sm" },
              { k: "선결제" as const, activeCls: "bg-rose-500 text-white shadow-sm" },
              { k: "60회전" as const, activeCls: "bg-emerald-500 text-white shadow-sm" },
              { k: "90회전" as const, activeCls: "bg-teal-500 text-white shadow-sm" },
              { k: "기타" as const, activeCls: "bg-zinc-500 text-white shadow-sm" },
            ]).map(o => (
              <button key={o.k} onClick={() => setSupListCategory(o.k)}
                className={`h-7 px-2.5 rounded-md text-[15px] font-semibold transition cursor-pointer ${supListCategory === o.k ? o.activeCls : "text-zinc-500 bg-zinc-50 hover:bg-zinc-100 border border-line"}`}>
                {o.k}
              </button>
            ))}
          </div>
          )}
          {/* 정렬 행 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[14px] font-semibold text-zinc-400 uppercase tracking-wider mr-0.5">정렬</span>
        {([
          { k: "totalStockAmount" as SupListSortKey, label: "재고자산", color: "amber", hideWhenNoSale: false, showOnlyWithCycle: false },
          { k: "saleQty" as SupListSortKey, label: "판매량", color: "emerald", hideWhenNoSale: true, showOnlyWithCycle: false },
          { k: "saleAmount" as SupListSortKey, label: "판매액", color: "emerald", hideWhenNoSale: true, showOnlyWithCycle: false },
          { k: "purchaseQty" as SupListSortKey, label: "매입", color: "amber", hideWhenNoSale: false, showOnlyWithCycle: false },
          // 2026-08-06 · 사용자 요청 · 주기·상품수 정렬 옵션 제거
          { k: "supplier" as SupListSortKey, label: "공급사명", color: "sky", hideWhenNoSale: false, showOnlyWithCycle: false },
        ]).filter(o => !(hideSaleColumns && o.hideWhenNoSale) && !(o.showOnlyWithCycle && !showCycleColumn)).map(o => {
          const active = supListSort.key === o.k;
          const arrow = active ? (supListSort.dir === "desc" ? " ▼" : " ▲") : "";
          const activeMap: Record<string, string> = {
            amber: "bg-amber-500 text-white shadow-sm",
            emerald: "bg-emerald-500 text-white shadow-sm",
            sky: "bg-sky-500 text-white shadow-sm",
            slate: "bg-zinc-700 text-white shadow-sm",
          };
          return (
            <button key={o.k} onClick={() => toggleSupListSort(o.k)}
              className={`h-7 px-2.5 rounded-md text-[15px] font-semibold transition cursor-pointer ${active ? activeMap[o.color] : "text-zinc-500 bg-zinc-50 hover:bg-zinc-100 border border-line"}`}>
              {o.label}{arrow}
            </button>
          );
        })}
          </div>
        </div>
      }
      bodyClassName="relative flex-1 overflow-auto"
    >
        {loading && xlsxSuppliers.length > 0 && (
          <Card variant="flat" bg="bg-sky-50" borderColor="border-sky-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mx-3 mt-2">
            <Spinner size={12} tone="sky" label="조건 변경 · 새로 불러오는 중..." labelSize={14} />
          </Card>
        )}
        {xlsxSuppliers.length === 0 ? (
          loading ? (
            <LoadingState tone="sky" size="compact" label="데이터 로딩중..." />
          ) : (
            <EmptyState icon={Building2} title="데이터 없음" size="compact" />
          )
        ) : (
          <table className={`w-full text-[15px] ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`} style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="sticky top-0 z-10">
              {/* 2026-08-24 · 사용자 지시 · 카테고리 그룹 헤더 (기본정보·재고현황·매입현황·판매현황) 전체 제거 · 서브헤더만 표시 */}
              {/* 서브 헤더 · 리사이즈 지원 */}
              <tr className="text-[15px] font-semibold text-zinc-500 border-b border-line bg-white">
                <th className="relative text-center py-2" style={{ width: getWidth("toggle"), minWidth: getWidth("toggle") }}>
                  <span {...resizerProps("toggle")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-center py-2" style={{ width: getWidth("num"), minWidth: getWidth("num") }}>
                  #
                  <span {...resizerProps("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-left px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition" style={{ width: getWidth("supplier"), minWidth: getWidth("supplier") }} onClick={() => toggleSupListSort("supplier")} title="공급사명 정렬">
                  공급사 {supListSort.key === "supplier" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                  <span {...resizerProps("supplier")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                </th>
                {/* 2026-08-24 · 자율진행 · 색상 bg 제거 · 미니멀 톤 통일 (zinc/brand 만) · 정렬 화살표 유지 */}
                {isSupplierGroupCollapsed("stock") ? <th className="bg-zinc-50/40" style={{ width: 16 }}></th> : (
                  <>
                    <th className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition text-zinc-600" style={{ width: getWidth("stock_amt"), minWidth: getWidth("stock_amt") }} onClick={() => toggleSupListSort("totalStockAmount")} title="재고자산 정렬">
                      재고자산 {supListSort.key === "totalStockAmount" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                      <span {...resizerProps("stock_amt")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                    </th>
                    <th className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition text-zinc-600" style={{ width: getWidth("item_cnt"), minWidth: getWidth("item_cnt") }} onClick={() => toggleSupListSort("itemCount")} title="상품수 정렬">
                      상품수 {supListSort.key === "itemCount" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                      <span {...resizerProps("item_cnt")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                    </th>
                  </>
                )}
                {isSupplierGroupCollapsed("purchase") ? <th className="bg-zinc-50/40" style={{ width: 16 }}></th> : (
                  <>
                    <th className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition text-zinc-600" style={{ width: getWidth("pur_qty"), minWidth: getWidth("pur_qty") }} onClick={() => toggleSupListSort("purchaseQty")} title="매입수량 정렬">
                      매입수량 {supListSort.key === "purchaseQty" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                      <span {...resizerProps("pur_qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                    </th>
                    {showExtraPurchaseColumns && (
                      <th className="relative text-right px-3 py-2 text-zinc-600" style={{ width: getWidth("pur_amt"), minWidth: getWidth("pur_amt") }} title="매입액 (공급가액 합계 · stock_history.supply_amount)">
                        매입액
                        <span {...resizerProps("pur_amt")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                      </th>
                    )}
                    {showCycleColumn && (
                      <th
                        className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition text-zinc-600"
                        style={{ width: getWidth("cycle_days"), minWidth: getWidth("cycle_days") }}
                        onClick={() => toggleSupListSort("avgCycleDays")}
                        title="매입주기 정렬 (최근 90일 평균)"
                      >
                        매입주기(일) {supListSort.key === "avgCycleDays" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                        <span {...resizerProps("cycle_days")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                      </th>
                    )}
                  </>
                )}
                {!hideSaleColumns && (
                  isSupplierGroupCollapsed("sale") ? <th className="bg-zinc-50/40" style={{ width: 16 }}></th> : (
                    <>
                      <th className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition text-zinc-600" style={{ width: getWidth("sale_qty"), minWidth: getWidth("sale_qty") }} onClick={() => toggleSupListSort("saleQty")} title="판매량 정렬">
                        판매량 {supListSort.key === "saleQty" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                        <span {...resizerProps("sale_qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                      </th>
                      <th className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition text-zinc-600" style={{ width: getWidth("sale_amt"), minWidth: getWidth("sale_amt") }} onClick={() => toggleSupListSort("saleAmount")} title="판매액 정렬">
                        판매액 {supListSort.key === "saleAmount" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                        <span {...resizerProps("sale_amt")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                      </th>
                    </>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {/* 합계 요약 행 · 필터/제한된 visible 공급사 기준 · 접기/펼치기 (2026-08-06) */}
              {totalsCollapsed ? (
                <tr className="bg-zinc-50 border-b border-line text-[15px]">
                  <td colSpan={99} className="px-3 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => setTotalsCollapsed(false)}
                      className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-700 font-semibold cursor-pointer"
                      title="합계 펼치기"
                    >
                      <span className="text-[15px]">▾</span> Σ 합계 펼치기 ({displayedXlsxSuppliers.length}개 사)
                    </button>
                  </td>
                </tr>
              ) : (
              <tr className="bg-zinc-100 border-b-2 border-zinc-300 font-bold text-zinc-800 text-[14px]">
                <td className="text-center py-1.5">
                  <button
                    type="button"
                    onClick={() => setTotalsCollapsed(true)}
                    className="text-zinc-500 hover:text-zinc-700 cursor-pointer text-[14px]"
                    title="합계 접기"
                  >▴ Σ</button>
                </td>
                <td className="text-center py-1.5 text-zinc-500">-</td>
                <td className="text-left px-3 py-1.5 text-zinc-800 font-bold">합계 <span className="text-zinc-500 font-bold">({displayedXlsxSuppliers.length}개 사)</span></td>
                {isSupplierGroupCollapsed("stock") ? <td className="bg-zinc-100" /> : (
                  <>
                    <td className="text-right px-3 py-1.5 tabular-nums font-bold text-ink">{fmtWon(supListTotals.stock)}</td>
                    <td className="text-right px-3 py-1.5 tabular-nums font-bold text-ink">{supListTotals.item.toLocaleString()}</td>
                  </>
                )}
                {isSupplierGroupCollapsed("purchase") ? <td className="bg-zinc-100" /> : (
                  <>
                    <td className="text-right px-3 py-1.5 tabular-nums font-bold text-ink">{supListTotals.purchase.toLocaleString()}</td>
                    {showExtraPurchaseColumns && (
                      <td className="text-right px-3 py-1.5 tabular-nums font-bold text-brand-deep">{fmtWon(supListTotals.purchaseAmt)}</td>
                    )}
                    {showCycleColumn && (
                      <td className="text-right px-3 py-1.5 text-zinc-400" title="합계 없음 · 개별 공급사별 값">-</td>
                    )}
                  </>
                )}
                {!hideSaleColumns && (
                  isSupplierGroupCollapsed("sale") ? <td className="bg-zinc-100" /> : (
                    <>
                      <td className="text-right px-3 py-1.5 tabular-nums font-bold text-ink">{supListTotals.saleQ.toLocaleString()}</td>
                      <td className="text-right px-3 py-1.5 tabular-nums font-bold text-ink">{fmtWon(supListTotals.saleA)}</td>
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
                    className={`cursor-pointer transition-colors ${isSelected ? "bg-brand-tint/60 hover:bg-brand-tint" : "hover:bg-brand-tint/30"}`}
                    title="클릭 → 오른쪽 패널에 상세">
                    <td className="text-center align-middle py-1.5">
                      {/* 2026-08-24 · 좌측 컬러 accent bar 제거 (사용자: 별로) · 카테고리 배지는 supplier 셀에 유지 */}
                      {isExpanded ? <ChevronDown size={13} className="text-brand-deep mx-auto" /> : <ChevronRight size={13} className="text-zinc-300 mx-auto" />}
                    </td>
                    <td className="text-center align-middle py-1.5 text-[15px] font-semibold text-zinc-400 tabular-nums">{i + 1}</td>
                    {/* 2026-08-10 · #18 · 공급사 셀에 [분류][줄바꿈][공급사명] · 2줄 (사용자 요청) */}
                    <td className="text-left px-3 py-1.5 align-top">
                      <div className="flex flex-col leading-tight gap-0.5">
                        {(() => {
                          const nm = sup.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "";
                          const cat = vendorCategoryMap[nm] ?? vendorCategoryMap[sup.supplier ?? ""] ?? null;
                          return <VendorCategoryBadge category={cat} />;
                        })()}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[15px] font-semibold break-words whitespace-normal leading-tight ${isSelected ? "text-sky-800" : "text-zinc-700"}`}>
                            {sup.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim()}
                          </span>
                          {sup.supplier_code && <span className="text-[14px] tabular-nums text-zinc-400 shrink-0 font-mono bg-zinc-100 rounded px-1" title="공급사코드">#{sup.supplier_code}</span>}
                          {sup.code_conflict && <span className="text-[15px] font-semibold text-amber-500 shrink-0" title="같은 이름에 여러 공급사코드가 존재">⚠</span>}
                        </div>
                      </div>
                    </td>
                    {isSupplierGroupCollapsed("stock") ? <td className="bg-zinc-50/30 w-4"></td> : (
                      <>
                        <td className="text-right px-3 py-1.5 align-middle text-[15px] font-semibold text-ink tabular-nums" title="재고자산">{fmtWon(sup.totalStockAmount)}</td>
                        <td className="text-right px-3 py-1.5 align-middle text-[14px] font-semibold text-ink-soft tabular-nums" title="취급 상품 종수">{sup.itemCount}</td>
                      </>
                    )}
                    {isSupplierGroupCollapsed("purchase") ? <td className="bg-zinc-50/30 w-4"></td> : (
                      <>
                        <td className="text-right px-3 py-1.5 align-middle text-[15px] font-semibold text-ink tabular-nums" title="매입수량">{fmt(sup.purchaseQty)}</td>
                        {showExtraPurchaseColumns && (
                          <td className="text-right px-3 py-1.5 align-middle text-[15px] font-bold text-brand-deep tabular-nums" title="매입액 (공급가액 합계)">{fmtWon(Number(sup.purchaseAmount ?? 0))}</td>
                        )}
                        {showCycleColumn && (() => {
                          const c = cycleFor(sup.supplier);
                          return (
                            <td
                              className="text-right px-3 py-1.5 align-middle text-[15px] font-semibold text-ink-soft tabular-nums"
                              title={c == null ? "최근 90일 매입 이력 부족" : `평균 매입주기 ${c}일 (최근 90일)`}
                            >
                              {c == null ? <span className="text-zinc-300">-</span> : `${c}일`}
                            </td>
                          );
                        })()}
                      </>
                    )}
                    {!hideSaleColumns && (
                      isSupplierGroupCollapsed("sale") ? <td className="bg-zinc-50/30 w-4"></td> : (
                        <>
                          <td className="text-right px-3 py-1.5 align-middle text-[15px] font-semibold text-ink tabular-nums" title="판매수량">{fmt(sup.saleQty)}</td>
                          <td className="text-right px-3 py-1.5 align-middle text-[15px] font-semibold text-ink tabular-nums" title="판매액">{fmtWon(Number(sup.saleAmount ?? 0))}</td>
                        </>
                      )
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
    </SplitListPanel>
  );

  // ── embedded 모드 · 좌측 리스트만 (부모 SplitPanel 안에 배치) ─────────────
  if (embedded) {
    return (
      <div className="w-full h-full min-h-0 flex flex-col gap-2">
        {/* 2026-08-24 · 사용자 요청 · 매입이력 embedded · 상단 Card 세션 제거 · SplitListPanel headerActions 로 새로고침 이관 */}
        {/* 2026-08-24 · 사용자 요청 · 세션 상단 가로 컬러 accent (랜딩 입고알림 톤) · Vercel/Linear 시그니처 */}
        <div className={`${CARD_BASE} relative flex-1 min-h-0 flex flex-col overflow-hidden`}>
          <span aria-hidden className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-10" />
          {renderSupplierListCard()}
        </div>
        {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 (embedded 모드) */}
        <SupplierDetailModalWrapper
          vendor={supplierDetailModal}
          onClose={() => setSupplierDetailModal(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · SupplierFilterBar */}
      <SupplierFilterBar
        displayedCount={displayedXlsxSuppliers.length}
        supplierMonths={supplierMonths}
        supplierSeason={supplierSeason}
        supListLimit={supListLimit}
        loading={loading}
        setSupplierMonths={setSupplierMonths}
        setSupplierSeason={setSupplierSeason}
        setSupListLimit={setSupListLimit}
        fetchData={fetchData}
      />

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
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-sky-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절">
          <span className="text-[15px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · SupplierDetailPanel */}
        <SupplierDetailPanel
          supplierSelectedObj={supplierSelectedObj}
          setSupplierSelectedKey={setSupplierSelectedKey}
          vendorCategoryMap={vendorCategoryMap}
          supplierBalanceMap={supplierBalanceMap}
          supplierRowsMap={supplierRowsMap}
          supplierRowsLoading={supplierRowsLoading}
          supDetailSort={supDetailSort}
          toggleSupDetailSort={toggleSupDetailSort}
          sortSupDetailRows={sortSupDetailRows}
          loadFlowSelectedProduct={loadFlowSelectedProduct}
          setProductPurchaseModal={setProductPurchaseModal}
          openSupplierDetailModal={openSupplierDetailModal}
          flowSelectedProduct={flowSelectedProduct}
          setFlowSelectedProduct={setFlowSelectedProduct}
        />
      </div>

      {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · Modal wrappers */}
      <SupplierDetailModalWrapper
        vendor={supplierDetailModal}
        onClose={() => setSupplierDetailModal(null)}
      />
      <ProductPurchaseHistoryModalWrapper
        modal={productPurchaseModal}
        onClose={() => setProductPurchaseModal(null)}
      />
      {/* 2026-08-21 · Framework Phase 3 · toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </div>
  );
};

export default SupplierTab;
