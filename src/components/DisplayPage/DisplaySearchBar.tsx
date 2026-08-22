// src/components/DisplayPage/DisplaySearchBar.tsx
// 2026-08-22 · Framework Phase 4 · DisplayPage 검색바 + 드롭다운 분리
import React from "react";
import { Info, MapPin, Pill, ScanLine, Search, X } from "lucide-react";
import type { ProductInfo } from "../../lib/productsCache";

interface ProductResult {
  code: string;
  name: string;
  spec: string;
  realMap: string | null;
}

interface DisplaySearchBarProps {
  searchQuery: string;
  productSearchResults: ProductResult[];
  productsMap: Record<string, ProductInfo>;
  onSearchChange: (q: string) => void;
  onClear: () => void;
  onProductResultClick: (realMap: string | null) => void;
  onProductInfoClick: (p: ProductInfo) => void;
  onScanClick: () => void;
}

export const DisplaySearchBar: React.FC<DisplaySearchBarProps> = ({
  searchQuery,
  productSearchResults,
  productsMap,
  onSearchChange,
  onClear,
  onProductResultClick,
  onProductInfoClick,
  onScanClick,
}) => {
  return (
    <div className="relative flex-1 min-w-[140px] sm:min-w-[200px] max-w-[360px]">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="약 · 증상 검색 (예: 감기약)"
        className="w-full pl-8 pr-8 py-1.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-tint bg-white text-xs"
      />
      <Search className="absolute left-2 top-2 text-gray-400" size={13} />
      {searchQuery && (
        <button onClick={onClear} className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600 cursor-pointer">
          <X size={14} />
        </button>
      )}
      {searchQuery && productSearchResults.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-emerald-300 shadow-xl z-40 overflow-hidden">
          <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
              <Pill size={12} />검색 결과 ({productSearchResults.length}건)
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-zinc-50">
            {productSearchResults.map((p) => (
              <div key={p.code} className="px-3 py-2 flex items-start justify-between gap-2 hover:bg-zinc-50 transition">
                <button type="button" onClick={() => onProductResultClick(p.realMap)} className="flex-1 min-w-0 text-left cursor-pointer">
                  <div className="text-[13px] font-semibold text-zinc-800 truncate">{p.name}</div>
                  {p.spec && <div className="text-[11px] text-zinc-400 truncate mt-0.5">{p.spec}</div>}
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.realMap && (
                    <button type="button" onClick={() => onProductResultClick(p.realMap)} className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 whitespace-nowrap hover:text-emerald-900 transition cursor-pointer">
                      <MapPin size={9} />{p.realMap}
                    </button>
                  )}
                  <button type="button" onClick={(e) => { e.stopPropagation(); const full = productsMap[p.code] ?? productsMap[p.code.replace(/^0+/, "")] ?? p as unknown as ProductInfo; onProductInfoClick(full); }} className="flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-lg whitespace-nowrap hover:bg-indigo-100 transition cursor-pointer">
                    <Info size={9} />정보
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {searchQuery && productSearchResults.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-line shadow-lg z-40 px-3 py-3 text-[11px] text-zinc-400 text-center">검색 결과 없음</div>
      )}
    </div>
  );
};
