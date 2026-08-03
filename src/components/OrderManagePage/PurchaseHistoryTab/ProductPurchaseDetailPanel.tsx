// src/components/OrderManagePage/PurchaseHistoryTab/ProductPurchaseDetailPanel.tsx
// 우측 · 선택 상품 상세 (2026-08-03 · #191)
// 구조 · 상단 상품 헤더 (KPI 4카드) + 하단 매입 원장 (날짜 · 공급사 · 수량 · 단가 · 금액)
// 스타일 · VendorHeaderPanel + PurchaseSubTabs LedgerTab 통일

import React, { useMemo, useState } from "react";
import { Package, Building2 } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────

export interface ProductPurchaseRow {
  id: string | number;
  date: string; // YYYY-MM-DD
  supplier_name: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface ProductHeaderInfo {
  product_code: string | null;
  product_name: string;
  total_amount: number;
  total_qty: number;
  purchase_count: number;
  last_purchase_date: string | null;
  primary_supplier: string | null;
  supplier_count: number;
}

interface Props {
  product: ProductHeaderInfo;
  rows: ProductPurchaseRow[];
  loading: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}
function fmtWon(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString();
}
function dateLabel(iso: string | null): string {
  if (!iso) return "-";
  return String(iso).slice(0, 10);
}

// ─── Sort ────────────────────────────────────────────────────────────────

type SortKey = "date" | "supplier" | "quantity" | "unit_price" | "amount";
type SortDir = "asc" | "desc";

// ─── Panel ───────────────────────────────────────────────────────────────

export const ProductPurchaseDetailPanel: React.FC<Props> = ({ product, rows, loading }) => {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };
  const arrow = (k: SortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";

  const avgUnitPrice = product.total_qty > 0 ? product.total_amount / product.total_qty : 0;

  const sorted = useMemo(() => {
    const sign = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "date":       return sign * String(a.date ?? "").localeCompare(String(b.date ?? ""));
        case "supplier":   return sign * String(a.supplier_name ?? "").localeCompare(String(b.supplier_name ?? ""), "ko");
        case "quantity":   return sign * ((a.quantity ?? 0) - (b.quantity ?? 0));
        case "unit_price": return sign * ((a.unit_price ?? 0) - (b.unit_price ?? 0));
        case "amount":     return sign * ((a.amount ?? 0) - (b.amount ?? 0));
        default:           return 0;
      }
    });
  }, [rows, sortKey, sortDir]);

  const totalAmount = product.total_amount;

  return (
    <>
      {/* 상단 · 상품 헤더 (KPI 4카드) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Package size={16} className="text-sky-500 shrink-0" />
          <span className="text-[14px] font-black text-slate-800 truncate">{product.product_name}</span>
          {product.product_code && (
            <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
              {product.product_code}
            </span>
          )}
        </div>
        {product.primary_supplier && (
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Building2 size={11} className="text-slate-400 shrink-0" />
            <span className="truncate">
              {product.primary_supplier}
              {product.supplier_count > 1 && (
                <span className="text-slate-400 ml-1">외 {product.supplier_count - 1}개 공급사</span>
              )}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <KpiBox label="총 매입액" value={fmtWon(product.total_amount)} tone="sky" />
          <KpiBox label="총 수량"   value={fmt(product.total_qty)}     tone="slate" />
          <KpiBox label="매입 건수" value={`${fmt(product.purchase_count)}건`} tone="slate" />
          <KpiBox label="평균단가"  value={avgUnitPrice > 0 ? fmt(Math.round(avgUnitPrice)) : "-"} tone="emerald" />
        </div>
        <div className="text-[10px] text-slate-400 pt-1">
          최근 매입일 · <span className="tabular-nums">{dateLabel(product.last_purchase_date)}</span>
        </div>
      </div>

      {/* 하단 · 매입 원장 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0 flex-1">
        <div className="flex items-center border-b border-slate-200 bg-slate-50/50 px-4 py-2.5">
          <span className="text-[13px] font-black text-sky-700">매입 원장</span>
          <span className="ml-2 text-[11px] font-semibold text-slate-400 tabular-nums">
            {rows.length}건
          </span>
          <div className="ml-auto text-[10px] text-slate-400">헤더 클릭 정렬</div>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[11px]">불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[11px]">해당 상품의 매입 이력 없음</div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-xs min-w-[520px]">
              <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                <tr className="text-[11px] text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-2 py-2 w-7 text-slate-300">#</th>
                  <th onClick={() => toggleSort("date")}
                    className="text-left px-2 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
                    날짜{arrow("date")}
                  </th>
                  <th onClick={() => toggleSort("supplier")}
                    className="text-left px-2 py-2 cursor-pointer select-none hover:bg-slate-50 transition">
                    공급사{arrow("supplier")}
                  </th>
                  <th onClick={() => toggleSort("quantity")}
                    className="text-right px-2 py-2 w-16 cursor-pointer select-none hover:bg-slate-50 transition">
                    수량{arrow("quantity")}
                  </th>
                  <th onClick={() => toggleSort("unit_price")}
                    className="text-right px-2 py-2 w-20 cursor-pointer select-none hover:bg-slate-50 transition">
                    단가{arrow("unit_price")}
                  </th>
                  <th onClick={() => toggleSort("amount")}
                    className="text-right px-2 py-2 w-24 text-sky-600 cursor-pointer select-none hover:bg-sky-50 transition">
                    금액{arrow("amount")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map((r, i) => (
                  <tr key={`ppd-${r.id}-${i}`} className="hover:bg-slate-50/60 transition-all duration-100">
                    <td className="px-2 py-1.5 text-slate-300 text-[11px] tabular-nums align-top">{i + 1}</td>
                    <td className="px-2 py-1.5 tabular-nums text-[11px] text-slate-500 align-top whitespace-nowrap">
                      {dateLabel(r.date)}
                    </td>
                    <td className="px-2 py-1.5 text-[12px] font-semibold text-slate-700 align-top break-words whitespace-normal leading-snug">
                      {r.supplier_name ?? "-"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[12px] text-slate-600 align-top">
                      {fmt(r.quantity)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[12px] text-slate-600 align-top">
                      {r.unit_price > 0 ? fmt(r.unit_price) : "-"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[12px] font-semibold text-sky-700 align-top">
                      {r.amount > 0 ? fmt(r.amount) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-white border-t-2 border-slate-200">
                <tr>
                  <td colSpan={5} className="px-2 py-2 text-right text-[11px] font-black text-slate-500">합계</td>
                  <td className="px-2 py-2 text-right tabular-nums text-[13px] font-black text-sky-700">{fmtWon(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
};

// ─── KpiBox · 내부 sub-component ─────────────────────────────────────────

const KpiBox: React.FC<{ label: string; value: string; tone: "sky" | "emerald" | "slate" }> = ({ label, value, tone }) => {
  const tones: Record<string, { border: string; text: string; label: string }> = {
    sky:     { border: "border-sky-100 bg-sky-50/40",         text: "text-sky-700",     label: "text-sky-500"     },
    emerald: { border: "border-emerald-100 bg-emerald-50/40", text: "text-emerald-700", label: "text-emerald-500" },
    slate:   { border: "border-slate-100 bg-slate-50/40",     text: "text-slate-700",   label: "text-slate-500"   },
  };
  const t = tones[tone];
  return (
    <div className={`border ${t.border} rounded-lg px-2.5 py-1.5 flex flex-col gap-0.5`}>
      <span className={`text-[9px] font-black uppercase tracking-wider ${t.label}`}>{label}</span>
      <span className={`text-[13px] font-black tabular-nums ${t.text}`}>{value}</span>
    </div>
  );
};

export default ProductPurchaseDetailPanel;
