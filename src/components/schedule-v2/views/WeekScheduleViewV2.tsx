// src/components/schedule-v2/views/WeekScheduleViewV2.tsx
// 2026-10-07 · 스케줄 V2 · 주간 뷰 (Phase V2-B)
//   · 월간과 동일한 canonical 자원 재사용 (useScheduleData · useSettings · getTypeHoursMap)
//     · 월간 cell + popover · 월간 grid 그대로 사용 · dateList 만 7일로 교체
//   · anchor month = 주의 목요일 (ISO) 가 속한 month · 월 경계 주 (예: 9/28~10/4) 안전
//   · 월 경계 날짜 (anchor month 가 아닌 날) · 편집 비활성 (lock 혼동 방지 · Phase V2-E 보완 예정)
//   · 쓰기 경로 · 월간과 동일 handleCellUpdate (PUT /api/schedules) → V1↔V2 parity 자동
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CaretLeft, CaretRight, Lock, PencilSimple, Check } from "@phosphor-icons/react";
import { useScheduleData, type CellUpdateData } from "../../SchedulePage/useScheduleData";
import { useSettings } from "../../../hooks/useSettings";
import { buildDateList, getTodayStr } from "../../SchedulePage/scheduleHelpers";
// 2026-10-08 · V2 자체 UI · V1 ScheduleFilterBar UI 제거 · V2 자체 toolbar (기능 재사용 · UI 신규)
import { ScheduleV2FilterBar } from "../components/ScheduleV2FilterBar";
import { Spinner } from "../../common/Spinner";
import type { AuthSession } from "../../../types";
import { MonthGridV2 } from "./month-grid/MonthGridV2";
import { anchorMonthOfWeek, buildWeekDateList, endOfISOWeek, startOfISOWeek } from "../helpers/week";

interface Props {
  anchorDate: Date;
  onAnchorDelta: (daysDelta: number) => void;
  onThisWeek: () => void;
  authSession: AuthSession | null;
  /** 2026-10-08 · V1 parity · 공유 필터 state */
  positionTab: string;
  setPositionTab: (tab: string) => void;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  /** 2026-10-08 · V1 parity · 날짜 click → Day · 직원명 click → Employee */
  onOpenDay?: (date: string) => void;
  onOpenEmployee?: (employeeId: number) => void;
}

