import React, { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Save, Clock, MessageSquare } from "lucide-react";
import { Employee, Schedule } from "../types";
import { SCHEDULE_COLORS, SCHEDULE_TYPES, DEFAULT_COLOR } from "../constants";

interface Props {
  employee: Employee;
  initialYear: number;
  initialMonth: number;
  onClose: () => void;
  isAdmin?: boolean;
  onUpdate?: (data: {
    employeeId: number;
    date: string;
    type: string;
    workingHours: string;
    actualHours: string;
    memo?: string;
  }) => Promise<void>;
  scheduleTypes?: { value: string; label: string }[];
  openShiftHour?: string;
  middleShiftHour?: string;
  closeShiftHour?: string;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export const EmployeeCalendarModal: React.FC<Props> = ({
  employee,
  initialYear,
  initialMonth,
  onClose,
  isAdmin = false,
  onUpdate,
  scheduleTypes: scheduleTypesProp,
  openShiftHour = "09:30-18:30",
  middleShiftHour = "11:00-20:00",
  closeShiftHour = "13:00-22:00",
}) => {
  const activeTypes = scheduleTypesProp ?? SCHEDULE_TYPES;

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [editType, setEditType] = useState("");
  const [editWorkingHours, setEditWorkingHours] = useState("");
  const [editActualHours, setEditActualHours] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setEditingDay(null);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setEditingDay(null);
  };

  const totalDays = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const monthStr = String(month).padStart(2, "0");

  const schedMap: Record<number, { type: string; workingHours: string; actualHours: string; memo: string }> = {};
  for (const sc of employee.schedules) {
    if (sc.date.startsWith(`${year}-${monthStr}-`)) {
      const day = parseInt(sc.date.slice(8));
      schedMap[day] = { type: sc.type, workingHours: sc.workingHours, actualHours: sc.actualHours, memo: sc.memo || "" };
    }
  }

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const stats: Record<string, number> = {};
  for (let d = 1; d <= totalDays; d++) {
    const sc = schedMap[d];
    if (sc?.type) stats[sc.type] = (stats[sc.type] || 0) + 1;
  }
  const workDays = Object.entries(stats)
    .filter(([t]) => !["휴무", "월차", "지정휴무"].includes(t))
    .reduce((s, [, n]) => s + n, 0);

  const openEditDay = (day: number) => {
    if (!isAdmin || !onUpdate) return;
    const sc = schedMap[day];
    setEditType(sc?.type || "");
    setEditWorkingHours(sc?.workingHours || "");
    setEditActualHours(sc?.actualHours || "");
    setEditMemo(sc?.memo || "");
    setEditingDay(day);
  };

