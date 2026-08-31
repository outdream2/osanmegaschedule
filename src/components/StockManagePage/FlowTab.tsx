// src/components/StockManagePage/FlowTab.tsx
// 상품현황 탭 — StockManagePage 에서 완전 독립 추출
// 2026-08-03 · StockManagePage.tsx 리팩터 · OrderManagePage 통계/flow 서브탭으로 이동
// 2026-08-17 · apiClient 마이그레이션

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/apiClient";
import { SK_FLOW_CLASSFILTER } from "../../lib/storageKeys";
import { useVendors } from "../../hooks/useVendors";
import {
  Boxes, EyeOff,
  ChevronRight, ChevronDown, CheckSquare, Square, X as XIcon,
} from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { getProductsMap, lookupProduct, type ProductInfo } from "../../lib/productsCache";
import { useHiddenManager } from "../../hooks/useHiddenManager";
import { useProductInfoSearch } from "../../hooks/useProductInfoSearch";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { matchClassFilter, type ClassFilter } from "../../utils/productClassify";
import { EmptyState } from "../common/EmptyState";
import { fmtWonCompact } from "../../lib/format";
import { LoadingState } from "../common/LoadingState";
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";

// 2026-08-21 · Framework Phase 4 · large-file 분리 · types + fmt + cache
import type { StockFlowRow, SortKey, SortDir, FlowGroup } from "./FlowTab.types";
import { fmt, GLOBAL_FLOW_CACHE, FLOW_CACHE_TTL } from "./FlowTab.types";
// 2026-08-22 · Framework Phase 4 · row rendering 별도 파일 이관
import { FlowRow } from "./FlowRow";
import { resolveProductLocation } from "../../lib/productLocation";
// 2026-08-22 · Framework Phase 4 · 3섹션 별도 컴포넌트 이관
import { FlowFilterBar, HiddenManagerModal, SupplierDetailModalWrapper } from "./FlowTab.panels";
// 2026-08-26 · 사용자 지시 · 적정재고 기준 일수 코멘트
import { OptimalStockNoteBanner } from "../common/OptimalStockNoteBanner";

const fmtWon = fmtWonCompact;

// ─── FlowTab ─────────────────────────────────────────────────────────────────

