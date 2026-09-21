// 2026-08-22 · Framework Phase 4 · PurchaseHistoryTab.tsx large-file 분리
// 3개 UI 섹션 · props-driven pure display
//   · FilterBar · 상단 필터바 (viewMode 토글 + 기간 + 새로고침)
//   · ByVendorPanel · 공급사별 SplitPanel (좌 SupplierTab + 우 VendorHeader·SubTabs)
//   · ByProductPanel · 상품별 SplitPanel (좌 상품리스트 + 우 상품상세/파이차트)

import React from "react";
import { Building2, Package, RefreshCw, Info, ArrowRight, X } from "lucide-react";
import { SortHeader } from "../common/SortHeader";
import { SegmentedControl } from "../common/SegmentedControl";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { SplitPanel } from "../common/SplitPanel";
import { ListLoading } from "../common/ListLoading";
import { AccentBar } from "../common/AccentBar";
import { GradientAccent } from "../common/GradientAccent";
import { InlineLabel } from "../common/InlineLabel";
import { CARD_BASE } from "../../styles/tokens";
import { EmptyState } from "../common/EmptyState";
import { SplitRightEmpty } from "../common/SplitRightEmpty";
import { SplitRightError } from "../common/SplitRightError";
import { StatusPill } from "../common/StatusPill";
import { SeasonButtons } from "../common/SeasonButtons";
import { PeriodSelector } from "../common/PeriodSelector";
import { SupplierTab } from "../StockManagePage/SupplierTab";
// 2026-08-23 · #198 Phase 3 · ByProductPanel · SplitListPanel v3 이관
import { SplitListPanel } from "../common/SplitListPanel";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import VendorHeaderPanel from "./PurchaseHistoryTab/VendorHeaderPanel";
import PurchaseSubTabs, {
  type PurchaseLedgerRow,
  type PurchaseDetailRow,
  type TabKey as PurchaseSubTabKey,
  CategoryPieChart,
  MonthlyPieChart,
  TopProductsPieChart,
} from "./PurchaseHistoryTab/PurchaseSubTabs";
import ProductRowCard, { type ProductSummary } from "./PurchaseHistoryTab/ProductRowCard";
import ProductPurchaseDetailPanel, {
  type ProductPurchaseRow,
} from "./PurchaseHistoryTab/ProductPurchaseDetailPanel";
// 2026-09-18 · 사용자 지시 · (주)·주식회사 표시 정제
import { displayVendorName } from "../../utils/vendorNameNormalize";
import type { Vendor as VendorRecord } from "../LandingPage/VendorListEditor";
import type { VendorItem, DataSource, SourceDiagnostics, ViewMode, ProductSort, ProductSortDir } from "./PurchaseHistoryTab.types";

// ═══════════════════════════════════════════════════════════════════════════
// 1) FilterBar · 상단 필터바 (viewMode 토글 · 기간 · 새로고침)
// ═══════════════════════════════════════════════════════════════════════════

// 2026-09-20 · #324 · 판매상태 필터 타입
type SaleStatusFilter = "all" | "selling" | "stopped";

