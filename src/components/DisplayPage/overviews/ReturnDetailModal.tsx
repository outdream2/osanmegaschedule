// src/components/DisplayPage/overviews/ReturnDetailModal.tsx
// 2026-10-09 · GLOBAL UI · 반품 상세 Modal · 기존 /api/return-requests PATCH flow 재사용
//   · pending → done 확정 (api.patch) · 삭제 (api.del) · 복원 (status=pending)

import React, { useState } from "react";
import { ArrowsLeftRight, Buildings, Calendar, X, Check, Trash, ArrowCounterClockwise } from "@phosphor-icons/react";
import { OperationsDetailModalShell } from "./OperationsDetailModalShell";
import { StoreStatusBadge } from "./StoreOverviewPrimitives";
import { api, ApiError } from "../../../lib/apiClient";

export interface ReturnRow {
  id?: number | string;
  product_name?: string;
  product_code?: string;
  supplier?: string;
  supplier_name?: string;
  qty?: number;
  quantity?: number;
  reason?: string;
  status?: string;
  created_at?: string;
  note?: string;
  supplier_email?: string;
}

export interface ReturnDetailModalProps {
  open: boolean;
  onClose: () => void;
  row: ReturnRow | null;
  onChanged?: () => void;
}

export const ReturnDetailModal: React.FC<ReturnDetailModalProps> = ({ open, onClose, row, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!row) return <OperationsDetailModalShell open={false} onClose={onClose} title="" >{null}</OperationsDetailModalShell>;

  const supplier = row.supplier_name ?? row.supplier ?? "-";
  const qty = row.qty ?? row.quantity ?? "-";
  const status = row.status ?? "pending";
  const created = (row.created_at ?? "").slice(0, 16).replace("T", " ") || "-";

  const act = async (patch: Record<string, any>) => {
    if (!row.id) return;
    setBusy(true); setErr(null);
    try {
      await api.patch(`/api/return-requests/${row.id}`, patch);
      onChanged?.();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!row.id) return;
    setBusy(true); setErr(null);
    try {
      await api.del(`/api/return-requests/${row.id}`);
      onChanged?.();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <OperationsDetailModalShell
      open={open}
      onClose={onClose}
      title="반품 상세"
      icon={<ArrowsLeftRight size={18} />}
      size="md"
      loading={busy}
      errorMessage={err}
      summary={
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 text-[14px]">
          <div>
            <div className="text-[12px] text-ink-soft font-medium">상품</div>
            <div className="font-semibold text-ink mt-0.5 truncate">{row.product_name ?? "-"}</div>
            <div className="text-[12px] text-ink-soft tabular-nums">{row.product_code ?? ""}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">공급사</div>
            <div className="font-semibold text-ink mt-0.5 flex items-center gap-1"><Buildings size={13} />{supplier}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">요청일시</div>
            <div className="font-semibold text-ink mt-0.5 tabular-nums flex items-center gap-1"><Calendar size={13} />{created}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">상태</div>
            <div className="mt-0.5"><StoreStatusBadge status={status} tone={status === "done" ? "emerald" : "rose"} /></div>
          </div>
        </section>
      }
      footerLeft={
        <button type="button" onClick={onClose} disabled={busy}
          className="inline-flex items-center gap-1 h-10 px-3 rounded-lg text-[14px] font-medium text-ink-soft hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50">
          <X size={14} /> 닫기
        </button>
      }
      footerRight={
        <>
          {status === "pending" ? (
            <button type="button" onClick={() => act({ status: "done" })} disabled={busy}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[14px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50">
              <Check size={14} weight="bold" /> 확정
            </button>
          ) : (
            <button type="button" onClick={() => act({ status: "pending" })} disabled={busy}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[14px] font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors cursor-pointer disabled:opacity-50">
              <ArrowCounterClockwise size={14} /> 재요청으로 복원
            </button>
          )}
          <button type="button" onClick={remove} disabled={busy}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-[14px] font-medium text-rose-600 border border-rose-200 bg-white hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50">
            <Trash size={14} /> 삭제
          </button>
        </>
      }
    >
      <section className="grid grid-cols-2 gap-4 text-[14px]">
        <div className="border border-slate-200 rounded-lg p-3">
          <div className="text-[12px] text-ink-soft font-medium">반품수량</div>
          <div className="text-[18px] font-bold text-ink tabular-nums mt-0.5">{qty}</div>
        </div>
        <div className="border border-slate-200 rounded-lg p-3">
          <div className="text-[12px] text-ink-soft font-medium">반품사유</div>
          <div className="text-[14px] text-ink mt-0.5">{row.reason ?? "-"}</div>
        </div>
      </section>
      {row.note && (
        <section className="mt-3 border border-slate-200 rounded-lg p-3 text-[14px]">
          <div className="text-[12px] font-semibold text-ink-soft mb-1">비고</div>
          <div className="text-ink whitespace-pre-wrap">{row.note}</div>
        </section>
      )}
    </OperationsDetailModalShell>
  );
};

export default ReturnDetailModal;
