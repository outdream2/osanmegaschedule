// src/components/SummaryRow.tsx
import React from "react";
import { MonthlySummary } from "../../types";

interface SummaryRowProps {
  summaries: MonthlySummary[];
  // 2026-08-31 · #50 · 물류/창고 신규 · 필터별 표시
  label: "약사" | "사원" | "기타" | "물류" | "창고" | "근무인원";
  totalCell?: React.ReactNode; // kept for backward compat, no longer rendered
  showMonthTotal?: boolean;    // 월별 합계 열 표시 여부 (기본 true)
}

export const SummaryRow: React.FC<SummaryRowProps> = ({ summaries, label, showMonthTotal = true }) => {
  const isPharmacist = label === "약사";
  const isStaff = label === "사원";
  const isOther = label === "기타";
  const isLogistics = label === "물류";
  const isWarehouse = label === "창고";
  const isTotal = label === "근무인원";

  // 색상 팔레트: emerald(약사) · slate(사원/기타) · sky(물류) · amber(창고) · indigo(총계)
  const labelCls = isPharmacist
    ? "bg-emerald-600 text-white border-r border-emerald-500"
    : isStaff
    ? "bg-zinc-600 text-white border-r border-zinc-500"
    : isOther
    ? "bg-zinc-400 text-white border-r border-zinc-300"
    : isLogistics
    ? "bg-sky-600 text-white border-r border-sky-500"
    : isWarehouse
    ? "bg-amber-600 text-white border-r border-amber-500"
    : "bg-brand-deep text-white border-r border-indigo-500";

  const valActiveCls = isPharmacist
    ? "bg-emerald-50 text-emerald-700 font-bold"
    : isStaff
    ? "bg-zinc-50 text-zinc-700 font-bold"
    : isOther
    ? "bg-zinc-50/70 text-zinc-600 font-bold"
    : isLogistics
    ? "bg-sky-50 text-sky-700 font-bold"
    : isWarehouse
    ? "bg-amber-50 text-amber-700 font-bold"
    : "bg-indigo-50 text-indigo-700 font-bold";

  const valEmptyCls = "bg-transparent text-zinc-200";

  const monthTotalCls = isPharmacist
    ? "bg-emerald-50 text-emerald-700 border-l-2 border-line"
    : isStaff
    ? "bg-zinc-100 text-zinc-600 border-l-2 border-line"
    : isOther
    ? "bg-zinc-50 text-zinc-500 border-l-2 border-line"
    : isLogistics
    ? "bg-sky-50 text-sky-700 border-l-2 border-line"
    : isWarehouse
    ? "bg-amber-50 text-amber-700 border-l-2 border-line"
    : "bg-indigo-50 text-indigo-700 border-l-2 border-line";

  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  })();

  const getVal = (sum: MonthlySummary) =>
    isPharmacist ? sum.pharmacistCount
    : isStaff ? sum.staffCount
    : isOther ? sum.otherCount
    : isLogistics ? sum.logisticsCount
    : isWarehouse ? sum.warehouseCount
    : sum.totalCount;

  return (
    <tr className={isTotal ? "border-t-2 border-line" : "border-t border-zinc-100/70"}>
      <td className={`px-2 py-1.5 sticky left-0 z-20 text-center text-[15px] font-semibold tracking-wide shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] ${labelCls}`}>
        {label}
      </td>

      {summaries.map((sum, idx) => {
        const val = getVal(sum);
        const isToday = sum.date === todayStr;
        const nextSum = summaries[idx + 1];
        const isMonthEnd = !nextSum || nextSum.date.substring(0, 7) !== sum.date.substring(0, 7);

        const cell = (
          <td
            className={`p-1 text-center text-[13px] border-r border-zinc-100 w-[30px] sm:w-[44px] transition-colors ${
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
            <td className={`p-1 text-center text-[12px] font-semibold ${monthTotalCls}`}>
              {monthTotal > 0 ? `${monthTotal}인` : <span className="opacity-30">-</span>}
            </td>
          </React.Fragment>
        );
      })}
    </tr>
  );
};
