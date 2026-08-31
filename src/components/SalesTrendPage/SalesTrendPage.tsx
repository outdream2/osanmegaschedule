// 2026-08-22 · Framework Phase 4 · 서브컴포넌트 6개 분리 · 2502 → 슬림
import React, { useCallback, useEffect, useRef, useState } from "react";
import { TrendingUp, Building2, Activity, Package, Eye, EyeOff } from "lucide-react";
import { Modal } from "../common/Modal";
import { Spinner } from "../common/Spinner";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { getProductsMap, lookupProduct, type ProductInfo } from "../../lib/productsCache";
// 2026-08-31 · #13 · location 우선 · real_map fallback
import { resolveProductLocation } from "../../lib/productLocation";
import { useHiddenManager } from "../../hooks/useHiddenManager";
import { useProductInfoSearch } from "../../hooks/useProductInfoSearch";
import { api } from "../../lib/apiClient";
// 2026-08-22 · Framework Phase 4 · types + helpers 별도 파일 이관
import type { PeriodRow, ChartSeries, LineChartProps } from "./SalesTrendPage.helpers";
import {
  ZONE_CATEGORY_MAP, zoneCategoryLabel,
  fmt, extractMonthDay, periodLabel, niceScale,
} from "./SalesTrendPage.helpers";
// 기존 export 하위 호환 (외부 import 없음 확인 · 안전용 re-export)
export { periodLabel };
export type { PeriodRow };
// 2026-08-22 · Phase 4 · 분리된 서브컴포넌트
import { generatePeriods, fillPeriodsWithRows, aggregateToMonths } from "./SalesTrendPage.helpers";
export { fillPeriodsWithRows, aggregateToMonths };
export { MultiLineChart, MultiLineChartInner } from "./MultiLineChart";
export { StockFlowPanel, calcLoss } from "./StockFlowPanel";
export type { StockFlowRow } from "./StockFlowPanel";
export { CategoryTab } from "./ZoneCategoryContent";
export { LossTrackerTab } from "./LossTrackerTab";
import ProductTrendTab from "./ProductTrendTab";
import SupplierTrendTab from "./SupplierTrendTab";

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export const SalesTrendPage: React.FC = () => {
  type SalesTab = "chart" | "supplier";
  const [salesTab, setSalesTab] = useState<SalesTab>("chart");
  const tab: "product" | "supplier" = salesTab === "supplier" ? "supplier" : "product";
  const setTab = (t: "product" | "supplier") => setSalesTab(t === "supplier" ? "supplier" : "chart");
  const [granularity, setGranularity] = useState<"10day" | "month">("10day");
  const [chartMonths, setChartMonths] = useState<1 | 2 | 3 | 4 | 5 | 6>(3);
  const chartRangeDays = chartMonths * 30;

  // 정보확인 검색
  const _pis = useProductInfoSearch();
  const infoSearchQuery = _pis.query;
  const setInfoSearchQuery = _pis.setQuery;
  const infoSearchResults = _pis.results;
  const setInfoSearchResults = _pis.setResults;
  const infoSelected = _pis.selected;
  const setInfoSelected = _pis.setSelected;
  const runInfoSearch = _pis.runSearch;

  const [scanProductModal, setScanProductModal] = useState<ProductInfo | null>(null);
  const openScanProductModal = useCallback(async (p: any) => {
    const code = String(p.product_code ?? p.code ?? "").trim();
    const partial: ProductInfo = {
      code,
      name: String(p.product_name ?? p.name ?? ""),
      spec: String(p.spec ?? ""),
      current_stock: p.current_stock ?? null,
      optimal_stock: p.optimal_stock ?? null,
      supplier: p.supplier ?? null,
      real_map: p.real_map ?? null,
      warehouse_stock: p.warehouse_stock ?? null,
      store_stock: p.store_stock ?? null,
    };
    setScanProductModal(partial);
    try {
      let full = lookupProduct(code);
      if (!full) {
        const map = await getProductsMap();
        full = map[code] ?? map[code.replace(/^0+/, "")] ?? null;
      }
      if (full) {
        setScanProductModal(prev => {
          if (!prev || prev.code !== code) return prev;
          const overlay: Record<string, any> = {};
          for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) overlay[k] = v;
          return { ...full, ...overlay, code, name: full.name || prev.name };
        });
      }
    } catch { /* 캐시 실패 시 partial 만 유지 */ }
  }, []);

  const openProductInfoModal = useCallback(async () => {
    let target = infoSelected;
    if (!target && infoSearchResults.length > 0) target = infoSearchResults[0];
    if (!target && infoSearchQuery.trim()) {
      try {
        const { data: list } = await api.get<any>(`/api/products-search?q=${encodeURIComponent(infoSearchQuery.trim())}`);
        if (Array.isArray(list) && list.length > 0) {
          target = list[0];
          setInfoSelected(list[0]);
          setInfoSearchResults([]);
        }
      } catch { /* ignore */ }
    }
    if (!target) return;
    openScanProductModal(target);
  }, [infoSelected, infoSearchResults, infoSearchQuery, openScanProductModal]);

  // 공급사별 탭 · 좌우 분할 레이아웃 state
  const [supplierPanelWidth, setSupplierPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_salestrend_supplier_w")); return Number.isFinite(v) && v > 0 ? v : 560; } catch { return 560; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_salestrend_supplier_w", String(supplierPanelWidth)); } catch { /**/ } }, [supplierPanelWidth]);
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
  const [supplierSelectedProduct, setSupplierSelectedProduct] = useState<ProductInfo | null>(null);
  const loadSupplierSelectedProduct = useCallback(async (p: any) => {
    const code = String(p.product_code ?? p.code ?? "").trim();
    const partial: ProductInfo = { code, name: String(p.product_name ?? p.name ?? ""), spec: String(p.spec ?? ""), current_stock: p.current_stock ?? null, optimal_stock: p.optimal_stock ?? null, supplier: p.supplier ?? null, real_map: p.real_map ?? null };
    setSupplierSelectedProduct(partial);
    try {
      let full = lookupProduct(code);
      if (!full) { const map = await getProductsMap(); full = map[code] ?? map[code.replace(/^0+/, "")] ?? null; }
      if (full) setSupplierSelectedProduct(prev => { if (!prev || prev.code !== code) return prev; const o: Record<string, any> = {}; for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) o[k] = v; return { ...full, ...o, code, name: full.name || prev.name }; });
    } catch { /**/ }
  }, []);

  // 숨김 관리
  const _hm = useHiddenManager();
  const hiddenModalOpen = _hm.modalOpen;
  const setHiddenModalOpen = _hm.setModalOpen;
  const hiddenList = _hm.list;
  const hiddenLoading = _hm.loading;
  const hiddenUnhideBusyCode = _hm.unhideBusyCode;
  const loadHiddenList = _hm.load;
  const openHiddenManagerModal = _hm.open;
  const unhideProduct = _hm.unhide;

  return (
    <div className="flex-1 flex flex-col max-w-[1360px] mx-auto w-full px-3 sm:px-6 py-2 sm:py-4 gap-3">
      {/* 페이지 제목 */}
      <div className="flex items-center gap-2 min-w-0">
        <TrendingUp size={18} className="text-teal-600 shrink-0" />
        <h2 className="text-lg font-bold text-zinc-800">판매추이</h2>
        <span className="text-[11px] font-semibold text-zinc-400 hidden md:inline">10일 스냅샷</span>
      </div>

      {/* 탭 바 */}
      <div className="flex flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-x-0 sm:gap-1 border-b border-line sm:overflow-x-auto sm:scrollbar-none">
        {([
          { k: "chart" as SalesTab, label: "판매추이차트", icon: Activity, color: "amber" },
          { k: "supplier" as SalesTab, label: "공급사별판매", icon: Building2, color: "sky" },
        ]).map(t => {
          const Icon = t.icon;
          const active = salesTab === t.k;
          const activeText = { sky: "text-sky-700", amber: "text-amber-700" }[t.color]!;
          const activeBar = { sky: "bg-sky-500", amber: "bg-amber-500" }[t.color]!;
          return (
            <button key={t.k} onClick={() => setSalesTab(t.k)}
              className={`relative basis-1/3 sm:basis-auto flex-grow-0 flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-2 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-[13px] font-bold leading-tight transition-colors duration-150 ${active ? activeText : "text-zinc-400 hover:text-zinc-700"}`}>
              <Icon size={13} strokeWidth={active ? 2.4 : 1.8} className="hidden sm:inline-block shrink-0" />
              <span>{t.label}</span>
              {active && <span className={`absolute left-0 right-0 -bottom-px h-[2px] ${activeBar} rounded-t-sm`} />}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {salesTab === "chart" && (
          <ProductTrendTab
            granularity={granularity}
            chartRangeDays={chartRangeDays}
            onChartMonthsChange={setChartMonths}
            onGranularityChange={setGranularity}
            activeTab={"product"}
            onTabChange={setTab}
            onOpenProductInfo={openScanProductModal}
            onOpenHiddenManager={openHiddenManagerModal}
          />
        )}

        {/* 공급사별 판매 · 좌우 분할 */}
        {salesTab === "supplier" && (
          <div className="flex flex-col lg:flex-row gap-2 items-stretch lg:min-h-[720px]">
            <div
              className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
              style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? supplierPanelWidth : undefined }}
            >
              <SupplierTrendTab
                granularity={granularity}
                chartRangeDays={chartRangeDays}
                activeTab={"supplier"}
                onTabChange={setTab}
                onProductClick={loadSupplierSelectedProduct}
              />
            </div>
            <div onMouseDown={onSupplierResizeStart}
              className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-sky-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
              title="드래그하여 폭 조절">
              <span className="text-[9px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
            </div>
            <ProductDetailRightPanel
              selected={supplierSelectedProduct}
              onClose={() => setSupplierSelectedProduct(null)}
              onProductUpdate={(u) => setSupplierSelectedProduct(prev => prev ? { ...prev, ...u } : prev)}
              onRealMapUpdate={(v) => setSupplierSelectedProduct(prev => prev ? { ...prev, real_map: v } : prev)}
              showChart={true}
              context="stock-manage"
              editable={true}
              emptySub="상세 정보가 표시됩니다"
            />
          </div>
        )}
      </div>

      {/* 정보확인 모달 */}
      <Modal
        open={!!scanProductModal}
        onClose={() => setScanProductModal(null)}
        size="md"
        titleAccent
        icon={<div className="w-10 h-10 rounded-xl bg-brand-deep flex items-center justify-center shadow-sm"><Package size={18} className="text-white" /></div>}
        title={
          scanProductModal ? (
            <div className="min-w-0">
              <div className="text-[17px] font-bold text-ink tracking-tight truncate">{scanProductModal.name}</div>
              <div className="text-[13px] tabular-nums text-ink-soft mt-0.5">#{scanProductModal.code}</div>
            </div>
          ) : null
        }
        backdropIntensity="brand"
      >
        {scanProductModal && (
          <div className="-mx-5 -my-5 p-4 bg-zinc-50">
            <ProductInfoCard
              product={scanProductModal}
              context="stock-manage"
              editable
              onRealMapUpdate={(v) => setScanProductModal(prev => prev ? { ...prev, real_map: v } : prev)}
              onProductUpdate={(u) => setScanProductModal(prev => prev ? { ...prev, ...u } : prev)}
            />
          </div>
        )}
      </Modal>

      {/* 숨김 항목 관리 모달 */}
      <Modal
        open={hiddenModalOpen}
        onClose={() => setHiddenModalOpen(false)}
        size="md"
        titleAccent
        icon={<div className="w-10 h-10 rounded-xl bg-brand-deep flex items-center justify-center shadow-sm"><EyeOff size={18} className="text-white" /></div>}
        title={
          <div className="min-w-0">
            <div className="text-[17px] font-bold text-ink tracking-tight">숨김 항목 관리</div>
            <div className="text-[13px] font-medium text-ink-soft mt-0.5">숨김 처리된 상품 · 검색·발주 리스트에서 노출되지 않음</div>
          </div>
        }
        backdropIntensity="brand"
      >
        <div className="-mx-5 -my-5 flex flex-col">
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-zinc-100 bg-white">
            <span className="text-[11px] font-bold text-zinc-500">
              총 <span className="text-amber-700 font-bold">{hiddenList.length}</span>개 숨김
            </span>
            <button onClick={loadHiddenList} disabled={hiddenLoading}
              className="text-[10px] font-bold text-zinc-500 hover:text-zinc-800 border border-line hover:border-zinc-400 rounded-lg px-2 py-1 cursor-pointer transition">
              {hiddenLoading ? "..." : "새로고침"}
            </button>
          </div>
          <div className="bg-zinc-50 min-h-[200px]">
            {hiddenLoading ? (
              <div className="flex items-center justify-center py-12"><Spinner size={14} tone="zinc" label="불러오는 중..." labelSize={14} /></div>
            ) : hiddenList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-2">
                <EyeOff size={28} className="opacity-40" />
                <div className="text-sm font-bold">숨김 처리된 상품이 없습니다</div>
                <div className="text-[11px]">정보확인 창에서 "숨기기"로 항목 추가 가능</div>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100 bg-white">
                {hiddenList.map((p) => {
                  const code = String(p.product_code ?? "");
                  const busy = hiddenUnhideBusyCode === code;
                  return (
                    <li key={`st-hidden-${code}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-amber-50/30 transition">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-zinc-800 truncate" title={p.product_name}>{p.product_name}</div>
                        <div className="text-[10px] tabular-nums text-zinc-400 truncate">
                          #{code}
                          {p.supplier ? ` · ${p.supplier}` : ""}
                          {/* 2026-08-31 · #13 · location 우선 · real_map fallback */}
                          {resolveProductLocation(p) ? ` · ${resolveProductLocation(p)}` : ""}
                          {p.current_stock != null ? ` · 재고 ${p.current_stock}` : ""}
                        </div>
                      </div>
                      <button onClick={() => unhideProduct(code)} disabled={busy}
                        className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-wait rounded-lg px-2.5 py-1.5 cursor-pointer transition"
                        title="숨김 해제 · 다시 검색·발주 리스트에 표시">
                        {busy ? <Spinner size={11} tone="emerald" /> : <Eye size={11} />}
                        다시 표시
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SalesTrendPage;
