// src/components/StockManagePage/SupplierListCard.tsx
// 공급사 리스트 카드 · SupplierTab.tsx 분리 (2026-08-26 · Framework audit large-file-warn 해결)
// 순수 렌더 컴포넌트 · 모든 state/handler 는 부모(SupplierTab)에서 props 로 주입

import React from "react";
import { Building2, RefreshCw, ChevronRight } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { LoadingState } from "../common/LoadingState";
import { EmptyState } from "../common/EmptyState";
import { StatusPill } from "../common/StatusPill";
import { TEXT } from "../../styles/tokens";
import { fmtWonCompact } from "../../lib/format";
import { RESIZER_CLS } from "../../hooks/useColumnResize";
import type { SupplierAgg, SupListSortKey, SupplierGroup } from "./SupplierTab.types";
import { fmt } from "./SupplierTab.types";
import { SupplierInlineExpansion } from "./SupplierInlineExpansion";
import { SplitListPanel } from "../common/SplitListPanel";
// 2026-09-18 · 사용자 지시 · (주)·주식회사 표시 정제
import { displayVendorName } from "../../utils/vendorNameNormalize";

const fmtWon = fmtWonCompact;

export interface SupplierListCardProps {
  // 데이터
  displayedXlsxSuppliers: SupplierAgg[];
  xlsxSuppliers: SupplierAgg[];
  supListLimit: number;
  supListTotals: { stock: number; item: number; purchase: number; purchaseAmt: number; saleQ: number; saleA: number };
  vendorCategoryMap: Record<string, string | null>;
  supplierRowsMap: Record<string, any[] | null>;
  supplierRowsLoading: Set<string>;
  inlineExpanded: Set<string>;
  supplierSelectedKey: string | null;
  // 상태
  loading: boolean;
  supplierSearch: string;
  supListCategory: "전체" | "위탁" | "선결제" | "60회전" | "90회전" | "기타";
  supListSort: { key: SupListSortKey; dir: "asc" | "desc" };
  totalsCollapsed: boolean;
  supplierGroupCollapsed: Set<SupplierGroup>;
  // props 옵션
  embedded: boolean;
  hideSaleColumns: boolean;
  showExtraPurchaseColumns: boolean;
  showCycleColumn: boolean;
  // 핸들러
  onSearchChange: (v: string) => void;
  onRefresh: () => void;
  onCategoryChange: (c: "전체" | "위탁" | "선결제" | "60회전" | "90회전" | "기타") => void;
  onSortToggle: (k: SupListSortKey) => void;
  onTotalsToggle: (v: boolean) => void;
  onGroupToggle: (g: SupplierGroup) => void;
  onRowClick: (sup: SupplierAgg, key: string) => void;
  onInlineToggle: (key: string, sup: SupplierAgg) => void;
  // column resize
  getWidth: (col: string) => number;
  resizerProps: (col: string) => React.HTMLAttributes<HTMLSpanElement>;
  // cycle
  cycleFor: (supplierName: string | null | undefined) => number | null;
}

