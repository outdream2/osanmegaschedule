// src/components/OrderManagePage/ProductDetailModal.tsx
// 2026-08-23 · Framework Phase 4 · 상품 상세정보 모달 분리
import React from "react";
import { Package, X } from "lucide-react";
import { AccentBar } from "../common/AccentBar";
import { Spinner } from "../common/Spinner";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import type { ProductInfo as ProductInfoType } from "../../lib/productsCache";

interface ProductDetailModalProps {
  detailProduct: { code: string; name: string } | null;
  detailFull: Record<string, any> | null;
  detailLoading: boolean;
  detailError: string | null;
  onClose: () => void;
  onRealMapUpdate: (newValue: string | null) => void;
  onProductUpdate: (updates: Record<string, any>) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  detailProduct,
  detailFull,
  detailLoading,
  detailError,
  onClose,
  onRealMapUpdate,
  onProductUpdate,
}) => {
  if (!detailProduct) return null;
  return (
    <div className="fixed inset-0 z-50 backdrop-brand flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-brand-modal w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-zinc-50/60">
          <div className="flex items-center gap-3 min-w-0">
            <AccentBar size="xl" className="shrink-0" />
            <div className="w-10 h-10 rounded-xl bg-brand-deep flex items-center justify-center shrink-0 shadow-sm">
              <Package size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[17px] font-bold text-ink tracking-tight truncate">{detailProduct.name}</div>
              <div className="text-[13px] font-mono text-ink-soft mt-0.5">#{detailProduct.code}</div>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-lg bg-white border border-line hover:border-brand-deep hover:bg-brand-tint text-ink-soft hover:text-brand-deep transition-colors cursor-pointer flex items-center justify-center shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-zinc-50">
          {detailLoading ? (
            <div className="flex justify-center py-8"><Spinner size={20} tone="zinc" /></div>
          ) : detailError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              <div className="font-bold mb-1">조회 실패</div>
              <div className="text-[15px] font-mono">{detailError}</div>
            </div>
          ) : detailFull ? (
            <ProductInfoCard
              product={{
                code: (detailFull as any).product_code ?? detailFull.code ?? detailProduct.code,
                name: (detailFull as any).product_name ?? detailFull.name ?? detailProduct.name,
                spec: (detailFull as any).spec ?? "",
                ...detailFull,
                realMap: (detailFull as any).realMap ?? (detailFull as any).real_map ?? null,
              } as ProductInfoType}
              context="order-manage"
              editable
              onRealMapUpdate={onRealMapUpdate}
              onProductUpdate={onProductUpdate}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};
