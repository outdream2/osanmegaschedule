// src/components/ContractWriterPage/WorkConditionCard.tsx
// 카드 2 · 근무조건 (T-S 통합 · 계약유형 + 근무요일 + 근무시간 + 휴게)

import React from "react";
import {
  ClipboardText, CalendarBlank, ClockClockwise, Coffee, Notepad, CaretDown,
} from "@phosphor-icons/react";
import type { ContractForm, DayKey, CardKey } from "./types";
import {
  DAYS, CONTRACT_TYPES, START_TIMES, END_TIMES, BREAK_TIME_OPTIONS,
} from "./constants";
import { WAGE_HOURS, computeWageFlow, isMonthlyWageType, fmtWon } from "./wageCalc";
import { SelectOrCustom } from "./subcomponents";
import { IconTile } from "../common/IconTile";
import { Card } from "../common/Card";
import { calcWageBase } from "../../lib/wageCalc";
import type { ContractCategory } from "../../lib/contract";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkConditionCardProps {
  form: ContractForm;
  upd: <K extends keyof ContractForm>(key: K, val: ContractForm[K]) => void;

  toggleCard: (key: CardKey) => void;
  isCardCollapsed: (key: CardKey) => boolean;

  weeklyDays: number;
  weeklyWeekdayDays: number;
  weeklyWeekendDays: number;
  toggleDay: (d: DayKey) => void;
  monthlyCalc: { dailyMinutes: number; monthlyHoursInt: number; monthlyMinutesRem: number } | null;

  jobCategories: ContractCategory[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

const fldInput = "w-full bg-white border border-line rounded-lg px-3 py-2 text-[15px] text-zinc-800 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition placeholder:text-zinc-400 placeholder:font-normal";
const fldLabel = "block text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 mb-1";
const cardInner = "rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5 flex flex-col gap-2";
const cardGroupLabel = "text-[14px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5 mb-0.5";

export const WorkConditionCard: React.FC<WorkConditionCardProps> = ({
  form, upd,
  toggleCard, isCardCollapsed,
  weeklyDays, weeklyWeekdayDays, weeklyWeekendDays, toggleDay, monthlyCalc,
  jobCategories,
}) => (
  <Card padding="sm" topAccent className="flex flex-col gap-3">
    <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
      <button
        type="button"
        onClick={() => toggleCard("workCondition")}
        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity text-left"
        aria-expanded={!isCardCollapsed("workCondition")}
      >
        <CaretDown size={11} weight="bold" className={`text-zinc-400 transition-transform shrink-0 ${isCardCollapsed("workCondition") ? "-rotate-90" : ""}`} />
        <IconTile icon={<ClipboardText size={13} weight="fill" />} tone="indigo" size="sm" />
        <span className="text-[14px] font-bold text-zinc-700">근무조건 입력</span>
      </button>
    </div>

    {!isCardCollapsed("workCondition") && (<>

    {/* 0행 · 직군 */}
    <div>
      <label className={fldLabel}>직군</label>
      <div className="flex gap-1">
        {jobCategories.map(cat => {
          const active = form.employeeCategory === cat;
          const activeCls =
            cat === "약사"  ? "bg-violet-500 text-white border-violet-500" :
            cat === "매장"  ? "bg-emerald-500 text-white border-emerald-500" :
            cat === "창고"  ? "bg-orange-500 text-white border-orange-500" :
                              "bg-zinc-600 text-white border-zinc-600";
          return (
            <button key={cat} type="button" onClick={() => upd("employeeCategory", cat)}
              className={`flex-1 min-w-[36px] py-1.5 rounded-lg border text-[11.5px] font-bold transition-colors cursor-pointer ${
                active ? activeCls : "bg-white border-line text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
              }`}
            >{cat}</button>
          );
        })}
      </div>
    </div>

    {/* 1행 · 계약 유형 + 연차 · 근무 요일 */}
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start">
      <div>
        <label className={fldLabel}>계약 유형</label>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SelectOrCustom value={form.contractType} options={CONTRACT_TYPES} onChange={(v) => upd("contractType", v)} placeholder="예: 프리랜서" />
          </div>
          <div className="shrink-0 w-[100px]">
            <div className="relative">
              <input type="number" min={0} value={form.annualLeaveDays} onChange={(e) => upd("annualLeaveDays", e.target.value)}
                placeholder="15"
                title="연차 일수"
                className="w-full bg-white border border-line rounded-lg pl-2 pr-10 py-1.5 text-[15px] text-zinc-800 font-semibold text-right focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition"
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9.5px] text-zinc-400 font-semibold pointer-events-none leading-tight">일/연차</span>
            </div>
          </div>
        </div>
        {form.contractType === "계약직" && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10.5px] text-zinc-400 font-semibold shrink-0">계약 기간</span>
            <div className="flex-1">
              <SelectOrCustom value={form.contractMonths} options={["2", "3", "6", "12"]} onChange={(v) => upd("contractMonths", v)} placeholder="예: 9" suffix="개월" />
            </div>
          </div>
        )}
      </div>

      {/* 근무 요일 */}
      <div>
        <label className={fldLabel}>
          근무 요일 <span className="text-indigo-600 font-bold">주{weeklyDays}일</span>
          <span className="text-zinc-400 font-semibold normal-case tracking-normal ml-1">
            (주중 {weeklyWeekdayDays}일 · 주말 {weeklyWeekendDays}일)
          </span>
        </label>
        <div className="flex flex-wrap gap-1">
          {DAYS.map(d => {
            const on = form.workDays[d];
            const isWeekend = d === "토" || d === "일";
            return (
              <button key={d} type="button" onClick={() => toggleDay(d)}
                className={[
                  "w-7 h-7 rounded-md text-[11.5px] font-bold transition-colors cursor-pointer border",
                  on
                    ? isWeekend
                      ? "bg-rose-500 text-white border-rose-600 shadow-sm"
                      : "bg-brand-deep text-white border-indigo-600 shadow-sm"
                    : "bg-white text-zinc-500 border-line hover:bg-zinc-50 hover:border-zinc-300",
                ].join(" ")}
              >{d}</button>
            );
          })}
        </div>
      </div>
    </div>

    {/* 계약기간·담당업무·보험 */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      <div className={cardInner}>
        <div className="flex items-center justify-between mb-0.5">
          <div className={cardGroupLabel}><CalendarBlank size={10} weight="bold" /> 계약 기간</div>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={form.indefinite} onChange={(e) => upd("indefinite", e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-indigo-600" />
            <span className="text-[15px] font-semibold text-zinc-600">무기한</span>
          </label>
        </div>
        <div className={`grid gap-2 ${form.indefinite ? "grid-cols-2" : "grid-cols-3"}`}>
          <div>
            <label className={fldLabel}>근무 시작일</label>
            <input type="date" value={form.startDate} onChange={(e) => upd("startDate", e.target.value)} className={fldInput} />
          </div>
          <div>
            <label className={fldLabel}>계약 체결일</label>
            <input type="date" value={form.contractSignDate} onChange={(e) => upd("contractSignDate", e.target.value)} className={fldInput} />
          </div>
          {!form.indefinite && (
            <div>
              <label className={fldLabel}>계약 종료일</label>
              <input type="date" value={form.endDate} onChange={(e) => upd("endDate", e.target.value)} className={fldInput} />
            </div>
          )}
        </div>
      </div>
      <div className={cardInner}>
        <div className={cardGroupLabel}>담당업무 · 보험</div>
        <input type="text" value={form.jobDuty} onChange={(e) => upd("jobDuty", e.target.value)}
          placeholder="예: 약국 카운터 · OTC 판매 · 재고 관리" className={fldInput}
        />
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.socialInsurance} onChange={(e) => upd("socialInsurance", e.target.checked)}
            className="w-4 h-4 rounded accent-indigo-600" />
          <span className="text-[14px] font-semibold text-zinc-700">4대보험 가입</span>
          <span className="text-[10.5px] text-zinc-400 font-semibold ml-1">고용·산재·국민연금·건강보험</span>
        </label>
      </div>
    </div>

    {/* 출근·퇴근·휴게 */}
    <div className="flex flex-wrap items-end gap-2 lg:flex-nowrap">
      <div className="flex-1 min-w-[80px]">
        <label className={fldLabel}>
          <ClockClockwise size={10} className="inline mr-0.5 text-emerald-600" />출근
        </label>
        <SelectOrCustom value={form.startTime} options={START_TIMES} onChange={(v) => upd("startTime", v)} placeholder="HH:MM" />
      </div>
      <div className="flex-1 min-w-[80px]">
        <label className={fldLabel}>퇴근</label>
        <SelectOrCustom value={form.endTime} options={END_TIMES} onChange={(v) => upd("endTime", v)} placeholder="HH:MM" />
      </div>
      <div className="flex-1 min-w-[64px] max-w-[80px]">
        <label className={fldLabel}>
          <Coffee size={10} className="inline mr-0.5" />휴게(분)
        </label>
        <div className="relative">
          <input type="number" min={0} value={form.breakMinutes} onChange={(e) => upd("breakMinutes", e.target.value)}
            className="w-full bg-white border border-line rounded-lg pl-2 pr-5 py-1.5 text-[15px] text-zinc-800 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition text-right"
          />
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[14px] text-zinc-400 font-semibold pointer-events-none">분</span>
        </div>
      </div>
      <div className="flex-1 min-w-[80px]">
        <label className={fldLabel}>휴게시작</label>
        <select
          value={form.breakStart}
          onChange={(e) => upd("breakStart", e.target.value)}
          className="w-full bg-white border border-line rounded-lg px-2 py-1.5 text-[15px] text-zinc-700 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition cursor-pointer"
        >
          {BREAK_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="flex-1 min-w-[80px]">
        <label className={fldLabel}>휴게종료</label>
        <select
          value={form.breakEnd}
          onChange={(e) => upd("breakEnd", e.target.value)}
          className="w-full bg-white border border-line rounded-lg px-2 py-1.5 text-[15px] text-zinc-700 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition cursor-pointer"
        >
          {BREAK_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>

    {/* 4행 · 근무조건 자동 계산 힌트 + Bottom-up 역산 미리보기 */}
    {(() => {
      if (!monthlyCalc) return (
        <p className="text-[15px] text-zinc-400 font-semibold text-center pt-0.5">
          근무조건을 입력하면 임금이 자동 계산됩니다
        </p>
      );
      const dailyH = monthlyCalc.dailyMinutes / 60;
      if (dailyH <= 0) return (
        <p className="text-[15px] text-zinc-400 font-semibold text-center pt-0.5">
          근무조건을 입력하면 임금이 자동 계산됩니다
        </p>
      );
      const weeklyH = dailyH * weeklyDays;
      const wdHourly = Number(form.weekdayHourly) || 0;
      const weHourly = Number(form.weekendHourly) || wdHourly;
      const wdH = dailyH * weeklyWeekdayDays;
      const weH = dailyH * weeklyWeekendDays;
      const hasWage = wdHourly > 0;
      const isMonthly = isMonthlyWageType(form.contractType);
      const _annualH = WAGE_HOURS.ANNUAL_LEAVE;
      const _base = (weeklyWeekdayDays > 0)
        ? calcWageBase(dailyH, weeklyWeekdayDays, weeklyWeekendDays)
        : null;
      const _basicH  = _base ? _base.monthlyBasicH          : WAGE_HOURS.BASIC;
      const _otH     = _base ? _base.monthlyOvertimeGainedH  : WAGE_HOURS.OVERTIME;
      const _holH    = _base ? _base.monthlyHolidayGainedH   : WAGE_HOURS.HOLIDAY;
      const wf = hasWage
        ? computeWageFlow(
            form.contractType,
            wdHourly, weHourly,
            wdH, weH,
            _basicH, _otH, _holH, _annualH,
          )
        : null;
      const buMonthlyNet = wf?.monthlyNet ?? 0;
      const hasDual = weeklyWeekendDays > 0 && weHourly !== wdHourly;

      return (
        <div className="flex flex-col gap-1.5">
          {/* T-CTR-Wage-Header-3Lines · 계산식 명시 3행 헤더 · 월급제·시급제 공통 */}
          <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 px-3 py-2 text-[15px] text-indigo-700 leading-relaxed flex flex-col gap-1">
            {/* 행0 · 주 시간 + 계약유형 배지 (항상 표시) */}
            <div className="flex items-center flex-wrap gap-x-1.5">
              <span className="font-bold text-indigo-900">주 {weeklyH.toFixed(1)}시간</span>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[15px] font-bold uppercase tracking-wide ${isMonthly ? "bg-indigo-200 text-indigo-800" : "bg-amber-200 text-amber-800"}`}>
                {isMonthly ? "월급제" : "시급제"}
              </span>
              {!hasWage && (
                <span className="text-indigo-400">(시급 입력 시 계산식 표시)</span>
              )}
            </div>

            {hasWage && (() => {
              // 2026-08-07 · 월급제·시급제 공통 · (시급 × 주시간) × 4.345 = 희망 월 수령액 (한 줄)
              return (
                <div className="flex flex-col gap-0.5 border-t border-indigo-100 pt-1">
                  {/* 1행: (시급 × 주시간 [+주말시급×주말시간]) × 4.345 = 희망 월 수령액 */}
                  <div className="flex items-center flex-wrap gap-x-1">
                    {hasDual ? (
                      <>
                        <span className="text-zinc-500 text-[14px]">주중</span>
                        <span className="tabular-nums font-bold text-zinc-700">{fmtWon(wdHourly)}원</span>
                        <span className="text-zinc-400">×</span>
                        <span className="tabular-nums text-zinc-600">{wdH.toFixed(1)}h</span>
                        <span className="text-zinc-400">+</span>
                        <span className="text-zinc-500 text-[14px]">주말</span>
                        <span className="tabular-nums font-bold text-zinc-700">{fmtWon(weHourly)}원</span>
                        <span className="text-zinc-400">×</span>
                        <span className="tabular-nums text-zinc-600">{weH.toFixed(1)}h</span>
                      </>
                    ) : (
                      <>
                        <span className="text-zinc-500 text-[14px]">시급</span>
                        <span className="tabular-nums font-bold text-zinc-700">{fmtWon(wdHourly)}원</span>
                        <span className="text-zinc-400">×</span>
                        <span className="tabular-nums text-zinc-600">{weeklyH.toFixed(1)}h</span>
                      </>
                    )}
                    <span className="text-zinc-400">×</span>
                    <span className="text-zinc-600">4.345</span>
                    <span className="text-zinc-400">=</span>
                    <span className="tabular-nums font-bold text-emerald-700">{fmtWon(buMonthlyNet)}원</span>
                    <span className="text-[9.5px] text-zinc-400 bg-emerald-100 px-1 rounded">(희망 월 수령액)</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      );
    })()}

    {/* 추가 특약 */}
    <div>
      <label className={fldLabel}>
        <Notepad size={10} weight="fill" className="inline mr-0.5" />추가 특약 (선택)
      </label>
      <textarea value={form.additionalContent} onChange={(e) => upd("additionalContent", e.target.value)} rows={2}
        placeholder="예: 수습기간 3개월 · 명절 상여 별도"
        className="w-full bg-white border border-line rounded-lg px-3 py-2 text-[12.5px] text-zinc-800 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition resize-y placeholder:text-zinc-400 placeholder:font-normal"
      />
    </div>
    </>)}
  </Card>
);
