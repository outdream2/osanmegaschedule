// src/components/OrderManagePage/PurchaseHistoryTab/ProductAggTab.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · PurchaseSubTabs 에서 이관
// Tab 2 · 상품별 집계 (product_name groupBy)
// 프레임워크: useSortableTable · useColumnResize
import React, { useMemo } from "react";
import { useSortableTable, type Comparator } from "../../../hooks/useSortableTable";
import { useColumnResize, RESIZER_CLS } from "../../../hooks/useColumnResize";
import { fmtWonNoUnit, fmtDateSlice } from "../../../lib/format";
import { Spinner } from "../../common/Spinner";

// PurchaseDetailRow · PurchaseSubTabs 에서 export 하지만 순환 방지 위해 local 재정의
export interface PurchaseDetailRow {
  id: string | number;
  date: string; // YYYY-MM-DD
  product_code: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}
const fmtWon = fmtWonNoUnit;
const dateLabel = fmtDateSlice;

interface ProductAgg {
  key: string;
  product_name: string;
  product_code: string | null;
  total_qty: number;
  total_amount: number;
  avg_unit_price: number;
  last_date: string;
  purchase_count: number;
  avg_interval: number | null; // 2026-08-06 · 평균 매입주기 (일) · 2회+ 만 계산
  _dates: Set<string>; // 계산 임시
}

type ProductSortKey = "product_name" | "total_qty" | "avg_unit_price" | "last_date" | "purchase_count" | "total_amount" | "avg_interval";

const PRODUCT_AGG_CMP: Record<ProductSortKey, Comparator<ProductAgg>> = {
  product_name:   (a, b) => a.product_name.localeCompare(b.product_name, "ko"),
  total_qty:      (a, b) => a.total_qty - b.total_qty,
  avg_unit_price: (a, b) => a.avg_unit_price - b.avg_unit_price,
  last_date:      (a, b) => a.last_date.localeCompare(b.last_date),
  purchase_count: (a, b) => a.purchase_count - b.purchase_count,
  total_amount:   (a, b) => a.total_amount - b.total_amount,
  avg_interval:   (a, b) => (a.avg_interval ?? 999) - (b.avg_interval ?? 999),
};

