// src/components/schedule-v2/views/EmployeeScheduleViewV2.tsx
// 2026-10-07 · 스케줄 V2 · 직원별 뷰 (Phase V2-D)
//   · 좌 · 직원 리스트 (검색 · 선택) · 우 · 선택 직원 workspace
//   · 우 subview · [달력 · 일괄등록 · 기본정보] segmented
//   · 캐노니컬 재사용 · useScheduleData · useSettings · getTypeHoursMap
//     · MonthGridV2 는 single-employee array 로 projection (N+1 없음 · 월 1회 fetch)
//   · 쓰기 · handleCellUpdate (셀) + POST /api/schedules/batch (일괄 · 기존 V1 과 동일 endpoint)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useScheduleData, type CellUpdateData } from "../../SchedulePage/useScheduleData";
import { useSettings } from "../../../hooks/useSettings";
import { buildDateList, getTodayStr, getTypeHoursMap } from "../../SchedulePage/scheduleHelpers";
import type { AuthSession, Employee } from "../../../types";
import { Spinner } from "../../common/Spinner";
import { Card } from "../../common/Card";
import { MonthGridV2 } from "./month-grid/MonthGridV2";
import { EmployeeBulkPanel } from "./employee/EmployeeBulkPanel";
import { EmployeeInfoPanel } from "./employee/EmployeeInfoPanel";

type EmpSubView = "calendar" | "bulk" | "info";

interface Props {
  year: number;
  month: number;
  onMonthDelta: (delta: number) => void;
  onToday: () => void;
  authSession: AuthSession | null;
  onEmployeeManagement?: (employeeId: number) => void;
}

