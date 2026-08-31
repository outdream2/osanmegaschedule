// src/components/OrderManagePage/ExpiryImminentTab.tsx
// 2026-08-25 · 사용자 지시 · 매입 · 실재고 서브탭 → 유통기한 임박 서브탭 (rename + 목록)
//   · GET /api/products/expiry-imminent · products.expiry_date IS NOT NULL 상품 리스트
//   · D-day 계산 · 만료 D+ · 오늘 · D-30 임박 · 이후 정상
//   · 표형식 · TableListWrap 프리미티브 · 목업 톤

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Package } from "lucide-react";
import { api, ApiError } from "../../lib/apiClient";
import { Card } from "../common/Card";
import { EmptyState } from "../common/EmptyState";
import { Spinner } from "../common/Spinner";
import { TableListWrap, tableHeadCls, tableThCls, tableTdCls } from "../common/TableList";
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-29 · #154 P2 + #165 A · SaleStatusFilter · SearchBar 프리미티브
import { SaleStatusFilter } from "../common/SaleStatusFilter";
import { useSaleStatusFilter } from "../../hooks/useSaleStatusFilter";
import { SearchBar } from "../common/SearchBar";
// 2026-08-29 · 사용자 지시 · 상품명 검색 · 통일 로직
import { matchesProductQuery } from "../../lib/productMatch";
// 2026-08-31 · #11 · 공급사명 검색 통합
import { matchesSupplierQuery } from "../../lib/supplierMatch";
// 2026-08-31 · #13 · location 우선 · real_map fallback
import { resolveProductLocation } from "../../lib/productLocation";

interface ExpiryProduct {
  product_code: string;
  product_name: string;
  spec: string | null;
  supplier: string | null;
  real_map: string | null;
  current_stock: number | null;
  expiry_date: string | null;
  sale_status?: string | null; // 2026-08-29 · #154 P2 · 3-way 필터용
}

const fmtDate = (s: string | null): string => {
  if (!s) return "-";
  return String(s).slice(0, 10);
};

const dayDiff = (isoDate: string | null): number | null => {
  if (!isoDate) return null;
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const exp = new Date(String(isoDate).slice(0, 10) + "T00:00:00");
    return Math.round((exp.getTime() - now.getTime()) / 86400_000);
  } catch { return null; }
};

const dDayCell = (d: number | null): React.ReactNode => {
  if (d == null) return <span className="text-zinc-400">-</span>;
  if (d < 0)   return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-[12px] font-bold">만료 {Math.abs(d)}일 지남</span>;
  if (d === 0) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-amber-800 text-[12px] font-bold">오늘 만료</span>;
  if (d <= 30) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-bold">D-{d}</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] font-semibold">D-{d}</span>;
};

