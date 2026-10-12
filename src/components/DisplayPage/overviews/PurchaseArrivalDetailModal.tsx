// src/components/DisplayPage/overviews/PurchaseArrivalDetailModal.tsx
// 2026-10-09 · GLOBAL UI · 매입·입고 domain-specific detail Modal
//   · OperationsDetailModalShell wrap · 매입이력/입고알림 상세
//   · 주문/입고 수량 variance · 입고상태 · purchase worktree calculation 접근 0

import React from "react";
import { Package, Buildings, Calendar, X } from "@phosphor-icons/react";
import { OperationsDetailModalShell } from "./OperationsDetailModalShell";
import { StoreStatusBadge } from "./StoreOverviewPrimitives";

export interface PurchaseArrivalDetailRow {
  id?: number | string;
  order_no?: string;
  po_no?: string;
  title?: string;
  order_date?: string | null;
  requested_at?: string | null;
  created_at?: string | null;
  scheduled_at?: string | null;
  supplier?: string | null;
  supplier_name?: string | null;
  staff_name?: string | null;
  status?: string | null;
  receiving_status?: string | null;
  note?: string | null;
  body?: string | null;
  items?: Array<{
    product_code?: string;
    product_name?: string;
    order_qty?: number | null;
    received_qty?: number | null;
    unit_price?: number | null;
    amount?: number | null;
    status?: string | null;
  }>;
  product_code?: string;
  product_name?: string;
  order_qty?: number | null;
  received_qty?: number | null;
  total_amount?: number | null;
}

export interface PurchaseArrivalDetailModalProps {
  open: boolean;
  onClose: () => void;
  row: PurchaseArrivalDetailRow | null;
}

const fmtNum = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? "-" : Number(n).toLocaleString();

const statusTone = (s: string | null | undefined): "neutral" | "brand" | "emerald" | "amber" | "rose" => {
  const k = (s ?? "").toLowerCase();
  if (k.includes("complete") || k.includes("완료") || k.includes("done") || k.includes("입고됨") || k.includes("발송됨")) return "emerald";
  if (k.includes("partial") || k.includes("부분")) return "amber";
  if (k.includes("cancel") || k.includes("취소") || k.includes("미입고")) return "rose";
  if (k.includes("pending") || k.includes("요청") || k.includes("대기") || k.includes("예약")) return "brand";
  return "neutral";
};

const varianceTone = (order: number | null | undefined, received: number | null | undefined) => {
  const o = Number(order ?? 0), r = Number(received ?? 0);
  if (!Number.isFinite(o) || !Number.isFinite(r)) return "text-ink-soft";
  const diff = r - o;
  if (diff === 0) return "text-ink-soft";
  if (diff > 0) return "text-emerald-600 font-semibold";
  return "text-rose-600 font-semibold";
};

