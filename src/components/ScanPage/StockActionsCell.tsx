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
    <div className="flex items-center justify-center gap-0.5">
      {/* 이력 */}
      <button
        onClick={() => onHistory(row.code, row.product.name)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg
          text-zinc-300 hover:text-teal-600 hover:bg-teal-50
          transition-all duration-150 cursor-pointer"
        title="실재고 저장 이력"
      >
        <History size={13} />
        {(row.historyCount ?? 0) > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1
            text-[11px] font-bold text-white bg-teal-500 rounded-full
            flex items-center justify-center leading-none tabular-nums">
            {row.historyCount}
          </span>
        )}
      </button>

      {/* 삭제 */}
      <button
        onClick={() => onRemove(row.key)}
        className="w-9 h-9 flex items-center justify-center rounded-lg
          text-zinc-300 hover:text-rose-500 hover:bg-rose-50
          transition-all duration-150 cursor-pointer"
        title="삭제"
      >
        <Trash2 size={13} />
      </button>

      {/* 2026-08-18 · 사용자 지시 · 진열요청 · 우측 배치 · 붉은색계열 (red-600) */}
      <button
        onClick={() => onRequestDisplay(row)}
        disabled={requestingKey === row.key}
        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
          storeEmpty
            ? "text-red-600 bg-red-50 hover:text-red-700 hover:bg-red-100 animate-pulse"
            : "text-red-500 hover:text-red-700 hover:bg-red-50"
        }`}
        title="진열요청 전송 · 매장 재고 부족 시 강조"
      >
        {requestingKey === row.key
          ? <Spinner size={13} tone="red" />
          : <Megaphone size={13} />}
      </button>
    </div>
  );
});
StockActionsCell.displayName = "StockActionsCell";
