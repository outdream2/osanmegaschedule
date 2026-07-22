import React from "react";
import { fmt } from "./utils";

interface CrossCheckBadgeProps {
  pn: number;
  effectivePageTotals: Map<number, number>;
  effectivePageQtyPrice: Map<number, number>;
  statedTotal: number | null;
  pageQtyPriceAmtMismatch: Map<number, number>;
  currentChoice?: "stated" | "computed" | "custom";
  onChooseSubtotal?: (pn: number, choice: "stated" | "computed") => void;
}

/** 2026-07-22 · 배지 → 텍스트 형태 (사용자 요청 "너무 산만")
 *  일치: "✓" 만 · 불일치: "금액합계 X ≠ OCR Y" 텍스트 + 클릭 가능 (밑줄로 인터랙션 힌트) */
export const CrossCheckBadge: React.FC<CrossCheckBadgeProps> = ({
  pn,
  effectivePageTotals,
  effectivePageQtyPrice,
  statedTotal,
  pageQtyPriceAmtMismatch,
  currentChoice,
  onChooseSubtotal,
}) => {
  const rowSum = effectivePageTotals.get(pn) ?? 0;
  const qpSum  = effectivePageQtyPrice.get(pn) ?? 0;
  const qpaMismatchCount = pageQtyPriceAmtMismatch.get(pn) ?? 0;
  const rowSumOk = statedTotal != null && Math.abs(rowSum - statedTotal) <= Math.max(1, statedTotal * 0.02);
  const qpSumOk = qpSum > 0 && Math.abs(qpSum - rowSum) <= Math.max(1, rowSum * 0.02);
  const allOk = qpaMismatchCount === 0 && (statedTotal == null || rowSumOk);

  const commonTitle =
    `[교차검증]\n` +
    `· 행 금액합: ${fmt(rowSum)}원\n` +
    `· 수량×단가 합: ${fmt(qpSum)}원 (${qpSumOk ? "일치" : "불일치"})\n` +
    (statedTotal != null ? `· OCR 소계: ${fmt(statedTotal)}원 (${rowSumOk ? "일치" : `Δ=${fmt(Math.abs(rowSum - statedTotal))}`})\n` : "· OCR 소계 없음\n") +
    `· 행 수식 오탐: ${qpaMismatchCount}건`;

  if (allOk) {
    return (
      <span className="text-[11px] font-bold text-emerald-600 whitespace-nowrap" title={commonTitle}>
        ✓ 검증
      </span>
    );
  }

  const canChoose = !!onChooseSubtotal && statedTotal != null && !rowSumOk;
  if (canChoose) {
    const chosen = currentChoice ?? "stated";
    return (
      <span className="inline-flex items-center gap-1 flex-nowrap whitespace-nowrap text-[11px]" title={commonTitle}>
        <button
          type="button"
          onClick={() => onChooseSubtotal!(pn, "computed")}
          className={`cursor-pointer transition ${
            chosen === "computed"
              ? "font-black text-emerald-700 underline"
              : "font-semibold text-slate-500 hover:text-emerald-600 hover:underline"
          }`}
          title="행합을 이 페이지 소계로 채택"
        >
          금액합계 {fmt(rowSum)}
        </button>
        <span className="text-slate-400">≠</span>
        <button
          type="button"
          onClick={() => onChooseSubtotal!(pn, "stated")}
          className={`cursor-pointer transition ${
            chosen === "stated"
              ? "font-black text-amber-700 underline"
              : "font-semibold text-slate-500 hover:text-amber-600 hover:underline"
          }`}
          title="OCR 원본 소계를 이 페이지 소계로 채택"
        >
          OCR {fmt(statedTotal)}
        </button>
        {qpaMismatchCount > 0 && (
          <span className="text-rose-600 font-semibold">· 수식오탐 {qpaMismatchCount}</span>
        )}
      </span>
    );
  }

  return (
    <span className="text-[11px] font-semibold text-rose-600 whitespace-nowrap" title={commonTitle}>
      금액합계 {fmt(rowSum)}{statedTotal != null && !rowSumOk ? ` ≠ OCR ${fmt(statedTotal)}` : ""}{qpaMismatchCount > 0 ? ` · 수식오탐 ${qpaMismatchCount}` : ""}
    </span>
  );
};
