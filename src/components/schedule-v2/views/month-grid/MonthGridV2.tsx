// src/components/schedule-v2/views/month-grid/MonthGridV2.tsx
// 2026-10-07 · 스케줄 V2 · 월간 Grid (sticky col/date header · edit popover)
//   · Card primitive 사용 (framework audit raw-card-wrapper 회피)
//   · edit mode 에서 cell click → ScheduleTypePopover
//   · lock month 는 상위 editMode=false 로 전달되어 자동 비활성
import React, { useEffect, useMemo, useRef } from "react";
import type { Employee, Schedule, MonthlySummary } from "../../../../types";
import type { ScheduleTypeEntry } from "../../../../hooks/useSettings";
import { Card } from "../../../common/Card";
import { getTypeHoursMap, weekdays } from "../../../SchedulePage/scheduleHelpers";
// 2026-10-07 · 순환 import 제거 · scheduleCellContent 는 별도 모듈로 이관 (../MonthScheduleViewV2 → ./scheduleCellContent)
import { scheduleCellContent } from "./scheduleCellContent";
import { ScheduleTypePopover } from "./ScheduleTypePopover";
// 2026-10-09 · 사용자 지시 · V1 참고 · 하단 필터별 합계행 (V1 FROZEN · import 만 재사용)
import { SummaryRow } from "../../../SchedulePage/SummaryRow";

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
  /** 2026-10-08 · 사용자 지시 · 인건비 토글 활성 시 각 직원 월 인건비 표시 (sticky left cell 하단) */
  empLaborMap?: Map<number, number>;
  /** 2026-10-09 · 사용자 지시 · V1 참고 · 필터된 직원들의 하단 합계행 (약사/사원/물류/창고/기타/근무인원) */
  summaries?: MonthlySummary[];
  /** 2026-10-09 · positionTab 필터 (약사/사원/매장/창고/기타/전체) · 합계행 조건부 노출 */
  positionTab?: string;
  /** 2026-10-11 · 사용자 지시 · 달력 아래 "같은 Card 안"에 추가 panel (예: 일괄등록) 삽입 */
  children?: React.ReactNode;
}

