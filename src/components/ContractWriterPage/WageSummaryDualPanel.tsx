// src/components/ContractWriterPage/WageSummaryDualPanel.tsx
// 포괄 vs 실 근무 산정 좌우 비교 패널

import React, { useMemo } from "react";
import { Calculator } from "@phosphor-icons/react";
import type { ContractForm } from "./types";
import { computeWageTotal, computeActualPay, computeNetPay, fmtWon } from "./wageCalc";

interface WageSummaryDualPanelProps {
  form: ContractForm;
  weeklyWeekdayDays: number;
  weeklyWeekendDays: number;
}

const WageSummaryDualPanel: React.FC<WageSummaryDualPanelProps> = ({
  form, weeklyWeekdayDays, weeklyWeekendDays,
}) => {
  const leftGross = computeWageTotal(form.wageComponents);
  const leftNet = useMemo(() => computeNetPay(leftGross), [leftGross]);

  const actualCalc = useMemo(() => computeActualPay(
    form.startTime, form.endTime, Number(form.breakMinutes) || 0,
    weeklyWeekdayDays, weeklyWeekendDays,
    Number(form.weekdayHourly) || 0, Number(form.weekendHourly) || 0,
  ), [form.startTime, form.endTime, form.breakMinutes, weeklyWeekdayDays, weeklyWeekendDays, form.weekdayHourly, form.weekendHourly]);
  const rightGross = actualCalc?.total ?? 0;
  const rightNet = useMemo(() => computeNetPay(rightGross), [rightGross]);

  const diff = leftNet.net - rightNet.net;
  const diffAbs = Math.abs(diff);
  const diffPct = rightNet.net > 0 ? Math.round((diff / rightNet.net) * 100) : 0;

  const row = (label: string, value: number, bold = false) => (
    <div className={`flex items-center justify-between text-[15px] ${bold ? "font-bold text-zinc-900" : "text-zinc-700"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{fmtWon(value)} 원</span>
    </div>
  );

  return (
    <div className="rounded-lg border border-line bg-white p-2 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Calculator size={12} weight="fill" className="text-indigo-700" />
        <span className="text-[15px] font-bold text-indigo-800">임금 산정 비교 · 포괄 vs 실 근무</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2 flex flex-col gap-0.5">
          <div className="text-[14px] font-bold text-emerald-800 uppercase tracking-wider mb-0.5">
            A. 포괄임금 (계약서 기준)
          </div>
          {row(`기본급 ${form.wageComponents.basicSalary.hours}h`,       form.wageComponents.basicSalary.amount)}
          {row(`연장 ${form.wageComponents.fixedOvertime.hours}h ×1.5`,   form.wageComponents.fixedOvertime.amount)}
          {row(`휴일 ${form.wageComponents.fixedHoliday.hours}h ×1.5`,    form.wageComponents.fixedHoliday.amount)}
          {row(`연차 ${form.wageComponents.fixedAnnualLeave.hours}h`,     form.wageComponents.fixedAnnualLeave.amount)}
          <div className="border-t border-emerald-200 mt-0.5 pt-0.5">
            {row("세전 총액", leftGross, true)}
            {row("- 4대보험", -leftNet.insurance.total)}
            {row("- 소득세 합", -leftNet.tax.total)}
            <div className="border-t border-emerald-300 mt-0.5 pt-0.5">
              {row("실수령 A", leftNet.net, true)}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-2 flex flex-col gap-0.5">
          <div className="text-[14px] font-bold text-indigo-800 uppercase tracking-wider mb-0.5">
            B. 실 근무시간 (약사 실무)
          </div>
          {actualCalc ? (
            <>
              <div className="text-[14px] text-zinc-600">일 <b className="tabular-nums">{actualCalc.dailyHours.toFixed(2)}h</b> · 주중 {weeklyWeekdayDays}일 · 주말 {weeklyWeekendDays}일</div>
              {row(`주중 ${actualCalc.weekdayMonthlyHours.toFixed(1)}h × ${fmtWon(form.weekdayHourly)}`, actualCalc.weekdayPay)}
              {row(`주말 ${actualCalc.weekendMonthlyHours.toFixed(1)}h × ${fmtWon(form.weekendHourly)}`, actualCalc.weekendPay)}
              <div className="border-t border-indigo-200 mt-0.5 pt-0.5">
                {row("세전 총액", rightGross, true)}
                {row("- 4대보험", -rightNet.insurance.total)}
                {row("- 소득세 합", -rightNet.tax.total)}
                <div className="border-t border-indigo-300 mt-0.5 pt-0.5">
                  {row("실수령 B", rightNet.net, true)}
                </div>
              </div>
            </>
          ) : (
            <div className="text-[15px] text-rose-600">근무 시간을 입력하세요.</div>
          )}
        </div>
      </div>

      {actualCalc && rightNet.net > 0 && (
        <div className={`rounded-md border px-2 py-1.5 text-[15px] font-bold ${
          diffAbs < 50000 ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
          diff > 0        ? "border-amber-200 bg-amber-50 text-amber-800" :
                            "border-rose-200 bg-rose-50 text-rose-800"
        }`}>
          {diff === 0 ? "실수령 A = B · 산정 일치" :
           diff > 0    ? `포괄임금이 실 근무 대비 +${fmtWon(diffAbs)} 원 (${diffPct}%) 높음 · 근로자 유리` :
                        `포괄임금이 실 근무 대비 -${fmtWon(diffAbs)} 원 (${Math.abs(diffPct)}%) 낮음 · 계약서 수당 재검토 필요`}
        </div>
      )}
    </div>
  );
};

export default WageSummaryDualPanel;
