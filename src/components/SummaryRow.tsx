// src/components/SummaryRow.tsx
import React from "react";
import { MonthlySummary } from "../types";

interface SummaryRowProps {
  summaries: MonthlySummary[];
  label: "오픈" | "미들" | "마감" | "근무인원";
}

export const SummaryRow: React.FC<SummaryRowProps> = ({ summaries, label }) => {
  let metricKeys: keyof MonthlySummary;
  let labelCls = "";
  let valActiveCls = "";
  let valEmptyCls = "";

  if (label === "오픈") {
    metricKeys = "openCount";
    labelCls = "bg-amber-50 text-amber-800 border-r border-amber-100";
    valActiveCls = "bg-amber-50 text-amber-700 font-bold";
    valEmptyCls = "bg-amber-50/40 text-slate-300";
  } else if (label === "미들") {
    metricKeys = "middleCount";
    labelCls = "bg-sky-50 text-sky-800 border-r border-sky-100";
    valActiveCls = "bg-sky-50 text-sky-700 font-bold";
    valEmptyCls = "bg-sky-50/40 text-slate-300";
  } else if (label === "마감") {
    metricKeys = "closeCount";
    labelCls = "bg-emerald-50 text-emerald-800 border-r border-emerald-100";
    valActiveCls = "bg-emerald-50 text-emerald-700 font-bold";
    valEmptyCls = "bg-emerald-50/40 text-slate-300";
  } else {
    // "근무인원"
    metricKeys = "totalCount";
    labelCls = "bg-indigo-600 text-white border-r border-indigo-500";
    valActiveCls = "bg-indigo-50 text-indigo-700 font-extrabold";
    valEmptyCls = "bg-indigo-50/30 text-slate-300";
  }

  const isTotal = label === "근무인원";

  return (
    <tr className={`${isTotal ? "border-t-2 border-indigo-200" : "border-t border-slate-100"}`}>
      {/* Sticky label cell */}
      <td
        colSpan={4}
        className={`px-4 py-2 sticky left-0 z-20 text-center text-[11px] font-bold tracking-wide shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] ${labelCls}`}
      >
        {label}
      </td>

      {/* Day values */}
      {summaries.map((sum) => {
        const val = sum[metricKeys] as number;
        return (
          <td
            key={sum.day}
            className={`p-1.5 text-center text-xs border-r border-slate-100 min-w-[36px] transition-colors ${
              val > 0 ? valActiveCls : valEmptyCls
            }`}
          >
            {val > 0 ? val : <span className="opacity-30">·</span>}
          </td>
        );
      })}
    </tr>
  );
};