export const ExpiryImminentTab: React.FC = () => {
  const [rows, setRows] = useState<ExpiryProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const { toast, showError } = useToast();
  // 2026-08-29 · #154 P2 · 판매중 3-way 필터 (전체/판매중/판매중지)
  const { value: saleFilter, setValue: setSaleFilter, matches: saleMatches } = useSaleStatusFilter({ storageKey: "expiryImminent.saleFilter" });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get<ExpiryProduct[]>("/api/products/expiry-imminent")
      .then(({ data }) => {
        setRows(Array.isArray(data) ? data : []);
      })
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "네트워크 오류";
        setError(msg);
        showError(`유통기한 임박 조회 실패: ${msg}`);
      })
      .finally(() => setLoading(false));
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    // 2026-08-29 · saleMatches AND (matchesProductQuery OR matchesSupplierQuery) + real_map 매칭
    // 2026-08-31 · #11 · 공급사 검색 통합 · matchesSupplierQuery 프리미티브
    const saleFiltered = rows.filter(r => saleMatches(r.sale_status));
    const kw = q.trim().toLowerCase();
    if (!kw) return saleFiltered;
    return saleFiltered.filter(r =>
      matchesProductQuery(r, q) ||
      matchesSupplierQuery({ supplier: r.supplier ?? undefined }, q) ||
      String(r.real_map ?? "").toLowerCase().includes(kw)
    );
  }, [rows, q, saleMatches]);

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        {/* 헤더 툴바 */}
        <div className="flex items-center gap-2 flex-wrap px-1">
          <AlertTriangle size={18} className="text-amber-500 shrink-0" />
          <span className="text-[17px] font-bold text-ink tracking-tight">유통기한 임박</span>
          <span className="text-[15px] tabular-nums font-semibold text-ink-soft">
            {loading ? <Spinner size={12} tone="amber" className="inline" /> : `${rows.length}건`}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {/* 2026-08-29 · #154 P2 · 판매중 3-way 필터 */}
            <SaleStatusFilter value={saleFilter} onChange={setSaleFilter} />
            {/* 2026-08-29 · #165 A · SearchBar 프리미티브 · 결과 카운트·최근 검색 */}
            <SearchBar
              value={q}
              onChange={setQ}
              placeholder="상품·공급사·구역 검색"
              resultCount={filtered.length}
              historyKey="megatown_expiryImminent_search"
              accent="amber"
            />
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-white border border-line text-[13px] font-bold text-ink-soft hover:bg-zinc-50 hover:border-brand-deep hover:text-brand-deep transition cursor-pointer disabled:opacity-40"
              title="새로고침"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> 새로고침
            </button>
          </div>
        </div>

        {/* 리스트 */}
        {loading && rows.length === 0 ? (
          <Card padding="none" className="flex items-center justify-center py-12">
            <Spinner size={16} tone="amber" label="유통기한 임박 로딩 중..." labelSize={14} />
          </Card>
        ) : error ? (
          <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" padding="md" className="text-[14px] text-rose-700 font-semibold">
            ⚠ {error}
            <button onClick={load} className="ml-2 underline cursor-pointer">다시 시도</button>
          </Card>
        ) : rows.length === 0 ? (
          <Card padding="none" className="py-12">
            <EmptyState
              icon={Package}
              title="유통기한 임박 상품 없음"
              hint="바코드 스캔 시 [유통기한임박] 버튼으로 상품을 등록하세요"
              size="normal"
            />
          </Card>
        ) : (
          <TableListWrap>
            <table className="w-full border-collapse">
              <thead className={tableHeadCls()}>
                <tr>
                  <th className={tableThCls("left")} style={{ width: "28%" }}>상품명</th>
                  <th className={tableThCls("left")} style={{ width: "12%" }}>공급사</th>
                  <th className={tableThCls("left")} style={{ width: "12%" }}>구역</th>
                  <th className={tableThCls("num")}  style={{ width: "10%" }}>현재고</th>
                  <th className={tableThCls("center")} style={{ width: "16%" }}>유통기한</th>
                  <th className={tableThCls("center")} style={{ width: "12%" }}>남은 일수</th>
                  <th className={tableThCls("left")} style={{ width: "10%" }}>규격</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map(p => {
                  const d = dayDiff(p.expiry_date);
                  const urgent = d != null && d <= 0;
                  return (
                    <tr key={p.product_code} className={`hover:bg-zinc-50/60 transition text-[14px] ${urgent ? "bg-red-50/30" : ""}`}>
                      <td className={tableTdCls("left", "font-bold text-zinc-800 break-keep")}>
                        {p.product_name}
                        <div className="text-[12px] font-mono text-zinc-400 mt-0.5">{p.product_code}</div>
                      </td>
                      <td className={tableTdCls("left", "text-zinc-600")}>{p.supplier ?? <span className="text-zinc-400">-</span>}</td>
                      <td className={tableTdCls("left", "text-zinc-600")}>{resolveProductLocation(p) ?? <span className="text-zinc-400">-</span>}</td>
                      <td className={tableTdCls("num", "text-zinc-700")}>{p.current_stock ?? <span className="text-zinc-400">-</span>}</td>
                      <td className={tableTdCls("center", "font-semibold text-ink tabular-nums")}>{fmtDate(p.expiry_date)}</td>
                      <td className={tableTdCls("center")}>{dDayCell(d)}</td>
                      <td className={tableTdCls("left", "text-[13px] text-zinc-500")}>{p.spec ?? <span className="text-zinc-400">-</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableListWrap>
        )}
      </div>
    </>
  );
};

export default ExpiryImminentTab;
