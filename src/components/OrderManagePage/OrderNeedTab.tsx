// src/components/OrderManagePage/OrderNeedTab.tsx
// 2026-08-22 · Framework Phase 4 · 발주필요 탭 분리
// 2026-08-31 · OrderNeedFilters · OrderNeedTable 로 분리 (슬림화)
import React from "react";
import { ClipboardList } from "lucide-react";
import { Card } from "../common/Card";
import { PageToolbar } from "../common/PageToolbar";
// 2026-09-10 · #46 재개 · 사용자 지시 · 판매정보 패널 재활성화 · 상품 상세는 모달로 (부모에서 관리)
import { SalesRecommendationPanel, type RecommendedProduct } from "./SalesRecommendationPanel";
// 2026-09-14 · #87 · 스코어 기반 · 자동 추천 알고리즘
import { computePriorityScore } from "../../lib/orderPriorityScore";
import { api } from "../../lib/apiClient";
import { LoadingState } from "../common/LoadingState";
import { CARD_BASE } from "../../styles/tokens";
// 2026-08-25 · 사용자 지시 A · OFF 조건 + 리스트 클릭 시 · 발주필요 추가 confirm
import { useConfirm } from "../../hooks/useConfirm";
// 2026-08-29 · #154 · 판매중 필터 프레임워크 확산
import { useSaleStatusFilter } from "../../hooks/useSaleStatusFilter";
import { OrderNeedFilters } from "./OrderNeedFilters";
import { OrderNeedTable } from "./OrderNeedTable";
import type { ProductInfo, OrderNeedFilterConfig, OrderRequest } from "./OrderManagePage.types";
// 2026-09-10 · 사용자 지시 · 발주필요 페이지에도 · 적정재고 기준 일수 안내 (발주요청 탭과 동일 위치)
import { OptimalStockNoteBanner } from "../common/OptimalStockNoteBanner";
// 2026-09-15 · #39 Phase B · 발주필요 상단 · "요청 진행중 N건" 접힘 카드
//   · 업계 표준 PO Lifecycle · 라인 이동 + 상단 접힘 카드 하이브리드
import { OrderInProgressCard } from "./OrderInProgressCard";

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
  requestedAtMap?: Map<string, string>;
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
  /** 2026-09-15 · #39 Phase B · 요청 진행중 상품 리스트 (status='requested') · 상단 접힘 카드 표시 */
  orderReqs?: OrderRequest[];
  /** 2026-09-15 · #39 Phase B · 발주요청 탭으로 이동 · 접힘 카드 우측 버튼 · 부모 라우팅 콜백 */
  onNavigateToOrderRequest?: () => void;
}

