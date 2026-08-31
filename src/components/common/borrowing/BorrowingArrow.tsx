// src/components/common/borrowing/BorrowingArrow.tsx
// 2026-08-31 · #9/#130 · Phase A 프리미티브
//   · Lender → Borrower 그라디언트 화살표 (실선 · open) or 왕복 (점선 · settled)
//   · SVG · violet → emerald 그라디언트

import React from "react";

export interface BorrowingArrowProps {
  status?: "open" | "settled" | "overdue";
  productSummary?: string;    // "타이레놀 10개 · 5,000원" 등
  className?: string;
}

export const BorrowingArrow: React.FC<BorrowingArrowProps> = ({ status = "open", productSummary, className = "" }) => {
  const isSettled = status === "settled";
  const strokeStyle = isSettled ? "5 5" : "0";
  const strokeColor = status === "overdue" ? "#DC2626" : "url(#borrowGrad)";

  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      <svg width="120" height="40" viewBox="0 0 120 40" className="shrink-0">
        <defs>
          <linearGradient id="borrowGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L8,3 z" fill={status === "overdue" ? "#DC2626" : "#059669"} />
          </marker>
          {isSettled && (
            <marker id="arrowhead-back" markerWidth="10" markerHeight="10" refX="2" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M8,0 L8,6 L0,3 z" fill="#7C3AED" />
            </marker>
          )}
        </defs>
        <line
          x1="10" y1="20" x2="110" y2="20"
          stroke={strokeColor}
          strokeWidth="3"
          strokeDasharray={strokeStyle}
          markerEnd="url(#arrowhead)"
          markerStart={isSettled ? "url(#arrowhead-back)" : undefined}
        />
      </svg>
      {productSummary && (
        <div className="text-center px-2 py-1 rounded-md bg-white border border-line shadow-sm">
          <span className="text-[13px] font-bold text-ink tabular-nums">{productSummary}</span>
        </div>
      )}
      {status === "overdue" && (
        <span className="text-[11px] font-extrabold text-rose-600 uppercase tracking-wider">기한 초과</span>
      )}
      {isSettled && (
        <span className="text-[11px] font-extrabold text-emerald-600 uppercase tracking-wider">정산 완료</span>
      )}
    </div>
  );
};

export default BorrowingArrow;
