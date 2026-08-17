import React, { useState, useEffect } from "react";
import {
  X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Save, Clock, MessageSquare,
  Calendar, CheckCircle, MapPin, User, Lock,
} from "lucide-react";
import { Employee, Schedule } from "../../types";
import { SCHEDULE_TYPES, getTypeHex, isLightHex } from "../../constants";
import type { ScheduleTypeEntry } from "../../constants";
import { ZoneAssignTab, type LogisticsZoneProps } from "./ZoneAssignTab";
import { EmployeeInfoForm, type EmployeeInfoValues } from "../common/EmployeeInfoForm";
import { EmployeeProfileCard } from "../common/EmployeeProfileCard";

export type { LogisticsZoneProps };

interface BulkItem {
  date: string;
  type: string;
  workingHours: string;
  actualHours: string;
  memo: string;
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
  scheduleTypeEntries?: ScheduleTypeEntry[];
  typeHoursMap?: Record<string, string>;
  logisticsZoneProps?: LogisticsZoneProps;
  onEditEmployee?: () => void;
  isLocked?: boolean;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export const EmployeeCalendarModal: React.FC<Props> = ({
  employee,
  initialYear,
  initialMonth,
  onClose,
  isAdmin = false,
  onUpdate,
  onBulkSave,
  scheduleTypes: scheduleTypesProp,
  scheduleTypeEntries,
  typeHoursMap,
  logisticsZoneProps,
  onEditEmployee,
  isLocked = false,
}) => {
  const activeTypes = scheduleTypesProp ?? SCHEDULE_TYPES;
  const isLogistics = employee.position.includes("물류");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 로컬 employee state · 자식 (EmployeeProfileCard) 파일 업로드 성공 시 반영
  const [localEmployee, setLocalEmployee] = useState<Employee>(employee);
  useEffect(() => { setLocalEmployee(employee); }, [employee]);

  // 2026-08-17 · 사용자 지시 · 반응형 · 직원정보 접기 · 달력·일괄등록 우선 노출
  //   · md 미만 기본 접힘 (달력 우선) · 토글로 펼침 · md+ 항상 노출 (좌측 sidebar)
  const [profileCollapsedMobile, setProfileCollapsedMobile] = useState(true);

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  // 2026-08-17 · 사용자 지시 · 기본 탭은 달력 (logistics 여부 무관 · 관리자·물류 모두 달력 우선)
  const [activeTab, setActiveTab] = useState<"calendar" | "bulk" | "zone" | "info">("calendar");

  // Schedules for the currently displayed month (may differ from initialYear/initialMonth)
  const [monthSchedules, setMonthSchedules] = useState<Schedule[]>(employee.schedules);

  useEffect(() => {
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    const alreadyLoaded = employee.schedules.some(s => s.date.startsWith(ym));
    if (year === initialYear && month === initialMonth) {
      setMonthSchedules(employee.schedules);
      return;
    }
    if (alreadyLoaded) {
      setMonthSchedules(employee.schedules.filter(s => s.date.startsWith(ym)));
      return;
    }
    fetch(`/api/schedules?year=${year}&month=${month}`)
      .then(r => r.json())
      .then((data: { employees?: Array<{ id: number; schedules: Schedule[] }> }) => {
        const found = data.employees?.find(e => e.id === employee.id);
        setMonthSchedules(found?.schedules ?? []);
      })
      .catch(() => setMonthSchedules([]));
  }, [year, month, initialYear, initialMonth, employee.id, employee.schedules]);

  // ── Calendar tab state ──────────────────────────────────────────
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [editType, setEditType] = useState("");
  const [editWorkingHours, setEditWorkingHours] = useState("");
  const [editActualHours, setEditActualHours] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // 2026-08-10 · 사용자 요청 · 달력 셀 편집 · 즉시 서버 저장 X · 로컬 pending 에 저장 후 [저장] 클릭 시 batch 반영
  const [pendingChanges, setPendingChanges] = useState<
    Record<string, { type: string; workingHours: string; actualHours: string; memo: string }>
  >({});
  const [isBatchSaving, setIsBatchSaving] = useState(false);

  // 월 이동 시 pending 초기화
  useEffect(() => {
    setPendingChanges({});
  }, [year, month]);

  // ── Bulk tab state ──────────────────────────────────────────────
  const [bulkSelectedDates, setBulkSelectedDates] = useState<string[]>([]);
  const [bulkType, setBulkType] = useState("오픈");
  const [bulkWorkingHours, setBulkWorkingHours] = useState(typeHoursMap?.["오픈"] ?? "");
  const [bulkActualHours, setBulkActualHours] = useState("");
  const [bulkMemo, setBulkMemo] = useState("");
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);

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
  for (const sc of monthSchedules) {
    if (sc.date.startsWith(`${year}-${monthStr}-`)) {
      const day = parseInt(sc.date.slice(8));
      schedMap[day] = { type: sc.type, workingHours: sc.workingHours, actualHours: sc.actualHours, memo: sc.memo || "" };
    }
  }
  // pending 변경사항 · 서버 저장 전 · UI 에만 반영 (마감 전 편집)
  for (const [date, ch] of Object.entries(pendingChanges)) {
    if (date.startsWith(`${year}-${monthStr}-`)) {
      const day = parseInt(date.slice(8));
      schedMap[day] = ch;
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

  // 2026-08-17 · #139 · 사용자 지시 · 팝업 X · 클릭할 때마다 근무형태만 순환 · pending 즉시 반영
  const handleDayQuickCycle = (day: number) => {
    if (!isAdmin || !onUpdate) return;
    const sc = schedMap[day];
    const cur = sc?.type || "";
    const idx = CYCLE.indexOf(cur);
    const nextType = CYCLE[(idx + 1) % CYCLE.length];
    const nextWh = typeHoursMap?.[nextType] ?? "";
    const dayStr = String(day).padStart(2, "0");
    const date = `${year}-${monthStr}-${dayStr}`;
    // editingDay set X · 팝업 안 뜸 · pending 에만 반영 · 상단 [저장] 버튼으로 batch 전송
    setPendingChanges(prev => ({
      ...prev,
      [date]: {
        type: nextType,
        workingHours: nextWh,
        actualHours: sc?.actualHours || "",
        memo: sc?.memo || "",
      },
    }));
  };

  // 편집 패널 [저장] · pending 에만 반영 (서버는 상단 batch [저장] 버튼)
  const saveWith = (overrides: { type?: string; workingHours?: string; actualHours?: string; memo?: string } = {}) => {
    if (editingDay === null) return;
    const dayStr = String(editingDay).padStart(2, "0");
    const date = `${year}-${monthStr}-${dayStr}`;
    const payload = {
      type: overrides.type ?? editType ?? "휴무",
      workingHours: overrides.workingHours ?? editWorkingHours,
      actualHours: overrides.actualHours ?? editActualHours,
      memo: overrides.memo ?? editMemo,
    };
    setEditType(payload.type);
    setEditWorkingHours(payload.workingHours);
    setEditActualHours(payload.actualHours);
    setEditMemo(payload.memo);
    setPendingChanges(prev => ({ ...prev, [date]: payload }));
  };

  const quickApplyType = (presetType: string) => {
    let wh = typeHoursMap?.[presetType] ?? editWorkingHours;
    if (["휴무", "월차", "지정휴무"].includes(presetType)) wh = "";
    setEditType(presetType);
    setEditWorkingHours(wh);
    saveWith({ type: presetType, workingHours: wh });
  };

  // batch 저장 · pendingChanges 를 서버에 순차 반영
  const handleBatchSave = async () => {
    if (!onUpdate) return;
    const entries = Object.entries(pendingChanges);
    if (entries.length === 0) return;
    setIsBatchSaving(true);
    try {
      for (const [date, ch] of entries) {
        await onUpdate({
          employeeId: employee.id,
          date,
          type: ch.type,
          workingHours: ch.workingHours,
          actualHours: ch.actualHours,
          memo: ch.memo,
        });
      }
      setPendingChanges({});
      setEditingDay(null);
    } catch (err) {
      console.error("Batch save failed:", err);
    } finally {
      setIsBatchSaving(false);
    }
  };

  const handleDiscardPending = () => {
    if (Object.keys(pendingChanges).length === 0) return;
    if (!window.confirm("변경사항을 취소하시겠습니까?")) return;
    setPendingChanges({});
    setEditingDay(null);
  };

  // ── Bulk tab handlers ───────────────────────────────────────────
  const handleBulkTypeChange = (newType: string) => {
    setBulkType(newType);
    setBulkWorkingHours(typeHoursMap?.[newType] ?? "");
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
      {/* 2026-08-17 · 사용자 지시 · PC 너무 넓음 · max-w-5xl → max-w-4xl · 최신 트렌드 · 보기 좋은 폭 */}
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl lg:max-w-4xl overflow-hidden flex flex-col max-h-[95vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header · 2026-08-17 · 사용자 지시 · "직원정보 / 월별 스케쥴" 타이틀 · 딥네이비 톤 */}
        <div className="bg-brand-deep text-white px-5 py-3.5 flex-shrink-0 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <User size={18} strokeWidth={2.2} className="text-white/85 shrink-0" />
            <span className="text-[18px] font-extrabold tracking-tight">직원정보 / 월별 스케쥴</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* 2026-08-17 · 사용자 지시 · 반응형 · 직원정보 접기 토글 (md 미만 · md+ 는 사이드바 상시) */}
        <button
          type="button"
          onClick={() => setProfileCollapsedMobile(v => !v)}
          className="md:hidden flex items-center gap-2 px-4 py-2.5 border-b-2 border-brand-deep/15 bg-brand-tint text-[16px] font-semibold text-brand-deep hover:brightness-95 transition-all cursor-pointer shrink-0"
        >
          <User size={16} strokeWidth={2.2} className="shrink-0" />
          <span>직원정보</span>
          {/* 2026-08-17 · 사용자 지시 · 펼치기/접기 라벨 · 직원정보 옆으로 가깝게 */}
          <span className="ml-1 flex items-center gap-0.5 text-[15px] text-brand">
            {profileCollapsedMobile ? "펼치기" : "접기"}
            {profileCollapsedMobile ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </span>
        </button>

        {/* Body · 좌 (직원정보 항상) + 우 (탭) · 반응형 stack (md 미만은 위/아래) */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* ── LEFT · 직원정보 · md 미만 접힘 시 hidden · md+ 항상 노출 ── */}
          <aside className={`${profileCollapsedMobile ? "hidden" : "block"} md:!block md:w-[300px] md:min-w-[300px] md:max-w-[300px] md:border-r border-b md:border-b-0 border-zinc-100 bg-zinc-50/50 overflow-y-auto shrink-0 max-h-[45vh] md:max-h-none`}>
            <div className="p-3.5 space-y-3">
              {isLocked && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <Lock size={12} className="text-amber-500 shrink-0" />
                  <span className="text-xs font-semibold text-amber-700">이달 스케줄 확정</span>
                </div>
              )}
              <EmployeeProfileCard
                employee={localEmployee}
                onEmployeeChange={(u) => setLocalEmployee(u)}
                onEdit={onEditEmployee}
              />
              {(localEmployee.address || localEmployee.email) && (
                <div className="bg-white border border-zinc-100 rounded-xl p-3">
                  <EmployeeInfoForm
                    values={{
                      name: localEmployee.name || "",
                      phone: localEmployee.phone || "",
                      gender: (localEmployee.gender as "남" | "여" | undefined) ?? "",
                      position: localEmployee.position || "",
                      workplace: localEmployee.workplace || "",
                      hireDate: localEmployee.hireDate || "",
                      rank: localEmployee.rank || "",
                      birthDate: "",
                      address: localEmployee.address || "",
                      email: localEmployee.email || "",
                    }}
                    onChange={() => { /* read-only */ }}
                    layout="grid"
                    editing={false}
                    fields={["address", "email"]}
                  />
                </div>
              )}
              {employee.description && (
                <div className="text-[12px] font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  {employee.description}
                </div>
              )}
            </div>
          </aside>

          {/* ── RIGHT · 탭 · 달력/일괄/구역 ── */}
          <section className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {/* Tab bar · segmented · 최신 트렌드 (Linear/Vercel) · rounded pill · deep navy accent */}
            {(isAdmin || (isLogistics && logisticsZoneProps)) && (
              <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-zinc-100 flex-shrink-0 bg-white overflow-x-auto">
                {isAdmin && (
                  <>
                    <button
                      onClick={() => setActiveTab("calendar")}
                      className={`flex items-center gap-1.5 px-3.5 py-2 text-[17px] font-semibold rounded-lg transition-colors ${
                        activeTab === "calendar"
                          ? "bg-brand-deep text-white shadow-sm"
                          : "text-ink-soft hover:bg-zinc-100 hover:text-ink cursor-pointer"
                      }`}
                    >
                      <Calendar size={14} strokeWidth={2.2} /> 달력
                    </button>
                    <button
                      onClick={() => setActiveTab("bulk")}
                      className={`flex items-center gap-1.5 px-3.5 py-2 text-[17px] font-semibold rounded-lg transition-colors ${
                        activeTab === "bulk"
                          ? "bg-brand-deep text-white shadow-sm"
                          : "text-ink-soft hover:bg-zinc-100 hover:text-ink cursor-pointer"
                      }`}
                    >
                      <CheckCircle size={14} strokeWidth={2.2} /> 일괄 등록
                    </button>
                  </>
                )}
                {isLogistics && logisticsZoneProps && (
                  <button
                    onClick={() => setActiveTab("zone")}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-[17px] font-semibold rounded-lg transition-colors ${
                      activeTab === "zone"
                        ? "bg-brand-deep text-white shadow-sm"
                        : "text-ink-soft hover:bg-zinc-100 hover:text-ink cursor-pointer"
                    }`}
                  >
                    <MapPin size={14} strokeWidth={2.2} /> 구역 배정
                    {logisticsZoneProps.assignedZoneNums.length > 0 && (
                      <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        activeTab === "zone" ? "bg-white/20 text-white" : "bg-brand-tint text-brand-deep"
                      }`}>
                        {logisticsZoneProps.assignedZoneNums.length}
                      </span>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Month nav · 달력·일괄등록 탭 에서만 노출 */}
            {activeTab !== "info" && activeTab !== "zone" && (
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-zinc-100 bg-zinc-50/50 flex-shrink-0">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer">
                  <ChevronLeft size={16} className="text-zinc-600" />
                </button>
                <span className="text-[15px] font-bold text-ink">{year}년 {month}월</span>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer">
                  <ChevronRight size={16} className="text-zinc-600" />
                </button>
              </div>
            )}

        {/* ── CALENDAR TAB · 2026-08-17 · 사용자 지시 · 살짝 스크롤 허용 · 최신 트렌드 · 세련 ── */}
        {activeTab === "calendar" && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              <div className="grid grid-cols-7 mb-2">
                {DAY_LABELS.map((d, i) => (
                  <div key={d} className={`text-center text-[14px] font-bold py-1.5 tracking-wide ${i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : "text-ink-soft"}`}>
                    {d}
                  </div>
                ))}
              </div>

              {/* weeks · 자연 높이 · 스크롤 허용 */}
              <div className="flex flex-col gap-1.5">
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-1.5">
                    {week.map((day, di) => {
                      if (!day) return <div key={di} />;
                      const sc = schedMap[day];
                      const dayStr = `${year}-${monthStr}-${String(day).padStart(2, "0")}`;
                      // 입사일 · 퇴사일 · 재직기간 밖 여부
                      const isHireDay   = !!employee.hireDate   && dayStr === employee.hireDate;
                      const isRetireDay = !!employee.retireDate && dayStr === employee.retireDate;
                      const beforeHire  = !!employee.hireDate   && dayStr < employee.hireDate;
                      const afterRetire = !!employee.retireDate && dayStr > employee.retireDate;
                      const outOfEmployment = beforeHire || afterRetire;
                      const dayBgHex = !outOfEmployment && sc?.type ? getTypeHex(sc.type, scheduleTypeEntries) : null;
                      const dayIsLight = dayBgHex ? isLightHex(dayBgHex) : true;
                      const isToday = (
                        new Date().getFullYear() === year &&
                        new Date().getMonth() + 1 === month &&
                        new Date().getDate() === day
                      );
                      const isEditing = editingDay === day;
                      const dow = (firstDow + day - 1) % 7;
                      const canClick = !outOfEmployment && isAdmin && onUpdate;
                      return (
                        <div
                          key={di}
                          onClick={canClick ? () => handleDayQuickCycle(day) : undefined}
                          title={
                            isHireDay ? `입사일 (${employee.hireDate})` :
                            isRetireDay ? `퇴사일 (${employee.retireDate})` :
                            outOfEmployment ? (beforeHire ? "입사일 이전 — 근무 불가" : "퇴사일 이후 — 근무 불가") : undefined
                          }
                          className={`relative rounded-xl p-1.5 flex flex-col items-center min-h-[64px] border transition-all overflow-hidden ${
                            outOfEmployment ? "bg-zinc-100 border-line cursor-not-allowed opacity-70" :
                            (dayBgHex ? "border-transparent" : "bg-white border-zinc-100")
                          } ${isHireDay ? "ring-2 ring-emerald-500" : ""} ${isRetireDay ? "ring-2 ring-rose-500" : ""} ${isToday ? "ring-2 ring-indigo-400 ring-offset-1" : ""} ${
                            isEditing ? "ring-2 ring-blue-500 scale-105 z-10 shadow-md" : ""
                          } ${pendingChanges[dayStr] ? "ring-2 ring-amber-400" : ""} ${canClick ? "cursor-pointer hover:shadow-sm hover:scale-[1.02]" : ""}`}
                          style={dayBgHex ? { backgroundColor: dayBgHex } : undefined}
                        >
                          {/* 입사일/퇴사일 배지 (셀 우상단) */}
                          {isHireDay && (
                            <span className="absolute -top-1.5 -right-1 text-[10px] font-bold px-1 py-px rounded bg-emerald-500 text-white leading-none shadow-sm z-10">
                              입사
                            </span>
                          )}
                          {isRetireDay && (
                            <span className="absolute -top-1.5 -right-1 text-[10px] font-bold px-1 py-px rounded bg-rose-500 text-white leading-none shadow-sm z-10">
                              퇴사
                            </span>
                          )}
                          <span className={`text-[13px] font-bold leading-none mb-0.5 ${
                            dow === 0 ? "text-rose-500" : dow === 6 ? "text-sky-500" : "text-zinc-600"
                          }`}>
                            {day}
                          </span>
                          {outOfEmployment ? (
                            <span className="text-[11px] text-zinc-400 font-medium">─</span>
                          ) : sc?.type ? (
                            <>
                              {/* 2026-08-17 · 사용자 지시 · 셀에는 type 글씨만 · 시간은 아래 범례 · 폰트 +2 (12→14) */}
                              <span className={`text-[14px] font-extrabold leading-tight ${dayIsLight ? "text-zinc-900" : "text-white"}`}>
                                {sc.type}
                              </span>
                              {sc.actualHours && (
                                <span className="text-[12px] text-indigo-600 leading-tight font-semibold mt-0.5">
                                  {sc.actualHours}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[11px] text-zinc-200">-</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* 2026-08-17 · 사용자 지시 · 달력 아래 · 근무형태별 시간 범례 (오픈/미들/마감 등) */}
              {typeHoursMap && Object.keys(typeHoursMap).length > 0 && (
                <div className="mt-4 pt-3 border-t border-line">
                  <div className="text-[13px] font-semibold text-ink-soft mb-2">근무 시간표</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {activeTypes
                      .filter(t => typeHoursMap[t.value])
                      .map(t => {
                        const hex = getTypeHex(t.value, scheduleTypeEntries);
                        return (
                          <div key={t.value} className="flex items-center gap-2 text-[14px]">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                            <span className="font-bold text-ink">{t.label}</span>
                            <span className="font-mono text-ink-soft tabular-nums">{typeHoursMap[t.value]}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* Inline Edit Panel · 2026-08-17 · 최신 트렌드 · 깔끔·세련 · 배지 지양 · 폰트 +2~4 */}
            {isAdmin && onUpdate && editingDay !== null && (
              <div className="flex-shrink-0 border-t border-line bg-white px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-[3px] h-[16px] rounded-full bg-brand-deep" />
                    <span className="text-[15px] font-bold text-ink">
                      {month}월 {editingDay}일 스케줄 편집
                    </span>
                  </div>
                  <button onClick={() => setEditingDay(null)} className="p-1.5 text-ink-soft hover:text-ink hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer">
                    <X size={14} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {activeTypes.map((t) => {
                    const btnHex = getTypeHex(t.value, scheduleTypeEntries);
                    const btnLight = isLightHex(btnHex);
                    const isActive = editType === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        disabled={isSaving}
                        onClick={() => quickApplyType(t.value)}
                        className={`px-3 py-1.5 text-[14px] font-semibold rounded-lg border transition-colors cursor-pointer disabled:opacity-40 ${
                          isActive
                            ? `${btnLight ? "text-zinc-900" : "text-white"} border-brand-deep shadow-sm`
                            : "bg-white text-ink border-line hover:border-brand-deep hover:bg-brand-tint"
                        }`}
                        style={isActive ? { backgroundColor: btnHex } : undefined}
                      >
                        {isActive && isSaving ? "저장중..." : t.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => quickApplyType("결근")}
                    className="px-3 py-1.5 text-[14px] font-semibold text-rose-800 border border-rose-200 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                  >
                    결근
                  </button>
                </div>

                <p className="text-[13px] text-ink-soft font-medium">
                  변경사항은 임시 반영됩니다. 하단 <b className="text-brand-deep font-bold">[변경사항 저장]</b> 버튼을 눌러야 실제 반영됩니다.
                </p>

                <div className="flex gap-2.5">
                  <div className="flex-1">
                    <label className="text-[13px] font-semibold text-ink-soft mb-1 flex items-center gap-1.5">
                      <Clock size={12} strokeWidth={2.2} /> 근무 시간
                    </label>
                    <input
                      type="text"
                      value={editWorkingHours}
                      onChange={e => setEditWorkingHours(e.target.value)}
                      placeholder="09:30-18:30"
                      className="w-full text-[14px] rounded-lg border border-line focus:border-brand-deep focus:ring-2 focus:ring-brand-tint px-2.5 py-1.5 bg-white focus:outline-none transition-colors"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[13px] font-semibold text-ink-soft mb-1 flex items-center gap-1.5">
                      <MessageSquare size={12} strokeWidth={2.2} /> 실근무·기타
                    </label>
                    <input
                      type="text"
                      value={editActualHours}
                      onChange={e => setEditActualHours(e.target.value)}
                      placeholder="지각, 조퇴..."
                      className="w-full text-[14px] rounded-lg border border-line focus:border-brand-deep focus:ring-2 focus:ring-brand-tint px-2.5 py-1.5 bg-white focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[13px] font-semibold text-ink-soft mb-1 block">메모</label>
                  <input
                    type="text"
                    value={editMemo}
                    onChange={e => setEditMemo(e.target.value)}
                    placeholder="메모 (마우스 오버 시 표시)"
                    className="w-full text-[14px] rounded-lg border border-line focus:border-brand-deep focus:ring-2 focus:ring-brand-tint px-2.5 py-1.5 bg-white focus:outline-none transition-colors"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingDay(null)}
                    className="h-9 px-3.5 text-[14px] font-semibold bg-white border border-line hover:border-ink-soft text-ink-soft hover:text-ink rounded-lg transition-colors cursor-pointer"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={() => { saveWith(); setEditingDay(null); }}
                    disabled={isSaving}
                    className="h-9 px-4 text-[14px] font-semibold bg-brand-deep hover:bg-[#0d3a5c] text-white rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Save size={13} strokeWidth={2.2} />
                    임시 반영
                  </button>
                </div>
              </div>
            )}

            {/* Stats footer + Batch save · 2026-08-17 · 최신 트렌드 · 배지 지양 · 텍스트 chip · 폰트 +3 */}
            <div className="px-4 py-3 bg-zinc-50/60 border-t border-line flex-shrink-0 flex items-center gap-3 flex-wrap">
              <span className="text-[14px] font-bold text-ink">이달 근무 <span className="tabular-nums">{workDays}</span>일</span>
              <span className="w-px h-4 bg-line" />
              {Object.entries(stats).map(([type, count]) => {
                const statHex = getTypeHex(type, scheduleTypeEntries);
                return (
                  <div key={type} className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: statHex }} />
                    <span>{type}</span>
                    <span className="tabular-nums text-ink-soft">{count}</span>
                  </div>
                );
              })}
              {/* 변경사항 저장 · pending 있을 때만 · 2026-08-17 · 최신 트렌드 · 딥네이비 primary · 폰트 +3 */}
              {isAdmin && onUpdate && Object.keys(pendingChanges).length > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDiscardPending}
                    disabled={isBatchSaving}
                    className="h-9 px-3.5 text-[14px] font-semibold bg-white border border-line hover:border-ink-soft text-ink-soft hover:text-ink rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                  >
                    변경 취소
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchSave}
                    disabled={isBatchSaving}
                    className="h-9 px-4 text-[14px] font-semibold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Save size={14} strokeWidth={2.2} />
                    {isBatchSaving ? "저장 중..." : `변경사항 저장 · ${Object.keys(pendingChanges).length}건`}
                  </button>
                </div>
              )}
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
            onSaveToDow={logisticsZoneProps.onSaveToDow}
          />
        )}

        {/* ── BULK TAB · 2026-08-17 · 사용자 지시 · 최신 트렌드 · 깔끔 · 배지 지양 · 폰트 +4 ── */}
        {activeTab === "bulk" && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-ink">

            {isLocked && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                <Lock size={14} className="text-amber-500 shrink-0" />
                <span className="text-[14px] font-semibold text-amber-800">이달 스케줄이 확정된 상태입니다. 메인에서 확정해제 후 사용하세요.</span>
              </div>
            )}

            {employee.description && (
              <div className="px-3 py-2 bg-amber-50/70 border border-amber-100 rounded-lg text-[14px] text-amber-800">
                <span className="font-bold mr-1.5">비고</span>{employee.description}
              </div>
            )}

            {/* Section 1 · 날짜 선택 · 배지 없음 · accent bar · 폰트 +4 */}
            <section className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-[3px] h-[16px] rounded-full bg-brand-deep" />
                  <h3 className="text-[16px] font-bold tracking-tight text-ink">날짜 선택</h3>
                  <span className="text-[14px] font-medium text-ink-soft tabular-nums">· {bulkSelectedDates.length}일</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={selectAll} className="px-2.5 py-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors">전체</button>
                  <button type="button" onClick={deselectAll} className="px-2.5 py-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors">해제</button>
                  <button type="button" onClick={selectWeekdays} className="px-2.5 py-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors">평일</button>
                  <button type="button" onClick={selectWeekends} className="px-2.5 py-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors">주말</button>
                </div>
              </div>

              {/* 요일 단위 · 배지 대신 flat pill · 폰트 +4 */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-ink-soft shrink-0">요일:</span>
                {[
                  { label: "월", val: 1 }, { label: "화", val: 2 }, { label: "수", val: 3 },
                  { label: "목", val: 4 }, { label: "금", val: 5 },
                  { label: "토", val: 6 },
                  { label: "일", val: 0 },
                ].map((w) => (
                  <button
                    key={w.val}
                    type="button"
                    onClick={() => toggleWeekday(w.val)}
                    className="min-w-[36px] px-2.5 py-1.5 text-[14px] font-semibold text-ink border border-line rounded-lg hover:border-brand-deep hover:bg-brand-tint transition-colors cursor-pointer"
                  >
                    {w.label}
                  </button>
                ))}
              </div>

              {/* Day grid · 선택시 딥네이비 fill · 폰트 +4 */}
              <div className="grid grid-cols-7 gap-1.5 p-2 bg-zinc-50/60 border border-line rounded-xl">
                {daysList.map((dayNum) => {
                  const { dayWord, dayIndex, fullDate } = getDayDetails(dayNum);
                  const isChecked = bulkSelectedDates.includes(fullDate);
                  return (
                    <label
                      key={dayNum}
                      className={`flex flex-col items-center justify-center py-1.5 border rounded-lg cursor-pointer text-center select-none transition-colors ${
                        isChecked
                          ? "bg-brand-deep border-brand-deep text-white"
                          : "bg-white border-line hover:border-brand hover:bg-brand-tint"
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
                      <span className={`text-[13px] font-medium ${isChecked ? "text-white/80" : dayIndex === 6 ? "text-sky-500" : dayIndex === 0 ? "text-rose-500" : "text-ink-soft"}`}>
                        {dayWord}
                      </span>
                      <span className="text-[16px] font-bold tabular-nums">{dayNum}</span>
                    </label>
                  );
                })}
              </div>
            </section>

            {/* Section 2 · 근무 조건 · 배지 없음 · accent bar · 폰트 +4 */}
            <section className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="w-[3px] h-[16px] rounded-full bg-brand-deep" />
                <h3 className="text-[16px] font-bold tracking-tight text-ink">근무 조건</h3>
              </div>

              {/* 근태 빠른 지정 · 이모지 제거 · 통일 톤 */}
              <div className="space-y-2">
                <label className="block text-[14px] font-semibold text-ink-soft">근태 빠른 지정</label>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setBulkActualHours("")} className="px-3 py-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink border border-line hover:border-ink-soft rounded-lg cursor-pointer transition-colors">초기화</button>
                  <button type="button" onClick={() => { setBulkActualHours("지각"); setBulkWorkingHours(typeHoursMap?.["오픈"] ?? ""); }} className="px-3 py-1.5 text-[14px] font-semibold text-amber-800 border border-amber-200 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors">지각</button>
                  <button type="button" onClick={() => setBulkActualHours("조퇴")} className="px-3 py-1.5 text-[14px] font-semibold text-violet-800 border border-violet-200 hover:bg-violet-50 rounded-lg cursor-pointer transition-colors">조퇴</button>
                  <button type="button" onClick={() => { setBulkActualHours("결근"); setBulkType("결근"); setBulkWorkingHours(""); }} className="px-3 py-1.5 text-[14px] font-semibold text-rose-800 border border-rose-200 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors">결근</button>
                </div>
              </div>

              {/* Shift presets · 딥네이비 active */}
              <div className="space-y-2">
                <label className="block text-[14px] font-semibold text-ink-soft">근무 패턴</label>
                <div className="flex flex-wrap gap-1.5">
                  {activeTypes.map((t) => {
                    const hours = typeHoursMap?.[t.value];
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => handleBulkTypeChange(t.value)}
                        className={`px-3 py-1.5 text-[14px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                          bulkType === t.value
                            ? "bg-brand-deep text-white border-brand-deep"
                            : "bg-white text-ink border-line hover:border-brand-deep hover:bg-brand-tint"
                        }`}
                      >
                        {hours ? `${t.label} · ${hours}` : t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fields · 2026-08-17 · 사용자 지시 · 근무 시간 필드 제거 (근무 패턴 pick 시 자동 · 중복) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[14px] font-semibold text-ink-soft mb-1.5 flex items-center gap-1.5">
                    <MessageSquare size={13} strokeWidth={2.2} /> 특이사항
                  </label>
                  <input
                    type="text"
                    value={bulkActualHours}
                    onChange={e => setBulkActualHours(e.target.value)}
                    placeholder="예: 2시간 연장, 지각, 조퇴"
                    className="w-full text-[15px] rounded-lg border border-line focus:border-brand-deep focus:ring-2 focus:ring-brand-tint px-3 py-2 bg-white focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[14px] font-semibold text-ink-soft mb-1.5 flex items-center gap-1.5">
                    <MessageSquare size={13} strokeWidth={2.2} /> 메모
                  </label>
                  <input
                    type="text"
                    value={bulkMemo}
                    onChange={e => setBulkMemo(e.target.value)}
                    placeholder="마우스 오버 시 표시될 메모"
                    className="w-full text-[15px] rounded-lg border border-line focus:border-brand-deep focus:ring-2 focus:ring-brand-tint px-3 py-2 bg-white focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </section>

            {/* Save · 공용 Button 통일 · 딥네이비 primary */}
            <div className="flex justify-end gap-2 pt-2 pb-1">
              <button
                type="button"
                onClick={() => setActiveTab("calendar")}
                className="h-10 px-4 text-[15px] font-semibold bg-white hover:bg-zinc-50 border border-line hover:border-brand-deep hover:text-brand-deep text-ink rounded-lg transition-colors cursor-pointer"
                disabled={isBulkSaving}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleBulkSave}
                disabled={isBulkSaving || bulkSelectedDates.length === 0 || isLocked}
                className="h-10 px-5 text-[15px] font-semibold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                {isBulkSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>반영 중...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={15} strokeWidth={2.2} />
                    <span>{bulkSelectedDates.length}일 일괄 등록</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── (기존 info 탭 · 좌측 항상 노출로 이관됨 · 2026-08-17) ── */}
          </section>
        </div>
      </div>
    </div>
  );
};