export const PurchaseArrivalDetailModal: React.FC<PurchaseArrivalDetailModalProps> = ({ open, onClose, row }) => {
  if (!row) {
    return <OperationsDetailModalShell open={false} onClose={onClose} title="">{null}</OperationsDetailModalShell>;
  }

  const supplier = row.supplier_name ?? row.supplier ?? row.title ?? "-";
  const orderNo = row.order_no ?? row.po_no ?? String(row.id ?? "-");
  const whenRaw = row.order_date ?? row.requested_at ?? row.created_at ?? row.scheduled_at ?? "";
  const when = String(whenRaw).slice(0, 16).replace("T", " ") || "-";
  const staff = row.staff_name ?? "-";
  const status = row.receiving_status ?? row.status ?? "-";
  const note = row.note ?? row.body;

  const items = Array.isArray(row.items) && row.items.length > 0
    ? row.items
    : (row.product_code || row.product_name)
      ? [{
          product_code: row.product_code, product_name: row.product_name,
          order_qty: row.order_qty, received_qty: row.received_qty,
          unit_price: null, amount: row.total_amount ?? null,
        }]
      : [];

  const totalOrdered = items.reduce((s, it) => s + (Number(it.order_qty ?? 0) || 0), 0);
  const totalReceived = items.reduce((s, it) => s + (Number(it.received_qty ?? 0) || 0), 0);
  const totalAmount = items.reduce((s, it) => s + (Number(it.amount ?? 0) || 0), 0);
  const receivingRate = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

  return (
    <OperationsDetailModalShell
      open={open}
      onClose={onClose}
      title="매입·입고 상세"
      icon={<Package size={18} />}
      size="lg"
      summary={
        <section className="grid grid-cols-2 lg:grid-cols-6 gap-x-4 gap-y-3 text-[14px]">
          <div>
            <div className="text-[12px] text-ink-soft font-medium">발주번호</div>
            <div className="font-semibold text-ink tabular-nums mt-0.5">{orderNo}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">공급사</div>
            <div className="font-semibold text-ink mt-0.5 flex items-center gap-1"><Buildings size={13} />{supplier}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">일자</div>
            <div className="font-semibold text-ink tabular-nums mt-0.5 flex items-center gap-1"><Calendar size={13} />{when}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">담당자</div>
            <div className="font-semibold text-ink mt-0.5">{staff}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">입고상태</div>
            <div className="mt-0.5"><StoreStatusBadge status={status} tone={statusTone(status)} /></div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">입고율</div>
            <div className={`font-semibold tabular-nums mt-0.5 ${receivingRate === 100 ? "text-emerald-600" : receivingRate >= 50 ? "text-amber-600" : "text-rose-600"}`}>
              {totalOrdered > 0 ? `${receivingRate}%` : "-"}
            </div>
          </div>
        </section>
      }
      footerLeft={
        <button type="button" onClick={onClose}
          className="inline-flex items-center gap-1 h-10 px-3 rounded-lg text-[14px] font-medium text-ink-soft hover:bg-slate-50 transition-colors cursor-pointer">
          <X size={14} /> 닫기
        </button>
      }
    >
      <section className="border border-slate-200 rounded-xl overflow-hidden">
        <header className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-ink">입고 품목 (수량 대조)</h3>
          <span className="text-[12px] text-ink-soft">주문 {fmtNum(totalOrdered)} · 입고 {fmtNum(totalReceived)}</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2.5 px-3 text-left text-[13px] font-semibold text-ink-soft">상품코드</th>
                <th className="py-2.5 px-3 text-left text-[13px] font-semibold text-ink-soft">상품명</th>
                <th className="py-2.5 px-3 text-right text-[13px] font-semibold text-ink-soft">주문</th>
                <th className="py-2.5 px-3 text-right text-[13px] font-semibold text-ink-soft">입고</th>
                <th className="py-2.5 px-3 text-right text-[13px] font-semibold text-ink-soft">차이</th>
                <th className="py-2.5 px-3 text-right text-[13px] font-semibold text-ink-soft">금액</th>
                <th className="py-2.5 px-3 text-center text-[13px] font-semibold text-ink-soft">상태</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-[13px] text-ink-soft/70">입고 품목 정보가 없습니다</td></tr>
              ) : items.map((it, i) => {
                const diff = Number(it.received_qty ?? 0) - Number(it.order_qty ?? 0);
                return (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 text-ink tabular-nums">{it.product_code ?? "-"}</td>
                    <td className="py-2.5 px-3 text-ink">{it.product_name ?? "-"}</td>
                    <td className="py-2.5 px-3 text-right text-ink tabular-nums">{fmtNum(it.order_qty)}</td>
                    <td className="py-2.5 px-3 text-right text-ink tabular-nums">{fmtNum(it.received_qty)}</td>
                    <td className={`py-2.5 px-3 text-right tabular-nums ${varianceTone(it.order_qty, it.received_qty)}`}>
                      {it.order_qty != null && it.received_qty != null ? (diff > 0 ? `+${diff}` : diff) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right text-ink tabular-nums font-semibold">{fmtNum(it.amount)}</td>
                    <td className="py-2.5 px-3 text-center">{it.status ? <StoreStatusBadge status={it.status} tone={statusTone(it.status)} /> : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
            {items.length > 0 && totalAmount > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={5} className="py-2.5 px-3 text-right text-[13px] font-semibold text-ink-soft">총 금액</td>
                  <td className="py-2.5 px-3 text-right text-ink tabular-nums font-bold">{fmtNum(totalAmount)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {note && (
        <section className="mt-4 border border-slate-200 rounded-xl p-4 text-[14px]">
          <div className="text-[12px] font-semibold text-ink-soft mb-1">비고</div>
          <div className="text-ink whitespace-pre-wrap">{note}</div>
        </section>
      )}
    </OperationsDetailModalShell>
  );
};

export default PurchaseArrivalDetailModal;
