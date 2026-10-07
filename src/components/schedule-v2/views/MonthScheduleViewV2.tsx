// src/components/schedule-v2/views/MonthScheduleViewV2.tsx
// 2026-10-07 · 스케줄 V2 · 월간 뷰 (Phase V2-A)
//   · canonical data · useScheduleData · useSettings (기존 SchedulePage 와 동일 소스)
//   · V2 UI 핵심: sticky employee column + sticky date header
//   · 편집 모드 (V2-A2): [편집] toggle · 셀 click → scheduleTypes popover
//     · handleCellUpdate (기존 PUT /api/schedules) 재사용 · V1 ↔ V2 parity
//     · lock month 는 server guard 가 차단 · frontend 는 chip + popover 비활성
//   · 공통 OFF semantics: src/shared/schedule/offTypes.ts (isOffType)
import React, { useCallback, useMemo, useState } from "react";
import { CaretLeft, CaretRight, Lock, PencilSimple, Check, X } from "@phosphor-icons/react";
import { useScheduleData, type CellUpdateData } from "../../SchedulePage/useScheduleData";
import { useSettings } from "../../../hooks/useSettings";
import {
  buildDateList, getTodayStr, getTypeHoursMap, weekdays,
} from "../../SchedulePage/scheduleHelpers";
import type { AuthSession, Employee, Schedule } from "../../../types";
import { Spinner } from "../../common/Spinner";
import { Card } from "../../common/Card";
import { isOffType } from "../../../shared/schedule/offTypes";
import { MonthGridV2 } from "./month-grid/MonthGridV2";

interface Props {
  year: number;
  month: number;
  onMonthDelta: (delta: number) => void;
  onToday: () => void;
  authSession: AuthSession | null;
}

export const MonthScheduleViewV2: React.FC<Props> = ({ year, month, onMonthDelta, onToday, authSession }) => {
  const [notification, setNotification] = useState<{ msg: string; tone: "ok" | "err" } | null>(null);
  const showNotification = useCallback((msg: string, type?: "success" | "error") => {
    setNotification({ msg, tone: type === "error" ? "err" : "ok" });
    window.setTimeout(() => setNotification(null), 2500);
  }, []);

  const {
    employees,
    isLoading,
    error,
    isMonthLocked,
    handleCellUpdate,
  } = useScheduleData(year, month, showNotification);

  const { scheduleTypes } = useSettings();

  const todayStr = getTodayStr();
  const dateList = useMemo(() => buildDateList(year, month), [year, month]);
  const level = authSession?.level ?? 0;

  // 편집 모드 · lock 이면 강제 off
  const [editMode, setEditMode] = useState(false);
  const effectiveEditMode = editMode && (!isMonthLocked || level >= 9);

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

  const canEdit = !isMonthLocked || level >= 9;

  // 셀 선택 state · null = 편집 popover 닫힘
  const [editTarget, setEditTarget] = useState<{ employeeId: number; date: string } | null>(null);
  const openEdit = useCallback((employeeId: number, date: string) => {
    if (!effectiveEditMode) return;
    setEditTarget({ employeeId, date });
  }, [effectiveEditMode]);
  const closeEdit = useCallback(() => setEditTarget(null), []);

  // Save handler · 기존 handleCellUpdate 재사용 · settings scheduleTypes 기반 hours 자동
  const handleTypeSelect = useCallback(async (type: string, workingHours: string) => {
    if (!editTarget) return;
    const payload: CellUpdateData = {
      employeeId: editTarget.employeeId,
      date: editTarget.date,
      type,
      workingHours,
      actualHours: workingHours,
      memo: "",
    };
    await handleCellUpdate(payload);
    closeEdit();
  }, [editTarget, handleCellUpdate, closeEdit]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      {/* Toolbar: 월 네비 · 오늘 · 요약 · lock · 편집 */}
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

        <div className="ml-auto flex items-center gap-2">
          {isMonthLocked && (
            <span className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[12px] font-semibold">
              <Lock size={12} weight="fill" /> 확정됨{!canEdit && " · 편집 불가"}
            </span>
          )}
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setEditMode(prev => !prev)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              effectiveEditMode
                ? "bg-brand-deep text-white border border-brand-deep hover:bg-[#0d3a5c]"
                : "bg-white text-brand-deep border border-brand-deep/30 hover:bg-brand-tint/40"
            }`}
            title={!canEdit ? "확정된 월은 편집할 수 없습니다" : effectiveEditMode ? "편집 종료" : "편집 시작"}
          >
            {effectiveEditMode ? <Check size={14} weight="bold" /> : <PencilSimple size={14} weight="bold" />}
            {effectiveEditMode ? "편집 중" : "편집"}
          </button>
        </div>
      </div>

      {/* notification */}
      {notification && (
        <div className={`shrink-0 text-[13px] border rounded-md px-3 py-1.5 ${
          notification.tone === "err"
            ? "text-rose-700 bg-rose-50 border-rose-200"
            : "text-brand-deep bg-brand-tint/40 border-brand-deep/20"
        }`}>
          {notification.msg}
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
        <MonthGridV2
          employees={employees}
          dateList={dateList}
          todayStr={todayStr}
          scheduleTypes={scheduleTypes}
          editMode={effectiveEditMode}
          editTarget={editTarget}
          onOpenEdit={openEdit}
          onCloseEdit={closeEdit}
          onTypeSelect={handleTypeSelect}
        />
      )}
    </div>
  );
};

// ─── Cell render helper (shared with grid) ─────────────────────────────
export const scheduleCellContent = (
  schedule: Schedule | undefined,
  typeHoursMap: Record<string, string>,
): React.ReactElement => {
  if (!schedule || !schedule.type) {
    return <span className="inline-block w-full text-[11px] text-zinc-200">·</span>;
  }
  const t = schedule.type.trim();
  const off = isOffType(t);
  const hours = (schedule.workingHours ?? "").trim() || typeHoursMap[t] || "";
  return (
    <div className="text-[12px] leading-tight">
      <div className={`font-semibold ${off ? "text-rose-600" : "text-ink"}`}>{t}</div>
      {hours && !off && <div className="text-[10px] text-ink-soft tabular-nums">{hours}</div>}
    </div>
  );
};

// re-export · 외부에서 individually import 하지 않도록 · 내부에서만 사용
export { getTypeHoursMap };
export default MonthScheduleViewV2;
