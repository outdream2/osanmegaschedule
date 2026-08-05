// src/components/OrderManagePage/PurchaseHistoryTab/ProductPurchaseDetailPanel.tsx
// 우측 · 선택 상품 상세 (2026-08-03 · #191)
// 구조 · 상단 상품 헤더 (KPI 4카드) + 하단 매입 원장 (공통 PurchaseHistoryList)
// 2026-08-04 · 내부 <table> 자체 정렬 로직 → 공통 PurchaseHistoryList 로 교체 (사용자 요청 · 통일)
//   · 하단 원장 · showSupplier · showFooterSum · sticky 헤더 · 헤더 자동 정렬 · 12px 본문

import React from "react";
import { Package, Building2 } from "lucide-react";
import { KpiCard } from "../../common/KpiCard";
import { PurchaseHistoryList, type PurchaseHistoryRow } from "../../common/PurchaseHistoryList";
// T-CSS Phase 2 · 2026-08-06
import { CARD_BASE } from "../../../styles/tokens";

// ─── Types ───────────────────────────────────────────────────────────────

export interface ProductPurchaseRow {
  id: string | number;
  date: string; // YYYY-MM-DD
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

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}
function fmtWon(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString();
}
function dateLabel(iso: string | null): string {
  if (!iso) return "-";
  return String(iso).slice(0, 10);
}

// ─── Panel ───────────────────────────────────────────────────────────────

export const ProductPurchaseDetailPanel: React.FC<Props> = ({ product, rows, loading }) => {
  const avgUnitPrice = product.total_qty > 0 ? product.total_amount / product.total_qty : 0;

  return (
    <>
      {/* 상단 · 상품 헤더 (KPI 4카드) */}
      <div className={`${CARD_BASE} px-4 py-3 flex flex-col gap-2`}>
        <div className="flex items-center gap-2 min-w-0">
          <Package size={16} className="text-sky-500 shrink-0" />
          <span className="text-[14px] font-black text-slate-800 truncate">{product.product_name}</span>
          {product.product_code && (
            <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
              {product.product_code}
            </span>
          )}
        </div>
        {product.primary_supplier && (
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Building2 size={11} className="text-slate-400 shrink-0" />
            <span className="truncate">
              {product.primary_supplier}
              {product.supplier_count > 1 && (
                <span className="text-slate-400 ml-1">외 {product.supplier_count - 1}개 공급사</span>
              )}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <KpiCard label="총 매입액" value={fmtWon(product.total_amount)} color="sky" />
          <KpiCard label="총 수량"   value={fmt(product.total_qty)}     color="slate" />
          <KpiCard label="매입 건수" value={`${fmt(product.purchase_count)}건`} color="slate" />
          <KpiCard label="평균단가"  value={avgUnitPrice > 0 ? fmt(Math.round(avgUnitPrice)) : "-"} color="emerald" />
        </div>
        <div className="text-[10px] text-slate-400 pt-1">
          최근 매입일 · <span className="tabular-nums">{dateLabel(product.last_purchase_date)}</span>
        </div>
      </div>

      {/* 하단 · 매입 원장 · 2026-08-04 · 공통 PurchaseHistoryList 사용 (사용자 요청) */}
      <div className={`${CARD_BASE} flex flex-col min-h-0 flex-1 overflow-hidden`}>
        <div className="flex items-center border-b border-slate-200 bg-slate-50/50 px-4 py-2.5 shrink-0">
          <span className="text-[13px] font-black text-sky-700">매입 원장</span>
          <span className="ml-2 text-[11px] font-semibold text-slate-400 tabular-nums">
            {rows.length}건
          </span>
          <div className="ml-auto text-[10px] text-slate-400">헤더 클릭 정렬</div>
        </div>
        <PurchaseHistoryList
          rows={rows as unknown as PurchaseHistoryRow[]}
          loading={loading}
          showSupplier
          showRowNumber
          showFooterSum
          emptyText="해당 상품의 매입 이력 없음"
        />
      </div>
    </>
  );
};

export default ProductPurchaseDetailPanel;
