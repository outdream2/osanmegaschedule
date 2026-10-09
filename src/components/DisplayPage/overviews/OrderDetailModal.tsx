// src/components/DisplayPage/overviews/OrderDetailModal.tsx
// 2026-10-09 · GLOBAL UI · 발주/매입 상세 Modal (domain-specific · OperationsDetailModalShell wrap)
//   · Row click 시 발주/매입/매입이력 상세 조회 + 담당자 이메일 (mailto)
//   · 상세 수정 action은 기존 OrderManagePage flow 재사용 필요 시 Modal 안 shortcut (purchase worktree 보호)

import React from "react";
import { Package, Buildings, Calendar, EnvelopeSimple, X } from "@phosphor-icons/react";
import { OperationsDetailModalShell } from "./OperationsDetailModalShell";
import { StoreStatusBadge } from "./StoreOverviewPrimitives";

export interface OrderDetailRow {
  id?: number | string;
  order_no?: string;
  po_no?: string;
  requested_at?: string | null;
  created_at?: string | null;
  supplier?: string | null;
  supplier_name?: string | null;
  supplier_email?: string | null;
  supplier_contact?: string | null;
  staff_name?: string | null;
  status?: string | null;
  receiving_status?: string | null;
  note?: string | null;
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
  current_stock?: number | null;
  total_amount?: number | null;
  reconciliation?: {
    order_amount?: number | null;
    purchase_amount?: number | null;
    diff?: number | null;
  };
}

export interface OrderDetailModalProps {
  open: boolean;
  onClose: () => void;
  order: OrderDetailRow | null;
}

const fmtNum = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? "-" : Number(n).toLocaleString();

