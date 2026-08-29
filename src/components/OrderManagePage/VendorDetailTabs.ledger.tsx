// VendorDetailTabs.ledger.tsx — 결제내역 탭 컨텐츠 (분리 2026-08-29)
import React, { useMemo } from "react";
import { Wallet } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { StatusPill } from "../common/StatusPill";
import { EmptyState } from "../common/EmptyState";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
import { CARD_BASE } from "../../styles/tokens";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";
import { decodeMemo } from "./PaymentInfoTab.utils";
import { fmt, methodLabel, dateLabel, type LedgerRow, type LedgerSummary, type LedgerSortKey } from "./VendorDetailTabs.types";

const LEDGER_CMP: Record<LedgerSortKey, Comparator<LedgerRow>> = {
  date:            (a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")),
  type:            (a, b) => a.type.localeCompare(b.type),
  amount:          (a, b) => a.amount - b.amount,
  running_balance: (a, b) => a.running_balance - b.running_balance,
};

export const LedgerContent: React.FC<{
  ledger: LedgerSummary | null;
  loading: boolean;
  error: string | null;
}> = ({ ledger, loading, error }) => {
  // 2026-08-25 · 사용자 지시 · 결제내역 탭 · 결제 rows 만 표시 (매입은 매입이력 탭)
  const rawRows = useMemo(
    () => (ledger?.rows ?? []).filter(r => r.type === "payment"),
    [ledger],
  );
  const { sorted: rows, sortKey, sortDir, toggleSort } = useSortableTable<LedgerRow, LedgerSortKey>(rawRows, "date", LEDGER_CMP, "desc");
  const arrow = (k: LedgerSortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";
  const { getWidth: lw, resizerProps: lr } = useColumnResize("vendorLedgerV2", {
    num:     { default: 28,  min: 20, max: 48  },
    date:    { default: 108, min: 72, max: 160 },
    memo:    { default: 200, min: 96, max: 380 },
    method:  { default: 72,  min: 48, max: 120 },
    amount:  { default: 112, min: 72, max: 180 },
    balance: { default: 112, min: 72, max: 180 },
  });

  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-16">
      <Spinner size={20} tone="brand" label="결제 내역 로딩 중..." labelSize={14} />
    </div>
  );
  if (error) return (
    <div className="flex-1 flex items-center justify-center py-12 text-rose-600 text-[14px] font-semibold">{error}</div>
  );
  if (!ledger || rows.length === 0) return (
    <div className="flex-1 min-h-[220px] flex items-center justify-center">
      <EmptyState
        icon={Wallet}
        title="결제 내역 없음"
        hint="해당 기간 등록된 결제가 없습니다"
      />
    </div>
  );

  // VAT 컬럼 표시 여부 · row 에 하나라도 vat_amount > 0 있으면 활성 (vendor.vat_included=null 이면 전부 0)
  const showVatCol = rows.some(r => (r.vat_amount ?? 0) > 0);

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="w-full text-[13px] min-w-[560px]" style={{ tableLayout: "fixed" }}>
        <thead className="sticky top-0 bg-white z-10 border-b border-line">
          <tr className="text-[12px] text-zinc-500 uppercase tracking-wider font-semibold">
            <th className="relative text-left px-3 py-2.5 text-zinc-300" style={{ width: lw("num"), minWidth: lw("num") }}>
              #
              <span {...lr("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
            </th>
            <th onClick={() => toggleSort("date")}
              className="relative text-left px-3 py-2.5 cursor-pointer select-none hover:bg-brand-tint/40 transition"
              style={{ width: lw("date"), minWidth: lw("date") }}>
              날짜{arrow("date")}
              <span {...lr("date")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th className="relative text-left px-3 py-2.5" style={{ width: lw("memo"), minWidth: lw("memo") }}>
              메모
              <span {...lr("memo")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
            </th>
            <th className="relative text-left px-3 py-2.5" style={{ width: lw("method"), minWidth: lw("method") }}>
              방법
              <span {...lr("method")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
            </th>
            <th onClick={() => toggleSort("amount")}
              className="relative text-right px-3 py-2.5 cursor-pointer select-none hover:bg-brand-tint/40 transition"
              style={{ width: lw("amount"), minWidth: lw("amount") }}>
              결제금액{arrow("amount")}
              <span {...lr("amount")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            {showVatCol && (
              <th className="text-right px-3 py-2.5 text-zinc-500 w-24 font-semibold" title="부가세 (row 저장값 또는 vendor.vat_included 기반 계산)">
                VAT
              </th>
            )}
            <th onClick={() => toggleSort("running_balance")}
              className="relative text-right px-3 py-2.5 cursor-pointer select-none hover:bg-brand-tint/40 transition"
              style={{ width: lw("balance"), minWidth: lw("balance") }}>
              결제 후 잔고{arrow("running_balance")}
              <span {...lr("balance")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r, i) => {
            const vat = r.vat_amount ?? 0;
            return (
              <tr key={`led-${r.id}-${i}`}
                className="transition-colors duration-150 hover:bg-sky-50/50 group">
                <td className="px-3 py-2 text-zinc-300 text-[12px] tabular-nums align-top font-semibold">{i + 1}</td>
                <td className="px-3 py-2 tabular-nums text-[13px] font-semibold text-zinc-700 align-top whitespace-nowrap">
                  {dateLabel(r.date)}
                </td>
                <td className="px-3 py-2 text-[13px] text-zinc-700 align-top break-words whitespace-normal leading-snug">
                  {(() => {
                    // 2026-08-26 · 사용자 버그 fix · [meta]{...}[/meta] 태그 · decodeMemo 로 note 만 노출
                    const { note, meta } = decodeMemo(r.memo);
                    return (
                      <>
                        {note ? note : <span className="text-zinc-300">-</span>}
                        {meta?.card_issuer && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-50 border border-line text-[12px] font-semibold text-zinc-500 align-middle">
                            {meta.card_issuer}
                          </span>
                        )}
                        {meta?.bank_name && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-50 border border-line text-[12px] font-semibold text-zinc-500 align-middle">
                            {meta.bank_name}
                          </span>
                        )}
                        {meta?.tax_invoice_issued && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-[12px] font-bold text-teal-700 align-middle">
                            세금계산서
                          </span>
                        )}
                        {r.tax_invoice_no && (
                          <span title={`전자세금계산서 승인번호: ${r.tax_invoice_no}`} className="inline-block ml-1.5 align-middle">
                            <StatusPill tone="violet" size="xs">
                              세금계산서 {r.tax_invoice_no.slice(-8)}
                            </StatusPill>
                          </span>
                        )}
                      </>
                    );
                  })()}
                </td>
                <td className="px-3 py-2 align-top whitespace-nowrap">
                  <StatusPill tone="sky" size="xs" shape="square">
                    {methodLabel(r.method)}
                  </StatusPill>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[14px] font-bold align-top text-sky-700">
                  {fmt(r.amount)}
                </td>
                {showVatCol && (
                  <td className="px-3 py-2 text-right tabular-nums text-[12px] text-zinc-500 align-top font-semibold">
                    {vat > 0 ? fmt(vat) : <span className="text-zinc-300">-</span>}
                  </td>
                )}
                <td className={`px-3 py-2 text-right tabular-nums text-[13px] font-bold align-top ${
                  r.running_balance > 0 ? "text-amber-700" : r.running_balance < 0 ? "text-rose-700" : "text-zinc-400"
                }`}>
                  {fmt(r.running_balance)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="sticky bottom-0 bg-gradient-to-b from-brand-tint/40 to-brand-tint/20 border-t-2 border-brand-deep/30">
          <tr>
            <td colSpan={4} className="px-3 py-2.5 text-right text-[12px] font-bold text-zinc-600 uppercase tracking-wider">
              기간 결제 합계
            </td>
            <td className="px-3 py-2.5 text-right text-[14px] font-extrabold text-sky-800 tabular-nums" title={`기간 내 결제 총액`}>
              {fmt(ledger.total_payment)}
            </td>
            {showVatCol && (
              <td className="px-3 py-2.5 text-right text-[12px] font-bold text-zinc-600 tabular-nums" title={`결제 VAT`}>
                {fmt(ledger.total_payment_vat)}
              </td>
            )}
            <td className={`px-3 py-2.5 text-right tabular-nums text-[14px] font-extrabold ${
              ledger.current_balance > 0 ? "text-amber-700" : ledger.current_balance < 0 ? "text-rose-700" : "text-zinc-400"
            }`}>
              {fmt(ledger.current_balance)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
