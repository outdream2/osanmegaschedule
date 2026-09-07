// StockActionsCell · 이력·진열요청·삭제 3버튼 셀 내부 렌더
// ScanPage.tsx tbody > tr > td (마지막 td) 를 여기서 렌더

import React from "react";
import { History, Megaphone, Trash2 } from "lucide-react";
import { Spinner } from "../common/Spinner";
import type { StockRow } from "./stockRowTypes";
import { calcSlotTotal } from "./stockRowTypes";

interface StockActionsCellProps {
  row: StockRow;
  requestingKey: string | null;
  onHistory: (code: string, name: string) => void;
  onRequestDisplay: (row: StockRow) => void;
  onRemove: (key: string) => void;
}

export const StockActionsCell: React.FC<StockActionsCellProps> = React.memo(({
  row, requestingKey, onHistory, onRequestDisplay, onRemove,
}) => {
  // 매장 합계 (prev + add) 가 모두 0 이면 진열요청 강조
  const storeEmpty =
    calcSlotTotal(row.prevStore1Qty, row.store1AddQty) === 0 &&
    calcSlotTotal(row.prevStore2Qty, row.store2AddQty) === 0 &&
    calcSlotTotal(row.prevStore3Qty, row.store3AddQty) === 0;

  return (
    <div className="flex items-center justify-center gap-1.5 flex-wrap">
      {/* 이력 · 2026-09-07 · 사용자 지시 · 버튼+글씨 · 아이콘 only 지양 */}
      <button
        onClick={() => onHistory(row.code, row.product.name)}
        className="relative inline-flex items-center gap-1 h-8 px-2.5 rounded-lg
          text-[14px] font-bold cursor-pointer transition
          bg-white border border-line text-ink-soft
          hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700"
        title="실재고 저장 이력"
      >
        <History size={13} strokeWidth={2.4} />
        이력
        {(row.historyCount ?? 0) > 0 && (
          <span className="ml-0.5 min-w-[18px] h-[18px] px-1 text-[12px] font-bold text-white bg-teal-500 rounded-full inline-flex items-center justify-center leading-none tabular-nums">
            {row.historyCount}
          </span>
        )}
      </button>

      {/* 삭제 */}
      <button
        onClick={() => onRemove(row.key)}
        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg
          text-[14px] font-bold cursor-pointer transition
          bg-white border border-line text-ink-soft
          hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600"
        title="삭제"
      >
        <Trash2 size={13} strokeWidth={2.4} />
        삭제
      </button>

      {/* 진열요청 · 매장 재고 부족 시 강조 (red-600) */}
      <button
        onClick={() => onRequestDisplay(row)}
        disabled={requestingKey === row.key}
        className={[
          "inline-flex items-center gap-1 h-8 px-2.5 rounded-lg",
          "text-[14px] font-bold cursor-pointer transition",
          "disabled:cursor-not-allowed disabled:opacity-50",
          storeEmpty
            ? "bg-red-600 text-white hover:bg-red-700 shadow-sm animate-pulse"
            : "bg-white border border-line text-red-600 hover:bg-red-50 hover:border-red-300",
        ].join(" ")}
        title="진열요청 전송 · 매장 재고 부족 시 강조"
      >
        {requestingKey === row.key
          ? <Spinner size={13} tone="red" />
          : <Megaphone size={13} strokeWidth={2.4} />}
        진열요청
      </button>
    </div>
  );
});
StockActionsCell.displayName = "StockActionsCell";
