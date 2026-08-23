// src/components/DisplayPage/ProductInfoModal.tsx
// 2026-08-22 · Framework Phase 4 · DisplayPage.tsx 에서 분리
// 2026-08-23 · #191 · inline fixed inset-0 → common/Modal primitive
import React from "react";
import { Package } from "lucide-react";
import { Modal } from "../common/Modal";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import type { ProductInfo } from "../../lib/productsCache";

interface ProductInfoModalProps {
  product: ProductInfo;
  onClose: () => void;
  onRealMapUpdate: (newValue: string) => void;
  onProductUpdate: (updates: Partial<ProductInfo>) => void;
}

export const ProductInfoModal: React.FC<ProductInfoModalProps> = ({
  product,
  onClose,
  onRealMapUpdate,
  onProductUpdate,
}) => {
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-md">
            <Package size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold text-zinc-800 truncate">{product.name ?? (product as any).product_name}</div>
            <div className="text-[11px] font-mono text-zinc-500 mt-0.5">#{product.code ?? (product as any).product_code}</div>
          </div>
        </div>
      }
      headerTint
      className="max-h-[98vh] sm:max-h-[92vh]"
    >
      <div className="flex-1 overflow-y-auto p-2 sm:p-4 bg-zinc-50">
        <ProductInfoCard
          product={product}
          context="stock-manage"
          editable
          onRealMapUpdate={onRealMapUpdate}
          onProductUpdate={onProductUpdate}
        />
      </div>
    </Modal>
  );
};
