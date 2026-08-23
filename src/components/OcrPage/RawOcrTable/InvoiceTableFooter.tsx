import React from "react";
import { fmt, parseNumber } from "./utils";

interface SupplierBalanceRecord {
  id: number;
  supplier_name: string;
  invoice_date: string | null;
  balance: number;
  created_at: string;
}

interface InvoiceTableFooterProps {
  total: number;
  totalBreakdownTitle: string;
  supplierTotals: { supplier: string; total: number; count: number }[];
  supplierBalanceRecords: SupplierBalanceRecord[];
  editingGrandTotal: string | null;
  grandTotalOverride: number | null;
  dispHeaders: string[];
  amtIdx: number;
  pageImages?: string[];
  setEditingGrandTotal: React.Dispatch<React.SetStateAction<string | null>>;
  setGrandTotalOverride: React.Dispatch<React.SetStateAction<number | null>>;
}

export const InvoiceTableFooter: React.FC<InvoiceTableFooterProps> = ({
  total, totalBreakdownTitle, supplierTotals, supplierBalanceRecords,
  editingGrandTotal, grandTotalOverride,
  dispHeaders, amtIdx, pageImages,
  setEditingGrandTotal, setGrandTotalOverride,
}) => {
  if (total <= 0) return null;

  const orderNow = dispHeaders.map((_, i) => i);
  const amtOrderIdx = orderNow.indexOf(amtIdx);
  const imgColOffset = pageImages?.length ? 1 : 0;

  return (
    <tfoot>
      {supplierTotals.length >= 1 && supplierTotals.map(({ supplier, total: sTotal, count }) => {
        const balRec = supplierBalanceRecords.find(r => String(r.supplier_name).trim() === supplier.trim());
        const balAmt = balRec ? Number(balRec.balance) : null;
        return (
          <tr key={supplier} className="border-t border-amber-100 bg-amber-50/40">
            {imgColOffset > 0 && <td />}
            {amtOrderIdx > 0 && (
              <td colSpan={Math.max(1, amtOrderIdx)} className="px-3 py-2 text-right font-semibold text-gray-500">
                {supplier} <span className="text-gray-400">({count}매)</span>
                {balAmt != null && balAmt > 0 && (
                  <span className="ml-2 text-[11px] text-rose-600 font-bold" title={`최신 미수금 · ${balRec?.invoice_date ?? ""}`}>
                    미수 {fmt(balAmt)}원
                  </span>
                )}
              </td>
            )}
            <td className="px-3 py-2 text-right font-bold text-amber-600 whitespace-nowrap">{fmt(sTotal)}원</td>
            {orderNow.slice(amtOrderIdx + 1).map((_, i) => <td key={i} />)}
          </tr>
        );
      })}
      <tr className="bg-amber-50 border-t-2 border-amber-300">
        {imgColOffset > 0 && <td />}
        {amtOrderIdx > 0 && (
          <td
            colSpan={Math.max(1, amtOrderIdx)}
            className="px-3 py-2.5 text-right font-bold text-gray-700 cursor-help"
            title={totalBreakdownTitle}
          >합 계</td>
        )}
        <td className="px-3 py-2.5 text-right font-bold text-amber-700 text-sm whitespace-nowrap">
          {editingGrandTotal !== null ? (
            <input type="text" inputMode="numeric" autoFocus
              value={editingGrandTotal}
              onChange={e => setEditingGrandTotal(e.target.value)}
              onBlur={() => {
                const n = parseNumber(editingGrandTotal.replace(/[^\d-]/g, ""));
                if (n > 0) setGrandTotalOverride(n);
                else setGrandTotalOverride(null);
                setEditingGrandTotal(null);
              }}
              onKeyDown={e => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") { setEditingGrandTotal(null); }
              }}
              className="w-[150px] text-right bg-white border-2 border-amber-400 rounded px-2 py-0.5 focus:outline-none focus:border-brand-deep text-amber-800"
            />
          ) : (
            <button type="button"
              onClick={() => setEditingGrandTotal(String(grandTotalOverride ?? total))}
              title={grandTotalOverride != null ? `수정값 · 원본 자동계산: ${fmt(total)}원 · ${totalBreakdownTitle}` : `클릭하여 총합계 수정 · ${totalBreakdownTitle}`}
              className={`cursor-pointer hover:underline ${grandTotalOverride != null ? "text-orange-700" : ""}`}
            >
              {fmt(grandTotalOverride ?? total)}원
              {grandTotalOverride != null && <span className="text-[10px] font-bold text-orange-500 ml-1">✎</span>}
            </button>
          )}
        </td>
        {orderNow.slice(amtOrderIdx + 1).map((_, i) => <td key={i} />)}
      </tr>
    </tfoot>
  );
};
