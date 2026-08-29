// src/components/DisplayPage/DisplayProductPanel.tsx
// 2026-08-22 · Framework Phase 4 · 약 위치 검색 결과 패널 분리
import React from "react";
import { MapPin, Pill, Info, X } from "lucide-react";
import type { ProductInfo } from "../../lib/productsCache";
import type { DisplayZone } from "../../utils/zoneUtils";

interface ProductResult {
  code: string;
  name: string;
  spec: string;
  realMap: string | null;
}

interface DisplayProductPanelProps {
  productSearchResults: ProductResult[];
  productMatchZoneId: string | null;
  zones: DisplayZone[];
  productsMap: Record<string, ProductInfo>;
  onClear: () => void;
  onProductResultClick: (realMap: string | null) => void;
  onProductInfoClick: (p: ProductInfo) => void;
}

export const DisplayProductPanel: React.FC<DisplayProductPanelProps> = ({
  productSearchResults, productMatchZoneId, zones, productsMap, onClear, onProductResultClick, onProductInfoClick,
}) => {
  if (productSearchResults.length === 0) return null;
  return (
    <section className="flex flex-col lg:flex-row gap-4">
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="bg-white rounded-xl border border-emerald-200 shadow-xs overflow-hidden shrink-0">
          <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
              <Pill size={12} />약 위치 검색 결과 ({productSearchResults.length}건)
            </div>
            <button type="button" onClick={onClear} className="text-zinc-400 hover:text-zinc-600 transition cursor-pointer"><X size={12} /></button>
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-zinc-50">
            {productSearchResults.map((p) => {
              const matchZoneNum = productMatchZoneId ? zones.find(z => z.id === productMatchZoneId)?.num : undefined;
              const pZoneNum = parseInt((p.realMap ?? "").match(/^(\d+)번/)?.[1] ?? "-1");
              const isMatch = productMatchZoneId != null && matchZoneNum === pZoneNum;
              return (
                <div key={p.code} className={`px-3 py-2 flex items-start justify-between gap-2 ${isMatch ? "bg-emerald-50 border-l-2 border-emerald-400" : ""}`}>
                  <button type="button" onClick={() => onProductResultClick(p.realMap)} className="flex-1 min-w-0 text-left hover:opacity-75 transition cursor-pointer">
                    {/* 2026-08-29 · UI 감사 U1 · truncate 제거 · 상품명·규격 잘림 방지 (대원칙) */}
                    <div className="text-[13px] font-semibold text-zinc-800 break-words whitespace-normal leading-tight">{p.name}</div>
                    {p.spec && <div className="text-[11px] text-zinc-400 break-words whitespace-normal leading-tight mt-0.5">{p.spec}</div>}
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.realMap && <button type="button" onClick={() => onProductResultClick(p.realMap)} className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 whitespace-nowrap hover:text-emerald-900 transition cursor-pointer"><MapPin size={9} />{p.realMap}</button>}
                    <button type="button" onClick={(e) => { e.stopPropagation(); const full = productsMap[p.code] ?? productsMap[p.code.replace(/^0+/, "")] ?? p as unknown as ProductInfo; onProductInfoClick(full); }} className="flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-lg whitespace-nowrap hover:bg-indigo-100 transition cursor-pointer"><Info size={9} />상품정보</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
