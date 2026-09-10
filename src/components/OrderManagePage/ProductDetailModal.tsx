// src/components/OrderManagePage/ProductDetailModal.tsx
// 2026-08-23 · Framework Phase 4 · 상품 상세정보 모달 분리
// 2026-08-23 · Modal primitive 마이그레이션 (#191)
// 2026-09-10 · 사용자 지시 · 좀 전까지 우측 화면 내용 (판매흐름·매입이력·발주내역·재고정보) 모달로 · ProductDetailRightPanel 재사용
import React from "react";
import { Package } from "lucide-react";
import { Modal } from "../common/Modal";
import { Spinner } from "../common/Spinner";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import type { ProductInfo as ProductInfoType } from "../../lib/productsCache";

interface ProductDetailModalProps {
  detailProduct: { code: string; name: string } | null;
  detailFull: Record<string, any> | null;
  detailLoading: boolean;
  detailError: string | null;
  onClose: () => void;
  onProductUpdate: (updates: Record<string, any>) => void;
  onSupplierInfoOpen?: (name: string) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  detailProduct,
  detailFull,
  detailLoading,
  detailError,
  onClose,
  onProductUpdate,
  onSupplierInfoOpen,
}) => (
  <Modal
    open={!!detailProduct}
    onClose={onClose}
    size="3xl"
    titleAccent
    icon={<Package size={18} className="text-white" />}
    title={
      detailProduct ? (
        <div className="min-w-0">
          <div className="text-[17px] font-bold text-ink tracking-tight truncate">{detailProduct.name}</div>
          <div className="text-[15px] font-mono text-ink-soft mt-0.5">#{detailProduct.code}</div>
        </div>
      ) : undefined
    }
    bodyPadding="none"
  >
    <div className="bg-zinc-50 max-h-[80vh] overflow-y-auto">
      {detailLoading ? (
        <div className="flex justify-center py-16"><Spinner size={20} tone="zinc" label="불러오는 중..." /></div>
      ) : detailError ? (
        <div className="p-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            <div className="font-bold mb-1">조회 실패</div>
            <div className="text-[15px]">{detailError}</div>
          </div>
        </div>
      ) : detailFull && detailProduct ? (
        <ProductDetailRightPanel
          selected={{
            code: (detailFull as any).product_code ?? detailFull.code ?? detailProduct.code,
            name: (detailFull as any).product_name ?? detailFull.name ?? detailProduct.name,
            spec: (detailFull as any).spec ?? "",
            ...detailFull,
          } as ProductInfoType}
          onClose={onClose}
          onProductUpdate={onProductUpdate}
          showChart={true}
          context="order-manage"
          editable={true}
          emptySub="상세 정보가 표시됩니다"
          onSupplierInfoOpen={onSupplierInfoOpen}
        />
      ) : null}
    </div>
  </Modal>
);
