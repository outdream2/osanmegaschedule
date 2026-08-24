// src/components/ContractWriterPage/WageCard.tsx
// 카드 3 · 임금 계산 · T-V

import React from "react";
import { Money, Warning, CaretDown } from "@phosphor-icons/react";
import type { ContractForm, CardKey } from "./types";
import { INSURANCE_RATES } from "./constants";
import {
  WAGE_HOURS, WAGE_DIVISOR,
  computeIncomeTax, isMonthlyWageType, fmtWon,
} from "./wageCalc";
import { IconTile } from "../common/IconTile";
import { Card } from "../common/Card";
import { MIN_WAGE_2026 } from "../../lib/payroll";
import type { WithholdingRate } from "../../lib/payroll";
import { WITHHOLDING_RATES } from "../../lib/payroll";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface WageCardProps {
  form: ContractForm;
  setForm: React.Dispatch<React.SetStateAction<ContractForm>>;

  toggleCard: (key: CardKey) => void;
  isCardCollapsed: (key: CardKey) => boolean;

  weeklyWeekdayDays: number;
  weeklyWeekendDays: number;
  monthlyCalc: { dailyMinutes: number; monthlyHoursInt: number; monthlyMinutesRem: number } | null;

  wageHourlyOverride: number | null;
  setWageHourlyOverride: (v: number | null) => void;
  dependentsCount: number;
  setDependentsCount: (v: number) => void;
  withholdingRate: WithholdingRate;
  setWithholdingRate: (v: WithholdingRate) => void;
  childrenCount: number;
  setChildrenCount: (v: number) => void;
  extraDeduction: number;
  setExtraDeduction: (v: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

export const WageCard: React.FC<WageCardProps> = ({
  form, setForm,
  toggleCard, isCardCollapsed,
  weeklyWeekdayDays, weeklyWeekendDays,
  monthlyCalc,
  wageHourlyOverride, setWageHourlyOverride,
  dependentsCount, setDependentsCount,
  withholdingRate, setWithholdingRate,
  childrenCount, setChildrenCount,
  extraDeduction, setExtraDeduction,
}) => (
  <Card borderColor="border-emerald-200" padding="sm" topAccent className="flex flex-col gap-3">
    <div className="flex items-center gap-2 pb-2 border-b border-emerald-100">
      <button
        type="button"
        onClick={() => toggleCard("wage")}
        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity text-left"
        aria-expanded={!isCardCollapsed("wage")}
      >
        <CaretDown size={11} weight="bold" className={`text-zinc-400 transition-transform shrink-0 ${isCardCollapsed("wage") ? "-rotate-90" : ""}`} />
        <IconTile icon={<Money size={13} weight="fill" />} tone="emerald" size="sm" />
        <span className="text-[14px] font-bold text-zinc-700">임금구성표 산출</span>
      </button>
    </div>

    {!isCardCollapsed("wage") && (
      <WageCardBody
        form={form}
        setForm={setForm}
        weeklyWeekdayDays={weeklyWeekdayDays}
        weeklyWeekendDays={weeklyWeekendDays}
        monthlyCalc={monthlyCalc}
        wageHourlyOverride={wageHourlyOverride}
        setWageHourlyOverride={setWageHourlyOverride}
        dependentsCount={dependentsCount}
        setDependentsCount={setDependentsCount}
        withholdingRate={withholdingRate}
        setWithholdingRate={setWithholdingRate}
        childrenCount={childrenCount}
        setChildrenCount={setChildrenCount}
        extraDeduction={extraDeduction}
        setExtraDeduction={setExtraDeduction}
      />
    )}
  </Card>
);

// ─────────────────────────────────────────────────────────────────────────────
// WageCardBody · expanded 상태에서만 렌더
// ─────────────────────────────────────────────────────────────────────────────

interface WageCardBodyProps extends Omit<WageCardProps, "toggleCard" | "isCardCollapsed"> {}

const WageCardBody: React.FC<WageCardBodyProps> = ({
  form, setForm,
  weeklyWeekdayDays, weeklyWeekendDays,
  monthlyCalc,
  wageHourlyOverride, setWageHourlyOverride,
  dependentsCount, setDependentsCount,
  withholdingRate, setWithholdingRate,
  childrenCount, setChildrenCount,
  extraDeduction, setExtraDeduction,
}) => {
  const tdItem = "px-3 py-2 text-zinc-800 font-bold align-top";
  const tdMid  = "px-3 py-2 text-zinc-500 text-[15px] align-top";
  const tdAmt  = "px-3 py-2 text-right tabular-nums font-bold text-zinc-900 align-top whitespace-nowrap";

  const dailyH = monthlyCalc ? monthlyCalc.dailyMinutes / 60 : 0;
  const wd = Number(form.weekdayHourly) || 0;
  const we = Number(form.weekendHourly) || wd;
  const wdH = dailyH * weeklyWeekdayDays;
  const weH = dailyH * weeklyWeekendDays;
  const weeklyPay = Math.round(wdH * wd + weH * we);
  const autoMonthlyNet = Math.round(weeklyPay * 4.345);
  const weeklyH = wdH + weH;
  const isMonthly = isMonthlyWageType(form.contractType);
  const hasDual = weeklyWeekendDays > 0 && we !== wd;

  // 최저임금 경고
  const wdRaw = Number(form.weekdayHourly);
  const wdCheck = Number.isFinite(wdRaw) && wdRaw > 0 ? wdRaw : 0;

  // 자동 역산 시급
  const autoHourly = (() => {
    const target = autoMonthlyNet;
    if (target <= 0) return Math.round(wd * 10) / 10;
    const extrasAuto = (Number(form.wageComponents.fixedHolidayOvertime?.amount) || 0)
                     + (Number(form.wageComponents.fixedNight?.amount) || 0)
                     + (Number(form.wageComponents.mealAllowance) || 0)
                     + (Number(form.wageComponents.vehicleAllowance) || 0);
    let h = wd > 0 ? wd : 25000;
    for (let i = 0; i < 12; i++) {
      const basic = h * WAGE_HOURS.BASIC;
      const g = h * WAGE_DIVISOR + extrasAuto;
      const p  = basic * INSURANCE_RATES.PENSION;
      const hh = basic * INSURANCE_RATES.HEALTH;
      const lt = hh * INSURANCE_RATES.LTC_RATIO;
      const em = basic * INSURANCE_RATES.EMPLOYMENT;
      const insSumH = p + hh + lt + em;
      const tx = computeIncomeTax(Math.round(basic), dependentsCount, withholdingRate, childrenCount, extraDeduction);
      const dedH = insSumH + tx.total;
      const net = g - dedH;
      const delta = target - net;
      if (Math.abs(delta) < 50) break;
      h += delta / WAGE_DIVISOR * 0.85;
      if (h < 0) h = 0;
    }
    return Math.round(h * 10) / 10;
  })();

  const hourly = wageHourlyOverride != null && wageHourlyOverride > 0
    ? Math.round(wageHourlyOverride * 10) / 10
    : autoHourly;

  const applyHopeMatch = () => {
    const target = autoMonthlyNet;
    if (target <= 0) return;
    const extras0 = (Number(form.wageComponents.fixedHolidayOvertime?.amount) || 0)
                  + (Number(form.wageComponents.fixedNight?.amount) || 0)
                  + (Number(form.wageComponents.mealAllowance) || 0)
                  + (Number(form.wageComponents.vehicleAllowance) || 0);
    let h = wd > 0 ? wd : 25000;
    for (let i = 0; i < 12; i++) {
      const basic = h * WAGE_HOURS.BASIC;
      const g = h * WAGE_DIVISOR + extras0;
      const p  = basic * INSURANCE_RATES.PENSION;
      const hh = basic * INSURANCE_RATES.HEALTH;
      const lt = hh * INSURANCE_RATES.LTC_RATIO;
      const em = basic * INSURANCE_RATES.EMPLOYMENT;
      const insSumH = p + hh + lt + em;
      const tx = computeIncomeTax(Math.round(basic), dependentsCount, withholdingRate, childrenCount, extraDeduction);
      const dedH = insSumH + tx.total;
      const net = g - dedH;
      const delta = target - net;
      if (Math.abs(delta) < 50) break;
      h += delta / WAGE_DIVISOR;
      if (h < 0) h = 0;
    }
    setWageHourlyOverride(Math.round(h * 10) / 10);
  };

  const setMeal = (v: number) => setForm(prev => ({
    ...prev,
    wageComponents: { ...prev.wageComponents, mealAllowance: Math.max(0, v) },
  }));
  const setVehicle = (v: number) => setForm(prev => ({
    ...prev,
    wageComponents: { ...prev.wageComponents, vehicleAllowance: Math.max(0, v) },
  }));

  const meal = Number(form.wageComponents.mealAllowance) || 0;
  const vehicle = Number(form.wageComponents.vehicleAllowance) || 0;
  const mealChecked = meal > 0;
  const vehicleChecked = vehicle > 0;

  const holidayOtHours = Number(form.wageComponents.fixedHolidayOvertime?.hours) || 0;
  const holidayOtMins  = Number(form.wageComponents.fixedHolidayOvertime?.minutes) || 0;
  const holidayOtAmt   = Number(form.wageComponents.fixedHolidayOvertime?.amount) || 0;
  const nightHours     = Number(form.wageComponents.fixedNight?.hours) || 0;
  const nightMins      = Number(form.wageComponents.fixedNight?.minutes) || 0;
  const nightAmt       = Number(form.wageComponents.fixedNight?.amount) || 0;

  const basicAmt    = Math.round(hourly * WAGE_HOURS.BASIC);
  const overtimeAmt = Math.round(hourly * WAGE_HOURS.OVERTIME);
  const holidayAmt  = Math.round(hourly * WAGE_HOURS.HOLIDAY);
  const annualAmt   = Math.round(hourly * WAGE_HOURS.ANNUAL_LEAVE);
  const gross       = basicAmt + overtimeAmt + holidayAmt + annualAmt;
  const autoSum     = gross;

  const pension = Math.round(basicAmt * INSURANCE_RATES.PENSION);
  const health  = Math.round(basicAmt * INSURANCE_RATES.HEALTH);
  const ltc     = Math.round(health * INSURANCE_RATES.LTC_RATIO);
  const emp     = Math.round(basicAmt * INSURANCE_RATES.EMPLOYMENT);
  const insSum  = pension + health + ltc + emp;
  const taxObj  = computeIncomeTax(basicAmt, dependentsCount, withholdingRate, childrenCount, extraDeduction);
  const taxSum  = taxObj.total;
  const deductionTotal = insSum + taxSum;
  const deductionPct = basicAmt > 0 ? (deductionTotal / basicAmt * 100) : 0;
  const grossTotal = gross + holidayOtAmt + nightAmt + meal + vehicle;
  const monthlyNet = Math.max(0, grossTotal - deductionTotal);

  return (
    <>
      {/* 최저임금 경고 */}
      {wdCheck > 0 && wdCheck < MIN_WAGE_2026 && (
        <div className="rounded-md bg-rose-50 border border-rose-300 px-2 py-1.5 flex items-center gap-1.5">
          <Warning size={12} weight="fill" className="text-rose-600 shrink-0" />
          <span className="text-[10.5px] font-bold text-rose-700">
            최저임금 위반 위험 · 통상시급 <span className="tabular-nums">{fmtWon(wdCheck)}</span> 원 &lt; 2026 최저 <span className="tabular-nums">{fmtWon(MIN_WAGE_2026)}</span> 원
          </span>
        </div>
      )}

      {/* 임금구성표 */}
      {hourly <= 0 ? (
        <div className="rounded-lg border border-line bg-zinc-50 px-3 py-4 text-center text-[15px] text-zinc-500 font-semibold">
          시급 입력 시 · 임금구성표 자동 산출
        </div>
      ) : (
        <Card variant="flat" rounded="lg" padding="none" clip className="flex flex-col">
          {/* 근무조건 산식 헤더 */}
          <div className="px-4 py-2 bg-indigo-50/40 border-b border-indigo-100 flex items-baseline flex-wrap gap-x-1.5 text-[15px]">
            {form.employeeCategory && (() => {
              const cat = form.employeeCategory;
              const cls =
                cat === "약사"  ? "bg-violet-500 text-white" :
                cat === "매장"  ? "bg-emerald-500 text-white" :
                cat === "창고"  ? "bg-orange-500 text-white" :
                                  "bg-zinc-600 text-white";
              return (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold ${cls}`}>
                  {cat}
                </span>
              );
            })()}
            <span className="font-bold text-indigo-900">주 {weeklyH.toFixed(1)}시간</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[15px] font-bold uppercase tracking-wide ${isMonthly ? "bg-indigo-200 text-indigo-800" : "bg-amber-200 text-amber-800"}`}>
              {isMonthly ? "월급제" : "시급제"}
            </span>
            {autoMonthlyNet > 0 && (
              <>
                {hasDual ? (
                  <>
                    <span className="text-zinc-500 text-[14px] ml-1">주중</span>
                    <span className="tabular-nums font-bold text-zinc-700">{fmtWon(wd)}원</span>
                    <span className="text-zinc-400">×</span>
                    <span className="tabular-nums text-zinc-600">{wdH.toFixed(1)}h</span>
                    <span className="text-zinc-400">+</span>
                    <span className="text-zinc-500 text-[14px]">주말</span>
                    <span className="tabular-nums font-bold text-zinc-700">{fmtWon(we)}원</span>
                    <span className="text-zinc-400">×</span>
                    <span className="tabular-nums text-zinc-600">{weH.toFixed(1)}h</span>
                  </>
                ) : (
                  <>
                    <span className="text-zinc-500 text-[14px] ml-1">시급</span>
                    <span className="tabular-nums font-bold text-zinc-700">{fmtWon(wd)}원</span>
                    <span className="text-zinc-400">×</span>
                    <span className="tabular-nums text-zinc-600">{weeklyH.toFixed(1)}h</span>
                  </>
                )}
                <span className="text-zinc-400">×</span>
                <span className="text-zinc-600">4.345</span>
                <span className="text-zinc-400">=</span>
                <span className="tabular-nums font-bold text-emerald-700">{fmtWon(autoMonthlyNet)}원</span>
                <span className="text-[9.5px] text-zinc-400 bg-emerald-100 px-1 rounded">(희망 월 수령액)</span>
              </>
            )}
          </div>

          {/* 통상시급 입력 헤더 */}
          <div className="px-4 py-2.5 bg-zinc-50/60 border-b border-line flex flex-col gap-1">
            <div className="flex items-baseline flex-wrap gap-x-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">통상시급</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={hourly}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setWageHourlyOverride(Number.isFinite(v) && v > 0 ? v : null);
                }}
                className="w-24 tabular-nums bg-white border border-zinc-300 rounded px-1.5 py-0.5 text-[15px] font-bold text-zinc-900 text-right focus:outline-none focus:border-brand-deep"
              />
              <span className="text-zinc-500 text-[15px]">원</span>
              {autoMonthlyNet > 0 && (
                <button
                  type="button"
                  onClick={applyHopeMatch}
                  className="text-[14px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-bold cursor-pointer"
                  title={`근무조건 희망월수령액 ${fmtWon(autoMonthlyNet)}원을 세후로 맞추는 통상시급으로 자동 조정`}
                >
                  희망 맞춤
                </button>
              )}
              {wageHourlyOverride != null && (
                <button
                  type="button"
                  onClick={() => setWageHourlyOverride(null)}
                  className="text-[14px] text-indigo-500 hover:text-indigo-700 hover:underline cursor-pointer"
                  title={`자동 (주중시급 ${fmtWon(autoHourly)}원)`}
                >
                  자동
                </button>
              )}
              <span className="text-zinc-400 text-[10.5px]">→ 기본급</span>
              <span className="tabular-nums font-bold text-zinc-700 text-[11.5px]">{fmtWon(basicAmt)}원</span>
              <span className="text-zinc-400 text-[14px]">(× {WAGE_HOURS.BASIC}h)</span>
              <span className="ml-auto text-zinc-500 text-[10.5px]">
                세전 <span className="tabular-nums font-bold text-zinc-800">{fmtWon(gross)}원</span>
                <span className="text-zinc-400"> (× {WAGE_DIVISOR.toFixed(2)}h)</span>
              </span>
            </div>
            <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 text-[14px] text-zinc-400 font-semibold">
              <span>참고 · 약사 주중 근무 시 통상시급 예시 <span className="tabular-nums font-bold text-zinc-500">22,350.8</span>원 (기본급 4,671,298원 ÷ 209h)</span>
              <span className="ml-auto flex items-baseline gap-x-1.5">
                <span className="text-zinc-500">부양</span>
                <input
                  type="number"
                  min={1} max={10} step={1}
                  value={dependentsCount}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setDependentsCount(Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1);
                  }}
                  className="w-12 tabular-nums bg-white border border-zinc-300 rounded px-1.5 py-0.5 text-[15px] font-bold text-zinc-800 text-right focus:outline-none focus:border-brand-deep"
                />
                <span className="text-zinc-500">인</span>
              </span>
              <span className="flex items-baseline gap-x-1.5">
                <span className="text-zinc-500">자녀</span>
                <input
                  type="number"
                  min={0} max={10} step={1}
                  value={childrenCount}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setChildrenCount(Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
                  }}
                  className="w-12 tabular-nums bg-white border border-zinc-300 rounded px-1.5 py-0.5 text-[15px] font-bold text-zinc-800 text-right focus:outline-none focus:border-brand-deep"
                  title="자녀 세액공제 · 8~20세 자녀"
                />
                <span className="text-zinc-500">인</span>
              </span>
              <span className="flex items-baseline gap-x-1.5">
                <span className="text-zinc-500">원천징수</span>
                <select
                  value={withholdingRate}
                  onChange={(e) => setWithholdingRate(Number(e.target.value) as WithholdingRate)}
                  className="tabular-nums bg-white border border-zinc-300 rounded px-1.5 py-0.5 text-[15px] font-bold text-zinc-800 focus:outline-none focus:border-brand-deep cursor-pointer"
                  title="근로자 선택 · 80%: 매달 적게(연말 추납) · 100%: 표준 · 120%: 매달 많이(연말 환급)"
                >
                  {WITHHOLDING_RATES.map(r => (
                    <option key={r} value={r}>{Math.round(r * 100)}%</option>
                  ))}
                </select>
              </span>
              <span className="flex items-baseline gap-x-1.5">
                <span className="text-zinc-500">공제항목</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={extraDeduction ? extraDeduction.toLocaleString("ko-KR") : ""}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(/[^0-9]/g, "")) || 0;
                    setExtraDeduction(Math.max(0, v));
                  }}
                  placeholder="0"
                  className="w-20 tabular-nums bg-white border border-zinc-300 rounded px-1.5 py-0.5 text-[15px] font-bold text-zinc-800 text-right focus:outline-none focus:border-brand-deep"
                  title="추가 공제항목 · 소득세 과세대상 M에서 차감"
                />
                <span className="text-zinc-500">원</span>
              </span>
            </div>
          </div>

          {/* 임금구성표 · 8항목 */}
          <table className="w-full text-[11.5px]">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-1.5 text-left font-bold w-[36%]">구성 항목</th>
                <th className="px-3 py-1.5 text-left font-bold">내용</th>
                <th className="px-3 py-1.5 text-right font-bold w-[22%]">금액</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-zinc-100">
                <td className={tdItem}>기본급 <span className="text-zinc-400 font-normal text-[10.5px]">(주휴수당 포함)</span></td>
                <td className={tdMid}>월평균 {WAGE_HOURS.BASIC.toFixed(2)} 시간</td>
                <td className={tdAmt}>{fmtWon(basicAmt)}원</td>
              </tr>
              <tr className="border-t border-zinc-100">
                <td className={tdItem}>(고정)연장근로수당 <span className="text-zinc-400 font-normal text-[10.5px]">(1.5배 가산 포함)</span></td>
                <td className={tdMid}>월평균 {WAGE_HOURS.OVERTIME.toFixed(2)} 시간 <span className="text-zinc-400">· 실 37.29h × 1.5</span></td>
                <td className={tdAmt}>{fmtWon(overtimeAmt)}원</td>
              </tr>
              <tr className="border-t border-zinc-100">
                <td className={tdItem}>(고정)휴일근로수당 <span className="text-zinc-400 font-normal text-[10.5px]">(1.5배 가산 포함)</span></td>
                <td className={tdMid}>월평균 {WAGE_HOURS.HOLIDAY.toFixed(2)} 시간 <span className="text-zinc-400">· 실 14.67h × 1.5</span></td>
                <td className={tdAmt}>{fmtWon(holidayAmt)}원</td>
              </tr>
              <tr className="border-t border-zinc-100">
                <td className={tdItem}>(고정)휴일연장근로수당 <span className="text-zinc-400 font-normal text-[10.5px]">(0.5배 가산 포함)</span></td>
                <td className={tdMid}>월평균 {holidayOtHours} 시간 {holidayOtMins} 분</td>
                <td className={tdAmt}>{holidayOtAmt > 0 ? `${fmtWon(holidayOtAmt)}원` : "-"}</td>
              </tr>
              <tr className="border-t border-zinc-100">
                <td className={tdItem}>(고정)야간근로수당 <span className="text-zinc-400 font-normal text-[10.5px]">(0.5배 가산 포함)</span></td>
                <td className={tdMid}>월평균 {nightHours} 시간 {nightMins} 분</td>
                <td className={tdAmt}>{nightAmt > 0 ? `${fmtWon(nightAmt)}원` : "-"}</td>
              </tr>
              <tr className="border-t border-zinc-100">
                <td className={tdItem}>(고정)연차휴가수당</td>
                <td className={tdMid}>월평균 {WAGE_HOURS.ANNUAL_LEAVE.toFixed(2)} 시간</td>
                <td className={tdAmt}>{fmtWon(annualAmt)}원</td>
              </tr>
              {/* 식대 */}
              <tr className="border-t border-zinc-100">
                <td className={tdItem}>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={mealChecked}
                      onChange={(e) => setMeal(e.target.checked ? (meal > 0 ? meal : 200_000) : 0)}
                      className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                    />
                    <span>식대 <span className="text-zinc-400 font-normal text-[10.5px]">(비과세)</span></span>
                  </label>
                </td>
                <td className={tdMid}>
                  {mealChecked ? (
                    <span className="inline-flex items-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={meal ? meal.toLocaleString("ko-KR") : ""}
                        onChange={(e) => setMeal(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                        className="w-24 bg-white border border-line rounded px-2 py-0.5 text-right text-[15px] font-bold text-zinc-800 focus:outline-none focus:border-brand-deep"
                      />
                      <span className="ml-1 text-zinc-400 text-[10.5px]">원</span>
                    </span>
                  ) : (
                    <span className="text-zinc-400">해당자에 한함</span>
                  )}
                </td>
                <td className={tdAmt}>{mealChecked ? `${fmtWon(meal)}원` : "-"}</td>
              </tr>
              {/* 차량유지비 */}
              <tr className="border-t border-zinc-100">
                <td className={tdItem}>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={vehicleChecked}
                      onChange={(e) => setVehicle(e.target.checked ? (vehicle > 0 ? vehicle : 200_000) : 0)}
                      className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                    />
                    <span>차량유지비 <span className="text-zinc-400 font-normal text-[10.5px]">(비과세)</span></span>
                  </label>
                </td>
                <td className={tdMid}>
                  {vehicleChecked ? (
                    <span className="inline-flex items-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={vehicle ? vehicle.toLocaleString("ko-KR") : ""}
                        onChange={(e) => setVehicle(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                        className="w-24 bg-white border border-line rounded px-2 py-0.5 text-right text-[15px] font-bold text-zinc-800 focus:outline-none focus:border-brand-deep"
                      />
                      <span className="ml-1 text-zinc-400 text-[10.5px]">원</span>
                    </span>
                  ) : (
                    <span className="text-zinc-400">해당자에 한함</span>
                  )}
                </td>
                <td className={tdAmt}>{vehicleChecked ? `${fmtWon(vehicle)}원` : "-"}</td>
              </tr>
              {/* 월급여총액 */}
              <tr className="border-t-2 border-zinc-300 bg-zinc-50">
                <td className="px-3 py-2 text-zinc-800 font-bold text-[12.5px]">
                  월급여총액 <span className="text-zinc-500 font-bold text-[10.5px]">(세전)</span>
                </td>
                <td className="px-3 py-2 text-[10.5px] text-zinc-500 font-semibold">
                  기본 4항목 {fmtWon(autoSum)}
                  {(holidayOtAmt + nightAmt + meal + vehicle) > 0 && ` + 선택 ${fmtWon(holidayOtAmt + nightAmt + meal + vehicle)}`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-zinc-900 text-[15px] whitespace-nowrap">
                  {fmtWon(grossTotal)}원
                </td>
              </tr>
            </tbody>
          </table>

          {/* 예상공제액 접기 */}
          <details className="border-t border-line bg-rose-50/30 group">
            <summary className="px-3 py-2 flex items-baseline gap-x-2 cursor-pointer hover:bg-rose-50/60 list-none select-none">
              <span className="text-zinc-400 text-[14px] transition-transform group-open:rotate-90 inline-block">▶</span>
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-rose-700">− 예상공제액</span>
              <span className="text-[10.5px] text-zinc-500">기본급 {fmtWon(basicAmt)}원 기준 · 실효 {deductionPct.toFixed(1)}%</span>
              <span className="tabular-nums font-bold text-rose-700 ml-auto text-[14px]">−{fmtWon(deductionTotal)}원</span>
            </summary>
            <div className="px-3 pb-2.5 flex flex-col gap-1">
              {[
                { label: "국민연금", rate: `${(INSURANCE_RATES.PENSION * 100).toFixed(2)}%`, desc: "노후 소득 보장 · 근로자 부담분", amt: pension },
                { label: "건강보험", rate: `${(INSURANCE_RATES.HEALTH * 100).toFixed(3)}%`, desc: "질병·부상 진료 급여 · 근로자 부담분", amt: health },
                { label: "장기요양", rate: `건강 × ${(INSURANCE_RATES.LTC_RATIO * 100).toFixed(2)}%`, desc: "노인장기요양 · 건강보험료의 12.95%", amt: ltc },
                { label: "고용보험", rate: `${(INSURANCE_RATES.EMPLOYMENT * 100).toFixed(2)}%`, desc: "실업급여 재원 · 근로자 부담분", amt: emp },
              ].map(row => (
                <div key={row.label} className="pt-1.5 border-t border-rose-100/60 flex items-baseline gap-x-2 flex-wrap">
                  <span className="text-zinc-700 font-bold text-[11.5px] min-w-[74px]">{row.label}</span>
                  <span className="tabular-nums text-zinc-500 text-[15px] min-w-[110px]">{row.rate}</span>
                  <span className="text-[14px] text-zinc-400 font-medium leading-snug flex-1 min-w-[160px]">{row.desc}</span>
                  <span className="tabular-nums text-zinc-600 text-[11.5px] ml-auto whitespace-nowrap">≈ {fmtWon(row.amt)}원</span>
                </div>
              ))}
              <div className="pt-1.5 border-t border-rose-100/60 flex items-baseline gap-x-2 flex-wrap">
                <span className="text-zinc-700 font-bold text-[11.5px] min-w-[74px]">근로소득세</span>
                <span className="tabular-nums text-zinc-500 text-[15px] min-w-[110px]">간이세액표 7단계</span>
                <span className="text-[14px] text-zinc-400 font-medium leading-snug flex-1 min-w-[160px]">
                  국세청 공식 · 부양 {dependentsCount}인 (인적공제 {dependentsCount * 150}만원){childrenCount > 0 ? ` · 자녀 ${childrenCount}인` : ""} · 원천징수 {Math.round(withholdingRate * 100)}%
                </span>
                <span className="tabular-nums text-zinc-600 text-[11.5px] ml-auto whitespace-nowrap">≈ {fmtWon(taxObj.incomeTax)}원</span>
              </div>
              <div className="pt-1.5 border-t border-rose-100/60 flex items-baseline gap-x-2 flex-wrap">
                <span className="text-zinc-700 font-bold text-[11.5px] min-w-[74px]">지방소득세</span>
                <span className="tabular-nums text-zinc-500 text-[15px] min-w-[110px]">소득세 × 10%</span>
                <span className="text-[14px] text-zinc-400 font-medium leading-snug flex-1 min-w-[160px]">지자체 재원 · 근로소득세의 10%</span>
                <span className="tabular-nums text-zinc-600 text-[11.5px] ml-auto whitespace-nowrap">≈ {fmtWon(taxObj.localTax)}원</span>
              </div>
              <div className="flex items-baseline gap-x-2 pt-1.5 border-t border-rose-200">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-rose-700">예상공제 합계</span>
                <span className="text-[10.5px] text-zinc-500">4대보험 {fmtWon(insSum)} + 소득세 {fmtWon(taxSum)}</span>
                <span className="tabular-nums font-bold text-rose-700 ml-auto text-[14px]">−{fmtWon(deductionTotal)}원</span>
              </div>
            </div>
          </details>

          {/* 예상 실수령 */}
          <div className="px-3 py-2 bg-emerald-50/60 border-t border-emerald-200 flex items-baseline flex-wrap gap-x-2 gap-y-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700">예상 실수령 (세후)</span>
            <span className="text-[10.5px] text-emerald-600 font-semibold">세전 {fmtWon(grossTotal)} − 예상공제 {fmtWon(deductionTotal)}</span>
            {autoMonthlyNet > 0 && (() => {
              const diff = monthlyNet - autoMonthlyNet;
              const absDiff = Math.abs(diff);
              const near = absDiff < 1000;
              const cls = near ? "text-emerald-500" : (diff > 0 ? "text-indigo-500" : "text-amber-600");
              return (
                <span className={`text-[14px] font-bold ${cls}`} title={`희망월수령액 ${fmtWon(autoMonthlyNet)}원 대비`}>
                  희망 대비 {diff > 0 ? "+" : diff < 0 ? "−" : "="}{fmtWon(absDiff)}원 {near && "✓"}
                </span>
              );
            })()}
            <span className="tabular-nums font-bold text-emerald-800 ml-auto text-[15px] whitespace-nowrap">{fmtWon(monthlyNet)}원</span>
          </div>
        </Card>
      )}
    </>
  );
};
