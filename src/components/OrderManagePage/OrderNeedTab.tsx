// src/components/OrderManagePage/OrderNeedTab.tsx
// 2026-08-22 · Framework Phase 4 · 발주필요 탭 분리
import React from "react";
import { ClipboardList, ChevronRight, ChevronDown, RotateCcw, X } from "lucide-react";
import { Card } from "../common/Card";
import { PageToolbar } from "../common/PageToolbar";
import { SearchBar } from "../common/SearchBar";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { LoadingState } from "../common/LoadingState";
import { CARD_BASE } from "../../styles/tokens";
import { stripVendorAnnotation } from "../../utils/vendorNameNormalize";
import type { ProductInfo, OrderNeedShortageBasis, OrderNeedDefaultSortKey, OrderNeedFilterConfig } from "./OrderManagePage.types";
import { ORDER_NEED_CONFIG_KEY, DEFAULT_ORDER_NEED_CONFIG } from "./OrderManagePage.utils";
import type { ProductInfo as ProductInfoType } from "../../lib/productsCache";

type NeedSortKey = "supplier" | "contact" | "name" | "current" | "inv" | "optimal" | "short" | "sale_month";
type NeedCategoryFilter = string;

interface InvStockEntry {
  warehouse: number | null; store: number | null; total: number;
  w1: number | null; w2: number | null;
  s1: number | null; s2: number | null; s3: number | null;
  s1z: string | null; s2z: string | null; s3z: string | null;
}

interface OrderNeedTabProps {
  // 데이터
  lowStockFiltered: ProductInfo[];
  productsLoading: boolean;
  invStockMap: Map<string, InvStockEntry>;
  requestedCodes: Set<string>;
  requestingOrder: Set<string>;
  selectedLowStock: Set<string>;
  bulkRequesting: boolean;
  needExtraMap: Map<string, { saleMonth: number | null; saleQuarter: number | null }>;
  dbVendorCategories: string[];
  // 검색·필터 상태
  lowStockSearch: string;
  setLowStockSearch: (v: string) => void;
  needCategoryFilter: NeedCategoryFilter;
  setNeedCategoryFilter: (v: string) => void;
  needSortKey: NeedSortKey;
  needSortDir: "asc" | "desc";
  handleNeedSort: (k: NeedSortKey) => void;
  needArrow: (k: NeedSortKey) => string;
  // 접기/펼치기
  isNeedCollapsed: (g: string) => boolean;
  toggleNeedGroup: (g: string) => void;
  lowStockCollapsed: boolean;
  // 인라인 필터
  needSalesMonthEnabled: boolean;
  setNeedSalesMonthEnabled: (v: boolean) => void;
  needSalesQuarterEnabled: boolean;
  setNeedSalesQuarterEnabled: (v: boolean) => void;
  needInlineMaxSalesMonth: number;
  needInlineMaxSalesQuarter: number;
  updateInline: (field: "current" | "salesMonth" | "salesQuarter", raw: string) => void;
  inlineFiltering: boolean;
  inlineActive: boolean;
  deferredCurrentEnabled: boolean;
  deferredInlineCurrent: number;
  deferredSalesMonthEnabled: boolean;
  deferredInlineSalesMonth: number;
  deferredSalesQuarterEnabled: boolean;
  deferredInlineSalesQuarter: number;
  resetInlineFilter: () => void;
  // 고급설정
  needAdvancedOpen: boolean;
  setNeedAdvancedOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  orderNeedConfig: OrderNeedFilterConfig;
  setOrderNeedConfig: (v: OrderNeedFilterConfig) => void;
  setNeedSortKey: (v: NeedSortKey) => void;
  setNeedSortDir: (v: "asc" | "desc") => void;
  // 패널
  needPanelWidth: number;
  onNeedResizeStart: (e: React.MouseEvent) => void;
  needPanelProduct: { code: string; name: string } | null;
  needPanelFull: Record<string, any> | null;
  needPanelLoading: boolean;
  needPanelError: string | null;
  setNeedPanelProduct: (v: { code: string; name: string } | null) => void;
  setNeedPanelFull: (fn: (prev: Record<string, any> | null) => Record<string, any> | null) => void;
  // 액션
  openSupplierInfo: (name: string | null | undefined) => void;
  getVendorCategory: (name: string) => string | null;
  findVendor: (name: string | null | undefined) => { contact_name: string | null; phone: string | null; email: string | null } | undefined;
  getCode: (p: ProductInfo) => string;
  getName: (p: ProductInfo) => string;
  toggleLowStockOne: (code: string) => void;
  clearLowStockSelection: () => void;
  setSelectedLowStock: (fn: (prev: Set<string>) => Set<string>) => void;
  bulkRequestOrder: () => void;
  handleRequestOrder: (p: ProductInfo) => Promise<void>;
}

