// src/components/SummaryRow.tsx
import React from "react";
import { MonthlySummary } from "../types";

interface SummaryRowProps {
  summaries: MonthlySummary[];
  label: "오픈" | "미들" | "마감" | "근무인원";
}

export const SummaryRow: React.FC<SummaryRowProps> = ({ summaries, label }) => {
  // Select which metric to display and style accordingly
  let metricKeys: keyof MonthlySummary;
  let labelBg = "";
  let valBg = "";
  let textStyle = "";

  if (label === "오픈") {
    metricKeys = "openCount";
    labelBg = "bg-amber-50 text-amber-900 border-amber-200";
    valBg = "bg-amber-50 text-amber-800 font-bold border-amber-100";
    textStyle = "font-semibold";
  } else if (label === "미들") {
    metricKeys = "middleCount";
    labelBg = "bg-sky-50 text-sky-900 border-sky-200";
    valBg = "bg-sky-50 text-sky-800 font-bold border-sky-100";
    textStyle = "font-semibold";
  } else if (label === "마감") {
    metricKeys = "closeCount";
    labelBg = "bg-emerald-50 text-emerald-900 border-emerald-200";
    valBg = "bg-emerald-50 text-emerald-800 font-bold border-emerald-100";
    textStyle = "font-semibold";
  } else {
    // "근무인원"
    metricKeys = "totalCount";
    labelBg = "bg-indigo-50 text-indigo-900 border-indigo-200";
    valBg = "bg-indigo-50 text-indigo-700 font-black border-indigo-100";
    textStyle = "font-extrabold text-blue-900";
  }

  return (
    <tr className="border-t-2 border-[#e2e8f0]">
      {/* Visual Alignment helper for leftmost columns */}
      <td
        colSpan={4}
        className={`px-4 py-2 sticky left-0 z-20 text-center font-bold text-xs border-r border-[#e2e8f0] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] ${labelBg}`}
      >
        {label}
      </td>

      {/* Renders each daily summary metric across the days in the month */}
      {summaries.map((sum) => {
        const val = sum[metricKeys];
        return (
          <td
            key={sum.day}
            className={`p-1.5 text-center text-xs border-r border-[#e2e8f0] min-w-[55px] ${valBg}`}
          >
            <span className={textStyle}>{val}</span>
          </td>
        );
      })}
    </tr>
  );
};
