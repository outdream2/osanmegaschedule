// src/components/schedule-v2/views/MonthScheduleViewV2.tsx
// 2026-10-07 · 스케줄 V2 · 월간 뷰 (Phase V2-A)
//   · canonical data · useScheduleData · useSettings (기존 SchedulePage 와 동일 소스)
//   · V2 UI 핵심: sticky employee column + sticky date header
//   · 편집 모드 (V2-A2): [편집] toggle · 셀 click → scheduleTypes popover
//     · handleCellUpdate (기존 PUT /api/schedules) 재사용 · V1 ↔ V2 parity
//     · lock month 는 server guard 가 차단 · frontend 는 chip + popover 비활성
//   · 공통 OFF semantics: src/shared/schedule/offTypes.ts (isOffType)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CaretLeft, CaretRight, Lock, PencilSimple, Check, X, ClipboardText, Copy } from "@phosphor-icons/react";
import { CopyPrevMonthModal } from "../components/CopyPrevMonthModal";
import { useScheduleData, type CellUpdateData } from "../../SchedulePage/useScheduleData";
import { useSettings } from "../../../hooks/useSettings";
import {
  buildDateList, getTodayStr, getTypeHoursMap, getEmpMonthStats,
} from "../../SchedulePage/scheduleHelpers";
// 2026-10-08 · V2 자체 UI · V1 ScheduleFilterBar UI 제거 · V2 자체 toolbar
//   · 기능 로직은 V1 재사용 (buildFilteredEmployees · usePositionCategories 등) · UI 만 신규
import { ScheduleV2FilterBar } from "../components/ScheduleV2FilterBar";
import type { AuthSession, Employee } from "../../../types";
import { Spinner } from "../../common/Spinner";
import { MonthGridV2 } from "./month-grid/MonthGridV2";
// 2026-10-07 · 순환 import 해소 · scheduleCellContent 를 별도 모듈로 분리 · 아래에서 re-export (BC)
import { scheduleCellContent as _scheduleCellContent } from "./month-grid/scheduleCellContent";

interface Props {
  year: number;
  month: number;
  onMonthDelta: (delta: number) => void;
  onToday: () => void;
  authSession: AuthSession | null;
  /** 2026-10-08 · V1 FULL parity · 공유 필터 state */
  positionTab: string;
  setPositionTab: (tab: string) => void;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  sortBy: "none" | "today" | "name" | "position" | "workplace";
  setSortBy: (s: "none" | "today" | "name" | "position" | "workplace") => void;
  sortOrder: "asc" | "desc";
  setSortOrder: (o: "asc" | "desc") => void;
  todayFirst: boolean;
  setTodayFirst: (v: boolean) => void;
  onFilterReset: () => void;
  /** 2026-10-08 · V1 parity · 날짜 click → Day · 직원명 click → Employee */
  onOpenDay?: (date: string) => void;
  onOpenEmployee?: (employeeId: number) => void;
  /** 2026-10-08 · 일괄등록 shortcut · 현재 visible employees 전달 → 부모가 picker open */
  onRequestBulk?: (employees: Employee[]) => void;
}

