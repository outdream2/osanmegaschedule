// src/components/ScanPage/ScanProductSummary.tsx
// 2026-10-11 · UI-12 · 사용자 지시 "실재고확인 오른쪽 상세정보 매입가·판매가·공급사·현재고·판매상태 위 · 나머지 적정한 곳 · UI 개선"
//   · ScanPage 오른쪽 panel · ScanRightPanel 위 render
//   · 상단 (위) · 매입가 / 판매가 / 공급사 / 현재고 / 판매상태 · 사용자 명시 5-field
//   · 하단 (적정한 곳) · 진열위치 / 적정재고 / 재고자산
//   · 홈 랜딩 톤 · rounded-[12px] + border-slate-200 + thin shadow · 2-tier typography

import React from "react";
import { Package } from "lucide-react";
import type { ProductInfo } from "../../lib/productsCache";
import { formatDisplayLocation } from "../../lib/formatDisplayLocation";

interface ScanProductSummaryProps {
  product: ProductInfo | null;
}

const Field: React.FC<{ label: string; value: string; emphasize?: boolean }> = ({ label, value, emphasize }) => (
  <div className="min-w-0">
    <p className="text-[13px] font-medium text-slate-500 mb-0.5">{label}</p>
    <p
      className={`font-bold text-ink break-words leading-tight tabular-nums ${emphasize ? "text-[15px]" : "text-[14px]"}`}
      title={value}
    >
      {value}
    </p>
  </div>
);

export const ScanProductSummary: React.FC<ScanProductSummaryProps> = ({ product }) => {
  if (!product) {
    return (
      <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-5">
        <div className="flex flex-col items-center gap-1.5 text-slate-400">
          <Package size={22} />
          <p className="text-[14px] font-medium">바코드 스캔 시 상품 상세정보가 표시됩니다</p>
        </div>
      </div>
    );
  }

  const purchase =
    product.purchase_price != null ? Number(product.purchase_price).toLocaleString() + "원" : "-";
  const sale =
    product.sale_price != null ? Number(product.sale_price).toLocaleString() + "원" : "-";
  const supplier = (product.supplier as string | null | undefined) ?? "-";
  const curStock = product.current_stock != null ? Number(product.current_stock).toLocaleString() : "-";
  const saleStatus = (product.sale_status as string | null | undefined) ?? "-";
  const locRaw = ((product as any).display_location ?? (product as any).location ?? "") as string;
  const loc = formatDisplayLocation(locRaw) || "-";
  const optStock =
    (product as any).optimal_stock != null ? Number((product as any).optimal_stock).toLocaleString() : "-";
  const asset =
    product.purchase_price != null && product.current_stock != null
      ? (Number(product.purchase_price) * Number(product.current_stock)).toLocaleString() + "원"
      : "-";

  return (
    <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-3">
      {/* 상단 header · 상품명 + 바코드 */}
      <div className="flex items-start gap-2 mb-3 pb-2.5 border-b border-slate-100">
        <span className="w-[3px] h-[14px] mt-1 bg-indigo-500 rounded-full shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] md:text-[16px] font-bold text-ink leading-snug break-words">
            {product.name ?? "-"}
          </p>
          <p className="text-[13px] font-mono text-slate-500 tabular-nums mt-0.5">{product.code}</p>
        </div>
      </div>
      {/* 사용자 지시 "위" · 매입가·판매가·공급사·현재고·판매상태 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-x-3 gap-y-2 mb-2.5">
        <Field label="매입가" value={purchase} emphasize />
        <Field label="판매가" value={sale} emphasize />
        <Field label="공급사" value={supplier} emphasize />
        <Field label="현재고" value={curStock} emphasize />
        <Field label="판매상태" value={saleStatus} emphasize />
      </div>
      {/* "나머지 적정한 곳" · 진열위치·적정재고·재고자산 */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 pt-2.5 border-t border-slate-100">
        <Field label="진열위치" value={loc} />
        <Field label="적정재고" value={optStock} />
        <Field label="재고자산" value={asset} />
      </div>
    </div>
  );
};