export const SupplierListCard: React.FC<SupplierListCardProps> = ({
  displayedXlsxSuppliers,
  xlsxSuppliers,
  supListLimit,
  supListTotals,
  vendorCategoryMap,
  supplierRowsMap,
  supplierRowsLoading,
  inlineExpanded,
  supplierSelectedKey,
  loading,
  supplierSearch,
  supListCategory,
  supListSort,
  totalsCollapsed,
  supplierGroupCollapsed,
  embedded,
  hideSaleColumns,
  showExtraPurchaseColumns,
  showCycleColumn,
  onSearchChange,
  onRefresh,
  onCategoryChange,
  onSortToggle,
  onTotalsToggle,
  onGroupToggle,
  onRowClick,
  onInlineToggle,
  getWidth,
  resizerProps,
  cycleFor,
}) => {
  const isGroupCollapsed = (g: SupplierGroup) => supplierGroupCollapsed.has(g);

  return (
    <SplitListPanel
      topAccent
      title={
        <span className="inline-flex items-center gap-1.5">
          <Building2 size={14} className="text-sky-500 shrink-0" />
          <span className={TEXT.body}>공급사별 현황</span>
        </span>
      }
      countDisplay={
        <span className="text-[17px] font-semibold tabular-nums text-zinc-400 bg-zinc-50 border border-line rounded px-1.5 py-0.5">
          {displayedXlsxSuppliers.length}{supListLimit < xlsxSuppliers.length ? `/${xlsxSuppliers.length}` : ""}개 사
        </span>
      }
      search={supplierSearch}
      onSearchChange={onSearchChange}
      searchPlaceholder="공급사명 · 코드 검색"
      searchInHeader={embedded}
      headerActions={embedded ? (
        <button type="button" onClick={onRefresh} disabled={loading}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-line bg-white hover:bg-sky-50 hover:border-sky-300 text-zinc-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer" title="새로고침">
          {loading ? <Spinner size={13} tone="zinc" /> : <RefreshCw size={13} />}
        </button>
      ) : undefined}
      filters={
        <div className="flex flex-col gap-1.5 w-full">
          {!embedded && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[16px] font-semibold text-zinc-400 uppercase tracking-wider mr-0.5">분류</span>
            {([
              { k: "전체" as const, activeCls: "bg-zinc-700 text-white shadow-sm" },
              { k: "위탁" as const, activeCls: "bg-violet-500 text-white shadow-sm" },
              { k: "선결제" as const, activeCls: "bg-rose-500 text-white shadow-sm" },
              { k: "60회전" as const, activeCls: "bg-emerald-500 text-white shadow-sm" },
              { k: "90회전" as const, activeCls: "bg-teal-500 text-white shadow-sm" },
              { k: "기타" as const, activeCls: "bg-zinc-500 text-white shadow-sm" },
            ]).map(o => (
              <button key={o.k} onClick={() => onCategoryChange(o.k)}
                className={`h-7 px-2.5 rounded-md text-[17px] font-semibold transition cursor-pointer ${supListCategory === o.k ? o.activeCls : "text-zinc-500 bg-zinc-50 hover:bg-zinc-100 border border-line"}`}>
                {o.k}
              </button>
            ))}
          </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[16px] font-semibold text-zinc-400 uppercase tracking-wider mr-0.5">정렬</span>
            {([
              { k: "stockAssetAmount" as SupListSortKey, label: "재고자산", color: "amber", hideWhenNoSale: false, showOnlyWithCycle: false },
              { k: "saleQty" as SupListSortKey, label: "판매량", color: "emerald", hideWhenNoSale: true, showOnlyWithCycle: false },
              { k: "saleAmount" as SupListSortKey, label: "판매액", color: "emerald", hideWhenNoSale: true, showOnlyWithCycle: false },
              { k: "purchaseQty" as SupListSortKey, label: "매입", color: "amber", hideWhenNoSale: false, showOnlyWithCycle: false },
              { k: "supplier" as SupListSortKey, label: "공급사명", color: "sky", hideWhenNoSale: false, showOnlyWithCycle: false },
            ]).filter(o => !(hideSaleColumns && o.hideWhenNoSale) && !(o.showOnlyWithCycle && !showCycleColumn)).map(o => {
              const active = supListSort.key === o.k;
              const arrow = active ? (supListSort.dir === "desc" ? " ▼" : " ▲") : "";
              const activeMap: Record<string, string> = {
                amber: "bg-amber-500 text-white shadow-sm",
                emerald: "bg-emerald-500 text-white shadow-sm",
                sky: "bg-sky-500 text-white shadow-sm",
                slate: "bg-zinc-700 text-white shadow-sm",
              };
              return (
                <button key={o.k} onClick={() => onSortToggle(o.k)}
                  className={`h-7 px-2.5 rounded-md text-[17px] font-semibold transition cursor-pointer ${active ? activeMap[o.color] : "text-zinc-500 bg-zinc-50 hover:bg-zinc-100 border border-line"}`}>
                  {o.label}{arrow}
                </button>
              );
            })}
          </div>
        </div>
      }
      bodyClassName="relative flex-1 overflow-auto"
    >
      {/* 2026-09-11 · 사용자 지시 · 리스트 다시 불러올 때 · 전체 리스트 화면에 overlay spinner (기존 상단 카드 spinner + 반투명 오버레이) */}
      {loading && xlsxSuppliers.length > 0 && (
        <>
          <Card variant="flat" bg="bg-sky-50" borderColor="border-sky-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mx-3 mt-2">
            <Spinner size={12} tone="sky" label="조건 변경 · 새로 불러오는 중..." labelSize={14} />
          </Card>
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/60 backdrop-blur-[1px] pointer-events-none">
            <Spinner size={28} tone="sky" label="불러오는 중..." labelSize={16} />
          </div>
        </>
      )}
      {displayedXlsxSuppliers.length === 0 ? (
        loading ? (
          <LoadingState tone="sky" size="compact" label="데이터 로딩중..." />
        ) : (
          <EmptyState
            icon={Building2}
            title={supplierSearch.trim() ? "일치하는 공급사 없음" : "데이터 없음"}
            hint={supplierSearch.trim() ? `"${supplierSearch.trim()}" 검색어에 해당하는 공급사가 없습니다` : undefined}
            size="compact"
          />
        )
      ) : (
        <>
        {/* ─── PC 테이블 뷰 (md 이상) ─── */}
        <table className={`w-full text-[17px] hidden md:table ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`} style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead className="sticky top-0 z-10">
            <tr className="text-[17px] sm:text-[16px] font-bold text-zinc-500 border-b border-line bg-zinc-100/70 uppercase tracking-wider">
              {/* 2026-09-21 · #323 · toggle 컬럼 제거 · 우측 상세 패널로 충분 */}
              <th className="relative text-center py-2" style={{ width: getWidth("num"), minWidth: getWidth("num") }}>
                #
                <span {...resizerProps("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
              </th>
              <th className="relative text-left px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition" style={{ width: getWidth("supplier"), minWidth: getWidth("supplier") }} onClick={() => onSortToggle("supplier")} title="공급사명 정렬">
                공급사 {supListSort.key === "supplier" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                <span {...resizerProps("supplier")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
              </th>
              {isGroupCollapsed("stock") ? <th className="bg-zinc-50/40" style={{ width: 16 }}><button type="button" title="재고 컬럼 펼치기" onClick={() => onGroupToggle("stock")} className="w-full h-full cursor-pointer text-zinc-300 hover:text-zinc-500"><ChevronRight size={10} /></button></th> : (
                <>
                  <th className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition text-zinc-600" style={{ width: getWidth("stock_amt"), minWidth: getWidth("stock_amt") }} onClick={() => onSortToggle("stockAssetAmount")} title="재고자산 정렬 (매입액 − 판매원가)">
                    재고자산 {supListSort.key === "stockAssetAmount" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                    <span {...resizerProps("stock_amt")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition text-zinc-600" style={{ width: getWidth("item_cnt"), minWidth: getWidth("item_cnt") }} onClick={() => onSortToggle("itemCount")} title="상품수 정렬">
                    상품수 {supListSort.key === "itemCount" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                    <span {...resizerProps("item_cnt")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                </>
              )}
              {isGroupCollapsed("purchase") ? <th className="bg-zinc-50/40" style={{ width: 16 }}><button type="button" title="매입 컬럼 펼치기" onClick={() => onGroupToggle("purchase")} className="w-full h-full cursor-pointer text-zinc-300 hover:text-zinc-500"><ChevronRight size={10} /></button></th> : (
                <>
                  <th className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition text-zinc-600" style={{ width: getWidth("pur_qty"), minWidth: getWidth("pur_qty") }} onClick={() => onSortToggle("purchaseQty")} title="매입수량 정렬">
                    매입수량 {supListSort.key === "purchaseQty" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                    <span {...resizerProps("pur_qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  {showExtraPurchaseColumns && (
                    <th className="relative text-right px-3 py-2 text-zinc-600" style={{ width: getWidth("pur_amt"), minWidth: getWidth("pur_amt") }} title="매입액 (공급가액 합계 · stock_history.supply_amount)">
                      매입액
                      <span {...resizerProps("pur_amt")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                    </th>
                  )}
                  {showCycleColumn && (
                    <th
                      className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition text-zinc-600"
                      style={{ width: getWidth("cycle_days"), minWidth: getWidth("cycle_days") }}
                      onClick={() => onSortToggle("avgCycleDays")}
                      title="매입주기 정렬 (최근 90일 평균)"
                    >
                      매입주기(일) {supListSort.key === "avgCycleDays" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                      <span {...resizerProps("cycle_days")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                    </th>
                  )}
                </>
              )}
              {!hideSaleColumns && (
                isGroupCollapsed("sale") ? <th className="bg-zinc-50/40" style={{ width: 16 }}><button type="button" title="판매 컬럼 펼치기" onClick={() => onGroupToggle("sale")} className="w-full h-full cursor-pointer text-zinc-300 hover:text-zinc-500"><ChevronRight size={10} /></button></th> : (
                  <>
                    <th className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition text-zinc-600" style={{ width: getWidth("sale_qty"), minWidth: getWidth("sale_qty") }} onClick={() => onSortToggle("saleQty")} title="판매량 정렬">
                      판매량 {supListSort.key === "saleQty" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                      <span {...resizerProps("sale_qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                    </th>
                    <th className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-50 transition text-zinc-600" style={{ width: getWidth("sale_amt"), minWidth: getWidth("sale_amt") }} onClick={() => onSortToggle("saleAmount")} title="판매액 정렬">
                      판매액 {supListSort.key === "saleAmount" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-zinc-300">⇅</span>}
                      <span {...resizerProps("sale_amt")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                    </th>
                  </>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {/* 합계 요약 행 */}
            {totalsCollapsed ? (
              <tr className="bg-zinc-50 border-b border-line text-[17px]">
                <td colSpan={99} className="px-3 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => onTotalsToggle(false)}
                    className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-700 font-semibold cursor-pointer"
                    title="합계 펼치기"
                  >
                    <span className="text-[17px]">▾</span> Σ 합계 펼치기 ({displayedXlsxSuppliers.length}개 사)
                  </button>
                </td>
              </tr>
            ) : (
              <tr className="bg-zinc-100 border-b-2 border-zinc-300 font-bold text-zinc-800 text-[16px]">
                <td className="text-center py-1.5">
                  <button
                    type="button"
                    onClick={() => onTotalsToggle(true)}
                    className="text-zinc-500 hover:text-zinc-700 cursor-pointer text-[16px]"
                    title="합계 접기"
                  >▴ Σ</button>
                </td>
                <td className="text-center py-1.5 text-zinc-500">-</td>
                <td className="text-left px-3 py-1.5 text-zinc-800 font-bold">합계 <span className="text-zinc-500 font-bold">({displayedXlsxSuppliers.length}개 사)</span></td>
                {isGroupCollapsed("stock") ? <td className="bg-zinc-100" /> : (
                  <>
                    <td className="text-right px-3 py-1.5 tabular-nums font-bold text-ink">{fmtWon(supListTotals.stock)}</td>
                    <td className="text-right px-3 py-1.5 tabular-nums font-bold text-ink">{supListTotals.item.toLocaleString()}</td>
                  </>
                )}
                {isGroupCollapsed("purchase") ? <td className="bg-zinc-100" /> : (
                  <>
                    <td className="text-right px-3 py-1.5 tabular-nums font-bold text-ink">{supListTotals.purchase.toLocaleString()}</td>
                    {showExtraPurchaseColumns && (
                      <td className="text-right px-3 py-1.5 tabular-nums font-bold text-brand-deep">{fmtWon(supListTotals.purchaseAmt)}</td>
                    )}
                    {showCycleColumn && (
                      <td className="text-right px-3 py-1.5 text-zinc-400" title="합계 없음 · 개별 공급사별 값">-</td>
                    )}
                  </>
                )}
                {!hideSaleColumns && (
                  isGroupCollapsed("sale") ? <td className="bg-zinc-100" /> : (
                    <>
                      <td className="text-right px-3 py-1.5 tabular-nums font-bold text-ink">{supListTotals.saleQ.toLocaleString()}</td>
                      <td className="text-right px-3 py-1.5 tabular-nums font-bold text-ink">{fmtWon(supListTotals.saleA)}</td>
                    </>
                  )
                )}
              </tr>
            )}
            {displayedXlsxSuppliers.map((sup, i) => {
              const key = `${sup.supplier_code ?? "-"}::${sup.supplier}`;
              const isSelected = supplierSelectedKey === key;
              const isInline = inlineExpanded.has(key);
              const inlineRows = supplierRowsMap[key];
              const inlineLoading = supplierRowsLoading.has(key);
              return (
                <React.Fragment key={key}>
                  <tr
                    onClick={() => onRowClick(sup, key)}
                    className={`cursor-pointer transition-colors ${isSelected ? "bg-brand-tint/60 hover:bg-brand-tint" : "hover:bg-brand-tint/30"}`}
                    title="클릭 → 오른쪽 패널에 상세">
                    {/* 2026-09-21 · #323 · 사용자 지시 · 접힘 화살표 컬럼 제거 · 우측 상세 패널로 충분 */}
                    <td className="text-center align-middle py-1.5 text-[17px] font-semibold text-zinc-400 tabular-nums">{i + 1}</td>
                    <td className="text-left px-3 py-1.5 align-top">
                      <div className="flex flex-col leading-tight gap-0.5">
                        {(() => {
                          const nm = sup.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "";
                          const cat = vendorCategoryMap[nm] ?? vendorCategoryMap[sup.supplier ?? ""] ?? null;
                          return <VendorCategoryBadge category={cat} />;
                        })()}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* 2026-09-18 · 사용자 지시 · (주)·주식회사 표시 정제 · displayVendorName 프리미티브 */}
                          <span className={`text-[17px] font-semibold break-words whitespace-normal leading-tight ${isSelected ? "text-sky-800" : "text-zinc-700"}`}>
                            {displayVendorName(sup.supplier ?? "") || sup.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim()}
                          </span>
                          {/* 2026-08-30 · 사용자 지시 · 매입이력 embedded 모드 · 공급사 코드 숨김 */}
                          {sup.supplier_code && !embedded && <span className="text-[16px] tabular-nums text-zinc-400 shrink-0 font-mono bg-zinc-100 rounded px-1" title="공급사코드">#{sup.supplier_code}</span>}
                          {sup.code_conflict && <span className="text-[17px] font-semibold text-amber-500 shrink-0" title="같은 이름에 여러 공급사코드가 존재">⚠</span>}
                        </div>
                      </div>
                    </td>
                    {isGroupCollapsed("stock") ? <td className="bg-zinc-50/30 w-4"></td> : (
                      <>
                        <td className="text-right px-3 py-1.5 align-middle text-[17px] font-semibold text-ink tabular-nums" title="재고자산 (매입액 − 판매원가 · 대원칙 #1)">{fmtWon(Number(sup.stockAssetAmount ?? sup.totalStockAmount ?? 0))}</td>
                        <td className="text-right px-3 py-1.5 align-middle text-[16px] font-semibold text-ink-soft tabular-nums" title="취급 상품 종수">{sup.itemCount}</td>
                      </>
                    )}
                    {isGroupCollapsed("purchase") ? <td className="bg-zinc-50/30 w-4"></td> : (
                      <>
                        <td className="text-right px-3 py-1.5 align-middle text-[17px] font-semibold text-ink tabular-nums" title="매입수량">{fmt(sup.purchaseQty)}</td>
                        {showExtraPurchaseColumns && (
                          <td className="text-right px-3 py-1.5 align-middle text-[17px] font-bold text-brand-deep tabular-nums" title="매입액 (공급가액 합계)">{fmtWon(Number(sup.purchaseAmount ?? 0))}</td>
                        )}
                        {showCycleColumn && (() => {
                          const c = cycleFor(sup.supplier);
                          return (
                            <td
                              className="text-right px-3 py-1.5 align-middle text-[17px] font-semibold text-ink-soft tabular-nums"
                              title={c == null ? "최근 90일 매입 이력 부족" : `평균 매입주기 ${c}일 (최근 90일)`}
                            >
                              {c == null ? <span className="text-zinc-300">-</span> : `${c}일`}
                            </td>
                          );
                        })()}
                      </>
                    )}
                    {!hideSaleColumns && (
                      isGroupCollapsed("sale") ? <td className="bg-zinc-50/30 w-4"></td> : (
                        <>
                          <td className="text-right px-3 py-1.5 align-middle text-[17px] font-semibold text-ink tabular-nums" title="판매수량">{fmt(sup.saleQty)}</td>
                          {/* 2026-10-01 · 사용자 지시 · cross-endpoint 공식 통일 · 판매액 = sq × sale_price (대원칙 #3) · 레거시 saleAmount (supply_amount proration) → totalStockAmount (sqty × sale_price) 폴백 */}
                          <td className="text-right px-3 py-1.5 align-middle text-[17px] font-semibold text-ink tabular-nums" title="판매액 · sale_qty × sale_price (대원칙 #3)">{fmtWon(Number(sup.totalStockAmount ?? sup.saleAmount ?? 0))}</td>
                        </>
                      )
                    )}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {/* ─── 모바일 카드 뷰 (md 미만) ─── */}
        <div className={`md:hidden flex flex-col divide-y divide-zinc-100 ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
          {displayedXlsxSuppliers.map((sup, i) => {
            const key = `${sup.supplier_code ?? "-"}::${sup.supplier}`;
            const isSelected = supplierSelectedKey === key;
            const isInline = inlineExpanded.has(key);
            const inlineRows = supplierRowsMap[key];
            const inlineLoading = supplierRowsLoading.has(key);
            const nm = sup.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "";
            const cat = vendorCategoryMap[nm] ?? vendorCategoryMap[sup.supplier ?? ""] ?? null;
            const displayName = displayVendorName(sup.supplier ?? "") || nm;
            const c = cycleFor(sup.supplier);
            return (
              <React.Fragment key={key}>
                <div
                  onClick={() => onRowClick(sup, key)}
                  className={`cursor-pointer px-3 py-2.5 flex flex-col gap-1.5 border-l-2 transition-colors ${
                    isSelected ? "bg-brand-tint/60 border-brand-deep" : "hover:bg-brand-tint/30 border-transparent"
                  }`}
                >
                  {/* 줄 1 · 번호 + 공급사명 + 인라인 토글 */}
                  <div className="flex items-start gap-2">
                    <span className="text-[14px] font-semibold tabular-nums text-zinc-400 shrink-0 mt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {cat && <VendorCategoryBadge category={cat} />}
                        <span className={`text-[16px] font-semibold break-words whitespace-normal leading-tight ${isSelected ? "text-sky-800" : "text-zinc-700"}`}>
                          {displayName}
                        </span>
                        {sup.supplier_code && !embedded && (
                          <span className="text-[14px] tabular-nums text-zinc-400 bg-zinc-100 rounded px-1 shrink-0">#{sup.supplier_code}</span>
                        )}
                        {sup.code_conflict && <span className="text-[16px] font-semibold text-amber-500 shrink-0">⚠</span>}
                      </div>
                    </div>
                    {/* 2026-09-21 · #323 · 인라인 토글 버튼 제거 · 우측 상세 패널로 충분 */}
                  </div>
                  {/* 줄 2 · 재고자산 + 상품수 + 매입수량 */}
                  <div className="flex items-center gap-3 flex-wrap text-[14px]">
                    {!isGroupCollapsed("stock") && (
                      <>
                        <span className="font-bold tabular-nums text-zinc-700">{fmtWon(Number(sup.stockAssetAmount ?? sup.totalStockAmount ?? 0))}</span>
                        <span className="text-zinc-400 tabular-nums">{sup.itemCount}종</span>
                      </>
                    )}
                    {!isGroupCollapsed("purchase") && (
                      <>
                        <span className="tabular-nums text-zinc-500">매입 {fmt(sup.purchaseQty)}</span>
                        {showExtraPurchaseColumns && (
                          <span className="font-bold tabular-nums text-brand-deep">{fmtWon(Number(sup.purchaseAmount ?? 0))}</span>
                        )}
                        {showCycleColumn && c != null && (
                          <span className="tabular-nums text-zinc-400">{c}일주기</span>
                        )}
                      </>
                    )}
                    {!hideSaleColumns && !isGroupCollapsed("sale") && (
                      <>
                        <span className="tabular-nums text-zinc-500">판매 {fmt(sup.saleQty)}</span>
                        {/* 2026-10-01 · 사용자 지시 · 공식 통일 · 판매액 = sq × sale_price (대원칙 #3) · totalStockAmount 폴백 */}
                        <span className="font-semibold tabular-nums text-zinc-600">{fmtWon(Number(sup.totalStockAmount ?? sup.saleAmount ?? 0))}</span>
                      </>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
        </>
      )}
    </SplitListPanel>
  );
};

export default SupplierListCard;
