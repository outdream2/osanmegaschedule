import React from "react";
import { fmt } from "./utils";

interface CrossCheckBadgeProps {
  pn: number;
  effectivePageTotals: Map<number, number>;
  effectivePageQtyPrice: Map<number, number>;
  statedTotal: number | null;
  pageQtyPriceAmtMismatch: Map<number, number>;
  /** 2026-07-22 · 소계 선택 상태 · 클릭 가능 배지용 */
  currentChoice?: "stated" | "computed" | "custom";
  /** 2026-07-22 · 소계 선택 콜백 · rowSum(computed) 또는 statedTotal(stated) 선택 */
  onChooseSubtotal?: (pn: number, choice: "stated" | "computed") => void;
}

/** 교차검증 배지 — 행합 · 수량×단가합 · OCR총계 대조 결과를 뱃지로 표시
 *  2026-07-22 · 값 불일치 시 두 값을 각각 클릭해서 소계로 채택 가능 */
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

  // 모두 일치 시 · 기존과 동일한 단일 배지
  if (allOk) {
    return (
      <span
        className="text-[10px] font-black border rounded px-1.5 py-0.5 whitespace-nowrap bg-emerald-50 text-emerald-700 border-emerald-300"
        title={commonTitle}
      >
        ✓ 교차검증
      </span>
    );
  }

  // 불일치 · 두 값이 모두 있으면 각각 클릭 가능한 배지로 분리
  const canChoose = !!onChooseSubtotal && statedTotal != null && !rowSumOk;
  if (canChoose) {
    const chosen = currentChoice ?? "stated"; // stated 가 기본 (getPageDisplayTotal 참조)
    return (
      <span className="inline-flex items-center gap-0.5 flex-wrap" title={commonTitle}>
        <span className="text-[10px] font-black text-rose-700 whitespace-nowrap">⚠</span>
        <button
          type="button"
          onClick={() => onChooseSubtotal!(pn, "computed")}
          className={`text-[10px] font-black rounded px-1.5 py-0.5 whitespace-nowrap border cursor-pointer transition ${
            chosen === "computed"
              ? "bg-emerald-500 text-white border-emerald-600 shadow-sm"
              : "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
          }`}
          title="행합을 이 페이지 소계로 채택"
        >
          {chosen === "computed" ? "✓ " : ""}행합 {fmt(rowSum)}
        </button>
        <span className="text-[10px] font-bold text-slate-500">≠</span>
        <button
          type="button"
          onClick={() => onChooseSubtotal!(pn, "stated")}
          className={`text-[10px] font-black rounded px-1.5 py-0.5 whitespace-nowrap border cursor-pointer transition ${
            chosen === "stated"
              ? "bg-amber-500 text-white border-amber-600 shadow-sm"
              : "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
          }`}
          title="OCR 원본 소계를 이 페이지 소계로 채택"
        >
          {chosen === "stated" ? "✓ " : ""}OCR {fmt(statedTotal)}
        </button>
        {qpaMismatchCount > 0 && (
          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-300 rounded px-1 py-0.5 whitespace-nowrap">
            수식오탐 {qpaMismatchCount}
          </span>
        )}
      </span>
    );
  }

  // 불일치이지만 statedTotal 없거나 콜백 미제공 · 기존 단일 배지 (읽기 전용)
  return (
    <span
      className="text-[10px] font-black border rounded px-1.5 py-0.5 whitespace-nowrap bg-rose-50 text-rose-700 border-rose-300"
      title={commonTitle}
    >
      ⚠ 교차검증 · 행합 {fmt(rowSum)}{statedTotal != null && !rowSumOk ? ` ≠ OCR ${fmt(statedTotal)}` : ""}{qpaMismatchCount > 0 ? ` · 수식오탐 ${qpaMismatchCount}건` : ""}
    </span>
  );
};