export const EmployeeScheduleViewV2: React.FC<Props> = ({
  year, month, onMonthDelta, onToday, authSession, onEmployeeManagement,
}) => {
  void onMonthDelta; void onToday;
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
  } = useScheduleData(year, month, showNotification);

  const { scheduleTypes } = useSettings();
  const dateList = useMemo(() => buildDateList(year, month), [year, month]);
  const todayStr = getTodayStr();

  // 2026-10-08 · E-HOTFIX · V1 SchedulePage 와 동일한 caller-driven fetch trigger
  //   · useScheduleData 는 자동 fetch 하지 않음 (caller-driven) · 누락 시 isLoading 영구 true
  useEffect(() => {
    const silent = !isInitialFetchRef.current;
    isInitialFetchRef.current = false;
    fetchScheduleData(dateList, silent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);
  const level = authSession?.level ?? 0;
  const canEdit = !isMonthLocked || level >= 9;

  // 좌측 리스트 · search + selection
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const filteredEmployees = useMemo(() => {
    const q = search.trim();
    if (!q) return employees;
    return employees.filter(e => e.name.includes(q));
  }, [employees, search]);

  // 첫 로드 시 첫 직원 자동 선택
  const firstId = filteredEmployees[0]?.id ?? null;
  const currentSelectedId = selectedId ?? firstId;
  const selectedEmployee = useMemo(
    () => employees.find(e => e.id === currentSelectedId) ?? null,
    [employees, currentSelectedId],
  );

  // 우측 subview
  const [subview, setSubview] = useState<EmpSubView>("calendar");

  // 달력 edit mode
  const [editMode, setEditMode] = useState(false);
  const effectiveEditMode = editMode && canEdit;
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

  // 선택 직원만 포함하는 single-row grid array
  const selectedAsArray = useMemo(
    () => (selectedEmployee ? [selectedEmployee] : []),
    [selectedEmployee],
  );

  return (
    <div className="flex-1 min-h-0 flex gap-3">
      {/* 좌측 · 직원 리스트 */}
      <Card variant="sm" padding="none" rounded="xl" className="w-[240px] shrink-0 flex flex-col min-h-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-line">
          <div className="relative">
            <MagnifyingGlass size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="직원 검색"
              className="w-full h-8 pl-7 pr-2 text-[13px] rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div className="mt-1.5 text-[11px] text-ink-soft tabular-nums">
            {filteredEmployees.length} / {employees.length}명
          </div>
        </div>
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <Spinner size={13} tone="zinc" label="로딩..." />
          </div>
        ) : (
          <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-zinc-100">
            {filteredEmployees.map(emp => {
              const active = emp.id === currentSelectedId;
              return (
                <li key={`emp-${emp.id}`}>
                  <button
                    type="button"
                    onClick={() => { setSelectedId(emp.id); setEditTarget(null); }}
                    className={`w-full text-left px-3 py-2 transition cursor-pointer ${
                      active ? "bg-brand-tint/60 border-l-2 border-brand-deep" : "hover:bg-zinc-50 border-l-2 border-transparent"
                    }`}
                  >
                    <div className={`text-[13px] font-semibold leading-tight ${active ? "text-brand-deep" : "text-ink"}`}>
                      {emp.name}
                    </div>
                    <div className="text-[11px] text-ink-soft">{emp.position} · {emp.employmentType ?? ""}</div>
                  </button>
                </li>
              );
            })}
            {filteredEmployees.length === 0 && (
              <li className="px-3 py-6 text-center text-[12px] text-ink-soft">검색 결과 없음</li>
            )}
          </ul>
        )}
      </Card>

      {/* 우측 · workspace */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {!selectedEmployee ? (
          <Card variant="sm" padding="md" rounded="xl" className="flex-1 flex items-center justify-center">
            <div className="text-[13px] text-ink-soft">왼쪽에서 직원을 선택하세요</div>
          </Card>
        ) : (
          <>
            {/* 상단 · 선택 직원 요약 + subview tabs + edit toggle */}
            <div className="flex flex-wrap items-center gap-2 py-2 border-b border-line">
              <div className="flex items-center gap-2 shrink-0">
                <h2 className="text-[18px] font-extrabold text-ink leading-tight tracking-tight">{selectedEmployee.name}</h2>
                <span className="text-[13px] text-ink-soft">{selectedEmployee.position} · {selectedEmployee.employmentType ?? "-"}</span>
                {isMonthLocked && (
                  <span className="inline-flex items-center h-6 px-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold">
                    {month}월 확정됨
                  </span>
                )}
              </div>
              <div className="ml-auto inline-flex rounded-lg border border-line bg-white overflow-hidden">
                {([
                  { k: "calendar" as const, label: "달력" },
                  { k: "bulk" as const,     label: "일괄등록" },
                  { k: "info" as const,     label: "기본정보" },
                ]).map(opt => {
                  const active = subview === opt.k;
                  return (
                    <button
                      key={opt.k}
                      type="button"
                      onClick={() => setSubview(opt.k)}
                      className={`h-8 px-3 text-[13px] font-semibold transition cursor-pointer ${
                        active ? "bg-brand-deep text-white" : "text-ink-soft hover:text-ink hover:bg-zinc-50"
                      }`}
                      aria-pressed={active}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {subview === "calendar" && (
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setEditMode(prev => !prev)}
                  className={`h-8 px-3 rounded-lg text-[13px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    effectiveEditMode
                      ? "bg-brand-deep text-white border border-brand-deep hover:bg-[#0d3a5c]"
                      : "bg-white text-brand-deep border border-brand-deep/30 hover:bg-brand-tint/40"
                  }`}
                >
                  {effectiveEditMode ? "편집 중" : "편집"}
                </button>
              )}
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

            {/* subview content */}
            <div className="flex-1 min-h-0 flex flex-col mt-2">
              {error ? (
                <div className="flex-1 flex items-center justify-center py-16 text-[13px] text-rose-600">
                  로드 실패 · {error}
                </div>
              ) : subview === "calendar" ? (
                <MonthGridV2
                  employees={selectedAsArray}
                  dateList={dateList}
                  todayStr={todayStr}
                  scheduleTypes={scheduleTypes}
                  editMode={effectiveEditMode}
                  editTarget={editTarget}
                  onOpenEdit={openEdit}
                  onCloseEdit={closeEdit}
                  onTypeSelect={handleTypeSelect}
                />
              ) : subview === "bulk" ? (
                <EmployeeBulkPanel
                  employee={selectedEmployee}
                  year={year}
                  month={month}
                  scheduleTypes={scheduleTypes}
                  isLocked={isMonthLocked}
                  canEdit={canEdit}
                  showNotification={showNotification}
                  onApplied={() => fetchScheduleData(dateList, true)}
                />
              ) : (
                <EmployeeInfoPanel
                  employee={selectedEmployee}
                  onOpenManagement={onEmployeeManagement}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// re-export · parent 가 getTypeHoursMap 참조 가능하도록 (내부 사용 X)
export { getTypeHoursMap };
export default EmployeeScheduleViewV2;
