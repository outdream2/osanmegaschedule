// 2026-09-23 · #340 · CalendarGrid 공통 컴포넌트
// calendar 탭 · bulk 탭 양쪽 재사용
// mode="view"  → 클릭 시 handleDayQuickCycle (calendar 탭)
// mode="select" → 클릭 시 selectedDates 토글 (bulk 탭)

import React from "react";
import { getTypeHex, isLightHex } from "../../constants";
import type { ScheduleTypeEntry } from "../../constants";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export interface CalendarGridProps {
  year: number;
  month: number;
  monthStr: string; // "01" ~ "12"
  firstDow: number; // 0=일 ~ 6=토
  weeks: (number | null)[][];
  schedMap: Record<
    number,
    { type: string; workingHours: string; actualHours: string; memo: string }
  >;
  scheduleTypeEntries?: ScheduleTypeEntry[];
  hireDate?: string;
  retireDate?: string;
  /** view : 날짜 클릭 → onDayClick(day) / select: 날짜 클릭 → selectedDates 토글 */
  mode: "view" | "select";
  /** view 모드에서 편집 중인 날짜 (ring 강조) */
  editingDay?: number | null;
  /** view 모드에서 pending 변경사항 (amber ring) */
  pendingChanges?: Record<string, unknown>;
  /** select 모드에서 선택된 날짜 문자열 목록 */
  selectedDates?: string[];
  /** 클릭 핸들러 (두 모드 공용) · view 모드에선 day number 전달 · select 모드에선 fullDate 문자열 전달 */
  onDayClick?: (dayOrDate: number | string) => void;
  /** 관리자 여부 · view 모드에서 클릭 가능 여부 결정 */
  isAdmin?: boolean;
  onUpdateDefined?: boolean;
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  year,
  month,
  monthStr,
  firstDow,
  weeks,
  schedMap,
  scheduleTypeEntries,
  hireDate,
  retireDate,
  mode,
  editingDay,
  pendingChanges,
  selectedDates,
  onDayClick,
  isAdmin,
  onUpdateDefined,
}) => {
  return (
    <>
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[14px] font-bold py-1.5 tracking-wide ${
              i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : "text-ink-soft"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 주 그리드 */}
      <div className="flex flex-col gap-1.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1.5">
            {week.map((day, di) => {
              if (!day) return <div key={di} />;

              const sc = schedMap[day];
              const dayStr = `${year}-${monthStr}-${String(day).padStart(2, "0")}`;
              const dow = (firstDow + day - 1) % 7;

              // 입퇴사일 체크
              const isHireDay = !!hireDate && dayStr === hireDate;
              const isRetireDay = !!retireDate && dayStr === retireDate;
              const beforeHire = !!hireDate && dayStr < hireDate;
              const afterRetire = !!retireDate && dayStr > retireDate;
              const outOfEmployment = beforeHire || afterRetire;

              const dayBgHex =
                !outOfEmployment && sc?.type
                  ? getTypeHex(sc.type, scheduleTypeEntries)
                  : null;
              const dayIsLight = dayBgHex ? isLightHex(dayBgHex) : true;

              const isToday =
                new Date().getFullYear() === year &&
                new Date().getMonth() + 1 === month &&
                new Date().getDate() === day;

              // view 모드 전용
              const isEditing = mode === "view" && editingDay === day;
              const hasPending =
                mode === "view" && pendingChanges
                  ? !!pendingChanges[dayStr]
                  : false;
              const canClickView =
                mode === "view" && !outOfEmployment && isAdmin && onUpdateDefined;

              // select 모드 전용
              const isSelected =
                mode === "select" && selectedDates
                  ? selectedDates.includes(dayStr)
                  : false;

              const handleClick = () => {
                if (outOfEmployment) return;
                if (!onDayClick) return;
                if (mode === "view") {
                  if (!canClickView) return;
                  onDayClick(day);
                } else {
                  onDayClick(dayStr);
                }
              };

              // select 모드에서 선택된 셀은 brand-deep 배경 오버라이드 (CSS var 참조 · 하드코딩 금지)
              const selectBgStyle =
                mode === "select" && isSelected
                  ? { backgroundColor: "var(--color-brand-deep)" }
                  : dayBgHex && !isSelected
                  ? { backgroundColor: dayBgHex }
                  : undefined;

              const cellBase = `relative rounded-xl p-1.5 flex flex-col items-center min-h-[64px] border transition-all overflow-hidden`;

              let cellVariant = "";
              if (outOfEmployment) {
                cellVariant = "bg-zinc-100 border-line cursor-not-allowed opacity-70";
              } else if (mode === "select" && isSelected) {
                cellVariant = "border-transparent cursor-pointer hover:opacity-90";
              } else if (dayBgHex) {
                cellVariant = "border-transparent cursor-pointer hover:shadow-sm hover:scale-[1.02]";
              } else {
                cellVariant = "bg-white border-zinc-100 cursor-pointer hover:border-brand hover:bg-brand-tint";
              }

              const ringClass = [
                isHireDay ? "ring-2 ring-emerald-500" : "",
                isRetireDay ? "ring-2 ring-rose-500" : "",
                isToday && !isSelected ? "ring-2 ring-indigo-400 ring-offset-1" : "",
                isEditing ? "ring-2 ring-blue-500 scale-105 z-10 shadow-md" : "",
                hasPending ? "ring-2 ring-amber-400" : "",
                // select 모드: 선택된 셀 brand-deep ring (Tailwind 토큰 · 하드코딩 금지)
                mode === "select" && isSelected ? "ring-2 ring-brand-deep ring-offset-1" : "",
              ]
                .filter(Boolean)
                .join(" ");

              const clickable =
                !outOfEmployment &&
                (mode === "select" || (mode === "view" && canClickView));

              return (
                <div
                  key={di}
                  onClick={clickable ? handleClick : undefined}
                  title={
                    isHireDay
                      ? `입사일 (${hireDate})`
                      : isRetireDay
                      ? `퇴사일 (${retireDate})`
                      : outOfEmployment
                      ? beforeHire
                        ? "입사일 이전 — 근무 불가"
                        : "퇴사일 이후 — 근무 불가"
                      : undefined
                  }
                  className={`${cellBase} ${cellVariant} ${ringClass}`}
                  style={selectBgStyle}
                >
                  {/* 입사일/퇴사일 배지 */}
                  {isHireDay && (
                    <span className="absolute -top-1.5 -right-1 text-[12px] font-bold px-1 py-px rounded bg-emerald-500 text-white leading-none shadow-sm z-10">
                      입사
                    </span>
                  )}
                  {isRetireDay && (
                    <span className="absolute -top-1.5 -right-1 text-[12px] font-bold px-1 py-px rounded bg-rose-500 text-white leading-none shadow-sm z-10">
                      퇴사
                    </span>
                  )}

                  {/* 날짜 숫자 */}
                  <span
                    className={`text-[15px] font-bold leading-none mb-0.5 ${
                      dow === 0
                        ? "text-rose-500"
                        : dow === 6
                        ? "text-sky-500"
                        : mode === "select" && isSelected
                        ? "text-white/90"
                        : "text-zinc-600"
                    }`}
                  >
                    {day}
                  </span>

                  {/* 셀 본문 */}
                  {outOfEmployment ? (
                    <span className="text-[13px] text-zinc-400 font-medium">─</span>
                  ) : sc?.type ? (
                    <>
                      <span
                        className={`text-[14px] font-extrabold leading-tight ${
                          mode === "select" && isSelected
                            ? "text-white"
                            : dayIsLight
                            ? "text-zinc-900"
                            : "text-white"
                        }`}
                      >
                        {sc.type}
                      </span>
                      {sc.actualHours && (
                        <span
                          className={`text-[13px] leading-tight font-semibold mt-0.5 ${
                            mode === "select" && isSelected
                              ? "text-white/80"
                              : "text-indigo-600"
                          }`}
                        >
                          {sc.actualHours}
                        </span>
                      )}
                    </>
                  ) : (
                    <span
                      className={`text-[13px] ${
                        mode === "select" && isSelected
                          ? "text-white/50"
                          : "text-zinc-200"
                      }`}
                    >
                      -
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
};
