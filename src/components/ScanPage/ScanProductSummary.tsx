// src/components/ScanPage/ScanProductSummary.tsx
// 2026-10-12 · UI-11-SCAN Phase 2 Step 3 · 사용자 스크린샷 (7c2d9aa8 재분석) 재조정
//   · KPI 6-col: 매입가 / 판매가 / 진열위치 / 현재고 / 적정재고 / 전체금액 (재고자산)
//   · 판매상태 pill: 상단 상품명 옆 (header)
//   · 전체금액 = current_stock × purchase_price (재고자산 공식)
//   · 홈 랜딩 톤 · rounded-[12px] + border-slate-200 + thin shadow

import React, { useRef, useState } from "react";
import { Package, Camera } from "lucide-react";
import type { ProductInfo } from "../../lib/productsCache";
import { formatDisplayLocation } from "../../lib/formatDisplayLocation";

interface ScanProductSummaryProps {
  product: ProductInfo | null;
}

type FieldTone = "ink" | "sky" | "emerald" | "rose" | "indigo" | "amber";
const TONE_TEXT: Record<FieldTone, string> = {
  ink: "text-ink",
  sky: "text-sky-700",
  emerald: "text-emerald-700",
  rose: "text-rose-700",
  indigo: "text-indigo-700",
  amber: "text-amber-700",
};
const Field: React.FC<{ label: string; value: string; tone?: FieldTone; dim?: boolean }> = ({ label, value, tone = "ink", dim }) => (
  <div className="min-w-0">
    <p className="text-[12px] font-medium text-slate-500 mb-0.5 whitespace-nowrap">{label}</p>
    <p
      className={`text-[15px] md:text-[16px] font-bold leading-tight tabular-nums break-words ${dim ? "text-slate-400" : TONE_TEXT[tone]}`}
      title={value}
    >
      {value}
    </p>
  </div>
);

const SaleStatusPill: React.FC<{ status: string }> = ({ status }) => {
  const isActive = /판매\s*중|active|판매중/i.test(status);
  const isStopped = /중지|stop|단종|판매\s*중지/i.test(status);
  const tone = isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200"
             : isStopped ? "bg-rose-50 text-rose-700 border-rose-200"
             : "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center h-6 px-2 rounded-full border text-[12px] font-semibold whitespace-nowrap ${tone}`}>
      {status}
    </span>
  );
};

export const ScanProductSummary: React.FC<ScanProductSummaryProps> = ({ product }) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImagePreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

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

  const purchase = product.purchase_price != null ? Number(product.purchase_price).toLocaleString() + "원" : "-";
  const sale = product.sale_price != null ? Number(product.sale_price).toLocaleString() + "원" : "-";
  const curStock = product.current_stock != null ? Number(product.current_stock).toLocaleString() : "-";
  const saleStatus = (product.sale_status as string | null | undefined) ?? "-";
  const locRaw = ((product as any).display_location ?? (product as any).location ?? "") as string;
  const loc = formatDisplayLocation(locRaw) || "-";
  const optStock = (product as any).optimal_stock != null ? Number((product as any).optimal_stock).toLocaleString() : "-";
  // 2026-10-12 · Phase 2 Step 3 · 전체금액 = 재고자산 (current_stock × purchase_price)
  const totalAmount = product.purchase_price != null && product.current_stock != null
    ? (Number(product.purchase_price) * Number(product.current_stock)).toLocaleString() + "원"
    : "-";

  return (
    <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-3">
      {/* 상단 header · 사진 + 상품명 + 바코드 + 진열위치 chip + 판매상태 pill */}
      <div className="flex items-start gap-3 mb-3 pb-2.5 border-b border-slate-100">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 w-14 h-14 rounded-[8px] border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center hover:border-slate-300 hover:bg-slate-100 cursor-pointer transition-colors"
          title="사진 촬영 / 선택"
          aria-label="상품 사진 촬영"
        >
          {imagePreview ? (
            <img src={imagePreview} alt="상품" className="w-full h-full object-cover" />
          ) : (
            <Camera size={18} className="text-slate-400" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 flex-wrap">
            <p className="text-[15px] md:text-[16px] font-bold text-ink leading-snug break-words min-w-0 flex-1">
              {product.name ?? "-"}
            </p>
            <SaleStatusPill status={saleStatus} />
          </div>
          <p className="text-[13px] font-mono text-slate-500 tabular-nums mt-1">{product.code}</p>
        </div>
      </div>
      {/* 2026-10-12 · Phase 2 Step 3 · 사용자 스크린샷 재분석 · KPI 6-col grid
          · 매입가 / 판매가 / 진열위치 / 현재고 / 적정재고 / 전체금액 (재고자산) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-3 gap-y-2">
        <Field label="매입가" value={purchase} tone="ink" />
        <Field label="판매가" value={sale} tone="emerald" />
        <Field label="진열위치" value={loc} tone="indigo" />
        <Field label="현재고" value={curStock} tone="ink" />
        <Field label="적정재고" value={optStock} tone="amber" />
        <Field label="전체금액" value={totalAmount} tone="ink" />
      </div>
    </div>
  );
};
