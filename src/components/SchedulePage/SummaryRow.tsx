// src/components/SummaryRow.tsx
import React from "react";
import { MonthlySummary } from "../../types";
import { getSummaryLabelClasses, type EmployeeLabel } from "../../lib/scheduleColorScheme";

interface SummaryRowProps {
  summaries: MonthlySummary[];
  // 2026-08-31 · #50 · 물류/창고 신규 · 필터별 표시
  label: EmployeeLabel;
  totalCell?: React.ReactNode; // kept for backward compat, no longer rendered
  showMonthTotal?: boolean;    // 월별 합계 열 표시 여부 (기본 true)
}

export const SummaryRow: React.FC<SummaryRowProps> = ({ summaries, label, showMonthTotal = true }) => {
  const isTotal = label === "근무인원";

  const { label: labelCls, valActive: valActiveCls, monthTotal: monthTotalCls } = getSummaryLabelClasses(label);
  const valEmptyCls = "bg-transparent text-zinc-200";

  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  })();

  const getVal = (sum: MonthlySummary) =>
    label === "약사"    ? sum.pharmacistCount
    : label === "사원"  ? sum.staffCount
    : label === "기타"  ? sum.otherCount
    : label === "물류"  ? sum.logisticsCount
    : label === "창고"  ? sum.warehouseCount
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
            className={`p-1 text-center text-[15px] border-r border-zinc-100 w-[30px] sm:w-[44px] transition-colors ${
              val > 0 ? valActiveCls : valEmptyCls
            } ${isToday ? "shadow-[inset_0_0_0_2px_#ef4444] z-20 relative" : ""}`}
          >
            {val > 0 ? val : <span className="opacity-20 text-[13px]">·</span>}
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
            <td className={`p-1 text-center text-[14px] font-semibold ${monthTotalCls}`}>
              {monthTotal > 0 ? `${monthTotal}인` : <span className="opacity-30">-</span>}
            </td>
          </React.Fragment>
        );
      })}
    </tr>
  );
};
