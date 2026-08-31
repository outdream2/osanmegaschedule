// src/components/common/features/ProductDetailModal.tsx
// 2026-08-31 · 사용자 지시 · 상품 상세 모달 · 공통 프리미티브 · #32
//   · 원본 · OrderManagePage/ProductDetailModal.tsx (분리 유지)
//   · 이 파일 · self-contained · 훅 방식 · useVendorInfoModal 과 동일 패턴
//   · 사용 · 어느 페이지든 상품명 클릭 시 이 훅 사용
//
// 사용 예:
//   const { openProduct, modalElement } = useProductDetailModal();
//   <button onClick={() => openProduct({ code: "12345", name: "타이레놀" })}>타이레놀</button>
//   {modalElement}

import React, { useCallback, useEffect, useState } from "react";
import { Package } from "lucide-react";
import { Modal } from "../Modal";
import { Spinner } from "../Spinner";
import { ProductInfoCard } from "../../ScanPage/ProductInfoCard";
import type { ProductInfo as ProductInfoType } from "../../../lib/productsCache";
import { api, ApiError } from "../../../lib/apiClient";

export interface ProductRef {
  code: string;
  name?: string;
}

export function useProductDetailModal() {
  const [open, setOpen] = useState<ProductRef | null>(null);
  const [detailFull, setDetailFull] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setDetailFull(null); setError(null); return; }
    setLoading(true);
    setError(null);
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<any>(`/api/products/${encodeURIComponent(open.code)}`);
        if (cancelled) return;
        setDetailFull(data ?? null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : (e as Error)?.message ?? "조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open?.code]);

  const openProduct = useCallback((ref: ProductRef) => setOpen(ref), []);
  const close = useCallback(() => setOpen(null), []);

  const modalElement: React.ReactNode = (
    <Modal
      open={!!open}
      onClose={close}
      size="md"
      titleAccent
      icon={<Package size={18} className="text-white" />}
      title={
        open ? (
          <div className="min-w-0">
            <div className="text-[17px] font-bold text-ink tracking-tight truncate">{open.name ?? open.code}</div>
            <div className="text-[13px] font-mono text-ink-soft mt-0.5">#{open.code}</div>
          </div>
        ) : undefined
      }
    >
      <div className="p-4 bg-zinc-50">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner size={20} tone="zinc" /></div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            <div className="font-bold mb-1">조회 실패</div>
            <div className="text-[15px] font-mono">{error}</div>
          </div>
        ) : detailFull && open ? (
          <ProductInfoCard
            product={{
              code: (detailFull as any).product_code ?? detailFull.code ?? open.code,
              name: (detailFull as any).product_name ?? detailFull.name ?? open.name ?? open.code,
              spec: (detailFull as any).spec ?? "",
              ...detailFull,
              realMap: (detailFull as any).realMap ?? (detailFull as any).real_map ?? null,
            } as ProductInfoType}
            context="order-manage"
            editable
            onRealMapUpdate={(newValue) => setDetailFull(prev => prev ? { ...prev, realMap: newValue, real_map: newValue } : prev)}
            onProductUpdate={(updates) => setDetailFull(prev => prev ? { ...prev, ...updates } : prev)}
          />
        ) : null}
      </div>
    </Modal>
  );

  return { openProduct, close, modalElement, loading, error };
}