export const WeekScheduleViewV2: React.FC<Props> = ({
  anchorDate, onAnchorDelta, onThisWeek, authSession,
  positionTab, setPositionTab, searchQuery, setSearchQuery,
  onOpenDay, onOpenEmployee,
}) => {
  const [notification, setNotification] = useState<{ msg: string; tone: "ok" | "err" } | null>(null);
  const showNotification = useCallback((msg: string, type?: "success" | "error") => {
    setNotification({ msg, tone: type === "error" ? "err" : "ok" });
    window.setTimeout(() => setNotification(null), 2500);
  }, []);

  const weekDates = useMemo(() => buildWeekDateList(anchorDate), [anchorDate]);
  const anchor = useMemo(() => anchorMonthOfWeek(anchorDate), [anchorDate]);

  // 월간과 동일 hook · schedule fetch · write · lock
  const {
    employees,
    isLoading,
    error,
    isMonthLocked,
    handleCellUpdate,
    fetchScheduleData,
    isInitialFetchRef,
  } = useScheduleData(anchor.year, anchor.month, showNotification);

  const { scheduleTypes, wageRates, positions: settingsPositions } = useSettings();
  const todayStr = getTodayStr();
  const level = authSession?.level ?? 0;

  // 2026-10-08 · settings.positions SSOT 필터 (Month 와 동일)
  const wageRateKeys = useMemo(() => Object.keys(wageRates ?? {}), [wageRates]);
  const positionSet = useMemo(
    () => new Set((settingsPositions ?? []).map(p => (p ?? "").trim()).filter(Boolean)),
    [settingsPositions],
  );
  const visibleEmployees = useMemo(() => {
    let list = employees;
    if (positionTab === "전체") {
      // no position filter
    } else if (positionTab === "기타") {
      list = list.filter(e => {
        const pos = (e.position ?? "").trim();
        if (!pos) return true;
        return !positionSet.has(pos);
      });
    } else {
      list = list.filter(e => (e.position ?? "").trim() === positionTab);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter(e => (e.name ?? "").toLowerCase().includes(q));
    return list;
  }, [employees, positionTab, searchQuery, positionSet]);

  // 2026-10-08 · E-HOTFIX · V1 SchedulePage 와 동일한 caller-driven fetch trigger
  //   · useScheduleData 는 자동 fetch 하지 않음 (caller-driven) · 누락 시 isLoading 영구 true
  //   · WeekView 는 anchor month 를 월 단위 fetch (hook 내부 월 단위 캐싱)
  const dateList = useMemo(() => buildDateList(anchor.year, anchor.month), [anchor.year, anchor.month]);
  useEffect(() => {
    const silent = !isInitialFetchRef.current;
    isInitialFetchRef.current = false;
    fetchScheduleData(dateList, silent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor.year, anchor.month]);

  const [editMode, setEditMode] = useState(false);
  const effectiveEditMode = editMode && (!isMonthLocked || level >= 9);

  // 2026-10-08 · 사용자 지시 · settings.positions 기반 동적 summary
  const summaryCounts = useMemo(() => {
    const total = visibleEmployees.length;
    const perPos: { label: string; count: number }[] = [];
    for (const p of settingsPositions ?? []) {
      const label = (p ?? "").trim();
      if (!label) continue;
      perPos.push({ label, count: visibleEmployees.filter(e => (e.position ?? "").trim() === label).length });
    }
    const etc = visibleEmployees.filter(e => {
      const pos = (e.position ?? "").trim();
      if (!pos) return true;
      return !positionSet.has(pos);
    }).length;
    if (etc > 0) perPos.push({ label: "기타", count: etc });
    return { total, perPos };
  }, [visibleEmployees, settingsPositions, positionSet]);

  const canEdit = !isMonthLocked || level >= 9;

  // 월 경계 날짜 집합 · anchor month 가 아닌 날 (편집 비활성 대상)
  const anchorMonthKey = `${anchor.year}-${String(anchor.month).padStart(2, "0")}`;
  const offAnchorDates = useMemo(() => {
    const s = new Set<string>();
    for (const d of weekDates) {
      if (!d.startsWith(anchorMonthKey + "-")) s.add(d);
    }
    return s;
  }, [weekDates, anchorMonthKey]);

  // 셀 편집 target
  //   · 2026-10-07 (V2-B micro fix) · 월 경계 날짜 edit block 제거
  //   · dim 은 시각 표현만 유지 · 실제 edit 가능 여부는 그 날짜 month 의 lock 상태
  //   · 다른 month 의 lock 상태는 frontend 가 모름 → server guard
  //     (assertScheduleNotLocked) 에 맡김 · 실패 시 showNotification 에러
  const [editTarget, setEditTarget] = useState<{ employeeId: number; date: string } | null>(null);
  const openEdit = useCallback((employeeId: number, date: string) => {
    if (!effectiveEditMode) return;
    setEditTarget({ employeeId, date });
  }, [effectiveEditMode]);
  const closeEdit = useCallback(() => setEditTarget(null), []);

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

  // Range label · "YYYY.MM.DD ~ YYYY.MM.DD"
  const start = startOfISOWeek(anchorDate);
  const end = endOfISOWeek(anchorDate);
  const rangeLabel = `${start.getFullYear()}.${String(start.getMonth() + 1).padStart(2, "0")}.${String(start.getDate()).padStart(2, "0")} ~ ${end.getFullYear()}.${String(end.getMonth() + 1).padStart(2, "0")}.${String(end.getDate()).padStart(2, "0")}`;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 py-2 border-b border-line">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onAnchorDelta(-7)}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-zinc-50 text-ink transition cursor-pointer"
            aria-label="이전 주"
            title="이전 주"
          >
            <CaretLeft size={14} weight="bold" />
          </button>
          <div className="min-w-[200px] text-center text-[15px] font-bold text-ink tabular-nums tracking-tight">
            {rangeLabel}
          </div>
          <button
            type="button"
            onClick={() => onAnchorDelta(7)}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-zinc-50 text-ink transition cursor-pointer"
            aria-label="다음 주"
            title="다음 주"
          >
            <CaretRight size={14} weight="bold" />
          </button>
          <button
            type="button"
            onClick={onThisWeek}
            className="ml-1 h-8 px-3 rounded-lg border border-line bg-white hover:bg-brand-tint/50 hover:border-brand-deep/30 text-ink text-[13px] font-semibold transition cursor-pointer"
            title="이번 주로"
          >
            이번주
          </button>
        </div>

        <div className="flex items-center gap-x-2 gap-y-1 text-[13px] text-ink-soft tabular-nums flex-wrap">
          <span className="font-semibold text-ink">총 {summaryCounts.total}명</span>
          {summaryCounts.perPos.map((g) => (
            <React.Fragment key={`sm-${g.label}`}>
              <span className="text-zinc-300">·</span>
              <span>{g.label} {g.count}</span>
            </React.Fragment>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {isMonthLocked && (
            <span className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[12px] font-semibold">
              <Lock size={12} weight="fill" /> 확정됨{!canEdit && " · 편집 불가"} ({anchor.month}월)
            </span>
          )}
          {offAnchorDates.size > 0 && (
            <span
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-zinc-100 border border-zinc-200 text-zinc-600 text-[12px] font-semibold"
              title="주 경계 날짜 · 안전을 위해 편집 비활성 · 월간 뷰에서 수정"
            >
              경계 {offAnchorDates.size}일
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

      {notification && (
        <div className={`shrink-0 text-[13px] border rounded-md px-3 py-1.5 ${
          notification.tone === "err"
            ? "text-rose-700 bg-rose-50 border-rose-200"
            : "text-brand-deep bg-brand-tint/40 border-brand-deep/20"
        }`}>
          {notification.msg}
        </div>
      )}

      {/* 2026-10-08 · V2 자체 UI · V1 ScheduleFilterBar UI 교체 (logic 재사용 · UI 신규) */}
      <ScheduleV2FilterBar
        employees={employees}
        positionTab={positionTab}
        setPositionTab={setPositionTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        settingsPositions={settingsPositions ?? []}
        wageRateKeys={wageRateKeys}
      />

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center py-16">
          <Spinner size={16} tone="brand" label="스케줄 불러오는 중..." />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center py-16 text-[13px] text-rose-600">
          로드 실패 · {error}
        </div>
      ) : visibleEmployees.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-16 text-[13px] text-ink-soft">
          {employees.length === 0 ? "재직 직원이 없습니다." : "필터 결과 직원 없음"}
        </div>
      ) : (
        <MonthGridV2
          employees={visibleEmployees}
          dateList={weekDates}
          todayStr={todayStr}
          scheduleTypes={scheduleTypes}
          editMode={effectiveEditMode}
          editTarget={editTarget}
          onOpenEdit={openEdit}
          onCloseEdit={closeEdit}
          onTypeSelect={handleTypeSelect}
          dimmedDates={offAnchorDates}
          onDateHeaderClick={onOpenDay}
          onEmployeeNameClick={onOpenEmployee}
        />
      )}
    </div>
  );
};

export default WeekScheduleViewV2;
