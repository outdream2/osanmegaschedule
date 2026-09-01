// src/components/common/borrowing/BorrowingCard.tsx
// 2026-08-31 · #9/#130 · Phase A 프리미티브
//   · 이력 리스트 카드형 아이템
//   · [Lender chip] → [상품·금액] → [Borrower chip] · 상태 pill · 액션
//   · 확장 시 Timeline (계약 → 알림 → 반환) · Linear Audit Log 스타일

import React, { useState } from "react";
import { ChevronDown, ChevronRight, ArrowRight, ArrowLeftRight, Clock, CheckCircle, AlertTriangle } from "lucide-react";

export interface BorrowingCardData {
  id: number;
  contract_no?: string | null;
  lender_name?: string | null;
  borrower_name?: string | null;
  product_name?: string | null;
  product_code?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  due_date?: string | null;
  status?: "open" | "settled" | "overdue" | "cancelled" | null;
  created_at?: string | null;
  settled_at?: string | null;
  returned_at?: string | null;
  overdue_notified_at?: string | null;
  note?: string | null;
  return_note?: string | null;
}

export interface BorrowingCardProps {
  item: BorrowingCardData;
  onAction?: (action: "return" | "cancel" | "detail" | "signature") => void;
  defaultExpanded?: boolean;
  className?: string;
}

const STATUS_META = {
  open:      { label: "미해결", bg: "bg-amber-100",   text: "text-amber-800",   icon: Clock },
  settled:   { label: "정산완료", bg: "bg-emerald-100", text: "text-emerald-800", icon: CheckCircle },
  overdue:   { label: "기한초과", bg: "bg-rose-100",    text: "text-rose-800",    icon: AlertTriangle },
  cancelled: { label: "취소",     bg: "bg-zinc-100",    text: "text-zinc-700",    icon: Clock },
} as const;

export const BorrowingCard: React.FC<BorrowingCardProps> = ({ item, onAction, defaultExpanded = false, className = "" }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const status = (item.status ?? "open") as keyof typeof STATUS_META;
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const amount = item.qty != null && item.unit_price != null ? item.qty * item.unit_price : null;

  return (
    <div className={`rounded-xl border border-line bg-white hover:border-brand-deep/30 hover:shadow-md transition-all ${className}`}>
      {/* 헤더 · 항상 표시 */}
      <div className="flex items-center gap-3 p-3">
        {/* 확장 토글 */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-100 text-ink-soft cursor-pointer"
          aria-label={expanded ? "접기" : "펼치기"}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Lender chip */}
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-50 border border-violet-200">
          <div className="w-5 h-5 rounded-full bg-violet-500 text-white flex items-center justify-center text-[11px] font-extrabold">
            {String(item.lender_name ?? "?").charAt(0)}
          </div>
          <span className="text-[13px] font-bold text-violet-800 break-words whitespace-normal">{item.lender_name ?? "미지정"}</span>
        </div>

        {/* Arrow · settled 시 왕복 */}
        {status === "settled" ? (
          <ArrowLeftRight size={16} className="text-emerald-500 shrink-0" />
        ) : (
          <ArrowRight size={16} className="text-brand-deep/60 shrink-0" />
        )}

        {/* 상품 요약 */}
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-ink break-words whitespace-normal">{item.product_name ?? item.product_code ?? "-"}</div>
          <div className="text-[11px] text-ink-soft tabular-nums">
            {item.qty ?? "-"}개
            {amount != null && ` · ${amount.toLocaleString()}원`}
            {item.due_date && ` · 기한 ${item.due_date}`}
          </div>
        </div>

        {/* Borrower chip */}
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
          <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[11px] font-extrabold">
            {String(item.borrower_name ?? "?").charAt(0)}
          </div>
          <span className="text-[13px] font-bold text-emerald-800 break-words whitespace-normal">{item.borrower_name ?? "미지정"}</span>
        </div>

        {/* 상태 pill */}
        <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-extrabold uppercase tracking-wider ${meta.bg} ${meta.text}`}>
          <Icon size={10} />
          {meta.label}
        </span>

        {/* 액션 */}
        {onAction && status === "open" && (
          <button
            type="button"
            onClick={() => onAction("return")}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer shadow-sm"
          >
            반환
          </button>
        )}
      </div>

      {/* 확장 · Timeline */}
      {expanded && (
        <div className="border-t border-line px-3 py-3 space-y-2 bg-zinc-50/40 rounded-b-xl">
          {item.contract_no && (
            <div className="text-[11px] font-mono text-ink-soft">계약번호 · {item.contract_no}</div>
          )}
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-deep mt-2 shrink-0" />
            <div className="flex-1">
              <div className="text-[12px] font-bold text-ink">계약 체결</div>
              <div className="text-[11px] text-ink-soft tabular-nums">{item.created_at ?? "-"}</div>
              {item.note && <div className="text-[12px] text-ink-soft mt-0.5 italic">"{item.note}"</div>}
            </div>
          </div>
          {item.overdue_notified_at && (
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0" />
              <div className="flex-1">
                <div className="text-[12px] font-bold text-amber-800">기한 초과 알림</div>
                <div className="text-[11px] text-ink-soft tabular-nums">{item.overdue_notified_at}</div>
              </div>
            </div>
          )}
          {item.returned_at && (
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
              <div className="flex-1">
                <div className="text-[12px] font-bold text-emerald-800">반환 완료</div>
                <div className="text-[11px] text-ink-soft tabular-nums">{item.returned_at}</div>
                {item.return_note && <div className="text-[12px] text-ink-soft mt-0.5 italic">"{item.return_note}"</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BorrowingCard;
