// src/components/StockManagePage/ProductPurchaseHistoryModal.tsx
// 상품 매입 이력 모달 — StockManagePage 와 SalesTrendPage 공용
// 2026-08-03 · StockManagePage.tsx 에서 분리 추출
// 2026-08-04 · 내부 표 UI → 공통 PurchaseHistoryList 컴포넌트로 교체 (사용자 요청 · 통일)

import React, { useEffect, useState } from "react";
import { API_LIMITS } from "../../constants/apiLimits";
import { TrendingUp, X as XIcon } from "lucide-react";
import { PurchaseHistoryList, type PurchaseHistoryRow } from "../common/PurchaseHistoryList";

export const ProductPurchaseHistoryModal: React.FC<{
  productCode: string;
  productName: string;
  onClose: () => void;
}> = ({ productCode, productName, onClose }) => {
  const [rows, setRows] = useState<PurchaseHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ product_code: productCode, limit: String(API_LIMITS.MEDIUM) });
    fetch(`/api/purchase-details?${params}`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(j => setRows(Array.isArray(j.rows) ? j.rows : []))
      .catch(e => setError(e?.message ?? "조회 실패"))
      .finally(() => setLoading(false));
  }, [productCode]);

  const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalAmount = rows.reduce((s, r) => s + (Number(r.total ?? r.amount) || 0), 0);
  const uniqueSuppliers = new Set(rows.map(r => r.supplier_name).filter(Boolean)).size;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[90vh] md:h-auto md:min-h-[70vh] md:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 2026-08-17 · 최신 트렌드 · accent bar + 딥네이비 통일 */}
        <div className="flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-line bg-zinc-50/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-[3px] h-[24px] rounded-full bg-brand-deep shrink-0 mt-1" />
            <TrendingUp size={20} className="text-brand-deep shrink-0 mt-1" />
            <div className="min-w-0">
              <div className="text-[17px] sm:text-[19px] font-bold text-ink break-words leading-tight tracking-tight">{productName}</div>
              <div className="text-[13px] text-ink-soft tabular-nums mt-0.5">
                코드 <span className="font-bold text-ink">{productCode}</span>
                <span className="ml-2 text-ink-soft">· 매입 이력 조회</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg bg-white hover:bg-brand-tint hover:border-brand-deep border border-line text-ink-soft hover:text-brand-deep flex items-center justify-center shrink-0 ml-2 transition-colors" aria-label="닫기"><XIcon size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {!loading && !error && rows.length > 0 && (
            <>
              {/* 2026-08-17 · Vercel Dashboard 톤 · white body + status dot */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <div className="text-[12px] font-semibold text-ink-soft tracking-tight">총 매입 건수</div>
                  </div>
                  <div className="text-[18px] font-extrabold text-emerald-700 tabular-nums leading-tight">{rows.length.toLocaleString()}건</div>
                </div>
                <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <div className="text-[12px] font-semibold text-ink-soft tracking-tight">총 매입 수량</div>
                  </div>
                  <div className="text-[18px] font-extrabold text-indigo-700 tabular-nums leading-tight">{totalQty.toLocaleString()}</div>
                </div>
                <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    <div className="text-[12px] font-semibold text-ink-soft tracking-tight">총 매입 금액</div>
                  </div>
                  <div className="text-[18px] font-extrabold text-violet-700 tabular-nums leading-tight">{totalAmount.toLocaleString()}<span className="text-[12px] ml-0.5 font-semibold text-ink-soft">원</span></div>
                </div>
              </div>
              <div className="text-[12px] text-zinc-500 mb-1 flex items-center gap-2">
                <span className="font-bold">공급사 종류:</span>
                <span className="tabular-nums text-zinc-700">{uniqueSuppliers}개 사</span>
              </div>
            </>
          )}
          {/* 공통 PurchaseHistoryList · 헤더 자동 정렬 · 통일 스타일 */}
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
            <div className="mt-2 text-[12px] text-zinc-400">
              <span className="font-bold text-zinc-500">데이터 소스:</span> purchase_details · 매입상세 xlsx 임포트에서 저장된 이력
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductPurchaseHistoryModal;
