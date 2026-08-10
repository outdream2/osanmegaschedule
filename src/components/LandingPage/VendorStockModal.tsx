// 2026-08-10 · #23 · 거래처 로그인 · 공급사 재고확인 모달
// 로그인한 공급사의 상품 리스트 + 재고 (ERP현재고) 조회
// MVP: products.supplier 로 필터 · current_stock 표시
// 향후 확장: 실재고 (창고1/2·매장1/2/3) 세부 breakdown

import React, { useEffect, useState } from "react";
import { X, Package, Search, Loader2 } from "lucide-react";

interface VendorProduct {
  code: string;
  name: string;
  spec?: string | null;
  current_stock?: number | null;
  optimal_stock?: number | null;
  min_stock?: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  vendorName: string;
}

export const VendorStockModal: React.FC<Props> = ({ open, onClose, vendorName }) => {
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !vendorName) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/products-search?supplier=${encodeURIComponent(vendorName)}&limit=1000`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        const items: VendorProduct[] = Array.isArray(data?.items)
          ? data.items.map((it: any) => ({
              code: String(it.code ?? it.product_code ?? ""),
              name: String(it.name ?? it.product_name ?? ""),
              spec: it.spec ?? null,
              current_stock: it.current_stock ?? null,
              optimal_stock: it.optimal_stock ?? null,
              min_stock: it.min_stock ?? null,
            }))
          : [];
        setProducts(items);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e?.message ?? "조회 실패");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, vendorName]);

  if (!open) return null;

  const filtered = search
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.code.toLowerCase().includes(search.toLowerCase())
      )
    : products;

  const totalStock = filtered.reduce((sum, p) => sum + Number(p.current_stock ?? 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-md shrink-0">
              <Package size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-black text-slate-900">공급사 재고확인</div>
              <div className="text-[12px] font-semibold text-slate-500 truncate">{vendorName}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-3xl font-black w-9 h-9 rounded-lg hover:bg-white/70 cursor-pointer flex items-center justify-center shrink-0"
          >
            ×
          </button>
        </div>

        {/* 검색·요약 */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="상품명·코드 검색"
              className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-slate-200 rounded-md focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200"
            />
          </div>
          <div className="text-[12px] font-semibold text-slate-500">
            상품 <span className="tabular-nums text-slate-800 font-black">{filtered.length}</span> 종 · 총 재고
            <span className="tabular-nums text-sky-700 font-black ml-1">{totalStock.toLocaleString()}</span>
          </div>
        </div>

        {/* 상품 리스트 */}
        <div className="flex-1 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm font-bold gap-2">
              <Loader2 size={16} className="animate-spin" />
              불러오는 중...
            </div>
          ) : error ? (
            <div className="p-8 text-center text-rose-600 text-sm font-bold">⚠ {error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              {search ? "검색 결과 없음" : "상품 없음"}
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                <tr className="text-slate-500 font-black uppercase tracking-wide text-[10px]">
                  <th className="text-center px-2 py-2 w-10">#</th>
                  <th className="text-left px-3 py-2 w-24">상품코드</th>
                  <th className="text-left px-3 py-2">상품명</th>
                  <th className="text-right px-3 py-2 w-20">ERP 재고</th>
                  <th className="text-right px-3 py-2 w-16">적정</th>
                  <th className="text-right px-3 py-2 w-16">최소</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p, i) => (
                  <tr key={p.code} className="hover:bg-sky-50/40">
                    <td className="text-center px-2 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500 tabular-nums">{p.code}</td>
                    <td className="px-3 py-1.5 font-semibold text-slate-800 truncate max-w-[280px]">{p.name}</td>
                    <td className="text-right px-3 py-1.5 font-mono font-black text-sky-700 tabular-nums">
                      {p.current_stock ?? "-"}
                    </td>
                    <td className="text-right px-3 py-1.5 font-mono text-slate-500 tabular-nums">
                      {p.optimal_stock ?? "-"}
                    </td>
                    <td className="text-right px-3 py-1.5 font-mono text-slate-400 tabular-nums">
                      {p.min_stock ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 푸터 · 안내 */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/40 text-[11px] text-slate-400">
          ERP 재고 · 매장 시스템 기준 · 실재고 (창고·매장별) 세부는 추후 반영
        </div>
      </div>
    </div>
  );
};

export default VendorStockModal;
