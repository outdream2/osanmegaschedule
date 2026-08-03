// src/components/SummaryRow.tsx
import React from "react";
import { MonthlySummary } from "../types";

interface SummaryRowProps {
  summaries: MonthlySummary[];
  label: "약사" | "사원" | "기타" | "근무인원";
  totalCell?: React.ReactNode; // kept for backward compat, no longer rendered
  showMonthTotal?: boolean;    // 월별 합계 열 표시 여부 (기본 true)
}

export const SummaryRow: React.FC<SummaryRowProps> = ({ summaries, label, showMonthTotal = true }) => {
  const isPharmacist = label === "약사";
  const isStaff = label === "사원";
  const isOther = label === "기타";
  const isTotal = label === "근무인원";

  // 색상 팔레트 4개로 압축: emerald(약사) · slate(사원/기타) · indigo(총계)
  const labelCls = isPharmacist
    ? "bg-emerald-600 text-white border-r border-emerald-500"
    : isStaff
    ? "bg-slate-600 text-white border-r border-slate-500"
    : isOther
    ? "bg-slate-400 text-white border-r border-slate-300"
    : "bg-indigo-600 text-white border-r border-indigo-500";

  const valActiveCls = isPharmacist
    ? "bg-emerald-50 text-emerald-700 font-bold"
    : isStaff
    ? "bg-slate-50 text-slate-700 font-bold"
    : isOther
    ? "bg-slate-50/70 text-slate-600 font-bold"
    : "bg-indigo-50 text-indigo-700 font-bold";

  const valEmptyCls = "bg-transparent text-slate-200";

  const monthTotalCls = isPharmacist
    ? "bg-emerald-50 text-emerald-700 border-l-2 border-slate-200"
    : isStaff
    ? "bg-slate-100 text-slate-600 border-l-2 border-slate-200"
    : isOther
    ? "bg-slate-50 text-slate-500 border-l-2 border-slate-200"
    : "bg-indigo-50 text-indigo-700 border-l-2 border-slate-200";

  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  })();

  const getVal = (sum: MonthlySummary) =>
    isPharmacist ? sum.pharmacistCount : isStaff ? sum.staffCount : isOther ? sum.otherCount : sum.totalCount;

  return (
    <tr className={isTotal ? "border-t-2 border-slate-200" : "border-t border-slate-100/70"}>
      <td className={`px-2 py-1.5 sticky left-0 z-20 text-center text-[11px] font-semibold tracking-wide shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] ${labelCls}`}>
        {label}
      </td>

      {summaries.map((sum, idx) => {
        const val = getVal(sum);
        const isToday = sum.date === todayStr;
        const nextSum = summaries[idx + 1];
        const isMonthEnd = !nextSum || nextSum.date.substring(0, 7) !== sum.date.substring(0, 7);

        const cell = (
          <td
            className={`p-1 text-center text-[11px] border-r border-slate-100 w-[30px] sm:w-[44px] transition-colors ${
              val > 0 ? valActiveCls : valEmptyCls
            } ${isToday ? "shadow-[inset_0_0_0_2px_#ef4444] z-20 relative" : ""}`}
          >
            {val > 0 ? val : <span className="opacity-20 text-[9px]">·</span>}
          </td>
        );

        if (!isMonthEnd || !showMonthTotal) return <React.Fragment key={sum.date}>{cell}</React.Fragment>;

        const mk = sum.date.substring(0, 7);
        const monthTotal = summaries
          .filter(s => s.date.substring(0, 7) === mk)
          .reduce((acc, s) => acc + getVal(s), 0);

        return (
          <React.Fragment key={sum.date}>
            {cell}
            <td className={`p-1 text-center text-[10px] font-semibold ${monthTotalCls}`}>
              {monthTotal > 0 ? `${monthTotal}인` : <span className="opacity-30">-</span>}
            </td>
          </React.Fragment>
        );
      })}
    </tr>
  );
};
