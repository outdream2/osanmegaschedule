import React, { useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Employee } from "../types";
import { SCHEDULE_COLORS, DEFAULT_COLOR } from "../constants";

interface Props {
  employee: Employee;
  initialYear: number;
  initialMonth: number;
  onClose: () => void;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export const EmployeeCalendarModal: React.FC<Props> = ({
  employee, initialYear, initialMonth, onClose,
}) => {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const totalDays = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const monthStr = String(month).padStart(2, "0");

  // Build schedule lookup for this month
  const schedMap: Record<number, { type: string; workingHours: string; actualHours: string }> = {};
  for (const sc of employee.schedules) {
    if (sc.date.startsWith(`${year}-${monthStr}-`)) {
      const day = parseInt(sc.date.slice(8));
      schedMap[day] = { type: sc.type, workingHours: sc.workingHours, actualHours: sc.actualHours };
    }
  }

  // Build calendar grid: leading empty cells + day cells
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // Stats for this month
  const stats: Record<string, number> = {};
  for (let d = 1; d <= totalDays; d++) {
    const sc = schedMap[d];
    if (sc?.type) stats[sc.type] = (stats[sc.type] || 0) + 1;
  }
  const workDays = Object.entries(stats)
    .filter(([t]) => !["휴무", "월차", "지정휴무"].includes(t))
    .reduce((s, [, n]) => s + n, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <div>
              <span className="text-lg font-extrabold tracking-tight">{employee.name}</span>
              <span className="ml-2 text-slate-400 text-xs">{employee.position}</span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="text-xs text-slate-400">{employee.workplace} · {employee.description}</div>
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">
            <ChevronLeft size={16} className="text-slate-600" />
          </button>
          <span className="text-sm font-bold text-slate-800">{year}년 {month}월</span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">
            <ChevronRight size={16} className="text-slate-600" />
          </button>
        </div>

        {/* Calendar */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map((d, i) => (
              <div key={d} className={`text-center text-[10px] font-bold py-1 ${i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : "text-slate-400"}`}>
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div className="space-y-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((day, di) => {
                  if (!day) return <div key={di} />;
                  const sc = schedMap[day];
                  const color = sc?.type ? (SCHEDULE_COLORS[sc.type] || DEFAULT_COLOR) : null;
                  const isToday = (
                    new Date().getFullYear() === year &&
                    new Date().getMonth() + 1 === month &&
                    new Date().getDate() === day
                  );
                  const dow = (firstDow + day - 1) % 7;
                  return (
                    <div
                      key={di}
                      className={`rounded-lg p-1 flex flex-col items-center min-h-[52px] border ${
                        color ? `${color.bg} border-transparent` : "bg-white border-slate-100"
                      } ${isToday ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`}
                    >
                      <span className={`text-[10px] font-bold leading-none mb-0.5 ${
                        dow === 0 ? "text-rose-500" : dow === 6 ? "text-sky-500" : "text-slate-600"
                      }`}>
                        {day}
                      </span>
                      {sc?.type ? (
                        <>
                          <span className={`text-[9px] font-extrabold leading-tight ${color?.text ?? ""}`}>
                            {sc.type}
                          </span>
                          {sc.workingHours && (
                            <span className="text-[8px] text-slate-500 leading-tight mt-0.5 font-mono">
                              {sc.workingHours}
                            </span>
                          )}
                          {sc.actualHours && (
                            <span className="text-[8px] text-indigo-600 leading-tight font-semibold">
                              {sc.actualHours}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[8px] text-slate-200">-</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Stats footer */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex-shrink-0 flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-bold text-slate-500">이달 근무 {workDays}일</span>
          {Object.entries(stats).map(([type, count]) => {
            const c = SCHEDULE_COLORS[type] || DEFAULT_COLOR;
            return (
              <div key={type} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${c.bg} ${c.text}`}>
                {type} {count}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