export const MonthGridV2: React.FC<GridProps> = ({
  employees, dateList, todayStr, scheduleTypes,
  editMode, editTarget, onOpenEdit, onCloseEdit, onTypeSelect,
  dimmedDates,
  onDateHeaderClick, onEmployeeNameClick,
  empLaborMap,
  summaries, positionTab = "전체",
  children,
}) => {
  // 2026-10-09 · 사용자 지시 · 로딩 시 오늘 column 을 가로 중앙으로 scroll
  //   · todayStr 가 dateList 에 포함될 때만 scroll (다른 월 보고 있으면 noop)
  //   · dateList 변경 (월 이동) · todayStr 변경 (hour 롤오버) 때 재실행
  const todayHeaderRef = useRef<HTMLTableCellElement | null>(null);
  useEffect(() => {
    if (!todayHeaderRef.current) return;
    if (!dateList.includes(todayStr)) return;
    try {
      todayHeaderRef.current.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
    } catch { /* no-op (older browsers) */ }
  }, [dateList, todayStr]);
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

  // 2026-10-12 · 사용자 "직원별 달력 화면 너비에 맞게" fix · cell 폭 축소 (160→100 · 72→44)
  //   · 31일 기준 전체 폭 1464px (viewport 1600px+ 안 수용)
  return (
    <Card variant="sm" padding="none" rounded="xl" className="flex-1 min-h-0 overflow-auto">
      <table className="border-collapse text-[13px]" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 100 }} />
          {dateList.map((d) => <col key={`col-${d}`} style={{ width: 44 }} />)}
        </colgroup>
        <thead>
          <tr>
            <th
              className="sticky top-0 left-0 z-40 bg-zinc-50 border-r border-b border-line text-left px-3 py-2 text-[14px] font-bold text-ink-soft tracking-tight"
              style={{ minWidth: 100 }}
            >
              성명
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
                  ref={isToday ? todayHeaderRef : undefined}
                  onClick={dateClickable ? () => onDateHeaderClick!(d) : undefined}
                  className={`sticky top-0 z-30 border-r border-b border-line px-1 py-1.5 text-center text-[14px] font-semibold tabular-nums relative ${
                    isToday
                      ? "bg-rose-50 text-rose-700"
                      : isSun ? "bg-rose-50/60 text-rose-700" : isSat ? "bg-sky-50/60 text-sky-700" : "bg-zinc-50 text-ink"
                  } ${dateClickable ? "cursor-pointer hover:bg-brand-tint/40" : ""}`}
                  style={isToday ? {
                    // 2026-10-09 · 사용자 지시 · column 전체 하나의 네모 · header 상단 + 좌/우 (하단은 cell 들로 이어짐)
                    boxShadow: "inset 0 2px 0 0 #ef4444, inset 2px 0 0 0 #ef4444, inset -2px 0 0 0 #ef4444",
                  } : undefined}
                  title={dateClickable ? (isToday ? "오늘 · 일간 보기" : "일간 보기") : undefined}
                >
                  {/* 2026-10-08 · 사용자 지시 · V1 ScheduleGrid.tsx:144 와 동일 rose-500 inset ring + 2026 트렌드 톤
                      · Linear/Vercel/Google calendar · today column 전체에 vertical rail (inset ring 2px)
                      · V1 parity 유지 (붉은 테두리) · ring 두께·색상 그대로 */}
                  <div className="leading-tight flex flex-col items-center">
                    <div className={`${isToday ? "text-[17px] font-extrabold" : "text-[16px] font-bold"}`}>{dayNum}</div>
                    <div className={`text-[13px] ${isToday ? "font-semibold" : "opacity-70"}`}>{dow}</div>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp, rowIdx) => {
            const empMap = scheduleIndex.get(emp.id);
            const typeHoursMap = typeHoursByEmp.get(emp.id) ?? {};
            const isLastRow = rowIdx === employees.length - 1;
            return (
              <tr key={`r-${emp.id}`} className="hover:bg-brand-tint/10">
                <th
                  scope="row"
                  onClick={onEmployeeNameClick ? () => onEmployeeNameClick(emp.id) : undefined}
                  className={`sticky left-0 z-20 bg-white overflow-hidden border-r border-b border-line text-left px-3 py-1.5 font-semibold text-ink ${
                    onEmployeeNameClick ? "cursor-pointer hover:bg-sky-50" : ""
                  }`}
                  title={onEmployeeNameClick ? `${emp.name} · 개인 일정` : undefined}
                >
                  {/* 2026-10-09 · 사용자 지시 · 이름 + 직군 나란히 (horizontal · inline) · 인건비 진한 청색 */}
                  <div className="flex items-baseline gap-1.5 leading-tight">
                    <span className="text-[15px] font-semibold text-ink">{emp.name}</span>
                    <span className="text-[13px] text-ink-soft font-medium">{emp.position}</span>
                  </div>
                  {empLaborMap && empLaborMap.has(emp.id) && (
                    <div className="text-[13px] font-bold text-blue-800 tabular-nums mt-0.5">
                      {(empLaborMap.get(emp.id) ?? 0).toLocaleString()}원
                    </div>
                  )}
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
                        clickable
                          ? "cursor-pointer hover:bg-sky-50/60 outline outline-1 outline-transparent hover:outline-sky-300"
                          : ""
                      } ${isEditing ? "bg-sky-100 outline-2 outline-sky-500" : ""} ${
                        isDimmed ? "bg-zinc-50/60 opacity-50" : ""
                      }`}
                      title={isDimmed ? "다른 월 날짜 · 월간 뷰에서 수정" : undefined}
                    >
                      {scheduleCellContent(s, typeHoursMap, scheduleTypes, isToday)}
                      {/* 2026-10-09 · 사용자 지시 · column 전체 하나의 네모 · 각 cell 은 좌/우 (+ 마지막 row 는 하단 포함) */}
                      {isToday && (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-0 z-20"
                          style={{
                            boxShadow: isLastRow
                              ? "inset 2px 0 0 0 #ef4444, inset -2px 0 0 0 #ef4444, inset 0 -2px 0 0 #ef4444"
                              : "inset 2px 0 0 0 #ef4444, inset -2px 0 0 0 #ef4444",
                          }}
                        />
                      )}
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
          {/* 2026-10-09 · 사용자 지시 · V1 참고 · 필터된 사람들의 하단 합계행
              · V1 ScheduleGrid.tsx:271-290 패턴 재사용
              · positionTab 조건 · 활성 필터만 표시 · 전체 모드 땐 조건부 자동 노출 (물류/창고/기타)
              · showMonthTotal=false · V2 는 월별 합계 column 없음 */}
          {summaries && summaries.length > 0 && (
            <>
              {(positionTab === "전체" || positionTab === "약사") && (
                <SummaryRow summaries={summaries} label="약사" showMonthTotal={false} />
              )}
              {(positionTab === "전체" || positionTab === "사원" || positionTab === "매장") && (
                <SummaryRow summaries={summaries} label="사원" showMonthTotal={false} />
              )}
              {positionTab === "전체" && summaries.some(s => s.logisticsCount > 0) && (
                <SummaryRow summaries={summaries} label="물류" showMonthTotal={false} />
              )}
              {(positionTab === "전체" || positionTab === "창고") && summaries.some(s => s.warehouseCount > 0) && (
                <SummaryRow summaries={summaries} label="창고" showMonthTotal={false} />
              )}
              {(positionTab === "전체" || positionTab === "기타") && summaries.some(s => s.otherCount > 0) && (
                <SummaryRow summaries={summaries} label="기타" showMonthTotal={false} />
              )}
              <SummaryRow summaries={summaries} label="근무인원" showMonthTotal={false} />
            </>
          )}
        </tbody>
      </table>
      {/* 2026-10-11 · 사용자 지시 · 달력 바로 아래 같은 Card 안에 추가 panel (예: 일괄등록) */}
      {children && (
        <div className="border-t border-slate-200">
          {children}
        </div>
      )}
    </Card>
  );
};

export default MonthGridV2;
