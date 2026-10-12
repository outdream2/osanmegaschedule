// src/components/schedule-v2/ScheduleV2Page.tsx
// 2026-10-07 · 사용자 지시 · 스케줄 V2 평가용 신규 workspace
//   · 기존 SchedulePage 는 그대로 유지 · 병행 · 사용자가 비교 후 승격 결정
//   · 데이터 소스: canonical employees/schedules/settings · 기존 hook 재사용
//   · UI 쇄신: Line Tabs(월간·주간·일간·직원별) · desktop-first · 모달 깊이 최소화
//   · Phase V2-A: route · menu · header · view tabs · 월간 view (sticky col/date · read-only + edit)
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { CalendarBlank, CalendarCheck, UsersThree, ListBullets } from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { useActiveNav } from "../../contexts/ActiveNavContext";
import type { AuthSession } from "../../types";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { MonthScheduleViewV2 } from "./views/MonthScheduleViewV2";
import { WeekScheduleViewV2 } from "./views/WeekScheduleViewV2";
import { DayScheduleViewV2 } from "./views/DayScheduleViewV2";
import { EmployeeScheduleViewV2, type EmpSubView } from "./views/EmployeeScheduleViewV2";
import { BulkEmployeePickerModal } from "./components/BulkEmployeePickerModal";
import type { Employee } from "../../types";
import { SK_EMPLOYEE_ORDER } from "../../lib/storageKeys";
import { toYmd } from "./helpers/week";

export type ScheduleV2View = "month" | "week" | "day" | "employee";

interface Props {
  authSession: AuthSession | null;
  onBack?: () => void;
  onLogout?: () => void;
  onNavigate?: (page: AppNavPage) => void;
  /** 2026-10-08 · V1 과 동일 pattern · 기본정보 "직원관리 수정" → 해당 직원 preselected 로 이동 */
  onEditEmployeeAtStaffManage?: (employeeId: number) => void;
}

const VIEW_TABS: { key: ScheduleV2View; label: string; icon: React.ElementType }[] = [
  { key: "month",    label: "월간",   icon: CalendarBlank },
  { key: "week",     label: "주간",   icon: CalendarCheck },
  { key: "day",      label: "일간",   icon: ListBullets },
  { key: "employee", label: "직원별", icon: UsersThree },
];

