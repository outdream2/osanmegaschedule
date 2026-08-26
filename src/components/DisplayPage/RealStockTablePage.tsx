// src/components/DisplayPage/RealStockTablePage.tsx
// 2026-08-26 · 사용자 지시 · 실재고 테이블 페이지 · 창고2 옆 신규 탭
//   · 표형식 · 왼쪽 상품 리스트 · 오른쪽 전산구역·창고1/2·매장1/2/3 재고
//   · 헤더 자동 정렬 (useSortableTable)
//   · 목업 톤 (Linear/Notion) · 프리미티브 (Card·TableListWrap·Spinner·EmptyState)
//   · /api/inventory-latest (최신 실재고) + /api/products-search (상품 리스트) 조합

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { PackageCheck, Search, RefreshCw } from "lucide-react";
import { api, ApiError } from "../../lib/apiClient";
import { Card } from "../common/Card";
import { EmptyState } from "../common/EmptyState";
import { Spinner } from "../common/Spinner";
import { TableListWrap, tableHeadCls, tableThCls, tableTdCls } from "../common/TableList";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
import { useToast, toastClass } from "../../hooks/useToast";

interface Product {
  product_code: string;
  product_name: string;
  supplier: string | null;
  spec: string | null;
  real_map: string | null;
  category_code: string | null;
}

interface InvRow {
  warehouse1_stock: number | null;
  warehouse2_stock: number | null;
  store_stock: number | null;         // 매장1
  store_stock_2: number | null;       // 매장2
  store3_stock: number | null;        // 매장3
}

interface Row {
  product_code: string;
  product_name: string;
  supplier: string | null;
  category_code: string | null;        // 2026-08-26 · 분류코드
  spec: string | null;                 // 전산구역
  real_map: string | null;
  w1: number | null;
  w2: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  total: number;
}

type SortKey = "product_name" | "supplier" | "category_code" | "spec" | "w1" | "w2" | "s1" | "s2" | "s3" | "total";

const CMP: Record<SortKey, Comparator<Row>> = {
  product_name:  (a, b) => (a.product_name ?? "").localeCompare(b.product_name ?? "", "ko"),
  supplier:      (a, b) => (a.supplier ?? "").localeCompare(b.supplier ?? "", "ko"),
  category_code: (a, b) => (a.category_code ?? "").localeCompare(b.category_code ?? "", "ko"),
  spec:          (a, b) => (a.spec ?? "").localeCompare(b.spec ?? "", "ko"),
  w1:            (a, b) => (a.w1 ?? 0) - (b.w1 ?? 0),
  w2:            (a, b) => (a.w2 ?? 0) - (b.w2 ?? 0),
  s1:            (a, b) => (a.s1 ?? 0) - (b.s1 ?? 0),
  s2:            (a, b) => (a.s2 ?? 0) - (b.s2 ?? 0),
  s3:            (a, b) => (a.s3 ?? 0) - (b.s3 ?? 0),
  total:         (a, b) => a.total - b.total,
};

