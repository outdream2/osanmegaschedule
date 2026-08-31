// src/components/SchedulePage/ScheduleGrid.tsx
// 2026-08-22 · #framework-4 · SchedulePage 분리 · 스케줄 그리드 테이블
import React from "react";
import { Info, Users, UserPlus, Lock, Layers } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Employee, MonthlySummary } from "../../types";
import { isPharmPosition as isPharm, isOtherPosition } from "../../lib/employeeCategory";
import type { ScheduleTypeEntry } from "../../constants";
import { ScheduleCell } from "./ScheduleCell";
import { SummaryRow } from "./SummaryRow";
import EmployeeNameCell from "./EmployeeNameCell";
import { getDayDetails, getEmpMonthStats } from "./scheduleHelpers";

interface ScheduleGridProps {
  employees: Employee[];
  filteredEmployees: Employee[];
  displayDates: string[];
  todayStr: string;
  todayColRef: React.RefObject<HTMLTableCellElement | null>;
  nameThRef: React.RefObject<HTMLTableCellElement | null>;
  currentYear: number;
  currentMonth: number;
  isLoading: boolean;
  error: string | null;
  isAdmin: boolean;
  isManagerRole: boolean;
  isEmployeeMode: boolean;
  userLevel: number;
  sessionEmployeeId: number | null;
  editMode: boolean;
  isMonthLocked: boolean;
  showSummary: "hidden" | "summary" | "labor";
  currentSummaryList: MonthlySummary[];
  /** 2026-08-31 · #50 · 필터 상태 · 합계 행 · 필터별 표시 */
  positionTab?: "전체" | "약사" | "사원" | "창고" | "매장";
  draggedRowId: number | null;
  dragOverRowId: number | null;
  settingsScheduleTypes: ScheduleTypeEntry[];
  settingsWageRates: Record<string, any>;
  settingsEmployeeWageOverrides: Record<number, any>;
  getTypeHoursMap: (position: string, employmentType?: string) => Record<string, string>;
  onRetryFetch: () => void;
  onCreateEmployee: () => void;
  onSetTimelineDate: (date: string) => void;
  onEmployeeNameClick: (emp: Employee) => void;
  onEmployeeEditClick: (emp: Employee) => void;
  onEmployeeDeleteClick: (id: number, name: string) => void;
  onCellUpdate: (data: any) => Promise<void>;
  onBreakModalOpen: (employeeId: number, date: string) => void;
  onRowDragStart: (e: React.DragEvent, id: number) => void;
  onRowDragOver: (e: React.DragEvent, id: number) => void;
  onRowDrop: (e: React.DragEvent, targetId: number) => void;
  onRowDragEnd: () => void;
}

