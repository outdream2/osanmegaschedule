import React from "react";
import { fmt } from "./utils";

interface CrossCheckBadgeProps {
  pn: number;
  effectivePageTotals: Map<number, number>;
  effectivePageQtyPrice: Map<number, number>;
  statedTotal: number | null;
  pageQtyPriceAmtMismatch: Map<number, number>;
}

/** 교차검증 배지 — 행합 · 수량×단가합 · OCR총계 대조 결과를 뱃지로 표시 */
export const CrossCheckBadge: React.FC<CrossCheckBadgeProps> = ({
  pn,
  effectivePageTotals,
  effectivePageQtyPrice,
  statedTotal,
  pageQtyPriceAmtMismatch,
}) => {
  const rowSum = effectivePageTotals.get(pn) ?? 0;
  const qpSum  = effectivePageQtyPrice.get(pn) ?? 0;
  const qpaMismatchCount = pageQtyPriceAmtMismatch.get(pn) ?? 0;
  const rowSumOk = statedTotal != null && Math.abs(rowSum - statedTotal) <= Math.max(1, statedTotal * 0.02);
  const qpSumOk = qpSum > 0 && Math.abs(qpSum - rowSum) <= Math.max(1, rowSum * 0.02);
  const allOk = qpaMismatchCount === 0 && (statedTotal == null || rowSumOk);

  return (
    <span
      className={`text-[9px] font-black border rounded px-1.5 py-0.5 whitespace-nowrap ${
        allOk
          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
          : "bg-rose-50 text-rose-700 border-rose-300"
      }`}
      title={
        `[교차검증]\n` +
        `· 행 금액합: ${fmt(rowSum)}원\n` +
        `· 수량×단가 합: ${fmt(qpSum)}원 (${qpSumOk ? "일치" : "불일치"})\n` +
        (statedTotal != null ? `· OCR 소계: ${fmt(statedTotal)}원 (${rowSumOk ? "일치" : `Δ=${fmt(Math.abs(rowSum - statedTotal))}`})\n` : "· OCR 소계 없음\n") +
        `· 행 수식 오탐: ${qpaMismatchCount}건`
      }
    >
      {allOk ? "✓ 교차검증" : `⚠ 교차검증 · 행합 ${fmt(rowSum)}${statedTotal != null && !rowSumOk ? ` ≠ OCR ${fmt(statedTotal)}` : ""}${qpaMismatchCount > 0 ? ` · 수식오탐 ${qpaMismatchCount}건` : ""}`}
    </span>
  );
};