export const OrderNeedTab: React.FC<OrderNeedTabProps> = ({
  lowStockFiltered, productsLoading, invStockMap, requestedCodes, requestedAtMap, requestingOrder,
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
  orderReqs, onNavigateToOrderRequest,
}) => {
  const confirm = useConfirm();
  // 2026-09-10 · 사용자 지시 · 판매중 기본값 강제 · storageKey bump v2
  const { value: saleFilter, setValue: setSaleFilter, matches: saleMatches } = useSaleStatusFilter({ storageKey: "orderNeed.saleFilter.v2" });

  // 2026-09-15 · #39 · 업계 표준 PO Lifecycle 리서치 (Odoo·Zoho·NetSuite·Cin7·SAP Ariba 100%) 결과 반영
  //   · 라인 아이템 (발주필요 리스트 행) · 완전 이동 · 요청 완료 시 리스트에서 제거 · 발주요청 리스트로
  //   · 잔류형 (요청됨 배지로만 잔류) · 업계 사례 0건 · 노이즈·판단 방해
  //   · 대신 · 상단 CollapseCard "요청 진행중 N건" · 이미 요청한 상품 즉시 확인 가능
  //   · 검색어 있음 or 조건적용 OFF · allProductsMap 전체 · 요청됨 상품도 노출 (✓ 요청됨·N일전 뱃지)
  //   · 요청 후 2-3일 도착 지연 · 지연 tier 뱃지 · D+N 색상 강화 (formatDaysAgo)
  const displayed = React.useMemo(
    () => lowStockFiltered.filter(p => {
      if (!saleMatches(p.sale_status)) return false;
      return true;
    }),
    [lowStockFiltered, saleMatches]
  );
  void requestedCodes; void lowStockSearch;

  // 2026-09-10 · 사용자 지시 · 상품명 클릭 · 우측 판매정보 패널 갱신 + 상품 상세 모달 open
  //   · 우측 · 판매정보 (계절·이벤트·명절 등) · SalesRecommendationPanel
  //   · 상품 상세 정보 · ProductDetailModal · 부모(OrderManagePage) 렌더
  const handleRowClick = React.useCallback(async (p: ProductInfo) => {
    const code = getCode(p);
    const name = getName(p);
    setNeedPanelProduct({ code, name });
    // 상품명 클릭 시 · 상품 상세 모달도 함께 open
    if (onOpenDetail) {
      setTimeout(() => onOpenDetail(), 50); // needPanelProduct fetch 시작 후 open
    }
  }, [getCode, getName, setNeedPanelProduct, onOpenDetail]);

  // 2026-09-14 · #87 · 스코어 기반 · 자동 추천 · 이벤트 코드 셋 fetch
  const [eventCodes, setEventCodes] = React.useState<Set<string>>(new Set());
  const [seasonalCodes, setSeasonalCodes] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get<{ events?: Array<{ type: string; recurring: boolean; products?: Array<{ product_code: string }> }> }>(`/api/events/today`);
        if (!alive) return;
        const ec = new Set<string>();
        const sc = new Set<string>();
        for (const ev of data?.events ?? []) {
          const isSeasonal = ev.recurring && ["spring", "summer", "fall", "winter"].includes(ev.type);
          for (const p of ev.products ?? []) {
            if (!p.product_code) continue;
            (isSeasonal ? sc : ec).add(p.product_code);
          }
        }
        setEventCodes(ec);
        setSeasonalCodes(sc);
      } catch { /* silent */ }
    })();
    return () => { alive = false; };
  }, []);

  // 2026-09-14 · #87 · 스코어 계산 · Top 5 추천
  const recommendations = React.useMemo<RecommendedProduct[]>(() => {
    const scored = displayed.map(p => {
      const code = getCode(p);
      const name = getName(p);
      const extra = needExtraMap.get(code);
      const res = computePriorityScore({
        current: Number(p.current_stock ?? 0) || 0,
        optimal: Number(p.optimal_stock ?? 0) || 0,
        saleMonth: extra?.saleMonth ?? null,
        saleQuarter: extra?.saleQuarter ?? null,
        eventCodes, seasonalCodes,
        product_code: code,
      });
      return {
        product_code: code,
        product_name: name,
        current: Number(p.current_stock ?? 0) || 0,
        optimal: Number(p.optimal_stock ?? 0) || 0,
        score: res.score,
        reason: res.reason,
        daysLeft: res.daysLeft,
        supplier: (p as any).supplier ?? null,
      } as RecommendedProduct;
    });
    // 요청됨 · score 0 · 제외
    return scored
      .filter(r => r.score > 0 && !requestedCodes.has(r.product_code))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [displayed, needExtraMap, eventCodes, seasonalCodes, getCode, getName, requestedCodes]);
  // 미사용 참조 방지 (기존 로직)
  void confirm; void requestedCodes; void handleRequestOrder; void openSupplierInfo;

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

      {/* 2026-09-15 · #39 Phase B · 요청 진행중 · 상단 접힘 카드 · 업계 표준 PO Lifecycle
          라인 이동 원칙 · 요청됨 상품 리스트에는 표시 X · 여기서 즉시 확인 가능 · 지연 tier 강조 */}
      {orderReqs && orderReqs.length > 0 && onNavigateToOrderRequest && (
        <OrderInProgressCard orderReqs={orderReqs} onNavigateToOrderRequest={onNavigateToOrderRequest} />
      )}

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
                requestedAtMap={requestedAtMap}
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
          /* 2026-09-10 · 사용자 지시 · 우측 · 판매정보 패널 · 상품 선택 무관 · 계절·이벤트 정보 (전체)
              · 상품명 클릭 · 우측 갱신 X · 모달만 open
              · 2026-09-14 · #85 · 이벤트 상품 · [발주 추가] 액션 · handleRequestOrder 연결 */
          <SalesRecommendationPanel
            product={null}
            saleMonth={null}
            saleQuarter={null}
            onApplyQty={() => {}}
            onOpenDetail={() => {}}
            onClose={() => {}}
            requestedCodes={requestedCodes}
            recommendations={recommendations}
            onRequestProduct={(code, name) => {
              // 이벤트 상품 발주 추가 · 최소한의 ProductInfo 구성
              const fakeInfo = { product_code: code, product_name: name } as unknown as ProductInfo;
              void handleRequestOrder(fakeInfo);
            }}
          />
        )}
      </div>
    </div>
  );
};
