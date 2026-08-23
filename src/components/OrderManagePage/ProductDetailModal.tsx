// src/components/OrderManagePage/ProductDetailModal.tsx
// 2026-08-23 · Framework Phase 4 · 상품 상세정보 모달 분리
// 2026-08-23 · Modal primitive 마이그레이션 (#191)
import React from "react";
import { Package } from "lucide-react";
import { Modal } from "../common/Modal";
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
}) => (
  <Modal
    open={!!detailProduct}
    onClose={onClose}
    size="md"
    titleAccent
    icon={<Package size={18} className="text-white" />}
    title={
      detailProduct ? (
        <div className="min-w-0">
          <div className="text-[17px] font-bold text-ink tracking-tight truncate">{detailProduct.name}</div>
          <div className="text-[13px] font-mono text-ink-soft mt-0.5">#{detailProduct.code}</div>
        </div>
      ) : undefined
    }
  >
    <div className="p-4 bg-zinc-50">
      {detailLoading ? (
        <div className="flex justify-center py-8"><Spinner size={20} tone="zinc" /></div>
      ) : detailError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          <div className="font-bold mb-1">조회 실패</div>
          <div className="text-[15px] font-mono">{detailError}</div>
        </div>
      ) : detailFull && detailProduct ? (
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
  </Modal>
);
