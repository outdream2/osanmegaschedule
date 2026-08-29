// src/components/common/ProductDetailHero.tsx
// 2026-08-29 · #186 A안 · Attio Sticky Hero + Section Stack
//
// 상품 상세 우측 패널 · 최상단 sticky bar · 상품명 · 코드 · 카테고리 · 공급사 · 판매상태 배지
// Linear/Notion/Attio 2026 톤 · 목업 UI_MOCKUP_2026-08-21 색상·타이포 준수
//
// 사용:
//   <ProductDetailHero
//     product={{ product_name, product_code, category, supplier, sale_status }}
//     actions={<button>상세 편집</button>}
//   />
import React from "react";
import { Package } from "lucide-react";
import { GradientAccent } from "./GradientAccent";

export interface ProductDetailHeroInfo {
  product_code: string;
  product_name?: string | null;
  category?: string | null;
  category_code?: string | null;
  supplier?: string | null;
  sale_status?: string | null;
  barcode?: string | null;
}

export interface ProductDetailHeroProps {
  product: ProductDetailHeroInfo;
  /** 우측 상단 · 액션 슬롯 (버튼 · 배지 등) */
  actions?: React.ReactNode;
  /** sticky 활성 (기본 true) · 스크롤 시 상단 고정 */
  sticky?: boolean;
  className?: string;
}

function saleStatusTone(status: string | null | undefined): { bg: string; text: string; label: string } {
  const s = String(status ?? "").trim();
  if (s === "판매중")   return { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "판매중" };
  if (s === "판매중지") return { bg: "bg-zinc-100 border-zinc-200",     text: "text-zinc-600",    label: "판매중지" };
  if (s === "품절")     return { bg: "bg-amber-50 border-amber-200",   text: "text-amber-700",   label: "품절" };
  return { bg: "bg-zinc-50 border-zinc-200", text: "text-zinc-500", label: s || "미지정" };
}

export const ProductDetailHero: React.FC<ProductDetailHeroProps> = ({
  product, actions, sticky = true, className = "",
}) => {
  const tone = saleStatusTone(product.sale_status);
  const stickyCls = sticky ? "sticky top-0 z-20" : "";
  return (
    <div className={`${stickyCls} relative bg-white/95 backdrop-blur-md border-b border-line ${className}`}>
      {/* accent gradient · 목업 시그니처 · GradientAccent 프리미티브 */}
      <GradientAccent />
      <div className="px-5 py-4">
        <div className="flex items-start gap-4">
          {/* 좌측 · 아이콘 + 상품명·메타 */}
          <div className="shrink-0 mt-1">
            <div className="w-11 h-11 rounded-xl bg-brand-tint/60 border border-brand-deep/10 flex items-center justify-center">
              <Package size={22} className="text-brand-deep" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[22px] font-bold text-ink tracking-tight leading-tight break-keep">
                {product.product_name || "(이름 없음)"}
              </h1>
              <span className={`inline-flex items-center h-6 px-2 rounded-full border text-[12px] font-bold ${tone.bg} ${tone.text}`}>
                {tone.label}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[13px] text-ink-soft">
              <span className="font-mono tabular-nums text-zinc-500">코드 {product.product_code}</span>
              {product.category && (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className="font-semibold text-brand-deep/80">{product.category}</span>
                </>
              )}
              {product.supplier && (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className="text-zinc-600">{product.supplier}</span>
                </>
              )}
              {product.barcode && (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className="font-mono tabular-nums text-zinc-400 text-[12px]">BC {product.barcode}</span>
                </>
              )}
            </div>
          </div>
          {actions && (
            <div className="shrink-0 flex items-center gap-2">{actions}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductDetailHero;
