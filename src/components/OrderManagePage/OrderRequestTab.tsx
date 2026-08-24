// src/components/OrderManagePage/OrderRequestTab.tsx
// 2026-08-22 · Framework Phase 4 · 발주요청 탭 분리
import React from "react";
import { Loader2, ShoppingCart, CheckSquare, Square, Send, ChevronRight, ChevronDown, History } from "lucide-react";
// 2026-08-23 · #182 · 공급사별 발주이력 모달
import { OrderHistorySupplierModal } from "./OrderHistorySupplierModal";
import { Card } from "../common/Card";
import { PageToolbar } from "../common/PageToolbar";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";
import { Spinner } from "../common/Spinner";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { LoadingState } from "../common/LoadingState";
import { CARD_BASE } from "../../styles/tokens";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import type { OrderRequest } from "./OrderManagePage.types";
import type { ProductInfo as ProductInfoType } from "../../lib/productsCache";

type OrderSortKey = "supplier" | "contact" | "name" | "current" | "inv" | "optimal" | "short";

interface InvStockEntry {
  total: number; w1: number | null; w2: number | null;
  s1: number | null; s2: number | null; s3: number | null;
  s1z: string | null; s2z: string | null; s3z: string | null;
  warehouse: number | null; store: number | null;
}

interface OrderRequestTabProps {
  // 데이터
  orderReqs: OrderRequest[];
  orderReqsFiltered: OrderRequest[];
  orderLoading: boolean;
  orderError: string | null;
  allProductsMap: Record<string, any>;
  invStockMap: Map<string, InvStockEntry>;
  zoneMap: Map<string, { real_map: string | null; spec: string | null }>;
  prevPriceMap: Map<string, number>;
  orderQtyOverride: Map<string, number>;
  selectedOrder: Set<string>;
  sendingBulk: boolean;
  dbVendorCategories: string[];
  // 검색·필터
  orderSearch: string;
  setOrderSearch: (v: string) => void;
  orderCategoryFilter: string;
  setOrderCategoryFilter: (v: string) => void;
  orderSortKey: OrderSortKey;
  orderSortDir: "asc" | "desc";
  handleOrderSort: (k: OrderSortKey) => void;
  orderArrow: (k: OrderSortKey) => string;
  // 접기
  isOrderGroupCollapsed: (g: string) => boolean;
  toggleOrderGroup: (g: string) => void;
  // 패널
  orderPanelWidth: number;
  onOrderResizeStart: (e: React.MouseEvent) => void;
  orderPanelProduct: { code: string; name: string } | null;
  orderPanelFull: Record<string, any> | null;
  orderPanelLoading: boolean;
  orderPanelError: string | null;
  setOrderPanelProduct: (v: { code: string; name: string } | null) => void;
  setOrderPanelFull: (fn: (prev: Record<string, any> | null) => Record<string, any> | null) => void;
  // 액션
  openSupplierInfo: (name: string | null | undefined) => void;
  getVendorCategory: (name: string) => string | null;
  findVendor: (name: string | null | undefined) => { contact_name: string | null; phone: string | null; email: string | null } | undefined;
  toggleOne: (id: string) => void;
  toggleAll: () => void;
  allChecked: boolean;
  handleBulkOrder: () => void;
  onDeleteSelected: () => void;
  openOrderModal: (rows: OrderRequest[]) => void;
  loadOrderReqs: () => void;
  setOrderQtyOverride: (fn: (prev: Map<string, number>) => Map<string, number>) => void;
  confirm: (opts: { message: string; danger?: boolean }) => Promise<boolean>;
}

