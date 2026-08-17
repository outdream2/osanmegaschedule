// src/components/StockManagePage/FlowTab.tsx
// 상품현황 탭 — StockManagePage 에서 완전 독립 추출
// 2026-08-03 · StockManagePage.tsx 리팩터 · OrderManagePage 통계/flow 서브탭으로 이동
// 2026-08-17 · apiClient 마이그레이션

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/apiClient";
import { useVendors } from "../../hooks/useVendors";
import {
  Search, Boxes, Info, EyeOff, Loader2 as LoaderIcon,
  ChevronRight, ChevronDown, CheckSquare, Square, X as XIcon,
} from "lucide-react";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { getProductsMap, lookupProduct, type ProductInfo } from "../../lib/productsCache";
import { useHiddenManager } from "../../hooks/useHiddenManager";
import { useProductInfoSearch } from "../../hooks/useProductInfoSearch";
import { SeasonButtons } from "../common/SeasonButtons";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { VendorDetailModal } from "../LandingPage/VendorListEditor";
import { matchClassFilter, type ClassFilter } from "../../utils/productClassify";
import { EmptyState } from "../common/EmptyState";
import { fmtWonCompact } from "../../lib/format";
import { LoadingState } from "../common/LoadingState";
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockFlowRow {
  product_code: string;
  product_name: string;
  supplier: string | null;
  spec: string | null;
  opening_stock: number;
  purchase_qty: number;
  sale_qty: number;
  disposal_qty: number;
  closing_stock: number;
  total_amount: number;
  optimal_stock: number;
  last_purchase_date?: string | null;
  sale_price?: number;
  purchase_price?: number;
  sale_qty_month?: number;
}

type SortKey =
  | "name" | "opening" | "sale" | "purchase" | "amount" | "closing" | "current" | "loss"
  | "turnover" | "doh" | "cycle" | "last_purchase" | "min_order" | "last_purchase_price"
  | "stock_value" | "sale_price" | "profit_rate" | "turnover_3m";
type SortDir = "asc" | "desc";
type FlowGroup = "stock" | "purchase" | "sales";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

const fmtWon = fmtWonCompact;

// ─── Module-level cache (5분 TTL) ────────────────────────────────────────────

const GLOBAL_FLOW_CACHE = new Map<string, { data: any; ts: number }>();
const FLOW_CACHE_TTL = 5 * 60 * 1000;

// ─── FlowTab ─────────────────────────────────────────────────────────────────

