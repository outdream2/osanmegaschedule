// src/components/OrderManagePage/CriticalTab.tsx
// 2026-08-22 · Framework Phase 4 · 품절임박 탭 분리
// 2026-08-25 · 사용자 지시 · 공급사 분류 (vendor category) 필터 · CategoryChips 프리미티브
// 2026-08-25 v3 · 사용자 지시 · Split 리팩터
//   · 좌 · 실재고 + 발주요청 리스트 (컴팩트 · SplitListPanel)
//   · 우 · 클릭 시 ProductDetailRightPanel (재고위치 등 상세)
//   · CategoryChips · dropdown 제거

import React, { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { SplitPanel } from "../common/SplitPanel";
import { SplitListPanel } from "../common/SplitListPanel";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";
import { StatusPill } from "../common/StatusPill";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import type { ProductInfo } from "./OrderManagePage.types";
import type { ProductInfo as CacheProductInfo } from "../../lib/productsCache";

interface CriticalTabProps {
  products: ProductInfo[];
  invStockMap: Map<string, { total: number; w1: number | null; w2: number | null; s1: number | null; s2: number | null; s3: number | null; s1z: string | null; s2z: string | null; s3z: string | null; warehouse: number | null; store: number | null }>;
  orderReqCodes: Set<string>;
  getCode: (p: ProductInfo) => string;
  onRequestOrder: (p: ProductInfo) => Promise<void>;
  getVendorCategory: (name: string) => string | null;
  dbVendorCategories: string[];
}

const CATEGORY_TONES: Record<string, ChipTone> = {
  "위탁":  "violet",
  "선결제": "rose",
  "60회전": "emerald",
  "90회전": "teal",
  "기타":  "zinc",
  "미지정": "zinc",
};

export const CriticalTab: React.FC<CriticalTabProps> = ({
  products, invStockMap, orderReqCodes, getCode, onRequestOrder,
  getVendorCategory, dbVendorCategories,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<ProductInfo | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);

  const critical = useMemo(() => products
    .filter(p => {
      const cur = Number(p.current_stock ?? NaN);
      return Number.isFinite(cur) && cur <= 3;
    })
    .sort((a, b) => Number(a.current_stock ?? 0) - Number(b.current_stock ?? 0)), [products]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of critical) {
      const supName = String(p.supplier ?? "").trim();
      const cat = supName ? (getVendorCategory(supName) ?? "미지정") : "미지정";
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    const preferred = [...dbVendorCategories, "기타", "미지정"];
    const seen = new Set<string>();
    const ordered: [string, number][] = [];
    for (const c of preferred) {
      if (map.has(c) && !seen.has(c)) { ordered.push([c, map.get(c)!]); seen.add(c); }
    }
    for (const [k, v] of map) {
      if (!seen.has(k)) { ordered.push([k, v]); seen.add(k); }
    }
    return ordered;
  }, [critical, getVendorCategory, dbVendorCategories]);

  const filtered = useMemo(() => {
    if (categoryFilter === "all") return critical;
    return critical.filter(p => {
      const supName = String(p.supplier ?? "").trim();
      const cat = supName ? (getVendorCategory(supName) ?? "미지정") : "미지정";
      return cat === categoryFilter;
    });
  }, [critical, categoryFilter, getVendorCategory]);

  const chipOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string; tone?: ChipTone; count?: number }> = [
      { value: "all", label: `전체 (${critical.length})`, tone: "zinc" },
    ];
    for (const [cat, n] of categoryCounts) {
      opts.push({ value: cat, label: `${cat} (${n})`, tone: CATEGORY_TONES[cat] ?? "zinc" });
    }
    return opts;
  }, [critical.length, categoryCounts]);

  const handleReq = async (p: ProductInfo) => {
    const code = getCode(p);
    setRequesting(code);
    try { await onRequestOrder(p); }
    finally { setRequesting(null); }
  };

  const left = (
    <SplitListPanel
      topAccent
      title="품절임박"
      countDisplay={<StatusPill tone="amber" size="md">{filtered.length}건</StatusPill>}
      filters={
        <CategoryChips
          value={categoryFilter}
          onChange={(v) => setCategoryFilter(String(v))}
          options={chipOptions as any}
          size="sm"
          ariaLabel="공급사 분류 필터"
        />
      }
      bodyClassName="flex-1 min-h-0 overflow-auto"
    >
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-[15px] font-semibold text-zinc-400">
          {categoryFilter === "all" ? "품절임박 상품 없음 (ERP재고 3개 이하)" : `${categoryFilter} · 품절임박 상품 없음`}
        </div>
      ) : (
        <table className="w-full text-[14px] tabular-nums">
          <thead className="sticky top-0 z-10 bg-zinc-100/70 border-b border-line text-[13px] font-bold text-zinc-500 uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2.5 min-w-[160px]">상품</th>
              <th className="text-right px-2 py-2.5 w-[64px] bg-amber-50/40 text-amber-700">실재고</th>
              <th className="text-right px-2 py-2.5 w-[64px]">ERP</th>
              <th className="text-center px-2 py-2.5 w-[80px]">발주</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtered.map(p => {
              const code = getCode(p);
              const inv = invStockMap.get(code);
              const supplier = String(p.supplier ?? "-");
              const name = String(p.product_name ?? "-");
              const alreadyRequested = orderReqCodes.has(code);
              const curNum = Number(p.current_stock ?? 0);
              const isSelected = selected && getCode(selected) === code;
              return (
                <tr
                  key={code}
                  onClick={() => setSelected(p)}
                  className={`cursor-pointer transition ${
                    isSelected ? "bg-brand-tint/60 hover:bg-brand-tint"
                    : curNum <= 0 ? "bg-rose-50/40 hover:bg-rose-50"
                    : "hover:bg-zinc-50"
                  }`}
                >
                  <td className="text-left px-3 py-2 align-top">
                    <div className="text-[13px] text-sky-700 font-semibold truncate">{supplier}</div>
                    <div className="text-[15px] font-bold text-ink break-words whitespace-normal mt-0.5">{name}</div>
                  </td>
                  <td className={`text-right px-2 py-2 tabular-nums font-bold ${inv?.total != null ? "text-amber-700" : "text-zinc-300"} bg-amber-50/40 align-middle`}>{inv?.total ?? "-"}</td>
                  <td className={`text-right px-2 py-2 tabular-nums font-bold align-middle ${curNum <= 0 ? "text-rose-700" : "text-zinc-700"}`}>{p.current_stock ?? "-"}</td>
                  <td className="text-center px-2 py-2 align-middle">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReq(p); }}
                      disabled={alreadyRequested || requesting === code}
                      className={`h-7 px-3 rounded-md text-[13px] font-bold cursor-pointer transition ${
                        alreadyRequested
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-not-allowed"
                          : requesting === code
                            ? "bg-zinc-100 text-zinc-400 cursor-wait"
                            : "bg-brand-deep text-white hover:bg-[#0d3a5c]"
                      }`}
                      title={alreadyRequested ? "이미 발주 요청됨" : "발주요청"}
                    >{alreadyRequested ? "요청됨" : requesting === code ? "요청 중..." : "요청"}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </SplitListPanel>
  );

  // 우측 · 재고위치 상세 (ProductDetailRightPanel · context=order-manage)
  //   · 상품 선택 시 · 재고위치·매입이력 등 5탭 노출 · showChart false (품절임박은 부족 조치가 우선)
  const rightProduct: CacheProductInfo | null = selected ? {
    code: getCode(selected),
    name: String(selected.product_name ?? ""),
    spec: String((selected as any).spec ?? ""),
    supplier: (selected as any).supplier ?? null,
    real_map: (selected as any).real_map ?? null,
    realMap: (selected as any).real_map ?? null,
    ...(selected as any),
  } as CacheProductInfo : null;

  const right = (
    <ProductDetailRightPanel
      selected={rightProduct}
      onClose={() => setSelected(null)}
      showChart={false}
      context="order-manage"
      editable
      emptyMessage="좌측에서 품절임박 상품을 선택하세요"
      emptySub="재고위치 · 매입이력 · 발주내역 등 상세가 표시됩니다"
    />
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-1 py-1.5 flex-wrap">
        <AlertTriangle size={16} className="text-amber-500 shrink-0" />
        <span className="text-[13px] text-ink-soft font-medium tracking-tight">ERP재고 3개 이하 · 클릭 시 우측 재고위치 상세</span>
      </div>
      <SplitPanel
        storageKey="orderNeed.critical.leftWidth"
        defaultWidth={typeof window !== "undefined" ? Math.max(420, Math.min(720, Math.floor(window.innerWidth * 0.4))) : 480}
        minWidth={340}
        maxWidth={1000}
        dividerColor="amber"
        left={left}
        right={right}
        wrapLeft={false}
        mobileRightAsModal
        mobileModalTitle={selected ? String(selected.product_name ?? "상품 상세") : "상품 상세"}
        mobileOpen={selected != null}
        onMobileClose={() => setSelected(null)}
      />
    </div>
  );
};