export const MonthScheduleViewV2: React.FC<Props> = ({
  year, month, onMonthDelta, onToday, authSession,
  positionTab, setPositionTab, searchQuery, setSearchQuery,
  sortBy, setSortBy, sortOrder, setSortOrder, todayFirst, setTodayFirst, onFilterReset,
  onOpenDay, onOpenEmployee, onRequestBulk,
}) => {
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
    fetchScheduleData,
    isInitialFetchRef,
    executeCopyFromPreviousMonth,
  } = useScheduleData(year, month, showNotification);

  const { scheduleTypes, wageRates, employeeWageOverrides, positions: settingsPositions } = useSettings();

  const todayStr = getTodayStr();
  const dateList = useMemo(() => buildDateList(year, month), [year, month]);

  // 2026-10-08 · 사용자 지시 · settings.positions 기반 chip + exact position match 필터
  //   · V1 wageRates-based buildFilteredEmployees 는 wageRates 와 settings.positions 가
  //     불일치할 때 count/filter mismatch 발생 · V2 는 settings.positions SSOT 로 통일
  //   · "전체" = 전체 · "기타" = settings.positions 에 없는 position · 나머지 = exact match
  //   · search = 이름 includes (V1 과 동일 semantics)
  const wageRateKeys = useMemo(() => Object.keys(wageRates ?? {}), [wageRates]);
  const positionSet = useMemo(
    () => new Set((settingsPositions ?? []).map(p => (p ?? "").trim()).filter(Boolean)),
    [settingsPositions],
  );
  const visibleEmployees = useMemo(() => {
    let list = employees;
    // 1. position filter (exact · settings.positions SSOT)
    if (positionTab === "전체") {
      // no filter
    } else if (positionTab === "기타") {
      list = list.filter(e => {
        const pos = (e.position ?? "").trim();
        if (!pos) return true;
        return !positionSet.has(pos);
      });
    } else {
      list = list.filter(e => (e.position ?? "").trim() === positionTab);
    }
    // 2. search
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter(e => (e.name ?? "").toLowerCase().includes(q));
    // 3. sort · V1 scheduleHelpers:358-371 pattern 재구현 · 간결 version
    const working = [...list];
    const positionIndex = (pos: string) => {
      const idx = (settingsPositions ?? []).indexOf(pos);
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };
    const workedToday = (e: Employee) => !!e.schedules?.find(s => s.date === todayStr && s.type && !/^(휴무|월차|지정휴무|결근)$/.test(s.type.trim()));
    if (sortBy !== "none") {
      working.sort((a, b) => {
        let v = 0;
        if (sortBy === "name") v = (a.name ?? "").localeCompare(b.name ?? "", "ko");
        else if (sortBy === "position") v = positionIndex(a.position ?? "") - positionIndex(b.position ?? "") || (a.name ?? "").localeCompare(b.name ?? "", "ko");
        else if (sortBy === "workplace") v = (a.workplace ?? "").localeCompare(b.workplace ?? "", "ko") || (a.name ?? "").localeCompare(b.name ?? "", "ko");
        else if (sortBy === "today") v = (workedToday(b) ? 1 : 0) - (workedToday(a) ? 1 : 0) || (a.name ?? "").localeCompare(b.name ?? "", "ko");
        return sortOrder === "asc" ? v : -v;
      });
    }
    // 4. 오늘우선 · sort 후 추가 적용 (오늘 근무자 상단)
    if (todayFirst) {
      working.sort((a, b) => (workedToday(b) ? 1 : 0) - (workedToday(a) ? 1 : 0));
    }
    return working;
  }, [employees, positionTab, searchQuery, positionSet, sortBy, sortOrder, todayFirst, todayStr, settingsPositions]);

  // 2026-10-08 · E-HOTFIX · V1 SchedulePage 와 동일한 caller-driven fetch trigger
  //   · useScheduleData 는 자동 fetch 하지 않음 (caller-driven) · 누락 시 isLoading 영구 true
  //   · 최초 진입 silent=false → spinner · 월 이동 시 silent=true (loaded month skip 로직은 hook 안)
  useEffect(() => {
    const silent = !isInitialFetchRef.current;
    isInitialFetchRef.current = false;
    fetchScheduleData(dateList, silent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);
  const level = authSession?.level ?? 0;

  // 편집 모드 · lock 이면 강제 off
  const [editMode, setEditMode] = useState(false);
  const effectiveEditMode = editMode && (!isMonthLocked || level >= 9);

  // 2026-10-08 · 사용자 지시 · V1 전월복사 (executeCopyFromPreviousMonth · useScheduleData 재사용)
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showLabor, setShowLabor] = useState(false);
  const [copying, setCopying] = useState(false);
  const handleCopyPrev = useCallback(async (opts: { copySchedules: boolean; copyDayAssignments: boolean }) => {
    setCopying(true);
    try {
      await executeCopyFromPreviousMonth(opts.copySchedules, opts.copyDayAssignments, dateList, () => { /* fetch 는 hook 안에서 자동 */ });
    } finally {
      setCopying(false);
    }
  }, [executeCopyFromPreviousMonth, dateList]);

  // 2026-10-08 · 사용자 지시 · 필터별 합계 pills · settings.positions 동적 + 인건비 toggle
  //   · "총 N명" + settings.positions 각 직군 count + "기타" (positions 외 직원 수) + (toggle 시) "인건비 N원"
  //   · 인건비 · V1 getEmpMonthStats 재사용 · 사용자 지시 "v1 기능 있으면 만들어야해"
  const monthKey = useMemo(() => `${year}-${String(month).padStart(2, "0")}`, [year, month]);
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

  // 인건비 total · showLabor === true 일 때만 compute (불필요 reduce 방지)
  const totalLabor = useMemo(() => {
    if (!showLabor) return 0;
    let sum = 0;
    for (const emp of visibleEmployees) {
      const stats = getEmpMonthStats(emp, monthKey, scheduleTypes, wageRates ?? {}, employeeWageOverrides ?? {});
      sum += stats.laborCost;
    }
    return sum;
  }, [showLabor, visibleEmployees, monthKey, scheduleTypes, wageRates, employeeWageOverrides]);

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
    <div className="flex-1 min-h-0 flex flex-col gap-1.5">
      {/* Row 1 · 월 네비 + 오늘 | ml-auto Lock + 편집 (사용자 지시 §21 레이아웃) */}
      <div className="flex items-center gap-2 py-2 border-b border-line flex-wrap">
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

        <div className="ml-auto flex items-center gap-2 shrink-0">
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

      {/* Row 2 · summary + 직군 filter 통합 (사용자 지시 · "두 줄을 한 줄로 병합") · pill click → positionTab */}
      <div className="flex items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-soft tabular-nums flex-wrap px-1.5 py-1.5 rounded-md bg-zinc-50/60 border border-line">
        {/* "전체" pill */}
        <button
          type="button"
          onClick={() => setPositionTab("전체")}
          className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md transition cursor-pointer ${
            positionTab === "전체"
              ? "bg-brand-deep text-white font-semibold"
              : "bg-white text-ink border border-line hover:bg-zinc-50 font-semibold"
          }`}
          aria-pressed={positionTab === "전체"}
        >
          <span>총</span>
          <span className="tabular-nums">{summaryCounts.total}명</span>
        </button>
        {/* position pills · 각각 clickable filter */}
        {summaryCounts.perPos.map((g) => {
          const active = positionTab === g.label;
          return (
            <button
              key={`sm-${g.label}`}
              type="button"
              onClick={() => setPositionTab(active ? "전체" : g.label)}
              className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md transition cursor-pointer ${
                active
                  ? "bg-brand-deep text-white font-semibold"
                  : "bg-white text-ink-soft border border-line hover:bg-zinc-50 hover:text-ink"
              }`}
              aria-pressed={active}
            >
              <span>{g.label}</span>
              <span className={`tabular-nums ${active ? "text-white/85" : "text-zinc-400"}`}>{g.count}</span>
            </button>
          );
        })}
        {showLabor && (
          <span className="ml-1 font-semibold text-brand-deep tabular-nums">인건비 {totalLabor.toLocaleString()}원</span>
        )}
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

      {/* 2026-10-08 · V2 compact filter toolbar · 오른쪽에 [전월복사] [일괄등록] [인건비] action 배치 */}
      <ScheduleV2FilterBar
        employees={employees}
        positionTab={positionTab}
        setPositionTab={setPositionTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sortBy={sortBy}
        setSortBy={setSortBy}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        todayFirst={todayFirst}
        setTodayFirst={setTodayFirst}
        onReset={onFilterReset}
        settingsPositions={settingsPositions ?? []}
        inlineActions={
          <>
            {/* 2026-10-08 · 사용자 지시 · 인건비 + 일괄등록 을 오늘우선 옆 inline 배치 */}
            <button
              type="button"
              onClick={() => setShowLabor(v => !v)}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-semibold transition cursor-pointer border ${
                showLabor
                  ? "bg-brand-deep text-white border-brand-deep hover:bg-[#0d3a5c]"
                  : "bg-white text-ink border-line hover:bg-zinc-50"
              }`}
              title="월 인건비 합계 표시"
            >
              인건비
            </button>
            {onRequestBulk && (
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onRequestBulk(visibleEmployees)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line bg-white text-ink text-[13px] font-semibold hover:bg-zinc-50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={!canEdit ? "확정된 월은 편집할 수 없습니다" : "일괄등록 (여러 날짜 한번에)"}
              >
                <ClipboardText size={13} weight="bold" />
                일괄등록
              </button>
            )}
          </>
        }
        rightActions={
          <button
            type="button"
            disabled={!canEdit || copying}
            onClick={() => setShowCopyModal(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line bg-white text-ink text-[13px] font-semibold hover:bg-zinc-50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={!canEdit ? "확정된 월은 편집할 수 없습니다" : "전월 데이터 복사"}
          >
            <Copy size={13} weight="bold" />
            전월복사
          </button>
        }
      />

      {/* 2026-10-08 · 전월복사 modal · V2 own UI */}
      <CopyPrevMonthModal
        open={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        targetYear={year}
        targetMonth={month}
        onConfirm={handleCopyPrev}
      />

      {/* Grid */}
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
          dateList={dateList}
          todayStr={todayStr}
          scheduleTypes={scheduleTypes}
          editMode={effectiveEditMode}
          editTarget={editTarget}
          onOpenEdit={openEdit}
          onCloseEdit={closeEdit}
          onTypeSelect={handleTypeSelect}
          onDateHeaderClick={onOpenDay}
          onEmployeeNameClick={onOpenEmployee}
        />
      )}
    </div>
  );
};

// ─── Cell render helper (shared with grid) ─────────────────────────────
// 2026-10-07 · 순환 import 제거 · 실제 선언은 ./month-grid/scheduleCellContent 로 이동
//   · 기존 사용자는 이 모듈에서 export 하는 scheduleCellContent 를 그대로 import 가능 (BC)
export const scheduleCellContent = _scheduleCellContent;

// re-export · 외부에서 individually import 하지 않도록 · 내부에서만 사용
export { getTypeHoursMap };
export default MonthScheduleViewV2;
