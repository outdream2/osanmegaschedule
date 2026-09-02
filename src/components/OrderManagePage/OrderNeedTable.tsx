// src/components/OrderManagePage/OrderNeedTable.tsx
// 발주필요 탭 · 테이블 + 선택/일괄발주 컨트롤 · 2026-08-31 분리
import React from "react";
import { Card } from "../common/Card";
import { GradientAccent } from "../common/GradientAccent";
import { Spinner } from "../common/Spinner";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { StepperInput } from "../common/StepperInput";
import { stripVendorAnnotation } from "../../utils/vendorNameNormalize";
import type { ProductInfo } from "./OrderManagePage.types";

type NeedSortKey = "supplier" | "contact" | "name" | "current" | "inv" | "optimal" | "short" | "sale_month";

interface InvStockEntry {
  warehouse: number | null; store: number | null; total: number;
  w1: number | null; w2: number | null;
  s1: number | null; s2: number | null; s3: number | null;
  s1z: string | null; s2z: string | null; s3z: string | null;
}

interface OrderNeedTableProps {
  displayed: ProductInfo[];
  productsLoading: boolean;
  invStockMap: Map<string, InvStockEntry>;
  requestedCodes: Set<string>;
  requestingOrder: Set<string>;
  selectedLowStock: Set<string>;
  bulkRequesting: boolean;
  needExtraMap: Map<string, { saleMonth: number | null; saleQuarter: number | null }>;
  needSortKey: NeedSortKey;
  needSortDir: "asc" | "desc";
  handleNeedSort: (k: NeedSortKey) => void;
  needArrow: (k: NeedSortKey) => string;
  isNeedCollapsed: (g: string) => boolean;
  orderQtyOverride?: Map<string, number>;
  setOrderQtyOverride?: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  getCode: (p: ProductInfo) => string;
  getName: (p: ProductInfo) => string;
  getVendorCategory: (name: string) => string | null;
  findVendor: (name: string | null | undefined) => { contact_name: string | null; phone: string | null; email: string | null } | undefined;
  openSupplierInfo: (name: string | null | undefined) => void;
  toggleLowStockOne: (code: string) => void;
  clearLowStockSelection: () => void;
  setSelectedLowStock: (fn: (prev: Set<string>) => Set<string>) => void;
  bulkRequestOrder: () => void;
  handleRowClick: (p: ProductInfo) => void;
  handleRequestOrder: (p: ProductInfo) => Promise<void>;
}

