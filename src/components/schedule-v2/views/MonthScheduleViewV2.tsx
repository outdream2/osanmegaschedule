// src/components/schedule-v2/views/MonthScheduleViewV2.tsx
// 2026-10-07 · 스케줄 V2 · 월간 뷰 (Phase V2-A)
//   · canonical data · useScheduleData · useSettings (기존 SchedulePage 와 동일 소스)
//   · V2 UI 핵심: sticky employee column + sticky date header
//   · 월 네비 toolbar · 요약 pill · lock 표시 · read-only (Phase V2-A 는 표시 전용)
//   · edit 는 Phase V2-A 2차에서 (기존 ScheduleCell write API 재사용 예정)
import React, { useCallback, useMemo, useState } from "react";
import { CaretLeft, CaretRight, Lock } from "@phosphor-icons/react";
import { useScheduleData } from "../../SchedulePage/useScheduleData";
import { useSettings } from "../../../hooks/useSettings";
import {
  buildDateList, getTodayStr, getTypeHoursMap, weekdays,
} from "../../SchedulePage/scheduleHelpers";
import type { AuthSession, Employee, Schedule } from "../../../types";
import { Spinner } from "../../common/Spinner";

interface Props {
  year: number;
  month: number;
  onMonthDelta: (delta: number) => void;
  onToday: () => void;
  authSession: AuthSession | null;
}

export const MonthScheduleViewV2: React.FC<Props> = ({ year, month, onMonthDelta, onToday, authSession }) => {
  const [notification, setNotification] = useState<string | null>(null);
  const showNotification = useCallback((msg: string, _type?: "success" | "error") => {
    setNotification(msg);
    window.setTimeout(() => setNotification(null), 2500);
  }, []);

  const {
    employees,
    summary: _summary,
    isLoading,
    error,
    isMonthLocked,
    isLockLoading: _isLockLoading,
  } = useScheduleData(year, month, showNotification);

  const { scheduleTypes } = useSettings();

  const todayStr = getTodayStr();
  const dateList = useMemo(() => buildDateList(year, month), [year, month]);
  // 2026-10-07 · typeHoursMap · position/employmentType 별 변동 · V2 월간은 fallback 전체 (기본 hours)
  //   · 각 직원 cell 에서 자기 position/empType 기준 재계산 (아래 ScheduleCellReadonly 는 간소)
  //   · V2-A 는 기본 hours · V2-B 에서 직원별 정확 계산 예정
  const typeHoursMap = useMemo(() => getTypeHoursMap("", "", scheduleTypes), [scheduleTypes]);

  // 2026-10-07 · V2 요약 · 현재 활성 (재직) 직원 집계 (복잡한 role check 는 Phase V2-E)
  const summaryCounts = useMemo(() => {
    const totals = { total: 0, pharm: 0, store: 0, logi: 0, etc: 0 };
    for (const emp of employees) {
      totals.total += 1;
      const pos = String(emp.position ?? "").trim();
      if (pos.includes("약사")) totals.pharm += 1;
      else if (pos.includes("물류") || pos.includes("창고")) totals.logi += 1;
      else if (pos.includes("매장") || pos.includes("캐셔") || pos.includes("진열")) totals.store += 1;
      else totals.etc += 1;
    }
    return totals;
  }, [employees]);

  const level = authSession?.level ?? 0;
  const canUseLockGuardHint = isMonthLocked && level < 9;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      {/* Toolbar: 월 네비 · 오늘 · 요약 · lock */}
      <div className="flex flex-wrap items-center gap-2 py-2 border-b border-line">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onMonthDelta(-1)}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-zinc-50 text-ink transition cursor-pointer"
            aria-label="이전 달"
            title="이전 달"
          >
            <CaretLeft size={14} weight="bold" />
          </button>
          <div className="min-w-[120px] text-center text-[16px] font-bold text-ink tabular-nums tracking-tight">
            {year}년 {month}월
          </div>
          <button
            type="button"
            onClick={() => onMonthDelta(1)}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-zinc-50 text-ink transition cursor-pointer"
            aria-label="다음 달"
            title="다음 달"
          >
            <CaretRight size={14} weight="bold" />
          </button>
          <button
            type="button"
            onClick={onToday}
            className="ml-1 h-8 px-3 rounded-lg border border-line bg-white hover:bg-brand-tint/50 hover:border-brand-deep/30 text-ink text-[13px] font-semibold transition cursor-pointer"
            title="오늘로"
          >
            오늘
          </button>
        </div>

        <div className="flex items-center gap-2 text-[13px] text-ink-soft tabular-nums">
          <span className="font-semibold text-ink">근무 {summaryCounts.total}</span>
          <span className="text-zinc-300">·</span>
          <span>약사 {summaryCounts.pharm}</span>
          <span className="text-zinc-300">·</span>
          <span>매장 {summaryCounts.store}</span>
          <span className="text-zinc-300">·</span>
          <span>창고 {summaryCounts.logi}</span>
          <span className="text-zinc-300">·</span>
          <span>기타 {summaryCounts.etc}</span>
        </div>

        {isMonthLocked && (
          <span className="ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[12px] font-semibold">
            <Lock size={12} weight="fill" /> 확정됨{canUseLockGuardHint ? " · 편집 불가" : ""}
          </span>
        )}
      </div>

      {/* notification */}
      {notification && (
        <div className="shrink-0 text-[13px] text-brand-deep bg-brand-tint/40 border border-brand-deep/20 rounded-md px-3 py-1.5">
          {notification}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center py-16">
          <Spinner size={16} tone="brand" label="스케줄 불러오는 중..." />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center py-16 text-[13px] text-rose-600">
          로드 실패 · {error}
        </div>
      ) : employees.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-16 text-[13px] text-ink-soft">
          재직 직원이 없습니다.
        </div>
      ) : (
        <MonthGrid
          employees={employees}
          dateList={dateList}
          todayStr={todayStr}
          typeHoursMap={typeHoursMap}
        />
      )}
    </div>
  );
};

