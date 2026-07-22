// src/components/common/PurchaseHistoryModal.tsx
// 2026-07-22 · 상품 매입 이력 모달 · 리스트에서 매입일 클릭 시 표시
//
// 데이터 소스: /api/purchase-details?product_code=X (기존 API 재사용)
// 사용:
//   const [open, setOpen] = useState<{code:string; name?:string} | null>(null);
//   <button onClick={() => setOpen({code: p.product_code, name: p.product_name})}>...</button>
//   {open && <PurchaseHistoryModal productCode={open.code} productName={open.name} onClose={() => setOpen(null)} />}

import React, { useEffect, useState } from "react";
import { X, Loader2, TrendingUp, Package } from "lucide-react";

interface PurchaseRow {
  purchase_date: string;
  supplier_name: string | null;
  quantity: number;
  amount: number;
  total: number;
  unit_price: number;
}

interface PurchaseHistoryModalProps {
  productCode: string;
  productName?: string;
  /** 강조할 매입일 (모달 열 때 클릭한 날짜) · 해당 행 배경 하이라이트 */
  highlightDate?: string;
  onClose: () => void;
}

const fmt = (n: number) => (n ?? 0).toLocaleString("ko-KR");
const fmtWon = (n: number): string => {
  if (!Number.isFinite(n)) return "0원";
  if (n >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return `${n.toLocaleString()}원`;
};

export const PurchaseHistoryModal: React.FC<PurchaseHistoryModalProps> = ({
  productCode,
  productName,
  highlightDate,
  onClose,
}) => {
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productCode) return;
    setLoading(true);
    setError(null);
    fetch(`/api/purchase-details?product_code=${encodeURIComponent(productCode)}&limit=500`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setRows(Array.isArray(j.rows) ? j.rows : []))
      .catch(e => setError(e?.message ?? "로드 실패"))
      .finally(() => setLoading(false));
  }, [productCode]);

  // 통계
  const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalAmt = rows.reduce((s, r) => s + (Number(r.total ?? r.amount) || 0), 0);
  const avgAmt = rows.length > 0 ? Math.round(totalAmt / rows.length) : 0;
  const avgCycleDays = (() => {
    if (rows.length < 2) return null;
    const dates = rows
      .map(r => (r.purchase_date ? new Date(String(r.purchase_date)).getTime() : NaN))
      .filter(t => Number.isFinite(t))
      .sort((a, b) => a - b);
    if (dates.length < 2) return null;
    let sum = 0;
    for (let i = 1; i < dates.length; i++) sum += (dates[i] - dates[i - 1]);
    return Math.round(sum / (dates.length - 1) / (1000 * 60 * 60 * 24));
  })();

  // 최근순 정렬 (내림차순)
  const sorted = [...rows].sort((a, b) =>
    String(b.purchase_date ?? "").localeCompare(String(a.purchase_date ?? ""))
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start gap-3 px-4 py-3 border-b border-slate-200 bg-gradient-to-br from-emerald-50 to-white">
          <TrendingUp size={20} className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-black text-slate-800">매입 이력</span>
              <span className="text-[11px] font-mono text-slate-500">{productCode}</span>
            </div>
            {productName && (
              <div className="text-xs font-semibold text-slate-700 truncate mt-0.5" title={productName}>
                <Package size={11} className="inline mr-1 text-slate-400" />{productName}
              </div>
            )}
            {!loading && rows.length > 0 && (
              <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] font-mono text-slate-500">
                <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-black">{rows.length}건</span>
                <span>총 <b>{fmt(totalQty)}</b>개</span>
                <span>·</span>
                <span className="text-emerald-700 font-black">{fmtWon(totalAmt)}</span>
                <span>·</span>
                <span title="건당 평균 매입액">평균 <b className="text-indigo-600">{fmtWon(avgAmt)}</b></span>
                {avgCycleDays != null && (
                  <>
                    <span>·</span>
                    <span title="평균 매입주기 (연속 매입일 간격 평균)">주기 <b className="text-sky-600">{avgCycleDays}일</b></span>
                  </>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1 transition"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-500">
              <Loader2 size={18} className="animate-spin mr-2" />로딩 중...
            </div>
          )}
          {error && !loading && (
            <div className="p-4 text-center text-rose-600 text-xs font-semibold">에러: {error}</div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-xs">매입 이력 없음</div>
          )}
          {!loading && !error && rows.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                <tr className="text-slate-500 text-[11px] uppercase tracking-wider">
                  <th className="text-left px-3 py-2">매입일</th>
                  <th className="text-left px-3 py-2">공급사</th>
                  <th className="text-right px-3 py-2 w-16">수량</th>
                  <th className="text-right px-3 py-2 w-20">단가</th>
                  <th className="text-right px-3 py-2 w-24">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((r, i) => {
                  const isHighlight = highlightDate && String(r.purchase_date).startsWith(highlightDate);
                  return (
                    <tr key={i} className={isHighlight ? "bg-amber-50" : "hover:bg-emerald-50/40"}>
                      <td className="px-3 py-1.5 font-mono text-slate-700 whitespace-nowrap font-semibold">
                        {r.purchase_date}
                        {isHighlight && <span className="ml-1 text-[10px] text-amber-600 font-black">◀</span>}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700 truncate max-w-[160px]" title={r.supplier_name ?? undefined}>
                        {r.supplier_name ?? "-"}
                      </td>
                      <td className="text-right px-3 py-1.5 font-mono font-bold text-slate-800">{fmt(Number(r.quantity) || 0)}</td>
                      <td className="text-right px-3 py-1.5 font-mono text-slate-500">{r.unit_price ? fmt(r.unit_price) : "-"}</td>
                      <td className="text-right px-3 py-1.5 font-mono font-black text-emerald-700">{fmtWon(Number(r.total ?? r.amount) || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-400 text-center">
          최근순 · 최대 500건 · 클릭한 매입일은 <span className="text-amber-600 font-black">노랑 하이라이트</span>
        </div>
      </div>
    </div>
  );
};
