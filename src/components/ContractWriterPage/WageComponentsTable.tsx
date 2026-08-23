// src/components/ContractWriterPage/WageComponentsTable.tsx
// 프리뷰 · 8항목 이미지 재현

import React from "react";
import type { WageComponents, WageComponentEntry } from "./types";
import { computeWageTotal, fmtWon } from "./wageCalc";

const WageComponentsTable: React.FC<{ wage: WageComponents }> = ({ wage }) => {
  type Row = { label: string; note?: string; entry?: WageComponentEntry; flatAmount?: number; optional?: boolean };
  const rows: Row[] = [
    { label: "기본급",                 note: "주휴수당 포함", entry: wage.basicSalary },
    { label: "(고정)연장근로수당",     note: "1.5배 가산 포함", entry: wage.fixedOvertime },
    { label: "(고정)휴일근로수당",     note: "1.5배 가산 포함", entry: wage.fixedHoliday },
    { label: "(고정)휴일연장근로수당", note: "0.5배 가산 포함", entry: wage.fixedHolidayOvertime },
    { label: "(고정)야간근로수당",     note: "0.5배 가산 포함", entry: wage.fixedNight },
    { label: "(고정)연차휴가수당",     note: "",              entry: wage.fixedAnnualLeave },
    { label: "식대",                  note: "비과세", flatAmount: wage.mealAllowance, optional: true },
    { label: "차량유지비",             note: "비과세", flatAmount: wage.vehicleAllowance, optional: true },
  ];
  const total = computeWageTotal(wage);

  return (
    <div className="border border-zinc-500 rounded-sm overflow-hidden text-[11.5px]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-zinc-100 text-zinc-800 font-bold text-[11.5px]">
            <th className="border-b border-r border-zinc-400 px-2 py-1 text-left w-[34%]">구성 항목</th>
            <th className="border-b border-r border-zinc-400 px-2 py-1 text-left w-[40%]">내용</th>
            <th className="border-b border-zinc-400 px-2 py-1 text-right w-[26%]">금액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const isEmpty = r.entry
              ? (r.entry.hours === 0 && r.entry.minutes === 0 && r.entry.amount === 0)
              : (!r.flatAmount || r.flatAmount === 0);
            const amount = r.entry ? r.entry.amount : (r.flatAmount ?? 0);
            return (
              <tr key={idx} className="bg-white">
                <td className="border-b border-r border-zinc-300 px-2 py-1 align-middle">
                  <div className="font-bold text-zinc-800">{r.label}</div>
                  {r.note && <div className="text-[14px] text-zinc-500 leading-tight">({r.note})</div>}
                </td>
                <td className="border-b border-r border-zinc-300 px-2 py-1 align-middle">
                  {r.optional ? (
                    <span className={isEmpty ? "text-zinc-400" : "text-zinc-800"}>해당자에 한함</span>
                  ) : (
                    <span className={isEmpty ? "text-zinc-400" : "text-zinc-800"}>
                      월평균 <b className="tabular-nums">{(r.entry?.hours ?? 0).toString().padStart(1, "0")}</b> 시간{" "}
                      <b className="tabular-nums">{(r.entry?.minutes ?? 0).toString().padStart(2, "0")}</b> 분
                    </span>
                  )}
                </td>
                <td className="border-b border-zinc-300 px-2 py-1 text-right tabular-nums align-middle">
                  {isEmpty
                    ? (r.optional ? <span className="text-zinc-400">해당자에 한함</span> : <span className="text-zinc-300">-</span>)
                    : <span className="text-zinc-900 font-semibold">{fmtWon(amount)} 원</span>}
                </td>
              </tr>
            );
          })}
          <tr className="bg-amber-50">
            <td className="px-2 py-1.5 font-bold text-zinc-800 border-r border-zinc-400">월급여총액 (세전)</td>
            <td className="border-r border-zinc-400 px-2 py-1.5 text-[10.5px] text-zinc-600">(포괄임금)</td>
            <td className="px-2 py-1.5 text-right tabular-nums font-bold text-zinc-900">
              {fmtWon(total)} 원
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default WageComponentsTable;
