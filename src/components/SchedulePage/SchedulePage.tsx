// src/components/SchedulePage/SchedulePage.tsx
// 2026-08-22 · #framework-4 · 분리 완료 · 2378 → ~700라인
import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../lib/apiClient";
import { Employee, AuthSession } from "../../types";
import { isLogisticsPosition as isLogistics } from "../../lib/employeeCategory";
import { ScheduleFilterBar } from "./ScheduleFilterBar";
import { DayTimelineModal } from "../DayTimelineModal";
import { EmployeeCalendarModal } from "../EmployeeCalendarModal";
import { SettingsModal } from "../SettingsModal";
import { EmployeeFormModal } from "../EmployeeFormModal";
import { BreakModal } from "../common/features/BreakModal";
import { useSettings } from "../../hooks/useSettings";
import { useContactInfo } from "../../hooks/useContactInfo";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { UserPlus, CheckCircle, Lock } from "lucide-react";
import { Card } from "../common/Card";
import { useScheduleData } from "./useScheduleData";
import { useDisplayZones } from "./useDisplayZones";
import {
  getTodayStr, buildDateList, getTypeHoursMap,
  getCalculatedSummary, parseBreakMemo, splitTimeRange, buildFilteredEmployees,
} from "./scheduleHelpers";
import { ScheduleToolbar } from "./ScheduleToolbar";
import { ScheduleGrid } from "./ScheduleGrid";
import { SearchInsights } from "./SearchInsights";
import { AdminLoginModal } from "./AdminLoginModal";
import { CopyMonthModal } from "./CopyMonthModal";

interface SchedulePageProps {
  onBack?: () => void;
  onLogout?: () => void;
  onNavigate?: (page: AppNavPage) => void;
  initialEditEmployeeId?: number | null;
  onEditEmployeeHandled?: () => void;
  authSession?: AuthSession | null;
  onEditEmployeeAtStaffManage?: (empId: number) => void;
}

