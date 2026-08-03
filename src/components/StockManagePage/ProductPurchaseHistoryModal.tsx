// src/components/StockManagePage/ProductPurchaseHistoryModal.tsx
// 상품 매입 이력 모달 — StockManagePage 와 SalesTrendPage 공용
// 2026-08-03 · StockManagePage.tsx 에서 분리 추출

import React, { useEffect, useState } from "react";
import { TrendingUp, X as XIcon } from "lucide-react";

interface PurchaseDetailRow {
  id: number;
  purchase_date: string;
  supplier_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  total: number | null;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

export const ProductPurchaseHistoryModal: React.FC<{
  productCode: string;
  productName: string;
  onClose: () => void;
}> = ({ productCode, productName, onClose }) => {
  const [rows, setRows] = useState<PurchaseDetailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ product_code: productCode, limit: "500" });
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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[90vh] md:h-auto md:min-h-[70vh] md:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-emerald-50/50">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp size={20} className="text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-black text-slate-800 break-words leading-tight">{productName}</div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                코드 <span className="font-black">{productCode}</span>
                <span className="ml-2 text-slate-400">· 매입 이력 조회</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 ml-2 transition"><XIcon size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
              <div className="text-xs font-black text-slate-600">데이터 로딩중...</div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-rose-500 text-sm font-bold">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              <div className="font-bold">매입 이력 없음</div>
              <div className="text-[11px] text-slate-400 mt-1">purchase_details 테이블에 이 상품의 매입 기록이 없습니다</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg px-3 py-2">
                  <div className="text-[11px] font-semibold text-emerald-800 opacity-70 uppercase">총 매입 건수</div>
                  <div className="text-lg font-semibold text-emerald-800 tabular-nums">{rows.length.toLocaleString()}건</div>
                </div>
                <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg px-3 py-2">
                  <div className="text-[11px] font-semibold text-indigo-800 opacity-70 uppercase">총 매입 수량</div>
                  <div className="text-lg font-semibold text-indigo-800 tabular-nums">{totalQty.toLocaleString()}</div>
                </div>
                <div className="bg-violet-50/70 border border-violet-200 rounded-lg px-3 py-2">
                  <div className="text-[11px] font-semibold text-violet-800 opacity-70 uppercase">총 매입 금액</div>
                  <div className="text-lg font-semibold text-violet-800 tabular-nums">{totalAmount.toLocaleString()}<span className="text-xs ml-0.5">원</span></div>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 mb-1 flex items-center gap-2">
                <span className="font-black">공급사 종류:</span>
                <span className="tabular-nums text-slate-700">{uniqueSuppliers}개 사</span>
              </div>
              <div className="rounded-lg border border-slate-200 overflow-auto max-h-[50vh]">
                <table className="w-full text-xs min-w-[520px]">
                  <thead className="sticky top-0 bg-slate-50 border-b-2 border-slate-200 z-10 shadow-sm text-slate-500 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-2 py-1 w-16">매입일</th>
                      <th className="text-left px-2 py-1">공급사</th>
                      <th className="text-right px-2 py-1 w-10">수량</th>
                      <th className="text-right px-2 py-1 w-16">단가</th>
                      <th className="text-right px-2 py-1 w-16">금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => (
                      <tr key={r.id ?? i} className="hover:bg-slate-50/60 transition-all duration-150 align-top">
                        <td className="px-2 py-1 tabular-nums text-slate-500 whitespace-nowrap">{String(r.purchase_date).slice(5)}</td>
                        <td className="px-2 py-1 text-slate-700 break-words leading-tight font-semibold">{r.supplier_name ?? "-"}</td>
                        <td className="text-right px-2 py-1 tabular-nums text-slate-700">{r.quantity != null ? Number(r.quantity).toLocaleString() : "-"}</td>
                        <td className="text-right px-2 py-1 tabular-nums text-slate-600">{r.unit_price != null ? Number(r.unit_price).toLocaleString() : "-"}</td>
                        <td className="text-right px-2 py-1 tabular-nums font-black text-emerald-700 whitespace-nowrap">{r.total != null ? fmt(Number(r.total)) : r.amount != null ? fmt(Number(r.amount)) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                <span className="font-black text-slate-500">데이터 소스:</span> purchase_details · 매입상세 xlsx 임포트에서 저장된 이력
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductPurchaseHistoryModal;
