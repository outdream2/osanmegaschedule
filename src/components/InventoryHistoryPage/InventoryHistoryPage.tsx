// src/components/InventoryHistoryPage/InventoryHistoryPage.tsx
// 실재고 이력조회 페이지 · inventory_checks 전체 이력 · 날짜/상품 필터 · 정렬
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/apiClient";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
import type { AuthSession } from "../../types";
import { MagnifyingGlass, ArrowUp, ArrowDown, X } from "@phosphor-icons/react";

interface InventoryCheck {
  id: number;
  product_code: string;
  product_name: string;
  checked_at: string;
  checked_by: string;
  warehouse1_stock: number | null;
  warehouse2_stock: number | null;
  store_stock: number | null;
  store3_stock: number | null;
  store1_zone: string | null;
  store2_zone: string | null;
  store3_zone: string | null;
  system_stock: number | null;
  optimal_stock: number | null;
  status: string | null;
  note: string | null;
}

type SortKey = "checked_at" | "product_code" | "product_name" | "checked_by" | "total";

const CMP: Record<SortKey, Comparator<InventoryCheck>> = {
  checked_at:   (a, b) => a.checked_at.localeCompare(b.checked_at),
  product_code: (a, b) => a.product_code.localeCompare(b.product_code, "ko"),
  product_name: (a, b) => (a.product_name ?? "").localeCompare(b.product_name ?? "", "ko"),
  checked_by:   (a, b) => (a.checked_by ?? "").localeCompare(b.checked_by ?? "", "ko"),
  total:        (a, b) => rowTotal(a) - rowTotal(b),
};

function rowTotal(r: InventoryCheck): number {
  return (r.warehouse1_stock ?? 0) + (r.warehouse2_stock ?? 0) + (r.store_stock ?? 0) + (r.store3_stock ?? 0);
}

function fmtDT(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function SlotCell({ qty, zone }: { qty: number | null; zone?: string | null }) {
  if (qty == null) return <span className="text-zinc-300 text-[15px]">—</span>;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular-nums font-medium text-[15px]">{qty.toLocaleString()}</span>
      {zone && <span className="text-[11px] text-zinc-400 leading-none">{zone}</span>}
    </div>
  );
}

function SortTh({
  label, col, current, dir, onToggle, className = "",
}: {
  label: string; col: SortKey; current: SortKey; dir: "asc" | "desc";
  onToggle: (k: SortKey) => void; className?: string;
}) {
  const active = current === col;
  return (
    <th
      onClick={() => onToggle(col)}
      className={`px-3 py-2.5 text-left text-[13px] font-semibold text-zinc-500 cursor-pointer select-none whitespace-nowrap hover:text-zinc-800 transition-colors ${className}`}
    >
      <div className="flex items-center gap-1">
        {label}
        {active
          ? dir === "asc"
            ? <ArrowUp size={12} weight="bold" className="text-brand-deep" />
            : <ArrowDown size={12} weight="bold" className="text-brand-deep" />
          : <ArrowDown size={12} className="text-zinc-300" />}
      </div>
    </th>
  );
}

