// src/components/ContractWriterPage/WageComponentsForm.tsx
// 좌측 폼 · 임금구성표 편집 (8항목 · 체크박스 활성화)

import React from "react";
import { Money } from "@phosphor-icons/react";
import type { WageComponents, WageEntryKey, WageToggleableKey, WageDisabledMap } from "./types";
import { computeWageTotal, fmtWon } from "./wageCalc";

interface WageComponentsFormProps {
  wage: WageComponents;
  onChange: (next: WageComponents) => void;
  weekdayHourly?: number;
  wageDisabled?: WageDisabledMap;
  onWageDisabledChange?: (next: WageDisabledMap) => void;
}

const WageComponentsForm: React.FC<WageComponentsFormProps> = ({ wage, onChange, weekdayHourly = 0, wageDisabled, onWageDisabledChange }) => {
  const updEntry = (
    key: WageEntryKey,
    field: keyof typeof wage.basicSalary,
    val: number,
  ) => {
    onChange({ ...wage, [key]: { ...wage[key], [field]: val } });
  };
  const updFlat = (key: "mealAllowance" | "vehicleAllowance", val: number) => {
    onChange({ ...wage, [key]: val });
  };

  const lastValuesRef = React.useRef<Partial<Record<WageToggleableKey, typeof wage.basicSalary>>>({});
  const isKeyDisabled = (key: WageToggleableKey): boolean => Boolean(wageDisabled?.[key]);
  const toggleEntry = (key: WageToggleableKey, enabled: boolean) => {
    const cur = wage[key];
    if (onWageDisabledChange) {
      onWageDisabledChange({ ...(wageDisabled ?? {}), [key]: !enabled });
    }
    if (enabled) {
      const restored = lastValuesRef.current[key];
      if (restored && (restored.hours + restored.minutes + restored.amount > 0)) {
        onChange({ ...wage, [key]: restored });
      }
    } else {
      if (cur.hours > 0 || cur.minutes > 0 || cur.amount > 0) {
        lastValuesRef.current[key] = { ...cur };
      }
      onChange({ ...wage, [key]: { hours: 0, minutes: 0, amount: 0 } });
    }
  };

  type ComponentKey = WageEntryKey;
  const rows: Array<{ key: ComponentKey; label: string; note: string; formulaMul: number; formulaHint?: string; toggleable: boolean }> = [
    { key: "basicSalary",          label: "기본급",                   note: "주휴수당 포함",     formulaMul: 1,   formulaHint: "주40+주휴8 × 4.3452", toggleable: false },
    { key: "fixedOvertime",        label: "(고정)연장근로수당",       note: "1.5배 가산 포함",   formulaMul: 1,   formulaHint: "시간에 1.5배 반영됨",  toggleable: true },
    { key: "fixedHoliday",         label: "(고정)휴일근로수당",       note: "1.5배 가산 포함",   formulaMul: 1,   formulaHint: "시간에 1.5배 반영됨",  toggleable: true },
    { key: "fixedHolidayOvertime", label: "(고정)휴일연장근로수당",   note: "0.5배 가산 포함",   formulaMul: 0.5,                                       toggleable: true },
    { key: "fixedNight",           label: "(고정)야간근로수당",       note: "0.5배 가산 포함",   formulaMul: 0.5,                                       toggleable: true },
    { key: "fixedAnnualLeave",     label: "(고정)연차휴가수당",       note: "",                  formulaMul: 1,                                         toggleable: true },
  ];

  const total = computeWageTotal(wage);
  const w = Math.max(0, weekdayHourly);

  return (
    <div className="rounded-lg border border-indigo-200 bg-white flex flex-col overflow-hidden">
      <div className="text-[15px] font-bold text-indigo-800 flex items-center gap-1 px-2 py-1 border-b border-indigo-100 bg-indigo-50/50">
        <Money size={11} weight="fill" />
        임금 구성표 (편집 가능 · 이미지 레이아웃)
      </div>

      <table className="w-full border-collapse text-[15px]">
        <thead>
          <tr className="bg-zinc-100 text-zinc-700 font-bold text-[10.5px]">
            <th className="border-b border-zinc-300 px-1.5 py-1 text-left w-[42%]">구성 항목</th>
            <th className="border-b border-zinc-300 px-1.5 py-1 text-center w-[30%]">내용</th>
            <th className="border-b border-zinc-300 px-1.5 py-1 text-right w-[28%]">금액 (원)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const entry = wage[r.key];
            const isEmpty = entry.hours === 0 && entry.minutes === 0 && entry.amount === 0;
            const explicitlyDisabled = r.toggleable && isKeyDisabled(r.key as WageToggleableKey);
            const enabled = !explicitlyDisabled;
            const dim = explicitlyDisabled;
            return (
              <tr key={r.key} className={`border-b border-zinc-100 last:border-b-0 ${dim ? "opacity-60" : ""}`}>
                <td className="px-1.5 py-1 align-middle">
                  {r.toggleable ? (
                    <label className="inline-flex items-start gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => toggleEntry(r.key as WageToggleableKey, e.target.checked)}
                        className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer shrink-0 mt-0.5"
                        title={enabled ? `${r.label} 비활성화` : `${r.label} 활성화`}
                      />
                      <span>
                        <div className="text-[15px] font-bold text-zinc-800 leading-tight">{r.label}</div>
                        {r.note && <div className="text-[15px] text-zinc-500 font-semibold leading-tight">({r.note})</div>}
                      </span>
                    </label>
                  ) : (
                    <>
                      <div className="text-[15px] font-bold text-zinc-800 leading-tight">{r.label}</div>
                      {r.note && <div className="text-[15px] text-zinc-500 font-semibold leading-tight">({r.note})</div>}
                    </>
                  )}
                </td>
                <td className="px-1.5 py-1 align-middle">
                  <div className="flex items-center justify-center gap-0.5 text-[14px] text-zinc-500 font-semibold">
                    <span>월평균</span>
                    <input
                      type="number"
                      min={0}
                      value={entry.hours}
                      onChange={(e) => updEntry(r.key, "hours", Number(e.target.value) || 0)}
                      disabled={dim}
                      className={`w-8 bg-white border border-line rounded px-0.5 py-0.5 text-[15px] font-semibold text-right focus:outline-none focus:border-brand-deep transition ${dim ? "bg-zinc-50 text-zinc-300 cursor-not-allowed" : "text-zinc-800"}`}
                      placeholder="0"
                    />
                    <span>h</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={entry.minutes}
                      onChange={(e) => updEntry(r.key, "minutes", Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                      disabled={dim}
                      className={`w-7 bg-white border border-line rounded px-0.5 py-0.5 text-[15px] font-semibold text-right focus:outline-none focus:border-brand-deep transition ${dim ? "bg-zinc-50 text-zinc-300 cursor-not-allowed" : "text-zinc-800"}`}
                      placeholder="0"
                    />
                    <span>m</span>
                  </div>
                  {(() => {
                    const totalH = (entry.hours || 0) + (entry.minutes || 0) / 60;
                    if (totalH === 0 && r.key !== "basicSalary" && r.key !== "fixedAnnualLeave") return null;
                    const mulText = r.formulaMul === 0.5 ? " × 0.5" : "";
                    return (
                      <div className="text-[15px] text-zinc-400 font-semibold text-center mt-0.5 leading-tight">
                        = 시급 × <span className="tabular-nums text-zinc-500">{totalH.toFixed(2).replace(/\.?0+$/, "")}</span>{mulText}
                        {r.formulaHint && (
                          <span className="text-[15px] text-zinc-400 ml-1 italic">({r.formulaHint})</span>
                        )}
                        {w > 0 && (
                          <div className="text-[15px] text-emerald-600 font-bold tabular-nums">
                            = {fmtWon(Math.round(w * totalH * r.formulaMul))}원
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-1.5 py-1 align-middle text-right">
                  <div className="relative inline-block w-full">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={entry.amount === 0 ? "" : String(entry.amount)}
                      onChange={(e) => updEntry(r.key, "amount", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                      disabled={dim}
                      className={`w-full bg-white border rounded px-1 py-0.5 text-[15px] font-bold text-right focus:outline-none focus:border-brand-deep transition ${
                        dim
                          ? "border-zinc-100 text-zinc-300 bg-zinc-50 cursor-not-allowed"
                          : isEmpty ? "border-zinc-100 text-zinc-300" : "border-line text-zinc-800"
                      }`}
                      placeholder={dim ? "비활성" : "-"}
                    />
                  </div>
                </td>
              </tr>
            );
          })}

          {/* 식대 */}
          {(() => {
            const enabled = wage.mealAllowance > 0;
            return (
              <tr className="border-b border-zinc-100">
                <td className="px-1.5 py-1 align-middle">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => { if (e.target.checked) { if (wage.mealAllowance === 0) updFlat("mealAllowance", 1); } else { updFlat("mealAllowance", 0); } }}
                      className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer shrink-0"
                    />
                    <span>
                      <div className="text-[15px] font-bold text-zinc-800 leading-tight">식대</div>
                      <div className="text-[15px] text-zinc-500 font-semibold leading-tight">(비과세)</div>
                    </span>
                  </label>
                </td>
                <td className="px-1.5 py-1 align-middle text-center text-[14px] text-zinc-500 font-semibold italic">
                  {enabled ? "비과세" : "해당자에 한함"}
                </td>
                <td className="px-1.5 py-1 align-middle text-right">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={!enabled ? "" : String(wage.mealAllowance)}
                    onChange={(e) => { const n = Number(e.target.value.replace(/[^0-9]/g, "")) || 0; updFlat("mealAllowance", n); }}
                    disabled={!enabled}
                    className={`w-full bg-white border rounded px-1 py-0.5 text-[15px] font-bold text-right focus:outline-none focus:border-brand-deep transition ${!enabled ? "border-zinc-100 text-zinc-300 bg-zinc-50 cursor-not-allowed" : "border-line text-zinc-800"}`}
                    placeholder={enabled ? "금액 입력" : "해당자에 한함"}
                  />
                </td>
              </tr>
            );
          })()}

          {/* 차량유지비 */}
          {(() => {
            const enabled = wage.vehicleAllowance > 0;
            return (
              <tr className="border-b border-line">
                <td className="px-1.5 py-1 align-middle">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => { if (e.target.checked) { if (wage.vehicleAllowance === 0) updFlat("vehicleAllowance", 1); } else { updFlat("vehicleAllowance", 0); } }}
                      className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer shrink-0"
                    />
                    <span>
                      <div className="text-[15px] font-bold text-zinc-800 leading-tight">차량유지비</div>
                      <div className="text-[15px] text-zinc-500 font-semibold leading-tight">(비과세)</div>
                    </span>
                  </label>
                </td>
                <td className="px-1.5 py-1 align-middle text-center text-[14px] text-zinc-500 font-semibold italic">
                  {enabled ? "비과세" : "해당자에 한함"}
                </td>
                <td className="px-1.5 py-1 align-middle text-right">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={!enabled ? "" : String(wage.vehicleAllowance)}
                    onChange={(e) => { const n = Number(e.target.value.replace(/[^0-9]/g, "")) || 0; updFlat("vehicleAllowance", n); }}
                    disabled={!enabled}
                    className={`w-full bg-white border rounded px-1 py-0.5 text-[15px] font-bold text-right focus:outline-none focus:border-brand-deep transition ${!enabled ? "border-zinc-100 text-zinc-300 bg-zinc-50 cursor-not-allowed" : "border-line text-zinc-800"}`}
                    placeholder={enabled ? "금액 입력" : "해당자에 한함"}
                  />
                </td>
              </tr>
            );
          })()}

          <tr className="bg-amber-50">
            <td className="px-1.5 py-1.5 text-left text-[11.5px] font-bold text-zinc-900">월급여총액 (세전)</td>
            <td className="px-1.5 py-1.5 text-center text-[10.5px] font-bold text-zinc-600">(포괄임금)</td>
            <td className="px-1.5 py-1.5 text-right text-[14px] font-bold text-zinc-900 tabular-nums">
              {fmtWon(total)} 원
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default WageComponentsForm;
