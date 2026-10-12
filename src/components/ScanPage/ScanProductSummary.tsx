// src/components/ScanPage/ScanProductSummary.tsx
// 2026-10-11 · UI-12 · 사용자 지시 "실재고확인 오른쪽 상세정보 매입가·판매가·공급사·현재고·판매상태 위 · 나머지 적정한 곳 · UI 개선"
//   · ScanPage 오른쪽 panel · ScanRightPanel 위 render
//   · 상단 (위) · 매입가 / 판매가 / 공급사 / 현재고 / 판매상태 · 사용자 명시 5-field
//   · 하단 (적정한 곳) · 진열위치 / 적정재고 / 재고자산
//   · 홈 랜딩 톤 · rounded-[12px] + border-slate-200 + thin shadow · 2-tier typography

import React, { useRef, useState } from "react";
import { Package, Camera } from "lucide-react";
import type { ProductInfo } from "../../lib/productsCache";
import { formatDisplayLocation } from "../../lib/formatDisplayLocation";

interface ScanProductSummaryProps {
  product: ProductInfo | null;
}

// 2026-10-12 · UI-11-SCAN Phase 2 Step 1 · 스크린샷 패턴 · 큰 숫자 + tone 분화
type FieldTone = "ink" | "sky" | "emerald" | "rose" | "indigo";
const TONE_TEXT: Record<FieldTone, string> = {
  ink: "text-ink",
  sky: "text-sky-700",
  emerald: "text-emerald-700",
  rose: "text-rose-700",
  indigo: "text-indigo-700",
};
const Field: React.FC<{ label: string; value: string; emphasize?: boolean; tone?: FieldTone }> = ({ label, value, emphasize, tone = "ink" }) => (
  <div className="min-w-0">
    <p className="text-[13px] font-medium text-slate-500 mb-0.5">{label}</p>
    <p
      className={`font-bold break-words leading-tight tabular-nums ${TONE_TEXT[tone]} ${emphasize ? "text-[16px] md:text-[17px]" : "text-[14px]"}`}
      title={value}
    >
      {value}
    </p>
  </div>
);

// 2026-10-12 · 판매상태 pill (판매중 emerald · 중지 rose · 기타 slate)
const SaleStatusPill: React.FC<{ status: string }> = ({ status }) => {
  const isActive = /판매\s*중|active|판매중/i.test(status);
  const isStopped = /중지|stop|단종|판매\s*중지/i.test(status);
  const tone = isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200"
             : isStopped ? "bg-rose-50 text-rose-700 border-rose-200"
             : "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center h-6 px-2 rounded-full border text-[12px] font-semibold ${tone}`}>
      {status}
    </span>
  );
};

export const ScanProductSummary: React.FC<ScanProductSummaryProps> = ({ product }) => {
  // 2026-10-12 · UI-11-SCAN · 사용자 지시 "사진 찍어서 넣을 수 있는 구조" ·
  //   · camera input (file accept image/* + capture environment · 모바일 카메라 바로 열림)
  //   · 로컬 base64 preview · Phase 2 · Supabase storage upload API
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
      {/* 상단 header · 상품 사진 + 상품명 + 바코드 + 카메라 input (UI-11-SCAN) */}
      <div className="flex items-start gap-3 mb-3 pb-2.5 border-b border-slate-100">
        {/* 상품 사진 thumbnail + 카메라 input */}
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
        <span className="w-[3px] h-[14px] mt-1 bg-indigo-500 rounded-full shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] md:text-[16px] font-bold text-ink leading-snug break-words">
            {product.name ?? "-"}
          </p>
          <p className="text-[13px] font-mono text-slate-500 tabular-nums mt-0.5">{product.code}</p>
        </div>
      </div>
      {/* 사용자 지시 "위" · 매입가·판매가·공급사·현재고·판매상태
          2026-10-12 · Phase 2 Step 1 · tone 분화 · 매입가 ink · 판매가 emerald · 현재고 indigo · 판매상태 pill */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-x-3 gap-y-2 mb-2.5">
        <Field label="매입가" value={purchase} emphasize tone="ink" />
        <Field label="판매가" value={sale} emphasize tone="emerald" />
        <Field label="공급사" value={supplier} emphasize tone="ink" />
        <Field label="현재고" value={curStock} emphasize tone="indigo" />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-500 mb-0.5">판매상태</p>
          <SaleStatusPill status={saleStatus} />
        </div>
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
