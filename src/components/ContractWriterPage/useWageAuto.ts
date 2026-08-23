// src/components/ContractWriterPage/useWageAuto.ts
// 임금 자동계산 · category→wage sync · wageComponents 동기화 · grossSalary auto · workDays derived

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import { defaultWageForPosition, type WageRate, type AppSettings } from '../../hooks/useSettings';
type SettingsObject = Pick<AppSettings, 'wageRates' | 'employeeWageOverrides'>;
import {
  grossUp as payrollGrossUp,
  DEFAULT_WITHHOLDING_RATE,
  RECOGNIZED_HOURS,
  type WithholdingRate,
} from '../../lib/payroll';
import { calcWageBase } from '../../lib/wageCalc';
import { DAYS, WEEKDAYS, WEEKEND } from './constants';
import {
  WAGE_HOURS,
  computeMonthlyHours,
  computeWageFromHourlyDual,
} from './wageCalc';
import type { ContractForm, WageComponentEntry, WageComponents, DayKey } from './types';

interface UseWageAutoProps {
  form: ContractForm;
  setForm: Dispatch<SetStateAction<ContractForm>>;
  settings: SettingsObject;
  wageAutoLoadedRef: MutableRefObject<boolean>;
  lastAutoWageRef: MutableRefObject<{ wd: string; we: string } | null>;
}