const buildMailto = (order: OrderDetailRow): string | null => {
  const email = order.supplier_email;
  if (!email) return null;
  const supplier = order.supplier_name ?? order.supplier ?? "";
  const orderNo = order.order_no ?? order.po_no ?? "";
  const orderDate = (order.requested_at ?? order.created_at ?? "").slice(0, 10);
  const subject = `[발주·매입 대조 확인 요청] ${supplier} / ${orderNo}`;
  const body = [
    "안녕하세요.", "",
    "아래 발주 건의 발주·매입 대조 과정에서 확인이 필요한 항목이 발견되었습니다.", "",
    `발주번호: ${orderNo || "-"}`,
    `공급사: ${supplier || "-"}`,
    `발주일: ${orderDate || "-"}`, "",
    "확인 부탁드립니다.",
  ].join("\n");
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

const statusTone = (s: string | null | undefined): "neutral" | "brand" | "emerald" | "amber" | "rose" => {
  const k = (s ?? "").toLowerCase();
  if (k.includes("complete") || k.includes("완료") || k.includes("done")) return "emerald";
  if (k.includes("partial") || k.includes("부분")) return "amber";
  if (k.includes("cancel") || k.includes("취소") || k.includes("미입고")) return "rose";
  if (k.includes("pending") || k.includes("요청") || k.includes("대기")) return "brand";
  return "neutral";
};

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ open, onClose, order }) => {
  if (!order) return <OperationsDetailModalShell open={false} onClose={onClose} title="" >{null}</OperationsDetailModalShell>;

  const supplier = order.supplier_name ?? order.supplier ?? "-";
  const orderNo = order.order_no ?? order.po_no ?? String(order.id ?? "-");
  const orderDate = (order.requested_at ?? order.created_at ?? "").slice(0, 16).replace("T", " ") || "-";
  const staff = order.staff_name ?? "-";
  const status = order.receiving_status ?? order.status ?? "-";

  const items = Array.isArray(order.items) && order.items.length > 0
    ? order.items
    : (order.product_code || order.product_name)
      ? [{ product_code: order.product_code, product_name: order.product_name, order_qty: order.order_qty, received_qty: null, unit_price: null, amount: null }]
      : [];

  const mailto = buildMailto(order);

  return (
    <OperationsDetailModalShell
      open={open}
      onClose={onClose}
      title="발주·매입 상세"
      icon={<Package size={18} />}
      size="lg"
      summary={
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-x-4 gap-y-3 text-[14px]">
          <div>
            <div className="text-[12px] text-ink-soft font-medium">발주번호</div>
            <div className="font-semibold text-ink tabular-nums mt-0.5">{orderNo}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">공급사</div>
            <div className="font-semibold text-ink mt-0.5 flex items-center gap-1"><Buildings size={13} />{supplier}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">요청일시</div>
            <div className="font-semibold text-ink tabular-nums mt-0.5 flex items-center gap-1"><Calendar size={13} />{orderDate}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">담당자</div>
            <div className="font-semibold text-ink mt-0.5">{staff}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">입고상태</div>
            <div className="mt-0.5"><StoreStatusBadge status={status} tone={statusTone(status)} /></div>
          </div>
        </section>
      }
      footerLeft={
        <button type="button" onClick={onClose}
          className="inline-flex items-center gap-1 h-10 px-3 rounded-lg text-[14px] font-medium text-ink-soft hover:bg-slate-50 transition-colors cursor-pointer">
          <X size={14} /> 닫기
        </button>
      }
      footerRight={
        mailto ? (
          <a href={mailto}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[14px] font-semibold bg-brand-deep text-white hover:bg-[#0d3a5c] active:bg-[#08253a] transition-colors cursor-pointer">
            <EnvelopeSimple size={14} weight="fill" /> 담당자 이메일
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[14px] font-medium bg-slate-100 text-slate-400 cursor-not-allowed" title="담당자 이메일 미등록">
            <EnvelopeSimple size={14} /> 이메일 미등록
          </span>
        )
      }
    >
      <section className="border border-slate-200 rounded-xl overflow-hidden">
        <header className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <h3 className="text-[15px] font-semibold text-ink">발주 상품 목록</h3>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2.5 px-3 text-left text-[13px] font-semibold text-ink-soft">상품코드</th>
                <th className="py-2.5 px-3 text-left text-[13px] font-semibold text-ink-soft">상품명</th>
                <th className="py-2.5 px-3 text-right text-[13px] font-semibold text-ink-soft">주문수량</th>
                <th className="py-2.5 px-3 text-right text-[13px] font-semibold text-ink-soft">입고수량</th>
                <th className="py-2.5 px-3 text-right text-[13px] font-semibold text-ink-soft">단가</th>
                <th className="py-2.5 px-3 text-right text-[13px] font-semibold text-ink-soft">금액</th>
                <th className="py-2.5 px-3 text-center text-[13px] font-semibold text-ink-soft">상태</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-[13px] text-ink-soft/70">상품 정보가 없습니다</td></tr>
              ) : items.map((it, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="py-2.5 px-3 text-ink tabular-nums">{it.product_code ?? "-"}</td>
                  <td className="py-2.5 px-3 text-ink">{it.product_name ?? "-"}</td>
                  <td className="py-2.5 px-3 text-right text-ink tabular-nums">{fmtNum(it.order_qty)}</td>
                  <td className="py-2.5 px-3 text-right text-ink tabular-nums">{fmtNum(it.received_qty)}</td>
                  <td className="py-2.5 px-3 text-right text-ink tabular-nums">{fmtNum(it.unit_price)}</td>
                  <td className="py-2.5 px-3 text-right text-ink tabular-nums font-semibold">{fmtNum(it.amount)}</td>
                  <td className="py-2.5 px-3 text-center">{it.status ? <StoreStatusBadge status={it.status} tone={statusTone(it.status)} /> : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {order.reconciliation && (
        <section className="mt-4 border border-slate-200 rounded-xl p-4">
          <h3 className="text-[15px] font-semibold text-ink mb-3">발주·매입 대조 요약</h3>
          <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-[14px]">
            <div><span className="text-ink-soft">발주금액</span> <span className="font-semibold text-ink tabular-nums ml-1">{fmtNum(order.reconciliation.order_amount)}</span></div>
            <div><span className="text-ink-soft">매입금액</span> <span className="font-semibold text-ink tabular-nums ml-1">{fmtNum(order.reconciliation.purchase_amount)}</span></div>
            <div><span className="text-ink-soft">금액차이</span> <span className="font-semibold text-rose-600 tabular-nums ml-1">{fmtNum(order.reconciliation.diff)}</span></div>
          </div>
        </section>
      )}

      {order.note && (
        <section className="mt-4 border border-slate-200 rounded-xl p-4 text-[14px]">
          <div className="text-[12px] font-semibold text-ink-soft mb-1">비고</div>
          <div className="text-ink whitespace-pre-wrap">{order.note}</div>
        </section>
      )}
    </OperationsDetailModalShell>
  );
};

export default OrderDetailModal;
