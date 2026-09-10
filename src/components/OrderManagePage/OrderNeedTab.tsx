// src/components/OrderManagePage/OrderNeedTab.tsx
// 2026-08-22 · Framework Phase 4 · 발주필요 탭 분리
// 2026-08-31 · OrderNeedFilters · OrderNeedTable 로 분리 (슬림화)
import React from "react";
import { ClipboardList } from "lucide-react";
import { Card } from "../common/Card";
import { PageToolbar } from "../common/PageToolbar";
// 2026-09-10 · #46 롤백 · 판매 추천 패널 별로 · 사용자 지시 · 기존 ProductDetailRightPanel 복원
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { LoadingState } from "../common/LoadingState";
import { CARD_BASE } from "../../styles/tokens";
import type { ProductInfo as ProductInfoType } from "../../lib/productsCache";
// 2026-08-25 · 사용자 지시 A · OFF 조건 + 리스트 클릭 시 · 발주필요 추가 confirm
import { useConfirm } from "../../hooks/useConfirm";
// 2026-08-29 · #154 · 판매중 필터 프레임워크 확산
import { useSaleStatusFilter } from "../../hooks/useSaleStatusFilter";
import { OrderNeedFilters } from "./OrderNeedFilters";
import { OrderNeedTable } from "./OrderNeedTable";
import type { ProductInfo, OrderNeedFilterConfig } from "./OrderManagePage.types";
// 2026-09-10 · 사용자 지시 · 발주필요 페이지에도 · 적정재고 기준 일수 안내 (발주요청 탭과 동일 위치)
import { OptimalStockNoteBanner } from "../common/OptimalStockNoteBanner";

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
  needConditionApply: boolean;
  setNeedConditionApply: (v: boolean) => void;
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
  /** 2026-08-30 · 사용자 지시 · 발주필요 좌측 · 수량 조정 · orderQtyOverride 공유 */
  orderQtyOverride?: Map<string, number>;
  setOrderQtyOverride?: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  /** 2026-09-10 · #46 · 사용자 지시 · 상품 상세 정보 모달 트리거 (상품명 클릭 · [상세 정보] 버튼) */
  onOpenDetail?: () => void;
}

