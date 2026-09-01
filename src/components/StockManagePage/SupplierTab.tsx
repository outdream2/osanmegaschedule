// src/components/StockManagePage/SupplierTab.tsx
// 공급사현황 탭 — StockManagePage 에서 분리 · OrderManagePage 결제 탭에서도 사용
// 2026-08-03 · 독립 컴포넌트로 추출
// 2026-08-17 · apiClient 마이그레이션

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/apiClient";
import { SK_SUPPLIER_TOTALS_COLLAPSED, SK_STOCKMANAGE_SUPPLIER_W } from "../../lib/storageKeys";
import { useVendors } from "../../hooks/useVendors";
import { getProductsMap, lookupProduct, type ProductInfo } from "../../lib/productsCache";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { CARD_BASE } from "../../styles/tokens";
import { useColumnResize } from "../../hooks/useColumnResize";
import { API_LIMITS } from "../../constants/apiLimits";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-21 · Framework Phase 4 · large-file 분리 · types
import type { SupplierAgg, SupListSortKey, SupDetailSortKey, SupplierGroup } from "./SupplierTab.types";
// 2026-08-22 · Framework Phase 4 · 3섹션 별도 컴포넌트 이관
import { SupplierDetailPanel, SupplierDetailModalWrapper, ProductPurchaseHistoryModalWrapper, SupplierFilterBar } from "./SupplierTab.panels";
// 2026-08-26 · Framework audit large-file-warn 해결 · 리스트 카드 분리
import { SupplierListCard } from "./SupplierListCard";

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
  /**
   * 2026-09-01 · 부모 기간 필터 오버라이드 · embedded 모드에서 사용
   *   - 지정 시 · 내부 supplierMonths/supplierSeason 대신 이 값으로 fetch
   *   - 부모 기간 변경 시 · fetchData 재실행 → loading state 자동 트리거 (프레임워크 스피너)
   *   - default undefined (하위호환 · 기존 non-embedded 화면 변경 없음)
   */
  periodMonths?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  periodSeason?: SeasonKey | null;
}