export const OrderNeedTable: React.FC<OrderNeedTableProps> = ({
  displayed, productsLoading, invStockMap, requestedCodes, requestingOrder,
  selectedLowStock, bulkRequesting, needExtraMap,
  needSortKey, needSortDir, handleNeedSort, needArrow,
  isNeedCollapsed,
  orderQtyOverride, setOrderQtyOverride,
  getCode, getName, getVendorCategory, findVendor, openSupplierInfo,
  toggleLowStockOne, clearLowStockSelection, setSelectedLowStock, bulkRequestOrder,
  handleRowClick, handleRequestOrder,
}) => {
  if (productsLoading && displayed.length === 0) {
    return <div className="flex items-center justify-center py-8"><Spinner tone="zinc" label="로딩 중..." labelSize={12} /></div>;
  }
  if (displayed.length === 0) {
    return <div className="text-center text-[15px] text-zinc-300 py-6">발주 필요 상품 없음</div>;
  }

  const sorted = [...displayed].sort((a, b) => {
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
  });

  // 합계
  let sumCur = 0, sumOpt = 0, sumShort = 0;
  for (const p of displayed) {
    const c = Number(p.current_stock ?? 0);
    const o = Number(p.optimal_stock ?? 0);
    sumCur += c; sumOpt += o;
    sumShort += Math.max(0, o - c);
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="inline-block w-1 h-3.5 rounded-full bg-rose-500 shrink-0"></span>
        <span className="text-[15px] font-bold text-rose-600">발주필요 리스트</span>
        <span className="text-[15px] text-zinc-400 font-normal">{displayed.length}건</span>
        {selectedLowStock.size > 0 && (
          <span className="inline-flex items-center gap-1 text-[15px] font-bold text-white bg-rose-500 rounded-full px-2 py-0.5 tabular-nums">
            선택 {selectedLowStock.size}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => {
              if (selectedLowStock.size === displayed.length) {
                clearLowStockSelection();
              } else {
                setSelectedLowStock(() => new Set(displayed.map(p => getCode(p))));
              }
            }}
            className="inline-flex items-center gap-1 h-9 px-3.5 rounded-lg text-[15px] font-semibold text-ink-soft bg-white border border-line hover:border-brand-deep/40 hover:bg-brand-tint/20 hover:text-brand-deep active:scale-[0.98] transition-all duration-150 cursor-pointer shrink-0"
          >
            전체선택
          </button>
          <button
            onClick={bulkRequestOrder}
            disabled={bulkRequesting || selectedLowStock.size === 0}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[15px] font-bold text-white bg-gradient-to-br from-rose-500 to-rose-600 shadow-sm hover:shadow-md hover:from-rose-600 hover:to-rose-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:shadow-none transition-all duration-150 cursor-pointer shrink-0 whitespace-nowrap ring-1 ring-rose-500/20"
            title="선택한 상품 일괄 발주요청 리스트로 전송"
          >
            <span>{bulkRequesting ? "요청 중..." : `일괄 발주요청${selectedLowStock.size > 0 ? ` · ${selectedLowStock.size}` : ""}`}</span>
          </button>
        </div>
      </div>

      {productsLoading && displayed.length > 0 && (
        <Card variant="flat" bg="bg-sky-50" borderColor="border-sky-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mx-3 mb-1 shrink-0">
          <Spinner size={11} tone="sky" label="조건 변경 · 새로 불러오는 중..." labelSize={14} />
        </Card>
      )}

      <div className={`max-h-[50vh] overflow-auto relative rounded-xl border border-line bg-white ${productsLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
        <GradientAccent className="z-20" />
        <table className="w-full text-[14px] sm:text-[15px] min-w-[720px] border-collapse [&_tbody_td]:text-[14px] sm:[&_tbody_td]:text-[15px] [&_thead_th]:text-[13px] sm:[&_thead_th]:text-[14px]">
          <thead className="sticky top-0 z-10">
            <tr className="text-zinc-500 uppercase tracking-wider bg-zinc-100/70 border-b border-line">
              {isNeedCollapsed("info") ? (
                <th className="w-4"></th>
              ) : (
                <>
                  <th onClick={() => handleNeedSort("supplier")} className="text-left px-3 py-2.5 cursor-pointer hover:bg-zinc-200/60 select-none font-bold" style={{ minWidth: 130 }}>공급사<span className="ml-1 text-zinc-400">{needArrow("supplier") || "⇅"}</span></th>
                  <th onClick={() => handleNeedSort("name")} className="text-left px-3 py-2.5 cursor-pointer hover:bg-zinc-200/60 select-none font-bold" style={{ minWidth: 240 }}>상품명<span className="ml-1 text-zinc-400">{needArrow("name") || "⇅"}</span></th>
                </>
              )}
              {isNeedCollapsed("stock") ? (
                <th className="w-4"></th>
              ) : (
                <>
                  <th onClick={() => handleNeedSort("current")} className="text-right px-2 py-2.5 w-14 cursor-pointer hover:bg-zinc-200/60 select-none font-bold">ERP<span className="ml-1 text-zinc-400">{needArrow("current") || "⇅"}</span></th>
                  <th onClick={() => handleNeedSort("optimal")} className="text-right px-2 py-2.5 w-16 cursor-pointer hover:bg-zinc-200/60 select-none font-bold">적정<span className="ml-1 text-zinc-400">{needArrow("optimal") || "⇅"}</span></th>
                  <th onClick={() => handleNeedSort("short")} className="text-right px-2 py-2.5 w-14 cursor-pointer hover:bg-zinc-200/60 select-none font-bold text-rose-600">부족<span className="ml-1 text-rose-300">{needArrow("short") || "⇅"}</span></th>
                </>
              )}
              <th className="text-center px-2 py-2.5 cursor-default font-bold text-amber-700 bg-amber-50/50 border-l border-amber-100 whitespace-nowrap" style={{ minWidth: 112, width: 112 }}>수량</th>
              <th className="text-center px-2 py-2.5 cursor-default font-bold text-brand-deep bg-brand-tint/50 border-l border-brand/10" style={{ minWidth: 120 }}>발주</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {/* 합계 요약 행 */}
            <tr className="bg-zinc-100 border-b-2 border-zinc-300 font-bold text-zinc-800 text-[14px]">
              {isNeedCollapsed("info") ? (
                <td className="bg-zinc-100" />
              ) : (
                <>
                  <td className="text-left px-1 py-1.5 text-zinc-500 font-bold">Σ</td>
                  <td className="text-left px-1 py-1.5 text-zinc-800 font-bold">합계 <span className="text-zinc-500 font-bold">({displayed.length}건)</span></td>
                </>
              )}
              {isNeedCollapsed("stock") ? (
                <td className="bg-zinc-100" />
              ) : (
                <>
                  <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-zinc-800 bg-zinc-100">{sumCur.toLocaleString()}</td>
                  <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-ink bg-zinc-100">{sumOpt.toLocaleString()}</td>
                  <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-rose-700 bg-zinc-100">-{sumShort.toLocaleString()}</td>
                </>
              )}
              <td className="bg-zinc-100" />
              <td className="bg-zinc-100" />
            </tr>

            {sorted.map(p => {
              const cur = Number(p.current_stock), opt = Number(p.optimal_stock);
              const code = getCode(p);
              const name = getName(p);
              const alreadyRequested = requestedCodes.has(code);
              const busy = requestingOrder.has(code);
              const isChecked = selectedLowStock.has(code);
              return (
                <React.Fragment key={code}>
                  <tr className={`transition ${isChecked ? "bg-brand-tint/50" : "hover:bg-brand-tint/25"}`}>
                    {isNeedCollapsed("info") ? (
                      <td className="bg-zinc-50/20 w-4"></td>
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
                            onClick={() => handleRowClick(p)}
                            className="text-left text-[15px] font-medium text-zinc-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition"
                            title="상품 상세정보 조회 · OFF 조건 상품 · 클릭 시 발주필요 추가 confirm"
                          >{name || "(상품명 없음)"}</button>
                        </td>
                      </>
                    )}
                    {isNeedCollapsed("stock") ? (
                      <td className="bg-zinc-50/20 w-4"></td>
                    ) : (
                      <>
                        <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-[14px] text-zinc-700 bg-zinc-50/40 align-middle">{cur}</td>
                        <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-[14px] text-ink align-middle">{opt}</td>
                        <td className="text-right px-0.5 py-1.5 align-middle">
                          <span className="tabular-nums font-bold text-[14px] text-rose-600">-{opt - cur}</span>
                        </td>
                      </>
                    )}
                    <td className="text-center px-1.5 py-1 align-middle whitespace-nowrap bg-amber-50/20">
                      <div className="flex items-center justify-center">
                        <StepperInput
                          value={orderQtyOverride?.get(code) ?? Math.max(1, opt - cur)}
                          onChange={(v) => {
                            if (!setOrderQtyOverride) return;
                            const n = typeof v === "number" ? v : Math.max(1, opt - cur);
                            setOrderQtyOverride(prev => {
                              const next = new Map(prev);
                              next.set(code, n);
                              return next;
                            });
                          }}
                          min={1}
                          size="sm"
                          className="w-[84px]"
                        />
                      </div>
                    </td>
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
            {displayed.length === 0 && (
              <tr><td colSpan={14} className="text-center text-[15px] text-zinc-300 py-6">검색 결과 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};