export const FlowTab: React.FC = () => {
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();
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
  // 2026-08-22 · flowSearch state 제거 · UI 없음 · dead code
  const [salesQtyMin, setSalesQtyMin] = useState<string>("");
  const [salesQtyMax, setSalesQtyMax] = useState<string>("");
  // 분류 필터
  type FlowCategoryFilter = "전체" | "위탁" | "선결제" | "60회전" | "90회전" | "기타";
  const [flowCategoryFilter, setFlowCategoryFilter] = useState<FlowCategoryFilter>("전체");
  // 상비약/일반약/전체 3-way 필터 (localStorage 저장)
  const [classFilter, setClassFilter] = useState<ClassFilter>(() => {
    try {
      const v = localStorage.getItem(SK_FLOW_CLASSFILTER);
      return v === "stationery" || v === "general" || v === "all" ? v : "all";
    } catch { return "all"; }
  });
  useEffect(() => { try { localStorage.setItem(SK_FLOW_CLASSFILTER, classFilter); } catch { /**/ } }, [classFilter]);
  // 상품 real_map 매핑 (products.json 캐시)
  const [productRealMapById, setProductRealMapById] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    getProductsMap().then(map => {
      if (!alive) return;
      const m: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(map)) m[k] = resolveProductLocation(v as any);
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
  // 2026-08-22 · dead code 제거 (availableSnapshots · snapshotPeriods · read 안 됨)
  const [flowPeriodType, setFlowPeriodType] = useState<string | null>(null);
  // 2026-08-31 · #30 root cause · stock_history 최신 스냅샷이 오래됐을 때 (예 · 34일 전) 기본 1개월 조회에 데이터 없음
  //   · 자동 확장 · 요청 기간 rows==0 · 서버 snapshot_date 참고해서 안내
  //   · #69 (ZoneCategoryContent) 와 동일 패턴 · 안내 배너 노출
  const [flowAutoExpanded, setFlowAutoExpanded] = useState<{ requested: number; effective: number; latestSnapshot: string | null } | null>(null);

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
      location: p.location ?? null,
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

  // 2026-08-22 · 패널 폭 조절 · useResizablePanel 프레임워크 훅 재사용 (기존 inline resize 로직 제거)
  const { width: flowPanelWidth, startResize: onFlowResizeStart } = useResizablePanel({
    storageKey: "megatown_stockmanage_flow_w",
    defaultWidth: typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.6) : 800,
    minWidth: 320,
    maxWidth: 1000,
  });

  // 분류 맵 · 공용 훅 (vendorCategoryMap + findVendorByName 함께 사용)
  const { vendorCategoryMap, findVendorByName } = useVendors();

  // 공급사 상세 모달 (우측 패널의 "공급사 조회" 버튼) · 캐시 활용 (inline fetch 제거)
  const [supplierDetailModal, setSupplierDetailModal] = useState<any | null>(null);
  const openSupplierDetailModal = useCallback((supplierName: string) => {
    if (!supplierName) return;
    const found = findVendorByName(supplierName);
    if (found) { setSupplierDetailModal(found); return; }
    showError(`공급사 정보 없음: ${supplierName}`);
  }, [findVendorByName, showError]);

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
      // 2026-08-31 · #30 · buildParams · 자동 확장 시 months 만 바꿔서 재호출
      const buildParams = (m: number) => {
        const p = new URLSearchParams({ sort: serverSort, dir: flowDir, limit: String(flowLimit) });
        if (flowSeason) p.set("season", flowSeason);
        else if (m > 0) p.set("months", String(m));
        else if (flowSnapshot) p.set("snapshot_date", flowSnapshot);
        return p;
      };
      const params = buildParams(flowMonths);
      const cacheKey = params.toString();

      // 캐시 hit → 즉시 표시
      const cached = GLOBAL_FLOW_CACHE.get(cacheKey);
      if (cached && Date.now() - cached.ts < FLOW_CACHE_TTL) {
        const d = cached.data;
        setStockFlow(Array.isArray(d.rows) ? d.rows : []);
        setFlowPeriodType(d.period_type ?? null);
      }

      // 1단계 basic fetch · skip_purchase=1 · 자동 확장 지원
      // 2026-08-31 · #30 root cause · stock_history 스냅샷 stale (예 · 34일 전) → 기본 months=1 = 0 rows
      //   · rows==0 && season 없음 && months>0 && months<12 → 2/3/6/12 자동 확장 · 첫 성공 결과 사용
      const fetchBasic = async (m: number) => {
        const bp = buildParams(m);
        bp.set("skip_purchase", "1");
        return api.get<any>(`/api/stock-manage/top-sales?${bp}`);
      };
      let { data } = await fetchBasic(flowMonths);
      let effectiveMonths: number = flowMonths;
      let effectiveCacheKey = cacheKey;
      const initialRowsCount = Array.isArray(data?.rows) ? data.rows.length : 0;
      if (initialRowsCount === 0 && !flowSeason && flowMonths > 0 && flowMonths < 12) {
        for (const nextM of [2, 3, 6, 12].filter(x => x > flowMonths)) {
          try {
            const resp = await fetchBasic(nextM);
            if (Array.isArray(resp.data?.rows) && resp.data.rows.length > 0) {
              data = resp.data;
              effectiveMonths = nextM;
              effectiveCacheKey = buildParams(nextM).toString();
              break;
            }
          } catch { /* 다음 시도 */ }
        }
      }
      if (data) {
        setStockFlow(Array.isArray(data.rows) ? data.rows : []);
        setFlowPeriodType(data.period_type ?? null);
        if (flowMonths === 0 && !flowSnapshotAutoSet.current && data.snapshot_date) {
          flowSnapshotAutoSet.current = true;
          if (!flowSnapshot) setFlowSnapshot(data.snapshot_date);
        }
        if (effectiveMonths !== flowMonths) {
          setFlowAutoExpanded({ requested: flowMonths, effective: effectiveMonths, latestSnapshot: data.snapshot_date ?? null });
        } else {
          setFlowAutoExpanded(null);
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
            GLOBAL_FLOW_CACHE.set(effectiveCacheKey, { data: fullData, ts: Date.now() });
            setStockFlow(enrichedRows);
          } catch { /* ignore — basic 데이터는 이미 표시됨 */ }
        } else {
          GLOBAL_FLOW_CACHE.set(effectiveCacheKey, { data, ts: Date.now() });
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
    // 2026-08-22 · flowSearch UI 없음 · dead code path 제거 (기존 flowSearch 상태도 삭제)
    // 2026-08-26 · 사용자 지시 · 검색어 (infoSearchQuery) 로 왼쪽 리스트도 필터링
    //   · 상품명·코드·공급사 통합 검색 · 대소문자 무시
    const searchQ = infoSearchQuery.trim().toLowerCase();
    const filtered = stockFlow.filter(p => {
      const qty = p.sale_qty;
      if (minN != null && Number.isFinite(minN) && qty < minN) return false;
      if (maxN != null && Number.isFinite(maxN) && qty > maxN) return false;
      if (flowCategoryFilter !== "전체") {
        const sup = String(p.supplier ?? "").trim();
        if (vendorCategoryMap[sup] !== flowCategoryFilter) return false;
      }
      if (searchQ) {
        const name = String(p.product_name ?? "").toLowerCase();
        const code = String(p.product_code ?? "").toLowerCase();
        const sup  = String(p.supplier ?? "").toLowerCase();
        if (!name.includes(searchQ) && !code.includes(searchQ) && !sup.includes(searchQ)) return false;
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
  }, [stockFlow, salesQtyMin, salesQtyMax, flowSort, flowDir, flowMonths, flowCategoryFilter, vendorCategoryMap, infoSearchQuery]);

  // 3-way tab 카운트
  const getRealMap = useCallback((p: any) => resolveProductLocation(p) ?? productRealMapById[String(p.product_code)] ?? null, [productRealMapById]);
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

      {/* 2026-08-26 · 사용자 지시 · 적정재고 기준 일수 코멘트 */}
      <OptimalStockNoteBanner compact className="self-start" />

      {/* 2026-08-31 · #30 · 자동 확장 안내 배너 · 요청 기간에 데이터 없음 · 확장한 결과 표시 중 */}
      {flowAutoExpanded && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-[13px] self-start">
          <span className="font-bold">데이터 안내</span>
          <span className="text-amber-700">
            최근 {flowAutoExpanded.requested}개월 재고 스냅샷이 없어 <b>{flowAutoExpanded.effective}개월</b>로 자동 확장했습니다
            {flowAutoExpanded.latestSnapshot ? ` · 최신 스냅샷 ${flowAutoExpanded.latestSnapshot}` : ""}
          </span>
        </div>
      )}

      {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · FlowFilterBar */}
      <FlowFilterBar
        filteredFlowCount={filteredFlow.length}
        flowMonths={flowMonths}
        flowSeason={flowSeason}
        flowSnapshot={flowSnapshot}
        flowDateRange={flowDateRange}
        flowLimit={flowLimit}
        flowCategoryFilter={flowCategoryFilter}
        infoSearchQuery={infoSearchQuery}
        infoSearchResults={infoSearchResults}
        infoSelected={infoSelected}
        salesQtyMin={salesQtyMin}
        salesQtyMax={salesQtyMax}
        loading={loading}
        setFlowSeason={setFlowSeason}
        setPendingFlowMonths={setPendingFlowMonths as (v: number) => void}
        setFlowMonths={setFlowMonths as (v: number) => void}
        setFlowLimit={setFlowLimit}
        setInfoSearchQuery={setInfoSearchQuery}
        setInfoSearchResults={setInfoSearchResults}
        setInfoSelected={setInfoSelected}
        runInfoSearch={runInfoSearch}
        loadFlowSelectedProduct={loadFlowSelectedProduct}
        setSalesQtyMin={setSalesQtyMin}
        setSalesQtyMax={setSalesQtyMax}
        onOpenHiddenManagerModal={openHiddenManagerModal}
        setFlowCategoryFilter={setFlowCategoryFilter}
        onFetchStockFlow={fetchStockFlow}
      />

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
                  <Card variant="flat" bg="bg-sky-50" borderColor="border-sky-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mx-1 mb-1 shrink-0">
                    <Spinner size={11} tone="sky" />
                    <span className="text-[14px] font-bold text-sky-700">조건 변경 · 새로 불러오는 중...</span>
                  </Card>
                )}

                {filteredFlow.length === 0 ? (
                  loading ? (
                    <LoadingState tone="slate" size="compact" label="데이터 로딩중..." />
                  ) : (
                    <EmptyState
                      icon={Boxes}
                      title={stockFlow.length === 0 ? "재고 데이터 없음" : "해당 상품 없음"}
                      hint={stockFlow.length === 0
                        ? "최근 12개월 재고 스냅샷 (stock_history) 이 없습니다. 재고관리 화면에서 새 스냅샷을 임포트해 주세요."
                        : "선택한 판매수량 범위 · 검색어 · 분류 필터에 해당하는 상품 없음"}
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
                                  {flowBulkHiding ? <Spinner size={11} tone="white" /> : <EyeOff size={11} />}
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
                        {/* 2026-08-24 · 사용자 지시 · 카테고리 그룹 헤더 (재고현황·매입현황·판매현황) 제거 · 서브헤더만 표시 */}
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
                        {/* 2026-08-22 · Framework Phase 4 · FlowRow 별도 컴포넌트 이관 */}
                        {filteredFlow.map((p, i) => (
                          <FlowRow
                            key={`flow-${p.product_code}-${i}`}
                            p={p}
                            i={i}
                            selectedFlowCodes={selectedFlowCodes}
                            toggleSelectFlow={toggleSelectFlow}
                            loadFlowSelectedProduct={loadFlowSelectedProduct}
                            vendorCategoryMap={vendorCategoryMap}
                            isFlowGroupCollapsed={isFlowGroupCollapsed}
                          />
                        ))}
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

      {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · SupplierDetailModal · HiddenManagerModal */}
      <SupplierDetailModalWrapper
        vendor={supplierDetailModal}
        onClose={() => setSupplierDetailModal(null)}
      />
      <HiddenManagerModal
        open={hiddenModalOpen}
        onClose={() => setHiddenModalOpen(false)}
        hiddenList={hiddenList}
        hiddenLoading={hiddenLoading}
        hiddenUnhideBusyCode={hiddenUnhideBusyCode}
        loadHiddenList={loadHiddenList}
        onUnhideProduct={unhideProduct}
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

export default FlowTab;