// ─── Grid ──────────────────────────────────────────────────────────────
interface GridProps {
  employees: Employee[];
  dateList: string[];
  todayStr: string;
  typeHoursMap: Record<string, string>;
}

const MonthGrid: React.FC<GridProps> = ({ employees, dateList, todayStr, typeHoursMap }) => {
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

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-white border border-line rounded-xl shadow-sm">
      <table className="border-collapse text-[13px]" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 160 }} />
          {dateList.map((d) => <col key={`col-${d}`} style={{ width: 72 }} />)}
        </colgroup>
        <thead>
          <tr>
            {/* sticky · 좌측상단 corner */}
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
              return (
                <th
                  key={`h-${d}`}
                  className={`sticky top-0 z-20 border-r border-b border-line px-1 py-1.5 text-center text-[12px] font-semibold tabular-nums ${
                    isToday ? "bg-brand-tint/60 text-brand-deep" : isSun ? "bg-rose-50/60 text-rose-700" : isSat ? "bg-sky-50/60 text-sky-700" : "bg-zinc-50 text-ink"
                  }`}
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
            return (
              <tr key={`r-${emp.id}`} className="hover:bg-brand-tint/10">
                {/* sticky · 좌측 직원명 */}
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white border-r border-b border-line text-left px-3 py-1.5 font-semibold text-ink"
                >
                  <div className="text-[13px] leading-tight">{emp.name}</div>
                  <div className="text-[11px] text-ink-soft">{emp.position}</div>
                </th>
                {dateList.map((d) => {
                  const s = empMap?.get(d);
                  const isToday = d === todayStr;
                  return (
                    <td
                      key={`c-${emp.id}-${d}`}
                      className={`border-r border-b border-line px-1 py-1 text-center align-top ${isToday ? "bg-brand-tint/20" : ""}`}
                    >
                      <ScheduleCellReadonly schedule={s} typeHoursMap={typeHoursMap} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ─── Cell (read-only · Phase V2-A) ────────────────────────────────────
const ScheduleCellReadonly: React.FC<{ schedule: Schedule | undefined; typeHoursMap: Record<string, string> }> = ({ schedule, typeHoursMap }) => {
  if (!schedule || !schedule.type) {
    return <span className="inline-block w-full text-[11px] text-zinc-200">·</span>;
  }
  const t = schedule.type.trim();
  const hours = (schedule.workingHours ?? "").trim() || typeHoursMap[t] || "";
  return (
    <div className="text-[12px] leading-tight">
      <div className="font-semibold text-ink">{t}</div>
      {hours && <div className="text-[10px] text-ink-soft tabular-nums">{hours}</div>}
    </div>
  );
};

export default MonthScheduleViewV2;