export const SchedulePage: React.FC<SchedulePageProps> = ({
  onBack, onLogout, onNavigate, initialEditEmployeeId, onEditEmployeeHandled,
  authSession, onEditEmployeeAtStaffManage,
}) => {
  const { contact: spContact } = useContactInfo();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const userLevel = authSession?.level ??
    (authSession?.role === "superadmin" || authSession?.role === "admin" ? 9
    : authSession?.role === "manager" ? 2
    : authSession?.role === "employee" ? 1 : 0);
  const isSuperAdmin   = userLevel >= 9;
  const isManagerRole  = userLevel >= 2 && userLevel < 9;
  const isEmployeeMode = userLevel === 1;
  const sessionEmployeeId = authSession?.employeeId ?? null;

  const {
    positions: PRESET_POSITIONS,
    employmentTypes: PRESET_EMPLOYMENT_TYPES,
    workplaces: settingsWorkplaces,
    scheduleTypes: settingsScheduleTypes,
    wageRates: settingsWageRates,
    employeeWageOverrides: settingsEmployeeWageOverrides,
    update: updateSettings,
  } = useSettings();

  // ── Navigation State ──────────────────────────────────────────────────────
  const [currentYear,  setCurrentYear]  = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth() + 1);
  const todayStr = getTodayStr();

  // ── Notification ──────────────────────────────────────────────────────────
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showNotification = useCallback((message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  // ── Data Hook ─────────────────────────────────────────────────────────────
  const {
    employees, setEmployees,
    isLoading, error,
    undoStack,
    isMonthLocked, isLockLoading,
    isCopying,
    isInitialFetchRef,
    fetchScheduleData,
    handleCellUpdate,
    handleUndo,
    handleSaveBreak,
    handleAddEmployee,
    handleDeleteEmployee,
    handleUpdateDescription,
    handleSetEmployeePassword,
    loadMonthLock,
    handleToggleMonthLock,
    executeCopyFromPreviousMonth,
    applyShiftHoursToAll,
  } = useScheduleData(currentYear, currentMonth, showNotification);

  // ── Date List ─────────────────────────────────────────────────────────────
  const dateList = React.useMemo(
    () => buildDateList(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  // ── Scroll Refs ───────────────────────────────────────────────────────────
  const scrollTableRef    = useRef<HTMLDivElement>(null);
  const todayColRef       = useRef<HTMLTableCellElement>(null);
  const nameThRef         = useRef<HTMLTableCellElement>(null);
  const pendingScrollDateRef  = useRef<string | null>(null);
  const suppressScrollRef     = useRef(false);
  const isInitialLoadRef      = useRef(true);
  const [nameColWidth, setNameColWidth] = useState(80);
  useEffect(() => {
    if (nameThRef.current) setNameColWidth(nameThRef.current.getBoundingClientRect().width);
  }, [employees.length]);

  // ── Admin State ───────────────────────────────────────────────────────────
  const [isAdmin, setIsAdmin] = useState(() => {
    const lvl = authSession?.level ?? 0;
    if (lvl >= 2) return true;
    if (lvl === 1) return false;
    return localStorage.getItem("megatown_admin") === "true";
  });
  useEffect(() => {
    const lvl = authSession?.level ?? 0;
    if (lvl >= 2) setIsAdmin(true);
    else if (lvl === 1) setIsAdmin(false);
  }, [authSession?.level]);

  const [editMode, setEditMode] = useState(false);

  // ── Admin Login Modal ─────────────────────────────────────────────────────
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginId, setLoginId]   = useState("");
  const [loginPw, setLoginPw]   = useState("");
  const [loginError, setLoginError] = useState("");

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginId === "osanmega" && loginPw === "1234") {
      setIsAdmin(true);
      localStorage.setItem("megatown_admin", "true");
      setIsLoginModalOpen(false);
      setLoginId(""); setLoginPw(""); setLoginError("");
      showNotification("성공적으로 로그인되었습니다. (관리자 모드 활성화)");
    } else {
      setLoginError("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    if (onLogout) { onLogout(); }
    else {
      localStorage.removeItem("megatown_admin");
      localStorage.removeItem("megatown_auth_session");
      onBack?.();
    }
  };

  const handleNavPage = useCallback((p: AppNavPage) => {
    if (p === "landing") { onBack?.(); return; }
    onNavigate?.(p);
  }, [onNavigate, onBack]);

  // ── Employee Form State ───────────────────────────────────────────────────
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [empModalMode, setEmpModalMode] = useState<"create" | "edit">("create");
  const [selectedEmpForEdit, setSelectedEmpForEdit] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState("");
  const [empPosition, setEmpPosition] = useState("");
  const [empCustomPosition, setEmpCustomPosition] = useState("");
  const [empEmploymentType, setEmpEmploymentType] = useState("정직원");
  const [empHireDate, setEmpHireDate] = useState("");
  const [empRetireDate, setEmpRetireDate] = useState("");
  const [empDescription, setEmpDescription] = useState("");
  const [empWorkplace, setEmpWorkplace] = useState("매장");
  const [empGender, setEmpGender] = useState<"남" | "여" | "">("");
  const [empRank, setEmpRank] = useState("");
  const [empAnnualLeave, setEmpAnnualLeave] = useState(0);
  const [empLevel, setEmpLevel] = useState(1);
  const [empZoneNums, setEmpZoneNums] = useState<number[]>([]);
  const [empPhone, setEmpPhone] = useState("");
  const [empEmployeeNumber, setEmpEmployeeNumber] = useState("");
  const [empContractFile, setEmpContractFile] = useState<File | null>(null);
  const [empContractUrl, setEmpContractUrl] = useState<string | null>(null);
  const [showPasswordSet, setShowPasswordSet] = useState(false);
  const [newEmpPassword, setNewEmpPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // ── Modal State ───────────────────────────────────────────────────────────
  const [timelineDate, setTimelineDate] = useState<string | null>(null);
  const [calendarEmployee, setCalendarEmployee] = useState<Employee | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copyModal, setCopyModal] = useState({ open: false, copySchedules: true, copyDayAssignments: true });
  const [showSummary, setShowSummary] = useState<"hidden" | "summary" | "labor">("hidden");

  // ── Break Modal ───────────────────────────────────────────────────────────
  const [breakModal, setBreakModal] = useState<{
    employeeId: number; date: string; scheduleId?: number;
    type: string; workingHours: string; actualHours: string; memo: string;
    lunchStart: string; lunchEnd: string; breakStart: string; breakEnd: string;
  } | null>(null);
  const [isSavingBreak, setIsSavingBreak] = useState(false);

  const openBreakModalForCell = useCallback((employeeId: number, date: string) => {
    const emp = employees.find(e => e.id === employeeId);
    const sched = emp?.schedules.find(s => s.date === date);
    const parsed = parseBreakMemo(sched?.memo || "");
    const [ls, le] = splitTimeRange(parsed.lunch);
    const [bs, be] = splitTimeRange(parsed.break);
    setBreakModal({ employeeId, date, scheduleId: sched?.id, type: sched?.type || "", workingHours: sched?.workingHours || "", actualHours: sched?.actualHours || "", memo: sched?.memo || "", lunchStart: ls, lunchEnd: le, breakStart: bs, breakEnd: be });
  }, [employees]);

  // ── Filter & Sort ─────────────────────────────────────────────────────────
  const [positionTab, setPositionTab]   = useState<"전체" | "약사" | "사원" | "창고" | "매장">("전체");
  const [searchQuery, setSearchQuery]   = useState("");
  const [sortBy, setSortBy]             = useState<"none" | "today" | "workplace" | "position" | "name">("today");
  const [sortOrder, setSortOrder]       = useState<"asc" | "desc">("asc");
  const [todayFirst, setTodayFirst]     = useState(true);

  const filteredEmployees = buildFilteredEmployees(employees, positionTab, searchQuery, sortBy, sortOrder, todayFirst, todayStr);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getTypeHoursMapFn = useCallback((position: string, employmentType = "") =>
    getTypeHoursMap(position, employmentType, settingsScheduleTypes),
  [settingsScheduleTypes]);

  const currentSummaryList = React.useMemo(
    () => getCalculatedSummary(filteredEmployees, dateList),
    [filteredEmployees, dateList]
  );

  // ── Display Zones ─────────────────────────────────────────────────────────
  const { buildLogisticsZoneProps, getEmpZoneNums, applyZones: applyDisplayZones } = useDisplayZones();
  const calendarLogisticsZoneProps = calendarEmployee ? buildLogisticsZoneProps(calendarEmployee) : undefined;

  // ── Employee Modal Helpers ────────────────────────────────────────────────
  const resetEmpForm = () => {
    setEmpName(""); setEmpPosition(""); setEmpCustomPosition("");
    setEmpEmploymentType("정직원"); setEmpHireDate(""); setEmpRetireDate("");
    setEmpDescription(""); setEmpWorkplace("매장"); setEmpGender("");
    setEmpRank(""); setEmpAnnualLeave(0); setEmpLevel(1); setEmpZoneNums([]);
    setEmpPhone(""); setEmpContractFile(null); setEmpContractUrl(null);
    setSelectedEmpForEdit(null); setEmpModalMode("create");
    setEmpEmployeeNumber("");
  };

  const openCreateEmployeeModal = () => {
    resetEmpForm();
    setIsEmpModalOpen(true);
  };

  const openEditEmployeeModal = (emp: Employee) => {
    setSelectedEmpForEdit(emp);
    setEmpModalMode("edit");
    setEmpName(emp.name);
    const knownPositions = ["약사", "캐셔", "물류", "진열"];
    if (emp.position && !knownPositions.includes(emp.position)) {
      setEmpPosition("기타"); setEmpCustomPosition(emp.position);
    } else {
      setEmpPosition(emp.position || ""); setEmpCustomPosition("");
    }
    setEmpRank(emp.rank || "");
    setEmpAnnualLeave(emp.annual_leave_days ?? 0);
    setEmpLevel(emp.level ?? 1);
    setEmpEmploymentType(emp.employmentType || "정직원");
    setEmpHireDate(emp.hireDate || "");
    setEmpRetireDate(emp.retireDate || "");
    setEmpDescription(emp.description || "");
    setEmpWorkplace(emp.workplace || "매장");
    setEmpGender((emp.gender as "남" | "여") || "");
    if (isLogistics(emp.position)) {
      setEmpZoneNums(getEmpZoneNums(emp.id));
    } else {
      setEmpZoneNums([]);
    }
    setEmpPhone(emp.phone ?? "");
    setEmpContractFile(null);
    setEmpContractUrl(emp.contract_file_url ?? null);
    setShowPasswordSet(false); setNewEmpPassword(""); setIsSavingPassword(false);
    setIsEmpModalOpen(true);
  };

  const applyZones = (empId: number, name: string) => {
    const finalPosition = (!["약사", "캐셔", "물류", "진열"].includes(empPosition) && empCustomPosition.trim())
      ? empCustomPosition.trim() : empPosition.trim();
    applyDisplayZones(empId, name, finalPosition, empZoneNums);
  };

  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalPosition = (!["약사", "캐셔", "물류", "진열"].includes(empPosition) && empCustomPosition.trim())
      ? empCustomPosition.trim() : empPosition.trim();
    if (!empName.trim() || !finalPosition) {
      showNotification("직원 성명과 구분을 입력해 주십시오.", "error");
      return;
    }
    await handleAddEmployee(
      empModalMode, selectedEmpForEdit,
      {
        name: empName, position: finalPosition, rank: empRank.trim() || null,
        employmentType: empEmploymentType, hireDate: empHireDate || new Date().toISOString().split("T")[0],
        retireDate: empRetireDate || null, description: empDescription, workplace: empWorkplace,
        gender: empGender || null, phone: empPhone.trim() || null,
        annual_leave_days: empAnnualLeave > 0 ? empAnnualLeave : null, level: empLevel,
        employee_number: empEmployeeNumber.trim() || null,
      },
      empZoneNums, empContractFile,
      applyZones,
      async () => {
        setIsEmpModalOpen(false);
        resetEmpForm();
        await fetchScheduleData(dateList, true);
      }
    );
  };

  // ── Drag & Drop Row Reorder ───────────────────────────────────────────────
  const [draggedRowId, setDraggedRowId]   = useState<number | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<number | null>(null);

  const handleRowDragStart = (e: React.DragEvent, id: number) => {
    if (!isAdmin) { e.preventDefault(); return; }
    setDraggedRowId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
  };

  const handleRowDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (draggedRowId !== null && draggedRowId !== id) setDragOverRowId(id);
  };

  const handleRowDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedRowId === null || draggedRowId === targetId) {
      setDraggedRowId(null); setDragOverRowId(null); return;
    }
    const fromIdx = filteredEmployees.findIndex(emp => emp.id === draggedRowId);
    const toIdx   = filteredEmployees.findIndex(emp => emp.id === targetId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const reorderedFiltered = [...filteredEmployees];
      const [draggedItem] = reorderedFiltered.splice(fromIdx, 1);
      reorderedFiltered.splice(toIdx, 0, draggedItem);
      const filteredIds = new Set(filteredEmployees.map(emp => emp.id));
      const slots: number[] = [];
      employees.forEach((emp, idx) => { if (filteredIds.has(emp.id)) slots.push(idx); });
      const updatedEmployees = [...employees];
      slots.forEach((slotIdx, i) => { updatedEmployees[slotIdx] = reorderedFiltered[i]; });
      setEmployees(updatedEmployees);
      if (sortBy !== "none") setSortBy("none");
      if (todayFirst) setTodayFirst(false);
      localStorage.setItem("megatown_employee_order", JSON.stringify(updatedEmployees.map(emp => emp.id)));
      showNotification("직원 순서가 변경되었습니다.");
    }
    setDraggedRowId(null); setDragOverRowId(null);
  };

  // ── Month Navigation ──────────────────────────────────────────────────────
  const handlePrevMonth = () => {
    let year = currentYear, month = currentMonth - 1;
    if (month < 1) { month = 12; year--; }
    pendingScrollDateRef.current = `${year}-${String(month).padStart(2, "0")}-01`;
    setCurrentYear(year); setCurrentMonth(month); setEditMode(false);
  };

  const handleNextMonth = () => {
    let year = currentYear, month = currentMonth + 1;
    if (month > 12) { month = 1; year++; }
    pendingScrollDateRef.current = `${year}-${String(month).padStart(2, "0")}-01`;
    setCurrentYear(year); setCurrentMonth(month); setEditMode(false);
  };

  const handleScrollToToday = () => {
    const today = new Date();
    pendingScrollDateRef.current = todayStr;
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth() + 1);
    setEditMode(false);
  };

  // ── Effects ───────────────────────────────────────────────────────────────
  // Fetch on mount + month change
  useEffect(() => {
    const silent = !isInitialFetchRef.current;
    isInitialFetchRef.current = false;
    fetchScheduleData(dateList, silent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, currentMonth]);

  // Load month lock
  useEffect(() => { loadMonthLock(); }, [currentYear, currentMonth, loadMonthLock]);

  // Load year leave stats
  useEffect(() => {
    api.get<any>(`/api/leave-stats?year=${currentYear}`)
      .then(res => {})
      .catch(() => {});
  }, [currentYear]);

  // Ctrl+Z undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && isAdmin) {
        e.preventDefault();
        handleUndo();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undoStack, isAdmin, handleUndo]);

  // Scroll to pending date
  useEffect(() => {
    if (employees.length === 0) return;
    requestAnimationFrame(() => {
      const el = scrollTableRef.current;
      if (!el) return;
      const DATE_COL = 44;
      const MONTH_TOTAL_COL = el.clientWidth < 640 ? 44 : 52;
      if (pendingScrollDateRef.current) {
        const targetDate = pendingScrollDateRef.current;
        pendingScrollDateRef.current = null;
        const targetEl = el.querySelector<HTMLElement>(`[title="${targetDate} 타임라인 보기"]`);
        suppressScrollRef.current = true;
        if (targetEl) {
          const elRect = el.getBoundingClientRect();
          const targetRect = targetEl.getBoundingClientRect();
          const nameWidth = nameThRef.current?.getBoundingClientRect().width ?? 96;
          el.scrollLeft = Math.max(0, el.scrollLeft + (targetRect.left - elRect.left) - nameWidth);
        } else {
          const idx = dateList.indexOf(targetDate);
          if (idx >= 0) {
            const targetMonth = targetDate.substring(0, 7);
            const seenMonths = new Set<string>();
            for (const d of dateList) {
              if (d.substring(0, 7) === targetMonth) break;
              seenMonths.add(d.substring(0, 7));
            }
            const monthTotalWidth = showSummary !== "hidden" ? seenMonths.size * MONTH_TOTAL_COL : 0;
            el.scrollLeft = Math.max(0, idx * DATE_COL + monthTotalWidth);
          }
        }
        setTimeout(() => { suppressScrollRef.current = false; }, 300);
      } else if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        if (todayColRef.current) {
          const col = todayColRef.current;
          const cr = el.getBoundingClientRect();
          const colR = col.getBoundingClientRect();
          const colCenter = colR.left - cr.left + el.scrollLeft + col.offsetWidth / 2;
          suppressScrollRef.current = true;
          el.scrollLeft = Math.max(0, colCenter - el.clientWidth / 2);
          setTimeout(() => { suppressScrollRef.current = false; }, 300);
        }
      }
    });
  }, [employees, dateList, showSummary]);

  // Keep calendarEmployee in sync
  useEffect(() => {
    if (calendarEmployee) {
      const updated = employees.find(e => e.id === calendarEmployee.id);
      if (updated) setCalendarEmployee(updated);
    }
  }, [employees]);

  // Open edit modal from navigation
  useEffect(() => {
    if (!initialEditEmployeeId || employees.length === 0) return;
    const emp = employees.find(e => e.id === initialEditEmployeeId);
    if (emp) { openEditEmployeeModal(emp); onEditEmployeeHandled?.(); }
  }, [initialEditEmployeeId, employees]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
      {/* Toast */}
      {notification && (
        <div className="fixed top-5 right-5 z-[9999] pointer-events-none">
          <div className={`px-4 py-3 rounded-xl shadow-md flex items-center gap-2.5 border text-sm font-semibold backdrop-blur-sm animate-in slide-in-from-top-2 duration-300 ${notification.type === "success" ? "bg-white text-emerald-800 border-emerald-200 shadow-emerald-100" : "bg-white text-rose-800 border-rose-200 shadow-rose-100"}`}>
            <CheckCircle size={15} className={notification.type === "success" ? "text-emerald-500 shrink-0" : "text-rose-500 shrink-0"} />
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* App Header */}
      <AppNavHeader
        activePage="schedule" authSession={authSession ?? null}
        onBack={onBack} onNavigate={handleNavPage} onLogout={handleLogout}
        rightSlot={
          <div className="flex items-center gap-1">
            {userLevel < 1 && (
              <button
                onClick={() => { setLoginError(""); setIsLoginModalOpen(true); }}
                title="관리자 로그인"
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg transition cursor-pointer shadow-sm"
              >
                <Lock size={12} />
                <span className="hidden sm:inline">관리자 로그인</span>
              </button>
            )}
          </div>
        }
      />

      {/* Filter Bar */}
      <ScheduleFilterBar
        employees={employees}
        positionTab={positionTab} setPositionTab={setPositionTab}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        sortBy={sortBy} setSortBy={setSortBy}
        sortOrder={sortOrder} setSortOrder={setSortOrder}
        onResetCustomOrder={async () => {
          localStorage.removeItem("megatown_employee_order");
          await fetchScheduleData(dateList, true);
          showNotification("정렬 순서가 기본값으로 초기화되었습니다.");
        }}
        onCreateEmployee={undefined}
      />

      {/* Search Insights */}
      {searchQuery.trim() !== "" && (
        <SearchInsights
          employees={employees} searchQuery={searchQuery}
          currentYear={currentYear} currentMonth={currentMonth}
          onClearSearch={() => setSearchQuery("")}
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          settings={{ positions: PRESET_POSITIONS, employmentTypes: PRESET_EMPLOYMENT_TYPES, workplaces: settingsWorkplaces, scheduleTypes: settingsScheduleTypes, wageRates: settingsWageRates, employeeWageOverrides: settingsEmployeeWageOverrides }}
          employees={employees.map(e => ({ id: e.id, name: e.name, position: e.position }))}
          onUpdate={updateSettings}
          onApplyShiftHours={() => applyShiftHoursToAll(getTypeHoursMapFn, dateList)}
          onClose={() => setIsSettingsOpen(false)}
          editMode={editMode}
          onEnableEditMode={() => setEditMode(true)}
          sessionEmployeeId={sessionEmployeeId}
          onNavigateZoneLabels={onNavigate ? () => onNavigate("zone-labels" as AppNavPage) : undefined}
          onNavigatePermissions={onNavigate ? () => onNavigate("permissions" as AppNavPage) : undefined}
        />
      )}

      {/* Grid Container */}
      <div className="flex-1 flex flex-col p-2 sm:p-3 md:p-4 bg-zinc-100 gap-0 w-full lg:max-w-[1600px] lg:mx-auto min-w-0">
        <ScheduleToolbar
          currentYear={currentYear} currentMonth={currentMonth}
          isAdmin={isAdmin} editMode={editMode}
          isMonthLocked={isMonthLocked} isLockLoading={isLockLoading}
          isCopying={isCopying} showSummary={showSummary}
          currentSummaryList={currentSummaryList}
          typeHoursMap={getTypeHoursMapFn("", "")}
          pendingScrollDateRef={pendingScrollDateRef}
          scrollTableRef={scrollTableRef}
          nameThRef={nameThRef}
          suppressScrollRef={suppressScrollRef}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onToggleEditMode={() => setEditMode(m => !m)}
          onToggleMonthLock={handleToggleMonthLock}
          onCopyFromPreviousMonth={() => setCopyModal(p => ({ ...p, open: true }))}
          onSetShowSummary={setShowSummary}
          onCreateEmployee={openCreateEmployeeModal}
          onScrollToToday={handleScrollToToday}
        />

        <div className="bg-white border border-line rounded-b-xl flex flex-col flex-1 shadow-sm min-w-0 overflow-hidden">
          {/* Month locked banner */}
          {isMonthLocked && (
            <Card bg="bg-amber-50" borderColor="border-amber-200" variant="flat" padding="sm" className="mx-2 mt-2 flex items-center gap-2">
              <Lock size={13} className="text-amber-500 shrink-0" />
              <span className="text-xs font-bold text-amber-700">{currentMonth}월 스케줄이 확정된 상태입니다. 수정하려면 확정해제 후 진행하세요.</span>
            </Card>
          )}

          {/* Empty month banner */}
          {!isLoading && !error && isAdmin && employees.length > 0 && !employees.some(emp => emp.schedules?.some(s => s.type.trim() !== "")) && (
            <div className="m-2 sm:m-4 p-3 sm:p-4 bg-brand-tint border border-brand/15 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white/70 text-brand-deep rounded-lg shrink-0 ring-1 ring-brand/10">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h4 className="text-[14px] font-bold text-brand-deep">이번 달 ({currentMonth}월) 스케줄 데이터가 비어 있습니다</h4>
                  <p className="text-[13px] text-brand-deep/80 mt-0.5 leading-relaxed">이전 달의 스케줄 패턴을 그대로 복사해 오시겠습니까?</p>
                </div>
              </div>
              <button
                onClick={() => setCopyModal(p => ({ ...p, open: true }))}
                disabled={isCopying}
                className="h-9 px-4 bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg text-[14px] font-semibold shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-40 select-none cursor-pointer shrink-0"
              >
                이전달({currentMonth === 1 ? 12 : currentMonth - 1}월) 복사
              </button>
            </div>
          )}

          {/* Edit mode hint */}
          {isAdmin && !isMonthLocked && (
            <div className={`flex items-center gap-2 px-3 py-1.5 border-b shrink-0 min-w-0 overflow-hidden sticky top-0 z-30 ${editMode ? "bg-brand-tint border-brand/20" : "bg-white border-line"}`}>
              {editMode ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-deep animate-pulse shrink-0" />
                  <span className="text-[13px] text-brand-deep font-semibold truncate min-w-0">편집 모드 — 셀 클릭: 오픈 → 미들 → 마감 → 휴무 순환 · 설정 버튼: 상세 편집</span>
                </>
              ) : (
                <span className="text-[13px] text-ink-soft truncate min-w-0">셀을 수정하려면 상단 <strong className="text-ink font-semibold">편집</strong> 버튼을 눌러 편집 모드를 켜세요</span>
              )}
            </div>
          )}

          {/* Schedule table */}
          <div
            ref={scrollTableRef}
            className={`relative overflow-x-auto w-full ${employees.length > 10 ? "max-h-[70vh] overflow-y-auto" : ""} ${employees.length > 15 ? "md:max-h-[calc(100vh-260px)] md:overflow-y-auto" : "md:max-h-none md:overflow-y-visible"}`}
          >
            <ScheduleGrid
              employees={employees}
              filteredEmployees={filteredEmployees}
              displayDates={dateList}
              todayStr={todayStr}
              todayColRef={todayColRef}
              nameThRef={nameThRef}
              currentYear={currentYear}
              currentMonth={currentMonth}
              isLoading={isLoading}
              error={error}
              isAdmin={isAdmin}
              isManagerRole={isManagerRole}
              isEmployeeMode={isEmployeeMode}
              userLevel={userLevel}
              sessionEmployeeId={sessionEmployeeId}
              editMode={editMode}
              isMonthLocked={isMonthLocked}
              showSummary={showSummary}
              currentSummaryList={currentSummaryList}
              draggedRowId={draggedRowId}
              dragOverRowId={dragOverRowId}
              settingsScheduleTypes={settingsScheduleTypes}
              settingsWageRates={settingsWageRates}
              settingsEmployeeWageOverrides={settingsEmployeeWageOverrides}
              getTypeHoursMap={getTypeHoursMapFn}
              onRetryFetch={() => fetchScheduleData(dateList)}
              onCreateEmployee={openCreateEmployeeModal}
              onSetTimelineDate={setTimelineDate}
              onEmployeeNameClick={e => setCalendarEmployee(e)}
              onEmployeeEditClick={openEditEmployeeModal}
              onEmployeeDeleteClick={handleDeleteEmployee}
              onCellUpdate={handleCellUpdate}
              onBreakModalOpen={openBreakModalForCell}
              onRowDragStart={handleRowDragStart}
              onRowDragOver={handleRowDragOver}
              onRowDrop={handleRowDrop}
              onRowDragEnd={() => { setDraggedRowId(null); setDragOverRowId(null); }}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="h-9 bg-white border-t border-line shrink-0 px-4 sm:px-6 flex items-center justify-center text-xs font-bold text-zinc-600 tracking-wide">
        <span>© {spContact.copyrightText || "(주)이룸즈(IRUMS)"}</span>
      </footer>

      {/* Employee Form Modal */}
      {isEmpModalOpen && (
        <EmployeeFormModal
          empModalMode={empModalMode} empName={empName} setEmpName={setEmpName}
          empPosition={empPosition} setEmpPosition={setEmpPosition}
          empCustomPosition={empCustomPosition} setEmpCustomPosition={setEmpCustomPosition}
          empEmploymentType={empEmploymentType} setEmpEmploymentType={setEmpEmploymentType}
          empHireDate={empHireDate} setEmpHireDate={setEmpHireDate}
          empRetireDate={empRetireDate} setEmpRetireDate={setEmpRetireDate}
          empDescription={empDescription} setEmpDescription={setEmpDescription}
          empWorkplace={empWorkplace} setEmpWorkplace={setEmpWorkplace}
          empGender={empGender} setEmpGender={setEmpGender}
          empRank={empRank} setEmpRank={setEmpRank}
          empAnnualLeave={empAnnualLeave} setEmpAnnualLeave={setEmpAnnualLeave}
          empLevel={empLevel} setEmpLevel={setEmpLevel}
          empZoneNums={empZoneNums} setEmpZoneNums={setEmpZoneNums}
          employmentTypes={PRESET_EMPLOYMENT_TYPES}
          empPhone={empPhone} setEmpPhone={setEmpPhone}
          empContractFile={empContractFile} setEmpContractFile={setEmpContractFile}
          empContractUrl={empContractUrl}
          empEmployeeNumber={empEmployeeNumber} setEmpEmployeeNumber={setEmpEmployeeNumber}
          onSubmit={handleAddEmployeeSubmit}
          onClose={() => setIsEmpModalOpen(false)}
        />
      )}

      {/* Break Modal */}
      {breakModal && (
        <BreakModal
          breakModal={breakModal} setBreakModal={setBreakModal}
          isSavingBreak={isSavingBreak}
          onSave={() => handleSaveBreak(breakModal, parseBreakMemo, () => setBreakModal(null), setIsSavingBreak)}
        />
      )}

      {/* Admin Login Modal */}
      {isLoginModalOpen && (
        <AdminLoginModal
          loginId={loginId} setLoginId={setLoginId}
          loginPw={loginPw} setLoginPw={setLoginPw}
          loginError={loginError}
          onSubmit={handleLoginSubmit}
          onClose={() => { setIsLoginModalOpen(false); setLoginError(""); }}
        />
      )}

      {/* Day Timeline Modal */}
      {timelineDate && (
        <DayTimelineModal
          date={timelineDate}
          employees={employees}
          typeHoursMap={getTypeHoursMapFn("", "")}
          pharmTypeHoursMap={getTypeHoursMapFn("약사", "")}
          onClose={() => setTimelineDate(null)}
          onDateChange={setTimelineDate}
          onEditEmployee={isAdmin ? openEditEmployeeModal : undefined}
          onUpdateSchedule={isAdmin ? handleCellUpdate : undefined}
          scheduleTypeEntries={settingsScheduleTypes}
        />
      )}

      {/* Employee Calendar Modal */}
      {calendarEmployee && (
        <EmployeeCalendarModal
          employee={calendarEmployee}
          initialYear={currentYear} initialMonth={currentMonth}
          onClose={() => setCalendarEmployee(null)}
          isAdmin={isAdmin} isLocked={isMonthLocked}
          onUpdate={isMonthLocked ? undefined : handleCellUpdate}
          onBulkSave={isMonthLocked ? undefined : async items => {
            try {
              await api.post<any>("/api/schedules/batch", { items: items.map(item => ({ employeeId: calendarEmployee.id, ...item })) });
              showNotification(`${calendarEmployee.name}님의 ${items.length}일 일괄 스케줄이 반영되었습니다.`);
              const savedDates = items.map(i => i.date);
              await fetchScheduleData(Array.from(new Set([...dateList, ...savedDates])), true);
            } catch (err) {
              console.error("Bulk save failed:", err);
              showNotification("일괄 저장 중 오류가 발생했습니다.", "error");
              throw err;
            }
          }}
          scheduleTypes={settingsScheduleTypes.map(e => ({ value: e.type, label: e.type }))}
          scheduleTypeEntries={settingsScheduleTypes}
          typeHoursMap={calendarEmployee ? getTypeHoursMapFn(calendarEmployee.position, calendarEmployee.employmentType) : undefined}
          logisticsZoneProps={calendarLogisticsZoneProps}
          onEditEmployee={isAdmin ? () => {
            const emp = calendarEmployee;
            setCalendarEmployee(null);
            if (!emp) return;
            if (onEditEmployeeAtStaffManage) setTimeout(() => onEditEmployeeAtStaffManage(emp.id), 0);
            else setTimeout(() => openEditEmployeeModal(emp), 0);
          } : undefined}
        />
      )}

      {/* Copy Month Modal */}
      {copyModal.open && (
        <CopyMonthModal
          currentYear={currentYear} currentMonth={currentMonth}
          copySchedules={copyModal.copySchedules}
          setCopySchedules={v => setCopyModal(p => ({ ...p, copySchedules: v }))}
          copyDayAssignments={copyModal.copyDayAssignments}
          setCopyDayAssignments={v => setCopyModal(p => ({ ...p, copyDayAssignments: v }))}
          onClose={() => setCopyModal(p => ({ ...p, open: false }))}
          onConfirm={() => executeCopyFromPreviousMonth(
            copyModal.copySchedules, copyModal.copyDayAssignments,
            dateList,
            () => setCopyModal(p => ({ ...p, open: false }))
          )}
        />
      )}
    </div>
  );
};

export default SchedulePage;