export const ProductAggTab: React.FC<{ rows: PurchaseDetailRow[]; loading: boolean }> = ({ rows, loading }) => {
  const aggregated = useMemo<ProductAgg[]>(() => {
    const map = new Map<string, ProductAgg>();
    for (const r of rows) {
      const nm = String(r.product_name ?? "").trim() || "(이름없음)";
      const key = nm;
      let a = map.get(key);
      if (!a) {
        a = {
          key,
          product_name: nm,
          product_code: r.product_code,
          total_qty: 0,
          total_amount: 0,
          avg_unit_price: 0,
          last_date: r.date,
          purchase_count: 0,
          avg_interval: null,
          _dates: new Set<string>(),
        };
        map.set(key, a);
      }
      a.total_qty += r.quantity;
      a.total_amount += r.amount;
      a.purchase_count += 1;
      if (r.date > a.last_date) a.last_date = r.date;
      if (!a.product_code && r.product_code) a.product_code = r.product_code;
      const d = String(r.date ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) a._dates.add(d);
    }
    for (const a of map.values()) {
      a.avg_unit_price = a.total_qty > 0 ? a.total_amount / a.total_qty : 0;
      // 평균 매입주기 · 2회+ 매입 · 정렬 dates · 인접 간격 평균 (일)
      if (a._dates.size >= 2) {
        const dates = Array.from(a._dates).sort();
        let total = 0;
        for (let i = 1; i < dates.length; i++) {
          total += Math.round((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000);
        }
        a.avg_interval = Math.round(total / (dates.length - 1));
      }
    }
    return Array.from(map.values());
  }, [rows]);

  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable<ProductAgg, ProductSortKey>(aggregated, "total_amount", PRODUCT_AGG_CMP, "desc");
  const arrow = (k: ProductSortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";
  const { getWidth: aw, resizerProps: ar } = useColumnResize("productAgg", {
    num:      { default: 28,  min: 24, max: 48  },
    name:     { default: 200, min: 100, max: 400 },
    qty:      { default: 80,  min: 56, max: 140 },
    unit:     { default: 80,  min: 56, max: 140 },
    interval: { default: 56,  min: 40, max: 100 },
    last_date:{ default: 56,  min: 40, max: 100 },
    count:    { default: 56,  min: 40, max: 100 },
    amount:   { default: 96,  min: 64, max: 160 },
  });

  const totalAmount = useMemo(() => aggregated.reduce((s, a) => s + a.total_amount, 0), [aggregated]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center py-12"><Spinner label="불러오는 중..." size={13} tone="zinc" labelSize={11} /></div>;
  }
  if (aggregated.length === 0) {
    return <div className="flex-1 flex items-center justify-center py-12 text-zinc-400 text-[17px]">해당 기간 매입 상품 없음</div>;
  }
  return (
    <div className="overflow-auto flex-1 min-h-0">
      <table className="w-full text-xs min-w-[600px]" style={{ tableLayout: "fixed" }}>
        {/* 2026-08-24 · v3 확산 · bg zinc-100/70 · font-bold */}
        <thead className="sticky top-0 bg-zinc-100/70 z-10 border-b border-line">
          <tr className="text-[15px] sm:text-[16px] font-bold text-zinc-500 uppercase tracking-wider">
            <th className="relative text-left px-2 py-2 text-zinc-300" style={{ width: aw("num"), minWidth: aw("num") }}>
              #
              <span {...ar("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
            </th>
            <th onClick={() => toggleSort("product_name")}
              className="relative text-left px-2 py-2 cursor-pointer select-none hover:bg-zinc-50 transition"
              style={{ width: aw("name"), minWidth: aw("name") }}>
              상품{arrow("product_name")}
              <span {...ar("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th onClick={() => toggleSort("total_qty")}
              className="relative text-right px-2 py-2 cursor-pointer select-none hover:bg-zinc-50 transition"
              style={{ width: aw("qty"), minWidth: aw("qty") }}>
              총매입수량{arrow("total_qty")}
              <span {...ar("qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th onClick={() => toggleSort("avg_unit_price")}
              className="relative text-right px-2 py-2 cursor-pointer select-none hover:bg-zinc-50 transition"
              style={{ width: aw("unit"), minWidth: aw("unit") }}>
              평균단가{arrow("avg_unit_price")}
              <span {...ar("unit")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th onClick={() => toggleSort("avg_interval")}
              className="relative text-right px-2 py-2 cursor-pointer select-none hover:bg-zinc-50 transition leading-tight"
              style={{ width: aw("interval"), minWidth: aw("interval") }}>
              평균<br />매입주기{arrow("avg_interval")}
              <span {...ar("interval")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th onClick={() => toggleSort("last_date")}
              className="relative text-left px-2 py-2 cursor-pointer select-none hover:bg-zinc-50 transition leading-tight"
              style={{ width: aw("last_date"), minWidth: aw("last_date") }}>
              최근<br />매입일{arrow("last_date")}
              <span {...ar("last_date")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th onClick={() => toggleSort("purchase_count")}
              className="relative text-right px-2 py-2 cursor-pointer select-none hover:bg-zinc-50 transition leading-tight"
              style={{ width: aw("count"), minWidth: aw("count") }}>
              매입<br />횟수{arrow("purchase_count")}
              <span {...ar("count")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th onClick={() => toggleSort("total_amount")}
              className="relative text-right px-2 py-2 text-emerald-600 cursor-pointer select-none hover:bg-emerald-50 transition"
              style={{ width: aw("amount"), minWidth: aw("amount") }}>
              총매입액{arrow("total_amount")}
              <span {...ar("amount")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {sorted.map((a, i) => (
            <tr key={`pa-${a.key}-${i}`} className="hover:bg-zinc-50/60 transition-all duration-100">
              <td className="px-2 py-1.5 text-zinc-300 text-[17px] tabular-nums align-top">{i + 1}</td>
              <td className="px-2 py-1.5 align-top">
                <div className="text-[15px] font-semibold text-zinc-700 break-words whitespace-normal leading-snug">
                  {a.product_name}
                </div>
                {a.product_code && (
                  <div className="text-[16px] text-zinc-400 font-mono tabular-nums">{a.product_code}</div>
                )}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[15px] text-zinc-600 align-top">
                {fmt(a.total_qty)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[15px] text-zinc-600 align-top">
                {a.avg_unit_price > 0 ? fmt(Math.round(a.avg_unit_price)) : "-"}
              </td>
              {/* 평균 매입주기 (2026-08-06) · 일수 · 2회 미만이면 '-' */}
              <td className={`px-2 py-1.5 text-right tabular-nums text-[15px] align-top ${a.avg_interval == null ? "text-zinc-300" : "text-zinc-600"}`}
                  title={a.avg_interval == null ? "매입 2회 미만" : `평균 ${a.avg_interval}일`}>
                {a.avg_interval == null ? "—" : `${a.avg_interval}일`}
              </td>
              {/* 최근매입일 (2026-08-06) · 2026 (10px 회색) 줄바꿈 7/20 형식 */}
              <td className="px-2 py-1.5 tabular-nums text-[17px] text-zinc-500 align-top whitespace-nowrap">
                {(() => {
                  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a.last_date);
                  if (m) return (
                    <span className="inline-flex flex-col leading-tight items-start">
                      <span className="text-[15px] text-zinc-400">{m[1]}</span>
                      <span>{String(parseInt(m[2], 10))}/{String(parseInt(m[3], 10))}</span>
                    </span>
                  );
                  return dateLabel(a.last_date);
                })()}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[15px] text-zinc-600 align-top">
                {fmt(a.purchase_count)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[15px] font-semibold text-emerald-700 align-top">
                {fmt(a.total_amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 bg-white border-t-2 border-line">
          <tr>
            <td colSpan={7} className="px-2 py-2 text-right text-[17px] font-bold text-zinc-500">합계</td>
            <td className="px-2 py-2 text-right tabular-nums text-[16px] font-bold text-emerald-700">{fmtWon(totalAmount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
