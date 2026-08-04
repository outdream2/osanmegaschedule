// src/components/OrderManagePage/PurchaseHistoryTab/ProductRowCard.tsx
// 좌측 상품 리스트 · 카드형 2줄 (2026-08-03 · #191 상품별 매입이력)
// Line 1 · 상품명 + 대표 공급사 배지
// Line 2 · 총 매입액 + 매입 건수 + SKU 정보 + 최근 매입일
// 스타일 · VendorRowCard 와 동일한 구조 유지 (통일성)

import React from "react";

export interface ProductSummary {
  product_code: string | null;
  product_name: string;
  total_amount: number;
  total_qty: number;
  purchase_count: number;
  last_purchase_date: string | null;
  primary_supplier: string | null;
  supplier_count: number;
  // 2026-08-04 · 판매 지표 (top-sales?months=1 조인 · 사용자 요청)
  //   · null · 매핑 실패 or 판매 데이터 없음 (0 과 구분 · UI 회색 처리)
  sale_qty?: number | null;
  sale_amount?: number | null;
}

interface ProductRowCardProps {
  product: ProductSummary;
  active: boolean;
  onSelect: () => void;
}

// ─── helpers ──────────────────────────────────────────────────────────────

function fmtWon(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString();
}

function daysAgo(iso: string | null): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const nowYmd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((nowYmd.getTime() - d.getTime()) / dayMs));
}

function recencyStyle(days: number | null): { label: string; cls: string } {
  if (days == null) return { label: "매입없음", cls: "bg-slate-100 text-slate-400 border-slate-200" };
  if (days === 0) return { label: "오늘", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" };
  if (days <= 3) return { label: `${days}일전`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (days <= 14) return { label: `${days}일전`, cls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (days <= 60) return { label: `${days}일전`, cls: "bg-orange-50 text-orange-700 border-orange-200" };
  return { label: `${days}일전`, cls: "bg-slate-100 text-slate-500 border-slate-300" };
}

// ─── ProductRowCard ───────────────────────────────────────────────────────

export const ProductRowCard: React.FC<ProductRowCardProps> = React.memo(({
  product,
  active,
  onSelect,
}) => {
  const days = daysAgo(product.last_purchase_date);
  const recency = recencyStyle(days);
  const totalAmount = product.total_amount ?? 0;
  const purchaseCount = product.purchase_count ?? 0;
  // 2026-08-04 · 판매 지표 (사용자 요청 · null 은 미매핑 · 0 은 매핑됐지만 판매 없음)
  const saleQty = product.sale_qty ?? null;
  const saleAmt = product.sale_amount ?? null;
  const supplierLabel = product.primary_supplier
    ? (product.supplier_count > 1 ? `${product.primary_supplier} 외 ${product.supplier_count - 1}` : product.primary_supplier)
    : "공급사 미상";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full text-left px-3 py-2 flex flex-col gap-1.5 transition cursor-pointer border-l-2 ${
        active
          ? "bg-sky-50 border-sky-500"
          : "hover:bg-slate-50 border-transparent"
      }`}
    >
      {/* Line 1 · 상품명 + 최근성 */}
      <div className="flex items-center gap-1.5 w-full min-w-0">
        <span className={`text-[12px] font-semibold leading-tight flex-1 min-w-0 break-words ${
          active ? "text-sky-800" : "text-slate-700"
        }`}>
          {product.product_name}
        </span>
        <span
          className={`text-[9px] font-black rounded px-1.5 py-0.5 border leading-none shrink-0 tabular-nums ${recency.cls}`}
          title={product.last_purchase_date ?? "매입 이력 없음"}
        >
          {recency.label}
        </span>
      </div>

      {/* Line 2 · 총 매입액 + 매입건수 + 대표 공급사 */}
      <div className="flex items-center gap-2 w-full min-w-0">
        <span
          className={`text-[10px] font-black tabular-nums shrink-0 ${
            totalAmount > 0 ? (active ? "text-sky-700" : "text-slate-600") : "text-slate-300"
          }`}
          title={`총 매입액 · ${totalAmount.toLocaleString()}원`}
        >
          {fmtWon(totalAmount)}
        </span>
        <span className="text-[9px] font-semibold text-slate-400 tabular-nums shrink-0" title={`매입 건수 · ${purchaseCount}건`}>
          {purchaseCount}건
        </span>
        <span
          className="text-[10px] text-slate-500 flex-1 min-w-0 truncate"
          title={product.primary_supplier ?? "공급사 정보 없음"}
        >
          {supplierLabel}
        </span>
        {product.product_code && (
          <span className="text-[9px] text-slate-300 font-mono tabular-nums shrink-0" title={`상품코드 · ${product.product_code}`}>
            {product.product_code}
          </span>
        )}
      </div>

      {/* Line 3 · 판매량 · 판매금액 (최근 1개월 · 2026-08-04 사용자 요청) */}
      <div className="flex items-center gap-2 w-full min-w-0">
        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">판매</span>
        <span
          className={`text-[10px] font-semibold tabular-nums shrink-0 ${
            saleQty != null && saleQty > 0 ? "text-rose-600" : "text-slate-300"
          }`}
          title={saleQty != null ? `판매량 · ${saleQty.toLocaleString()}개 (최근 1개월)` : "판매 데이터 없음"}
        >
          {saleQty != null ? `${fmtWon(saleQty)}개` : "-"}
        </span>
        <span
          className={`text-[10px] font-black tabular-nums shrink-0 ${
            saleAmt != null && saleAmt > 0 ? "text-rose-700" : "text-slate-300"
          }`}
          title={saleAmt != null ? `판매금액 · ${saleAmt.toLocaleString()}원 (최근 1개월)` : "판매 데이터 없음"}
        >
          {saleAmt != null ? fmtWon(saleAmt) : "-"}
        </span>
      </div>
    </button>
  );
});
ProductRowCard.displayName = "ProductRowCard";

export default ProductRowCard;