export const SupplierTab: React.FC<SupplierTabProps> = ({
  embedded = false,
  onSupplierClick,
  selectedSupplierName = null,
  hideSaleColumns = false,
  showExtraPurchaseColumns = false,
  showCycleColumn = false,
  periodMonths: periodMonthsProp,
  periodSeason: periodSeasonProp,
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

  // 기간 필터 · periodMonths/periodSeason prop 이 제공되면 · 그 값이 실효 기간 (부모가 제어)
  //   · non-embedded · 내부 SupplierFilterBar 로 조작 · 하위호환 유지
  //   · embedded · 부모 (PurchaseHistoryTab) 기간 변경 시 · 자동 동기화 → fetchData 재실행 → loading 트리거
  const [supplierMonthsInternal, setSupplierMonthsInternal] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(0);
  const [supplierSeasonInternal, setSupplierSeasonInternal] = useState<SeasonKey | null>(null);
  const supplierMonths = periodMonthsProp ?? supplierMonthsInternal;
  const supplierSeason = periodSeasonProp ?? supplierSeasonInternal;
  const setSupplierMonths = setSupplierMonthsInternal;
  const setSupplierSeason = setSupplierSeasonInternal;

  // 공급사 목록
  const [xlsxSuppliers, setXlsxSuppliers] = useState<SupplierAgg[]>([]);
  const { vendors, vendorCategoryMap, findVendorByName } = useVendors();
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
      const v = localStorage.getItem(SK_SUPPLIER_TOTALS_COLLAPSED);
      return v !== "0"; // "0" 명시적 펼침 · 그 외 (null·"1") 접힘
    } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(SK_SUPPLIER_TOTALS_COLLAPSED, totalsCollapsed ? "1" : "0"); } catch { /* noop */ }
  }, [totalsCollapsed]);

  // 좌우 패널 폭
  const [supplierPanelWidth, setSupplierPanelWidth] = useState<number>(() => {
    const defaultW = typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.6) : 800;
    try { const v = Number(localStorage.getItem(SK_STOCKMANAGE_SUPPLIER_W)); return Number.isFinite(v) && v > 0 ? v : defaultW; } catch { return defaultW; }
  });
  useEffect(() => { try { localStorage.setItem(SK_STOCKMANAGE_SUPPLIER_W, String(supplierPanelWidth)); } catch { /**/ } }, [supplierPanelWidth]);
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
  // 2026-08-25 · #82 (#259) 복원 · 인라인 ▶ 확장 · 우측 SplitPanel 과 독립적으로 sub-list 표시
  const [inlineExpanded, setInlineExpanded] = useState<Set<string>>(new Set());
  const toggleInlineExpand = useCallback((key: string, sup: SupplierAgg) => {
    setInlineExpanded(prev => {
      const n = new Set(prev);
      if (n.has(key)) { n.delete(key); return n; }
      n.add(key);
      // 아직 fetch 안 됐으면 · rows 로드 (기존 로직 재활용)
      if (!supplierFetchedRef.current.has(key) && !supplierInflightRef.current.has(key)) {
        supplierInflightRef.current.add(key);
        setSupplierRowsLoading(l => { const s = new Set(l); s.add(key); return s; });
        const params = new URLSearchParams({ sort: "sale", dir: "desc", limit: String(API_LIMITS.LARGE) });
        if (sup.supplier_code) params.set("supplier_code", sup.supplier_code);
        else if (sup.supplier) params.set("supplier", sup.supplier);
        api.get<any>(`/api/stock-manage/top-sales?${params}`)
          .then(({ data }) => {
            const rows = data?.rows ?? [];
            setSupplierRowsMap(prev2 => ({ ...prev2, [key]: Array.isArray(rows) ? rows : [] }));
            supplierFetchedRef.current.add(key);
          })
          .catch(() => { setSupplierRowsMap(prev2 => ({ ...prev2, [key]: [] })); })
          .finally(() => {
            supplierInflightRef.current.delete(key);
            setSupplierRowsLoading(l => { const s = new Set(l); s.delete(key); return s; });
          });
      }
      return n;
    });
  }, []);

  // 공급사 정보 모달 (VendorDetailModal)
  const [supplierDetailModal, setSupplierDetailModal] = useState<any | null>(null);

  // 상품 매입 이력 모달
  const [productPurchaseModal, setProductPurchaseModal] = useState<{ product_code: string; product_name: string } | null>(null);

  // 우측 패널용 선택 상품 (공급사 우측 패널 → 상품명 클릭 시)
  const [flowSelectedProduct, setFlowSelectedProduct] = useState<ProductInfo | null>(null);
  const loadFlowSelectedProduct = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    const partial: ProductInfo = { code, name: String(p.product_name ?? ""), spec: String(p.spec ?? ""), current_stock: p.current_stock ?? null, optimal_stock: p.optimal_stock ?? null, supplier: p.supplier ?? null, real_map: p.real_map ?? null, location: p.location ?? null };
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
    // 2026-08-25 · 열린 이슈 #2 fix · useVendors 와 union · 매입 이력 없는 공급사도 검색·표시
    //   · supplier-purchases API 는 매입 이력 있는 vendor 만 반환 → "테스트" 등 신규 vendor 미표시 버그
    //   · Option A · 클라이언트 union · 매입 이력 없는 vendor 는 metrics 0 · row 우측에 "매입 이력 없음" pill
    const purchasedNames = new Set(
      sortedXlsxSuppliers.map(s => String(s.supplier ?? "").trim().toLowerCase()).filter(Boolean),
    );
    const extra: SupplierAgg[] = vendors
      .filter(v => {
        const nm = String(v.company_name ?? "").trim();
        if (!nm) return false;
        return !purchasedNames.has(nm.toLowerCase());
      })
      .map(v => ({
        supplier: String(v.company_name ?? ""),
        supplier_code: null,
        purchaseQty: 0, purchaseAmount: 0,
        saleQty: 0, saleAmount: 0,
        itemCount: 0, totalStockAmount: 0,
      }))
      // 매입 이력 없는 vendor · 항상 이름 오름차순 · 사용자 예측 가능성
      .sort((a, b) => a.supplier.localeCompare(b.supplier, "ko"));
    const merged: SupplierAgg[] = extra.length > 0 ? [...sortedXlsxSuppliers, ...extra] : sortedXlsxSuppliers;

    let filtered = supListCategory === "전체"
      ? merged
      : merged.filter(sup => {
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
  }, [sortedXlsxSuppliers, supListLimit, supListCategory, vendorCategoryMap, supplierSearch, vendors]);

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

  // ── 리스트 카드 공통 props ──
  const listCardProps = {
    displayedXlsxSuppliers,
    xlsxSuppliers,
    supListLimit,
    supListTotals,
    vendorCategoryMap,
    supplierRowsMap,
    supplierRowsLoading,
    inlineExpanded,
    supplierSelectedKey,
    loading,
    supplierSearch,
    supListCategory,
    supListSort,
    totalsCollapsed,
    supplierGroupCollapsed,
    embedded,
    hideSaleColumns,
    showExtraPurchaseColumns,
    showCycleColumn,
    onSearchChange: setSupplierSearch,
    onRefresh: fetchData,
    onCategoryChange: setSupListCategory,
    onSortToggle: toggleSupListSort,
    onTotalsToggle: setTotalsCollapsed,
    onGroupToggle: toggleSupplierGroup,
    onRowClick: (sup: SupplierAgg, key: string) => { toggleSupplierExpand(sup); setSupplierSelectedKey(key); },
    onInlineToggle: toggleInlineExpand,
    getWidth,
    resizerProps,
    cycleFor,
  };

  // ── embedded 모드 · 좌측 리스트만 (부모 SplitPanel 안에 배치) ─────────────
  if (embedded) {
    return (
      <div className="w-full h-full min-h-0 flex flex-col gap-2">
        <div className={`${CARD_BASE} flex-1 min-h-0 flex flex-col overflow-hidden`}>
          <SupplierListCard {...listCardProps} />
        </div>
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
            <SupplierListCard {...listCardProps} />
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
