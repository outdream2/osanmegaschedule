// src/components/DisplayPage/UnassignedProductsTab.tsx
// 2026-08-26 · #125 · 사용자 지시 · 배치구역 · 미지정 상품 별도 탭
//   · products.real_map 이 null / empty · 배치되지 않은 상품 리스트
//   · 검색 · 상품명/공급사/코드 · 실시간 필터
//   · 인라인 편집 · real_map 지정 → 즉시 반영 (편집 후 목록에서 제외)

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { PackageX, RefreshCw, Search, Pencil, Check, X as XIcon } from "lucide-react";
import { api, ApiError } from "../../lib/apiClient";
import { Card } from "../common/Card";
import { EmptyState } from "../common/EmptyState";
import { Spinner } from "../common/Spinner";
import { TableListWrap, tableHeadCls, tableThCls, tableTdCls } from "../common/TableList";
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-26 · #133 · 판매중 필터 전역 설정 반영
import { useSaleActiveOnly } from "../../hooks/useSaleActiveOnly";

interface UnassignedProduct {
  product_code: string;
  product_name: string;
  supplier: string | null;
  spec: string | null;
  real_map: string | null;
  current_stock: number | null;
  sale_status: string | null; // 2026-08-26 · 판매중 필터용
  /** 2026-08-26 · 사용자 지시 · 미배정 사유 · "spec" (전산구역 없음) · "real_map" (실제위치 없음) · "both" */
  missing?: "spec" | "real_map" | "both";
}

