// 2026-08-22 · Framework Phase 4 · PurchaseHistoryTab.tsx large-file 분리
// 3개 UI 섹션 · props-driven pure display
//   · FilterBar · 상단 필터바 (viewMode 토글 + 기간 + 새로고침)
//   · ByVendorPanel · 공급사별 SplitPanel (좌 SupplierTab + 우 VendorHeader·SubTabs)
//   · ByProductPanel · 상품별 SplitPanel (좌 상품리스트 + 우 상품상세/파이차트)

import React from "react";
import { Building2, Package, RefreshCw } from "lucide-react";
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
import type { Vendor as VendorRecord } from "../LandingPage/VendorListEditor";
import type { VendorItem, DataSource, SourceDiagnostics, ViewMode, ProductSort } from "./PurchaseHistoryTab.types";

// ═══════════════════════════════════════════════════════════════════════════
// 1) FilterBar · 상단 필터바 (viewMode 토글 · 기간 · 새로고침)
// ═══════════════════════════════════════════════════════════════════════════

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
  onRefreshVendor: () => void;
  onRefreshProducts: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  viewMode, setViewMode, selectedVendor,
  ledgerRowsCount, productListCount,
  summarySource, summaryDiagnostics, detailSource,
  periodMonths, setPeriodMonths, periodSeason, setPeriodSeason,
  ledgerLoading, allDetailsLoading,
  onRefreshVendor, onRefreshProducts,
}) => {
  return (
    <div className={`${CARD_BASE} px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0`}>
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

      {/* 2026-08-17 · 기간 UI 프레임워크 통일 · PeriodSelector 공통 · 딥네이비 */}
      <div className="flex flex-wrap items-center gap-2">
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
}

export const ByVendorPanel: React.FC<ByVendorPanelProps> = ({
  vendors, selectedVendor, setSelectedVendor, subTab, setSubTab,
  detailRows, detailLoading, ledgerRows, ledgerLoading, ledgerError, setLedgerError,
  highlightId, periodMonths, setPeriodMonths, periodSeason, setPeriodSeason,
  openVendorInfo, loadVendorData,
}) => {
  return (
    <SplitPanel
      key="by-vendor"
      storageKey="purchaseHistory.byVendor.leftWidth"
      defaultWidth={380}
      minWidth={320}
      maxWidth={1200}
      dividerColor="emerald"
      autoFitLeft
      wrapLeft={false}
      wrapRight={false}
      leftClassName="max-h-[calc(100dvh-100px)] lg:max-h-none"
      className="flex-1 min-h-0 gap-2 lg:gap-0"
      mobileRightAsModal={true}
      mobileModalTitle={selectedVendor?.company_name ?? "공급사 상세"}
      mobileOpen={!!selectedVendor}
      onMobileClose={() => setSelectedVendor(null)}
      left={
        <SupplierTab
          embedded
          showExtraPurchaseColumns
          showCycleColumn
          selectedSupplierName={selectedVendor?.company_name ?? null}
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
  allDetailsLoading: boolean;
  allDetailsError: string | null;
  loadAllDetails: (force?: boolean) => void;
}

export const ByProductPanel: React.FC<ByProductPanelProps> = ({
  filteredProducts, filteredAllDetails,
  selectedProductKey, setSelectedProductKey,
  selectedProduct, selectedProductRows,
  productSearch, setProductSearch, productSort, setProductSort,
  allDetailsLoading, allDetailsError, loadAllDetails,
}) => {
  return (
    <SplitPanel
      key="by-product"
      storageKey="purchaseHistory.byProduct.leftWidth"
      defaultWidth={380}
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
        /* 2026-08-23 · #198 Phase 3 · ByProductPanel · SplitListPanel v3 이관
           · search + sort chips (6개 · 커스텀 색상) · filters slot
           · 그리드 header + list · children slot
           · custom loading/error/empty · body children 내부 유지 (v3 loading prop 미사용) */
        <SplitListPanel
          topAccent
          search={productSearch}
          onSearchChange={setProductSearch}
          searchPlaceholder="상품명 · 코드 검색"
          filters={
            <div className="flex flex-col gap-2 w-full">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[14px] font-semibold text-zinc-400 uppercase tracking-wider shrink-0">정렬</span>
                {([
                  { k: "amount"   as const, label: "매입액",   color: "sky" as const },
                  { k: "recent"   as const, label: "최근매입", color: "sky" as const },
                  { k: "count"    as const, label: "매입건수", color: "sky" as const },
                  { k: "sale_qty" as const, label: "판매량",   color: "rose" as const },
                  { k: "sale_amt" as const, label: "판매금액", color: "rose" as const },
                  { k: "name"     as const, label: "가나다",   color: "sky" as const },
                ]).map(o => {
                  const activeCls = o.color === "rose" ? "bg-rose-500 text-white" : "bg-sky-500 text-white";
                  return (
                    <button
                      key={o.k}
                      type="button"
                      onClick={() => setProductSort(o.k)}
                      className={`h-5 px-1.5 text-[14px] font-semibold rounded transition cursor-pointer ${
                        productSort === o.k
                          ? activeCls
                          : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >{o.label}</button>
                  );
                })}
              </div>
            </div>
          }
          bodyClassName="bg-white rounded-xl border border-line shadow-sm flex-1 min-h-0 max-h-[calc(100dvh-200px)] flex flex-col overflow-hidden mt-2"
        >
          <>
          <div className="px-3 py-1.5 border-b border-zinc-100 bg-zinc-50/60 shrink-0 grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center text-[15px] font-bold text-zinc-500 uppercase tracking-wider">
            <span>상품</span>
            <span className="text-right whitespace-nowrap text-amber-600">매입</span>
            <span className="text-right whitespace-nowrap text-rose-600">판매</span>
            <span className="text-right whitespace-nowrap">최근</span>
          </div>
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
            <div className="py-8 text-center text-[15px] text-zinc-300">
              {productSearch ? "검색 결과 없음" : "해당 기간 매입 상품 없음"}
            </div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {filteredProducts.map(p => {
                const key = String(p.product_code ?? "").trim() || p.product_name;
                return (
                  <ProductRowCard
                    key={`prc-${key}`}
                    product={p}
                    active={selectedProductKey === key}
                    onSelect={() => setSelectedProductKey(key)}
                  />
                );
              })}
            </div>
          )}
          </div>
          </>
        </SplitListPanel>
      }
      right={
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
        {!selectedProduct ? (
          <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-auto">
            {/* 2026-08-25 · v9 · 상단 gradient accent */}
            <div className="relative bg-white rounded-xl border border-line shadow-sm px-4 py-2.5 flex items-center gap-2 shrink-0 overflow-hidden">
              <GradientAccent size="thin" className="z-10 rounded-t-xl" />
              <Package size={14} className="text-sky-500 shrink-0" />
              <span className="text-[15px] font-bold text-zinc-800">상품별 매입 분석</span>
              <span className="text-[15px] text-zinc-400 font-semibold ml-1">
                {filteredAllDetails.length > 0
                  ? `${filteredAllDetails.length}건 분석`
                  : allDetailsLoading ? "로딩 중..." : "데이터 없음"}
              </span>
              <span className="ml-auto text-[14px] text-zinc-400">좌측에서 상품을 선택하면 원장 표시</span>
            </div>
            {allDetailsLoading ? (
              <div className="bg-white rounded-xl border border-line flex-1 flex items-center justify-center text-zinc-400 text-[14px] gap-2 min-h-[300px]">
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
