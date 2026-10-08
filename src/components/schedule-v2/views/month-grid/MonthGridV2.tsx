// src/components/schedule-v2/views/month-grid/MonthGridV2.tsx
// 2026-10-07 · 스케줄 V2 · 월간 Grid (sticky col/date header · edit popover)
//   · Card primitive 사용 (framework audit raw-card-wrapper 회피)
//   · edit mode 에서 cell click → ScheduleTypePopover
//   · lock month 는 상위 editMode=false 로 전달되어 자동 비활성
import React, { useMemo } from "react";
import type { Employee, Schedule } from "../../../../types";
import type { ScheduleTypeEntry } from "../../../../hooks/useSettings";
import { Card } from "../../../common/Card";
import { getTypeHoursMap, weekdays } from "../../../SchedulePage/scheduleHelpers";
// 2026-10-07 · 순환 import 제거 · scheduleCellContent 는 별도 모듈로 이관 (../MonthScheduleViewV2 → ./scheduleCellContent)
import { scheduleCellContent } from "./scheduleCellContent";
import { ScheduleTypePopover } from "./ScheduleTypePopover";

interface GridProps {
  employees: Employee[];
  dateList: string[];
  todayStr: string;
  scheduleTypes: ScheduleTypeEntry[];
  editMode: boolean;
  editTarget: { employeeId: number; date: string } | null;
  onOpenEdit: (employeeId: number, date: string) => void;
  onCloseEdit: () => void;
  onTypeSelect: (type: string, workingHours: string) => Promise<void> | void;
  /** 2026-10-07 · V2-B · 월 경계 등 "데이터 소스 밖" 날짜 · 편집 비활성 · 시각적 dim */
  dimmedDates?: Set<string>;
  /** 2026-10-08 · V1 parity · 날짜 헤더 click → Day view (V1 DayTimelineModal 대응) */
  onDateHeaderClick?: (date: string) => void;
  /** 2026-10-08 · V1 parity · 직원명 click → Employee view (V1 EmployeeCalendarModal 대응) */
  onEmployeeNameClick?: (employeeId: number) => void;
}

export const MonthGridV2: React.FC<GridProps> = ({
  employees, dateList, todayStr, scheduleTypes,
  editMode, editTarget, onOpenEdit, onCloseEdit, onTypeSelect,
  dimmedDates,
  onDateHeaderClick, onEmployeeNameClick,
}) => {
  // 날짜별 schedule lookup · O(1)
  const scheduleIndex = useMemo(() => {
    const idx = new Map<number, Map<string, Schedule>>();
    for (const emp of employees) {
      const m = new Map<string, Schedule>();
      for (const s of emp.schedules ?? []) m.set(s.date, s);
      idx.set(emp.id, m);
    }
    return idx;
  }, [employees]);

  // 직원 개별 typeHoursMap · position/employmentType 반영
  const typeHoursByEmp = useMemo(() => {
    const m = new Map<number, Record<string, string>>();
    for (const emp of employees) {
      m.set(emp.id, getTypeHoursMap(emp.position ?? "", emp.employmentType ?? "", scheduleTypes));
    }
    return m;
  }, [employees, scheduleTypes]);

  return (
    <Card variant="sm" padding="none" rounded="xl" className="flex-1 min-h-0 overflow-auto">
      <table className="border-collapse text-[13px]" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 160 }} />
          {dateList.map((d) => <col key={`col-${d}`} style={{ width: 72 }} />)}
        </colgroup>
        <thead>
          <tr>
            <th
              className="sticky top-0 left-0 z-30 bg-zinc-50 border-r border-b border-line text-left px-3 py-2 text-[12px] font-bold text-ink-soft uppercase tracking-wide"
              style={{ minWidth: 160 }}
            >
              직원
            </th>
            {dateList.map((d) => {
              const dateObj = new Date(d);
              const dow = weekdays[dateObj.getDay()];
              const dayNum = dateObj.getDate();
              const isToday = d === todayStr;
              const isSun = dateObj.getDay() === 0;
              const isSat = dateObj.getDay() === 6;
              const dateClickable = !!onDateHeaderClick;
              return (
                <th
                  key={`h-${d}`}
                  onClick={dateClickable ? () => onDateHeaderClick!(d) : undefined}
                  className={`sticky top-0 z-20 border-r border-b border-line px-1 py-1.5 text-center text-[12px] font-semibold tabular-nums ${
                    isToday ? "bg-brand-tint/60 text-brand-deep" : isSun ? "bg-rose-50/60 text-rose-700" : isSat ? "bg-sky-50/60 text-sky-700" : "bg-zinc-50 text-ink"
                  } ${dateClickable ? "cursor-pointer hover:bg-brand-tint/40" : ""}`}
                  title={dateClickable ? "일간 보기" : undefined}
                >
                  <div className="leading-tight">
                    <div className="text-[14px] font-bold">{dayNum}</div>
                    <div className="text-[10px] opacity-70">{dow}</div>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => {
            const empMap = scheduleIndex.get(emp.id);
            const typeHoursMap = typeHoursByEmp.get(emp.id) ?? {};
            return (
              <tr key={`r-${emp.id}`} className="hover:bg-brand-tint/10">
                <th
                  scope="row"
                  onClick={onEmployeeNameClick ? () => onEmployeeNameClick(emp.id) : undefined}
                  className={`sticky left-0 z-10 bg-white border-r border-b border-line text-left px-3 py-1.5 font-semibold text-ink ${
                    onEmployeeNameClick ? "cursor-pointer hover:bg-brand-tint/30" : ""
                  }`}
                  title={onEmployeeNameClick ? `${emp.name} · 개인 일정` : undefined}
                >
                  <div className="text-[13px] leading-tight">{emp.name}</div>
                  <div className="text-[11px] text-ink-soft">{emp.position}</div>
                </th>
                {dateList.map((d) => {
                  const s = empMap?.get(d);
                  const isToday = d === todayStr;
                  const isEditing = editTarget?.employeeId === emp.id && editTarget.date === d;
                  const isDimmed = dimmedDates?.has(d) ?? false;
                  const clickable = editMode && !isDimmed;
                  return (
                    <td
                      key={`c-${emp.id}-${d}`}
                      onClick={clickable ? () => onOpenEdit(emp.id, d) : undefined}
                      style={{ height: 44 }}
                      className={`relative border-r border-b border-line p-0 text-center align-top ${
                        isToday ? "bg-brand-tint/20" : ""
                      } ${
                        clickable
                          ? "cursor-pointer hover:bg-sky-50/60 outline outline-1 outline-transparent hover:outline-sky-300"
                          : ""
                      } ${isEditing ? "bg-sky-100 outline-2 outline-sky-500" : ""} ${
                        isDimmed ? "bg-zinc-50/60 opacity-50" : ""
                      }`}
                      title={isDimmed ? "다른 월 날짜 · 월간 뷰에서 수정" : undefined}
                    >
                      {scheduleCellContent(s, typeHoursMap, scheduleTypes)}
                      {isEditing && (
                        <ScheduleTypePopover
                          scheduleTypes={scheduleTypes}
                          typeHoursMap={typeHoursMap}
                          onSelect={onTypeSelect}
                          onClose={onCloseEdit}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
};

export default MonthGridV2;