export const ScheduleGrid: React.FC<ScheduleGridProps> = ({
  employees, filteredEmployees, displayDates, todayStr, todayColRef, nameThRef,
  currentYear, currentMonth, isLoading, error, isAdmin, isManagerRole, isEmployeeMode, userLevel,
  sessionEmployeeId, editMode, isMonthLocked, showSummary, currentSummaryList, positionTab = "전체",
  draggedRowId, dragOverRowId,
  settingsScheduleTypes, settingsWageRates, settingsEmployeeWageOverrides,
  getTypeHoursMap,
  onRetryFetch, onCreateEmployee, onSetTimelineDate,
  onEmployeeNameClick, onEmployeeEditClick, onEmployeeDeleteClick,
  onCellUpdate, onBreakModalOpen,
  onRowDragStart, onRowDragOver, onRowDrop, onRowDragEnd,
}) => {
  if (isLoading && employees.length === 0) {
    return (
      <div className="w-full py-32 flex flex-col items-center justify-center bg-zinc-50/50">
        <Spinner size={32} tone="brand" />
        <p className="text-[#64748b] text-[11px] font-bold mt-4 tracking-wider">메가타운 스케줄 데이터 분석 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full py-24 flex flex-col items-center justify-center text-center">
        <div className="p-3 bg-rose-50 rounded-full text-rose-500 mb-2"><Info size={30} /></div>
        <p className="text-rose-700 font-bold text-xs">{error}</p>
        <button onClick={onRetryFetch} className="mt-4 px-3 py-1 text-xs bg-zinc-50 border border-line hover:bg-zinc-100 font-semibold rounded">다시 시도</button>
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="w-full py-24 flex flex-col items-center justify-center text-center">
        <div className="p-3 bg-zinc-100 rounded-full text-zinc-400 mb-2"><Users size={30} /></div>
        <p className="text-[#64748b] font-bold text-xs">등록된 직원이 없습니다.</p>
        {isAdmin && (
          <button onClick={onCreateEmployee} className="mt-4 px-3 py-1.5 text-xs bg-brand-deep font-semibold text-white rounded flex items-center gap-1">
            <UserPlus size={14} /><span>첫 직원 등록하기</span>
          </button>
        )}
      </div>
    );
  }

  const fmtCost = (cost: number) => cost <= 0 ? "" :
    cost >= 10000 ? `${Math.round(cost / 10000)}만원` : `${Math.round(cost).toLocaleString()}원`;
  const isOtherE = (e: Employee) => isOtherPosition(e.position, e.employmentType);
  const monthStr = String(currentMonth).padStart(2, "0");
  const curMonthKey = `${currentYear}-${monthStr}`;

  const pharmacistCost = filteredEmployees.filter(e => e.position === "약사")
    .reduce((sum, e) => sum + getEmpMonthStats(e, curMonthKey, settingsScheduleTypes, settingsWageRates, settingsEmployeeWageOverrides).laborCost, 0);
  const staffCost = filteredEmployees.filter(e => e.position !== "약사" && !isOtherE(e))
    .reduce((sum, e) => sum + getEmpMonthStats(e, curMonthKey, settingsScheduleTypes, settingsWageRates, settingsEmployeeWageOverrides).laborCost, 0);
  const otherCost = filteredEmployees.filter(e => e.position !== "약사" && isOtherE(e))
    .reduce((sum, e) => sum + getEmpMonthStats(e, curMonthKey, settingsScheduleTypes, settingsWageRates, settingsEmployeeWageOverrides).laborCost, 0);
  const totalCost = pharmacistCost + staffCost + otherCost;
  const showMonthTotal = showSummary !== "hidden";
  const showLabor = showSummary === "labor";

  return (
    <table className="text-left border-collapse table-fixed w-full min-w-max">
      <thead className="sticky top-0 z-30 shadow-[0_1px_2px_rgba(15,27,42,0.04)]">
        {/* Header Row 1: 날짜 */}
        <tr className="bg-white text-ink select-none">
          <th
            ref={nameThRef}
            className="text-center text-[13px] sm:text-[14px] font-semibold border-r border-line border-b border-b-line sticky left-0 bg-white z-50 py-2 sm:py-2.5 tracking-tight whitespace-nowrap px-0.5 sm:px-1.5 min-w-[90px] sm:min-w-[110px] lg:min-w-[120px] w-[90px] sm:w-[110px] lg:w-[120px] text-ink-soft"
          >
            <span className="hidden sm:inline">직원 성명</span>
            <span className="sm:hidden">성명</span>
          </th>
          {displayDates.map((dateStr, dateIdx) => {
            const { fullDate, isToday } = getDayDetails(dateStr, todayStr);
            const dayNum = parseInt(dateStr.split("-")[2]);
            const dayIndex = new Date(dateStr + "T00:00:00").getDay();
            const headerClass = dayIndex === 6 ? "text-sky-600 bg-white" : dayIndex === 0 ? "text-rose-600 bg-white" : "text-ink bg-white";
            const nextDate = displayDates[dateIdx + 1];
            const isMonthEnd = !nextDate || nextDate.substring(0, 7) !== dateStr.substring(0, 7);
            const monthLabel = parseInt(dateStr.substring(5, 7));
            return (
              <React.Fragment key={`day-num-${dateStr}`}>
                <th
                  ref={isToday ? todayColRef : undefined}
                  onClick={() => onSetTimelineDate(fullDate)}
                  className={`p-0.5 sm:p-1 text-center text-[15px] sm:text-[16px] font-bold border-r border-b border-line w-[44px] cursor-pointer hover:bg-brand-tint hover:text-brand-deep transition-colors ${headerClass} ${isToday ? "bg-rose-50 text-rose-700 ring-2 ring-inset ring-rose-500 z-40 relative" : ""}`}
                  title={`${fullDate} 타임라인 보기`}
                >
                  {dayNum}
                </th>
                {isMonthEnd && showSummary !== "hidden" && (
                  <th className="p-0.5 sm:p-1 text-center text-[11px] sm:text-[12px] font-semibold border-b border-line bg-zinc-50 text-ink-soft whitespace-nowrap border-l-2 border-l-line w-[44px] sm:w-[52px]">
                    {monthLabel}월합
                  </th>
                )}
              </React.Fragment>
            );
          })}
        </tr>
        {/* Header Row 2: 요일 */}
        <tr className="bg-zinc-50/60 text-ink-soft select-none">
          <th className="border-r border-b border-line sticky left-0 bg-zinc-50/60 z-50 h-5 sm:h-6 min-w-[90px] sm:min-w-[110px] lg:min-w-[120px]"></th>
          {displayDates.map((dateStr, dateIdx) => {
            const { dayWord, isToday } = getDayDetails(dateStr, todayStr);
            const dayIndex = new Date(dateStr + "T00:00:00").getDay();
            const wordClass = dayIndex === 6 ? "text-sky-500 font-semibold" : dayIndex === 0 ? "text-rose-500 font-semibold" : "text-ink-soft font-medium";
            const nextDate = displayDates[dateIdx + 1];
            const isMonthEnd = !nextDate || nextDate.substring(0, 7) !== dateStr.substring(0, 7);
            return (
              <React.Fragment key={`day-name-${dateStr}`}>
                <th className={`p-0.5 text-center text-[13px] sm:text-[14px] border-r border-b border-line w-[44px] bg-zinc-50/60 ${wordClass} ${isToday ? "bg-rose-50 text-rose-700 ring-2 ring-inset ring-rose-500 z-40 relative" : ""}`}>
                  {dayWord}
                </th>
                {isMonthEnd && showSummary !== "hidden" && (
                  <th className="p-0.5 text-center text-[10px] sm:text-[11px] border-b border-line bg-zinc-50/60 text-ink-soft border-l-2 border-l-line w-[44px] sm:w-[52px]">
                    일·시간
                  </th>
                )}
              </React.Fragment>
            );
          })}
        </tr>
      </thead>

      <tbody className="divide-y divide-zinc-100/80">
        {filteredEmployees.map((emp, empIdx) => (
          <tr
            key={emp.id}
            draggable={isAdmin}
            onDragStart={e => onRowDragStart(e, emp.id)}
            onDragOver={e => onRowDragOver(e, emp.id)}
            onDrop={e => onRowDrop(e, emp.id)}
            onDragEnd={onRowDragEnd}
            className={`bg-white group transition-colors duration-150 ${draggedRowId === emp.id ? "opacity-30" : ""} ${dragOverRowId === emp.id ? "bg-brand-tint border-t-2 border-t-brand-deep" : "hover:bg-zinc-50/50"}`}
          >
            <EmployeeNameCell
              emp={emp} empIdx={empIdx} isAdmin={isAdmin} userLevel={userLevel}
              currentYear={currentYear} draggedRowId={draggedRowId} dragOverRowId={dragOverRowId}
              onNameClick={onEmployeeNameClick}
              onEditClick={onEmployeeEditClick}
              onDeleteClick={onEmployeeDeleteClick}
            />

            {displayDates.map((dateStr, dateIdx) => {
              const { fullDate, isToday } = getDayDetails(dateStr, todayStr);
              const currentSched = emp.schedules.find(s => s.date === fullDate);
              const isOwnRow = isEmployeeMode && sessionEmployeeId === emp.id;
              const beforeHire  = !!emp.hireDate   && fullDate < emp.hireDate;
              const afterRetire = !!emp.retireDate  && fullDate > emp.retireDate;
              const outOfEmployment = beforeHire || afterRetire;
              const isHireDay   = !!emp.hireDate   && fullDate === emp.hireDate;
              const isRetireDay = !!emp.retireDate  && fullDate === emp.retireDate;
              const canOpenBreak = !outOfEmployment && ((isManagerRole && editMode) || isOwnRow);
              const nextDate = displayDates[dateIdx + 1];
              const isMonthEnd = !nextDate || nextDate.substring(0, 7) !== dateStr.substring(0, 7);

              const cell = (
                <td
                  key={`${emp.id}-${dateStr}`}
                  className={`relative p-0 border-r border-line ${isToday ? "ring-2 ring-inset ring-rose-500 z-[25] relative" : ""} ${isHireDay ? "ring-2 ring-inset ring-emerald-500 z-[24] relative" : ""} ${isRetireDay ? "ring-2 ring-inset ring-rose-500 z-[24] relative" : ""} ${outOfEmployment ? "bg-zinc-100/60 cursor-not-allowed" : (canOpenBreak ? "cursor-pointer hover:bg-brand-tint/60" : "")}`}
                  onClick={canOpenBreak ? () => onBreakModalOpen(emp.id, fullDate) : undefined}
                  title={
                    isHireDay ? `입사일 (${emp.hireDate})` :
                    isRetireDay ? `퇴사일 (${emp.retireDate})` :
                    outOfEmployment ? (beforeHire ? "입사일 이전 — 근무 불가" : "퇴사일 이후 — 근무 불가") :
                    (canOpenBreak ? "클릭하여 점심/휴게 시간 설정" : undefined)
                  }
                >
                  {isHireDay   && <span className="absolute top-0 right-0 z-30 text-[10px] font-bold px-1.5 py-0.5 rounded-bl bg-emerald-500 text-white leading-none shadow-sm pointer-events-none">입사</span>}
                  {isRetireDay && <span className="absolute top-0 right-0 z-30 text-[10px] font-bold px-1.5 py-0.5 rounded-bl bg-rose-500 text-white leading-none shadow-sm pointer-events-none">퇴사</span>}
                  {outOfEmployment ? (
                    <div className="w-full h-full min-h-[24px] flex items-center justify-center text-[10px] text-zinc-400 font-medium select-none">
                      <span className="opacity-40">─</span>
                    </div>
                  ) : (
                    <ScheduleCell
                      schedule={currentSched}
                      dateStr={fullDate}
                      employeeId={emp.id}
                      onUpdate={(isEmployeeMode || isManagerRole || isMonthLocked) ? async () => {} : onCellUpdate}
                      isAdmin={isAdmin && !isMonthLocked && editMode}
                      isPharmacist={isPharm(emp.position)}
                      typeHoursMap={getTypeHoursMap(emp.position, emp.employmentType)}
                      scheduleTypes={settingsScheduleTypes.map(e => ({ value: e.type, label: e.type }))}
                      scheduleTypeEntries={settingsScheduleTypes}
                    />
                  )}
                </td>
              );

              if (!isMonthEnd || showSummary === "hidden") return cell;

              const mk = dateStr.substring(0, 7);
              const { workDays, totalHours, laborCost } = getEmpMonthStats(emp, mk, settingsScheduleTypes, settingsWageRates, settingsEmployeeWageOverrides);
              const h = Math.floor(totalHours);
              const min = Math.round((totalHours - h) * 60);
              const hoursLabel = h > 0 ? (min > 0 ? `${h}h${min}m` : `${h}h`) : "";
              const costLabel = laborCost > 0 ? (laborCost >= 10000 ? `${Math.round(laborCost / 10000)}만` : `${Math.round(laborCost).toLocaleString()}`) : "";

              return (
                <React.Fragment key={`${emp.id}-${dateStr}`}>
                  {cell}
                  <td className="border-l-2 border-line bg-zinc-50/60 text-center align-middle p-1">
                    <div className="text-[13px] sm:text-[14px] font-bold text-ink leading-tight tabular-nums">{workDays}일</div>
                    {hoursLabel && <div className="text-[11px] sm:text-[12px] text-ink-soft font-medium leading-tight tabular-nums">{hoursLabel}</div>}
                    {isAdmin && showSummary === "labor" && costLabel && <div className="text-[11px] sm:text-[12px] text-brand-deep font-semibold leading-tight tabular-nums">{costLabel}원</div>}
                  </td>
                </React.Fragment>
              );
            })}
          </tr>
        ))}

        {/* 2026-08-31 · #50 · 필터별 합계 행 · 활성 필터만 표시 · 물류/창고 신규 · 전체는 전체대로 */}
        <>
          {(positionTab === "전체" || positionTab === "약사") && (
            <SummaryRow summaries={currentSummaryList} label="약사" showMonthTotal={showMonthTotal} />
          )}
          {(positionTab === "전체" || positionTab === "사원") && (
            <SummaryRow summaries={currentSummaryList} label="사원" showMonthTotal={showMonthTotal} />
          )}
          {positionTab === "전체" && currentSummaryList.some(s => s.logisticsCount > 0) && (
            <SummaryRow summaries={currentSummaryList} label="물류" showMonthTotal={showMonthTotal} />
          )}
          {(positionTab === "전체" || positionTab === "창고") && currentSummaryList.some(s => s.warehouseCount > 0) && (
            <SummaryRow summaries={currentSummaryList} label="창고" showMonthTotal={showMonthTotal} />
          )}
          {positionTab === "전체" && currentSummaryList.some(s => s.otherCount > 0) && (
            <SummaryRow summaries={currentSummaryList} label="기타" showMonthTotal={showMonthTotal} />
          )}
          <SummaryRow summaries={currentSummaryList} label="근무인원" showMonthTotal={showMonthTotal} />
        </>
      </tbody>
    </table>
  );
};
