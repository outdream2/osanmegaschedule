// 2026-08-10 · #23 · 거래처 로그인 · 공급사 재고확인 모달
// 로그인한 공급사의 상품 리스트 + 재고 (ERP현재고) 조회
// MVP: products.supplier 로 필터 · current_stock 표시
// 2026-08-16 · #94 · A1 확장 · 계절 필터 + 헤더 자동정렬 + TEXT 토큰 사용
//   · 기간 필터 (from-to) 는 백엔드 stock 시계열 API 필요 · Phase 2
//   · 계절 · useSeasonRanges (봄·여름·가을·겨울) · 필터 상태만 (백엔드 확장 시 자동 반영)

// 2026-08-16 · 프레임워크 적용 · apiClient + useToast
import React, { useEffect, useState, useMemo } from "react";
import { X, Package, Search, Loader2 } from "lucide-react";
import { TEXT } from "../../styles/tokens";
import { SeasonButtons } from "../common/SeasonButtons";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";

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

// 정렬 컬럼 · #94 A1
type SortKey = "code" | "name" | "current_stock" | "optimal_stock" | "min_stock";
const COMPARATORS: Record<SortKey, Comparator<VendorProduct>> = {
  code: (a, b) => (a.code ?? "").localeCompare(b.code ?? ""),
  name: (a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"),
  current_stock: (a, b) => Number(a.current_stock ?? 0) - Number(b.current_stock ?? 0),
  optimal_stock: (a, b) => Number(a.optimal_stock ?? 0) - Number(b.optimal_stock ?? 0),
  min_stock: (a, b) => Number(a.min_stock ?? 0) - Number(b.min_stock ?? 0),
};

export const VendorStockModal: React.FC<Props> = ({ open, onClose, vendorName }) => {
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // 2026-08-16 · #94 · 계절 필터 (Phase 2 · 백엔드 stock 시계열 API 확장 후 · 실제 필터링 적용)
  const [season, setSeason] = useState<SeasonKey | null>(null);
  // 2026-08-16 · #94 · 기간 필터 (Phase 2 · 백엔드 확장 대기)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // 2026-08-16 · 프레임워크 · useToast · 에러 UX 통일
  const { toast, showError } = useToast(4000);

  useEffect(() => {
    if (!open || !vendorName) return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data } = await api.get<{ items?: any[] }>(`/api/products-search?supplier=${encodeURIComponent(vendorName)}&limit=1000`);
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
      } catch (e: unknown) {
        if (!alive) return;
        const msg = e instanceof ApiError ? e.message : "조회 실패";
        setError(msg);
        showError(msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, vendorName, showError]);

  // 검색 필터
  const searched = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  }, [products, search]);

  // 2026-08-16 · #94 · 헤더 자동정렬
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable<VendorProduct, SortKey>(searched, "name", COMPARATORS, "asc");

  if (!open) return null;

  const totalStock = sorted.reduce((sum, p) => sum + Number(p.current_stock ?? 0), 0);

  const sortIcon = (key: string) => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";
  const headerCls = "px-3 py-2 cursor-pointer hover:bg-zinc-100 transition select-none";

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-line bg-sky-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center shadow-md shrink-0">
              <Package size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className={`${TEXT.title} text-zinc-900`}>공급사 재고확인</div>
              <div className={`${TEXT.caption} text-zinc-500 truncate`}>{vendorName}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 w-9 h-9 rounded-lg hover:bg-white/70 cursor-pointer flex items-center justify-center shrink-0"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* 2026-08-16 · #94 · 필터 툴바 · 계절 + 기간 + 검색 */}
        <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50/60 flex flex-col gap-2">
          {/* 계절 필터 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`${TEXT.label} text-zinc-500 shrink-0`}>계절</span>
            <SeasonButtons value={season} onChange={setSeason} />
          </div>
          {/* 기간 + 검색 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`${TEXT.label} text-zinc-500 shrink-0`}>기간</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="text-[13px] px-2 py-1 border border-line rounded-md focus:outline-none focus:border-brand-deep" />
            <span className="text-zinc-400 text-[13px]">~</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="text-[13px] px-2 py-1 border border-line rounded-md focus:outline-none focus:border-brand-deep" />
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="상품명·코드 검색"
                className="w-full pl-8 pr-3 py-1.5 text-[13px] border border-line rounded-md focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
              />
            </div>
          </div>
          {/* 요약 */}
          <div className={`${TEXT.caption} text-zinc-500 pt-0.5`}>
            상품 <span className="tabular-nums text-zinc-800 font-bold">{sorted.length}</span> 종 · 총 재고
            <span className="tabular-nums text-sky-700 font-bold ml-1">{totalStock.toLocaleString()}</span>
            {(season || dateFrom || dateTo) && (
              <span className="ml-2 text-amber-600 text-[10px] font-bold">※ 기간·계절 필터 · 백엔드 시계열 API 확장 후 적용</span>
            )}
          </div>
        </div>

        {/* 상품 리스트 */}
        <div className="flex-1 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-400 text-sm font-bold gap-2">
              <Loader2 size={16} className="animate-spin" />
              불러오는 중...
            </div>
          ) : error ? (
            <div className="p-8 text-center text-rose-600 text-sm font-bold">⚠ {error}</div>
          ) : sorted.length === 0 ? (
            <div className="p-12 text-center text-zinc-400 text-sm">
              {search ? "검색 결과 없음" : "상품 없음"}
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-zinc-50 border-b border-line z-10">
                <tr className={`${TEXT.label} text-zinc-500`}>
                  <th className="text-center px-2 py-2 w-10">#</th>
                  <th className={`${headerCls} text-left w-24`} onClick={() => toggleSort("code")}>상품코드{sortIcon("code")}</th>
                  <th className={`${headerCls} text-left`} onClick={() => toggleSort("name")}>상품명{sortIcon("name")}</th>
                  <th className={`${headerCls} text-right w-20`} onClick={() => toggleSort("current_stock")}>ERP 재고{sortIcon("current_stock")}</th>
                  <th className={`${headerCls} text-right w-16`} onClick={() => toggleSort("optimal_stock")}>적정{sortIcon("optimal_stock")}</th>
                  <th className={`${headerCls} text-right w-16`} onClick={() => toggleSort("min_stock")}>최소{sortIcon("min_stock")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sorted.map((p, i) => (
                  <tr key={p.code} className="hover:bg-sky-50/40">
                    <td className="text-center px-2 py-1.5 text-zinc-400 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-zinc-500 tabular-nums">{p.code}</td>
                    <td className="px-3 py-1.5 font-semibold text-zinc-800 truncate max-w-[280px]">{p.name}</td>
                    <td className="text-right px-3 py-1.5 font-mono font-bold text-sky-700 tabular-nums">
                      {p.current_stock ?? "-"}
                    </td>
                    <td className="text-right px-3 py-1.5 font-mono text-zinc-500 tabular-nums">
                      {p.optimal_stock ?? "-"}
                    </td>
                    <td className="text-right px-3 py-1.5 font-mono text-zinc-400 tabular-nums">
                      {p.min_stock ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 푸터 · 안내 */}
        <div className="px-5 py-2.5 border-t border-zinc-100 bg-zinc-50/40 text-[11px] text-zinc-400">
          ERP 재고 · 매장 시스템 기준 · 실재고 (창고·매장별) 세부는 추후 반영
        </div>

        {/* 2026-08-16 · Toast · 조회 실패 등 · 우측 하단 */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-[60]">
            <div className={toastClass(toast.tone)}>{toast.message}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VendorStockModal;
