// src/components/OrderManagePage/PurchaseHistoryTab/ProductPurchaseDetailPanel.tsx
// 우측 · 선택 상품 상세
// 2026-09-08 · 사용자 지시 · 3탭 재설계 · 매입이력 · 상품정보 · 판매정보
//   · 이전 · KPI 4카드 + 매입 원장 · 단일 뷰
//   · 이후 · SplitRightTabs 3탭 (매입이력·상품정보·판매정보) · 각 탭 fresh fetch

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Package, Building2, ClipboardList, Info, TrendingUp } from "lucide-react";
import { KpiCard } from "../../common/KpiCard";
import { SplitRightTabs } from "../../common/SplitRightTabs";
import { PurchaseHistoryList, type PurchaseHistoryRow } from "../../common/PurchaseHistoryList";
import { Spinner } from "../../common/Spinner";
import { EmptyState } from "../../common/EmptyState";
import { CARD_BASE } from "../../../styles/tokens";
import { fmtWonNoUnit, fmtDateSlice } from "../../../lib/format";
import { api, ApiError } from "../../../lib/apiClient";
import { getErrorMessage } from "../../../lib/errorMessage";
import { useToast, toastClass } from "../../../hooks/useToast";
import { useConfirm } from "../../../hooks/useConfirm";

// ─── Types ───────────────────────────────────────────────────────────────

