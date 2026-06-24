import React, { useState } from "react";
import {
  X, ChevronLeft, ChevronRight, Save, Clock, MessageSquare,
  Calendar, CheckCircle, MapPin,
} from "lucide-react";
import { Employee, Schedule } from "../types";
import { SCHEDULE_COLORS, SCHEDULE_TYPES, DEFAULT_COLOR } from "../constants";
import { ZONE_DEFS, SECTION_LABEL, type ZoneDef, type ZoneSection } from "../constants/displayZones";

interface BulkItem {
  date: string;
  type: string;
  workingHours: string;
  actualHours: string;
  memo: string;
}

export interface LogisticsZoneProps {
  assignedZoneNums: number[];
  onToggle: (zoneNum: number) => void;
  onClearAll: () => void;
}

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
  onBulkSave?: (items: BulkItem[]) => Promise<void>;
  scheduleTypes?: { value: string; label: string }[];
  openShiftHour?: string;
  middleShiftHour?: string;
  closeShiftHour?: string;
  logisticsZoneProps?: LogisticsZoneProps;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// ─── Zone assignment sub-component (logistics only) ───────────────────────────
const SECTION_ORDER: ZoneSection[] = ["top_wall", "aisle", "left_wall", "bottom_wall", "wing"];

const ZoneAssignTab: React.FC<{
  employee: Employee;
  assignedZoneNums: number[];
  onToggle: (num: number) => void;
  onClearAll: () => void;
}> = ({ employee, assignedZoneNums, onToggle, onClearAll }) => {
  const grouped = SECTION_ORDER.map((section) => ({
    section,
    label: SECTION_LABEL[section],
    zones: ZONE_DEFS.filter((z) => z.section === section),
  }));

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
        <div className="flex items-center gap-2">
          <MapPin size={13} className="text-violet-600 shrink-0" />
          <span className="text-xs font-bold text-violet-800">
            {employee.name}님 배정 구역: {assignedZoneNums.length > 0 ? assignedZoneNums.sort((a, b) => a - b).join(", ") + "번" : "없음"}
          </span>
        </div>
        {assignedZoneNums.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[10px] font-bold text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg transition cursor-pointer"
          >
            전체 해제
          </button>
        )}
      </div>

      {/* Zone groups */}
      {grouped.map(({ section, label, zones }) => (
        <div key={section}>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">{label}</div>
          <div className="grid grid-cols-4 gap-1.5">
            {zones.map((z) => {
              const isAssigned = assignedZoneNums.includes(z.num);
              return (
                <button
                  key={z.num}
                  type="button"
                  onClick={() => onToggle(z.num)}
                  className={`rounded-lg border-2 p-1.5 text-left transition-all cursor-pointer active:scale-[0.96] ${
                    isAssigned
                      ? "bg-violet-100 border-violet-400 shadow-sm"
                      : "bg-white border-slate-200 hover:border-violet-300 hover:bg-violet-50"
                  }`}
                >
                  <div className={`text-[11px] font-black leading-tight ${isAssigned ? "text-violet-800" : "text-slate-700"}`}>
                    {z.num}번
                  </div>
                  <div className={`text-[8px] leading-tight mt-0.5 line-clamp-2 ${isAssigned ? "text-violet-600" : "text-slate-400"}`}>
                    {z.label}
                  </div>
                  {isAssigned && (
                    <div className="mt-1 w-3 h-3 rounded-full bg-violet-500 flex items-center justify-center">
                      <span className="text-white text-[7px] font-black">✓</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export const EmployeeCalendarModal: React.FC<Props> = ({
  employee,
  initialYear,
  initialMonth,
  onClose,
  isAdmin = false,
  onUpdate,
  onBulkSave,
  scheduleTypes: scheduleTypesProp,
  openShiftHour = "09:30-18:30",
  middleShiftHour = "11:00-20:00",
  closeShiftHour = "13:00-22:00",
  logisticsZoneProps,
}) => {
  const activeTypes = scheduleTypesProp ?? SCHEDULE_TYPES;
  const isLogistics = employee.position === "물류";

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [activeTab, setActiveTab] = useState<"calendar" | "bulk" | "zone">(
    isLogistics && logisticsZoneProps ? "zone" : "calendar"
  );

  // ── Calendar tab state ──────────────────────────────────────────
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [editType, setEditType] = useState("");
  const [editWorkingHours, setEditWorkingHours] = useState("");
  const [editActualHours, setEditActualHours] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // ── Bulk tab state ──────────────────────────────────────────────
  const [bulkSelectedDates, setBulkSelectedDates] = useState<string[]>([]);
  const [bulkType, setBulkType] = useState("오픈");
  const [bulkWorkingHours, setBulkWorkingHours] = useState(openShiftHour);
  const [bulkActualHours, setBulkActualHours] = useState("");
  const [bulkMemo, setBulkMemo] = useState("");
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  // ── Shared helpers ──────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setEditingDay(null);
    setBulkSelectedDates([]);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setEditingDay(null);
    setBulkSelectedDates([]);
  };

  const totalDays = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const monthStr = String(month).padStart(2, "0");

  const getDayDetails = (day: number) => {
    const fullDate = `${year}-${monthStr}-${String(day).padStart(2, "0")}`;
    const dayIndex = new Date(year, month - 1, day).getDay();
    const dayWord = DAY_LABELS[dayIndex];
    return { fullDate, dayIndex, dayWord };
  };

  const daysList = Array.from({ length: totalDays }, (_, i) => i + 1);

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

  // ── Calendar tab handlers ───────────────────────────────────────
  const CYCLE = ["오픈", "미들", "마감", "휴무"];

  const openEditDay = (day: number) => {
    if (!isAdmin || !onUpdate) return;
    const sc = schedMap[day];
    setEditType(sc?.type || "");
    setEditWorkingHours(sc?.workingHours || "");
    setEditActualHours(sc?.actualHours || "");
    setEditMemo(sc?.memo || "");
    setEditingDay(day);
  };

  const handleDayQuickCycle = async (day: number) => {
    if (!isAdmin || !onUpdate) return;
    const sc = schedMap[day];
    const cur = sc?.type || "";
    const idx = CYCLE.indexOf(cur);
    const nextType = CYCLE[(idx + 1) % CYCLE.length];
    let nextWh = "";
    if (nextType === "오픈") nextWh = openShiftHour;
    else if (nextType === "미들") nextWh = middleShiftHour;
    else if (nextType === "마감") nextWh = closeShiftHour;
    const dayStr = String(day).padStart(2, "0");
    setEditType(nextType);
    setEditWorkingHours(nextWh);
    setEditActualHours(sc?.actualHours || "");
    setEditMemo(sc?.memo || "");
    setEditingDay(day);
    try {
      await onUpdate({
        employeeId: employee.id,
        date: `${year}-${monthStr}-${dayStr}`,
        type: nextType,
        workingHours: nextWh,
        actualHours: sc?.actualHours || "",
        memo: sc?.memo || "",
      });
    } catch (err) {
      console.error("Failed to cycle schedule:", err);
    }
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

  // ── Bulk tab handlers ───────────────────────────────────────────
  const handleBulkTypeChange = (newType: string) => {
    setBulkType(newType);
    if (newType === "오픈") setBulkWorkingHours(openShiftHour);
    else if (newType === "마감") setBulkWorkingHours(closeShiftHour);
    else if (newType === "미들") setBulkWorkingHours(middleShiftHour);
    else setBulkWorkingHours("");
  };

  const selectAll = () => setBulkSelectedDates(daysList.map(d => getDayDetails(d).fullDate));
  const deselectAll = () => setBulkSelectedDates([]);
  const selectWeekdays = () =>
    setBulkSelectedDates(daysList.filter(d => { const i = getDayDetails(d).dayIndex; return i >= 1 && i <= 5; }).map(d => getDayDetails(d).fullDate));
  const selectWeekends = () =>
    setBulkSelectedDates(daysList.filter(d => { const i = getDayDetails(d).dayIndex; return i === 0 || i === 6; }).map(d => getDayDetails(d).fullDate));
  const toggleWeekday = (target: number) => {
    const targetDates = daysList.filter(d => getDayDetails(d).dayIndex === target).map(d => getDayDetails(d).fullDate);
    const allSelected = targetDates.every(d => bulkSelectedDates.includes(d));
    if (allSelected) {
      setBulkSelectedDates(bulkSelectedDates.filter(d => !targetDates.includes(d)));
    } else {
      const next = [...bulkSelectedDates];
      targetDates.forEach(d => { if (!next.includes(d)) next.push(d); });
      setBulkSelectedDates(next);
    }
  };

  const handleBulkSave = async () => {
    if (!onBulkSave || bulkSelectedDates.length === 0) return;
    setIsBulkSaving(true);
    try {
      await onBulkSave(bulkSelectedDates.map(date => ({
        date,
        type: bulkType,
        workingHours: bulkWorkingHours,
        actualHours: bulkActualHours,
        memo: bulkMemo,
      })));
      setBulkSelectedDates([]);
      setBulkActualHours("");
      setBulkMemo("");
      setActiveTab("calendar");
    } catch (err) {
      console.error("Bulk save failed:", err);
    } finally {
      setIsBulkSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
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

        {/* Tab bar */}
        {(isAdmin || (isLogistics && logisticsZoneProps)) && (
          <div className="flex border-b border-slate-200 bg-slate-50 flex-shrink-0">
            {isAdmin && (
              <>
                <button
                  onClick={() => setActiveTab("calendar")}
                  className={`flex-1 py-2.5 text-[11px] font-bold transition flex items-center justify-center gap-1.5 ${
                    activeTab === "calendar"
                      ? "text-indigo-600 border-b-2 border-indigo-500 bg-white"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Calendar size={12} /> 달력
                </button>
                <button
                  onClick={() => setActiveTab("bulk")}
                  className={`flex-1 py-2.5 text-[11px] font-bold transition flex items-center justify-center gap-1.5 ${
                    activeTab === "bulk"
                      ? "text-blue-600 border-b-2 border-blue-500 bg-white"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <CheckCircle size={12} /> 일괄 등록
                </button>
              </>
            )}
            {isLogistics && logisticsZoneProps && (
              <button
                onClick={() => setActiveTab("zone")}
                className={`flex-1 py-2.5 text-[11px] font-bold transition flex items-center justify-center gap-1.5 ${
                  activeTab === "zone"
                    ? "text-violet-600 border-b-2 border-violet-500 bg-white"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <MapPin size={12} /> 구역 배정
                {logisticsZoneProps.assignedZoneNums.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded-full text-[9px] font-black">
                    {logisticsZoneProps.assignedZoneNums.length}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

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

        {/* ── CALENDAR TAB ── */}
        {activeTab === "calendar" && (
          <>
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
                          onClick={() => handleDayQuickCycle(day)}
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

            {/* Inline Edit Panel */}
            {isAdmin && onUpdate && editingDay !== null && (
              <div className="flex-shrink-0 border-t-2 border-blue-200 bg-blue-50/40 px-4 py-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-blue-700">
                    {month}월 {editingDay}일 스케줄 편집
                  </span>
                  <button onClick={() => setEditingDay(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded transition cursor-pointer">
                    <X size={13} />
                  </button>
                </div>

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

                <p className="text-[9px] text-blue-500 font-semibold -mt-1">
                  ▲ 버튼 클릭 즉시 저장됩니다. 시간/메모는 아래에서 수정 후 저장 버튼을 누르세요.
                </p>

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
                    onClick={() => saveWith()}
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
          </>
        )}

        {/* ── ZONE ASSIGNMENT TAB ── */}
        {activeTab === "zone" && logisticsZoneProps && (
          <ZoneAssignTab
            employee={employee}
            assignedZoneNums={logisticsZoneProps.assignedZoneNums}
            onToggle={logisticsZoneProps.onToggle}
            onClearAll={logisticsZoneProps.onClearAll}
          />
        )}

        {/* ── BULK TAB ── */}
        {activeTab === "bulk" && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-slate-800 text-xs">

            {/* Step 1: Date selection */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <span className="bg-blue-600 text-white w-4 h-4 rounded-full flex items-center justify-center text-[9px]">1</span>
                  날짜 선택 ({bulkSelectedDates.length}일 선택됨)
                </span>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={selectAll} className="px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer transition">전체선택</button>
                  <button type="button" onClick={deselectAll} className="px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer transition">선택해제</button>
                  <button type="button" onClick={selectWeekdays} className="px-2 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-100 hover:bg-emerald-100 rounded cursor-pointer transition">평일(월-금)</button>
                  <button type="button" onClick={selectWeekends} className="px-2 py-1 text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-100 hover:bg-rose-100 rounded cursor-pointer transition">주말(토-일)</button>
                </div>
              </div>

              {/* Weekday toggle buttons */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-2 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide shrink-0">요일 단위:</span>
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: "월", val: 1 }, { label: "화", val: 2 }, { label: "수", val: 3 },
                    { label: "목", val: 4 }, { label: "금", val: 5 },
                    { label: "토", val: 6, extra: "text-blue-700 border-blue-200 hover:bg-blue-100 bg-blue-50/40" },
                    { label: "일", val: 0, extra: "text-rose-700 border-rose-200 hover:bg-rose-100 bg-rose-50/40" },
                  ].map((w) => (
                    <button
                      key={w.val}
                      type="button"
                      onClick={() => toggleWeekday(w.val)}
                      className={`px-2 py-1 text-[10px] font-semibold border rounded-lg cursor-pointer transition ${w.extra ?? "text-slate-700 border-slate-200 hover:bg-slate-100"}`}
                    >
                      {w.label}요일
                    </button>
                  ))}
                </div>
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-1 p-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl">
                {daysList.map((dayNum) => {
                  const { dayWord, dayIndex, fullDate } = getDayDetails(dayNum);
                  const isChecked = bulkSelectedDates.includes(fullDate);
                  return (
                    <label
                      key={dayNum}
                      className={`flex flex-col items-center justify-center py-1.5 border rounded-lg cursor-pointer text-center select-none transition ${
                        isChecked
                          ? "bg-blue-50 border-blue-400 text-blue-700 font-extrabold"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) setBulkSelectedDates(bulkSelectedDates.filter(d => d !== fullDate));
                          else setBulkSelectedDates([...bulkSelectedDates, fullDate]);
                        }}
                        className="sr-only"
                      />
                      <span className={`text-[8px] ${isChecked ? "text-blue-600" : dayIndex === 6 ? "text-blue-500" : dayIndex === 0 ? "text-rose-500" : "text-slate-400"}`}>
                        {dayWord}
                      </span>
                      <span className="text-[11px] font-bold">{dayNum}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Schedule settings */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span className="bg-blue-600 text-white w-4 h-4 rounded-full flex items-center justify-center text-[9px]">2</span>
                근무 조건 설정
              </span>

              {/* Quick attendance */}
              <div className="p-2 border border-blue-200 bg-blue-50/50 rounded-xl space-y-1">
                <label className="block text-[10px] font-black text-blue-800">⚡ 일괄 근태 빠른 지정</label>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setBulkActualHours("")} className="px-2 py-1 text-[10px] font-extrabold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded cursor-pointer transition">초기화</button>
                  <button type="button" onClick={() => { setBulkActualHours("지각"); setBulkWorkingHours(openShiftHour); }} className="px-2 py-1 text-[10px] font-extrabold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-200 rounded cursor-pointer transition">⚠️ 지각</button>
                  <button type="button" onClick={() => setBulkActualHours("조퇴")} className="px-2 py-1 text-[10px] font-extrabold bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-200 rounded cursor-pointer transition">🏃 조퇴</button>
                  <button type="button" onClick={() => { setBulkActualHours("결근"); setBulkType("결근"); setBulkWorkingHours(""); }} className="px-2 py-1 text-[10px] font-extrabold bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-200 rounded cursor-pointer transition">🚨 결근</button>
                </div>
              </div>

              {/* Shift presets */}
              <div className="p-2 border border-slate-100 bg-slate-50/50 rounded-xl space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">근무 패턴 템플릿:</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: `오픈 (${openShiftHour})`, val: "오픈" },
                    { label: `미들 (${middleShiftHour})`, val: "미들" },
                    { label: `마감 (${closeShiftHour})`, val: "마감" },
                    { label: "휴무", val: "휴무" },
                    { label: "월차", val: "월차" },
                    { label: "지정휴무", val: "지정휴무" },
                    { label: "오전반차", val: "오전반차" },
                    { label: "오후반차", val: "오후반차" },
                  ].map((ps) => (
                    <button
                      key={ps.val}
                      type="button"
                      onClick={() => handleBulkTypeChange(ps.val)}
                      className={`px-2.5 py-1 text-[10px] rounded border transition cursor-pointer font-semibold ${
                        bulkType === ps.val
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {ps.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1 flex items-center gap-1">
                    <Clock size={11} className="text-slate-400" /> 근무 시간
                  </label>
                  <input
                    type="text"
                    value={bulkWorkingHours}
                    onChange={e => setBulkWorkingHours(e.target.value)}
                    placeholder="예: 09:30-18:30"
                    className="w-full text-xs rounded-xl border border-[#e2e8f0] focus:border-blue-400 p-2 bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1 flex items-center gap-1">
                    <MessageSquare size={11} className="text-slate-400" /> 특이사항
                  </label>
                  <input
                    type="text"
                    value={bulkActualHours}
                    onChange={e => setBulkActualHours(e.target.value)}
                    placeholder="예: 2시간 연장, 지각, 조퇴"
                    className="w-full text-xs rounded-xl border border-[#e2e8f0] focus:border-blue-400 p-2 bg-white focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1 flex items-center gap-1">
                    <MessageSquare size={11} className="text-blue-500" /> 메모
                  </label>
                  <input
                    type="text"
                    value={bulkMemo}
                    onChange={e => setBulkMemo(e.target.value)}
                    placeholder="마우스 오버 시 표시될 메모"
                    className="w-full text-xs rounded-xl border border-[#e2e8f0] focus:border-blue-400 p-2 bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Bulk save button */}
            <div className="flex justify-end gap-2 pt-1 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("calendar")}
                className="px-4 py-2 text-xs font-bold bg-slate-50 hover:bg-slate-100 rounded border border-[#e2e8f0] text-slate-600 transition cursor-pointer"
                disabled={isBulkSaving}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleBulkSave}
                disabled={isBulkSaving || bulkSelectedDates.length === 0}
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isBulkSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                    <span>반영 중...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={13} />
                    <span>선택한 {bulkSelectedDates.length}일 일괄 등록</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
