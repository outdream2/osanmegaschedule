// src/components/DisplayPage/ProductInfoModal.tsx
// 2026-08-22 · Framework Phase 4 · DisplayPage.tsx 에서 분리
// 2026-08-23 · #191 · inline fixed inset-0 → common/Modal primitive
// 2026-08-28 · 사용자 지시 · 13컬럼 통일 · ProductBasicInfoPanel 상단 삽입 · 판매상태·진열위치 인라인 편집
import React from "react";
import { Package } from "lucide-react";
import { Modal } from "../common/Modal";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import { ProductBasicInfoPanel } from "../common/ProductBasicInfoPanel";
import { api } from "../../lib/apiClient";
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
  const code = String(product.code ?? (product as any).product_code ?? "");

  // 진열위치 편집 · PATCH /api/products/:code · location 필드
  const handleLocationChange = async (newLocation: string | null) => {
    if (!code) return;
    await api.patch(`/api/products/${encodeURIComponent(code)}`, { location: newLocation, display_location: newLocation });
    onProductUpdate({ location: newLocation, display_location: newLocation } as unknown as Partial<ProductInfo>);
  };
  // 판매상태 편집 · PATCH /api/products/:code · sale_status 필드
  const handleSaleStatusChange = async (newStatus: string) => {
    if (!code) return;
    await api.patch(`/api/products/${encodeURIComponent(code)}`, { sale_status: newStatus });
    onProductUpdate({ sale_status: newStatus } as unknown as Partial<ProductInfo>);
  };

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
            <div className="text-[11px] font-mono text-zinc-500 mt-0.5">#{code}</div>
          </div>
        </div>
      }
      headerTint
      className="max-h-[98vh] sm:max-h-[92vh]"
    >
      <div className="flex-1 overflow-y-auto p-2 sm:p-4 bg-zinc-50 space-y-3">
        {/* 2026-08-28 · 사용자 지시 · 13컬럼 통일 기본정보 · 인라인 편집 (진열위치·판매상태) */}
        <ProductBasicInfoPanel
          product={{
            product_code: code,
            category_code: (product as any).category_code,
            category: (product as any).category,
            product_name: product.name ?? (product as any).product_name ?? null,
            supplier: product.supplier ?? null,
            location: (product as any).location ?? (product as any).display_location ?? null,
            display_location: (product as any).display_location ?? null,
            sale_status: (product as any).sale_status ?? null,
            current_stock: (product as any).current_stock ?? null,
            warehouse_stock: (product as any).warehouse_stock ?? null,
            store_stock: (product as any).store_stock ?? null,
            purchase_price: (product as any).purchase_price ?? null,
            sale_price: (product as any).sale_price ?? null,
            profit_rate: (product as any).profit_rate ?? null,
            optimal_stock: (product as any).optimal_stock ?? null,
            last_purchase_date: (product as any).last_purchase_date ?? null,
          }}
          editable
          onLocationChange={handleLocationChange}
          onSaleStatusChange={handleSaleStatusChange}
          compact
        />
        {/* 기존 상세 카드 (매입이력 · 재고 편집 등) · 하위 세부 정보 · 유지 */}
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
