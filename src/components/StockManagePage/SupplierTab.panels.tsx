// 2026-08-22 · Framework Phase 4 · SupplierTab.tsx large-file 분리
// 3개 UI 섹션 · props-driven pure display
//   · SupplierDetailPanel · 우측 공급사 상세 (KPI 4카드 · 상품 리스트 테이블)
//   · SupplierDetailModalWrapper · 공급사 상세 모달 wrapper
//   · ProductPurchaseHistoryModalWrapper · 매입 이력 모달 wrapper

import React from "react";
import { Building2, Loader2 as LoaderIcon, X as XIcon } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { VendorDetailModal } from "../LandingPage/VendorListEditor";
import { ProductPurchaseHistoryModal } from "./ProductPurchaseHistoryModal";
// 2026-08-23 · #191 Phase A · Modal 프레임워크 이관
import { Modal } from "../common/Modal";
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { InlineLabel } from "../common/InlineLabel";
import { PeriodSelector } from "../common/PeriodSelector";
import { SeasonButtons } from "../common/SeasonButtons";
// 2026-08-23 · #185 · PageToolbar 통일
import { PageToolbar } from "../common/PageToolbar";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { fmtWonCompact } from "../../lib/format";
import type { SupplierAgg, SupDetailSortKey } from "./SupplierTab.types";
import { fmt } from "./SupplierTab.types";

const fmtWon = fmtWonCompact;

// ═══════════════════════════════════════════════════════════════════════════
// 1) SupplierDetailPanel · 우측 공급사 상세 (KPI + 상품 리스트 테이블)
// ═══════════════════════════════════════════════════════════════════════════

interface SupplierDetailPanelProps {
  supplierSelectedObj: SupplierAgg | null;
  setSupplierSelectedKey: (v: string | null) => void;
  vendorCategoryMap: Record<string, string | null>;
  supplierBalanceMap: Record<string, { balance: number; invoice_date: string | null }>;
  supplierRowsMap: Record<string, any[]>;
  supplierRowsLoading: Set<string>;
  supDetailSort: { key: SupDetailSortKey; dir: "asc" | "desc" };
  toggleSupDetailSort: (k: SupDetailSortKey) => void;
  sortSupDetailRows: (rows: any[]) => any[];
  loadFlowSelectedProduct: (p: any) => void;
  setProductPurchaseModal: (v: { product_code: string; product_name: string } | null) => void;
  openSupplierDetailModal: (supplierName: string) => void;
  flowSelectedProduct: any | null;
  setFlowSelectedProduct: React.Dispatch<React.SetStateAction<any | null>>;
}

