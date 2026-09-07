// VendorDetailTabs.sales.tsx — 판매내역 탭 컨텐츠 (2026-09-07)
import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { CARD_BASE } from "../../styles/tokens";
import { fmt, dateLabel, type SalesTrendRow } from "./VendorDetailTabs.types";

export const SalesContent: React.FC<{
  rows: SalesTrendRow[];
  loading: boolean;
}> = ({ rows, loading }) => {
  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-16">
      <Spinner size={18} tone="zinc" label="판매내역 로딩 중..." labelSize={12} />
    </div>
  );
  if (rows.length === 0) return (
    <div className="flex-1 flex items-center justify-center py-16 text-zinc-400 text-[15px]">
      해당 기간 판매 데이터 없음
    </div>
  );

  const totalSaleQty  = rows.reduce((s, r) => s + r.sale_qty, 0);
  const totalPurchQty = rows.reduce((s, r) => s + r.purchase_qty, 0);
  const totalAmount   = rows.reduce((s, r) => s + r.total_amount, 0);

  return (
    <div className={`${CARD_BASE} flex-1 min-h-0 overflow-auto flex flex-col`}>
      {/* 요약 헤더 */}
      <div className="grid grid-cols-3 divide-x divide-zinc-100 border-b border-zinc-100 shrink-0">
        <div className="px-4 py-3 flex flex-col gap-0.5">
          <span className="text-[13px] font-bold text-zinc-400 uppercase tracking-wider">판매수량</span>
          <span className="text-[22px] font-extrabold text-sky-700 tabular-nums">{fmt(totalSaleQty)}</span>
        </div>
        <div className="px-4 py-3 flex flex-col gap-0.5">
          <span className="text-[13px] font-bold text-zinc-400 uppercase tracking-wider">매입수량</span>
          <span className="text-[22px] font-extrabold text-emerald-700 tabular-nums">{fmt(totalPurchQty)}</span>
        </div>
        <div className="px-4 py-3 flex flex-col gap-0.5">
          <span className="text-[13px] font-bold text-zinc-400 uppercase tracking-wider">매출금액</span>
          <span className="text-[22px] font-extrabold text-violet-700 tabular-nums">{fmt(totalAmount)}</span>
        </div>
      </div>

      {/* 기간별 목록 */}
      <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
        <thead className="sticky top-0 bg-white z-10 border-b border-zinc-100">
          <tr className="text-[13px] font-bold text-zinc-400 uppercase tracking-wider">
            <th className="text-left px-4 py-2">기간</th>
            <th className="text-right px-3 py-2 w-20">판매수량</th>
            <th className="text-right px-3 py-2 w-20">매입수량</th>
            <th className="text-right px-3 py-2 w-24">재고</th>
            <th className="text-right px-4 py-2 w-28">매출금액</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {[...rows].reverse().map((r, i) => {
            const isPositive = r.sale_qty > r.purchase_qty;
            return (
              <tr key={i} className="hover:bg-zinc-50 transition">
                <td className="px-4 py-2 text-[15px] text-zinc-600 font-semibold whitespace-nowrap">
                  {dateLabel(r.period_start_date)}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="text-[15px] tabular-nums font-bold text-sky-700 inline-flex items-center justify-end gap-1">
                    {isPositive
                      ? <TrendingUp size={12} className="text-sky-500" />
                      : <TrendingDown size={12} className="text-zinc-400" />}
                    {fmt(r.sale_qty)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-[15px] tabular-nums text-emerald-700 font-semibold">{fmt(r.purchase_qty)}</td>
                <td className="px-3 py-2 text-right text-[15px] tabular-nums text-zinc-500">{fmt(r.closing_stock)}</td>
                <td className="px-4 py-2 text-right text-[15px] tabular-nums font-extrabold text-violet-700">{fmt(r.total_amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