export const OrderNeedTab: React.FC<OrderNeedTabProps> = ({
  lowStockFiltered, productsLoading, invStockMap, requestedCodes, requestingOrder,
  selectedLowStock, bulkRequesting, needExtraMap, dbVendorCategories,
  lowStockSearch, setLowStockSearch, needConditionApply, setNeedConditionApply, needCategoryFilter, setNeedCategoryFilter,
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
  orderQtyOverride, setOrderQtyOverride,
  onOpenDetail,
}) => {
  const confirm = useConfirm();
  // 2026-09-10 · 사용자 지시 · 판매중 기본값 강제 · storageKey bump v2
  const { value: saleFilter, setValue: setSaleFilter, matches: saleMatches } = useSaleStatusFilter({ storageKey: "orderNeed.saleFilter.v2" });

  // 2026-09-10 · #42 · 최신 UX 트렌드 · 사용자 지시
  //   · 검색어 없음 · 요청됨 상품 자동 숨김 (기본 리스트 · 노이즈 방지 · 발주요청 탭으로 이동)
  //   · 검색어 있음 · 모두 표시 (재요청 UX · 사용자가 특정 상품 찾을 때 · 이미 요청 상태도 확인 가능)
  //   · 요청됨 상품 클릭 시 · 기존 3-way confirm (재요청 / 상세확인 / 취소)
  const hasSearch = !!lowStockSearch.trim();
  const displayed = React.useMemo(
    () => lowStockFiltered.filter(p => {
      if (!saleMatches(p.sale_status)) return false;
      const code = getCode(p);
      if (!hasSearch && requestedCodes.has(code)) return false;
      return true;
    }),
    [lowStockFiltered, saleMatches, requestedCodes, getCode, hasSearch]
  );

  // 2026-09-10 · 사용자 지시 · 상품명 클릭 · 항상 · 우측 상세 정보 표시
  //   · 이전 · 재고 초과/이미 요청 등 confirm 팝업 · 사용자 UX 방해 · 팝업 제거
  //   · 발주 요청은 · row 오른쪽 [요청]/[✓] 버튼으로 별도 처리
  const handleRowClick = React.useCallback(async (p: ProductInfo) => {
    const code = getCode(p);
    const name = getName(p);
    setNeedPanelProduct({ code, name });
  }, [getCode, getName, setNeedPanelProduct]);
  // 미사용 참조 방지 (기존 로직 · handleRequestOrder·requestedCodes·confirm)
  void confirm; void requestedCodes; void handleRequestOrder;

  return (
    <div className="flex flex-col gap-2">
      {/* 상단 툴바 */}
      <PageToolbar
        icon={<ClipboardList size={18} strokeWidth={2.2} />}
        title="발주 필요"
        count={displayed.length}
        leftSlot={
          <span className="text-[15px] text-ink-soft font-medium tracking-tight">현재고 &lt; 적정재고</span>
        }
      />

      {/* 2026-09-10 · 사용자 지시 · 적정재고 기준 일수 안내 (발주요청 탭과 동일) */}
      <OptimalStockNoteBanner compact className="self-start" />

      {/* 통합 조건 카드 */}
      <OrderNeedFilters
        displayedCount={displayed.length}
        dbVendorCategories={dbVendorCategories}
        lowStockSearch={lowStockSearch}
        setLowStockSearch={setLowStockSearch}
        needConditionApply={needConditionApply}
        setNeedConditionApply={setNeedConditionApply}
        saleFilter={saleFilter}
        setSaleFilter={setSaleFilter}
        needCategoryFilter={needCategoryFilter}
        setNeedCategoryFilter={setNeedCategoryFilter}
        needSalesMonthEnabled={needSalesMonthEnabled}
        setNeedSalesMonthEnabled={setNeedSalesMonthEnabled}
        needSalesQuarterEnabled={needSalesQuarterEnabled}
        setNeedSalesQuarterEnabled={setNeedSalesQuarterEnabled}
        needInlineMaxSalesMonth={needInlineMaxSalesMonth}
        needInlineMaxSalesQuarter={needInlineMaxSalesQuarter}
        updateInline={updateInline}
        inlineFiltering={inlineFiltering}
        inlineActive={inlineActive}
        deferredCurrentEnabled={deferredCurrentEnabled}
        deferredInlineCurrent={deferredInlineCurrent}
        deferredSalesMonthEnabled={deferredSalesMonthEnabled}
        deferredInlineSalesMonth={deferredInlineSalesMonth}
        deferredSalesQuarterEnabled={deferredSalesQuarterEnabled}
        deferredInlineSalesQuarter={deferredInlineSalesQuarter}
        resetInlineFilter={resetInlineFilter}
        needAdvancedOpen={needAdvancedOpen}
        setNeedAdvancedOpen={setNeedAdvancedOpen}
        orderNeedConfig={orderNeedConfig}
        setOrderNeedConfig={setOrderNeedConfig}
        setNeedSortKey={setNeedSortKey}
        setNeedSortDir={setNeedSortDir}
      />

      {/* 하단 split · 좌우 분할 */}
      <div className="flex flex-col lg:flex-row gap-2 items-stretch lg:min-h-[720px]">
        {/* 좌측: 발주필요 리스트 */}
        <div
          className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
          style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? needPanelWidth : undefined }}
        >
          <section className="bg-white rounded-xl border border-line p-4 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
            {!lowStockCollapsed && (
              <OrderNeedTable
                displayed={displayed}
                productsLoading={productsLoading}
                invStockMap={invStockMap}
                requestedCodes={requestedCodes}
                requestingOrder={requestingOrder}
                selectedLowStock={selectedLowStock}
                bulkRequesting={bulkRequesting}
                needExtraMap={needExtraMap}
                needSortKey={needSortKey}
                needSortDir={needSortDir}
                handleNeedSort={handleNeedSort}
                needArrow={needArrow}
                isNeedCollapsed={isNeedCollapsed}
                orderQtyOverride={orderQtyOverride}
                setOrderQtyOverride={setOrderQtyOverride}
                getCode={getCode}
                getName={getName}
                getVendorCategory={getVendorCategory}
                findVendor={findVendor}
                openSupplierInfo={openSupplierInfo}
                toggleLowStockOne={toggleLowStockOne}
                clearLowStockSelection={clearLowStockSelection}
                setSelectedLowStock={setSelectedLowStock}
                bulkRequestOrder={bulkRequestOrder}
                handleRowClick={handleRowClick}
                handleRequestOrder={handleRequestOrder}
              />
            )}
          </section>
        </div>

        {/* 리사이즈 핸들 */}
        <div onMouseDown={onNeedResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-amber-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절">
          <span className="text-[15px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 우측: 상품 상세 정보 · 2026-09-10 · #46 롤백 · 사용자 지시 · 오늘 아침 버전 (ProductDetailRightPanel) 복원 */}
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
              <div className="text-[15px]">{needPanelError}</div>
            </Card>
          </div>
        ) : (
          <ProductDetailRightPanel
            selected={needPanelFull ? ({
              code: (needPanelFull as any).product_code ?? (needPanelFull as any).code ?? (needPanelProduct?.code ?? ""),
              name: (needPanelFull as any).product_name ?? (needPanelFull as any).name ?? (needPanelProduct?.name ?? ""),
              spec: (needPanelFull as any).spec ?? "",
              ...needPanelFull,
            } as ProductInfoType) : null}
            onClose={() => setNeedPanelProduct(null)}
            onProductUpdate={(u) => setNeedPanelFull(prev => prev ? { ...prev, ...u } : prev)}
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
};