interface Props {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

export function InventoryHistoryPage({ authSession, onBack, onNavigate, onLogout }: Props) {
  const [records, setRecords] = useState<InventoryCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<InventoryCheck[]>("/api/inventory-checks")
      .then(res => { if (!cancelled) setRecords(res.data); })
      .catch(err => { console.error("[InventoryHistoryPage] load error", err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(r => {
      if (q && !r.product_code.toLowerCase().includes(q) && !(r.product_name ?? "").toLowerCase().includes(q) && !(r.checked_by ?? "").toLowerCase().includes(q)) return false;
      if (dateFrom && r.checked_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && r.checked_at.slice(0, 10) > dateTo) return false;
      return true;
    });
  }, [records, search, dateFrom, dateTo]);

  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable<InventoryCheck, SortKey>(
    filtered, "checked_at", CMP, "desc",
  );

  const hasFilter = search || dateFrom || dateTo;
  const clearFilter = () => { setSearch(""); setDateFrom(""); setDateTo(""); };

  return (
    <div className={PAGE_CONTAINER_CLS}>
      <AppNavHeader
        activePage="inventory-history"
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      <div className="px-4 pt-4 pb-8 space-y-4 max-w-[1400px] mx-auto">
        {/* 필터 바 */}
        <Card className="p-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="relative flex-1 min-w-[180px]">
              <MagnifyingGlass size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="상품코드 · 상품명 · 확인자"
                className="w-full pl-8 pr-3 py-2 text-[14px] border border-zinc-200 rounded-lg bg-white placeholder-zinc-400 outline-none focus:ring-2 focus:ring-brand-deep/30 focus:border-brand-deep/50 transition"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="px-2.5 py-2 text-[14px] border border-zinc-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-deep/30 focus:border-brand-deep/50 transition"
              />
              <span className="text-zinc-400 text-[13px]">~</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="px-2.5 py-2 text-[14px] border border-zinc-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-deep/30 focus:border-brand-deep/50 transition"
              />
            </div>

            {hasFilter && (
              <button
                onClick={clearFilter}
                className="flex items-center gap-1 px-3 py-2 text-[13px] text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition"
              >
                <X size={14} />
                초기화
              </button>
            )}

            <span className="text-[13px] text-zinc-400 ml-auto self-center whitespace-nowrap">
              {loading ? "로딩 중…" : `${sorted.length.toLocaleString()}건`}
            </span>
          </div>
        </Card>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : sorted.length === 0 ? (
          <Card className="py-16 text-center text-zinc-400 text-[15px]">
            {hasFilter ? "검색 결과가 없습니다." : "실재고 이력이 없습니다."}
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <SortTh label="날짜/시간" col="checked_at"   current={sortKey} dir={sortDir} onToggle={toggleSort} />
                    <SortTh label="상품코드"  col="product_code" current={sortKey} dir={sortDir} onToggle={toggleSort} />
                    <SortTh label="상품명"    col="product_name" current={sortKey} dir={sortDir} onToggle={toggleSort} className="min-w-[140px]" />
                    <SortTh label="확인자"    col="checked_by"   current={sortKey} dir={sortDir} onToggle={toggleSort} />
                    <th className="px-3 py-2.5 text-right text-[13px] font-semibold text-zinc-500 whitespace-nowrap">창고1</th>
                    <th className="px-3 py-2.5 text-right text-[13px] font-semibold text-zinc-500 whitespace-nowrap">창고2</th>
                    <th className="px-3 py-2.5 text-right text-[13px] font-semibold text-zinc-500 whitespace-nowrap">매장1</th>
                    <th className="px-3 py-2.5 text-right text-[13px] font-semibold text-zinc-500 whitespace-nowrap">매장2</th>
                    <SortTh label="합계" col="total" current={sortKey} dir={sortDir} onToggle={toggleSort} className="text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {sorted.map((r, i) => {
                    const total = rowTotal(r);
                    return (
                      <tr key={`${r.id}-${i}`} className="hover:bg-zinc-50 transition-colors">
                        <td className="px-3 py-2.5 text-[14px] text-zinc-600 whitespace-nowrap tabular-nums">
                          {fmtDT(r.checked_at)}
                        </td>
                        <td className="px-3 py-2.5 text-[14px] font-mono text-zinc-700 whitespace-nowrap">
                          {r.product_code}
                        </td>
                        <td className="px-3 py-2.5 text-[14px] text-zinc-800 max-w-[200px]">
                          <div className="truncate" title={r.product_name}>{r.product_name}</div>
                        </td>
                        <td className="px-3 py-2.5 text-[14px] text-zinc-600 whitespace-nowrap">
                          {r.checked_by || <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <SlotCell qty={r.warehouse1_stock} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <SlotCell qty={r.warehouse2_stock} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <SlotCell qty={r.store_stock} zone={r.store1_zone} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <SlotCell qty={r.store3_stock} zone={r.store3_zone} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`tabular-nums font-semibold text-[15px] ${total > 0 ? "text-zinc-800" : "text-zinc-300"}`}>
                            {total.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export default InventoryHistoryPage;