export const SupplierDetailPanel: React.FC<SupplierDetailPanelProps> = ({
  supplierSelectedObj, setSupplierSelectedKey,
  vendorCategoryMap, supplierBalanceMap, supplierRowsMap, supplierRowsLoading,
  supDetailSort, toggleSupDetailSort, sortSupDetailRows,
  loadFlowSelectedProduct, setProductPurchaseModal, openSupplierDetailModal,
  flowSelectedProduct, setFlowSelectedProduct,
}) => {
  return (
    <div className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0 transition-transform duration-150 ${supplierSelectedObj ? "fixed inset-0 z-50 bg-zinc-50 overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible" : ""}`}>
      {supplierSelectedObj && (
        <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-line shadow-md">
          <div className="flex items-center gap-2 px-3 py-2">
            <button type="button" onClick={() => setSupplierSelectedKey(null)}
              className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 cursor-pointer shrink-0" title="닫기">
              <XIcon size={16} strokeWidth={2.4} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold text-zinc-800 break-keep whitespace-normal leading-tight">{supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim()}</div>
              <div className="text-[14px] tabular-nums text-zinc-500 break-words whitespace-normal leading-tight">
                {supplierSelectedObj.supplier_code ? `#${supplierSelectedObj.supplier_code}` : ""} · 재고자산 {fmtWon(supplierSelectedObj.totalStockAmount)}
              </div>
            </div>
          </div>
        </div>
      )}
      {!supplierSelectedObj ? (
        <div className={`${CARD_BASE} flex-1 flex flex-col items-center justify-center p-10 text-zinc-400 min-h-[400px]`}>
          <Building2 size={40} className="mb-3 opacity-30" />
          <div className="text-sm font-bold">리스트에서 공급사를 클릭하세요</div>
          <div className="text-[15px] mt-1">재고자산 요약 · 상품 리스트</div>
        </div>
      ) : (
        <div className={`${CARD_BASE} overflow-hidden p-4 flex flex-col gap-3`}>
          <div className="flex items-center gap-2 flex-wrap">
            <Building2 size={16} className="text-sky-600 shrink-0" />
            {(() => {
              const nm = supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "";
              return <VendorCategoryBadge category={vendorCategoryMap[nm] ?? vendorCategoryMap[supplierSelectedObj.supplier ?? ""] ?? null} />;
            })()}
            <span className="text-base font-bold text-zinc-800 break-keep">{supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim()}</span>
            {supplierSelectedObj.supplier_code && <span className="text-[14px] tabular-nums text-zinc-500 bg-zinc-100 rounded px-1.5 py-0.5">#{supplierSelectedObj.supplier_code}</span>}
            <button type="button"
              onClick={() => openSupplierDetailModal(supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "")}
              className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-md text-[14px] font-bold text-sky-700 bg-sky-50 border border-sky-300 hover:bg-sky-100 cursor-pointer transition"
              title="공급사 정보 조회·수정">
              <Building2 size={11} /> 조회·수정
            </button>
          </div>
          {(() => {
            const supName = supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "";
            const balInfo = supplierBalanceMap[supName] ?? supplierBalanceMap[supplierSelectedObj.supplier ?? ""] ?? null;
            return (
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] p-2.5" title={balInfo?.invoice_date ? `기준일 ${balInfo.invoice_date}` : "최신 잔고 없음"}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <div className="text-[12px] font-semibold text-ink-soft tracking-tight">최신잔고</div>
                  </div>
                  <div className="text-[14px] font-extrabold text-amber-700 tabular-nums leading-tight">{balInfo ? fmtWon(balInfo.balance) : "-"}</div>
                </div>
                <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] p-2.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <div className="text-[12px] font-semibold text-ink-soft tracking-tight">재고자산</div>
                  </div>
                  <div className="text-[14px] font-extrabold text-emerald-700 tabular-nums leading-tight">{fmtWon(supplierSelectedObj.totalStockAmount)}</div>
                </div>
                <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] p-2.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                    <div className="text-[12px] font-semibold text-ink-soft tracking-tight">매입수량</div>
                  </div>
                  <div className="text-[14px] font-extrabold text-sky-700 tabular-nums leading-tight">{fmt(supplierSelectedObj.purchaseQty)}</div>
                </div>
                <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] p-2.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    <div className="text-[12px] font-semibold text-ink-soft tracking-tight">취급상품</div>
                  </div>
                  <div className="text-[14px] font-extrabold text-ink tabular-nums leading-tight">{fmt(supplierSelectedObj.itemCount)}종</div>
                </div>
              </div>
            );
          })()}
          {(() => {
            const key = `${supplierSelectedObj.supplier_code ?? "-"}::${supplierSelectedObj.supplier}`;
            const rows = supplierRowsMap[key];
            const isLoading = supplierRowsLoading.has(key);
            if (isLoading) return <div className="flex items-center gap-2 py-4"><Spinner size={12} tone="zinc" label="상품 로드 중..." labelSize={15} /></div>;
            if (!rows) return <div className="text-[15px] text-zinc-400 py-4">공급사를 클릭하면 상품 리스트가 로드됩니다</div>;
            if (rows.length === 0) return <div className="text-[15px] text-zinc-400 py-4">상품 데이터 없음</div>;
            const supDetailArrow = (k: SupDetailSortKey) => supDetailSort.key === k ? (supDetailSort.dir === "desc" ? " ▼" : " ▲") : " ⇅";
            const sortedDetail = sortSupDetailRows(rows);
            const fmtPurchaseDate = (d: string | null | undefined): string => {
              if (!d) return "-";
              const dt = new Date(d);
              if (isNaN(dt.getTime())) return "-";
              return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`;
            };
            const detailCycleStr = (r: any): string => {
              const cnt = Number(r.purchase_count ?? 0);
              if (cnt < 2) return "-";
              const firstDate = String(r.first_purchase_date ?? r.last_purchase_date ?? "");
              const lastDate = String(r.last_purchase_date ?? "");
              if (!firstDate || !lastDate || firstDate === lastDate) return "-";
              const days = Math.round((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (86400 * 1000));
              const cycle = cnt > 1 ? Math.round(days / (cnt - 1)) : 0;
              return cycle > 0 ? `${cycle}일` : "-";
            };
            return (
              <div className="overflow-auto max-h-[60vh] rounded-lg border border-zinc-100">
                <table className="w-full text-[14px] min-w-[560px]">
                  <thead className="sticky top-0 bg-white z-10 border-b border-zinc-100">
                    <tr className="text-[15px] text-zinc-400 uppercase tracking-wider">
                      <th className="text-left px-1 py-1.5 w-6">#</th>
                      <th onClick={() => toggleSupDetailSort("name")} className={`text-left px-1 py-1.5 cursor-pointer select-none hover:bg-zinc-50 transition ${supDetailSort.key === "name" ? "text-zinc-800 font-bold" : ""}`} title="상품명 정렬">상품명{supDetailArrow("name")}</th>
                      <th onClick={() => toggleSupDetailSort("current")} className={`text-right px-1 py-1.5 w-12 cursor-pointer select-none hover:bg-amber-50/60 transition ${supDetailSort.key === "current" ? "text-amber-700 font-bold" : "text-amber-500"}`} title="현재고 정렬">현재고{supDetailArrow("current")}</th>
                      <th onClick={() => toggleSupDetailSort("cycle")} className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-zinc-50/60 transition ${supDetailSort.key === "cycle" ? "text-zinc-700 font-bold" : "text-zinc-400"}`} title="매입주기 정렬">매입주기{supDetailArrow("cycle")}</th>
                      <th onClick={() => toggleSupDetailSort("purchase_date")} className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-zinc-50/60 transition ${supDetailSort.key === "purchase_date" ? "text-zinc-700 font-bold" : "text-zinc-400"}`} title="최근매입일 정렬">최근매입일{supDetailArrow("purchase_date")}</th>
                      <th onClick={() => toggleSupDetailSort("purchase_qty")} className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-zinc-50 transition ${supDetailSort.key === "purchase_qty" ? "text-zinc-800 font-bold" : ""}`} title="매입수량 정렬">매입수량{supDetailArrow("purchase_qty")}</th>
                      <th onClick={() => toggleSupDetailSort("purchase_price")} className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-amber-50/60 transition ${supDetailSort.key === "purchase_price" ? "text-amber-700 font-bold" : "text-amber-600"}`} title="매입단가 정렬">매입단가{supDetailArrow("purchase_price")}</th>
                      <th onClick={() => toggleSupDetailSort("sale_qty")} className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-rose-50/60 transition ${supDetailSort.key === "sale_qty" ? "text-rose-700 font-bold" : "text-rose-600"}`} title="판매량 정렬">판매량{supDetailArrow("sale_qty")}</th>
                      <th onClick={() => toggleSupDetailSort("sale_amount")} className={`text-right px-1 py-1.5 w-16 cursor-pointer select-none hover:bg-rose-50/60 transition ${supDetailSort.key === "sale_amount" ? "text-rose-800 font-bold" : "text-rose-700"}`} title="판매금액 정렬">판매금액{supDetailArrow("sale_amount")}</th>
                      <th onClick={() => toggleSupDetailSort("total_amount")} className={`text-right px-1 py-1.5 w-16 cursor-pointer select-none hover:bg-zinc-100 transition ${supDetailSort.key === "total_amount" ? "text-emerald-700 font-bold" : "text-emerald-500"}`} title="재고금액 정렬">재고금액{supDetailArrow("total_amount")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-100">
                    {sortedDetail.slice(0, 200).map((r, ri) => {
                      const purchPrice = Number(r.purchase_price ?? 0);
                      const saleQty = Number(r.sale_qty ?? 0);
                      const saleAmt = Number(r.total_amount ?? 0);
                      const curStock = Number(r.current_stock ?? 0);
                      const stockValue = curStock > 0 && purchPrice > 0 ? curStock * purchPrice : 0;
                      return (
                        <tr key={`supdet-${r.product_code ?? ri}`} className="hover:bg-zinc-50/60 transition-all duration-150 align-top">
                          <td className="px-1 py-1 text-[15px] text-zinc-400">{ri + 1}</td>
                          <td className="px-1 py-1 break-words whitespace-normal leading-tight">
                            <button type="button" onClick={() => loadFlowSelectedProduct(r)} className="text-left text-[14px] font-semibold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer transition break-words whitespace-normal">{r.product_name}</button>
                          </td>
                          <td className="text-right px-1 py-1 text-[15px] tabular-nums text-amber-700">{fmt(curStock)}</td>
                          <td className="text-right px-1 py-1 text-[15px] tabular-nums text-zinc-500">{detailCycleStr(r)}</td>
                          <td className="text-right px-1 py-1 tabular-nums">
                            {r.product_code && r.last_purchase_date ? (
                              <button type="button"
                                onClick={() => setProductPurchaseModal({ product_code: String(r.product_code), product_name: r.product_name ?? "" })}
                                className="text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                                title={`${r.last_purchase_date} · 매입 이력 보기`}
                              >{fmtPurchaseDate(r.last_purchase_date)}</button>
                            ) : (
                              <span className="text-zinc-500">{fmtPurchaseDate(r.last_purchase_date)}</span>
                            )}
                          </td>
                          <td className="text-right px-1 py-1 text-[15px] tabular-nums text-zinc-700">{fmt(Number(r.purchase_total_qty ?? r.purchase_qty ?? 0))}</td>
                          <td className="text-right px-1 py-1 text-[15px] tabular-nums text-amber-700 font-semibold">{purchPrice > 0 ? purchPrice.toLocaleString() : "-"}</td>
                          <td className="text-right px-1 py-1 text-[15px] tabular-nums text-rose-600 font-semibold">{saleQty > 0 ? fmt(saleQty) : "-"}</td>
                          <td className="text-right px-1 py-1 text-[15px] tabular-nums text-rose-700 font-semibold">{saleAmt > 0 ? fmtWon(saleAmt) : "-"}</td>
                          <td className="text-right px-1 py-1 text-[15px] tabular-nums font-bold text-emerald-700">{stockValue > 0 ? fmtWon(stockValue) : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length > 200 && <div className="text-[14px] text-zinc-400 text-center py-1">상위 200개만 표시 · 전체 {rows.length}개</div>}
              </div>
            );
          })()}

          {flowSelectedProduct && (
            <ProductDetailRightPanel
              selected={flowSelectedProduct}
              onClose={() => setFlowSelectedProduct(null)}
              onProductUpdate={(u) => setFlowSelectedProduct((prev: any) => prev ? { ...prev, ...u } : prev)}
              onRealMapUpdate={(v) => setFlowSelectedProduct((prev: any) => prev ? { ...prev, real_map: v } : prev)}
              showChart={true}
              context="stock-manage"
              editable={true}
              emptyMessage="상품명을 클릭하세요"
              onSupplierInfoOpen={(nm) => openSupplierDetailModal(nm)}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 2) SupplierDetailModalWrapper · 공급사 상세 모달 wrapper
// ═══════════════════════════════════════════════════════════════════════════

interface SupplierDetailModalWrapperProps {
  vendor: any | null;
  onClose: () => void;
}

export const SupplierDetailModalWrapper: React.FC<SupplierDetailModalWrapperProps> = ({ vendor, onClose }) => {
  // 2026-08-23 · #191 Phase A · Modal 프리미티브 (v3.4)
  return (
    <Modal
      open={!!vendor}
      onClose={onClose}
      size="3xl"
      zIndex={100}
      bodyPadding="none"
      showClose={false}
      cardStyle={{ maxHeight: "90vh" }}
    >
      {vendor && <VendorDetailModal vendor={vendor} onClose={onClose} onSaved={onClose} />}
    </Modal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 3) ProductPurchaseHistoryModalWrapper · 매입 이력 모달 wrapper
// ═══════════════════════════════════════════════════════════════════════════

interface ProductPurchaseHistoryModalWrapperProps {
  modal: { product_code: string; product_name: string } | null;
  onClose: () => void;
}

export const ProductPurchaseHistoryModalWrapper: React.FC<ProductPurchaseHistoryModalWrapperProps> = ({ modal, onClose }) => {
  if (!modal) return null;
  return (
    <ProductPurchaseHistoryModal
      productCode={modal.product_code}
      productName={modal.product_name}
      onClose={onClose}
    />
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 4) SupplierFilterBar · 상단 필터바 (기간·TopN·새로고침)
// ═══════════════════════════════════════════════════════════════════════════

interface SupplierFilterBarProps {
  displayedCount: number;
  supplierMonths: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  supplierSeason: SeasonKey | null;
  supListLimit: number;
  loading: boolean;
  setSupplierMonths: (v: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void;
  setSupplierSeason: (v: SeasonKey | null) => void;
  setSupListLimit: (v: number) => void;
  fetchData: () => void;
}

export const SupplierFilterBar: React.FC<SupplierFilterBarProps> = ({
  displayedCount, supplierMonths, supplierSeason, supListLimit, loading,
  setSupplierMonths, setSupplierSeason, setSupListLimit, fetchData,
}) => {
  return (
    // 2026-08-23 · #185 · PageToolbar 프리미티브 통일 (CategoryTab·TrendingTab 톤 일치)
    <PageToolbar
      icon={<Building2 size={16} />}
      title="공급사현황"
      count={displayedCount}
      countLabel="개 사"
      leftSlot={<span className={`${TEXT.caption} text-ink-soft hidden sm:inline`}>행 클릭 → 우측 상품 리스트 · 상품명 클릭 → 상세</span>}
      right={
        <>
          <div className="flex items-center gap-2">
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
              value={supplierMonths}
              onChange={(v) => { setSupplierSeason(null); setSupplierMonths(v as 0|1|2|3|4|5|6); }}
              size="sm"
              ariaLabel="공급사 조회기간"
            />
          </div>
          <SeasonButtons value={supplierSeason} onChange={(v) => { setSupplierSeason(v); if (v) setSupplierMonths(0); }} size="sm" hideLabel />
          <div className="flex items-center gap-2">
            <InlineLabel size="sm">Top N</InlineLabel>
            <div className="inline-flex bg-zinc-100 border border-line rounded-lg p-1 gap-0.5">
              {[{ v: 100, label: "100" }, { v: 300, label: "300" }, { v: 1000, label: "1k" }, { v: 2000, label: "2k" }, { v: 999999, label: "전체" }].map(o => (
                <button key={o.v} onClick={() => setSupListLimit(o.v)}
                  className={`text-[13px] font-semibold h-8 px-3 rounded-md transition-colors whitespace-nowrap cursor-pointer ${supListLimit === o.v ? "bg-brand-deep text-white shadow-sm" : "text-ink hover:text-brand-deep hover:bg-white"}`}
                >{o.label}</button>
              ))}
            </div>
          </div>
          <button type="button" onClick={fetchData} disabled={loading}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-brand-tint hover:border-brand-deep text-ink-soft hover:text-brand-deep transition-colors disabled:opacity-40 cursor-pointer" title="새로고침">
            <LoaderIcon size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </>
      }
    />
  );
};