interface FilterBarProps {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  selectedVendor: VendorItem | null;
  ledgerRowsCount: number;
  productListCount: number;
  summarySource: DataSource;
  summaryDiagnostics: SourceDiagnostics | null;
  detailSource: DataSource;
  periodMonths: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  setPeriodMonths: (v: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void;
  periodSeason: SeasonKey | null;
  setPeriodSeason: (v: SeasonKey | null) => void;
  ledgerLoading: boolean;
  allDetailsLoading: boolean;
  // 2026-09-20 · #324 · 판매상태 필터
  saleStatusFilter: SaleStatusFilter;
  setSaleStatusFilter: (v: SaleStatusFilter) => void;
  onRefreshVendor: () => void;
  onRefreshProducts: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  viewMode, setViewMode, selectedVendor,
  ledgerRowsCount, productListCount,
  summarySource: _summarySource, summaryDiagnostics: _summaryDiagnostics, detailSource: _detailSource,
  periodMonths, setPeriodMonths, periodSeason, setPeriodSeason,
  ledgerLoading, allDetailsLoading,
  saleStatusFilter, setSaleStatusFilter,
  onRefreshVendor, onRefreshProducts,
}) => {
  // 2026-09-20 · #324 · 판매상태 옵션 색상
  const saleStatusOpts: { value: SaleStatusFilter; label: string; activeCls: string }[] = [
    { value: "all",     label: "전체",    activeCls: "bg-zinc-700 text-white" },
    { value: "selling", label: "판매중",  activeCls: "bg-emerald-600 text-white" },
    { value: "stopped", label: "판매중지", activeCls: "bg-rose-500 text-white" },
  ];

  return (
    <div className={`${CARD_BASE} px-4 py-2.5 flex flex-col gap-2 shrink-0`}>
      {/* 행 1 · 타이틀 + 뷰모드 + 판매상태 + 새로고침 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2.5 shrink-0">
          <AccentBar />
          {viewMode === "by-vendor"
            ? <Building2 size={16} className="text-brand-deep shrink-0" />
            : <Package size={16} className="text-brand-deep shrink-0" />}
          <span className="text-[17px] font-bold text-ink tracking-tight">매입이력</span>
          {viewMode === "by-vendor" && selectedVendor && (
            <StatusPill tone="brand" size="md">{ledgerRowsCount}건</StatusPill>
          )}
          {viewMode === "by-product" && (
            <StatusPill tone="brand" size="md">{productListCount}종</StatusPill>
          )}
          {/* 2026-08-31 · 사용자 지시 · ERP·OCR 배지 제거 · summarySource/detailSource UI 미노출 */}
        </div>

        {/* 뷰 모드 토글 · 2026-08-29 · SegmentedControl pills variant 이관
            2026-08-25 · 사용자 지시 · 공급사별 을 앞으로 · 기본 탭으로 (재변경) */}
        <SegmentedControl<ViewMode>
          value={viewMode}
          onChange={setViewMode}
          ariaLabel="매입이력 뷰 모드"
          variant="pills"
          size="sm"
          options={[
            { value: "by-vendor",  label: <><Building2 size={13} />공급사별</>, title: "공급사 단위로 매입이력 조회 · 기본 탭" },
            { value: "by-product", label: <><Package size={13} />상품별</>,    title: "상품 단위로 매입이력 조회 (최근 1년)" },
          ]}
        />

        {/* 2026-09-20 · #324 · 판매상태 필터 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <InlineLabel size="sm">판매상태</InlineLabel>
          <div className="flex items-center gap-1">
            {saleStatusOpts.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => setSaleStatusFilter(o.value)}
                className={`h-6 px-2.5 text-[14px] font-semibold rounded-md transition cursor-pointer ${
                  saleStatusFilter === o.value
                    ? o.activeCls
                    : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 bg-transparent"
                }`}
                title={`판매상태 · ${o.label}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 새로고침 */}
        {viewMode === "by-vendor" && selectedVendor && (
          <button
            type="button"
            onClick={onRefreshVendor}
            disabled={ledgerLoading}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-line bg-white hover:bg-emerald-50 hover:border-emerald-300 text-zinc-400 hover:text-emerald-500 transition disabled:opacity-40 cursor-pointer"
            title="새로고침"
          >
            <RefreshCw size={13} className={ledgerLoading ? "animate-spin" : ""} />
          </button>
        )}
        {viewMode === "by-product" && (
          <button
            type="button"
            onClick={onRefreshProducts}
            disabled={allDetailsLoading}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-line bg-white hover:bg-sky-50 hover:border-sky-300 text-zinc-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer"
            title="상품별 매입이력 새로고침"
          >
            <RefreshCw size={13} className={allDetailsLoading ? "animate-spin" : ""} />
          </button>
        )}
      </div>

      {/* 행 2 · 기간 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 2026-08-17 · 기간 UI 프레임워크 통일 · PeriodSelector 공통 · 딥네이비 */}
        <InlineLabel size="sm">기간</InlineLabel>
        <PeriodSelector
          options={[
            { value: 0, label: "10일", title: "최근 10일" },
            { value: 1, label: "1개월", title: "최근 1개월" },
            { value: 2, label: "2개월", title: "최근 2개월" },
            { value: 3, label: "3개월", title: "최근 3개월" },
            { value: 4, label: "4개월", title: "최근 4개월" },
            { value: 5, label: "5개월", title: "최근 5개월" },
            { value: 6, label: "6개월", title: "최근 6개월" },
          ]}
          value={periodMonths}
          onChange={(v) => { setPeriodMonths(v as 0|1|2|3|4|5|6); setPeriodSeason(null); }}
          size="sm"
          ariaLabel="매입이력 조회기간"
        />
        <SeasonButtons
          value={periodSeason ?? null}
          onChange={(v) => { setPeriodSeason(v); }}
          size="sm"
          hideLabel
        />
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 2) ByVendorPanel · 공급사별 SplitPanel (좌 SupplierTab · 우 VendorHeader + SubTabs)
// ═══════════════════════════════════════════════════════════════════════════

interface ByVendorPanelProps {
  vendors: VendorItem[];
  selectedVendor: VendorItem | null;
  setSelectedVendor: (v: VendorItem | null) => void;
  subTab: PurchaseSubTabKey;
  setSubTab: (k: PurchaseSubTabKey) => void;
  detailRows: PurchaseDetailRow[];
  detailLoading: boolean;
  ledgerRows: PurchaseLedgerRow[];
  ledgerLoading: boolean;
  ledgerError: string | null;
  setLedgerError: (e: string | null) => void;
  highlightId: string | number | null;
  periodMonths: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  setPeriodMonths: (v: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void;
  periodSeason: SeasonKey | null;
  setPeriodSeason: (v: SeasonKey | null) => void;
  openVendorInfo: (v: VendorRecord) => void;
  loadVendorData: (supplier: string) => void;
  /** 2026-09-18 · #93 · 옵션 C · 하이브리드 배너 · union 모드 여부 */
  unionMode?: boolean;
  /** union 모드 진입 콜백 · 배너 클릭 */
  onEnableUnion?: () => void;
  /** union 모드 해제 콜백 · 정확 검색 복귀 */
  onDisableUnion?: () => void;
  /** 유사 vendor · 매입이력 존재 개수 · 배너 텍스트 */
  similarWithHistoryCount?: number;
  /** union 병합 대상 vendor 실제 조회 개수 · 헤더 뱃지 */
  unionVendorCount?: number;
}

export const ByVendorPanel: React.FC<ByVendorPanelProps> = ({
  vendors, selectedVendor, setSelectedVendor, subTab, setSubTab,
  detailRows, detailLoading, ledgerRows, ledgerLoading, ledgerError, setLedgerError,
  highlightId, periodMonths, setPeriodMonths, periodSeason, setPeriodSeason,
  openVendorInfo, loadVendorData,
  unionMode = false, onEnableUnion, onDisableUnion,
  similarWithHistoryCount = 0, unionVendorCount = 0,
}) => {
  // 매입이력 없음 · 유사 vendor 존재 · 배너 표시 조건
  //   · vendor 선택 · 로딩 아님 · 에러 없음 · union 모드 아님 · ledger 0건 · 유사 이력 vendor > 0
  const showEmptyBanner =
    !!selectedVendor
    && !ledgerLoading
    && !ledgerError
    && !unionMode
    && ledgerRows.length === 0
    && similarWithHistoryCount > 0;
  const selectedVendorDisplay = selectedVendor
    ? (displayVendorName(selectedVendor.company_name) || selectedVendor.company_name)
    : "";
  return (
    <SplitPanel
      key="by-vendor"
      // 2026-09-10 · #35 · 사용자 지시 · 매입이력 공급사별 · 좌우 5:5 초기화 · storageKey bump v3
      storageKey="purchaseHistory.byVendor.leftWidth.v3"
      /* 2026-09-11 · #78 · defaultWidth 제거 · SplitPanel 자동 5:5 */
      minWidth={320}
      maxWidth={1200}
      dividerColor="emerald"
      autoFitLeft
      wrapLeft={false}
      wrapRight={false}
      leftClassName="max-h-[calc(100dvh-100px)] lg:max-h-[calc(100dvh-180px)] overflow-y-auto"
      className="flex-1 min-h-0 gap-2 lg:gap-0"
      mobileRightAsModal={true}
      mobileModalTitle={selectedVendor?.company_name ? (displayVendorName(selectedVendor.company_name) || selectedVendor.company_name) : "공급사 상세"}
      mobileOpen={!!selectedVendor}
      onMobileClose={() => setSelectedVendor(null)}
      left={
        <SupplierTab
          embedded
          showExtraPurchaseColumns
          showCycleColumn
          selectedSupplierName={selectedVendor?.company_name ?? null}
          /* 2026-09-01 · 사용자 지시 · 부모 기간 변경 시 · 공급사 리스트 재fetch → loading 스피너 프레임워크 자동 동작 */
          periodMonths={periodMonths}
          periodSeason={periodSeason}
          onSupplierClick={(supplierName) => {
            const clean = (s: string): string =>
              s.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim();
            const target = clean(supplierName);
            const targetLc = target.toLowerCase();
            let v = vendors.find(x => clean(x.company_name) === target);
            if (!v) v = vendors.find(x => clean(x.company_name).toLowerCase() === targetLc);
            if (!v) {
              const norm = (s: string) => s
                .replace(/[\s()㈜㈐]/g, "")
                .replace(/^\(주\)/g, "")
                .replace(/주식회사/g, "")
                .replace(/\(주\)$/g, "")
                .toLowerCase();
              const nt = norm(target);
              if (nt) v = vendors.find(x => norm(clean(x.company_name)) === nt);
            }
            if (v) {
              setSelectedVendor(v);
              setSubTab("ledger");
            } else {
              setSelectedVendor({
                id: -1,
                company_name: target,
                category: null,
                contact_name: null,
                phone: null,
                email: null,
                business_number: null,
                note: null,
                created_at: null,
              } as VendorItem);
              setSubTab("ledger");
            }
          }}
        />
      }
      right={
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
        {!selectedVendor ? (
          <SplitRightEmpty icon={Package} title="좌측에서 공급사를 선택하세요" hint="매입이력 · 상품별 집계 · 매입 추이가 표시됩니다" />
        ) : ledgerError ? (
          <SplitRightError
            title="원장 조회 실패"
            message={ledgerError}
            onRetry={() => {
              setLedgerError(null);
              if (selectedVendor) loadVendorData(selectedVendor.company_name);
            }}
            retryLabel="다시 시도"
          />
        ) : (
          <>
            <VendorHeaderPanel
              vendor={selectedVendor}
              detailRows={detailRows}
              loading={detailLoading}
              onEdit={() => openVendorInfo(selectedVendor as unknown as VendorRecord)}
            />
            {/* 2026-09-18 · #93 · 옵션 C · 하이브리드 배너
                · 매입이력 없음 + 유사 vendor 존재 → 병합 모드 진입 유도 */}
            {showEmptyBanner && (
              <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 shrink-0">
                <div className="flex items-start gap-3">
                  <Info size={18} className="text-sky-600 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold text-sky-900">
                      &ldquo;{selectedVendorDisplay}&rdquo; · 매입이력 없음
                    </div>
                    <div className="text-[13px] text-sky-700 mt-1">
                      유사 vendor <span className="font-bold">{similarWithHistoryCount}건</span>에 매입이력 있음
                    </div>
                    <button
                      type="button"
                      onClick={() => onEnableUnion?.()}
                      className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[13px] font-bold transition cursor-pointer"
                    >
                      유사 매입이력 보기 <ArrowRight size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* 2026-09-18 · #93 · union 모드 인디케이터 · 해제 버튼 · 대상 vendor 수 */}
            {unionMode && (
              <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 shrink-0 flex items-center gap-2 flex-wrap">
                <Info size={14} className="text-amber-600 shrink-0" />
                <span className="text-[13px] font-bold text-amber-900">
                  유사 매입이력 병합
                </span>
                <span className="text-[13px] text-amber-800">
                  ({unionVendorCount}개 vendor)
                </span>
                <button
                  type="button"
                  onClick={() => onDisableUnion?.()}
                  className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-md bg-white hover:bg-amber-100 border border-amber-300 text-amber-800 text-[12px] font-semibold transition cursor-pointer"
                  title="정확 검색으로 복귀"
                >
                  <X size={11} strokeWidth={2.5} /> 병합 해제
                </button>
              </div>
            )}
            <PurchaseSubTabs
              ledgerRows={ledgerRows}
              ledgerLoading={ledgerLoading}
              detailRows={detailRows}
              detailLoading={detailLoading}
              activeTab={subTab}
              onTabChange={setSubTab}
              highlightId={highlightId}
              periodMonths={periodMonths}
              periodSeason={periodSeason}
              onPeriodChange={(months, season) => {
                setPeriodMonths(months);
                setPeriodSeason(season);
              }}
            />
          </>
        )}
        </div>
      }
    />
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 3) ByProductPanel · 상품별 SplitPanel (좌 상품리스트 · 우 상품상세/파이차트)
// ═══════════════════════════════════════════════════════════════════════════

interface ByProductPanelProps {
  filteredProducts: ProductSummary[];
  filteredAllDetails: PurchaseDetailRow[];
  selectedProductKey: string | null;
  setSelectedProductKey: (k: string | null) => void;
  selectedProduct: ProductSummary | null;
  selectedProductRows: ProductPurchaseRow[];
  productSearch: string;
  setProductSearch: (v: string) => void;
  productSort: ProductSort;
  setProductSort: (v: ProductSort) => void;
  // #324-2차 · 표형식 · 정렬 방향 · 헤더 클릭 핸들러
  productSortDir: ProductSortDir;
  toggleProductSort: (k: ProductSort) => void;
  allDetailsLoading: boolean;
  allDetailsError: string | null;
  loadAllDetails: (force?: boolean) => void;
}

// ─── SortTh (th 래퍼 · ProductInfoPage 패턴 통일) ────────────────────────────
const SortTh: React.FC<{
  label: React.ReactNode;
  colKey: ProductSort;
  activeKey: ProductSort;
  dir: ProductSortDir;
  onToggle: (k: ProductSort) => void;
  className?: string;
  align?: "left" | "right";
}> = ({ label, colKey, activeKey, dir, onToggle, className = "", align = "left" }) => (
  <th
    className={`py-2 text-[12px] font-bold tracking-wide uppercase select-none ${
      align === "right" ? "text-right pr-2" : "text-left pl-3"
    } ${className}`}
  >
    <SortHeader
      label={label}
      columnKey={colKey}
      activeKey={activeKey}
      activeDir={dir}
      onToggle={onToggle}
      arrowStyle="arrow"
      activeColor="brand"
      align={align}
    />
  </th>
);

export const ByProductPanel: React.FC<ByProductPanelProps> = ({
  filteredProducts, filteredAllDetails,
  selectedProductKey, setSelectedProductKey,
  selectedProduct, selectedProductRows,
  productSearch, setProductSearch,
  productSort, setProductSort: _setProductSort, // backward compat · toggleProductSort 사용
  productSortDir, toggleProductSort,
  allDetailsLoading, allDetailsError, loadAllDetails,
}) => {
  return (
    <SplitPanel
      key="by-product"
      storageKey="purchaseHistory.byProduct.leftWidth.v3"
      minWidth={320}
      maxWidth={1200}
      dividerColor="sky"
      autoFitLeft
      wrapLeft={false}
      wrapRight={false}
      leftClassName="max-h-[80vh] lg:max-h-none"
      className="flex-1 min-h-0 gap-2 lg:gap-0"
      mobileRightAsModal={true}
      mobileModalTitle={selectedProduct?.product_name ?? "상품 상세"}
      mobileOpen={!!selectedProductKey}
      onMobileClose={() => setSelectedProductKey(null)}
      left={
        /* #324-2차 · 표형식 + 자동정렬 헤더 (SplitListPanel 프레임워크 유지) */
        <SplitListPanel
          topAccent
          search={productSearch}
          onSearchChange={setProductSearch}
          searchPlaceholder="상품명 · 코드 검색"
          bodyClassName="bg-white rounded-xl border border-line shadow-sm flex-1 min-h-0 max-h-[calc(100dvh-200px)] flex flex-col overflow-hidden mt-2"
        >
          <>
          {/* sticky 정렬 헤더 · md 이상에서만 표시 */}
          <div className="sticky top-0 z-10 hidden md:block">
            <table className="w-full border-collapse table-fixed">
              <colgroup>
                <col style={{ width: "auto", minWidth: 120 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 68 }} />
              </colgroup>
              <thead className="bg-zinc-50/95 backdrop-blur-sm border-b-2 border-zinc-200">
                <tr className="text-zinc-500">
                  <SortTh label="상품명" colKey="name" activeKey={productSort} dir={productSortDir} onToggle={toggleProductSort} />
                  <th className="py-2 text-[12px] font-bold tracking-wide uppercase select-none text-right pr-2 text-zinc-400">코드</th>
                  <SortTh label="매입액" colKey="amount" activeKey={productSort} dir={productSortDir} onToggle={toggleProductSort} align="right" />
                  <SortTh label="판매량" colKey="sale_qty" activeKey={productSort} dir={productSortDir} onToggle={toggleProductSort} align="right" />
                  <SortTh label="판매금액" colKey="sale_amt" activeKey={productSort} dir={productSortDir} onToggle={toggleProductSort} align="right" />
                  <SortTh label="최근" colKey="recent" activeKey={productSort} dir={productSortDir} onToggle={toggleProductSort} align="right" />
                </tr>
              </thead>
            </table>
          </div>
          {/* 본문 */}
          <div className="flex-1 min-h-0 overflow-y-auto">
          {allDetailsLoading ? (
            <ListLoading label="상품 매입이력 불러오는 중..." tone="sky" />
          ) : allDetailsError ? (
            <div className="p-3">
              <SplitRightError
                title="로드 실패"
                message={allDetailsError}
                onRetry={() => loadAllDetails(true)}
              />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-8 text-center text-[16px] text-zinc-300">
              {productSearch ? "검색 결과 없음" : "해당 기간 매입 상품 없음"}
            </div>
          ) : (
            <>
            {/* ─── PC 테이블 뷰 (md 이상) ─── */}
            <table className="w-full border-collapse table-fixed text-[14px] hidden md:table">
              <colgroup>
                <col style={{ width: "auto", minWidth: 120 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 68 }} />
              </colgroup>
              <tbody className="divide-y divide-zinc-100">
                {filteredProducts.map(p => {
                  const key = String(p.product_code ?? "").trim() || p.product_name;
                  const active = selectedProductKey === key;
                  const saleQty = p.sale_qty ?? null;
                  const saleAmt = p.sale_amount ?? null;
                  const lastDate = p.last_purchase_date
                    ? p.last_purchase_date.slice(5)
                    : null;
                  return (
                    <tr
                      key={`ptr-${key}`}
                      onClick={() => setSelectedProductKey(key)}
                      className={`cursor-pointer transition-colors border-l-2 ${
                        active
                          ? "bg-sky-50 border-sky-500"
                          : "hover:bg-zinc-50/70 border-transparent"
                      }`}
                    >
                      <td className="pl-3 pr-2 py-2.5 align-middle">
                        <div className={`text-[14px] font-semibold leading-tight whitespace-normal break-words break-keep ${
                          active ? "text-sky-800" : "text-ink"
                        }`}>
                          {p.product_name || <span className="text-zinc-400 font-normal">(이름없음)</span>}
                        </div>
                      </td>
                      <td className="pr-2 py-2.5 align-middle text-right">
                        <span className="text-[12px] text-zinc-400 tabular-nums">
                          {p.product_code ?? <span className="text-zinc-200">-</span>}
                        </span>
                      </td>
                      <td className="pr-2 py-2.5 align-middle text-right">
                        <span className={`text-[14px] font-bold tabular-nums ${
                          p.total_amount > 0 ? (active ? "text-sky-700" : "text-zinc-700") : "text-zinc-300"
                        }`}>
                          {p.total_amount > 0
                            ? p.total_amount >= 10_000_000
                              ? `${(p.total_amount / 10_000_000).toFixed(1)}천만`
                              : p.total_amount >= 1_000_000
                                ? `${Math.round(p.total_amount / 10_000)}만`
                                : p.total_amount.toLocaleString()
                            : <span className="text-zinc-300 font-normal">-</span>}
                        </span>
                      </td>
                      <td className="pr-2 py-2.5 align-middle text-right">
                        <span className={`text-[14px] font-semibold tabular-nums ${
                          saleQty != null && saleQty > 0 ? "text-rose-600" : "text-zinc-300"
                        }`}>
                          {saleQty != null ? `${saleQty.toLocaleString()}` : "-"}
                        </span>
                      </td>
                      <td className="pr-2 py-2.5 align-middle text-right">
                        <span className={`text-[14px] font-bold tabular-nums ${
                          saleAmt != null && saleAmt > 0 ? "text-rose-700" : "text-zinc-300"
                        }`}>
                          {saleAmt != null && saleAmt > 0
                            ? saleAmt >= 1_000_000
                              ? `${Math.round(saleAmt / 10_000)}만`
                              : saleAmt.toLocaleString()
                            : "-"}
                        </span>
                      </td>
                      <td className="pr-2 py-2.5 align-middle text-right">
                        <span className="text-[12px] text-zinc-400 tabular-nums whitespace-nowrap">
                          {lastDate ?? <span className="text-zinc-200">-</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* ─── 모바일 카드 뷰 (md 미만) ─── */}
            <div className="md:hidden flex flex-col divide-y divide-zinc-100">
              {filteredProducts.map(p => {
                const key = String(p.product_code ?? "").trim() || p.product_name;
                const active = selectedProductKey === key;
                const saleQty = p.sale_qty ?? null;
                const saleAmt = p.sale_amount ?? null;
                const lastDate = p.last_purchase_date
                  ? p.last_purchase_date.slice(5)
                  : null;
                const amtStr = p.total_amount > 0
                  ? p.total_amount >= 10_000_000
                    ? `${(p.total_amount / 10_000_000).toFixed(1)}천만`
                    : p.total_amount >= 1_000_000
                      ? `${Math.round(p.total_amount / 10_000)}만`
                      : p.total_amount.toLocaleString()
                  : null;
                const saleAmtStr = saleAmt != null && saleAmt > 0
                  ? saleAmt >= 1_000_000
                    ? `${Math.round(saleAmt / 10_000)}만`
                    : saleAmt.toLocaleString()
                  : null;
                return (
                  <div
                    key={`ptc-${key}`}
                    onClick={() => setSelectedProductKey(key)}
                    className={`cursor-pointer px-3 py-2.5 flex flex-col gap-1 border-l-2 transition-colors ${
                      active
                        ? "bg-sky-50 border-sky-500"
                        : "hover:bg-zinc-50/70 border-transparent"
                    }`}
                  >
                    {/* 줄 1 · 상품명 */}
                    <div className={`text-[15px] font-semibold leading-snug break-words whitespace-normal break-keep ${
                      active ? "text-sky-800" : "text-ink"
                    }`}>
                      {p.product_name || <span className="text-zinc-400 font-normal">(이름없음)</span>}
                    </div>
                    {/* 줄 2 · 코드 · 최근 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.product_code && (
                        <span className="text-[13px] text-zinc-400 tabular-nums">
                          #{p.product_code}
                        </span>
                      )}
                      {lastDate && (
                        <span className="text-[13px] text-zinc-400 tabular-nums">
                          최근 {lastDate}
                        </span>
                      )}
                    </div>
                    {/* 줄 3 · 매입액 · 판매금액 */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[14px] font-bold tabular-nums ${
                        amtStr ? (active ? "text-sky-700" : "text-zinc-700") : "text-zinc-300"
                      }`}>
                        {amtStr ?? "-"}
                      </span>
                      <div className="flex items-center gap-3">
                        {saleQty != null && (
                          <span className={`text-[13px] font-semibold tabular-nums ${
                            saleQty > 0 ? "text-rose-500" : "text-zinc-300"
                          }`}>
                            판매 {saleQty.toLocaleString()}
                          </span>
                        )}
                        {saleAmtStr && (
                          <span className="text-[14px] font-bold tabular-nums text-rose-700">
                            {saleAmtStr}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}
          </div>
          </>
        </SplitListPanel>
      }
      right={
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
        {!selectedProduct ? (
          <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-auto">
            {/* 상단 gradient accent */}
            <div className="relative bg-white rounded-xl border border-line shadow-sm px-4 py-2.5 flex items-center gap-2 shrink-0 overflow-hidden">
              <GradientAccent size="thin" className="z-10 rounded-t-xl" />
              <Package size={14} className="text-sky-500 shrink-0" />
              <span className="text-[17px] font-bold text-zinc-800">상품별 매입 분석</span>
              <span className="text-[17px] text-zinc-400 font-semibold ml-1">
                {filteredAllDetails.length > 0
                  ? `${filteredAllDetails.length}건 분석`
                  : allDetailsLoading ? "로딩 중..." : "데이터 없음"}
              </span>
              <span className="ml-auto text-[16px] text-zinc-400">좌측에서 상품을 선택하면 원장 표시</span>
            </div>
            {allDetailsLoading ? (
              <div className="bg-white rounded-xl border border-line flex-1 flex items-center justify-center text-zinc-400 text-[16px] gap-2 min-h-[300px]">
                <Spinner size={14} />
                <span>매입 데이터 로딩 중...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 pb-2">
                <CategoryPieChart rows={filteredAllDetails} />
                <TopProductsPieChart rows={filteredAllDetails} />
                <div className="xl:col-span-2">
                  <MonthlyPieChart rows={filteredAllDetails} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <ProductPurchaseDetailPanel
            product={selectedProduct}
            rows={selectedProductRows}
            loading={allDetailsLoading}
          />
        )}
        </div>
      }
    />
  );
};
