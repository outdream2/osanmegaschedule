// src/components/ContractWriterPage/WageCalcModePanel.tsx
// 역산 계산기 (3 모드: 포괄→실수령 · 목표월급→시급 · 실근무시간→월급)

import React, { useMemo, useState } from "react";
import { Calculator } from "@phosphor-icons/react";
import type { ContractForm, WageComponents, CalcMode } from "./types";
import { computeWageFromHourlyDual, computeHourlyFromTarget, computeActualPay, fmtWon } from "./wageCalc";
import { WAGE_DIVISOR } from "./wageCalc";

interface WageCalcModePanelProps {
  form: ContractForm;
  weeklyWeekdayDays: number;
  weeklyWeekendDays: number;
  onApplyToWageComponents: (nextWage: WageComponents) => void;
  onApplyHourly: (weekdayHourly: number, weekendHourly: number) => void;
}

const WageCalcModePanel: React.FC<WageCalcModePanelProps> = ({
  form, weeklyWeekdayDays, weeklyWeekendDays, onApplyToWageComponents, onApplyHourly,
}) => {
  const [mode, setMode] = useState<CalcMode>("forward");
  const [targetTotal, setTargetTotal] = useState<string>("3000000");

  const forwardCalc = useMemo(() => {
    const wd = Number(form.weekdayHourly) || 0;
    const we = Number(form.weekendHourly) || 0;
    return computeWageFromHourlyDual(wd, we, form.wageComponents);
  }, [form.weekdayHourly, form.weekendHourly, form.wageComponents]);

  const targetHourly = useMemo(() => computeHourlyFromTarget(Number(targetTotal) || 0), [targetTotal]);

  const actualCalc = useMemo(() => computeActualPay(
    form.startTime, form.endTime, Number(form.breakMinutes) || 0,
    weeklyWeekdayDays, weeklyWeekendDays,
    Number(form.weekdayHourly) || 0, Number(form.weekendHourly) || 0,
  ), [form.startTime, form.endTime, form.breakMinutes, weeklyWeekdayDays, weeklyWeekendDays, form.weekdayHourly, form.weekendHourly]);

  const applyForwardToWage = () => {
    const c = forwardCalc;
    onApplyToWageComponents({
      ...form.wageComponents,
      basicSalary:          { ...form.wageComponents.basicSalary,          amount: c.basicAmount },
      fixedOvertime:        { ...form.wageComponents.fixedOvertime,        amount: c.overtimeAmount },
      fixedHoliday:         { ...form.wageComponents.fixedHoliday,         amount: c.holidayAmount },
      fixedHolidayOvertime: { ...form.wageComponents.fixedHolidayOvertime, amount: c.holidayOvertimeAmount },
      fixedNight:           { ...form.wageComponents.fixedNight,           amount: c.nightAmount },
      fixedAnnualLeave:     { ...form.wageComponents.fixedAnnualLeave,     amount: c.annualLeaveAmount },
    });
  };

  const applyTargetToHourly = () => {
    onApplyHourly(targetHourly, targetHourly);
  };

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Calculator size={12} weight="fill" className="text-emerald-700" />
        <span className="text-[15px] font-bold text-emerald-800">역산 계산기 (3 모드)</span>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {(["forward", "target", "actual"] as const).map(m => {
          const on = mode === m;
          const label = m === "forward" ? "포괄 → 실수령" : m === "target" ? "목표 월급 → 시급" : "실 근무시간 → 월급";
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-2 py-1 rounded-md border text-[10.5px] font-bold transition-colors cursor-pointer ${
                on ? "bg-emerald-600 text-white border-emerald-700 shadow-sm" : "bg-white text-zinc-600 border-line hover:bg-zinc-50"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {mode === "forward" && (
        <div className="text-[15px] text-zinc-700 leading-relaxed">
          <div>주중시급 <b className="tabular-nums">{fmtWon(form.weekdayHourly)}</b> · 주말시급 <b className="tabular-nums">{fmtWon(form.weekendHourly)}</b></div>
          <div>· 기본급 <b className="tabular-nums">{fmtWon(forwardCalc.basicAmount)}</b></div>
          <div>· 연장수당 <b className="tabular-nums">{fmtWon(forwardCalc.overtimeAmount)}</b></div>
          <div>· 휴일수당 <b className="tabular-nums">{fmtWon(forwardCalc.holidayAmount)}</b></div>
          {forwardCalc.holidayOvertimeAmount > 0 && (
            <div>· 휴일연장수당 <b className="tabular-nums">{fmtWon(forwardCalc.holidayOvertimeAmount)}</b></div>
          )}
          {forwardCalc.nightAmount > 0 && (
            <div>· 야간수당 <b className="tabular-nums">{fmtWon(forwardCalc.nightAmount)}</b></div>
          )}
          <div>· 연차수당 <b className="tabular-nums">{fmtWon(forwardCalc.annualLeaveAmount)}</b></div>
          <div className="mt-1 font-bold text-emerald-800">세전 총액 <span className="tabular-nums">{fmtWon(forwardCalc.total)}</span> 원</div>
          <button
            type="button"
            onClick={applyForwardToWage}
            className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 text-white text-[10.5px] font-bold hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            임금표에 반영
          </button>
        </div>
      )}

      {mode === "target" && (
        <div className="text-[15px] text-zinc-700 leading-relaxed">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0">목표 월급</span>
            <input
              type="text"
              inputMode="numeric"
              value={targetTotal}
              onChange={(e) => setTargetTotal(e.target.value.replace(/[^0-9]/g, ""))}
              className="flex-1 min-w-0 bg-white border border-line rounded px-1.5 py-0.5 text-[14px] text-zinc-800 font-bold text-right focus:outline-none focus:border-brand-deep transition"
            />
            <span className="text-[14px] font-bold">원</span>
          </div>
          <div className="mt-1 font-bold text-emerald-800">
            필요 시급 <span className="tabular-nums">{fmtWon(targetHourly)}</span> 원
            <span className="text-[9.5px] text-zinc-500 font-semibold ml-1">
              (÷{WAGE_DIVISOR.toFixed(2)})
            </span>
          </div>
          <button
            type="button"
            onClick={applyTargetToHourly}
            className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 text-white text-[10.5px] font-bold hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            시급에 반영 (주중/주말 동일)
          </button>
        </div>
      )}

      {mode === "actual" && (
        actualCalc ? (
          <div className="text-[15px] text-zinc-700 leading-relaxed">
            <div>일 근무 <b className="tabular-nums">{actualCalc.dailyHours.toFixed(2)}h</b> · 주중 <b>{weeklyWeekdayDays}일</b> · 주말 <b>{weeklyWeekendDays}일</b></div>
            <div>월 주중근무 <b className="tabular-nums">{actualCalc.weekdayMonthlyHours.toFixed(1)}h</b> × <b className="tabular-nums">{fmtWon(form.weekdayHourly)}</b> = <b className="tabular-nums">{fmtWon(actualCalc.weekdayPay)}</b></div>
            <div>월 주말근무 <b className="tabular-nums">{actualCalc.weekendMonthlyHours.toFixed(1)}h</b> × <b className="tabular-nums">{fmtWon(form.weekendHourly)}</b> = <b className="tabular-nums">{fmtWon(actualCalc.weekendPay)}</b></div>
            <div className="mt-1 font-bold text-emerald-800">실 근무 총액 <span className="tabular-nums">{fmtWon(actualCalc.total)}</span> 원</div>
            <div className="mt-1 text-[9.5px] text-zinc-500 italic">
              * 계산 결과는 참고용입니다. 세후 목표 역산은 상단 "희망 월 세후 수령액" 을 사용하세요.
            </div>
          </div>
        ) : (
          <div className="text-[15px] text-rose-600">근무 시간을 입력하세요.</div>
        )
      )}
    </div>
  );
};

export default WageCalcModePanel;