export function useWageAuto({ form, setForm, settings, wageAutoLoadedRef, lastAutoWageRef }: UseWageAutoProps) {
  // 통상시급 override (null 이면 자동 = 주중시급)
  const [wageHourlyOverride, setWageHourlyOverride] = useState<number | null>(null);
  // 부양가족 수 (본인 포함 · default 1)
  const [dependentsCount, setDependentsCount] = useState<number>(1);
  // 원천징수 비율 (80/100/120% · 근로자 선택 · default 100%)
  const [withholdingRate, setWithholdingRate] = useState<WithholdingRate>(DEFAULT_WITHHOLDING_RATE);
  // 자녀 세액공제 대상 자녀 수 (8~20세 · default 0)
  const [childrenCount, setChildrenCount] = useState<number>(0);
  // 공제항목 (사용자 입력 · 소득세에서 차감)
  const [extraDeduction, setExtraDeduction] = useState<number>(0);
  // 소득세 포함 토글 · default OFF
  const [includeIncomeTax, setIncludeIncomeTax] = useState<boolean>(false);
  // 실수령액 상세 카드 접기/펼치기
  const [netDetailOpen, setNetDetailOpen] = useState<boolean>(true);

  const wageAutoInitRef = useRef(false);

  // 직급별 기본 시급 조회
  const resolveWageForCategory = useCallback((
    cat: ContractForm["employeeCategory"],
    custom: string,
    empId: number | null,
  ): WageRate & { posKey: string } => {
    const catToPositionKey = (c: ContractForm["employeeCategory"]): string => {
      if (c === "약사") return "약사";
      if (c === "매장") return "매장";
      if (c === "창고") return "창고";
      return "";
    };
    const posKey = catToPositionKey(cat) || custom || "사원";
    const override = empId != null ? settings.employeeWageOverrides?.[empId] : undefined;
    const positionRate = posKey ? settings.wageRates?.[posKey] : undefined;
    const rate = override ?? positionRate ?? defaultWageForPosition(posKey);
    return { weekday: rate.weekday, weekend: rate.weekend, posKey };
  }, [settings.wageRates, settings.employeeWageOverrides]);

  const applyDefaultHourly = useCallback(() => {
    const { weekday, weekend } = resolveWageForCategory(form.employeeCategory, form.employeeCategoryCustom, form.employeeId);
    setForm(prev => ({ ...prev, weekdayHourly: String(weekday), weekendHourly: String(weekend) }));
    wageAutoLoadedRef.current = true;
    lastAutoWageRef.current = { wd: String(weekday), we: String(weekend) };
  }, [form.employeeCategory, form.employeeCategoryCustom, form.employeeId, resolveWageForCategory, setForm, wageAutoLoadedRef, lastAutoWageRef]);

  // employeeCategory 변경 시 자동 재로드
  useEffect(() => {
    wageAutoInitRef.current = true;
    if (!wageAutoLoadedRef.current) return;
    const wd = form.weekdayHourly;
    const we = form.weekendHourly;
    const { weekday, weekend } = resolveWageForCategory(form.employeeCategory, form.employeeCategoryCustom, form.employeeId);
    const nextWd = String(weekday);
    const nextWe = String(weekend);
    if (nextWd === wd && nextWe === we) return;
    setForm(prev => ({ ...prev, weekdayHourly: nextWd, weekendHourly: nextWe }));
    lastAutoWageRef.current = { wd: nextWd, we: nextWe };
  }, [form.employeeCategory, form.employeeCategoryCustom, form.employeeId, resolveWageForCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // settings.wageRates 변경 시 자동 재적용
  useEffect(() => {
    if (!wageAutoLoadedRef.current) return;
    const wd = form.weekdayHourly;
    const we = form.weekendHourly;
    const { weekday, weekend } = resolveWageForCategory(form.employeeCategory, form.employeeCategoryCustom, form.employeeId);
    const nextWd = String(weekday);
    const nextWe = String(weekend);
    if (nextWd === wd && nextWe === we) return;
    setForm(prev => ({ ...prev, weekdayHourly: nextWd, weekendHourly: nextWe }));
    lastAutoWageRef.current = { wd: nextWd, we: nextWe };
  }, [resolveWageForCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // 계약 유형 · 정규직 → 무기한 · 계약직 → 유기
  useEffect(() => {
    if (form.contractType === "정규직" && !form.indefinite) {
      setForm(prev => ({ ...prev, indefinite: true, endDate: "" }));
    } else if (form.contractType === "계약직" && form.indefinite) {
      setForm(prev => ({ ...prev, indefinite: false }));
    }
  }, [form.contractType]); // eslint-disable-line react-hooks/exhaustive-deps

  // 계약직 · N개월 → endDate 자동
  useEffect(() => {
    if (form.contractType !== "계약직") return;
    if (form.indefinite) return;
    const months = Number(form.contractMonths);
    if (!Number.isFinite(months) || months <= 0) return;
    if (!form.startDate) return;
    const start = new Date(form.startDate);
    if (isNaN(start.getTime())) return;
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);
    end.setDate(end.getDate() - 1);
    const iso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    if (iso !== form.endDate) {
      setForm(prev => ({ ...prev, endDate: iso }));
    }
  }, [form.contractType, form.contractMonths, form.startDate, form.indefinite]); // eslint-disable-line react-hooks/exhaustive-deps

  // 매장/창고 → primaryFocus 자동
  useEffect(() => {
    setForm(prev => {
      if (prev.employeeCategory === "매장" || prev.employeeCategory === "창고") {
        if (prev.primaryFocus == null) return { ...prev, primaryFocus: prev.employeeCategory };
        return prev;
      }
      if (prev.primaryFocus !== null) return { ...prev, primaryFocus: null };
      return prev;
    });
  }, [form.employeeCategory, setForm]);

  // K. 주 근무일수 자동 계산 (요일 체크박스 → 개수)
  const weeklyDays = useMemo(() => DAYS.filter(d => form.workDays[d]).length, [form.workDays]);
  const weeklyWeekdayDays = useMemo(() => WEEKDAYS.filter(d => form.workDays[d]).length, [form.workDays]);
  const weeklyWeekendDays = useMemo(() => WEEKEND.filter(d => form.workDays[d]).length, [form.workDays]);
  const workDaysSummary = useMemo(() => {
    const active = DAYS.filter(d => form.workDays[d]);
    if (active.length === 0) return "선택 안 됨";
    return `${active.join("·")} (주 ${active.length}일)`;
  }, [form.workDays]);

  // 근무시간 → 월 근로시간 계산 (실시간)
  const monthlyCalc = useMemo(() => {
    return computeMonthlyHours(
      form.startTime,
      form.endTime,
      Number(form.breakMinutes) || 0,
      weeklyDays,
    );
  }, [form.startTime, form.endTime, form.breakMinutes, weeklyDays]);

  // 통상시급 → form.wageComponents 4자동항목 자동 동기화 (프리뷰 반영)
  useEffect(() => {
    const wd = Number(form.weekdayHourly) || 0;
    const autoHourly = Math.round(wd * 10) / 10;
    const hourly = wageHourlyOverride != null && wageHourlyOverride > 0
      ? Math.round(wageHourlyOverride * 10) / 10
      : autoHourly;
    if (hourly <= 0) return;
    const basicAmt    = Math.round(hourly * WAGE_HOURS.BASIC);
    const overtimeAmt = Math.round(hourly * WAGE_HOURS.OVERTIME);
    const holidayAmt  = Math.round(hourly * WAGE_HOURS.HOLIDAY);
    const annualAmt   = Math.round(hourly * WAGE_HOURS.ANNUAL_LEAVE);
    setForm(prev => {
      const wc = prev.wageComponents;
      if (
        wc.basicSalary?.amount === basicAmt &&
        wc.fixedOvertime?.amount === overtimeAmt &&
        wc.fixedHoliday?.amount === holidayAmt &&
        wc.fixedAnnualLeave?.amount === annualAmt
      ) return prev;
      return {
        ...prev,
        wageComponents: {
          ...wc,
          basicSalary:      { ...wc.basicSalary,      amount: basicAmt },
          fixedOvertime:    { ...wc.fixedOvertime,    amount: overtimeAmt },
          fixedHoliday:     { ...wc.fixedHoliday,     amount: holidayAmt },
          fixedAnnualLeave: { ...wc.fixedAnnualLeave, amount: annualAmt },
        },
      };
    });
  }, [wageHourlyOverride, form.weekdayHourly, setForm]);

  // workDays·근무시간·시급 변경 시 임금구성표 자동 재계산 (T-U/T-X)
  const lastAutoBasicHoursRef = useRef<{ h: number; m: number } | null>(null);
  const lastAutoOtHoursRef = useRef<{ h: number; m: number } | null>(null);
  const lastAutoHolidayHoursRef = useRef<{ h: number; m: number } | null>(null);

  useEffect(() => {
    setForm(prev => {
      if (prev.grossSalaryInput && prev.grossSalaryInput.trim() !== "") return prev;
      const wd = Number(prev.weekdayHourly) || 0;
      const we = Number(prev.weekendHourly) || 0;
      if (wd <= 0) return prev;

      let nextWage = prev.wageComponents;

      const dailyH = monthlyCalc ? monthlyCalc.dailyMinutes / 60 : 0;
      const base = dailyH > 0 && weeklyWeekdayDays > 0
        ? calcWageBase(dailyH, weeklyWeekdayDays, weeklyWeekendDays)
        : null;

      const splitHM = (totalH: number): { h: number; m: number } => {
        if (totalH <= 0) return { h: 0, m: 0 };
        const totalMin = Math.round(totalH * 60);
        return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
      };

      const isSameAutoOrDefault = (
        cur: WageComponentEntry,
        defaults: Array<{ h: number; m: number }>,
        lastAuto: { h: number; m: number } | null,
      ): boolean => {
        if (defaults.some(d => cur.hours === d.h && cur.minutes === d.m)) return true;
        if (lastAuto != null && cur.hours === lastAuto.h && cur.minutes === lastAuto.m) return true;
        if (cur.hours === 0 && cur.minutes === 0) return true;
        return false;
      };

      const disMap = prev.wageDisabled ?? {};

      if (base) {
        {
          const cur = prev.wageComponents.basicSalary;
          if (isSameAutoOrDefault(cur, [{ h: 209, m: 0 }, { h: 195, m: 30 }, { h: 195, m: 32 }], lastAutoBasicHoursRef.current)) {
            const next = splitHM(base.monthlyBasicH);
            if (cur.hours !== next.h || cur.minutes !== next.m) {
              nextWage = { ...nextWage, basicSalary: { ...cur, hours: next.h, minutes: next.m } };
            }
            lastAutoBasicHoursRef.current = next;
          }
        }
        if (!disMap.fixedOvertime) {
          const cur = nextWage.fixedOvertime;
          if (isSameAutoOrDefault(cur, [{ h: 55, m: 56 }, { h: 0, m: 0 }], lastAutoOtHoursRef.current)) {
            const next = splitHM(base.monthlyOvertimeGainedH);
            if (cur.hours !== next.h || cur.minutes !== next.m) {
              nextWage = { ...nextWage, fixedOvertime: { ...cur, hours: next.h, minutes: next.m } };
            }
            lastAutoOtHoursRef.current = next;
          }
        }
        if (!disMap.fixedHoliday) {
          const cur = nextWage.fixedHoliday;
          if (isSameAutoOrDefault(cur, [{ h: 22, m: 0 }, { h: 0, m: 0 }], lastAutoHolidayHoursRef.current)) {
            const next = splitHM(base.monthlyHolidayGainedH);
            if (cur.hours !== next.h || cur.minutes !== next.m) {
              nextWage = { ...nextWage, fixedHoliday: { ...cur, hours: next.h, minutes: next.m } };
            }
            lastAutoHolidayHoursRef.current = next;
          }
        }
      } else if (monthlyCalc) {
        const cur = prev.wageComponents.basicSalary;
        const last = lastAutoBasicHoursRef.current;
        const isDefaultBasic =
          (cur.hours === 209 && cur.minutes === 0) ||
          (cur.hours === 0 && cur.minutes === 0) ||
          (last != null && cur.hours === last.h && cur.minutes === last.m);
        if (isDefaultBasic) {
          const nextH = monthlyCalc.monthlyHoursInt;
          const nextM = monthlyCalc.monthlyMinutesRem;
          if (cur.hours !== nextH || cur.minutes !== nextM) {
            nextWage = { ...nextWage, basicSalary: { ...cur, hours: nextH, minutes: nextM } };
          }
          lastAutoBasicHoursRef.current = { h: nextH, m: nextM };
        }
      }

      const calc = computeWageFromHourlyDual(wd, we, nextWage);
      const nextComp: WageComponents = {
        ...nextWage,
        basicSalary:          { ...nextWage.basicSalary,          amount: calc.basicAmount },
        fixedOvertime:        { ...nextWage.fixedOvertime,        amount: disMap.fixedOvertime        ? 0 : calc.overtimeAmount },
        fixedHoliday:         { ...nextWage.fixedHoliday,         amount: disMap.fixedHoliday         ? 0 : calc.holidayAmount },
        fixedHolidayOvertime: { ...nextWage.fixedHolidayOvertime, amount: disMap.fixedHolidayOvertime ? 0 : calc.holidayOvertimeAmount },
        fixedNight:           { ...nextWage.fixedNight,           amount: disMap.fixedNight           ? 0 : calc.nightAmount },
        fixedAnnualLeave:     { ...nextWage.fixedAnnualLeave,     amount: disMap.fixedAnnualLeave     ? 0 : calc.annualLeaveAmount },
      };

      const changed =
        nextWage !== prev.wageComponents ||
        nextComp.basicSalary.amount          !== prev.wageComponents.basicSalary.amount ||
        nextComp.fixedOvertime.amount        !== prev.wageComponents.fixedOvertime.amount ||
        nextComp.fixedHoliday.amount         !== prev.wageComponents.fixedHoliday.amount ||
        nextComp.fixedHolidayOvertime.amount !== prev.wageComponents.fixedHolidayOvertime.amount ||
        nextComp.fixedNight.amount           !== prev.wageComponents.fixedNight.amount ||
        nextComp.fixedAnnualLeave.amount     !== prev.wageComponents.fixedAnnualLeave.amount;
      if (!changed) return prev;
      return { ...prev, wageComponents: nextComp };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.workDays,
    form.startTime,
    form.endTime,
    form.breakMinutes,
    form.weekdayHourly,
    form.weekendHourly,
    form.wageComponents.basicSalary.hours,
    form.wageComponents.basicSalary.minutes,
    form.wageComponents.fixedOvertime.hours,
    form.wageComponents.fixedOvertime.minutes,
    form.wageComponents.fixedHoliday.hours,
    form.wageComponents.fixedHoliday.minutes,
    form.wageComponents.fixedHolidayOvertime.hours,
    form.wageComponents.fixedHolidayOvertime.minutes,
    form.wageComponents.fixedNight.hours,
    form.wageComponents.fixedNight.minutes,
    form.wageComponents.fixedAnnualLeave.hours,
    form.wageComponents.fixedAnnualLeave.minutes,
    monthlyCalc,
    form.wageDisabled,
  ]);

  // 개인정보 수령자 자동 sync (T-CTR-8)
  useEffect(() => {
    setForm(prev => {
      const p = prev.privacyConsent;
      const nextName = p.recipientName || prev.employeeName;
      const nextAddr = p.recipientAddress || prev.employeeAddress;
      if (nextName === p.recipientName && nextAddr === p.recipientAddress) return prev;
      return { ...prev, privacyConsent: { ...p, recipientName: nextName, recipientAddress: nextAddr } };
    });
  }, [form.employeeName, form.employeeAddress, setForm]);

  // Step 2 · 근무조건 → targetNetInput 자동 반영 (T-CTR-9)
  const manualTargetNetRef = useRef(false);
  useEffect(() => {
    if (manualTargetNetRef.current) return;
    const dailyH = monthlyCalc ? monthlyCalc.dailyMinutes / 60 : 0;
    const wdRate = Number(form.weekdayHourly) || 0;
    const weRate = Number(form.weekendHourly) || wdRate;
    if (!Number.isFinite(dailyH) || dailyH <= 0) return;
    if (!Number.isFinite(wdRate) || wdRate <= 0) return;
    if (!Number.isFinite(weeklyWeekdayDays) || weeklyWeekdayDays <= 0) return;
    const weeklyWdH = weeklyWeekdayDays * dailyH;
    const weeklyWeH = (weeklyWeekendDays || 0) * dailyH;
    const weeklyPay = Math.round(weeklyWdH * wdRate + weeklyWeH * weRate);
    const autoNet = Math.round(weeklyPay * 4.345);
    if (!Number.isFinite(autoNet) || autoNet <= 0) return;
    setForm(prev => {
      const str = String(autoNet);
      if (prev.targetNetInput === str) return prev;
      return { ...prev, targetNetInput: str };
    });
  }, [monthlyCalc, form.weekdayHourly, form.weekendHourly, weeklyWeekdayDays, weeklyWeekendDays, setForm]);

  // Step 3 · 희망세후 → 세전 자동 gross-up (T-CTR-12)
  const manualGrossSalaryRef = useRef(false);
  useEffect(() => {
    if (manualGrossSalaryRef.current) return;
    const net = Number(form.targetNetInput.replace(/[^0-9]/g, "")) || 0;
    if (!Number.isFinite(net) || net <= 0) return;
    const nonTaxable = (Number(form.wageComponents.mealAllowance) || 0)
                     + (Number(form.wageComponents.vehicleAllowance) || 0);
    const { gross } = payrollGrossUp(net, nonTaxable, 1);
    if (!Number.isFinite(gross) || gross <= 0) return;
    setForm(prev => {
      const str = String(gross);
      if (prev.grossSalaryInput === str) return prev;
      return { ...prev, grossSalaryInput: str };
    });
  }, [form.targetNetInput, form.wageComponents.mealAllowance, form.wageComponents.vehicleAllowance, setForm]);

  // Step 4 · 세전 → 임금구조 4항목 자동 분배 (T-CTR-12)
  useEffect(() => {
    const gross = Number(form.grossSalaryInput.replace(/[^0-9]/g, "")) || 0;
    if (!Number.isFinite(gross) || gross <= 0) return;
    const ordinaryHourly = gross / RECOGNIZED_HOURS.total;
    if (!Number.isFinite(ordinaryHourly) || ordinaryHourly <= 0) return;

    const basicAmt  = Math.round(ordinaryHourly * RECOGNIZED_HOURS.basic);
    const otAmt     = Math.round(ordinaryHourly * RECOGNIZED_HOURS.fixedOvertime);
    const holAmt    = Math.round(ordinaryHourly * RECOGNIZED_HOURS.fixedHoliday);
    const annualAmt = Math.round(ordinaryHourly * RECOGNIZED_HOURS.fixedAnnualLeave);

    setForm(prev => {
      const disMap = prev.wageDisabled ?? {};
      const wc = prev.wageComponents;
      const nextBasic  = { hours: 209, minutes: 0,  amount: basicAmt };
      const nextOt     = disMap.fixedOvertime    ? { hours: 0, minutes: 0, amount: 0 } : { hours: 55, minutes: 56, amount: otAmt };
      const nextHol    = disMap.fixedHoliday     ? { hours: 0, minutes: 0, amount: 0 } : { hours: 22, minutes: 0,  amount: holAmt };
      const nextAnnual = disMap.fixedAnnualLeave ? { hours: 0, minutes: 0, amount: 0 } : { hours: 10, minutes: 0,  amount: annualAmt };

      const noChange =
        wc.basicSalary.amount      === nextBasic.amount &&
        wc.fixedOvertime.amount    === nextOt.amount &&
        wc.fixedHoliday.amount     === nextHol.amount &&
        wc.fixedAnnualLeave.amount === nextAnnual.amount &&
        wc.basicSalary.hours       === nextBasic.hours &&
        wc.fixedOvertime.hours     === nextOt.hours &&
        wc.fixedHoliday.hours      === nextHol.hours &&
        wc.fixedAnnualLeave.hours  === nextAnnual.hours;
      if (noChange) return prev;

      return {
        ...prev,
        useWageComponents: true,
        wageComponents: {
          ...wc,
          basicSalary:      { ...wc.basicSalary,      ...nextBasic },
          fixedOvertime:    { ...wc.fixedOvertime,    ...nextOt },
          fixedHoliday:     { ...wc.fixedHoliday,     ...nextHol },
          fixedAnnualLeave: { ...wc.fixedAnnualLeave, ...nextAnnual },
        },
      };
    });
  }, [form.grossSalaryInput, form.wageDisabled, setForm]);

  return {
    wageHourlyOverride, setWageHourlyOverride,
    dependentsCount, setDependentsCount,
    withholdingRate, setWithholdingRate,
    childrenCount, setChildrenCount,
    extraDeduction, setExtraDeduction,
    includeIncomeTax, setIncludeIncomeTax,
    netDetailOpen, setNetDetailOpen,
    weeklyDays, weeklyWeekdayDays, weeklyWeekendDays, workDaysSummary,
    monthlyCalc,
    applyDefaultHourly,
    resolveWageForCategory,
    manualTargetNetRef,
    manualGrossSalaryRef,
  };
}