export const FlowTab: React.FC = () => {
  const { getWidth, resizerProps } = useColumnResize("flowTab", {
    sel:             { default: 48,  min: 40,  max: 80  },
    name:            { default: 260, min: 120, max: 500 },
    // 재고현황
    stock_sale:      { default: 56,  min: 40,  max: 120 },
    stock_cur:       { default: 48,  min: 40,  max: 100 },
    stock_opt:       { default: 56,  min: 40,  max: 120 },
    stock_month:     { default: 64,  min: 40,  max: 120 },
    // 매입현황
    pur_cycle:       { default: 48,  min: 40,  max: 100 },
    pur_last:        { default: 44,  min: 40,  max: 100 },
    pur_qty:         { default: 48,  min: 40,  max: 100 },
    // 판매현황
    sal_qty:         { default: 64,  min: 40,  max: 120 },
    sal_amount:      { default: 80,  min: 50,  max: 160 },
    sal_unit:        { default: 64,  min: 40,  max: 120 },
    sal_price:       { default: 64,  min: 40,  max: 120 },
    sal_profit:      { default: 56,  min: 40,  max: 100 },
  });
  // 정렬
  const [flowSort, setFlowSort] = useState<SortKey>("sale");
  const [flowDir, setFlowDir] = useState<SortDir>("desc");
  const toggleFlowSort = (key: SortKey) => {
    if (flowSort === key) setFlowDir(prev => (prev === "desc" ? "asc" : "desc"));
    else { setFlowSort(key); setFlowDir("desc"); }
  };

  // 한도 · 기간 · 시즌
  const [flowLimit, setFlowLimit] = useState<number>(300);
  const [flowMonths, setFlowMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [pendingFlowMonths, setPendingFlowMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [flowSeason, setFlowSeason] = useState<SeasonKey | null>(null);
  const [flowSnapshot, setFlowSnapshot] = useState<string>("");
  const flowSnapshotAutoSet = useRef(false);

  // 검색
  const [flowSearch, setFlowSearch] = useState<string>("");
  const [salesQtyMin, setSalesQtyMin] = useState<string>("");
  const [salesQtyMax, setSalesQtyMax] = useState<string>("");
  // 분류 필터
  type FlowCategoryFilter = "전체" | "위탁" | "선결제" | "60회전" | "90회전" | "기타";
  const [flowCategoryFilter, setFlowCategoryFilter] = useState<FlowCategoryFilter>("전체");
  // 상비약/일반약/전체 3-way 필터 (localStorage 저장)
  const [classFilter, setClassFilter] = useState<ClassFilter>(() => {
    try {
      const v = localStorage.getItem("megatown_flow_classfilter");
      return v === "stationery" || v === "general" || v === "all" ? v : "all";
    } catch { return "all"; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_flow_classfilter", classFilter); } catch { /**/ } }, [classFilter]);
  // 상품 real_map 매핑 (products.json 캐시)
  const [productRealMapById, setProductRealMapById] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    getProductsMap().then(map => {
      if (!alive) return;
      const m: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(map)) m[k] = (v as any)?.real_map ?? null;
      setProductRealMapById(m);
    }).catch(() => { /* 캐시 없으면 필터 미분류 처리 */ });
    return () => { alive = false; };
  }, []);

  // 그룹 접기
  const [flowGroupCollapsed, setFlowGroupCollapsed] = useState<Set<FlowGroup>>(new Set(["purchase", "sales"]));
  const toggleFlowGroup = (g: FlowGroup) =>
    setFlowGroupCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isFlowGroupCollapsed = (g: FlowGroup) => flowGroupCollapsed.has(g);

  // 벌크 숨김 선택
  const [selectedFlowCodes, setSelectedFlowCodes] = useState<Set<string>>(new Set());
  const [flowBulkHiding, setFlowBulkHiding] = useState(false);
  const toggleSelectFlow = (code: string) =>
    setSelectedFlowCodes(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });

  // 데이터
  const [stockFlow, setStockFlow] = useState<StockFlowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableSnapshots, setAvailableSnapshots] = useState<string[]>([]);
  const [snapshotPeriods, setSnapshotPeriods] = useState<Record<string, string | null>>({});
  const [flowPeriodType, setFlowPeriodType] = useState<string | null>(null);

  // 우측 패널 — 선택 상품
  const [flowSelectedProduct, setFlowSelectedProduct] = useState<ProductInfo | null>(null);
  const loadFlowSelectedProduct = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    const partial: ProductInfo = {
      code,
      name: String(p.product_name ?? ""),
      spec: String(p.spec ?? ""),
      current_stock: p.current_stock ?? null,
      optimal_stock: p.optimal_stock ?? null,
      supplier: p.supplier ?? null,
      real_map: p.real_map ?? null,
      warehouse_stock: p.warehouse_stock ?? null,
      store_stock: p.store_stock ?? null,
    };
    setFlowSelectedProduct(partial);
    try {
      let full = lookupProduct(code);
      if (!full) {
        const map = await getProductsMap();
        full = map[code] ?? map[code.replace(/^0+/, "")] ?? null;
      }
      if (full) {
        setFlowSelectedProduct(prev => {
          if (!prev || prev.code !== code) return prev;
          const overlay: Record<string, any> = {};
          for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) overlay[k] = v;
          return { ...full!, ...overlay, code, name: full!.name || prev.name };
        });
      }
    } catch { /* cache load 실패 무시 */ }
  }, []);

  // 패널 폭 조절
  const [flowPanelWidth, setFlowPanelWidth] = useState<number>(() => {
    const defaultW = typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.6) : 800;
    try { const v = Number(localStorage.getItem("megatown_stockmanage_flow_w")); return Number.isFinite(v) && v > 0 ? v : defaultW; } catch { return defaultW; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_stockmanage_flow_w", String(flowPanelWidth)); } catch { /* ignore */ } }, [flowPanelWidth]);
  const flowResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onFlowResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    flowResizeRef.current = { startX: e.clientX, startW: flowPanelWidth };
    const move = (ev: MouseEvent) => {
      const r = flowResizeRef.current;
      if (!r) return;
      setFlowPanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX))));
    };
    const up = () => {
      flowResizeRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // 분류 맵 · 공용 훅 (vendorCategoryMap + findVendorByName 함께 사용)
  const { vendorCategoryMap, findVendorByName } = useVendors();

  // 공급사 상세 모달 (우측 패널의 "공급사 조회" 버튼) · 캐시 활용 (inline fetch 제거)
  const [supplierDetailModal, setSupplierDetailModal] = useState<any | null>(null);
  const openSupplierDetailModal = useCallback((supplierName: string) => {
    if (!supplierName) return;
    const found = findVendorByName(supplierName);
    if (found) { setSupplierDetailModal(found); return; }
    alert(`공급사 정보 없음: ${supplierName}`);
  }, [findVendorByName]);

  // 숨김 관리 훅
  const fetchStockFlowRef = useRef<() => void>(() => {});
  const _hm = useHiddenManager({ onUnhideSuccess: () => fetchStockFlowRef.current() });
  const hiddenModalOpen = _hm.modalOpen;
  const setHiddenModalOpen = _hm.setModalOpen;
  const hiddenList = _hm.list;
  const hiddenLoading = _hm.loading;
  const hiddenUnhideBusyCode = _hm.unhideBusyCode;
  const loadHiddenList = _hm.load;
  const openHiddenManagerModal = _hm.open;
  const unhideProduct = _hm.unhide;

  // 상품 정보확인 검색 훅
  const _pis = useProductInfoSearch();
  const infoSearchQuery = _pis.query;
  const setInfoSearchQuery = _pis.setQuery;
  const infoSearchResults = _pis.results;
  const setInfoSearchResults = _pis.setResults;
  const infoSelected = _pis.selected;
  const setInfoSelected = _pis.setSelected;
  const runInfoSearch = _pis.runSearch;

  // 스냅샷 날짜 범위 표시
  const flowDateRange = useMemo<string | null>(() => {
    if (!flowSnapshot) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(flowSnapshot);
    if (!m) return null;
    const yyyy = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
    const today = new Date();
    const isTodaySnap = today.getFullYear() === yyyy && (today.getMonth() + 1) === mm && today.getDate() === dd;
    const endLabel = isTodaySnap ? "오늘" : `${mm}/${dd}`;
    const pt = flowPeriodType === "초순" ? "early"
      : flowPeriodType === "중순" ? "mid"
      : flowPeriodType === "하순" ? "late"
      : flowPeriodType;
    if (pt === "early") return `${mm}월 초순 : ${mm}/1 ~ ${endLabel}`;
    if (pt === "mid") return `${mm}월 중순 : ${mm}/11 ~ ${endLabel}`;
    if (pt === "late") {
      const lastDay = new Date(yyyy, mm, 0).getDate();
      const lastLabel = isTodaySnap && dd === lastDay ? "오늘" : `${mm}/${lastDay}`;
      return `${mm}월 하순 : ${mm}/21 ~ ${lastLabel}`;
    }
    return `${mm}/${dd}`;
  }, [flowSnapshot, flowPeriodType]);

  // ─── fetchStockFlow (2단계 lazy loading) ──────────────────────────────────

  const fetchStockFlow = useCallback(async () => {
    setLoading(true);
    try {
      const serverSort = (["sale", "purchase", "amount", "closing"] as SortKey[]).includes(flowSort) ? flowSort : "sale";
      const params = new URLSearchParams({ sort: serverSort, dir: flowDir, limit: String(flowLimit) });
      if (flowSeason) params.set("season", flowSeason);
      else if (flowMonths > 0) params.set("months", String(flowMonths));
      else if (flowSnapshot) params.set("snapshot_date", flowSnapshot);
      const cacheKey = params.toString();

      // 캐시 hit → 즉시 표시
      const cached = GLOBAL_FLOW_CACHE.get(cacheKey);
      if (cached && Date.now() - cached.ts < FLOW_CACHE_TTL) {
        const d = cached.data;
        setStockFlow(Array.isArray(d.rows) ? d.rows : []);
        setAvailableSnapshots(Array.isArray(d.dates) ? d.dates : []);
        setFlowPeriodType(d.period_type ?? null);
      }

      // 1단계: skip_purchase=1 (빠른 응답)
      const basicParams = new URLSearchParams(params);
      basicParams.set("skip_purchase", "1");
      const { data } = await api.get<any>(`/api/stock-manage/top-sales?${basicParams}`);
      if (data) {
        setStockFlow(Array.isArray(data.rows) ? data.rows : []);
        setAvailableSnapshots(Array.isArray(data.dates) ? data.dates : []);
        setFlowPeriodType(data.period_type ?? null);
        if (Array.isArray(data.dates_with_period)) {
          const map: Record<string, string | null> = {};
          for (const d of data.dates_with_period) map[d.snapshot_date] = d.period_type ?? null;
          setSnapshotPeriods(map);
        }
        if (flowMonths === 0 && !flowSnapshotAutoSet.current && data.snapshot_date) {
          flowSnapshotAutoSet.current = true;
          if (!flowSnapshot) setFlowSnapshot(data.snapshot_date);
        }
        setLoading(false);

        // 2단계: purchase-info-batch (백그라운드)
        const rows: any[] = Array.isArray(data.rows) ? data.rows : [];
        const codes = rows.map(r => String(r.product_code ?? "")).filter(Boolean);
        if (codes.length > 0) {
          try {
            const URL_CHUNK = 200;
            const fetchPromises: Promise<Record<string, any>>[] = [];
            for (let i = 0; i < codes.length; i += URL_CHUNK) {
              const chunk = codes.slice(i, i + URL_CHUNK);
              fetchPromises.push(
                api.get<any>(`/api/stock-manage/purchase-info-batch?codes=${encodeURIComponent(chunk.join(","))}`)
                  .then(r => r.data?.items ?? {})
                  .catch(() => ({}))
              );
            }
            const results = await Promise.all(fetchPromises);
            const merged: Record<string, any> = {};
            for (const items of results) Object.assign(merged, items);
            const enrichedRows = rows.map(r => {
              const info = merged[String(r.product_code ?? "")];
              return info ? { ...r, ...info } : r;
            });
            const fullData = { ...data, rows: enrichedRows };
            GLOBAL_FLOW_CACHE.set(cacheKey, { data: fullData, ts: Date.now() });
            setStockFlow(enrichedRows);
          } catch { /* ignore — basic 데이터는 이미 표시됨 */ }
        } else {
          GLOBAL_FLOW_CACHE.set(cacheKey, { data, ts: Date.now() });
        }
      }
    } catch { setLoading(false); }
  }, [flowSnapshot, flowSort, flowDir, flowLimit, flowMonths, flowSeason]);

  useEffect(() => { fetchStockFlow(); }, [fetchStockFlow]);
  useEffect(() => { fetchStockFlowRef.current = fetchStockFlow; }, [fetchStockFlow]);

  // 상품 숨김 변경 이벤트
  useEffect(() => {
    const handler = () => fetchStockFlowRef.current();
    window.addEventListener("products-hidden-changed", handler);
    return () => window.removeEventListener("products-hidden-changed", handler);
  }, []);

  // 벌크 숨김
  const bulkHideFlow = async () => {
    if (selectedFlowCodes.size === 0) return;
    setFlowBulkHiding(true);
    try {
      const codes = Array.from(selectedFlowCodes) as string[];
      await Promise.all(codes.map(code =>
        api.patch(`/api/products/${encodeURIComponent(code)}`, { hidden: true }).catch(() => {})
      ));
      setStockFlow(prev => prev.filter(r => !selectedFlowCodes.has(String(r.product_code))));
      setSelectedFlowCodes(new Set());
      try { window.dispatchEvent(new CustomEvent("products-hidden-changed")); } catch { /* ignore */ }
    } finally { setFlowBulkHiding(false); }
  };

  // 클라이언트 필터 + 정렬 (classFilter 제외 base — 탭 카운트 계산용)
  const baseFlow = useMemo(() => {
    const minN = salesQtyMin.trim() === "" ? null : parseInt(salesQtyMin, 10);
    const maxN = salesQtyMax.trim() === "" ? null : parseInt(salesQtyMax, 10);
    const q = flowSearch.trim().toLowerCase();
    const filtered = stockFlow.filter(p => {
      const qty = p.sale_qty;
      if (minN != null && Number.isFinite(minN) && qty < minN) return false;
      if (maxN != null && Number.isFinite(maxN) && qty > maxN) return false;
      if (q) {
        const hit = String(p.product_name ?? "").toLowerCase().includes(q)
          || String(p.product_code ?? "").toLowerCase().includes(q)
          || String(p.supplier ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (flowCategoryFilter !== "전체") {
        const sup = String(p.supplier ?? "").trim();
        if (vendorCategoryMap[sup] !== flowCategoryFilter) return false;
      }
      return true;
    });
    const sign = flowDir === "asc" ? 1 : -1;
    if (flowSort === "loss") {
      const lossOf = (p: any) => (Number(p.opening_stock ?? 0) - Number(p.sale_qty ?? 0)) - Number(p.closing_stock ?? 0);
      return [...filtered].sort((a, b) => sign * (lossOf(a) - lossOf(b)));
    }
    if (flowSort === "name") return [...filtered].sort((a, b) => sign * String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko"));
    if (flowSort === "opening") return [...filtered].sort((a, b) => sign * (Number(a.opening_stock ?? 0) - Number(b.opening_stock ?? 0)));
    if (flowSort === "current") return [...filtered].sort((a, b) => sign * (Number((a as any).current_stock ?? 0) - Number((b as any).current_stock ?? 0)));
    const periodDaysLocal = (flowMonths && flowMonths > 0) ? flowMonths * 30 : 30;
    const getVal = (p: any): number | string => {
      const openV = Number(p.opening_stock ?? 0);
      const cur = Number(p.current_stock ?? p.closing_stock ?? 0);
      const saleV = Number(p.sale_qty ?? 0);
      const purP = Number(p.purchase_price ?? 0);
      const saleP = Number(p.sale_price ?? 0);
      switch (flowSort) {
        case "turnover": { const avg = (openV + cur) / 2; return avg > 0 ? saleV / avg : 0; }
        case "doh": { const avg = (openV + cur) / 2; const t = avg > 0 ? saleV / avg : 0; return t > 0 ? periodDaysLocal / t : 999999; }
        case "cycle": {
          const cnt = Number(p.purchase_count ?? 0); const first = p.first_purchase_date; const last = p.last_purchase_date;
          if (cnt < 2 || !first || !last || first === last) return 999999;
          const days = Math.round((new Date(last).getTime() - new Date(first).getTime()) / (86400 * 1000));
          return cnt > 1 ? Math.round(days / (cnt - 1)) : 999999;
        }
        case "last_purchase": return String(p.last_purchase_date ?? "");
        case "min_order": return Number(p.min_order ?? 0);
        case "last_purchase_price": return purP;
        case "stock_value": return cur * purP;
        case "sale_price": return saleP;
        case "profit_rate": return saleP > 0 && purP > 0 ? ((saleP - purP) / saleP) * 100 : -999999;
        case "turnover_3m": return Number(p.sale_qty_cycle ?? 0);
        default: return 0;
      }
    };
    const clientKeys: SortKey[] = ["turnover", "doh", "cycle", "last_purchase", "min_order", "last_purchase_price", "stock_value", "sale_price", "profit_rate", "turnover_3m"];
    if (clientKeys.includes(flowSort)) {
      return [...filtered].sort((a, b) => {
        const va = getVal(a), vb = getVal(b);
        if (typeof va === "string" && typeof vb === "string") return sign * va.localeCompare(vb);
        return sign * ((va as number) - (vb as number));
      });
    }
    return filtered;
  }, [stockFlow, salesQtyMin, salesQtyMax, flowSort, flowDir, flowSearch, flowMonths, flowCategoryFilter, vendorCategoryMap]);

  // 3-way tab 카운트
  const getRealMap = useCallback((p: any) => (p as any).real_map ?? productRealMapById[String(p.product_code)] ?? null, [productRealMapById]);
  const essentialCount = useMemo(() => baseFlow.filter(p => matchClassFilter(getRealMap(p), "stationery")).length, [baseFlow, getRealMap]);
  const generalCount = useMemo(() => baseFlow.filter(p => matchClassFilter(getRealMap(p), "general")).length, [baseFlow, getRealMap]);
  const allCount = baseFlow.length;

  // 최종 리스트 (classFilter 적용)
  const filteredFlow = useMemo(() => {
    if (classFilter === "all") return baseFlow;
    return baseFlow.filter(p => matchClassFilter(getRealMap(p), classFilter));
  }, [baseFlow, classFilter, getRealMap]);

  // 합계 (필터/정렬된 visible rows 기준)
  const flowTotals = useMemo(() => {
    let saleV = 0, curV = 0, optV = 0, monthV = 0, purchV = 0, amountV = 0;
    for (const p of filteredFlow) {
      saleV += Number((p as any).sale_qty ?? 0);
      curV  += Number((p as any).current_stock ?? 0);
      optV  += Number((p as any).optimal_stock ?? 0);
      monthV += Number((p as any).sale_qty_month ?? 0);
      purchV += Number((p as any).purchase_total_qty ?? (p as any).purchase_qty ?? 0);
      amountV += Number((p as any).total_amount ?? 0);
    }
    return { saleV, curV, optV, monthV, purchV, amountV };
  }, [filteredFlow]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2">

      {/* 상단 필터바 */}
      <div className={`${CARD_BASE} px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2`}>
        <div className="flex items-center gap-2">
          <Boxes size={14} className="text-sky-500 shrink-0" />
          <span className={`${TEXT.body} text-zinc-800`}>상품현황리스트</span>
          <span className="text-[15px] font-semibold text-sky-600 bg-sky-50 rounded-full px-2 py-0.5 border border-sky-200 tabular-nums">{filteredFlow.length}건</span>
        </div>

        {/* 조회기간 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[15px] font-semibold text-zinc-500 uppercase tracking-wider shrink-0">기간</span>
          {flowMonths === 0 && !flowSeason && flowSnapshot && (
            <span className="text-[15px] tabular-nums font-medium text-zinc-600 bg-zinc-50 border border-line rounded-md px-2 py-0.5">
              {flowDateRange ?? flowSnapshot}
            </span>
          )}
          {flowMonths > 0 && (() => {
            const today = new Date();
            const start = new Date(today.getFullYear(), today.getMonth() - flowMonths, 1);
            const s = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
            const e = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
            return <span className="text-[15px] tabular-nums font-medium text-zinc-600 bg-zinc-50 border border-line rounded-md px-2 py-0.5">{s} ~ {e}</span>;
          })()}
          <div className="flex flex-wrap bg-zinc-50 border border-line rounded-md p-0.5 gap-0.5">
            <button onClick={() => { setFlowSeason(null); setPendingFlowMonths(0); setFlowMonths(0); }}
              className={`px-2 h-6 text-[15px] font-semibold rounded transition cursor-pointer ${!flowSeason && flowMonths === 0 ? "bg-teal-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>10일</button>
            {([1, 2, 3, 4, 5, 6] as const).map(m => (
              <button key={m} onClick={() => { setFlowSeason(null); setPendingFlowMonths(m); setFlowMonths(m); }}
                className={`px-2 h-6 text-[15px] font-semibold rounded transition cursor-pointer ${!flowSeason && flowMonths === m ? "bg-teal-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>{m}개월</button>
            ))}
          </div>
          <SeasonButtons value={flowSeason} onChange={(v) => { setFlowSeason(v); if (v) { setPendingFlowMonths(0); setFlowMonths(0); } }} size="sm" hideLabel />
        </div>

        {/* Top N */}
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-semibold text-zinc-500 uppercase tracking-wider shrink-0">Top N</span>
          <div className="inline-flex bg-zinc-50 border border-line rounded-md p-0.5">
            {[{ v: 100, label: "100" }, { v: 300, label: "300" }, { v: 1000, label: "1k" }, { v: 2000, label: "2k" }, { v: 50000, label: "전체" }].map(o => (
              <button key={o.v} onClick={() => setFlowLimit(o.v)}
                className={`text-[15px] font-semibold h-6 px-2 rounded transition whitespace-nowrap cursor-pointer ${flowLimit === o.v ? "bg-teal-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 정보확인 검색 */}
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            value={infoSearchQuery}
            onChange={(e) => setInfoSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runInfoSearch(); }}
            placeholder="전체 DB 검색 (정보확인)"
            className="w-48 h-7 pl-7 pr-2 text-[15px] border border-line rounded-md outline-none focus:ring-1 focus:ring-brand-tint focus:border-brand-deep bg-white transition"
          />
          {infoSearchResults.length > 0 && (
            <div className="absolute left-0 top-full mt-1 max-h-64 overflow-y-auto border border-line bg-white rounded-lg shadow-lg z-30 divide-y divide-zinc-100 min-w-full sm:min-w-[500px]">
              {infoSearchResults.map((p, i) => (
                <button key={`info-sr-${p.product_code}-${i}`}
                  onClick={() => { setInfoSelected(p); setInfoSearchQuery(p.product_name); setInfoSearchResults([]); }}
                  className="w-full text-left px-2.5 py-1 hover:bg-sky-50 transition flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-zinc-800 whitespace-nowrap">{p.product_name}</div>
                    <div className="text-[15px] tabular-nums text-zinc-400 whitespace-nowrap">#{p.product_code} · {p.supplier ?? "-"}</div>
                  </div>
                  <span className="text-[15px] text-zinc-400 shrink-0">재고 {p.current_stock ?? "-"}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 정보확인 버튼 */}
        <button
          onClick={() => {
            const target = infoSelected ?? infoSearchResults[0] ?? null;
            if (target) { loadFlowSelectedProduct(target); setInfoSearchResults([]); }
          }}
          disabled={!infoSelected && !infoSearchQuery.trim() && infoSearchResults.length === 0}
          className="flex items-center gap-1.5 text-[15px] font-semibold text-white bg-zinc-700 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-md px-3 h-7 cursor-pointer transition shrink-0"
          title="검색 후 클릭 → 오른쪽 상세 패널에 상품 정보 표시">
          <Info size={12} /> 정보확인
        </button>

        {/* 판매출고계 범위 필터 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-semibold text-zinc-500 uppercase tracking-wider shrink-0">판매출고계</span>
          <input type="number" min={0} value={salesQtyMin} onChange={e => setSalesQtyMin(e.target.value)} placeholder="최소"
            className="w-14 h-7 px-2 text-[15px] border border-line rounded-md outline-none focus:ring-1 focus:ring-brand-tint tabular-nums text-right transition" />
          <span className="text-zinc-400 text-[15px]">~</span>
          <input type="number" min={0} value={salesQtyMax} onChange={e => setSalesQtyMax(e.target.value)} placeholder="최대"
            className="w-14 h-7 px-2 text-[15px] border border-line rounded-md outline-none focus:ring-1 focus:ring-brand-tint tabular-nums text-right transition" />
          <span className="text-zinc-400 text-[15px]">개</span>
          {(salesQtyMin || salesQtyMax) && (
            <button onClick={() => { setSalesQtyMin(""); setSalesQtyMax(""); }}
              className="text-[14px] font-semibold text-rose-500 hover:text-rose-700 px-1.5 py-1 rounded-md hover:bg-rose-50 transition cursor-pointer border border-rose-200">초기화</button>
          )}
        </div>

        {/* 숨김관리 */}
        <button onClick={() => openHiddenManagerModal()}
          className="flex items-center gap-1 text-[15px] font-semibold text-zinc-500 bg-white border border-line hover:bg-zinc-50 hover:border-zinc-300 rounded-md px-2.5 h-7 cursor-pointer transition shrink-0"
          title="숨김 처리된 상품을 확인/해제">
          <EyeOff size={12} /> 숨김관리
        </button>

        {/* 분류 세그먼트 필터 */}
        <div className="flex flex-wrap bg-zinc-50 border border-line rounded-md p-0.5 gap-0.5">
          {(["전체", "위탁", "선결제", "60회전", "90회전", "기타"] as const).map(cat => (
            <button key={cat} onClick={() => setFlowCategoryFilter(cat)}
              className={`h-7 px-2.5 text-[15px] font-semibold rounded transition cursor-pointer ${
                flowCategoryFilter === cat
                  ? cat === "전체"   ? "bg-zinc-700 text-white shadow-sm"
                  : cat === "위탁"   ? "bg-violet-500 text-white shadow-sm"
                  : cat === "선결제" ? "bg-rose-500 text-white shadow-sm"
                  : cat === "60회전" ? "bg-emerald-500 text-white shadow-sm"
                  : cat === "90회전" ? "bg-teal-500 text-white shadow-sm"
                  : "bg-zinc-500 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}>{cat}</button>
          ))}
        </div>

        {/* 새로고침 */}
        <button onClick={() => fetchStockFlow()} disabled={loading}
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-line bg-white hover:bg-sky-50 hover:border-sky-300 text-zinc-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer"
          title="새로고침">
          <LoaderIcon size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* 하단 · 좌우 split */}
      <div className="flex flex-col lg:flex-row gap-2 lg:min-h-[520px]">

        {/* 좌측: 재고리스트 */}
        <div
          className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
          style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? flowPanelWidth : undefined }}
        >
          <section className={`${CARD_BASE} p-4 flex-1 min-h-0 flex flex-col overflow-hidden`}>
            <div className="flex-1 min-h-0 flex flex-col">
              {/* 소제목 */}
              <div className="flex items-center gap-2 mb-2 shrink-0">
                <span className="inline-block w-1 h-3.5 rounded-full bg-sky-400 shrink-0" />
                <span className="text-[15px] font-semibold text-zinc-500">재고 · 매입 · 판매 현황</span>
                <span className="text-[15px] text-zinc-400 font-normal tabular-nums">{filteredFlow.length}건</span>
                {selectedFlowCodes.size > 0 && (
                  <span className="text-[15px] text-rose-600 font-semibold tabular-nums ml-1">· {selectedFlowCodes.size}개 선택됨</span>
                )}
              </div>

              {/* 상비약/일반약/전체 3-way 필터 */}
              <div className="flex items-center gap-1 border-b-2 border-line bg-white px-1 pt-1 shrink-0">
                <button type="button" onClick={() => setClassFilter("stationery")}
                  className={`relative px-4 py-2 text-[15px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "stationery" ? "text-violet-700" : "text-zinc-400 hover:text-zinc-600"}`}>
                  상비약 <span className="text-[15px] font-semibold text-zinc-400 ml-1 tabular-nums">({essentialCount})</span>
                  {classFilter === "stationery" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-violet-500" />}
                </button>
                <button type="button" onClick={() => setClassFilter("general")}
                  className={`relative px-4 py-2 text-[15px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "general" ? "text-sky-700" : "text-zinc-400 hover:text-zinc-600"}`}>
                  일반약 <span className="text-[15px] font-semibold text-zinc-400 ml-1 tabular-nums">({generalCount})</span>
                  {classFilter === "general" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-sky-500" />}
                </button>
                <button type="button" onClick={() => setClassFilter("all")}
                  className={`relative px-4 py-2 text-[15px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "all" ? "text-zinc-800" : "text-zinc-400 hover:text-zinc-600"}`}>
                  전체 <span className="text-[15px] font-semibold text-zinc-400 ml-1 tabular-nums">({allCount})</span>
                  {classFilter === "all" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-zinc-500" />}
                </button>
              </div>

              <div className="relative flex-1 overflow-auto max-h-[50vh]">
                {loading && filteredFlow.length > 0 && (
                  <div className="flex items-center justify-center gap-1.5 py-1.5 mx-1 mb-1 bg-sky-50 border border-sky-200 rounded-md shrink-0">
                    <LoaderIcon size={11} className="animate-spin text-sky-600" />
                    <span className="text-[14px] font-bold text-sky-700">조건 변경 · 새로 불러오는 중...</span>
                  </div>
                )}

                {filteredFlow.length === 0 ? (
                  loading ? (
                    <LoadingState tone="slate" size="compact" label="데이터 로딩중..." />
                  ) : (
                    <EmptyState
                      icon={Boxes}
                      title={stockFlow.length === 0 ? "재고 데이터 없음" : "해당 상품 없음"}
                      hint={stockFlow.length === 0 ? "재고현황 xlsx 업로드 필요" : "선택한 판매수량 범위에 해당하는 상품 없음"}
                      size="compact"
                    />
                  )
                ) : (
                  <div className={`transition-opacity duration-200 ${loading ? "opacity-60" : "opacity-100"}`}>
                    <table className="w-full text-[15px] sm:text-sm" style={{ tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead className="sticky top-0 bg-white z-20 shadow-sm">
                        {selectedFlowCodes.size > 0 && (
                          <tr className="bg-rose-50 border-b border-rose-200">
                            <td colSpan={10} className="px-2 py-1.5">
                              <div className="flex items-center gap-2 text-[15px]">
                                <span className="font-bold text-rose-700">{selectedFlowCodes.size}개 선택됨</span>
                                <button onClick={bulkHideFlow} disabled={flowBulkHiding}
                                  className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500 hover:bg-rose-600 text-white font-bold shadow-sm disabled:opacity-50">
                                  {flowBulkHiding ? <LoaderIcon size={11} className="animate-spin" /> : <EyeOff size={11} />}
                                  선택 숨김
                                </button>
                                <button onClick={() => setSelectedFlowCodes(new Set())}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-bold">
                                  <XIcon size={11} /> 해제
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                        {/* 그룹 헤더 */}
                        <tr className="border-b border-line text-[14px] font-bold tracking-wider">
                          <th colSpan={2} className="bg-zinc-50" />
                          {(() => {
                            const GROUP_COLOR: Record<FlowGroup, { bg: string; text: string; hover: string }> = {
                              stock: { bg: "bg-sky-50", text: "text-sky-700", hover: "hover:bg-sky-100" },
                              purchase: { bg: "bg-amber-50", text: "text-amber-700", hover: "hover:bg-amber-100" },
                              sales: { bg: "bg-rose-50", text: "text-rose-700", hover: "hover:bg-rose-100" },
                            };
                            const groupHeader = (g: FlowGroup, label: string, span: number) => {
                              const collapsed = isFlowGroupCollapsed(g);
                              const c = GROUP_COLOR[g];
                              return (
                                <th key={g} colSpan={collapsed ? 1 : span}
                                  className={`text-center py-2 border-l border-r border-zinc-100 cursor-pointer select-none transition uppercase ${c.bg} ${c.text} ${c.hover}`}
                                  onClick={() => toggleFlowGroup(g)}
                                  title={collapsed ? `${label} 펼치기` : `${label} 접기`}>
                                  <span className="inline-flex items-center gap-1 font-bold text-[15px] whitespace-nowrap">
                                    {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                    {label}
                                  </span>
                                </th>
                              );
                            };
                            return (<>{groupHeader("stock", "재고현황", 4)}{groupHeader("purchase", "매입현황", 3)}{groupHeader("sales", "판매현황", 5)}</>);
                          })()}
                        </tr>
                        {/* 서브헤더 */}
                        <tr className="border-b border-zinc-100 text-[15px] font-bold text-zinc-500 uppercase tracking-wider bg-white">
                          {(() => {
                            const arrowFor = (key: SortKey) => flowSort !== key ? "⇅" : flowDir === "desc" ? "▼" : "▲";
                            return (
                              <>
                                <th className="relative text-center px-1 py-1.5" style={{ width: getWidth("sel"), minWidth: getWidth("sel") }}>
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button onClick={() => {
                                      if (selectedFlowCodes.size === filteredFlow.length) setSelectedFlowCodes(new Set());
                                      else setSelectedFlowCodes(new Set(filteredFlow.map(r => String(r.product_code))));
                                    }} className="text-zinc-400 hover:text-rose-500 transition inline-flex items-center justify-center" title="전체 선택/해제">
                                      {selectedFlowCodes.size === filteredFlow.length && filteredFlow.length > 0
                                        ? <CheckSquare size={13} className="text-rose-500" />
                                        : <Square size={13} />}
                                    </button>
                                    <span className="text-[14px] font-bold text-zinc-500">#</span>
                                  </div>
                                  <span {...resizerProps("sel")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                                </th>
                                <th onClick={() => toggleFlowSort("name")}
                                  className={`relative text-left px-1 py-1.5 cursor-pointer select-none hover:bg-zinc-50 transition ${flowSort === "name" ? "text-zinc-800 font-bold" : "text-zinc-500"}`}
                                  style={{ width: getWidth("name"), minWidth: getWidth("name") }}>
                                  <span className="flex flex-col leading-tight items-start">
                                    <span>상품명</span>
                                    <span className="text-[14px] opacity-70">{arrowFor("name")}</span>
                                  </span>
                                  <span {...resizerProps("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                                </th>
                                {/* 재고현황 그룹 */}
                                {isFlowGroupCollapsed("stock") && <th className="bg-sky-50/20" />}
                                {!isFlowGroupCollapsed("stock") && <>
                                  <th onClick={() => toggleFlowSort("sale")}
                                    className={`relative text-right px-0.5 py-1.5 cursor-pointer select-none bg-sky-50/60 hover:bg-sky-100 transition ${flowSort === "sale" ? "text-sky-800 font-bold" : "text-sky-600 font-bold"}`}
                                    style={{ width: getWidth("stock_sale"), minWidth: getWidth("stock_sale") }}>
                                    <span className="flex flex-col leading-tight items-end"><span>판매량</span><span className="text-[14px] opacity-70">{arrowFor("sale")}</span></span>
                                    <span {...resizerProps("stock_sale")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                                  </th>
                                  <th onClick={() => toggleFlowSort("current")}
                                    className={`relative text-right px-0.5 py-1.5 cursor-pointer select-none bg-sky-50/60 hover:bg-sky-100 transition ${flowSort === "current" ? "text-sky-800 font-bold" : "text-sky-600 font-bold"}`}
                                    style={{ width: getWidth("stock_cur"), minWidth: getWidth("stock_cur") }}>
                                    <span className="flex flex-col leading-tight items-end"><span>현재고</span><span className="text-[14px] opacity-70">{arrowFor("current")}</span></span>
                                    <span {...resizerProps("stock_cur")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                                  </th>
                                  <th onClick={() => toggleFlowSort("optimal" as any)}
                                    className={`relative text-right px-0.5 py-1.5 cursor-pointer select-none bg-sky-50/60 hover:bg-sky-100 transition text-sky-600 font-bold`}
                                    style={{ width: getWidth("stock_opt"), minWidth: getWidth("stock_opt") }}>
                                    <span className="flex flex-col leading-tight items-end"><span>추천적정재고</span><span className="text-[14px] opacity-70">{arrowFor("optimal" as any)}</span></span>
                                    <span {...resizerProps("stock_opt")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                                  </th>
                                  <th className="relative text-right px-0.5 py-1.5 bg-sky-50/40 text-sky-600 font-bold"
                                    style={{ width: getWidth("stock_month"), minWidth: getWidth("stock_month") }}>
                                    <span className="flex flex-col leading-tight items-end"><span>최근30일</span><span className="text-[14px] opacity-70">판매</span></span>
                                    <span {...resizerProps("stock_month")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                                  </th>
                                </>}
                                {/* 매입현황 그룹 */}
                                {isFlowGroupCollapsed("purchase") && <th className="bg-amber-50/20" />}
                                {!isFlowGroupCollapsed("purchase") && <>
                                  <th onClick={() => toggleFlowSort("cycle")}
                                    className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-amber-50/60 hover:bg-amber-100 transition ${flowSort === "cycle" ? "text-amber-800" : "text-amber-600"}`}
                                    style={{ width: getWidth("pur_cycle"), minWidth: getWidth("pur_cycle") }}>
                                    <span className="flex flex-col leading-tight items-end">
                                      <span className="text-[14px] font-semibold text-amber-500">평균</span>
                                      <span>매입주기</span>
                                      <span className="text-[14px] opacity-70">{arrowFor("cycle")}</span>
                                    </span>
                                    <span {...resizerProps("pur_cycle")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                                  </th>
                                  <th onClick={() => toggleFlowSort("last_purchase")}
                                    className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-amber-50/40 hover:bg-amber-100 transition ${flowSort === "last_purchase" ? "text-amber-800" : "text-amber-600"}`}
                                    style={{ width: getWidth("pur_last"), minWidth: getWidth("pur_last") }}>
                                    <span className="flex flex-col leading-tight items-end">
                                      <span className="text-[14px] font-semibold text-amber-500">최근</span>
                                      <span>매입일</span>
                                      <span className="text-[14px] opacity-70">{arrowFor("last_purchase")}</span>
                                    </span>
                                    <span {...resizerProps("pur_last")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                                  </th>
                                  <th onClick={() => toggleFlowSort("purchase")}
                                    className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-amber-50/60 hover:bg-amber-100 transition ${flowSort === "purchase" ? "text-amber-800" : "text-amber-600"}`}
                                    style={{ width: getWidth("pur_qty"), minWidth: getWidth("pur_qty") }}>
                                    <span className="flex flex-col leading-tight items-end">
                                      <span className="text-[14px] font-semibold text-amber-500">최근</span>
                                      <span>매입량</span>
                                      <span className="text-[14px] opacity-70">{arrowFor("purchase")}</span>
                                    </span>
                                    <span {...resizerProps("pur_qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                                  </th>
                                </>}
                                {/* 판매현황 그룹 */}
                                {isFlowGroupCollapsed("sales") && <th className="bg-rose-50/20" />}
                                {!isFlowGroupCollapsed("sales") && <>
                                  <th onClick={() => toggleFlowSort("sale")}
                                    className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "sale" ? "text-rose-800" : "text-rose-700"}`}
                                    style={{ width: getWidth("sal_qty"), minWidth: getWidth("sal_qty") }}>
                                    <span className="flex flex-col leading-tight items-end"><span>판매량</span><span className="text-[14px] opacity-70">{arrowFor("sale")}</span></span>
                                    <span {...resizerProps("sal_qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                                  </th>
                                  <th onClick={() => toggleFlowSort("amount")}
                                    className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "amount" ? "text-rose-800" : "text-rose-700"}`}
                                    style={{ width: getWidth("sal_amount"), minWidth: getWidth("sal_amount") }}>
                                    <span className="flex flex-col leading-tight items-end"><span>판매금액</span><span className="text-[14px] opacity-70">{arrowFor("amount")}</span></span>
                                    <span {...resizerProps("sal_amount")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                                  </th>
                                  <th onClick={() => toggleFlowSort("last_purchase_price")}
                                    className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "last_purchase_price" ? "text-rose-800" : "text-rose-600"}`}
                                    style={{ width: getWidth("sal_unit"), minWidth: getWidth("sal_unit") }}>
                                    <span className="flex flex-col leading-tight items-end">
                                      <span className="font-semibold text-rose-500">ERP</span>
                                      <span>단가</span>
                                      <span className="text-[14px] opacity-70">{arrowFor("last_purchase_price")}</span>
                                    </span>
                                    <span {...resizerProps("sal_unit")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                                  </th>
                                  <th onClick={() => toggleFlowSort("sale_price")}
                                    className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "sale_price" ? "text-rose-800" : "text-rose-600"}`}
                                    style={{ width: getWidth("sal_price"), minWidth: getWidth("sal_price") }}>
                                    <span className="flex flex-col leading-tight items-end"><span>판매가</span><span className="text-[14px] opacity-70">{arrowFor("sale_price")}</span></span>
                                    <span {...resizerProps("sal_price")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                                  </th>
                                  <th onClick={() => toggleFlowSort("profit_rate")}
                                    className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "profit_rate" ? "text-rose-800" : "text-rose-600"}`}
                                    style={{ width: getWidth("sal_profit"), minWidth: getWidth("sal_profit") }}>
                                    <span className="flex flex-col leading-tight items-end"><span>이익률</span><span className="text-[14px] opacity-70">{arrowFor("profit_rate")}</span></span>
                                    <span {...resizerProps("sal_profit")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                                  </th>
                                </>}
                              </>
                            );
                          })()}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {/* 합계 요약 행 · 필터/정렬된 visible rows 기준 */}
                        <tr className="bg-zinc-100 border-b-2 border-zinc-300 font-bold text-zinc-800 text-[14px]">
                          <td className="text-center px-1 py-1.5 align-middle" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>Σ</td>
                          <td className="px-2 py-1.5 align-middle text-zinc-800 font-bold">합계 <span className="text-zinc-500 font-bold">({filteredFlow.length}건)</span></td>
                          {!isFlowGroupCollapsed("stock") && <>
                            <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-zinc-800 bg-sky-100/60">{flowTotals.saleV.toLocaleString()}</td>
                            <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-zinc-800 bg-sky-100/60">{flowTotals.curV.toLocaleString()}</td>
                            <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-zinc-800 bg-sky-100/60">{flowTotals.optV.toLocaleString()}</td>
                            <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-sky-700 bg-sky-100/60">{flowTotals.monthV.toLocaleString()}</td>
                          </>}
                          {isFlowGroupCollapsed("stock") && <td className="bg-zinc-100" />}
                          {!isFlowGroupCollapsed("purchase") && <>
                            <td className="text-right px-1.5 py-1.5 tabular-nums text-zinc-400">-</td>
                            <td className="text-right px-1.5 py-1.5 tabular-nums text-zinc-400">-</td>
                            <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-zinc-800 bg-amber-100/60">{flowTotals.purchV > 0 ? flowTotals.purchV.toLocaleString() : "-"}</td>
                          </>}
                          {isFlowGroupCollapsed("purchase") && <td className="bg-zinc-100" />}
                          {!isFlowGroupCollapsed("sales") && <>
                            <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-rose-700 bg-rose-100/60">{flowTotals.saleV > 0 ? flowTotals.saleV.toLocaleString() : "-"}</td>
                            <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-rose-700 bg-rose-100/60">{flowTotals.amountV > 0 ? fmtWon(flowTotals.amountV) : "-"}</td>
                            <td className="text-right px-1.5 py-1.5 tabular-nums text-zinc-400">평균</td>
                            <td className="text-right px-1.5 py-1.5 tabular-nums text-zinc-400">평균</td>
                            <td className="text-right px-1.5 py-1.5 tabular-nums text-zinc-400">-</td>
                          </>}
                          {isFlowGroupCollapsed("sales") && <td className="bg-zinc-100" />}
                        </tr>
                        {filteredFlow.map((p, i) => {
                          const cur = Number((p as any).current_stock ?? 0);
                          const openV = Number(p.opening_stock ?? 0);
                          const saleV = Number(p.sale_qty ?? 0);
                          const purchV = Number((p as any).purchase_total_qty ?? p.purchase_qty ?? 0);
                          const saleP = Number((p as any).sale_price ?? 0);
                          const purP = Number((p as any).purchase_price ?? 0);
                          const profitRate = saleP > 0 && purP > 0 ? Math.trunc(((saleP - purP) / saleP) * 100) : null;
                          const purchaseCount = Number((p as any).purchase_count ?? 0);
                          const firstPD = (p as any).first_purchase_date as string | null;
                          const lastPD = p.last_purchase_date;
                          const purchaseCycle = (() => {
                            if (purchaseCount < 2 || !firstPD || !lastPD || firstPD === lastPD) return null;
                            const days = Math.round((new Date(lastPD).getTime() - new Date(firstPD).getTime()) / (86400 * 1000));
                            return purchaseCount > 1 ? Math.round(days / (purchaseCount - 1)) : null;
                          })();
                          const lastPDShort = (() => {
                            const d = lastPD;
                            if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d))) return "-";
                            return `${String(d).slice(5, 7)}/${String(d).slice(8, 10)}`;
                          })();
                          const fmtMan = (v: number): string => {
                            if (v <= 0) return "-";
                            if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}억`;
                            if (v >= 10_000) return `${(v / 10_000).toFixed(1)}만`;
                            return v.toLocaleString();
                          };
                          return (
                            <tr key={`flow-${p.product_code}-${i}`} className={`transition ${selectedFlowCodes.has(String(p.product_code)) ? "bg-zinc-50" : "hover:bg-zinc-50/70"}`}>
                              <td className="text-center px-1 py-2 align-top" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>
                                <div className="flex items-center justify-center gap-1.5">
                                  <span onClick={(e) => { e.stopPropagation(); toggleSelectFlow(String(p.product_code)); }}
                                    className="cursor-pointer inline-flex items-center justify-center">
                                    {selectedFlowCodes.has(String(p.product_code))
                                      ? <CheckSquare size={13} className="text-zinc-500" />
                                      : <Square size={13} className="text-zinc-300 hover:text-zinc-500" />}
                                  </span>
                                  <span className="text-[14px] font-semibold text-zinc-400 tabular-nums">{i + 1}</span>
                                </div>
                              </td>
                              <td className="px-2 py-2.5 align-top">
                                <button type="button" onClick={() => loadFlowSelectedProduct(p)}
                                  className="text-left text-[15px] font-bold text-zinc-700 hover:text-zinc-900 hover:underline break-words whitespace-normal leading-snug cursor-pointer transition">
                                  {p.product_name}
                                  {(p as any).min_order != null && (p as any).min_order > 0 && (
                                    <span className="inline-flex items-center ml-1 px-1.5 py-0.5 rounded-sm text-[14px] font-bold text-zinc-500 bg-zinc-100 border border-line align-middle">
                                      최소{(p as any).min_order}
                                    </span>
                                  )}
                                </button>
                                {p.supplier && (
                                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                    <VendorCategoryBadge category={vendorCategoryMap[p.supplier] ?? null} />
                                    <span className="text-[15px] font-medium text-zinc-400 break-words whitespace-normal">{p.supplier}</span>
                                  </div>
                                )}
                              </td>
                              {/* 재고현황 그룹 */}
                              {!isFlowGroupCollapsed("stock") && <>
                                <td className="text-right px-1.5 py-2.5 font-bold text-[14px] bg-zinc-50/60 align-top tabular-nums text-zinc-700">{fmt(saleV)}</td>
                                {(() => {
                                  const close = Number(p.closing_stock ?? 0);
                                  const opt = Number((p as any).optimal_stock ?? 0);
                                  const mismatch = close !== cur;
                                  const belowOptimal = opt > 0 && cur < opt;
                                  return (
                                    <td className={`text-right px-1.5 py-2.5 font-bold text-[14px] align-top tabular-nums ${cur <= 0 || mismatch || belowOptimal ? "text-rose-500" : "text-zinc-700"}`}
                                      title={belowOptimal ? `현재고 부족 · ${cur} < 추천적정재고 ${opt}` : mismatch ? `현재고(${fmt(cur)}) ≠ 스냅샷 종료재고(${fmt(close)})` : "ERP 현재고"}>
                                      {fmt(cur)}
                                    </td>
                                  );
                                })()}
                                {(() => {
                                  const opt = Number((p as any).optimal_stock ?? 0);
                                  const below = opt > 0 && cur < opt;
                                  return (
                                    <td className={`text-right px-1.5 py-2.5 font-bold text-[14px] align-top tabular-nums ${opt <= 0 ? "text-zinc-300" : below ? "text-rose-400" : "text-zinc-500"}`}>
                                      {opt > 0 ? fmt(opt) : "-"}
                                    </td>
                                  );
                                })()}
                                <td className="text-right px-1.5 py-2.5 font-bold text-[14px] align-top tabular-nums text-sky-600 bg-sky-50/20">
                                  {fmt(Number((p as any).sale_qty_month ?? 0))}
                                </td>
                              </>}
                              {isFlowGroupCollapsed("stock") && <td className="bg-zinc-50/20" />}
                              {/* 매입현황 그룹 */}
                              {!isFlowGroupCollapsed("purchase") && <>
                                <td className={`text-right px-1.5 py-2.5 font-bold text-[14px] align-top tabular-nums ${purchaseCycle != null ? "text-zinc-600" : purchaseCount === 1 ? "text-zinc-400" : "text-zinc-300"}`}
                                  title={purchaseCycle != null ? `${purchaseCount}회 매입 · 평균 ${purchaseCycle}일 주기` : purchaseCount === 1 && lastPD ? `1회만 매입됨 (${lastPD})` : "매입 이력 없음"}>
                                  {purchaseCycle != null ? `${purchaseCycle}일` : purchaseCount === 1 ? "1회" : purchaseCount >= 2 && firstPD === lastPD ? "동일일" : "-"}
                                </td>
                                <td className="text-right px-1.5 py-2.5 text-zinc-500 font-bold text-[14px] align-top tabular-nums">{lastPDShort}</td>
                                <td className="text-right px-1.5 py-2.5 text-zinc-600 font-bold text-[14px] align-top tabular-nums">{purchV > 0 ? fmt(purchV) : "-"}</td>
                              </>}
                              {isFlowGroupCollapsed("purchase") && <td className="bg-zinc-50/20" />}
                              {/* 판매현황 그룹 */}
                              {!isFlowGroupCollapsed("sales") && <>
                                <td className="text-right px-1.5 py-2.5 text-rose-700 font-bold text-[14px] align-top tabular-nums">{saleV > 0 ? fmt(saleV) : "-"}</td>
                                {(() => {
                                  const saleAmount = Number((p as any).total_amount ?? 0);
                                  return (
                                    <td className="text-right px-1.5 py-2.5 text-rose-600 font-bold text-[14px] align-top tabular-nums">{fmtMan(saleAmount)}</td>
                                  );
                                })()}
                                <td className="text-right px-1.5 py-2.5 text-zinc-500 font-bold text-[14px] align-top tabular-nums">{purP > 0 ? fmtWon(purP) : "-"}</td>
                                <td className="text-right px-1.5 py-2.5 text-zinc-600 font-bold text-[14px] align-top tabular-nums">{saleP > 0 ? fmtWon(saleP) : "-"}</td>
                                <td className={`text-right px-1.5 py-2.5 font-bold text-[14px] align-top tabular-nums ${profitRate == null ? "text-zinc-300" : profitRate >= 30 ? "text-zinc-700" : profitRate >= 15 ? "text-zinc-600" : profitRate >= 0 ? "text-zinc-500" : "text-rose-500"}`}>
                                  {profitRate != null ? `${profitRate}%` : "-"}
                                </td>
                              </>}
                              {isFlowGroupCollapsed("sales") && <td className="bg-zinc-50/20" />}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* 리사이즈 핸들 */}
        <div onMouseDown={onFlowResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-teal-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절">
          <span className="text-[15px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 우측: 제품 정보 패널 */}
        <ProductDetailRightPanel
          selected={flowSelectedProduct}
          onClose={() => setFlowSelectedProduct(null)}
          onProductUpdate={(u) => setFlowSelectedProduct(prev => prev ? { ...prev, ...u } : prev)}
          onRealMapUpdate={(v) => setFlowSelectedProduct(prev => prev ? { ...prev, real_map: v } : prev)}
          showChart={true}
          context="stock-manage"
          editable={true}
          emptyMessage="리스트에서 상품을 클릭하세요"
          emptySub="상세 정보 · 재고 현황 · 매입/판매가"
          onSupplierInfoOpen={(nm) => openSupplierDetailModal(nm)}
        />
      </div>

      {/* 공급사 상세 모달 */}
      {supplierDetailModal && (
        <div className="fixed inset-0 z-[100] bg-zinc-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={() => setSupplierDetailModal(null)}>
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-auto bg-white rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <VendorDetailModal
              vendor={supplierDetailModal}
              onClose={() => setSupplierDetailModal(null)}
              onSaved={() => setSupplierDetailModal(null)}
            />
          </div>
        </div>
      )}

      {/* 숨김 항목 관리 모달 */}
      {hiddenModalOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-900/60 backdrop-blur-sm flex items-center justify-center p-1 sm:p-4" onClick={() => setHiddenModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[98vh] sm:max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-amber-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm">
                  <EyeOff size={18} className="text-white" />
                </div>
                <div>
                  <div className="text-base font-bold text-zinc-800">숨김 항목 관리</div>
                  <div className="text-[15px] font-semibold text-zinc-500 mt-0.5">숨김 처리된 상품 · 검색·발주 리스트에서 노출되지 않음</div>
                </div>
              </div>
              <button onClick={() => setHiddenModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 text-3xl leading-none font-bold w-9 h-9 rounded-lg hover:bg-white/70 transition cursor-pointer flex items-center justify-center shrink-0">×</button>
            </div>
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-zinc-100 bg-white">
              <span className="text-[15px] font-bold text-zinc-500">총 <span className="text-amber-700 font-bold">{hiddenList.length}</span>개 숨김</span>
              <button onClick={loadHiddenList} disabled={hiddenLoading}
                className="text-[14px] font-bold text-zinc-500 hover:text-zinc-800 border border-line hover:border-zinc-400 rounded-lg px-2 py-1 cursor-pointer transition">
                {hiddenLoading ? "..." : "새로고침"}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-zinc-50">
              {hiddenLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-8">
                  <div className="w-10 h-10 border-4 border-line border-t-orange-500 rounded-full animate-spin" />
                  <div className="text-xs font-bold text-zinc-600">데이터 로딩중...</div>
                </div>
              ) : hiddenList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-2">
                  <EyeOff size={28} className="opacity-40" />
                  <div className="text-sm font-bold">숨김 처리된 상품이 없습니다</div>
                  <div className="text-[15px]">정보확인 창에서 "숨기기"로 항목 추가 가능</div>
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100 bg-white">
                  {hiddenList.map((p) => {
                    const code = String(p.product_code ?? "");
                    const busy = hiddenUnhideBusyCode === code;
                    return (
                      <li key={`hidden-${code}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-amber-50/30 transition">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-zinc-800 break-words leading-tight">{p.product_name}</div>
                          <div className="text-[14px] tabular-nums text-zinc-400 break-words whitespace-normal leading-tight">
                            #{code}{p.supplier ? ` · ${p.supplier}` : ""}{p.real_map ? ` · ${p.real_map}` : ""}{p.current_stock != null ? ` · 재고 ${p.current_stock}` : ""}
                          </div>
                        </div>
                        <button onClick={() => unhideProduct(code)} disabled={busy}
                          className="shrink-0 flex items-center gap-1 text-[14px] font-bold text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-wait rounded-lg px-2.5 py-1.5 cursor-pointer transition">
                          {busy ? <LoaderIcon size={11} className="animate-spin" /> : <EyeOff size={11} />}
                          다시 표시
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlowTab;