export const UnassignedProductsTab: React.FC = () => {
  const [rows, setRows] = useState<UnassignedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const { toast, showError, showSuccess } = useToast();
  // 2026-08-26 · #133 · 통계설정 · 판매중 필터 (전역) · true 면 sale_status='판매중' 만 노출
  const { saleActiveOnly } = useSaleActiveOnly();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    // /api/products-search?q=&limit=... · 서버에서 real_map IS NULL 상품 조회 필요
    //   · 임시 · 대용량 조회 (limit=500) 후 · 클라이언트에서 real_map 미지정 필터
    // 2026-08-26 · 사용자 지시 · spec (전산구역) OR real_map (실제위치) 미배정 상품
    api.get<{ items?: UnassignedProduct[] } | UnassignedProduct[]>("/api/products-search?q=&limit=1000")
      .then(({ data }) => {
        const list: UnassignedProduct[] = Array.isArray(data) ? (data as UnassignedProduct[]) : ((data as any)?.items ?? []);
        const isEmpty = (v: string | null) => !v || String(v).trim() === "" || String(v).trim() === "미지정";
        const unassigned = list
          .filter(p => isEmpty(p.spec) || isEmpty(p.real_map))
          // 2026-08-26 · #133 · 판매중만 보기 설정 ON · sale_status='판매중' 만
          .filter(p => !saleActiveOnly || String(p.sale_status ?? "").trim() === "판매중")
          .map(p => {
            const noSpec = isEmpty(p.spec);
            const noMap  = isEmpty(p.real_map);
            const missing: "spec" | "real_map" | "both" = noSpec && noMap ? "both" : noSpec ? "spec" : "real_map";
            return { ...p, missing };
          });
        setRows(unassigned);
      })
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "네트워크 오류";
        setError(msg);
        showError(`미지정 상품 조회 실패: ${msg}`);
      })
      .finally(() => setLoading(false));
  }, [showError, saleActiveOnly]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      String(r.product_name ?? "").toLowerCase().includes(q) ||
      String(r.supplier ?? "").toLowerCase().includes(q) ||
      String(r.product_code ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const startEdit = (row: UnassignedProduct) => {
    setEditingId(row.product_code);
    setEditValue("");
  };
  const cancelEdit = () => { setEditingId(null); setEditValue(""); };

  const commitEdit = async (row: UnassignedProduct) => {
    const value = editValue.trim();
    if (!value) return;
    setSavingId(row.product_code);
    try {
      await api.patch(`/api/products/${encodeURIComponent(row.product_code)}`, { real_map: value });
      setRows(prev => prev.filter(r => r.product_code !== row.product_code));
      showSuccess(`${row.product_name} · ${value} 지정 완료`);
      cancelEdit();
    } catch (e: any) {
      showError(`지정 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally {
      setSavingId(null);
    }
  };

  const inputCls = "w-full h-8 px-2 rounded-md border border-brand-deep bg-white text-[15px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-tint";

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      <div className="flex flex-col gap-3">
        {/* 헤더 · 검색 */}
        <div className="flex items-center gap-2 flex-wrap px-1">
          <PackageX size={19} className="text-amber-600 shrink-0" />
          <span className="text-[18px] font-bold text-ink tracking-tight">미지정 상품</span>
          <span className="text-[15px] tabular-nums font-semibold text-ink-soft">
            {loading ? <Spinner size={12} tone="amber" className="inline" /> : `${filtered.length}${search ? `/${rows.length}` : ""}건`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="상품명·공급사·코드 검색"
                className="w-64 h-9 pl-8 pr-3 text-[15px] border border-line rounded-md outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition"
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

        {loading && rows.length === 0 ? (
          <Card padding="none" className="flex items-center justify-center py-12">
            <Spinner size={16} tone="amber" label="미지정 상품 로딩 중..." labelSize={15} />
          </Card>
        ) : error ? (
          <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" padding="md" className="text-[15px] text-rose-700 font-semibold">
            ⚠ {error}
            <button onClick={load} className="ml-2 underline cursor-pointer">다시 시도</button>
          </Card>
        ) : filtered.length === 0 ? (
          <Card padding="none" className="py-12">
            <EmptyState
              icon={PackageX}
              title={search ? "검색 결과 없음" : "미지정 상품 없음"}
              hint={search ? "다른 검색어로 시도해보세요" : "모든 상품에 배치구역이 지정되어 있습니다"}
              size="normal"
            />
          </Card>
        ) : (
          <TableListWrap>
            <table className="w-full border-collapse">
              <thead className={tableHeadCls("text-[14px]")}>
                <tr>
                  <th className={tableThCls("left")} style={{ minWidth: 320 }}>상품명</th>
                  <th className={tableThCls("left")} style={{ width: "16%" }}>공급사</th>
                  <th className={tableThCls("left")} style={{ width: "12%" }}>상품코드</th>
                  <th className={tableThCls("center")} style={{ width: 90 }}>현재고</th>
                  <th className={tableThCls("center")} style={{ width: 120 }}>미배정 사유</th>
                  <th className={tableThCls("center")} style={{ minWidth: 280 }}>배치구역 지정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map(p => (
                  <tr key={p.product_code} className="hover:bg-zinc-50/60 transition text-[15px]">
                    <td className={tableTdCls("left", "font-bold text-zinc-800 break-keep whitespace-normal")}>{p.product_name}</td>
                    <td className={tableTdCls("left", "text-zinc-700")}>{p.supplier ?? "-"}</td>
                    <td className={tableTdCls("left", "font-mono text-[13px] text-zinc-500")}>{p.product_code}</td>
                    <td className={tableTdCls("center", "font-bold text-zinc-700 tabular-nums")}>{p.current_stock ?? "-"}</td>
                    <td className={tableTdCls("center")}>
                      {p.missing === "both" ? (
                        <span className="inline-flex items-center h-6 px-2 rounded-md text-[12px] font-bold bg-rose-100 text-rose-700 border border-rose-200">둘 다 없음</span>
                      ) : p.missing === "spec" ? (
                        <span className="inline-flex items-center h-6 px-2 rounded-md text-[12px] font-bold bg-amber-100 text-amber-700 border border-amber-200">전산 없음</span>
                      ) : (
                        <span className="inline-flex items-center h-6 px-2 rounded-md text-[12px] font-bold bg-sky-100 text-sky-700 border border-sky-200">실제 없음</span>
                      )}
                    </td>
                    <td className={tableTdCls("center")}>
                      {editingId === p.product_code ? (
                        <div className="flex items-center gap-1 justify-center">
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")  { e.preventDefault(); commitEdit(p); }
                              if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                            }}
                            placeholder="예: 26 · 26/32"
                            className={inputCls}
                            disabled={savingId === p.product_code}
                            style={{ width: 160 }}
                          />
                          <button
                            type="button"
                            onClick={() => commitEdit(p)}
                            disabled={savingId === p.product_code}
                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-40"
                            title="저장 (Enter)"
                          >
                            {savingId === p.product_code ? <Spinner size={12} tone="white" /> : <Check size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={savingId === p.product_code}
                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-white border border-line hover:bg-zinc-50 text-zinc-500 cursor-pointer disabled:opacity-40"
                            title="취소 (Esc)"
                          >
                            <XIcon size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 transition cursor-pointer"
                        >
                          <Pencil size={11} /> 배치구역 지정
                        </button>
                      )}
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

export default UnassignedProductsTab;