export const RealStockTablePage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [inv, setInv] = useState<Record<string, InvRow>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast, showError } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 2026-08-26 · 사용자 버그 fix · products-search 는 q="" 시 [] 반환 → 데이터 안 나옴
      //   · /api/products-map 사용 · 전체 상품 map · 배열로 변환
      const [pRes, iRes] = await Promise.all([
        api.get<Record<string, any>>("/api/products-map"),
        api.get<Record<string, InvRow>>("/api/inventory-latest"),
      ]);
      const map = pRes.data ?? {};
      const list: Product[] = Object.entries(map).map(([code, p]) => ({
        product_code: code,
        product_name: String(p?.product_name ?? p?.name ?? ""),
        supplier: p?.supplier ?? null,
        spec: p?.spec ?? null,
        real_map: p?.real_map ?? null,
        category_code: p?.category_code ?? null,
      }));
      list.sort((a, b) => a.product_name.localeCompare(b.product_name, "ko"));
      setProducts(list);
      setInv(iRes.data ?? {});
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "네트워크 오류";
      setError(msg);
      showError(`실재고 테이블 조회 실패: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const rows: Row[] = useMemo(() => products.map(p => {
    const i = inv[p.product_code];
    const w1 = i?.warehouse1_stock ?? null;
    const w2 = i?.warehouse2_stock ?? null;
    const s1 = i?.store_stock ?? null;
    const s2 = i?.store_stock_2 ?? null;
    const s3 = i?.store3_stock ?? null;
    const total = (w1 ?? 0) + (w2 ?? 0) + (s1 ?? 0) + (s2 ?? 0) + (s3 ?? 0);
    return {
      product_code: p.product_code,
      product_name: p.product_name,
      supplier: p.supplier,
      category_code: p.category_code,
      spec: p.spec,
      real_map: p.real_map,
      w1, w2, s1, s2, s3, total,
    };
  }), [products, inv]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      String(r.product_name ?? "").toLowerCase().includes(q) ||
      String(r.supplier ?? "").toLowerCase().includes(q) ||
      String(r.product_code ?? "").toLowerCase().includes(q) ||
      String(r.spec ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable<Row, SortKey>(filtered, "product_name", CMP, "asc");

  const sortIndicator = (k: SortKey) => sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "";
  const thSortable = (k: SortKey, align: "left" | "center" | "num", label: string, minW?: number, extra = "") => (
    <th
      className={`${tableThCls(align)} cursor-pointer hover:bg-zinc-100/70 select-none transition ${extra}`}
      onClick={() => toggleSort(k)}
      style={minW ? { minWidth: minW } : undefined}
      title={`${label} 정렬`}
    >
      {label}<span className="ml-1 text-zinc-400 text-[11px]">{sortIndicator(k) || "⇅"}</span>
    </th>
  );

  const numCls = (v: number | null, tone: "cyan" | "violet") =>
    v == null
      ? "text-zinc-300"
      : v > 0
        ? tone === "cyan" ? "text-cyan-700 font-bold" : "text-violet-700 font-bold"
        : "text-zinc-400";

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      <div className="flex flex-col gap-3">
        {/* 헤더 · 검색 · 새로고침 */}
        <Card padding="md" topAccent>
          <div className="flex items-center gap-3 flex-wrap">
            <PackageCheck size={20} className="text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-[18px] font-bold text-ink tracking-tight leading-tight">실재고 테이블</div>
              <div className="text-[13px] text-ink-soft mt-0.5">상품별 · 전산구역 · 창고1/2 · 매장1/2/3 실재고 현황</div>
            </div>
            <span className="text-[15px] tabular-nums font-semibold text-ink-soft">
              {loading ? <Spinner size={13} tone="brand" className="inline" /> : `${filtered.length}${search ? `/${rows.length}` : ""}건`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="상품명·공급사·코드·전산구역 검색"
                  className="w-72 h-9 pl-8 pr-3 text-[15px] border border-line rounded-md outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition"
                />
              </div>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-white border border-line text-[14px] font-bold text-ink-soft hover:bg-zinc-50 hover:border-brand-deep hover:text-brand-deep transition cursor-pointer disabled:opacity-40"
                title="새로고침"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 새로고침
              </button>
            </div>
          </div>
        </Card>

        {loading && rows.length === 0 ? (
          <Card padding="none" className="flex items-center justify-center py-16">
            <Spinner size={18} tone="brand" label="실재고 로딩 중..." labelSize={15} />
          </Card>
        ) : error ? (
          <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" padding="md" className="text-[15px] text-rose-700 font-semibold">
            ⚠ {error}
            <button onClick={load} className="ml-2 underline cursor-pointer">다시 시도</button>
          </Card>
        ) : sorted.length === 0 ? (
          <Card padding="none" className="py-16">
            <EmptyState
              icon={PackageCheck}
              title={search ? "검색 결과 없음" : "상품 없음"}
              hint={search ? "다른 검색어로 시도" : "상품이 등록되면 여기에 표시됩니다"}
              size="normal"
            />
          </Card>
        ) : (
          <TableListWrap>
            <table className="w-full border-collapse">
              <thead className={tableHeadCls("text-[14px]")}>
                <tr>
                  {thSortable("supplier",      "left",  "공급사",   140)}
                  {thSortable("category_code", "left",  "분류코드", 110)}
                  {thSortable("product_name",  "left",  "상품명",   300)}
                  <th className={tableThCls("left")} style={{ width: 120 }}>상품코드</th>
                  {thSortable("spec",          "center","전산구역", 100, "bg-brand-tint/40")}
                  {thSortable("w1",           "num", "창고1",    80,  "bg-cyan-50/60")}
                  {thSortable("w2",           "num", "창고2",    80,  "bg-cyan-50/60")}
                  {thSortable("s1",           "num", "매장1",    80,  "bg-violet-50/60")}
                  {thSortable("s2",           "num", "매장2",    80,  "bg-violet-50/60")}
                  {thSortable("s3",           "num", "매장3",    80,  "bg-violet-50/60")}
                  {thSortable("total",        "num", "합계",     90,  "bg-brand-tint/30")}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sorted.map(r => (
                  <tr key={r.product_code} className="hover:bg-zinc-50/60 transition text-[15px]">
                    <td className={tableTdCls("left", "text-zinc-700")}>{r.supplier ?? "-"}</td>
                    <td className={tableTdCls("left", "font-mono text-[13px] text-zinc-500 tabular-nums")}>{r.category_code ?? "-"}</td>
                    <td className={tableTdCls("left", "font-bold text-zinc-800 break-keep whitespace-normal")}>{r.product_name}</td>
                    <td className={tableTdCls("left", "font-mono text-[13px] text-zinc-500")}>{r.product_code}</td>
                    <td className={tableTdCls("center", `font-semibold ${r.spec ? "text-brand-deep" : "text-zinc-300"} bg-brand-tint/20`)}>
                      {r.spec ?? "미지정"}
                    </td>
                    <td className={tableTdCls("num", `tabular-nums ${numCls(r.w1, "cyan")} bg-cyan-50/30`)}>{r.w1 ?? "-"}</td>
                    <td className={tableTdCls("num", `tabular-nums ${numCls(r.w2, "cyan")} bg-cyan-50/30`)}>{r.w2 ?? "-"}</td>
                    <td className={tableTdCls("num", `tabular-nums ${numCls(r.s1, "violet")} bg-violet-50/30`)}>{r.s1 ?? "-"}</td>
                    <td className={tableTdCls("num", `tabular-nums ${numCls(r.s2, "violet")} bg-violet-50/30`)}>{r.s2 ?? "-"}</td>
                    <td className={tableTdCls("num", `tabular-nums ${numCls(r.s3, "violet")} bg-violet-50/30`)}>{r.s3 ?? "-"}</td>
                    <td className={tableTdCls("num", `tabular-nums font-extrabold ${r.total > 0 ? "text-brand-deep" : "text-zinc-300"} bg-brand-tint/20`)}>
                      {r.total > 0 ? r.total : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableListWrap>
        )}
      </div>
    </>
  );
};

export default RealStockTablePage;
