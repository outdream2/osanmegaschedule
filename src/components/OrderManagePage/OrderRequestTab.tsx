// src/components/OrderManagePage/OrderRequestTab.tsx
// 2026-08-22 · Framework Phase 4 · 발주요청 탭 분리
import React from "react";
import { Loader2, ShoppingCart, CheckSquare, Square, Send, ChevronRight, ChevronDown, History } from "lucide-react";
// 2026-08-23 · #182 · 공급사별 발주이력 모달
import { OrderHistorySupplierModal } from "./OrderHistorySupplierModal";
import { Card } from "../common/Card";
import { PageToolbar } from "../common/PageToolbar";
// 2026-08-26 · 사용자 지시 · 적정재고 컬럼 리스트 상단 · 기준 일수 코멘트
import { OptimalStockNoteBanner } from "../common/OptimalStockNoteBanner";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";
import { Spinner } from "../common/Spinner";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { LoadingState } from "../common/LoadingState";
// 2026-08-25 · #107/#79 · 발주요청 프리미엄 UI · StepperInput (사용자 승인 v3 목업)
import { StepperInput } from "../common/StepperInput";
// 2026-08-29 · #154 · 판매중 필터 프레임워크 확산 · 판매중지 상품 자동 제외
import { SaleStatusFilter } from "../common/SaleStatusFilter";
import { useSaleStatusFilter } from "../../hooks/useSaleStatusFilter";
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
  // 2026-08-24 · v3 목업 확정 · 공급사별 그룹 접기/펼치기 · Set of supplier names collapsed
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());
  // 2026-08-29 · #154 · 판매중 필터 · products join (allProductsMap) 에서 sale_status 조회
  const { value: saleFilter, setValue: setSaleFilter, matches: saleMatches } = useSaleStatusFilter({ storageKey: "orderRequest.saleFilter" });
  // 판매중 필터 적용 파생 리스트 · orderReqsFiltered 는 부모 필터 유지
  const displayedReqs = React.useMemo(() => {
    if (saleFilter === "all") return orderReqsFiltered;
    return orderReqsFiltered.filter(r => {
      const cv = [r.product_code, r.product_code.replace(/^0+/, ""), r.product_code.padStart(8, "0")];
      const p = cv.map(c => allProductsMap[c]).find(Boolean) as any;
      return saleMatches(p?.sale_status);
    });
  }, [orderReqsFiltered, saleFilter, saleMatches, allProductsMap]);
  const toggleGroupCollapse = (sup: string) => {
    setCollapsedGroups(prev => {
      const n = new Set(prev);
      if (n.has(sup)) n.delete(sup); else n.add(sup);
      return n;
    });
  };
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

    {/* 2026-08-26 · 사용자 지시 · 적정재고 기준 일수 코멘트 */}
    <OptimalStockNoteBanner compact className="self-start" />

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
                <span className="text-[15px] text-zinc-400 font-normal">{displayedReqs.length}건</span>
                {/* 2026-08-29 · #154 · 판매중 필터 · products join (allProductsMap.sale_status) */}
                <SaleStatusFilter value={saleFilter} onChange={setSaleFilter} size="sm" />
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
              {/* 2026-08-24 · v3 목업 실적용 · 표 형식 · sticky thead · Attio/Linear 톤
                  상단 gradient accent (사용자 지시 · 랜딩 톤) · 헤더 폰트 +2 (12→14) */}
              <div className={`max-h-[50vh] lg:max-h-[75vh] overflow-auto relative rounded-xl border border-line bg-white ${orderLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                <span aria-hidden className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-20" />
                <table className="w-full text-[14px] sm:text-[15px] min-w-[720px] border-collapse [&_tbody_td]:text-[14px] sm:[&_tbody_td]:text-[15px] [&_thead_th]:text-[13px] sm:[&_thead_th]:text-[14px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="text-zinc-500 uppercase tracking-wider bg-zinc-100/70 border-b border-line">
                      <th className="text-center px-2 py-2.5 w-9">
                        <button onClick={toggleAll}
                          className="inline-flex items-center justify-center text-[12px] font-bold text-zinc-500 hover:text-brand-deep transition cursor-pointer"
                          title={allChecked ? "전체 선택 해제" : "전체 선택"}>
                          {allChecked ? <CheckSquare size={13} className="text-brand-deep" /> : <Square size={13} />}
                        </button>
                      </th>
                      {isOrderGroupCollapsed("info") ? (
                        <th className="w-4"></th>
                      ) : (
                        // 2026-08-26 · 사용자 지시 · 말줄임 금지 · 상품명 우선 넓게 (min 320)
                        <th onClick={() => handleOrderSort("name")} className="text-left px-3 py-2.5 cursor-pointer hover:bg-zinc-200/60 select-none font-bold" style={{ minWidth: 320 }}>상품명<span className="ml-1 text-zinc-400">{orderArrow("name") || "⇅"}</span></th>
                      )}
                      {isOrderGroupCollapsed("stock") ? (
                        <th className="w-4"></th>
                      ) : (
                        <>
                          <th onClick={() => handleOrderSort("current")} className="text-right px-2 py-2.5 w-14 cursor-pointer hover:bg-zinc-200/60 select-none font-bold">ERP<span className="ml-1 text-zinc-400">{orderArrow("current") || "⇅"}</span></th>
                          <th onClick={() => handleOrderSort("optimal")} className="text-right px-2 py-2.5 w-14 cursor-pointer hover:bg-zinc-200/60 select-none font-bold">적정<span className="ml-1 text-zinc-400">{orderArrow("optimal") || "⇅"}</span></th>
                          <th onClick={() => handleOrderSort("short")} className="text-right px-2 py-2.5 w-14 cursor-pointer hover:bg-zinc-200/60 select-none font-bold text-rose-600">부족<span className="ml-1 text-rose-300">{orderArrow("short") || "⇅"}</span></th>
                        </>
                      )}
                      {/* 주문수량 · 2026-08-26 사용자 지시 · 좁게 (85px) · 상품명에 공간 양보 */}
                      <th className="text-center px-2 py-2.5 font-bold text-sky-700 bg-sky-50/60 border-x border-sky-100" style={{ width: 85, minWidth: 85 }}>주문수량</th>
                      <th className="text-right px-2 py-2.5 w-16 font-bold">단가</th>
                      {/* 발주금액 · brand-tint 옅게 (v3 사용자 지시) */}
                      <th className="text-right px-2 py-2.5 w-20 font-bold text-brand-deep bg-brand-tint/50 border-l border-brand/10">발주금액<span className="ml-1 text-brand/40">▼</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {(() => {
                      const resolveSup = (r: OrderRequest): string => {
                        const cv = [r.product_code, r.product_code.replace(/^0+/, ""), r.product_code.padStart(8, "0")];
                        const p = cv.map(c => allProductsMap[c]).find(Boolean) as any;
                        return ((p?.supplier || r.supplier || "").trim()) || "(공급사 미지정)";
                      };
                      const sorted = [...displayedReqs].sort((a, b) => {
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
                        const isCollapsed = collapsedGroups.has(currentSup);
                        return (
                          <React.Fragment key={r.id}>
                            {isNewGroup && (
                              <tr
                                className="border-t border-brand/10 sticky top-[42px] z-[5] cursor-pointer transition-colors"
                                onClick={() => toggleGroupCollapse(currentSup)}
                                title={isCollapsed ? "펼치기" : "접기"}
                              >
                                {/* 2026-08-24 · 최신 트렌드 · 세로 accent 제거 · 부드러운 gradient · 상단 hairline
                                    · bg-gradient-to-b · 미묘한 depth · 위쪽 살짝 진하게 (Attio/Linear 톤) */}
                                <td colSpan={99} className="px-3 py-2 bg-gradient-to-b from-brand-tint/70 to-brand-tint/40 hover:from-brand-tint hover:to-brand-tint/60 border-b border-brand/10 transition-colors duration-200">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {/* 2026-08-24 · v3 · caret · 접기/펼치기 · 크게 (사용자 지시) */}
                                    <span className={`inline-flex items-center justify-center w-6 h-6 text-[16px] font-bold text-brand-deep transition-transform ${isCollapsed ? "-rotate-90" : ""}`}>▾</span>
                                    <VendorCategoryBadge category={getVendorCategory(currentSup)} />
                                    {/* 2026-08-24 · 사용자 지시 · 보라 X · Sky-700 · Attio 톤
                                        · 딥네이비 브랜드와 동일 파란 계열 · 자연스러운 조화 */}
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setSupplierHistorySupplier(currentSup); }}
                                      className="text-[15px] font-bold text-sky-800 hover:text-brand-deep hover:underline underline-offset-[3px] decoration-sky-400/60 cursor-pointer transition-colors"
                                      title="공급사 클릭 · 최신 발주이력 보기"
                                    >
                                      {displayVendorName(currentSup) || currentSup}
                                    </button>
                                    <span className="text-[13px] font-semibold text-ink-soft tabular-nums">{groupRows.length}건</span>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setSupplierHistorySupplier(currentSup); }}
                                      className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-white border border-line transition cursor-pointer"
                                      title={`${currentSup} · 최신 발주이력 보기`}
                                    >
                                      <History size={10}/>발주이력
                                    </button>
                                    {(() => {
                                      const selectedInGroup = groupRows.filter(r => selectedOrder.has(r.id));
                                      const targetRows = selectedInGroup.length > 0 ? selectedInGroup : groupRows;
                                      const subtotal = targetRows.reduce((s, rr) => {
                                        const price = prevPriceMap.get(rr.product_code) ?? 0;
                                        const qty = orderQtyOverride.has(rr.id) ? orderQtyOverride.get(rr.id)! : Math.max(0, Number((allProductsMap[rr.product_code]?.optimal_stock ?? rr.optimal_stock) ?? 0) - Number((allProductsMap[rr.product_code]?.current_stock ?? rr.current_stock) ?? 0));
                                        return s + qty * price;
                                      }, 0);
                                      return (
                                        <>
                                          {subtotal > 0 && (
                                            <span className="text-[13px] font-bold text-brand-deep tabular-nums ml-auto mr-2">
                                              {subtotal.toLocaleString()}<span className="text-[11px] font-medium text-ink-soft ml-0.5">원</span>
                                            </span>
                                          )}
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); openOrderModal(targetRows); }}
                                            disabled={sendingBulk}
                                            className={`${subtotal > 0 ? "" : "ml-auto"} inline-flex items-center gap-1 h-6 px-2 rounded-md text-[12px] font-bold text-white bg-gradient-to-br from-rose-500 to-rose-600 hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-sm`}
                                            title={`${currentSup} · ${targetRows.length}건 발주${selectedInGroup.length > 0 ? " (체크 선택)" : ""}`}
                                          >
                                            <Send size={10}/>발주({targetRows.length})
                                          </button>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </td>
                              </tr>
                            )}
                            {!isCollapsed && (() => {
                              // 2026-08-29 · #79 v4 · row-critical · 부족 재고 gradient 강조
                              const currentStock = Number((allProductsMap[r.product_code]?.current_stock ?? r.current_stock) ?? 0);
                              const optimalStock = Number((allProductsMap[r.product_code]?.optimal_stock ?? r.optimal_stock) ?? 0);
                              const shortageQty = Math.max(0, optimalStock - currentStock);
                              const isCritical = shortageQty > 0 && currentStock === 0; // 재고 0 · 최우선
                              const isShort = shortageQty > 0 && !isCritical;            // 부족
                              const isSelected = selectedOrder.has(r.id);
                              const rowCls = isSelected
                                ? "bg-sky-50/60"
                                : isCritical
                                  ? "bg-gradient-to-r from-rose-50/60 via-transparent to-transparent hover:from-rose-50"
                                  : isShort
                                    ? "bg-gradient-to-r from-amber-50/40 via-transparent to-transparent hover:from-amber-50/70"
                                    : "hover:bg-zinc-50/60";
                              return (
                            <tr className={`transition-colors ${rowCls}`}>
                              <td className="text-center px-0.5 py-1.5 align-top" onClick={(e) => { e.stopPropagation(); toggleOne(r.id); }}>
                                {selectedOrder.has(r.id)
                                  ? <CheckSquare size={13} className="text-rose-500 inline cursor-pointer" />
                                  : <Square size={13} className="text-zinc-300 hover:text-rose-500 inline cursor-pointer" />}
                              </td>
                              {isOrderGroupCollapsed("info") ? (
                                <td className="bg-zinc-50/20 w-4"></td>
                              ) : (
                                // 2026-08-24 · 상품명 · 말줄임표 X · 줄바꿈 (사용자 지시 · 원칙 등록) · 2줄 이내 min-w 300px
                                <td className="px-3 py-2 align-middle" style={{ minWidth: 260 }}>
                                  <button
                                    onClick={() => setOrderPanelProduct({ code: r.product_code, name: r.product_name })}
                                    className="text-left text-[15px] font-semibold text-ink hover:text-sky-800 hover:underline break-words whitespace-normal leading-snug cursor-pointer transition"
                                    title={r.product_name || "상품 상세정보 조회"}
                                  >{r.product_name || "(상품명 없음)"}</button>
                                </td>
                              )}
                              {isOrderGroupCollapsed("stock") ? (
                                <td className="bg-zinc-50/20 w-4"></td>
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
                                  <td className="text-right px-0.5 py-1.5 align-middle whitespace-nowrap">
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
                                    {/* 2026-08-25 · #107/#79 · v3 목업 · StepperInput (−  input  +) · accent tint */}
                                    <td className="text-center px-2 py-2 align-middle bg-sky-50/40 border-x border-sky-100/60">
                                      <div onClick={e => e.stopPropagation()} className="inline-flex">
                                        <StepperInput
                                          value={orderQty}
                                          onChange={(v) => {
                                            const n = v === "" ? 0 : Math.max(0, Number(v) || 0);
                                            setOrderQtyOverride(prev => { const m = new Map(prev); m.set(r.id, n); return m; });
                                          }}
                                          min={0}
                                          size="sm"
                                        />
                                      </div>
                                    </td>
                                    <td className="text-right px-2 py-2 tabular-nums text-[14px] text-ink-soft align-middle whitespace-nowrap">{prevPrice != null ? prevPrice.toLocaleString() : "-"}</td>
                                    {/* 발주금액 · brand-tint 옅게 · 결과 강조 (v3) */}
                                    <td className="text-right px-2 py-2 tabular-nums font-bold text-[15px] text-brand-deep align-middle whitespace-nowrap bg-brand-tint/30 border-l border-brand/10">{amount != null ? amount.toLocaleString() : "-"}</td>
                                  </>
                                );
                              })()}
                            </tr>
                              );
                            })()}
                          </React.Fragment>
                        );
                      });
                    })()}
                    {displayedReqs.length === 0 && (
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
