import React, { useCallback } from "react";
import { Download } from "lucide-react";
import type { OcrItem } from "./types";
import { fmt } from "./types";

interface ItemsTableProps {
  items: OcrItem[];
  uniqueDates: string[];
}

export const ItemsTable: React.FC<ItemsTableProps> = ({ items, uniqueDates }) => {
  const totalAmount = items.reduce((s, it) => s + (it.amount ?? 0), 0);

  const handleExportCsv = useCallback(() => {
    const header = ["페이지", "품명", "규격", "수량", "단가", "금액"];
    const rows = items.map(it => [
      it._page,
      it.name ?? "",
      it.spec ?? "",
      it.qty ?? "",
      it.unit_price ?? "",
      it.amount ?? "",
    ]);
    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const bom = "﻿";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = uniqueDates[0]?.replace(/[-/]/g, "") ?? "export";
    a.download = `거래명세서_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [items, uniqueDates]);

  if (items.length === 0) return null;

  return (
    <div className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="font-bold text-gray-900 text-sm">품목 목록</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{items.length}개 항목</span>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition cursor-pointer"
          >
            <Download size={12} />CSV 내보내기
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs font-bold">
              <th className="text-left px-4 py-2.5">품명</th>
              <th className="text-left px-3 py-2.5 whitespace-nowrap">규격</th>
              <th className="text-right px-3 py-2.5">수량</th>
              <th className="text-right px-3 py-2.5 whitespace-nowrap">단가</th>
              <th className="text-right px-4 py-2.5">금액</th>
              <th className="text-center px-3 py-2.5">페이지</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-amber-50/50 transition-colors">
                <td className="px-4 py-2.5 font-medium text-gray-900">{it.name ?? "-"}</td>
                <td className="px-3 py-2.5 text-gray-500">{it.spec ?? "-"}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{it.qty ?? "-"}</td>
                <td className="px-3 py-2.5 text-right text-gray-700 whitespace-nowrap">{fmt(it.unit_price)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap">{fmt(it.amount)}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">{it._page}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-amber-50 border-t-2 border-amber-200">
              <td colSpan={4} className="px-4 py-2.5 text-right font-black text-gray-700 text-sm">합계</td>
              <td className="px-4 py-2.5 text-right font-black text-amber-700 text-sm whitespace-nowrap">{fmt(totalAmount)}원</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
