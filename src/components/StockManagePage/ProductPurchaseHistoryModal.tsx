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
        <div className="flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-200 bg-emerald-50/50">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp size={20} className="text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-black text-zinc-800 break-words leading-tight">{productName}</div>
              <div className="text-[12px] text-zinc-500 tabular-nums">
                코드 <span className="font-black">{productCode}</span>
                <span className="ml-2 text-zinc-400">· 매입 이력 조회</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-500 shrink-0 ml-2 transition"><XIcon size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {!loading && !error && rows.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg px-3 py-2">
                  <div className="text-[12px] font-semibold text-emerald-800 opacity-70 uppercase">총 매입 건수</div>
                  <div className="text-lg font-semibold text-emerald-800 tabular-nums">{rows.length.toLocaleString()}건</div>
                </div>
                <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg px-3 py-2">
                  <div className="text-[12px] font-semibold text-indigo-800 opacity-70 uppercase">총 매입 수량</div>
                  <div className="text-lg font-semibold text-indigo-800 tabular-nums">{totalQty.toLocaleString()}</div>
                </div>
                <div className="bg-violet-50/70 border border-violet-200 rounded-lg px-3 py-2">
                  <div className="text-[12px] font-semibold text-violet-800 opacity-70 uppercase">총 매입 금액</div>
                  <div className="text-lg font-semibold text-violet-800 tabular-nums">{totalAmount.toLocaleString()}<span className="text-xs ml-0.5">원</span></div>
                </div>
              </div>
              <div className="text-[12px] text-zinc-500 mb-1 flex items-center gap-2">
                <span className="font-black">공급사 종류:</span>
                <span className="tabular-nums text-zinc-700">{uniqueSuppliers}개 사</span>
              </div>
            </>
          )}
          {/* 공통 PurchaseHistoryList · 헤더 자동 정렬 · 통일 스타일 */}
          <div className="rounded-lg border border-zinc-200 overflow-hidden max-h-[50vh] flex flex-col">
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
              <span className="font-black text-zinc-500">데이터 소스:</span> purchase_details · 매입상세 xlsx 임포트에서 저장된 이력
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductPurchaseHistoryModal;
