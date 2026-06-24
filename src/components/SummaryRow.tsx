// src/components/SummaryRow.tsx
import React from "react";
import { MonthlySummary } from "../types";

interface SummaryRowProps {
  summaries: MonthlySummary[];
  label: "약사" | "사원" | "근무인원";
  totalCell?: React.ReactNode;
}

export const SummaryRow: React.FC<SummaryRowProps> = ({ summaries, label, totalCell }) => {
  const isPharmacist = label === "약사";
  const isStaff = label === "사원";
  const isTotal = label === "근무인원";

  const labelCls = isPharmacist
    ? "bg-violet-600 text-white border-r border-violet-500"
    : isStaff
    ? "bg-sky-600 text-white border-r border-sky-500"
    : "bg-indigo-600 text-white border-r border-indigo-500";

  const valActiveCls = isPharmacist
    ? "bg-violet-50 text-violet-700 font-extrabold"
    : isStaff
    ? "bg-sky-50 text-sky-700 font-extrabold"
    : "bg-indigo-50 text-indigo-700 font-extrabold";

  const valEmptyCls = isPharmacist
    ? "bg-violet-50/30 text-slate-300"
    : isStaff
    ? "bg-sky-50/30 text-slate-300"
    : "bg-indigo-50/30 text-slate-300";

  const totalCls = isPharmacist
    ? "bg-violet-100 text-violet-800"
    : isStaff
    ? "bg-sky-100 text-sky-800"
    : "bg-indigo-100 text-indigo-800";

  const todayStr = (() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();

  return (
    <tr className={isTotal ? "border-t-2 border-indigo-200" : "border-t border-slate-100"}>
      <td
        className={`px-2 py-2 sticky left-0 z-20 text-center text-[11px] font-bold tracking-wide shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] ${labelCls}`}
      >
        {label}
      </td>

      {summaries.map((sum) => {
        const val = isPharmacist ? sum.pharmacistCount : isStaff ? sum.staffCount : sum.totalCount;
        const isToday = sum.date === todayStr;
        return (
          <td
            key={sum.day}
            className={`p-1.5 text-center text-xs border-r border-slate-100 w-[30px] sm:w-[44px] transition-colors ${
              val > 0 ? valActiveCls : valEmptyCls
            } ${isToday ? "shadow-[inset_0_0_0_2px_#ef4444] z-20 relative" : ""}`}
          >
            {val > 0 ? val : <span className="opacity-30">·</span>}
          </td>
        );
      })}

      {totalCell !== undefined && (
        <td className={`p-1.5 text-center text-[10px] font-black border-l-2 border-slate-200 ${totalCls}`}>
          {totalCell}
        </td>
      )}
    </tr>
  );
};