export interface ProductPurchaseRow {
  id: string | number;
  date: string;
  supplier_name: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface ProductHeaderInfo {
  product_code: string | null;
  product_name: string;
  total_amount: number;
  total_qty: number;
  purchase_count: number;
  last_purchase_date: string | null;
  primary_supplier: string | null;
  supplier_count: number;
}

interface Props {
  product: ProductHeaderInfo;
  rows: ProductPurchaseRow[];
  loading: boolean;
}

type Tab = "purchases" | "info" | "sales";

// ─── Helpers ─────────────────────────────────────────────────────────────

const fmt = (n: number): string => Number.isFinite(n) ? n.toLocaleString() : "0";
const fmtWon = fmtWonNoUnit;
const dateLabel = fmtDateSlice;

// ─── Panel ───────────────────────────────────────────────────────────────

export const ProductPurchaseDetailPanel: React.FC<Props> = ({ product, rows, loading }) => {
  const [tab, setTab] = useState<Tab>("purchases");
  const [deletedIds, setDeletedIds] = useState<Set<string | number>>(new Set());
  const { toast, showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const avgUnitPrice = product.total_qty > 0 ? product.total_amount / product.total_qty : 0;
  const visibleRows = rows.filter(r => !deletedIds.has(r.id));

  const handleDelete = useCallback(async (id: string | number) => {
    const row = rows.find(r => String(r.id) === String(id));
    const label = row ? `${fmtDateSlice(row.date)} · ${row.supplier_name ?? "공급사"} · ${fmt(row.quantity)}개` : `#${id}`;
    if (!await confirm({ message: `매입 기록 삭제: ${label}?`, danger: true })) return;
    try {
      await api.del(`/api/purchase-details/${id}`);
      setDeletedIds(prev => new Set([...prev, id]));
      showSuccess("매입 기록 삭제 완료");
    } catch (e: unknown) {
      showError(`삭제 실패: ${e instanceof ApiError ? e.message : getErrorMessage(e, "네트워크 오류")}`);
    }
  }, [rows, confirm, showSuccess, showError]);

  // 상품정보 · 판매정보 · 탭 선택 시 fetch
  const [infoData, setInfoData] = useState<any>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [salesData, setSalesData] = useState<any>(null);
  const [salesLoading, setSalesLoading] = useState(false);

  useEffect(() => {
    if (tab !== "info" || !product.product_code) return;
    let alive = true;
    setInfoLoading(true);
    api.get<any>(`/api/products/${encodeURIComponent(product.product_code)}`)
      .then(({ data }) => { if (alive) setInfoData(data); })
      .catch(() => { if (alive) setInfoData(null); })
      .finally(() => { if (alive) setInfoLoading(false); });
    return () => { alive = false; };
  }, [tab, product.product_code]);

  useEffect(() => {
    if (tab !== "sales" || !product.product_code) return;
    let alive = true;
    setSalesLoading(true);
    // top-sales · 12개월 · 해당 상품만 필터
    api.get<any>(`/api/stock-manage/top-sales?months=12&sort=sale&dir=desc&limit=5000`)
      .then(({ data }) => {
        if (!alive) return;
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        const hit = rows.find((r: any) => String(r.product_code) === String(product.product_code));
        setSalesData(hit ?? null);
      })
      .catch(() => { if (alive) setSalesData(null); })
      .finally(() => { if (alive) setSalesLoading(false); });
    return () => { alive = false; };
  }, [tab, product.product_code]);

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}

      {/* 상품 헤더 · 항상 표시 */}
      <div className={`${CARD_BASE} px-4 py-3 flex flex-col gap-1.5`}>
        <div className="flex items-center gap-2 min-w-0">
          <Package size={16} className="text-sky-500 shrink-0" />
          <span className="text-[16px] font-bold text-ink break-words">{product.product_name}</span>
          {product.product_code && (
            <span className="text-[13px] font-mono text-zinc-400 tabular-nums shrink-0">{product.product_code}</span>
          )}
        </div>
        {product.primary_supplier && (
          <div className="flex items-center gap-1 text-[13px] text-zinc-500">
            <Building2 size={11} className="text-zinc-400 shrink-0" />
            <span className="truncate">
              {product.primary_supplier}
              {product.supplier_count > 1 && <span className="text-zinc-400 ml-1">외 {product.supplier_count - 1}</span>}
            </span>
          </div>
        )}
      </div>

      {/* 3탭 */}
      <SplitRightTabs
        tabs={[
          { key: "purchases", label: "매입이력" },
          { key: "info",      label: "상품정보" },
          { key: "sales",     label: "판매정보" },
        ]}
        active={tab}
        onSelect={(k) => setTab(k as Tab)}
      />

      {/* 탭 컨텐츠 */}
      {tab === "purchases" && (
        <>
          <div className={`${CARD_BASE} px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2`}>
            <KpiCard label="총 매입액" value={fmtWon(product.total_amount)} tone="sky" />
            <KpiCard label="총 수량"   value={fmt(product.total_qty)}       tone="brand" />
            <KpiCard label="매입 건수" value={fmt(product.purchase_count)}  unit="건" tone="brand" />
            <KpiCard label="평균단가"  value={avgUnitPrice > 0 ? fmt(Math.round(avgUnitPrice)) : "-"} tone="emerald" />
          </div>
          <div className={`${CARD_BASE} flex flex-col min-h-0 flex-1 overflow-hidden`}>
            <div className="flex items-center border-b border-line bg-zinc-50/50 px-4 py-2.5 shrink-0">
              <ClipboardList size={13} className="text-sky-600 mr-1.5" />
              <span className="text-[15px] font-bold text-sky-700">매입 원장</span>
              <span className="ml-2 text-[13px] font-semibold text-zinc-400 tabular-nums">{visibleRows.length}건</span>
              <span className="ml-auto text-[12px] text-zinc-400">
                최근 매입일 · <span className="tabular-nums">{dateLabel(product.last_purchase_date)}</span>
              </span>
            </div>
            <PurchaseHistoryList
              rows={visibleRows as unknown as PurchaseHistoryRow[]}
              loading={loading}
              showSupplier
              showRowNumber
              showFooterSum
              emptyText="해당 상품의 매입 이력 없음"
              onDelete={handleDelete}
            />
          </div>
        </>
      )}

      {tab === "info" && (
        <div className={`${CARD_BASE} p-4 flex flex-col gap-3 min-h-[300px]`}>
          <div className="flex items-center gap-2 border-b border-line pb-2">
            <Info size={14} className="text-brand-deep" />
            <span className="text-[15px] font-bold text-ink">상품 상세 정보</span>
          </div>
          {infoLoading ? (
            <div className="flex-1 flex items-center justify-center py-12"><Spinner size={16} tone="brand" label="상품 정보 로딩..." /></div>
          ) : !infoData ? (
            <EmptyState icon={Info} title="상품 정보 없음" hint="이 상품의 상세 정보를 불러올 수 없습니다" size="normal" />
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
              <InfoRow label="상품코드"   value={infoData.product_code} mono />
              <InfoRow label="상품명"     value={infoData.product_name} />
              <InfoRow label="공급사"     value={infoData.supplier ?? "-"} />
              <InfoRow label="분류코드"   value={infoData.category ?? "-"} />
              <InfoRow label="규격"       value={infoData.spec ?? "-"} />
              <InfoRow label="단위"       value={infoData.unit ?? "-"} />
              <InfoRow label="브랜드"     value={infoData.brand ?? "-"} />
              <InfoRow label="제조사"     value={infoData.manufacturer ?? "-"} />
              <InfoRow label="배치구역"   value={infoData.location ?? infoData.display_location ?? "-"} />
              <InfoRow label="판매가"     value={infoData.sale_price != null ? `${fmtWon(infoData.sale_price)}원` : "-"} />
              <InfoRow label="매입가"     value={infoData.purchase_price != null ? `${fmtWon(infoData.purchase_price)}원` : "-"} />
              <InfoRow label="현재고 (ERP)" value={infoData.current_stock != null ? `${fmt(infoData.current_stock)}` : "-"} />
              <InfoRow label="적정재고"   value={infoData.optimal_stock != null ? `${fmt(infoData.optimal_stock)}` : "-"} />
              <InfoRow label="판매상태"   value={infoData.sale_status ?? "-"} />
              <InfoRow label="바코드"     value={infoData.barcode ?? "-"} mono />
              <InfoRow label="유통기한"   value={infoData.expiry_date ?? "-"} />
            </div>
          )}
        </div>
      )}

      {tab === "sales" && (
        <div className={`${CARD_BASE} p-4 flex flex-col gap-3 min-h-[300px]`}>
          <div className="flex items-center gap-2 border-b border-line pb-2">
            <TrendingUp size={14} className="text-emerald-600" />
            <span className="text-[15px] font-bold text-ink">판매 정보 (최근 12개월)</span>
          </div>
          {salesLoading ? (
            <div className="flex-1 flex items-center justify-center py-12"><Spinner size={16} tone="emerald" label="판매 정보 로딩..." /></div>
          ) : !salesData ? (
            <EmptyState icon={TrendingUp} title="판매 데이터 없음" hint="이 상품의 최근 12개월 판매 데이터가 없습니다" size="normal" />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <KpiCard label="총 판매량"  value={fmt(Number(salesData.sale_qty ?? 0))} unit="개" tone="rose" />
                <KpiCard label="총 판매액"  value={fmtWon(Number(salesData.total_amount ?? salesData.sale_amount ?? 0))} tone="rose" />
                <KpiCard label="매입 대비 판매율" value={
                  salesData.purchase_qty > 0
                    ? `${Math.round((Number(salesData.sale_qty ?? 0) / Number(salesData.purchase_qty ?? 1)) * 100)}%`
                    : "-"
                } tone="emerald" />
                <KpiCard label="현재고" value={fmt(Number(salesData.closing_stock ?? salesData.current_stock ?? 0))} unit="개" tone="brand" />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px] mt-2">
                <InfoRow label="판매가"    value={salesData.sale_price != null ? `${fmtWon(salesData.sale_price)}원` : "-"} />
                <InfoRow label="매입가"    value={salesData.purchase_price != null ? `${fmtWon(salesData.purchase_price)}원` : "-"} />
                <InfoRow label="이익률"    value={(() => {
                  const sp = Number(salesData.sale_price ?? 0);
                  const pp = Number(salesData.purchase_price ?? 0);
                  if (sp <= 0 || pp <= 0) return "-";
                  return `${(((sp - pp) / sp) * 100).toFixed(1)}%`;
                })()} />
                <InfoRow label="시작재고"  value={fmt(Number(salesData.opening_stock ?? 0))} />
                <InfoRow label="매입수량"  value={fmt(Number(salesData.purchase_qty ?? 0))} />
                <InfoRow label="종료재고"  value={fmt(Number(salesData.closing_stock ?? 0))} />
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

const InfoRow: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-center gap-2 border-b border-line/50 pb-1.5">
    <span className="text-ink-soft font-semibold shrink-0 min-w-[80px]">{label}</span>
    <span className={`text-ink font-medium truncate ${mono ? "font-mono tabular-nums" : ""}`}>{value ?? "-"}</span>
  </div>
);

export default ProductPurchaseDetailPanel;
