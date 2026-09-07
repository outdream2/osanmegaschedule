// VendorDetailTabs.orders.tsx — 발주내역 탭 컨텐츠 (2026-09-07)
import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { CARD_BASE } from "../../styles/tokens";
import { fmt, dateLabel, type OrderHistoryGroup } from "./VendorDetailTabs.types";

export const OrderHistoryContent: React.FC<{
  groups: OrderHistoryGroup[];
  loading: boolean;
}> = ({ groups, loading }) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-16">
      <Spinner size={18} tone="zinc" label="발주내역 로딩 중..." labelSize={12} />
    </div>
  );
  if (groups.length === 0) return (
    <div className="flex-1 flex items-center justify-center py-16 text-zinc-400 text-[15px]">
      해당 기간 발주 내역 없음
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-auto">
      {groups.map((g, gi) => {
        const key = String(g.order_number ?? gi);
        const isOpen = expandedKeys.has(key);
        return (
          <div key={key} className={`${CARD_BASE} overflow-hidden`}>
            {/* 발주서 헤더 */}
            <button
              type="button"
              onClick={() => toggle(key)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition text-left cursor-pointer"
            >
              <span className="text-zinc-400 shrink-0">
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </span>
              <span className="text-[15px] font-bold text-zinc-700 flex-1 min-w-0">
                발주번호 <span className="font-mono text-sky-700">{g.order_number ?? "—"}</span>
              </span>
              <span className="text-[15px] text-zinc-400 tabular-nums shrink-0">
                {dateLabel(g.sent_at ?? g.order_date)}
              </span>
              <span className="text-[15px] font-extrabold text-emerald-700 tabular-nums shrink-0">
                {fmt(g.total_amount)}원
              </span>
              <span className="text-[15px] text-zinc-400 shrink-0">
                {g.items.length}품목
              </span>
            </button>

            {/* 상세 품목 */}
            {isOpen && (
              <div className="border-t border-zinc-100">
                <div className="grid grid-cols-[1fr_auto_auto_auto] text-[13px] font-bold text-zinc-400 uppercase px-4 py-1.5 border-b border-zinc-50 gap-3">
                  <span>상품명</span>
                  <span className="text-right w-16">수량</span>
                  <span className="text-right w-20">단가</span>
                  <span className="text-right w-20">금액</span>
                </div>
                {g.items.map((item, ii) => (
                  <div
                    key={String(item.id ?? ii)}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center px-4 py-2 gap-3 border-b border-zinc-50/60 hover:bg-zinc-50/50 last:border-0"
                  >
                    <div>
                      <div className="text-[15px] font-semibold text-zinc-700 leading-snug">{item.product_name ?? "—"}</div>
                      {item.product_code && (
                        <div className="text-[13px] text-zinc-400">{item.product_code}</div>
                      )}
                    </div>
                    <span className="text-[15px] tabular-nums text-zinc-600 text-right w-16">{fmt(item.order_qty)}</span>
                    <span className="text-[15px] tabular-nums text-zinc-500 text-right w-20">{fmt(item.unit_price)}</span>
                    <span className="text-[15px] tabular-nums font-bold text-emerald-700 text-right w-20">{fmt(item.line_amount)}</span>
                  </div>
                ))}
                <div className="px-4 py-2 flex items-center justify-between text-[15px] bg-zinc-50/50">
                  <span className="text-zinc-500">도착희망: {dateLabel(g.desired_arrival)}</span>
                  <span className="font-extrabold text-zinc-700 tabular-nums">
                    합계 {fmt(g.total_amount)}원 ({fmt(g.total_qty)}개)
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
