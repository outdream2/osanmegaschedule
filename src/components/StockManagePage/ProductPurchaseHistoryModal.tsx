// src/components/StockManagePage/ProductPurchaseHistoryModal.tsx
// 상품 매입 이력 모달 — StockManagePage 와 SalesTrendPage 공용
// 2026-08-03 · StockManagePage.tsx 에서 분리 추출
// 2026-08-04 · 내부 표 UI → 공통 PurchaseHistoryList
// 2026-08-18 · <Modal> + <IconTile> + <KpiCard>/inline mini-stat 프레임워크 통합

import React, { useEffect, useState } from "react";
import { API_LIMITS } from "../../constants/apiLimits";
import { TrendingUp } from "lucide-react";
import { PurchaseHistoryList, type PurchaseHistoryRow } from "../common/PurchaseHistoryList";
import { Modal } from "../common/Modal";
import { IconTile } from "../common/IconTile";
// 2026-08-21 · Framework Phase 3 · fetch → apiClient
import { api, ApiError } from "../../lib/apiClient";

export const ProductPurchaseHistoryModal: React.FC<{
  productCode: string;
  productName: string;
  onClose: () => void;
}> = ({ productCode, productName, onClose }) => {
  const [rows, setRows] = useState<PurchaseHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ product_code: productCode, limit: String(API_LIMITS.MEDIUM) });
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    api.get<{ rows?: PurchaseHistoryRow[] }>(`/api/purchase-details?${params}`)
      .then(({ data }) => setRows(Array.isArray(data.rows) ? data.rows : []))
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "조회 실패";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [productCode]);

  const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalAmount = rows.reduce((s, r) => s + (Number(r.total ?? r.amount) || 0), 0);
  const uniqueSuppliers = new Set(rows.map(r => r.supplier_name).filter(Boolean)).size;

  return (
    <Modal
      open={true}
      onClose={onClose}
      size="lg"
      titleAccent
      icon={<IconTile icon={<TrendingUp size={16} />} tone="brand" size="lg" shape="rounded-xl" />}
      title={
        <div className="min-w-0">
          <div className="text-[17px] font-bold text-ink break-words leading-tight tracking-tight">{productName}</div>
          <div className="text-[13px] text-ink-soft tabular-nums mt-0.5">
            코드 <span className="font-bold text-ink">{productCode}</span>
            <span className="ml-2">· 매입 이력 조회</span>
          </div>
        </div>
      }
    >
      {!loading && !error && rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { dot: "bg-emerald-500", text: "text-emerald-700", label: "총 매입 건수", value: rows.length.toLocaleString(), unit: "건" },
              { dot: "bg-brand-deep",  text: "text-brand-deep",  label: "총 매입 수량", value: totalQty.toLocaleString(),    unit: "" },
              { dot: "bg-violet-500",  text: "text-violet-700",  label: "총 매입 금액", value: totalAmount.toLocaleString(), unit: "원" },
            ].map((k, i) => (
              <div key={i} className="bg-white rounded-2xl border border-line px-3 py-2.5
                shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)]">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${k.dot}`} />
                  <div className="text-[12px] font-semibold text-ink-soft tracking-tight">{k.label}</div>
                </div>
                <div className={`text-[18px] font-extrabold tabular-nums leading-tight ${k.text}`}>
                  {k.value}
                  {k.unit && <span className="text-[12px] ml-0.5 font-semibold text-ink-soft">{k.unit}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[12px] text-ink-soft mb-2 flex items-center gap-2">
            <span className="font-bold">공급사 종류:</span>
            <span className="tabular-nums text-ink font-semibold">{uniqueSuppliers}개 사</span>
          </div>
        </>
      )}

      <div className="rounded-lg border border-line overflow-hidden max-h-[50vh] flex flex-col">
        <PurchaseHistoryList
          rows={rows}
          loading={loading}
          error={error}
          showSupplier
          emptyText="매입 이력 없음"
          footerHint={!loading && !error && rows.length === 0
            ? "purchase_details 테이블에 이 상품의 매입 기록이 없습니다"
            : undefined}
        />
      </div>
      {!loading && !error && rows.length > 0 && (
        <div className="mt-2 text-[12px] text-ink-soft">
          <span className="font-bold">데이터 소스:</span> purchase_details · 매입상세 xlsx 임포트에서 저장된 이력
        </div>
      )}
    </Modal>
  );
};

export default ProductPurchaseHistoryModal;
