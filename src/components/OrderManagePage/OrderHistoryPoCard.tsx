// src/components/OrderManagePage/OrderHistoryPoCard.tsx
// 2026-09-24 · OrderHistoryTab 에서 분리 · 모바일(md 이하) 카드형 PO 단위 뷰

import React from "react";
import { ChevronDown, ChevronRight, Mail, Phone, User, FileDown, CheckCircle2 } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { StatusPill } from "../common/StatusPill";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { shortDate } from "../../lib/dateFormat";

interface OrderHistoryItem {
  id: string | number;
  product_code: string;
  product_name: string;
  order_qty: number;
  unit_price: number;
  line_amount: number;
  current_stock: number | null;
  optimal_stock: number | null;
}

export interface OrderHistoryPoCardOrder {
  order_number: string | null;
  order_date: string | null;
  desired_arrival: string | null;
  supplier: string;
  supplier_contact: string | null;
  supplier_email: string | null;
  supplier_phone: string | null;
  memo: string | null;
  sent_at: string;
  status?: "ordered" | "matched";
  items: OrderHistoryItem[];
  total_qty: number;
  total_amount: number;
}

/** 상품 코드 뒤 4자리만 */
function shortCode(code: string): string {
  if (!code) return "—";
  return code.length > 4 ? `…${code.slice(-4)}` : code;
}

/** 발주일→희망일 한 줄 표현 */
function dateRange(orderDate: string | null, arrival: string | null): string {
  const od = shortDate(orderDate);
  const ar = shortDate(arrival);
  if (!od && !ar) return "—";
  if (!ar) return od;
  if (!od) return ar;
  return `${od}→${ar}`;
}

export interface OrderHistoryPoCardProps {
  o: OrderHistoryPoCardOrder;
  isOpen: boolean;
  onToggle: () => void;
  onPdf: () => void;
  onMatch: () => void;
  pdfLoading: boolean;
  matchLoading: boolean;
  fmtWon: (n: number) => string;
}

/**
 * 모바일(md 이하) 발주이력 PO 카드
 *   · 상태 accent bar · 발주번호(소) + 공급사(대) + 날짜범위·종·금액
 *   · 펼치면 담당자 정보 + 아이템 목록
 */
export const OrderHistoryPoCard: React.FC<OrderHistoryPoCardProps> = ({
  o, isOpen, onToggle, onPdf, onMatch, pdfLoading, matchLoading, fmtWon,
}) => {
  const isMatched = o.status === "matched";
  return (
    <div className={`rounded-xl border bg-white overflow-hidden ${isMatched ? "border-emerald-200" : "border-zinc-200"}`}>
      <div className="flex gap-0">
        {/* 상태 accent bar */}
        <div className={`w-1 shrink-0 rounded-l-xl ${isMatched ? "bg-emerald-400" : "bg-sky-400"}`} />
        <div className="flex-1 min-w-0">
          {/* 헤더 · 토글 */}
          <button
            type="button"
            onClick={onToggle}
            className="w-full text-left px-3.5 pt-3 pb-2.5 flex items-start gap-2"
          >
            <div className="flex-1 min-w-0 space-y-0.5">
              {/* 발주번호 · 작게 */}
              <div className="text-[13px] text-zinc-400 tabular-nums font-medium">
                #{o.order_number ?? "—"}
              </div>
              {/* 2026-09-24 · 사용자 지시 · 공급사 옆 · 담당자·연락처·이메일 인라인 · 라벨 텍스트 */}
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 leading-snug">
                <span className="inline-flex items-baseline gap-1">
                  <span className="text-[11px] text-zinc-400 font-semibold">공급사</span>
                  <span className="text-[17px] font-bold text-zinc-800 whitespace-normal break-words">
                    {displayVendorName(o.supplier) || o.supplier || "(공급사 미지정)"}
                  </span>
                </span>
                {o.supplier_contact && (
                  <span className="inline-flex items-center gap-1 text-[13px] text-zinc-600">
                    <span className="text-[11px] text-zinc-400 font-semibold">담당자</span>{o.supplier_contact}
                  </span>
                )}
                {o.supplier_phone && (
                  <span className="inline-flex items-center gap-1 text-[13px] text-zinc-600 tabular-nums">
                    <span className="text-[11px] text-zinc-400 font-semibold">연락처</span>{o.supplier_phone}
                  </span>
                )}
                {o.supplier_email && (
                  <span className="inline-flex items-center gap-1 text-[13px] text-zinc-600 truncate max-w-[240px]">
                    <span className="text-[11px] text-zinc-400 font-semibold">이메일</span>{o.supplier_email}
                  </span>
                )}
              </div>
              {/* 날짜범위 · 종·수량 · 금액 */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[14px] text-zinc-500 tabular-nums mt-0.5">
                <span className="text-zinc-400">{dateRange(o.order_date, o.desired_arrival)}</span>
                <span>{o.items.length}종 · {o.total_qty}개</span>
                <span className="font-bold text-emerald-700">{fmtWon(o.total_amount)}</span>
              </div>
            </div>
            {/* chevron */}
            <div className="mt-1 shrink-0 text-zinc-400">
              {isOpen
                ? <ChevronDown size={16} strokeWidth={2.4} />
                : <ChevronRight size={16} strokeWidth={2.4} />}
            </div>
          </button>

          {/* 액션 버튼 행 */}
          <div className="px-3.5 pb-3 flex items-center gap-2">
            {isMatched ? (
              <StatusPill tone="emerald" size="sm" dot>매입완료</StatusPill>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMatch(); }}
                disabled={matchLoading}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[13px] font-bold text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-40 cursor-pointer"
              >
                {matchLoading ? <Spinner size={12} tone="brand" /> : <CheckCircle2 size={12} strokeWidth={2.4} />}
                매입확인
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onPdf(); }}
              disabled={pdfLoading}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-white border border-zinc-200 text-[13px] font-bold text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition disabled:opacity-40 cursor-pointer ml-auto"
            >
              {pdfLoading ? <Spinner size={12} tone="brand" /> : <FileDown size={12} strokeWidth={2.4} />}
              PDF
            </button>
          </div>

          {/* 상세 영역 */}
          {isOpen && (
            <div className="border-t border-zinc-100 bg-zinc-50/60 px-3.5 py-3 space-y-2.5">
              {/* 2026-09-24 · 사용자 지시 · 담당자·연락처 · 헤더로 이동 · 상세에서 제거
                  · 메모만 · 있을 때 · 상단 유지 */}
              {o.memo && (
                <div className="text-[13px] text-zinc-500 italic">
                  메모 · {o.memo}
                </div>
              )}
              {/* 아이템 목록 */}
              <div className="space-y-0.5">
                {o.items.map((it, i) => (
                  <div
                    key={it.id}
                    className="flex items-baseline gap-2 py-1.5 border-b border-zinc-100 last:border-0"
                  >
                    <span className="text-[12px] text-zinc-400 tabular-nums w-4 shrink-0 text-center">{i + 1}</span>
                    <span className="text-[12px] text-zinc-500 tabular-nums shrink-0 whitespace-nowrap">
                      {it.product_code}
                    </span>
                    <span className="flex-1 text-[14px] font-medium text-zinc-700 whitespace-normal break-words leading-snug">
                      {it.product_name}
                    </span>
                    <span className="text-[13px] font-bold text-rose-600 tabular-nums shrink-0">
                      {it.order_qty}개
                    </span>
                    <span className="text-[13px] text-emerald-700 font-bold tabular-nums shrink-0">
                      {it.line_amount > 0 ? fmtWon(it.line_amount) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderHistoryPoCard;