export const OrderNeedTab: React.FC<OrderNeedTabProps> = ({
  lowStockFiltered, productsLoading, invStockMap, requestedCodes, requestingOrder,
  selectedLowStock, bulkRequesting, needExtraMap, dbVendorCategories,
  lowStockSearch, setLowStockSearch, needCategoryFilter, setNeedCategoryFilter,
  needSortKey, needSortDir, handleNeedSort, needArrow,
  isNeedCollapsed, toggleNeedGroup, lowStockCollapsed,
  needSalesMonthEnabled, setNeedSalesMonthEnabled, needSalesQuarterEnabled, setNeedSalesQuarterEnabled,
  needInlineMaxSalesMonth, needInlineMaxSalesQuarter, updateInline,
  inlineFiltering, inlineActive,
  deferredCurrentEnabled, deferredInlineCurrent,
  deferredSalesMonthEnabled, deferredInlineSalesMonth,
  deferredSalesQuarterEnabled, deferredInlineSalesQuarter,
  resetInlineFilter,
  needAdvancedOpen, setNeedAdvancedOpen, orderNeedConfig, setOrderNeedConfig,
  setNeedSortKey, setNeedSortDir,
  needPanelWidth, onNeedResizeStart,
  needPanelProduct, needPanelFull, needPanelLoading, needPanelError,
  setNeedPanelProduct, setNeedPanelFull,
  openSupplierInfo, getVendorCategory, findVendor,
  getCode, getName,
  toggleLowStockOne, clearLowStockSelection, setSelectedLowStock, bulkRequestOrder,
  handleRequestOrder,
}) => (
  <div className="flex flex-col gap-2">
    {/* 상단 툴바 */}
    <PageToolbar
      icon={<ClipboardList size={18} strokeWidth={2.2} />}
      title="발주 필요"
      count={lowStockFiltered.length}
      leftSlot={
        <span className="text-[13px] text-ink-soft font-medium tracking-tight">현재고 &lt; 적정재고</span>
      }
    />

    {/* 통합 조건 카드 */}
    <div className="bg-white rounded-xl border border-line shadow-sm overflow-hidden">

      {/* Row 1: 검색 + 초기화 */}
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line">
        <SearchBar
          value={lowStockSearch}
          onChange={setLowStockSearch}
          placeholder="상품·코드·공급사 검색 (한글 초성 · 예: ㅇㅅㅌ)"
          resultCount={lowStockFiltered.length}
          resultUnit="건"
          historyKey="megatown_orderNeed_search_history"
          accent="rose"
          widthClass="w-64 sm:w-80"
        />
        {lowStockSearch.trim() && (
          <button
            type="button"
            onClick={() => setLowStockSearch("")}
            className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-line bg-white hover:bg-zinc-50 text-[15px] font-bold text-zinc-500 hover:text-rose-600 transition cursor-pointer"
            title="검색 초기화"
          >
            <RotateCcw size={11} />초기화
          </button>
        )}
      </div>

      {/* Row 2: 카테고리 + 발주조건 */}
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-zinc-50/40">
        <CategoryChips
          label="분류"
          value={needCategoryFilter}
          onChange={(v) => setNeedCategoryFilter(String(v))}
          size="sm"
          ariaLabel="공급사 카테고리 필터"
          options={(["all", ...dbVendorCategories] as string[]).map(cat => ({
            value: cat,
            label: cat === "all" ? "전체" : cat,
            tone: (cat === "all"    ? "zinc"
                 : cat === "위탁"   ? "violet"
                 : cat === "선결제" ? "rose"
                 : cat === "60회전" ? "emerald"
                 : cat === "90회전" ? "teal"
                 : "zinc") as ChipTone,
            title: `${cat === "all" ? "전체" : cat} 카테고리만 표시`,
          }))}
        />

        <div className="flex items-center gap-2 flex-nowrap shrink-0">
          <span className="text-[14px] font-semibold tracking-tight text-zinc-700 whitespace-nowrap">발주 조건</span>
          {/* 조건 1 · 최근 한달 판매량 */}
          <label className="inline-flex items-center gap-1 shrink-0">
            <input type="checkbox" checked={needSalesMonthEnabled} onChange={e => setNeedSalesMonthEnabled(e.target.checked)}
              className="w-3.5 h-3.5 text-emerald-600 rounded border-zinc-300 focus:ring-brand-tint cursor-pointer" />
            <span className={`text-[14px] font-medium whitespace-nowrap ${needSalesMonthEnabled ? "text-zinc-700" : "text-zinc-400"}`}>1M판매</span>
            <input
              type="number" min={0} step={1}
              disabled={!needSalesMonthEnabled}
              value={needInlineMaxSalesMonth === 0 ? "" : needInlineMaxSalesMonth}
              onChange={e => updateInline("salesMonth", e.target.value)}
              placeholder="50"
              className="w-12 h-7 px-1.5 rounded-md border border-line text-[14px] font-bold text-zinc-800 text-right tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep hover:border-zinc-300 transition placeholder:text-zinc-300 disabled:bg-zinc-50 disabled:opacity-50"
            />
            <span className={`text-[15px] whitespace-nowrap ${needSalesMonthEnabled ? "text-zinc-500" : "text-zinc-300"}`}>개↓</span>
          </label>
          {/* 조건 3 · 최근 3달 판매량 */}
          <label className="inline-flex items-center gap-1 shrink-0">
            <input type="checkbox" checked={needSalesQuarterEnabled} onChange={e => setNeedSalesQuarterEnabled(e.target.checked)}
              className="w-3.5 h-3.5 text-emerald-600 rounded border-zinc-300 focus:ring-brand-tint cursor-pointer" />
            <span className={`text-[14px] font-medium whitespace-nowrap ${needSalesQuarterEnabled ? "text-zinc-700" : "text-zinc-400"}`}>3M판매</span>
            <input
              type="number" min={0} step={1}
              disabled={!needSalesQuarterEnabled}
              value={needInlineMaxSalesQuarter === 0 ? "" : needInlineMaxSalesQuarter}
              onChange={e => updateInline("salesQuarter", e.target.value)}
              placeholder="100"
              className="w-12 h-7 px-1.5 rounded-md border border-line text-[14px] font-bold text-zinc-800 text-right tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep hover:border-zinc-300 transition placeholder:text-zinc-300 disabled:bg-zinc-50 disabled:opacity-50"
            />
            <span className={`text-[15px] whitespace-nowrap ${needSalesQuarterEnabled ? "text-zinc-500" : "text-zinc-300"}`}>개↓</span>
          </label>
        </div>

        {inlineFiltering && (
          <StatusPill tone="emerald" size="md" dot pulse>
            <Spinner size={12} tone="emerald" className="inline mr-1" />조회중
          </StatusPill>
        )}

        {inlineActive && (
          <button
            type="button"
            onClick={resetInlineFilter}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-line bg-white hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 text-[15px] font-bold text-zinc-500 transition cursor-pointer shrink-0"
            title="발주 조건 모두 초기화"
          >
            <X size={11} />초기화
          </button>
        )}

        {inlineActive && (
          <div className="hidden sm:flex items-center gap-1.5 ml-1 flex-wrap">
            {deferredCurrentEnabled && deferredInlineCurrent > 0 && (
              <StatusPill tone="amber" size="md">재고 ≤{deferredInlineCurrent}개</StatusPill>
            )}
            {deferredSalesMonthEnabled && deferredInlineSalesMonth > 0 && (
              <StatusPill tone="sky" size="md">한달 판매 ≤{deferredInlineSalesMonth}개</StatusPill>
            )}
            {deferredSalesQuarterEnabled && deferredInlineSalesQuarter > 0 && (
              <StatusPill tone="indigo" size="md">3달 판매 ≤{deferredInlineSalesQuarter}개</StatusPill>
            )}
          </div>
        )}
      </div>

      {/* Row 4: 발주판정 고급설정 */}
      <div>
        <button
          type="button"
          onClick={() => setNeedAdvancedOpen(o => !o)}
          className="w-full px-4 py-2 flex items-center gap-2 cursor-pointer select-none bg-zinc-50/60 hover:bg-zinc-50 transition text-left"
        >
          <ChevronRight size={13} className={`text-zinc-400 shrink-0 transition-transform ${needAdvancedOpen ? "rotate-90" : ""}`} />
          <span className="text-[14px] font-bold uppercase tracking-wider text-zinc-400">발주판정 고급설정</span>
          <span className="ml-1 text-[14px] text-zinc-400 hidden sm:inline">
            {orderNeedConfig.shortageBasis === "min" && "최소재고 기준"}
            {orderNeedConfig.shortageBasis === "realStock" && "실재고 기준"}
            {orderNeedConfig.shortageBasis === "optimal" && "추천적정재고 기준"}
            {orderNeedConfig.minShortage > 1 && ` · 부족 ${orderNeedConfig.minShortage}개+`}
            {!orderNeedConfig.includeMissingRealStock && " · 실재고 있는 것만"}
            {orderNeedConfig.minMonthlySales > 0 && ` · 한달판매 ≥${orderNeedConfig.minMonthlySales}개`}
          </span>
        </button>

        {needAdvancedOpen && (
          <div className="px-4 pb-4 pt-3 flex flex-col gap-4 border-t border-zinc-100 bg-zinc-50/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 재고 부족 기준 */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[15px] font-bold text-zinc-600 uppercase tracking-wider">재고 부족 기준</span>
                <div className="flex flex-col gap-1">
                  {([
                    { k: "optimal"   as OrderNeedShortageBasis, label: "현재고 < 추천적정재고", sub: "기본 · 권장" },
                    { k: "min"       as OrderNeedShortageBasis, label: "현재고 < 최소재고",     sub: "min_stock 컬럼 기준" },
                    { k: "realStock" as OrderNeedShortageBasis, label: "실재고 < 추천적정재고", sub: "실재고 없는 상품 제외" },
                  ]).map(opt => (
                    <label
                      key={opt.k}
                      className={["flex items-start gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition",
                        orderNeedConfig.shortageBasis === opt.k
                          ? "bg-indigo-50 border-indigo-300"
                          : "bg-white border-line hover:border-zinc-300 hover:bg-zinc-50",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="shortageBasisInline"
                        className="mt-0.5 accent-indigo-600 cursor-pointer shrink-0"
                        checked={orderNeedConfig.shortageBasis === opt.k}
                        onChange={() => {
                          const next = { ...orderNeedConfig, shortageBasis: opt.k };
                          setOrderNeedConfig(next);
                          try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                        }}
                      />
                      <div className="flex flex-col leading-tight">
                        <span className="text-[14px] font-bold text-zinc-800">{opt.label}</span>
                        <span className="text-[15px] text-zinc-500">{opt.sub}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* 우측 나머지 설정 */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[15px] font-bold text-zinc-600 uppercase tracking-wider">실재고 미입력 상품</span>
                  <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-line hover:bg-zinc-50 cursor-pointer bg-white">
                    <input
                      type="checkbox"
                      className="accent-indigo-600 cursor-pointer"
                      checked={orderNeedConfig.includeMissingRealStock}
                      onChange={e => {
                        const next = { ...orderNeedConfig, includeMissingRealStock: e.target.checked };
                        setOrderNeedConfig(next);
                        try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                      }}
                    />
                    <span className="text-[14px] font-bold text-zinc-800">실재고 미입력도 포함</span>
                  </label>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[15px] font-bold text-zinc-600 uppercase tracking-wider">최소 부족 개수</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={1} step={1}
                      value={orderNeedConfig.minShortage}
                      onChange={e => {
                        const v = Number(e.target.value);
                        const next = { ...orderNeedConfig, minShortage: Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1 };
                        setOrderNeedConfig(next);
                        try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                      }}
                      className="w-20 h-8 px-2 border border-line rounded-lg text-[15px] font-bold text-zinc-800 tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep bg-white"
                    />
                    <span className="text-[14px] text-zinc-600">개 이상 부족</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[15px] font-bold text-zinc-600 uppercase tracking-wider">한달 판매량 최소</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0} step={1}
                      value={orderNeedConfig.minMonthlySales}
                      onChange={e => {
                        const v = Number(e.target.value);
                        const next = { ...orderNeedConfig, minMonthlySales: Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0 };
                        setOrderNeedConfig(next);
                        try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                      }}
                      className="w-20 h-8 px-2 border border-line rounded-lg text-[15px] font-bold text-zinc-800 tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep bg-white"
                    />
                    <span className="text-[14px] text-zinc-600">개 이상 · 0=미적용</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 기본 정렬 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[15px] font-bold text-zinc-600 uppercase tracking-wider">기본 정렬</span>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { k: "sale_month" as OrderNeedDefaultSortKey, label: "한달 판매량" },
                  { k: "short"      as OrderNeedDefaultSortKey, label: "부족량" },
                  { k: "current"    as OrderNeedDefaultSortKey, label: "ERP재고" },
                  { k: "optimal"    as OrderNeedDefaultSortKey, label: "추천적정" },
                  { k: "inv"        as OrderNeedDefaultSortKey, label: "실재고" },
                  { k: "name"       as OrderNeedDefaultSortKey, label: "상품명" },
                  { k: "supplier"   as OrderNeedDefaultSortKey, label: "공급사" },
                ]).map(opt => (
                  <button
                    key={opt.k}
                    type="button"
                    onClick={() => {
                      const next = { ...orderNeedConfig, defaultSortKey: opt.k };
                      setOrderNeedConfig(next);
                      setNeedSortKey(opt.k as NeedSortKey);
                      try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                    }}
                    className={["px-2.5 h-7 rounded-md text-[14px] font-bold border transition cursor-pointer",
                      orderNeedConfig.defaultSortKey === opt.k
                        ? "bg-brand-deep text-white border-indigo-600 shadow-sm"
                        : "bg-white text-zinc-600 border-line hover:border-indigo-300 hover:text-indigo-600",
                    ].join(" ")}
                  >{opt.label}</button>
                ))}
                {([
                  { k: "desc" as const, label: "내림차순" },
                  { k: "asc"  as const, label: "오름차순" },
                ]).map(opt => (
                  <button
                    key={opt.k}
                    type="button"
                    onClick={() => {
                      const next = { ...orderNeedConfig, defaultSortDir: opt.k };
                      setOrderNeedConfig(next);
                      setNeedSortDir(opt.k);
                      try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                    }}
                    className={["px-2.5 h-7 rounded-md text-[14px] font-bold border transition cursor-pointer",
                      orderNeedConfig.defaultSortDir === opt.k
                        ? "bg-zinc-700 text-white border-zinc-700 shadow-sm"
                        : "bg-white text-zinc-500 border-line hover:border-zinc-400 hover:text-zinc-700",
                    ].join(" ")}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            {/* 카테고리 초기값 + 전체 초기화 */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[15px] font-bold text-zinc-600 uppercase tracking-wider">카테고리 초기값</span>
                <div className="flex flex-wrap gap-1">
                  {(["all", ...dbVendorCategories] as string[]).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        const next = { ...orderNeedConfig, defaultCategory: cat };
                        setOrderNeedConfig(next);
                        setNeedCategoryFilter(cat);
                        try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                      }}
                      className={["px-2.5 h-7 rounded-md text-[14px] font-bold border transition cursor-pointer",
                        orderNeedConfig.defaultCategory === cat
                          ? "bg-brand-deep text-white border-indigo-600 shadow-sm"
                          : "bg-white text-zinc-600 border-line hover:border-indigo-300 hover:text-indigo-600",
                      ].join(" ")}
                    >{cat === "all" ? "전체" : cat}</button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOrderNeedConfig(DEFAULT_ORDER_NEED_CONFIG);
                  setNeedCategoryFilter(DEFAULT_ORDER_NEED_CONFIG.defaultCategory);
                  setNeedSortKey(DEFAULT_ORDER_NEED_CONFIG.defaultSortKey as NeedSortKey);
                  setNeedSortDir(DEFAULT_ORDER_NEED_CONFIG.defaultSortDir);
                  try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(DEFAULT_ORDER_NEED_CONFIG)); } catch { /**/ }
                }}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border border-zinc-300 bg-white text-[15px] font-bold text-zinc-600 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition cursor-pointer shrink-0"
                title="발주판정 설정 기본값으로 초기화"
              >
                <RotateCcw size={11} />기본값
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* 하단 split · 좌우 분할 */}
    <div className="flex flex-col lg:flex-row gap-2 items-stretch lg:min-h-[720px]">
      {/* 좌측: 발주필요 리스트 */}
      <div
        className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
        style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? needPanelWidth : undefined }}
      >
        <section className="bg-white rounded-xl border border-line p-4 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
          {!lowStockCollapsed && (<>
            {productsLoading && lowStockFiltered.length > 0 && (
              <Card variant="flat" bg="bg-sky-50" borderColor="border-sky-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mx-3 mb-1 shrink-0">
                <Spinner size={11} tone="sky" label="조건 변경 · 새로 불러오는 중..." labelSize={14} />
              </Card>
            )}
            {productsLoading && lowStockFiltered.length === 0 ? (
              <div className="flex items-center justify-center py-8"><Spinner tone="zinc" label="로딩 중..." labelSize={12} /></div>
            ) : lowStockFiltered.length === 0 ? (
              <div className="text-center text-[15px] text-zinc-300 py-6">발주 필요 상품 없음</div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="inline-block w-1 h-3.5 rounded-full bg-rose-500 shrink-0"></span>
                  <span className="text-[15px] font-bold text-rose-600">발주필요 리스트</span>
                  <span className="text-[15px] text-zinc-400 font-normal">{lowStockFiltered.length}건</span>
                  {selectedLowStock.size > 0 && (
                    <span className="inline-flex items-center gap-1 text-[15px] font-bold text-white bg-rose-500 rounded-full px-2 py-0.5 tabular-nums">
                      선택 {selectedLowStock.size}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        if (selectedLowStock.size === lowStockFiltered.length) {
                          clearLowStockSelection();
                        } else {
                          setSelectedLowStock(() => new Set(lowStockFiltered.map(p => getCode(p))));
                        }
                      }}
                      className="inline-flex items-center h-7 px-1.5 rounded text-[14px] font-medium text-zinc-500 border border-line hover:bg-zinc-50 hover:border-zinc-300 transition-colors cursor-pointer shrink-0"
                    >
                      전체선택
                    </button>
                    <button
                      onClick={bulkRequestOrder}
                      disabled={bulkRequesting || selectedLowStock.size === 0}
                      className="inline-flex items-center gap-0.5 h-7 px-1.5 rounded text-[15px] font-bold text-rose-800 bg-rose-100 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shrink-0 whitespace-nowrap"
                      title="선택한 상품 일괄 발주요청 리스트로 전송"
                    >
                      <span>{bulkRequesting ? "요청 중" : `일괄 발주요청${selectedLowStock.size > 0 ? ` (${selectedLowStock.size})` : ""}`}</span>
                    </button>
                  </div>
                </div>
                <div className={`max-h-[50vh] overflow-auto relative ${productsLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                  <table className="w-full text-[15px] sm:min-w-[540px] [&_tbody_td]:text-[15px]">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="border-b border-line text-[14px] font-bold uppercase tracking-wider">
                        <th colSpan={isNeedCollapsed("info") ? 1 : 2}
                          className="text-center py-1.5 bg-sky-50 text-sky-700 border-l border-r border-zinc-100 cursor-pointer select-none hover:bg-sky-100 transition"
                          onClick={() => toggleNeedGroup("info")}
                          title={isNeedCollapsed("info") ? "상품 정보 펼치기" : "상품 정보 접기"}>
                          <span className="inline-flex items-center gap-1">
                            {isNeedCollapsed("info") ? <ChevronRight size={14} /> : <ChevronDown size={14} />}상품 정보
                          </span>
                        </th>
                        <th colSpan={isNeedCollapsed("stock") ? 1 : 3}
                          className="text-center py-1.5 bg-amber-50 text-amber-700 border-l border-r border-zinc-100 cursor-pointer select-none hover:bg-amber-100 transition"
                          onClick={() => toggleNeedGroup("stock")}
                          title={isNeedCollapsed("stock") ? "재고 현황 펼치기" : "재고 현황 접기"}>
                          <span className="inline-flex items-center gap-1">
                            {isNeedCollapsed("stock") ? <ChevronRight size={14} /> : <ChevronDown size={14} />}재고 현황
                          </span>
                        </th>
                        <th className="text-center py-1.5 bg-emerald-50 text-emerald-700 border-l border-zinc-100">발주 액션</th>
                      </tr>
                      <tr className="border-b border-zinc-100 text-[15px] text-zinc-400 uppercase tracking-wider">
                        {isNeedCollapsed("info") ? (
                          <th className="bg-sky-50/20 w-4"></th>
                        ) : (
                          <>
                            <th onClick={() => handleNeedSort("supplier")} className="text-left px-1 py-1.5 w-auto whitespace-normal cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30">공급사{needArrow("supplier")}</th>
                            <th onClick={() => handleNeedSort("name")} className="text-left px-1 py-1.5 w-auto whitespace-normal cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30">상품명{needArrow("name")}</th>
                          </>
                        )}
                        {isNeedCollapsed("stock") ? (
                          <th className="bg-amber-50/20 w-4"></th>
                        ) : (
                          <>
                            <th onClick={() => handleNeedSort("current")} className="text-right px-0.5 py-1.5 w-14 bg-amber-50/40 text-zinc-500 cursor-pointer hover:bg-amber-100 select-none"><div className="leading-tight">ERP<br/>재고{needArrow("current")}<br/><span className="text-[14px] text-zinc-400 font-normal">(현재고)</span></div></th>
                            {/* 2026-08-24 · 사용자 지시 · 실재고 컬럼 삭제 (오른쪽 판매현황 패널로 대체) */}
                            <th onClick={() => handleNeedSort("optimal")} className="text-right px-0.5 py-1.5 w-14 bg-indigo-50/40 text-indigo-600 cursor-pointer hover:bg-indigo-100 select-none"><div className="leading-tight">적정재고{needArrow("optimal")}</div></th>
                            <th onClick={() => handleNeedSort("short")} className="text-right px-0.5 py-1.5 w-14 bg-rose-50/40 text-rose-500 cursor-pointer hover:bg-rose-100 select-none">부족{needArrow("short")}</th>
                          </>
                        )}
                        <th className="text-center px-0.5 py-1.5 w-20 cursor-default bg-emerald-50/30 text-emerald-600">발주</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {/* 합계 요약 행 */}
                      {(() => {
                        let sumCur = 0, sumInv = 0, sumOpt = 0, sumShort = 0, invCount = 0;
                        for (const p of lowStockFiltered) {
                          const c = Number(p.current_stock ?? 0);
                          const o = Number(p.optimal_stock ?? 0);
                          sumCur += c; sumOpt += o;
                          sumShort += Math.max(0, o - c);
                          const codeK = getCode(p);
                          const invR = invStockMap.get(codeK);
                          if (invR && Number.isFinite(invR.total)) { sumInv += Number(invR.total); invCount++; }
                        }
                        return (
                          <tr className="bg-zinc-100 border-b-2 border-zinc-300 font-bold text-zinc-800 text-[14px]">
                            {isNeedCollapsed("info") ? (
                              <td className="bg-zinc-100" />
                            ) : (
                              <>
                                <td className="text-left px-1 py-1.5 text-zinc-500 font-bold">Σ</td>
                                <td className="text-left px-1 py-1.5 text-zinc-800 font-bold">합계 <span className="text-zinc-500 font-bold">({lowStockFiltered.length}건)</span></td>
                              </>
                            )}
                            {isNeedCollapsed("stock") ? (
                              <td className="bg-zinc-100" />
                            ) : (
                              <>
                                <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-zinc-800 bg-zinc-100">{sumCur.toLocaleString()}</td>
                                {/* 2026-08-24 · 실재고 컬럼 삭제 · sumInv 계산은 유지 (다른 곳 참조 시 대비) */}
                                <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-indigo-700 bg-indigo-100/60">{sumOpt.toLocaleString()}</td>
                                <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-rose-700 bg-rose-100/60">-{sumShort.toLocaleString()}</td>
                              </>
                            )}
                            <td className="bg-zinc-100" />
                          </tr>
                        );
                      })()}
                      {[...lowStockFiltered].sort((a, b) => {
                        const dir = needSortDir === "asc" ? 1 : -1;
                        const aCode = getCode(a), bCode = getCode(b);
                        const aInv = invStockMap.get(aCode); const bInv = invStockMap.get(bCode);
                        const aVendor = a.supplier ? findVendor(a.supplier) : undefined;
                        const bVendor = b.supplier ? findVendor(b.supplier) : undefined;
                        const aContact = aVendor?.contact_name || (a as any).supplier_contact || "";
                        const bContact = bVendor?.contact_name || (b as any).supplier_contact || "";
                        const aExtra = aCode ? needExtraMap.get(aCode) : undefined;
                        const bExtra = bCode ? needExtraMap.get(bCode) : undefined;
                        switch (needSortKey) {
                          case "supplier": return dir * String(a.supplier ?? "").localeCompare(String(b.supplier ?? ""), "ko");
                          case "contact":  return dir * aContact.localeCompare(bContact, "ko");
                          case "name":     return dir * getName(a).localeCompare(getName(b), "ko");
                          case "current":  return dir * (Number(a.current_stock ?? 0) - Number(b.current_stock ?? 0));
                          case "inv":      return dir * ((aInv?.total ?? -1) - (bInv?.total ?? -1));
                          case "optimal":  return dir * (Number(a.optimal_stock ?? 0) - Number(b.optimal_stock ?? 0));
                          case "short":    return dir * ((Number(a.optimal_stock ?? 0) - Number(a.current_stock ?? 0)) - (Number(b.optimal_stock ?? 0) - Number(b.current_stock ?? 0)));
                          case "sale_month": return dir * ((aExtra?.saleMonth ?? -1) - (bExtra?.saleMonth ?? -1));
                          default:         return 0;
                        }
                      }).map(p => {
                        const cur = Number(p.current_stock), opt = Number(p.optimal_stock);
                        const code = getCode(p);
                        const name = getName(p);
                        const inv = invStockMap.get(code);
                        const alreadyRequested = requestedCodes.has(code);
                        const busy = requestingOrder.has(code);
                        const isChecked = selectedLowStock.has(code);
                        return (
                          <React.Fragment key={code}>
                            <tr className={`transition ${isChecked ? "bg-rose-50/40" : "hover:bg-orange-50/30"}`}>
                              {isNeedCollapsed("info") ? (
                                <td className="bg-sky-50/10 w-4"></td>
                              ) : (
                                <>
                                  <td className="px-0.5 py-1.5 text-[14px] font-semibold align-middle">
                                    <div className="flex items-start gap-1.5">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleLowStockOne(code)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="mt-1 w-3.5 h-3.5 shrink-0 cursor-pointer accent-rose-500"
                                        title="선택 (일괄 발주요청)"
                                      />
                                      <div className="min-w-0 flex-1">
                                        {p.supplier ? (() => {
                                          const cleanName = stripVendorAnnotation(p.supplier);
                                          return (
                                            <div className="flex flex-col leading-tight">
                                              <VendorCategoryBadge category={getVendorCategory(cleanName || p.supplier)} />
                                              <button type="button"
                                                onClick={(e) => { e.stopPropagation(); openSupplierInfo(cleanName || p.supplier); }}
                                                className="text-sky-700 hover:text-sky-900 hover:underline cursor-pointer text-left whitespace-nowrap"
                                                title="공급사 정보 조회·수정">{cleanName || p.supplier}</button>
                                            </div>
                                          );
                                        })() : "-"}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-0.5 py-1.5 align-middle">
                                    <button
                                      onClick={() => setNeedPanelProduct({ code, name })}
                                      className="text-left text-[15px] font-medium text-zinc-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition"
                                      title="상품 상세정보 조회"
                                    >{name || "(상품명 없음)"}</button>
                                  </td>
                                </>
                              )}
                              {isNeedCollapsed("stock") ? (
                                <td className="bg-amber-50/10 w-4"></td>
                              ) : (
                                <>
                                  <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-[14px] text-zinc-700 bg-zinc-50/40 align-middle">{cur}</td>
                                  {/* 2026-08-24 · 사용자 지시 · 실재고 컬럼 삭제 · 오른쪽 판매현황 패널로 대체 */}
                                  <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-[14px] text-indigo-700 bg-indigo-50/40 align-middle">{opt}</td>
                                  <td className="text-right px-0.5 py-1.5 bg-rose-50/40 align-middle">
                                    <span className="tabular-nums font-bold text-[14px] text-rose-600">-{opt - cur}</span>
                                  </td>
                                </>
                              )}
                              <td className="text-center px-1 py-1.5 align-middle whitespace-nowrap">
                                <button
                                  onClick={() => handleRequestOrder(p)}
                                  disabled={busy}
                                  className={`h-6 px-1.5 rounded text-[14px] font-bold transition cursor-pointer disabled:opacity-40 ${
                                    alreadyRequested
                                      ? "text-emerald-700 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100"
                                      : "text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a]"
                                  }`}
                                  title={alreadyRequested ? "발주요청 리스트에 추가됨 · 다시 요청" : "발주요청 리스트에 추가"}
                                >
                                  {busy ? "..." : alreadyRequested ? "✓" : "요청"}
                                </button>
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                      {lowStockFiltered.length === 0 && (
                        <tr><td colSpan={13} className="text-center text-[15px] text-zinc-300 py-6">검색 결과 없음</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>)}
        </section>
      </div>

      {/* 리사이즈 핸들 */}
      <div onMouseDown={onNeedResizeStart}
        className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-amber-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
        title="드래그하여 폭 조절">
        <span className="text-[15px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
      </div>

      {/* 우측: 상품 상세 */}
      {needPanelLoading ? (
        <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0">
          <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
            <LoadingState label="불러오는 중..." size="normal" />
          </div>
        </div>
      ) : needPanelError ? (
        <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0">
          <Card padding="md" rounded="xl" className="text-sm text-red-700">
            <div className="font-bold mb-1">조회 실패</div>
            <div className="text-[15px] font-mono">{needPanelError}</div>
          </Card>
        </div>
      ) : (
        <ProductDetailRightPanel
          selected={needPanelFull ? ({
            code: (needPanelFull as any).product_code ?? (needPanelFull as any).code ?? (needPanelProduct?.code ?? ""),
            name: (needPanelFull as any).product_name ?? (needPanelFull as any).name ?? (needPanelProduct?.name ?? ""),
            spec: (needPanelFull as any).spec ?? "",
            ...needPanelFull,
            realMap: (needPanelFull as any).realMap ?? (needPanelFull as any).real_map ?? null,
          } as ProductInfoType) : null}
          onClose={() => setNeedPanelProduct(null)}
          onProductUpdate={(u) => setNeedPanelFull(prev => prev ? { ...prev, ...u } : prev)}
          onRealMapUpdate={(v) => setNeedPanelFull(prev => prev ? { ...prev, real_map: v, realMap: v } : prev)}
          showChart={true}
          context="order-manage"
          editable={true}
          emptySub="상세 정보가 표시됩니다"
          onSupplierInfoOpen={(nm) => openSupplierInfo(nm)}
        />
      )}
    </div>
  </div>
);
