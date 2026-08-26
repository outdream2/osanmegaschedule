// 2026-08-26 · Framework Phase 4 · large-file 분리
// VendorDetailModal.tsx activeTab==="payment" 섹션 추출
//   원장 테이블 + KPI 카드 + 결제 등록/삭제/새로고침

import React from "react";
import { RefreshCw, Plus, Check, X, TrendingUp, Wallet, CircleDollarSign, Trash2 } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { StatusPill } from "../common/StatusPill";
import { StatCard } from "./VendorDetailModal.helpers";
import { METHOD_LABEL } from "./VendorListEditor.utils";
import { fmtWon } from "./VendorListEditor.utils";
import type { SupplierBalanceInfo, PaymentRow, LedgerRow } from "./VendorDetailModal.types";

interface Props {
  balanceInfo: SupplierBalanceInfo | null;
  payments: PaymentRow[];
  paymentLoading: boolean;
  ledgerRows: LedgerRow[];
  payMsg: { type: "ok" | "err"; text: string } | null;
  onRegister: () => void;
  onRefresh: () => void;
  onDeletePayment: (id: number) => void;
}

export const VendorDetailPaymentPanel: React.FC<Props> = ({
  balanceInfo, payments, paymentLoading, ledgerRows,
  payMsg, onRegister, onRefresh, onDeletePayment,
}) => (
  <div className="space-y-4">
    {/* KPI 3카드 */}
    <div className="grid grid-cols-3 gap-2.5">
      <StatCard
        icon={<TrendingUp size={12} />} color="indigo" label="총 매입"
        value={balanceInfo ? fmtWon(balanceInfo.total_purchase) : "-"}
        sub={balanceInfo ? `${balanceInfo.purchase_count.toLocaleString()}건` : undefined}
      />
      <StatCard
        icon={<Wallet size={12} />} color="emerald" label="총 결제"
        value={balanceInfo ? fmtWon(balanceInfo.total_payment) : "-"}
        sub={balanceInfo ? `${balanceInfo.payment_count.toLocaleString()}건` : undefined}
      />
      <StatCard
        icon={<CircleDollarSign size={12} />} color="rose" label="현재 잔액"
        value={balanceInfo ? fmtWon(balanceInfo.balance) : "-"}
        sub={balanceInfo && balanceInfo.balance > 0 ? "미결제" : balanceInfo && balanceInfo.balance < 0 ? "선지급" : undefined}
      />
    </div>

    {/* 결제 등록 버튼 + 상태 메시지 */}
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onRegister}
        className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[14px] font-bold shadow-sm transition cursor-pointer"
      >
        <Plus size={13} strokeWidth={2.5} />
        결제 등록
      </button>
      <button
        onClick={onRefresh}
        disabled={paymentLoading}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line bg-white hover:bg-zinc-50 text-zinc-600 text-[14px] font-semibold transition cursor-pointer disabled:opacity-50"
        title="새로고침"
      >
        <RefreshCw size={12} className={paymentLoading ? "animate-spin" : ""} />
        새로고침
      </button>
      {payMsg && (
        <span className={`inline-flex items-center gap-1 text-[14px] font-bold ${payMsg.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>
          {payMsg.type === "ok" ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
          {payMsg.text}
        </span>
      )}
      <span className="ml-auto text-[13px] text-zinc-400 font-mono tabular-nums">
        {ledgerRows.length} 원장 항목
      </span>
    </div>

    {/* 원장 테이블 · 시간순 desc */}
    <div className="rounded-lg border border-line overflow-auto max-h-[420px] bg-white">
      {paymentLoading ? (
        <div className="flex items-center justify-center py-8"><Spinner tone="zinc" label="로딩중..." labelSize={12} /></div>
      ) : ledgerRows.length === 0 ? (
        <div className="py-8 text-center text-zinc-400 text-[14px]">거래 내역 없음</div>
      ) : (
        <table className="w-full text-[14px]">
          <thead className="sticky top-0 z-10 bg-zinc-50 border-b border-line">
            <tr className="text-[13px] font-bold uppercase tracking-wider text-zinc-500">
              <th className="text-left px-3 py-2 w-20">날짜</th>
              <th className="text-left px-3 py-2 w-16">유형</th>
              <th className="text-right px-3 py-2 w-24">금액</th>
              <th className="text-left px-3 py-2 w-16">방법</th>
              <th className="text-left px-3 py-2">메모 / 상품</th>
              <th className="text-right px-3 py-2 w-24">잔액</th>
              <th className="text-center px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {ledgerRows.slice().reverse().map((r) => {
              const isPay = r.type === "payment";
              const paymentRow = isPay ? payments.find(p => p.id === r.id) : null;
              return (
                <tr key={`${r.type}-${r.id}`} className="hover:bg-zinc-50/60 transition">
                  <td className="px-3 py-1.5 font-mono text-[13px] text-zinc-500 whitespace-nowrap tabular-nums">
                    {String(r.date).slice(2)}
                  </td>
                  <td className="px-3 py-1.5">
                    <StatusPill tone={isPay ? "emerald" : "indigo"} size="xs">{isPay ? "결제" : "매입"}</StatusPill>
                  </td>
                  <td className={`text-right px-3 py-1.5 font-mono font-bold whitespace-nowrap tabular-nums ${isPay ? "text-emerald-700" : "text-indigo-700"}`}>
                    {isPay ? "-" : "+"}{Number(r.amount).toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-[13px] text-zinc-600">
                    {r.method ? (METHOD_LABEL[r.method] ?? r.method) : "-"}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-700 break-words leading-snug text-[13px]">
                    {r.memo ?? "-"}
                    {paymentRow?.allocations && paymentRow.allocations.length > 0 && (
                      <span className="ml-1 text-[12px] font-bold text-emerald-600">· {paymentRow.allocations.length}건 매칭</span>
                    )}
                  </td>
                  <td className={`text-right px-3 py-1.5 font-mono font-bold whitespace-nowrap tabular-nums ${
                    r.running_balance > 0 ? "text-rose-700" : r.running_balance < 0 ? "text-emerald-700" : "text-zinc-500"
                  }`}>
                    {Number(r.running_balance).toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {isPay && (
                      <button
                        onClick={() => onDeletePayment(r.id)}
                        className="w-6 h-6 rounded hover:bg-rose-50 text-rose-500 hover:text-rose-700 inline-flex items-center justify-center transition"
                        title="결제 삭제"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  </div>
);