  const saveWith = async (overrides: { type?: string; workingHours?: string; actualHours?: string; memo?: string } = {}) => {
    if (!onUpdate || editingDay === null) return;
    const dayStr = String(editingDay).padStart(2, "0");
    const date = `${year}-${monthStr}-${dayStr}`;
    const payload = {
      type: overrides.type ?? editType ?? "휴무",
      workingHours: overrides.workingHours ?? editWorkingHours,
      actualHours: overrides.actualHours ?? editActualHours,
      memo: overrides.memo ?? editMemo,
    };
    setIsSaving(true);
    try {
      await onUpdate({ employeeId: employee.id, date, ...payload });
      // Update local form state to reflect saved values
      setEditType(payload.type);
      setEditWorkingHours(payload.workingHours);
      setEditActualHours(payload.actualHours);
      setEditMemo(payload.memo);
    } catch (err) {
      console.error("Failed to update schedule:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const quickApplyType = async (presetType: string) => {
    let wh = editWorkingHours;
    if (presetType === "오픈") wh = openShiftHour;
    else if (presetType === "미들") wh = middleShiftHour;
    else if (presetType === "마감") wh = closeShiftHour;
    else if (["휴무", "월차", "지정휴무"].includes(presetType)) wh = "";
    setEditType(presetType);
    setEditWorkingHours(wh);
    await saveWith({ type: presetType, workingHours: wh });
  };

  const handleSave = () => saveWith();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]"
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
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map((d, i) => (
              <div key={d} className={`text-center text-[10px] font-bold py-1 ${i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : "text-slate-400"}`}>
                {d}
              </div>
            ))}
          </div>

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
                  const isEditing = editingDay === day;
                  const dow = (firstDow + day - 1) % 7;
                  return (
                    <div
                      key={di}
                      onClick={() => openEditDay(day)}
                      className={`rounded-lg p-1 flex flex-col items-center min-h-[52px] border transition-all ${
                        color ? `${color.bg} border-transparent` : "bg-white border-slate-100"
                      } ${isToday ? "ring-2 ring-indigo-400 ring-offset-1" : ""} ${
                        isEditing ? "ring-2 ring-blue-500 scale-105 z-10 shadow-md" : ""
                      } ${isAdmin && onUpdate ? "cursor-pointer hover:shadow-sm hover:scale-[1.02]" : ""}`}
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

        {/* Inline Edit Panel — shown when a day is selected (admin only) */}
        {isAdmin && onUpdate && editingDay !== null && (
          <div className="flex-shrink-0 border-t-2 border-blue-200 bg-blue-50/40 px-4 py-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-blue-700">
                {month}월 {editingDay}일 스케줄 편집
              </span>
              <button
                onClick={() => setEditingDay(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded transition cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>

            {/* Quick presets — click immediately saves */}
            <div className="flex flex-wrap gap-1">
              {activeTypes.map((t) => {
                const c = SCHEDULE_COLORS[t.value] || DEFAULT_COLOR;
                const isActive = editType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    disabled={isSaving}
                    onClick={() => quickApplyType(t.value)}
                    className={`px-2.5 py-1.5 text-[10px] font-extrabold rounded-lg border transition cursor-pointer disabled:opacity-50 ${
                      isActive
                        ? `${c.bg} ${c.text} border-blue-400 ring-2 ring-blue-400/30 shadow-sm`
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {isActive && isSaving ? "저장중..." : t.label}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={isSaving}
                onClick={() => quickApplyType("결근")}
                className="px-2.5 py-1.5 text-[10px] font-extrabold rounded-lg border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 transition cursor-pointer disabled:opacity-50"
              >
                🚨 결근
              </button>
            </div>

            {/* Hint text */}
            <p className="text-[9px] text-blue-500 font-semibold -mt-1">
              ▲ 버튼 클릭 즉시 저장됩니다. 시간/메모는 아래에서 수정 후 저장 버튼을 누르세요.
            </p>

            {/* Working hours */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 flex items-center gap-0.5">
                  <Clock size={9} /> 근무 시간
                </label>
                <input
                  type="text"
                  value={editWorkingHours}
                  onChange={e => setEditWorkingHours(e.target.value)}
                  placeholder="09:30-18:30"
                  className="w-full text-[11px] rounded border border-slate-200 focus:border-blue-400 p-1.5 bg-white focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 flex items-center gap-0.5">
                  <MessageSquare size={9} /> 실근무/기타
                </label>
                <input
                  type="text"
                  value={editActualHours}
                  onChange={e => setEditActualHours(e.target.value)}
                  placeholder="지각, 조퇴..."
                  className="w-full text-[11px] rounded border border-slate-200 focus:border-blue-400 p-1.5 bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Memo */}
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">메모</label>
              <input
                type="text"
                value={editMemo}
                onChange={e => setEditMemo(e.target.value)}
                placeholder="메모 (마우스 오버 시 표시)"
                className="w-full text-[11px] rounded border border-slate-200 focus:border-blue-400 p-1.5 bg-white focus:outline-none"
              />
            </div>

            {/* Save */}
            <div className="flex justify-end gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setEditingDay(null)}
                className="px-3 py-1.5 text-[11px] font-semibold bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-3 py-1.5 text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded inline-flex items-center gap-1 transition cursor-pointer disabled:opacity-60"
              >
                <Save size={11} />
                {isSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        )}

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