export const ScheduleV2Page: React.FC<Props> = ({ authSession, onBack, onLogout, onNavigate, onEditEmployeeAtStaffManage }) => {
  // 2026-10-09 · 디버그 · 사용자 지시 "원인철저분석" · schedule-v2 진입 즉시 로그아웃 추적
  //   · render 가 호출됐는지 · mount 완료됐는지 · unmount 되는지 · 각 단계 식별
  // eslint-disable-next-line no-console
  console.log("[ScheduleV2Page] RENDER", { hasAuthSession: !!authSession, role: authSession?.role, pathname: typeof window !== "undefined" ? window.location.pathname : "SSR" });
  // 2026-10-07 · activeNav 등록 · AppNavHeader breadcrumb 정확
  // 2026-10-09 · fix · remount 루프 방지 · 이미 active 면 skip
  //   · 원인 · useEffect 가 setActiveByPage 호출 → activeNav state 변경 → consumer re-render → remount → 반복
  //   · 해결 · activeNav.itemKey 가 이미 "schedule-v2" 면 skip (idempotent · 더 이상 state 변경 X)
  const { activeNav, setActiveByPage } = useActiveNav();
  useEffect(() => {
    if (activeNav?.itemKey === "schedule-v2") {
      // 이미 active · state 변경 skip (loop 방지)
      return;
    }
    // eslint-disable-next-line no-console
    console.log("[ScheduleV2Page] MOUNTED · setActiveByPage(schedule-v2)", { prevItemKey: activeNav?.itemKey });
    setActiveByPage("schedule-v2" as AppNavPage);
    return () => {
      // eslint-disable-next-line no-console
      console.log("[ScheduleV2Page] UNMOUNTING");
    };
  }, [activeNav?.itemKey, setActiveByPage]);

  // 월간/주간/일간/직원별 전환
  const [view, setView] = useState<ScheduleV2View>("month");

  // 월간/주간/일간이 공유하는 anchor
  //   · 월간 · 년/월
  //   · 주간 · anchor date (해당 주의 아무 날)
  //   · 전환 시 서로 호환되도록 변경 시 양쪽 동기화
  const now = useMemo(() => new Date(), []);
  const [year, setYear]   = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [anchorDate, setAnchorDate] = useState<Date>(now);

  // 2026-10-08 · V1 parity · navigation state
  //   · Month/Week 날짜 click → Day · 직원 click → Employee
  //   · V1 ScheduleGrid.tsx:143 (onSetTimelineDate) + SchedulePage.tsx:669 (setCalendarEmployee) 와 동일 흐름
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

  // 2026-10-08 · 일괄등록 shortcut
  //   · Month/Week toolbar [일괄등록] 클릭 → employee picker modal → 직원 선택 → Employee View bulk subview
  //   · 기존 EmployeeBulkPanel 그대로 재사용 · 신규 bulk logic 0
  const [requestedEmployeeSubview, setRequestedEmployeeSubview] = useState<EmpSubView | undefined>(undefined);
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [bulkPickerEmployees, setBulkPickerEmployees] = useState<Employee[]>([]);

  // 2026-10-08 · V1 FULL parity · 공유 filter state
  //   · V1 SchedulePage.tsx:226-230 상동
  //   · positionTab · searchQuery · sortBy · sortOrder · todayFirst · reset
  const [positionTab, setPositionTab] = useState<string>("전체");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"none" | "today" | "name" | "position" | "workplace">("none");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [todayFirst, setTodayFirst] = useState<boolean>(false);

  // reset · 모든 필터 + localStorage SK_EMPLOYEE_ORDER (커스텀 순서) 삭제
  //   · V1 ScheduleFilterBar:99-112 와 동일 semantics
  const handleFilterReset = useCallback(() => {
    setPositionTab("전체");
    setSearchQuery("");
    setSortBy("none");
    setSortOrder("asc");
    setTodayFirst(false);
    try { localStorage.removeItem(SK_EMPLOYEE_ORDER); } catch { /**/ }
  }, []);

  const goMonthDelta = useCallback((delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setAnchorDate(d);
  }, [year, month]);
  const goToday = useCallback(() => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
    setAnchorDate(t);
  }, []);

  const goWeekDelta = useCallback((daysDelta: number) => {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() + daysDelta);
    setAnchorDate(d);
    // 월간/일간 state 와도 동기 · 뷰 전환 시 자연스럽게 유지
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }, [anchorDate]);
  const goThisWeek = useCallback(() => {
    const t = new Date();
    setAnchorDate(t);
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
  }, []);

  // Day view 는 anchorDate 를 YYYY-MM-DD 로 직접 사용
  const dayDate = useMemo(() => toYmd(anchorDate), [anchorDate]);

  // 2026-10-08 · V1 parity · 날짜 click → Day view · anchor sync
  const handleOpenDay = useCallback((date: string) => {
    const d = new Date(date);
    setAnchorDate(d);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setView("day");
  }, []);

  // 2026-10-08 · V1 parity · 직원 click → Employee view · selected id 유지
  const handleOpenEmployee = useCallback((empId: number) => {
    setSelectedEmployeeId(empId);
    setView("employee");
  }, []);

  // 2026-10-08 · 일괄등록 shortcut · Month/Week [일괄등록] 버튼 → employee picker open
  //   · Month/Week 가 자기 employees (visibleEmployees · 필터 반영) 를 picker 로 전달
  const handleRequestBulk = useCallback((employees: Employee[]) => {
    // 이미 Employee View 에 직원 선택되어 있으면 picker 생략 (사용자 지시 §3)
    if (view === "employee" && selectedEmployeeId != null) {
      setRequestedEmployeeSubview("bulk");
      return;
    }
    setBulkPickerEmployees(employees);
    setBulkPickerOpen(true);
  }, [view, selectedEmployeeId]);

  // Picker 에서 직원 선택 → Employee View bulk subview
  const handleBulkEmployeeSelect = useCallback((empId: number) => {
    setSelectedEmployeeId(empId);
    setRequestedEmployeeSubview("bulk");
    setView("employee");
    setBulkPickerOpen(false);
  }, []);

  // Employee View subview 가 다른 걸로 바뀌면 requested 는 null 로 (다시 bulk 로 강제 이동 방지)
  const handleEmployeeSubviewChange = useCallback((sub: EmpSubView) => {
    void sub;
    setRequestedEmployeeSubview(undefined);
  }, []);
  const goDayDelta = useCallback((daysDelta: number) => {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() + daysDelta);
    setAnchorDate(d);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }, [anchorDate]);
  const goTodayDate = useCallback(() => {
    const t = new Date();
    setAnchorDate(t);
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
  }, []);

  return (
    // 2026-10-09 · 사용자 지시 · "초고해상도" · 글씨 선명도 + GPU 가속 + Pretendard 피쳐 ON
    //   · antialiased · 서브픽셀 블러링 OFF (글씨 또렷)
    //   · text-rendering optimizeLegibility · 리가쳐·커닝 최적화
    //   · font-feature-settings · Pretendard "cv11" (일/점 구분) + "ss10" (한글 가독)
    //   · transform translateZ(0) · GPU layer promote (스크롤·sticky 선명도)
    <div
      className="min-h-screen bg-[#F4F7FA] flex flex-col antialiased [text-rendering:optimizeLegibility] [font-feature-settings:'cv11','ss10','tnum'] [transform:translateZ(0)] [-webkit-font-smoothing:antialiased] [-moz-osx-font-smoothing:grayscale]"
    >
      <AppNavHeader
        activePage={"schedule-v2" as AppNavPage}
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      <main className={`${PAGE_CONTAINER_CLS} flex-1 flex flex-col gap-3 px-4 py-4`}>
        {/* 상단 · 페이지 타이틀 + Line Tabs */}
        <div className="flex flex-col gap-2">
          <h1 className="text-[22px] font-extrabold text-ink leading-tight tracking-tight">스케줄</h1>
          {/* Line Tabs · 공통 UI (현재 공통 TabBar 가 variant line 지원하면 교체 가능) */}
          <nav aria-label="스케줄 뷰" className="flex items-end gap-0 border-b border-line">
            {VIEW_TABS.map(t => {
              const active = view === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setView(t.key)}
                  className={`relative inline-flex items-center gap-1.5 px-4 py-2 text-[15px] md:text-[16px] font-semibold tracking-tight transition cursor-pointer ${
                    active
                      ? "text-brand-deep"
                      : "text-zinc-500 hover:text-ink"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={14} weight={active ? "fill" : "regular"} />
                  {t.label}
                  {active && (
                    <span aria-hidden className="absolute inset-x-0 -bottom-px h-[2px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 뷰 컨텐츠 */}
        <div className="flex-1 min-h-0 flex flex-col">
          {view === "month" && (
            <MonthScheduleViewV2
              year={year}
              month={month}
              onMonthDelta={goMonthDelta}
              onToday={goToday}
              authSession={authSession}
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
              onFilterReset={handleFilterReset}
              onOpenDay={handleOpenDay}
              onOpenEmployee={handleOpenEmployee}
              onRequestBulk={handleRequestBulk}
            />
          )}
          {view === "week" && (
            <WeekScheduleViewV2
              anchorDate={anchorDate}
              onAnchorDelta={goWeekDelta}
              onThisWeek={goThisWeek}
              authSession={authSession}
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
              onFilterReset={handleFilterReset}
              onOpenDay={handleOpenDay}
              onOpenEmployee={handleOpenEmployee}
              onRequestBulk={handleRequestBulk}
            />
          )}
          {view === "day" && (
            <DayScheduleViewV2
              date={dayDate}
              onDateDelta={goDayDelta}
              onToday={goTodayDate}
              authSession={authSession}
              onJumpToDate={handleOpenDay}
            />
          )}
          {view === "employee" && (
            <EmployeeScheduleViewV2
              year={year}
              month={month}
              onMonthDelta={goMonthDelta}
              onToday={goToday}
              authSession={authSession}
              initialEmployeeId={selectedEmployeeId}
              initialSubview={requestedEmployeeSubview}
              onSubviewChange={handleEmployeeSubviewChange}
              onEmployeeManagement={(empId: number) => {
                // 2026-10-08 · 사용자 지시 · 직원관리 수정 → 해당 직원 preselected 로 이동
                //   · onEditEmployeeAtStaffManage · App.tsx navigateInnerWithOptions · V1 과 동일 flow
                //   · fallback · prop 없으면 그냥 페이지 이동
                if (onEditEmployeeAtStaffManage) onEditEmployeeAtStaffManage(empId);
                else onNavigate?.("business-manage" as AppNavPage);
              }}
            />
          )}
        </div>
      </main>

      {/* 2026-10-08 · 일괄등록 shortcut · 직원 picker (Month/Week [일괄등록] → 선택 → Employee View bulk subview) */}
      <BulkEmployeePickerModal
        open={bulkPickerOpen}
        onClose={() => setBulkPickerOpen(false)}
        employees={bulkPickerEmployees}
        onSelect={handleBulkEmployeeSelect}
      />
    </div>
  );
};

// 2026-10-07 · V2-E · PlaceholderView 제거 · 네 뷰 모두 실제 구현 완료
export default ScheduleV2Page;
