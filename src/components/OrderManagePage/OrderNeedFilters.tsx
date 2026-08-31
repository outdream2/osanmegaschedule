// src/components/OrderManagePage/OrderNeedFilters.tsx
// 발주필요 탭 · 조건 카드 (검색·분류·발주조건·고급설정) · 2026-08-31 분리
import React from "react";
import { ChevronRight, RotateCcw, X } from "lucide-react";
import { SearchBar } from "../common/SearchBar";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { SaleStatusFilter } from "../common/SaleStatusFilter";
import type { OrderNeedShortageBasis, OrderNeedDefaultSortKey, OrderNeedFilterConfig } from "./OrderManagePage.types";
import { ORDER_NEED_CONFIG_KEY, DEFAULT_ORDER_NEED_CONFIG } from "./OrderManagePage.utils";
import type { SaleStatusFilter as SaleFilterValue } from "../../hooks/useSaleStatusFilter";

type NeedSortKey = "supplier" | "contact" | "name" | "current" | "inv" | "optimal" | "short" | "sale_month";

interface OrderNeedFiltersProps {
  displayedCount: number;
  dbVendorCategories: string[];
  // 검색
  lowStockSearch: string;
  setLowStockSearch: (v: string) => void;
  needConditionApply: boolean;
  setNeedConditionApply: (v: boolean) => void;
  // 판매상태
  saleFilter: SaleFilterValue;
  setSaleFilter: (v: SaleFilterValue) => void;
  // 카테고리
  needCategoryFilter: string;
  setNeedCategoryFilter: (v: string) => void;
  // 발주 조건
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
}

export const OrderNeedFilters: React.FC<OrderNeedFiltersProps> = ({
  displayedCount, dbVendorCategories,
  lowStockSearch, setLowStockSearch, needConditionApply, setNeedConditionApply,
  saleFilter, setSaleFilter,
  needCategoryFilter, setNeedCategoryFilter,
  needSalesMonthEnabled, setNeedSalesMonthEnabled,
  needSalesQuarterEnabled, setNeedSalesQuarterEnabled,
  needInlineMaxSalesMonth, needInlineMaxSalesQuarter, updateInline,
  inlineFiltering, inlineActive,
  deferredCurrentEnabled, deferredInlineCurrent,
  deferredSalesMonthEnabled, deferredInlineSalesMonth,
  deferredSalesQuarterEnabled, deferredInlineSalesQuarter,
  resetInlineFilter,
  needAdvancedOpen, setNeedAdvancedOpen, orderNeedConfig, setOrderNeedConfig,
  setNeedSortKey, setNeedSortDir,
}) => {
  const saveConfig = (next: OrderNeedFilterConfig) => {
    setOrderNeedConfig(next);
    try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
  };

  return (
    <div className="bg-white rounded-xl border border-line shadow-sm overflow-hidden">
      {/* Row 1: 검색 + 조건적용 토글 + 초기화 */}
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line">
        <SearchBar
          value={lowStockSearch}
          onChange={setLowStockSearch}
          placeholder={needConditionApply
            ? "재고 부족 조건 안에서 검색 · 상품·코드·공급사"
            : "전체 상품에서 검색 · 조건 무시"}
          resultCount={displayedCount}
          resultUnit="건"
          historyKey="megatown_orderNeed_search_history"
          accent="rose"
          widthClass="w-64 sm:w-80"
        />
        <SaleStatusFilter value={saleFilter} onChange={setSaleFilter} size="sm" />
        <label
          className={`inline-flex items-center gap-2 h-7 px-2.5 rounded-md border cursor-pointer select-none transition ${
            needConditionApply
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-amber-50 border-amber-300 text-amber-800"
          }`}
          title={needConditionApply
            ? "현재 · 재고 부족 조건 안에서만 검색 · 클릭 시 전체 상품 검색으로 전환"
            : "현재 · 전체 상품 검색 (조건 무시) · 클릭 시 조건 안 검색으로 복귀"}
        >
          <input
            type="checkbox"
            checked={needConditionApply}
            onChange={(e) => setNeedConditionApply(e.target.checked)}
            className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer"
          />
          <span className="text-[13px] font-bold tracking-tight">조건적용 · {needConditionApply ? "ON" : "OFF"}</span>
        </label>
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

      {/* 발주판정 고급설정 */}
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
                        onChange={() => saveConfig({ ...orderNeedConfig, shortageBasis: opt.k })}
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
                      onChange={e => saveConfig({ ...orderNeedConfig, includeMissingRealStock: e.target.checked })}
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
                        saveConfig({ ...orderNeedConfig, minShortage: Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1 });
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
                        saveConfig({ ...orderNeedConfig, minMonthlySales: Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0 });
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
                      saveConfig(next);
                      setNeedSortKey(opt.k as NeedSortKey);
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
                      saveConfig(next);
                      setNeedSortDir(opt.k);
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
                        saveConfig(next);
                        setNeedCategoryFilter(cat);
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
                  saveConfig(DEFAULT_ORDER_NEED_CONFIG);
                  setNeedCategoryFilter(DEFAULT_ORDER_NEED_CONFIG.defaultCategory);
                  setNeedSortKey(DEFAULT_ORDER_NEED_CONFIG.defaultSortKey as NeedSortKey);
                  setNeedSortDir(DEFAULT_ORDER_NEED_CONFIG.defaultSortDir);
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
  );
};
