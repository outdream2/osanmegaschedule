// src/components/DisplayPage/ProductInfoModal.tsx
// 2026-08-22 · Framework Phase 4 · DisplayPage.tsx 에서 분리
// 2026-08-23 · #191 · inline fixed inset-0 → common/Modal primitive
// 2026-08-28 · 사용자 지시 · 13컬럼 통일 · ProductBasicInfoPanel 상단 삽입 · 판매상태·진열위치 인라인 편집
import React from "react";
import { Package } from "lucide-react";
import { Modal } from "../common/Modal";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import type { ProductInfo } from "../../lib/productsCache";

interface ProductInfoModalProps {
  product: ProductInfo;
  onClose: () => void;
  onProductUpdate: (updates: Partial<ProductInfo>) => void;
}

export const ProductInfoModal: React.FC<ProductInfoModalProps> = ({
  product,
  onClose,
  onProductUpdate,
}) => {
  const code = String(product.code ?? (product as any).product_code ?? "");

  // 2026-10-09 · 사용자 지시 · 홈 랜딩 톤 재디자인 · 상품명 중복 제거
  //   · title header = 상품명 + #code · plain icon · slate 중립 · 2-tier typography
  //   · 외부 ProductBasicInfoPanel/handler 폐기 · ProductInfoCard 내부에서 all handling (중복 X)
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2.5 min-w-0">
          <Package size={18} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
          <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
            <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight leading-tight truncate">
              {product.name ?? (product as any).product_name ?? "(상품명 없음)"}
            </span>
            <span className="text-[13px] md:text-[14px] font-mono text-slate-400 tabular-nums shrink-0">#{code}</span>
          </div>
        </div>
      }
      className="max-h-[98vh] sm:max-h-[92vh]"
    >
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-slate-50 space-y-3">
        {/* 2026-10-09 · 사용자 지시 · 상품정보 중복 제거
             · 외부 ProductBasicInfoPanel 폐기 · ProductInfoCard 내부 panel 만 사용
             · hideProductName · modal title 이 상품명 표시 → 내부 panel 상품명 field 숨김 */}
        <ProductInfoCard
          product={product}
          context="stock-manage"
          editable
          onProductUpdate={onProductUpdate}
          hideProductName
        />
      </div>
    </Modal>
  );
};
