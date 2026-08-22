// 2026-08-22 · Framework Phase 4 · ReturnListPanel.tsx large-file 분리
// ReturnFilterBar · 상단 필터바 (반품필요 · 매입주기·판매·분류·검색·일괄반품)
//   · props-driven pure display

import React from "react";
import { PackageCheck, Search, Truck } from "lucide-react";
import { CARD_BASE } from "../../styles/tokens";
import { StatusPill } from "../common/StatusPill";

interface ReturnItem {
  supplier?: string | null;
  [key: string]: any;
}

interface ReturnFilterBarProps {
  returnList: ReturnItem[];
  returnSupplierSearch: string;
  setReturnSupplierSearch: (v: string) => void;
  returnCategoryFilter: string;
  setReturnCategoryFilter: (v: string) => void;
  vendorCategoryMap: Record<string, string | null>;
  dbVendorCategories: string[];
  returnCycleMin: number;
  setReturnCycleMin: (v: number) => void;
  returnSalesMax: number;
  setReturnSalesMax: (v: number) => void;
  returnSalesQuarterMax: number;
  setReturnSalesQuarterMax: (v: number) => void;
  returnSelectedSize: number;
  onOpenBulkReturnModal: () => void;
}

export const ReturnFilterBar: React.FC<ReturnFilterBarProps> = ({
  returnList, returnSupplierSearch, setReturnSupplierSearch,
  returnCategoryFilter, setReturnCategoryFilter,
  vendorCategoryMap, dbVendorCategories,
  returnCycleMin, setReturnCycleMin,
  returnSalesMax, setReturnSalesMax,
  returnSalesQuarterMax, setReturnSalesQuarterMax,
  returnSelectedSize, onOpenBulkReturnModal,
}) => {
  const q = returnSupplierSearch.trim().toLowerCase();
  const filteredCount = returnList.filter(x => {
    if (q && !String(x.supplier ?? "").toLowerCase().includes(q)) return false;
    if (returnCategoryFilter !== "전체") {
      const cat = vendorCategoryMap[String(x.supplier ?? "").trim()] ?? null;
      if (cat !== returnCategoryFilter) return false;
    }
    return true;
  }).length;
  const isFiltered = !!q || returnCategoryFilter !== "전체";
  return (
    <div className={`${CARD_BASE} px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2`}>
      <div className="flex items-center gap-1.5">
        <PackageCheck size={17} className="text-rose-500 shrink-0" />
        <span className="text-[16px] font-bold text-zinc-800">반품필요</span>
        <StatusPill tone="rose" size="md">
          {isFiltered ? `${filteredCount}/${returnList.length}` : returnList.length}건
        </StatusPill>
      </div>
      <div className="flex items-center gap-1.5 flex-nowrap shrink-0 basis-full sm:basis-auto">
        <label className="inline-flex items-center gap-1 text-[15px] text-zinc-600 shrink-0">
          <span className="font-medium text-zinc-500">매입주기</span>
          <input
            type="number"
            value={returnCycleMin}
            onChange={e => setReturnCycleMin(Math.max(0, Number(e.target.value) || 0))}
            className="w-11 h-7 px-1.5 text-[15px] border border-line rounded-md outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep tabular-nums text-right transition"
          />
          <span className="text-zinc-500 whitespace-nowrap">일 ↑</span>
        </label>
        <label className="inline-flex items-center gap-1 text-[15px] text-zinc-600 shrink-0">
          <span className="font-medium text-zinc-500">1M판매</span>
          <input
            type="number"
            value={returnSalesMax}
            onChange={e => setReturnSalesMax(Math.max(0, Number(e.target.value) || 0))}
            className="w-11 h-7 px-1.5 text-[15px] border border-line rounded-md outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep tabular-nums text-right transition"
          />
          <span className="text-zinc-500 whitespace-nowrap">개 ↑</span>
        </label>
        <label className="inline-flex items-center gap-1 text-[15px] text-zinc-600 shrink-0">
          <span className="font-medium text-zinc-500">3M판매</span>
          <input
            type="number"
            value={returnSalesQuarterMax}
            onChange={e => setReturnSalesQuarterMax(Math.max(0, Number(e.target.value) || 0))}
            className="w-11 h-7 px-1.5 text-[15px] border border-line rounded-md outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep tabular-nums text-right transition"
          />
          <span className="text-zinc-500 whitespace-nowrap">개 ↑</span>
        </label>
      </div>
      <div className="flex flex-wrap bg-zinc-100 border border-line rounded-lg p-1 gap-0.5">
        {(["전체", ...dbVendorCategories] as string[]).map(cat => (
          <button key={cat} onClick={() => setReturnCategoryFilter(cat)}
            className={`h-7 px-2.5 text-[15px] font-semibold rounded transition cursor-pointer ${
              returnCategoryFilter === cat
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
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          value={returnSupplierSearch}
          onChange={e => setReturnSupplierSearch(e.target.value)}
          placeholder="공급사명 검색"
          className="w-40 h-7 pl-7 pr-2 text-[15px] border border-line rounded-md outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition"
        />
      </div>
      <button
        type="button"
        onClick={onOpenBulkReturnModal}
        disabled={returnSelectedSize === 0}
        className={`ml-auto inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[15px] font-bold transition cursor-pointer border ${
          returnSelectedSize > 0
            ? "text-white bg-rose-500 hover:bg-rose-600 border-rose-700 shadow-sm active:scale-95"
            : "text-zinc-400 bg-zinc-50 border-line cursor-not-allowed"
        }`}
        title={returnSelectedSize > 0 ? `선택된 ${returnSelectedSize}개 상품 일괄 반품 신청` : "체크박스로 상품을 선택하세요"}
      >
        <Truck size={12} strokeWidth={2.5} />
        일괄 반품 ({returnSelectedSize})
      </button>
    </div>
  );
};