export const OrderRequestTab: React.FC<OrderRequestTabProps> = ({
  orderReqs, orderReqsFiltered, orderLoading, orderError,
  allProductsMap, invStockMap, zoneMap, prevPriceMap, orderQtyOverride,
  selectedOrder, sendingBulk, dbVendorCategories,
  orderSearch, setOrderSearch, orderCategoryFilter, setOrderCategoryFilter,
  orderSortKey, orderSortDir, handleOrderSort, orderArrow,
  isOrderGroupCollapsed, toggleOrderGroup,
  orderPanelWidth, onOrderResizeStart,
  orderPanelProduct, orderPanelFull, orderPanelLoading, orderPanelError,
  setOrderPanelProduct, setOrderPanelFull,
  openSupplierInfo, getVendorCategory, findVendor,
  toggleOne, toggleAll, allChecked,
  handleBulkOrder, onDeleteSelected, openOrderModal, loadOrderReqs,
  setOrderQtyOverride,
}) => {
  // 2026-08-23 · #182 · 공급사별 발주이력 모달
  const [supplierHistorySupplier, setSupplierHistorySupplier] = React.useState<string | null>(null);
  return (
  <div className="flex flex-col gap-2">
    <PageToolbar
      icon={<ShoppingCart size={18} strokeWidth={2.2} />}
      title="발주 요청 목록"
      count={orderReqs.length}
      selectedCount={selectedOrder.size}
      search={{ value: orderSearch, onChange: setOrderSearch, placeholder: "상품·코드·공급사" }}
      right={
        <CategoryChips
          value={orderCategoryFilter}
          onChange={(v) => setOrderCategoryFilter(String(v))}
          size="sm"
          ariaLabel="발주요청 공급사 카테고리"
          options={(["all", ...dbVendorCategories] as string[]).map(cat => ({
            value: cat,
            label: cat === "all" ? "전체" : cat,
            tone: (cat === "all"    ? "zinc"
                 : cat === "위탁"   ? "violet"
                 : cat === "선결제" ? "rose"
                 : cat === "60회전" ? "emerald"
                 : cat === "90회전" ? "teal"
                 : "zinc") as ChipTone,
          }))}
        />
      }
    />

    <div className="flex flex-col lg:flex-row gap-2 items-stretch lg:min-h-[720px]">
      {/* 좌측: 발주요청 리스트 */}
      <div
        className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
        style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? orderPanelWidth : undefined }}
      >
        <section className="bg-white rounded-xl border border-line p-4 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
          {orderError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-[15px] text-red-600 font-bold">
              ⚠ {orderError}
              <button onClick={loadOrderReqs} className="ml-auto text-red-500 underline cursor-pointer">재시도</button>
            </div>
          )}
          {orderLoading && orderReqs.length > 0 && (
            <Card variant="flat" bg="bg-sky-50" borderColor="border-sky-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mx-3 mb-1 shrink-0">
              <Spinner size={11} tone="sky" label="조건 변경 · 새로 불러오는 중..." labelSize={14} />
            </Card>
          )}
          {orderLoading && orderReqs.length === 0 ? (
            <div className="flex items-center justify-center py-8"><Spinner tone="zinc" label="로딩 중..." labelSize={12} /></div>
          ) : orderReqs.length === 0 && !orderError ? (
            <div className="text-center text-[15px] text-zinc-300 py-6">발주 요청 내역 없음</div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="inline-block w-1 h-4 rounded-full bg-rose-400 shrink-0"></span>
                <span className="text-[15px] font-bold text-zinc-700">발주리스트</span>
                <span className="text-[15px] text-zinc-400 font-normal">{orderReqsFiltered.length}건</span>
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                  {/* 2026-08-24 · 최신 트렌드 · Linear/Vercel 톤 · pill · gradient · shadow */}
                  <button onClick={handleBulkOrder} disabled={sendingBulk || selectedOrder.size === 0}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[15px] font-bold text-white bg-gradient-to-br from-rose-500 to-rose-600 shadow-sm hover:shadow-md hover:from-rose-600 hover:to-rose-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:shadow-none transition-all duration-150 cursor-pointer shrink-0 whitespace-nowrap ring-1 ring-rose-500/20"
                    title="선택한 발주요청을 공급사별로 그룹핑">
                    {sendingBulk ? <Loader2 size={13} strokeWidth={2.5} className="animate-spin" /> : <Send size={13} strokeWidth={2.5} />}
                    <span>{sendingBulk ? "발송 중..." : `일괄 발주${selectedOrder.size > 0 ? ` · ${selectedOrder.size}` : ""}`}</span>
                  </button>
                  <button onClick={toggleAll}
                    className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[14px] font-semibold text-ink-soft bg-white border border-line hover:border-brand-deep/40 hover:bg-brand-tint/20 hover:text-brand-deep active:scale-[0.98] transition-all duration-150 cursor-pointer shrink-0">
                    {allChecked ? <CheckSquare size={13} className="text-rose-500" /> : <Square size={13} />}
                    전체선택
                  </button>
                  <button onClick={onDeleteSelected}
                    disabled={selectedOrder.size === 0}
                    className="inline-flex items-center h-9 px-3 rounded-lg text-[14px] font-semibold text-ink-soft bg-white border border-line hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer shrink-0"
                    title="선택 항목 삭제">
                    선택삭제{selectedOrder.size > 0 ? ` · ${selectedOrder.size}` : ""}
                  </button>
                </div>
              </div>
              {/* 2026-08-23 · #183 · 안내 문구 변경 (기존 손실확정 안내 → 발주이력 안내) */}
              <div className="mb-2 text-[15px] text-brand-deep bg-brand-tint/60 border border-brand/15 rounded-md px-2 py-1 leading-snug">
                공급사를 클릭하면 최신 발주이력을 확인할 수 있습니다
              </div>
              <div className={`max-h-[50vh] lg:max-h-[75vh] overflow-auto relative ${orderLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                <table className="w-full text-[15px] sm:min-w-[540px] [&_tbody_td]:text-[15px] [&_thead_th]:text-[14px]">
                  <thead className="sticky top-0 bg-white z-10">
                    {/* 2026-08-24 · 사용자 지시 · 카테고리 그룹 헤더 (상품 정보·재고 현황·발주 정보) 제거 · 서브헤더만 표시 */}
                    <tr className="border-b border-zinc-100 text-[15px] text-zinc-400 uppercase tracking-wider">
                      <th className="text-center px-0.5 py-1.5 w-6">
                        <button onClick={toggleAll}
                          className="inline-flex items-center gap-0.5 text-[14px] font-semibold text-zinc-500 hover:text-rose-600 transition cursor-pointer"
                          title={allChecked ? "전체 선택 해제" : "전체 선택"}>
                          {allChecked ? <CheckSquare size={11} className="text-rose-500" /> : <Square size={11} />}
                          <span>전체</span>
                        </button>
                      </th>
                      {/* 2026-08-24 · 자율진행 · 색상 bg 제거 · 미니멀 zinc 톤 통일 · 강조는 text 만 */}
                      {isOrderGroupCollapsed("info") ? (
                        <th className="bg-zinc-50/30 w-4"></th>
                      ) : (
                        <th onClick={() => handleOrderSort("name")} className="text-left px-0.5 py-1.5 cursor-pointer hover:bg-zinc-50 select-none text-zinc-600">상품명{orderArrow("name")}</th>
                      )}
                      {isOrderGroupCollapsed("stock") ? (
                        <th className="bg-zinc-50/30 w-4"></th>
                      ) : (
                        <>
                          <th onClick={() => handleOrderSort("current")} className="text-right px-0.5 py-1.5 w-14 text-zinc-600 cursor-pointer hover:bg-zinc-50 select-none"><div className="leading-tight">ERP<br/>재고{orderArrow("current")}<br/><span className="text-[14px] text-zinc-400 font-normal">(현재고)</span></div></th>
                          <th onClick={() => handleOrderSort("optimal")} className="text-right px-0.5 py-1.5 w-12 text-zinc-600 cursor-pointer hover:bg-zinc-50 select-none">추천적정{orderArrow("optimal")}</th>
                          <th onClick={() => handleOrderSort("short")} className="text-right px-0.5 py-1.5 w-12 text-rose-600 cursor-pointer hover:bg-zinc-50 select-none">부족{orderArrow("short")}</th>
                        </>
                      )}
                      <th className="text-right px-0.5 py-1.5 w-14 text-rose-600">주문<br/>수량</th>
                      <th className="text-right px-0.5 py-1.5 w-16 text-zinc-600"><div className="leading-tight">이전<br/>사입가</div></th>
                      <th className="text-right px-0.5 py-1.5 w-20 text-brand-deep font-bold">발주금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {(() => {
                      const resolveSup = (r: OrderRequest): string => {
                        const cv = [r.product_code, r.product_code.replace(/^0+/, ""), r.product_code.padStart(8, "0")];
                        const p = cv.map(c => allProductsMap[c]).find(Boolean) as any;
                        return ((p?.supplier || r.supplier || "").trim()) || "(공급사 미지정)";
                      };
                      const sorted = [...orderReqsFiltered].sort((a, b) => {
                        const supA = resolveSup(a);
                        const supB = resolveSup(b);
                        const supCmp = supA.localeCompare(supB, "ko");
                        if (supCmp !== 0) return supCmp;
                        const dir = orderSortDir === "asc" ? 1 : -1;
                        const aCodeVars = [a.product_code, a.product_code.replace(/^0+/, ""), a.product_code.padStart(8, "0")];
                        const bCodeVars = [b.product_code, b.product_code.replace(/^0+/, ""), b.product_code.padStart(8, "0")];
                        const aProd = aCodeVars.map(c => allProductsMap[c]).find(Boolean);
                        const bProd = bCodeVars.map(c => allProductsMap[c]).find(Boolean);
                        const aVendor = findVendor((aProd as any)?.supplier) || findVendor(a.supplier) || undefined;
                        const bVendor = findVendor((bProd as any)?.supplier) || findVendor(b.supplier) || undefined;
                        const aContact = aVendor?.contact_name || a.supplier_contact || (aProd as any)?.supplier_contact || "";
                        const bContact = bVendor?.contact_name || b.supplier_contact || (bProd as any)?.supplier_contact || "";
                        const aInv = aCodeVars.map(c => invStockMap.get(c)).find(Boolean);
                        const bInv = bCodeVars.map(c => invStockMap.get(c)).find(Boolean);
                        const aCur = Number((aProd as any)?.current_stock ?? a.current_stock ?? 0);
                        const bCur = Number((bProd as any)?.current_stock ?? b.current_stock ?? 0);
                        const aOpt = Number((aProd as any)?.optimal_stock ?? a.optimal_stock ?? 0);
                        const bOpt = Number((bProd as any)?.optimal_stock ?? b.optimal_stock ?? 0);
                        switch (orderSortKey) {
                          case "supplier": return 0;
                          case "contact":  return dir * aContact.localeCompare(bContact, "ko");
                          case "name":     return dir * a.product_name.localeCompare(b.product_name, "ko");
                          case "current":  return dir * (aCur - bCur);
                          case "inv":      return dir * ((aInv?.total ?? -1) - (bInv?.total ?? -1));
                          case "optimal":  return dir * (aOpt - bOpt);
                          case "short":    return dir * ((aOpt - aCur) - (bOpt - bCur));
                          default:         return 0;
                        }
                      });
                      const bySup = new Map<string, OrderRequest[]>();
                      for (const rr of sorted) {
                        const s = resolveSup(rr);
                        if (!bySup.has(s)) bySup.set(s, []);
                        bySup.get(s)!.push(rr);
                      }
                      let prevSup = "";
                      return sorted.map(r => {
                        const currentSup = resolveSup(r);
                        const isNewGroup = currentSup !== prevSup;
                        prevSup = currentSup;
                        const groupRows = bySup.get(currentSup) ?? [];
                        const codeVariants = [r.product_code, r.product_code.replace(/^0+/, ""), r.product_code.padStart(8, "0")];
                        const inv = codeVariants.map(c => invStockMap.get(c)).find(Boolean);
                        const productData = codeVariants.map(c => allProductsMap[c]).find(Boolean);
                        const vendor = findVendor((productData as any)?.supplier) || findVendor(r.supplier) || undefined;
                        const liveCurrentStock = (productData as any)?.current_stock;
                        const displayCurrentStock = liveCurrentStock ?? r.current_stock;
                        const stockChanged = liveCurrentStock != null && r.current_stock != null && Number(liveCurrentStock) !== Number(r.current_stock);
                        const liveOptimal = (productData as any)?.optimal_stock;
                        const displayOptimal = liveOptimal ?? r.optimal_stock;
                        const displayShort = (Number(displayOptimal ?? 0)) - (Number(displayCurrentStock ?? 0));
                        return (
                          <React.Fragment key={r.id}>
                            {isNewGroup && (
                              <tr className="bg-sky-50/40 border-t border-sky-200 sticky top-[38px] z-[5]">
                                <td colSpan={99} className="px-3 py-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <VendorCategoryBadge category={getVendorCategory(currentSup)} />
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setSupplierHistorySupplier(currentSup); }}
                                      className="text-[15px] font-semibold text-sky-900 hover:text-brand-deep hover:underline cursor-pointer transition-colors"
                                      title="공급사 클릭 · 최신 발주이력 보기"
                                    >
                                      {displayVendorName(currentSup) || currentSup}
                                    </button>
                                    <span className="text-[15px] font-medium text-sky-500 tabular-nums">{groupRows.length}건</span>
                                    {/* 2026-08-23 · #182 · 공급사 발주이력 버튼 */}
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setSupplierHistorySupplier(currentSup); }}
                                      className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded text-[13px] font-semibold text-brand-deep bg-brand-tint border border-brand/15 hover:brightness-95 transition cursor-pointer"
                                      title={`${currentSup} · 최신 발주이력 보기`}
                                    >
                                      <History size={10}/>발주이력
                                    </button>
                                    {(() => {
                                      const selectedInGroup = groupRows.filter(r => selectedOrder.has(r.id));
                                      const targetRows = selectedInGroup.length > 0 ? selectedInGroup : groupRows;
                                      return (
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); openOrderModal(targetRows); }}
                                          disabled={sendingBulk}
                                          className="ml-auto inline-flex items-center gap-0.5 h-5 px-1.5 rounded text-[15px] font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                          title={`${currentSup} · ${targetRows.length}건 발주${selectedInGroup.length > 0 ? " (체크 선택)" : ""}`}
                                        >
                                          <Send size={10}/>발주({targetRows.length})
                                        </button>
                                      );
                                    })()}
                                  </div>
                                </td>
                              </tr>
                            )}
                            <tr className={`transition ${selectedOrder.has(r.id) ? "bg-rose-50/50" : "hover:bg-orange-50/30"}`}>
                              <td className="text-center px-0.5 py-1.5 align-top" onClick={(e) => { e.stopPropagation(); toggleOne(r.id); }}>
                                {selectedOrder.has(r.id)
                                  ? <CheckSquare size={13} className="text-rose-500 inline cursor-pointer" />
                                  : <Square size={13} className="text-zinc-300 hover:text-rose-500 inline cursor-pointer" />}
                              </td>
                              {isOrderGroupCollapsed("info") ? (
                                <td className="bg-sky-50/10 w-4"></td>
                              ) : (
                                <td className="px-0.5 py-1.5 align-top">
                                  <button
                                    onClick={() => setOrderPanelProduct({ code: r.product_code, name: r.product_name })}
                                    className="text-left text-[15px] font-medium text-zinc-800 hover:text-indigo-600 hover:underline break-words leading-snug cursor-pointer transition line-clamp-2"
                                    title={r.product_name || "상품 상세정보 조회"}
                                  >{r.product_name || "(상품명 없음)"}</button>
                                </td>
                              )}
                              {isOrderGroupCollapsed("stock") ? (
                                <td className="bg-amber-50/10 w-4"></td>
                              ) : (
                                <>
                                  <td
                                    className={`text-right px-0.5 py-1.5 tabular-nums font-bold text-[14px] bg-zinc-50/40 align-middle whitespace-nowrap ${stockChanged ? "text-orange-600" : "text-zinc-700"}`}
                                    title={stockChanged ? `요청 당시 ${r.current_stock ?? "-"} → 현재 ${displayCurrentStock ?? "-"} (변동)` : "현재 ERP 재고 (실시간)"}
                                  >
                                    {displayCurrentStock ?? "-"}
                                    {stockChanged && <span className="text-[14px] font-normal text-zinc-400 ml-1">({r.current_stock})</span>}
                                  </td>
                                  <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-[14px] text-zinc-700 bg-zinc-50/40 align-middle whitespace-nowrap">{displayOptimal ?? "-"}</td>
                                  <td className="text-right px-0.5 py-1.5 bg-rose-50/40 align-middle whitespace-nowrap">
                                    <span className="tabular-nums font-bold text-[14px] text-rose-600">{displayShort > 0 ? `-${displayShort}` : "0"}</span>
                                  </td>
                                </>
                              )}
                              {(() => {
                                const defaultQty = displayShort > 0 ? displayShort : 0;
                                const orderQty = orderQtyOverride.has(r.id) ? orderQtyOverride.get(r.id)! : defaultQty;
                                const prevPrice = prevPriceMap.get(r.product_code) ?? null;
                                const amount = prevPrice != null ? orderQty * prevPrice : null;
                                return (
                                  <>
                                    <td className="text-right px-0.5 py-1.5 bg-rose-50/30 align-middle">
                                      <input
                                        type="number" min={0}
                                        value={orderQty}
                                        onChange={e => {
                                          const v = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value) || 0);
                                          setOrderQtyOverride(prev => { const n = new Map(prev); n.set(r.id, v); return n; });
                                        }}
                                        onClick={e => e.stopPropagation()}
                                        className="w-16 h-7 px-1 rounded border border-rose-200 bg-white text-right tabular-nums font-bold text-[15px] text-rose-700 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep"
                                      />
                                    </td>
                                    <td className="text-right px-0.5 py-1.5 tabular-nums text-[14px] text-zinc-500 bg-rose-50/20 align-middle whitespace-nowrap">{prevPrice != null ? prevPrice.toLocaleString() : "-"}</td>
                                    <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-[15px] text-emerald-700 bg-rose-50/20 align-middle whitespace-nowrap">{amount != null ? amount.toLocaleString() : "-"}</td>
                                  </>
                                );
                              })()}
                            </tr>
                          </React.Fragment>
                        );
                      });
                    })()}
                    {orderReqsFiltered.length === 0 && (
                      <tr><td colSpan={12} className="text-center text-[15px] text-zinc-300 py-6">검색 결과 없음</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {/* 리사이즈 핸들 */}
      <div onMouseDown={onOrderResizeStart}
        className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-sky-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
        title="드래그하여 폭 조절">
        <span className="text-[15px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
      </div>

      {/* 우측: 상품 상세 */}
      {orderPanelLoading ? (
        <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0">
          <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
            <LoadingState label="불러오는 중..." size="normal" />
          </div>
        </div>
      ) : orderPanelError ? (
        <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0">
          <Card padding="md" rounded="xl" className="text-sm text-red-700">
            <div className="font-bold mb-1">조회 실패</div>
            <div className="text-[15px] font-mono">{orderPanelError}</div>
          </Card>
        </div>
      ) : (
        <ProductDetailRightPanel
          selected={orderPanelFull ? ({
            code: (orderPanelFull as any).product_code ?? (orderPanelFull as any).code ?? (orderPanelProduct?.code ?? ""),
            name: (orderPanelFull as any).product_name ?? (orderPanelFull as any).name ?? (orderPanelProduct?.name ?? ""),
            spec: (orderPanelFull as any).spec ?? "",
            ...orderPanelFull,
            realMap: (orderPanelFull as any).realMap ?? (orderPanelFull as any).real_map ?? null,
          } as ProductInfoType) : null}
          onClose={() => setOrderPanelProduct(null)}
          onProductUpdate={(u) => setOrderPanelFull(prev => prev ? { ...prev, ...u } : prev)}
          onRealMapUpdate={(v) => setOrderPanelFull(prev => prev ? { ...prev, real_map: v, realMap: v } : prev)}
          showChart={true}
          context="order-manage"
          editable={true}
          emptyMessage="리스트에서 상품을 클릭하세요"
          emptySub="상세 정보가 표시됩니다"
          onSupplierInfoOpen={(nm) => openSupplierInfo(nm)}
        />
      )}
    </div>

    {/* 2026-08-23 · #182 · 공급사 발주이력 모달 */}
    {supplierHistorySupplier && (
      <OrderHistorySupplierModal
        supplier={supplierHistorySupplier}
        onClose={() => setSupplierHistorySupplier(null)}
      />
    )}
  </div>
);
};
