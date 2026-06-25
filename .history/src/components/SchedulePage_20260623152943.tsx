// src/components/SchedulePage.tsx
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Employee, MonthlySummary, Schedule } from "../types";
import { ScheduleCell } from "./ScheduleCell";
import { SummaryRow } from "./SummaryRow";
import { StoreMap } from "./StoreMap";
import { DayTimelineModal } from "./DayTimelineModal";
import { EmployeeCalendarModal } from "./EmployeeCalendarModal";
import { SettingsModal } from "./SettingsModal";
import { useSettings } from "../hooks/useSettings";
import {
  Calendar,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Info,
  Users,
  Briefcase,
  X,
  Trash2,
  CheckCircle,
  FileSpreadsheet,
  Search,
  Building2,
  Warehouse,
  Layers,
  Award,
  Clock,
  MessageSquare,
  Lock,
  Unlock,
  LogIn,
  LogOut,
  ShieldAlert,
  Edit,
  GripVertical,
} from "lucide-react";

export const SchedulePage: React.FC = () => {
  // Settings hook (positions, workplaces, scheduleTypes, shift hours)
  const {
    positions: PRESET_POSITIONS,
    employmentTypes: PRESET_EMPLOYMENT_TYPES,
    workplaces: settingsWorkplaces,
    scheduleTypes: settingsScheduleTypes,
    openShiftHour: settingsOpenShiftHour,
    middleShiftHour: settingsMiddleShiftHour,
    closeShiftHour: settingsCloseShiftHour,
    update: updateSettings,
  } = useSettings();
  // Navigation states
  const [currentYear, setCurrentYear] = useState<number>(2026);
  const [currentMonth, setCurrentMonth] = useState<number>(5); // default May 2026 matching seed

  // Server state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<MonthlySummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Undo history: stores previous schedule states for the last 20 cell changes
  const [undoStack, setUndoStack] = useState<Array<{
    employeeId: number; date: string; type: string; workingHours: string; actualHours: string; memo: string;
  }>>([]);

  // Drag and Drop row states
  const [draggedRowId, setDraggedRowId] = useState<number | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<number | null>(null);

  // Name column: auto-fit to content, measured via ref
  const nameThRef = useRef<HTMLTableCellElement>(null);
  const [nameColWidth, setNameColWidth] = useState<number>(80);
  useEffect(() => {
    if (nameThRef.current) {
      setNameColWidth(nameThRef.current.getBoundingClientRect().width);
    }
  });


  // Administrative / Auth states
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return localStorage.getItem("megatown_admin") === "true";
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginError, setLoginError] = useState("");

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginId === "osanmega" && loginPw === "1234") {
      setIsAdmin(true);
      localStorage.setItem("megatown_admin", "true");
      setIsLoginModalOpen(false);
      setLoginId("");
      setLoginPw("");
      setLoginError("");
      showNotification("성공적으로 로그인되었습니다. (관리자 모드 활성화)");
    } else {
      setLoginError("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    localStorage.removeItem("megatown_admin");
    showNotification("로그아웃되었습니다. (읽기 전용 모드)");
  };

  // Modal / Form states for adding/editing employee
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [empModalMode, setEmpModalMode] = useState<"create" | "edit">("create");
  const [selectedEmpForEdit, setSelectedEmpForEdit] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState("");
  const [empPosition, setEmpPosition] = useState("");
  const [empCustomPosition, setEmpCustomPosition] = useState("");
  const [empEmploymentType, setEmpEmploymentType] = useState<string>("정직원");
  const [empHireDate, setEmpHireDate] = useState("");
  const [empDescription, setEmpDescription] = useState("");
  const [empWorkplace, setEmpWorkplace] = useState<string>("매장");
  const [editingEmpId, setEditingEmpId] = useState<number | null>(null);
  const [tempDescription, setTempDescription] = useState("");
  const [timelineDate, setTimelineDate] = useState<string | null>(null);
  const [calendarEmployee, setCalendarEmployee] = useState<Employee | null>(null);

  // Keep calendarEmployee in sync when schedule updates happen
  useEffect(() => {
    if (calendarEmployee) {
      const updated = employees.find(e => e.id === calendarEmployee.id);
      if (updated) setCalendarEmployee(updated);
    }
  }, [employees]);

  const openCreateEmployeeModal = () => {
    setSelectedEmpForEdit(null);
    setEmpModalMode("create");
    setEmpName("");
    setEmpPosition("");
    setEmpCustomPosition("");
    setEmpEmploymentType("정직원");
    setEmpHireDate("");
    setEmpDescription("");
    setEmpWorkplace("매장");
    setIsEmpModalOpen(true);
  };

  const openEditEmployeeModal = (emp: Employee) => {
    setSelectedEmpForEdit(emp);
    setEmpModalMode("edit");
    setEmpName(emp.name);

    if (emp.position && !PRESET_POSITIONS.includes(emp.position)) {
      setEmpPosition("기타");
      setEmpCustomPosition(emp.position);
    } else {
      setEmpPosition(emp.position || "");
      setEmpCustomPosition("");
    }
    setEmpEmploymentType(emp.employmentType || "정직원");
    setEmpHireDate(emp.hireDate || "");
    setEmpDescription(emp.description || "");
    setEmpWorkplace(emp.workplace || "매장");
    setIsEmpModalOpen(true);
  };

  // Tabs & Search states
  const [activeTab, setActiveTab] = useState<"전체" | "매장" | "창고" | "약사" | "캐셔" | "물류">("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"sheet" | "map">("sheet");
  const [sortBy, setSortBy] = useState<"none" | "position" | "hireDate" | "name">("none");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Settings modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const applyShiftHoursToAll = async (open: string, middle: string, close: string) => {
    const typeMap: Record<string, string> = { "오픈": open, "미들": middle, "마감": close };
    const monthStr = String(currentMonth).padStart(2, "0");
    const items: Array<{ employeeId: number; date: string; type: string; workingHours: string; actualHours: string; memo: string }> = [];
    for (const emp of employees) {
      for (const sc of emp.schedules) {
        if (!sc.date.startsWith(`${currentYear}-${monthStr}`)) continue;
        const wh = typeMap[sc.type];
        if (!wh) continue;
        items.push({ employeeId: emp.id, date: sc.date, type: sc.type, workingHours: wh, actualHours: sc.actualHours || "", memo: sc.memo || "" });
      }
    }
    if (items.length > 0) await axios.post("/api/schedules/batch", { items });
    await fetchScheduleData(currentYear, currentMonth);
    showNotification("기본 근무시간이 현재 월 전체에 적용되었습니다.", "success");
  };

  // Shift hours derived from settings (kept as local aliases for compatibility)
  const openShiftHour = settingsOpenShiftHour;
  const middleShiftHour = settingsMiddleShiftHour;
  const closeShiftHour = settingsCloseShiftHour;

  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Copy Previous Month state
  const [isCopying, setIsCopying] = useState(false);

  const handleCopyFromPreviousMonth = async () => {
    setIsCopying(true);
    try {
      const response = await axios.post("/api/schedules/copy", {
        targetYear: currentYear,
        targetMonth: currentMonth,
      });
      showNotification(`이전 달의 스케줄 ${response.data.count || 0}건이 성공적으로 복사되었습니다!`);
      await fetchScheduleData(currentYear, currentMonth);
    } catch (err: any) {
      console.error("Failed to copy schedules:", err);
      showNotification("이전 달 스케줄을 가져오는 도중 오류가 발생했습니다.", "error");
    } finally {
      setIsCopying(false);
    }
  };

  // Trigger loading schedule
  const fetchScheduleData = async (year: number, month: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/schedules?year=${year}&month=${month}`);
      const fetchedEmployees = response.data.employees || [];

      // Apply the localStorage custom order if it exists
      const savedOrderStr = localStorage.getItem("megatown_employee_order");
      if (savedOrderStr) {
        try {
          const savedOrder = JSON.parse(savedOrderStr) as number[];
          fetchedEmployees.sort((a: any, b: any) => {
            const indexA = savedOrder.indexOf(a.id);
            const indexB = savedOrder.indexOf(b.id);
            if (indexA !== -1 && indexB !== -1) {
              return indexA - indexB;
            }
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.id - b.id; // secondary fallback
          });
        } catch (e) {
          console.error("Error parsing saved order", e);
        }
      }

      setEmployees(fetchedEmployees);
      setSummary(response.data.summary || []);
    } catch (err: any) {
      console.error("Error fetching schedules:", err);
      setError("스케줄 데이터를 불러오는 중에 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchScheduleData(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Ctrl+Z global undo shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && isAdmin) {
        e.preventDefault();
        handleUndo();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undoStack, isAdmin]);

  // Drag and drop handlers for employee rows reordering
  const handleRowDragStart = (e: React.DragEvent, id: number) => {
    if (!isAdmin) {
      e.preventDefault();
      return;
    }
    setDraggedRowId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
  };

  const handleRowDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (draggedRowId !== null && draggedRowId !== id) {
      setDragOverRowId(id);
    }
  };

  const handleRowDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedRowId === null || draggedRowId === targetId) {
      setDraggedRowId(null);
      setDragOverRowId(null);
      return;
    }

    const currentIndex = employees.findIndex((emp) => emp.id === draggedRowId);
    const targetIndex = employees.findIndex((emp) => emp.id === targetId);

    if (currentIndex !== -1 && targetIndex !== -1) {
      const updatedEmployees = [...employees];
      const [draggedItem] = updatedEmployees.splice(currentIndex, 1);
      updatedEmployees.splice(targetIndex, 0, draggedItem);

      setEmployees(updatedEmployees);

      // Save custom order to localStorage
      const orderIds = updatedEmployees.map((emp) => emp.id);
      localStorage.setItem("megatown_employee_order", JSON.stringify(orderIds));

      if (sortBy !== "none") {
        setSortBy("none");
        showNotification("정렬을 사용자 정의 순서로 변경했습니다.");
      } else {
        showNotification("직원 순서가 변경되었습니다.");
      }
    }

    setDraggedRowId(null);
    setDragOverRowId(null);
  };

  // Nav Month handlers
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((prev) => prev - 1);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((prev) => prev + 1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  // Cell Update callback
  const handleCellUpdate = async (data: {
    employeeId: number;
    date: string;
    type: string;
    workingHours: string;
    actualHours: string;
    memo?: string;
  }) => {
    try {
      // Save current state for undo before overwriting
      const emp = employees.find(e => e.id === data.employeeId);
      const prevSched = emp?.schedules.find(s => s.date === data.date);
      if (prevSched) {
        setUndoStack(prev => [
          { employeeId: data.employeeId, date: data.date, type: prevSched.type, workingHours: prevSched.workingHours, actualHours: prevSched.actualHours, memo: prevSched.memo ?? "" },
          ...prev.slice(0, 19),
        ]);
      }

      await axios.put("/api/schedules", data);

      // Update local state live without full refresh, then fetch background calculations
      setEmployees((prevEmployees) => {
        return prevEmployees.map((emp) => {
          if (emp.id !== data.employeeId) return emp;

          const existingSchedules = [...emp.schedules];
          const scheduleIndex = existingSchedules.findIndex((s) => s.date === data.date);

          if (scheduleIndex >= 0) {
            existingSchedules[scheduleIndex] = {
              ...existingSchedules[scheduleIndex],
              type: data.type,
              workingHours: data.workingHours,
              actualHours: data.actualHours,
              memo: data.memo,
            };
          } else {
            existingSchedules.push({
              employeeId: data.employeeId,
              date: data.date,
              type: data.type,
              workingHours: data.workingHours,
              actualHours: data.actualHours,
              memo: data.memo,
            });
          }

          return { ...emp, schedules: existingSchedules };
        });
      });

      // Refetch summaries quietly in background to update total row metrics
      const summaryRes = await axios.get(`/api/schedules?year=${currentYear}&month=${currentMonth}`);
      setSummary(summaryRes.data.summary || []);

      showNotification(`${data.date.split("-").slice(1).join("/")} 스케줄이 성공적으로 변경되었습니다.`);
    } catch (err) {
      console.error("Failed to update cell schedule:", err);
      showNotification("스케줄 정보 저장에 실패했습니다.", "error");
    }
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const [prev, ...rest] = undoStack;
    setUndoStack(rest);
    try {
      await axios.put("/api/schedules", prev);
      setEmployees(prevEmployees => prevEmployees.map(emp => {
        if (emp.id !== prev.employeeId) return emp;
        const schedules = emp.schedules.map(s =>
          s.date === prev.date ? { ...s, ...prev } : s
        );
        return { ...emp, schedules };
      }));
      showNotification("마지막 변경을 되돌렸습니다.", "success");
    } catch {
      showNotification("되돌리기에 실패했습니다.", "error");
    }
  };

  // Add/Edit Employee Handler
  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalPosition = empPosition === "기타" ? empCustomPosition.trim() : empPosition.trim();
    if (!empName.trim() || !finalPosition) {
      showNotification("직원 성명과 구분/직급을 완벽하게 기입해 주십시오.", "error");
      return;
    }

    try {
      if (empModalMode === "edit" && selectedEmpForEdit) {
        await axios.put(`/api/employees/${selectedEmpForEdit.id}`, {
          name: empName,
          position: finalPosition,
          employmentType: empEmploymentType,
          hireDate: empHireDate || new Date().toISOString().split("T")[0],
          description: empDescription,
          workplace: empWorkplace,
        });
        showNotification(`${empName} 직원의 정보가 수정되었습니다.`);
      } else {
        await axios.post("/api/employees", {
          name: empName,
          position: finalPosition,
          employmentType: empEmploymentType,
          hireDate: empHireDate || new Date().toISOString().split("T")[0],
          description: empDescription,
          workplace: empWorkplace,
        });
        showNotification(`새 직원 ${empName}님이 등록되었습니다.`);
      }

      setIsEmpModalOpen(false);
      setEmpName("");
      setEmpPosition("");
      setEmpCustomPosition("");
      setEmpEmploymentType("정직원");
      setEmpHireDate("");
      setEmpDescription("");
      setEmpWorkplace("매장");
      setSelectedEmpForEdit(null);
      setEmpModalMode("create");
      fetchScheduleData(currentYear, currentMonth); // refresh roster
    } catch (err: any) {
      console.error("Failed to solve employee form request:", err);
      showNotification(empModalMode === "edit" ? "직원 정보 수정 도중 오류가 발생했습니다." : "직원 등록 도중 오류가 발생했습니다.", "error");
    }
  };

  // Delete Employee Handler
  const handleDeleteEmployee = async (id: number, name: string) => {
    if (!window.confirm(`${name} 직원을 목록에서 삭제하시겠습니까? 등록된 모든 스케줄이 삭제됩니다.`)) {
      return;
    }

    try {
      await axios.delete(`/api/employees/${id}`);
      showNotification(`${name} 직원이 삭제되었습니다.`);
      fetchScheduleData(currentYear, currentMonth); // refresh roster
    } catch (err) {
      console.error("Failed to delete employee:", err);
      showNotification("직원 삭제 도중 오류가 발생했습니다.", "error");
    }
  };

  // Update employee description
  const handleUpdateDescription = async (id: number) => {
    setEditingEmpId(null);
    const emp = employees.find((e) => e.id === id);
    if (!emp) return;
    if (emp.description === tempDescription) return;

    try {
      await axios.put(`/api/employees/${id}`, {
        name: emp.name,
        position: emp.position,
        hireDate: emp.hireDate,
        description: tempDescription,
        workplace: emp.workplace,
      });

      setEmployees((prev) =>
        prev.map((e) => {
          if (e.id === id) {
            return { ...e, description: tempDescription };
          }
          return e;
        })
      );
      showNotification(`${emp.name}님의 상세 설명이 수정되었습니다.`);
    } catch (err) {
      console.error("Failed to update employee description:", err);
      showNotification("상세 설명 수정에 실패했습니다.", "error");
    }
  };

  // Help calculate weekday name mapping
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const getDayDetails = (dayNum: number) => {
    const monthStr = String(currentMonth).padStart(2, "0");
    const dayStr = String(dayNum).padStart(2, "0");
    const fullDate = `${currentYear}-${monthStr}-${dayStr}`;
    const dayIndex = new Date(currentYear, currentMonth - 1, dayNum).getDay();
    const dayWord = weekdays[dayIndex];

    let colorClass = "text-slate-600 bg-slate-50";
    if (dayIndex === 6) colorClass = "text-blue-600 bg-blue-50 font-bold"; // Saturday Blue
    if (dayIndex === 0) colorClass = "text-rose-600 bg-rose-50 font-bold";  // Sunday Red

    return { dayWord, colorClass, fullDate };
  };

  const getDaysArray = () => {
    const totalDays = new Date(currentYear, currentMonth, 0).getDate();
    return Array.from({ length: totalDays }, (_, i) => i + 1);
  };

  const daysList = getDaysArray();

  const WORKPLACE_TABS = new Set(["매장", "창고"]);
  const POSITION_TABS = new Set(["약사", "캐셔", "물류"]);

  const filteredEmployees = employees
    .filter((emp) => {
      if (activeTab !== "전체") {
        if (WORKPLACE_TABS.has(activeTab)) {
          if ((emp.workplace || "매장") !== activeTab) return false;
        } else if (POSITION_TABS.has(activeTab)) {
          if (emp.position !== activeTab) return false;
        }
      }
      if (searchQuery.trim() !== "") {
        return emp.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "position") {
        const PRESET_MAPPING: Record<string, number> = {
          "대표": 1,
          "임원": 2,
          "약사": 3,
          "캐셔": 4,
          "물류": 5,
        };
        const pA = PRESET_MAPPING[a.position] || 99;
        const pB = PRESET_MAPPING[b.position] || 99;
        if (pA !== pB) {
          return sortOrder === "asc" ? pA - pB : pB - pA;
        }
        return a.name.localeCompare(b.name, "ko");
      }

      if (sortBy === "hireDate") {
        const dateA = a.hireDate ? new Date(a.hireDate).getTime() : 0;
        const dateB = b.hireDate ? new Date(b.hireDate).getTime() : 0;
        if (dateA !== dateB) {
          return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
        }
        return a.name.localeCompare(b.name, "ko");
      }

      if (sortBy === "name") {
        return sortOrder === "asc"
          ? a.name.localeCompare(b.name, "ko")
          : b.name.localeCompare(a.name, "ko");
      }

      return 0; // Default unsorted DB sequence loaded initially
    });

  const getCalculatedSummary = () => {
    const totalDays = new Date(currentYear, currentMonth, 0).getDate();
    const result: MonthlySummary[] = [];
    const monthStr = String(currentMonth).padStart(2, "0");

    for (let day = 1; day <= totalDays; day++) {
      const dayStr = String(day).padStart(2, "0");
      const currentDate = `${currentYear}-${monthStr}-${dayStr}`;

      let openCount = 0;
      let middleCount = 0;
      let closeCount = 0;
      let totalCount = 0;
      let pharmacistCount = 0;
      let staffCount = 0;

      for (const emp of filteredEmployees) {
        const sched = emp.schedules.find((s) => s.date === currentDate);
        if (sched && sched.type) {
          const type = sched.type;

          if (type === "오픈" || type === "오전반차") {
            openCount++;
          } else if (type === "미들") {
            middleCount++;
          } else if (type === "마감" || type === "오후반차") {
            closeCount++;
          }

          // Count active workers (not on leave/off)
          const isOffType = ["휴무", "월차", "지정휴무", "결근"].includes(type);
          if (!isOffType && type.trim() !== "") {
            totalCount++;
            if (emp.position === "약사") pharmacistCount++;
            else staffCount++;
          }
        }
      }

      result.push({
        day,
        date: currentDate,
        openCount,
        middleCount,
        closeCount,
        totalCount,
        pharmacistCount,
        staffCount,
      });
    }

    return result;
  };

  const currentSummaryList = getCalculatedSummary();

  const getAttendanceSummary = () => {
    let totalLates = 0;
    let totalEarlyLeaves = 0;
    let totalAbsences = 0;

    interface EmployeeAttendance {
      employee: typeof employees[0];
      lates: Array<{ date: string; note: string; schedType: string }>;
      earlyLeaves: Array<{ date: string; note: string; schedType: string }>;
      absences: Array<{ date: string; note: string; schedType: string }>;
    }

    const employeeRecords: EmployeeAttendance[] = [];
    const monthStr = String(currentMonth).padStart(2, "0");

    for (const emp of employees) {
      const lates: Array<{ date: string; note: string; schedType: string }> = [];
      const earlyLeaves: Array<{ date: string; note: string; schedType: string }> = [];
      const absences: Array<{ date: string; note: string; schedType: string }> = [];

      emp.schedules.forEach((s) => {
        if (s.date.startsWith(`${currentYear}-${monthStr}-`)) {
          const act = s.actualHours || "";
          const type = s.type || "";

          if (act.includes("지각")) {
            lates.push({ date: s.date, note: act, schedType: type });
            totalLates++;
          }
          if (act.includes("조퇴")) {
            earlyLeaves.push({ date: s.date, note: act, schedType: type });
            totalEarlyLeaves++;
          }
          if (act.includes("결근") || type === "결근") {
            absences.push({ date: s.date, note: act || "결근", schedType: type });
            totalAbsences++;
          }
        }
      });

      if (lates.length > 0 || earlyLeaves.length > 0 || absences.length > 0) {
        employeeRecords.push({
          employee: emp,
          lates,
          earlyLeaves,
          absences
        });
      }
    }

    return {
      totalLates,
      totalEarlyLeaves,
      totalAbsences,
      employeeRecords
    };
  };

  const attSummary = getAttendanceSummary();

  return (
    <div className="w-full min-h-screen bg-[#0d1117] text-slate-200 font-sans flex flex-col">
      {/* Toast Notification Alert */}
      {notification && (
        <div className="fixed top-5 right-5 z-[60] pointer-events-none">
          <div
            className={`px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 border text-sm font-semibold backdrop-blur-md animate-in slide-in-from-top-2 duration-300 ${notification.type === "success"
              ? "bg-[#0d1117]/95 text-emerald-300 border-emerald-500/30 shadow-emerald-500/10"
              : "bg-[#0d1117]/95 text-rose-300 border-rose-500/30 shadow-rose-500/10"
              }`}
            style={{ boxShadow: notification.type === "success" ? "0 8px 32px rgba(16,185,129,0.15), 0 2px 8px rgba(0,0,0,0.3)" : "0 8px 32px rgba(239,68,68,0.15), 0 2px 8px rgba(0,0,0,0.3)" }}
          >
            <CheckCircle size={15} className={notification.type === "success" ? "text-emerald-400 shrink-0" : "text-rose-400 shrink-0"} />
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* 1. App Header — ultra-premium dark */}
      <header className="h-14 flex items-center justify-between px-3 sm:px-5 shrink-0 relative"
        style={{ background: "linear-gradient(180deg, #0f1623 0%, #0d1117 100%)", borderBottom: "1px solid rgba(99,102,241,0.15)", boxShadow: "0 1px 0 rgba(99,102,241,0.08), 0 4px 20px rgba(0,0,0,0.4)" }}
      >
        {/* Subtle top glow line */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.5) 30%, rgba(139,92,246,0.5) 70%, transparent 100%)" }} />

        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm shrink-0"
              style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", boxShadow: "0 0 12px rgba(99,102,241,0.4)" }}
            >
              <Calendar size={13} className="text-white" />
            </div>
            <span className="font-black text-white tracking-tight text-sm sm:text-base leading-none">OSAN MEGATOWN</span>
          </div>



          {/* Tab Switcher for Sheet vs Map View */}
          <div className="hidden sm:flex items-center gap-0.5 ml-1 p-0.5 rounded-lg"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <button
              onClick={() => setViewMode("sheet")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1.5 ${viewMode === "sheet"
                ? "text-white shadow-sm"
                : "text-slate-500 hover:text-slate-300"
                }`}
              style={viewMode === "sheet" ? { background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 2px 8px rgba(99,102,241,0.4)" } : {}}
            >
              <FileSpreadsheet size={11} />
              <span>스케줄 시트</span>
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1.5 ${viewMode === "map"
                ? "text-white shadow-sm"
                : "text-slate-500 hover:text-slate-300"
                }`}
              style={viewMode === "map" ? { background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 2px 8px rgba(99,102,241,0.4)" } : {}}
            >
              <Building2 size={11} />
              <span>맵배치도</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mode Badge */}
          {isAdmin ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold"
              style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#34d399" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>관리자</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#fbbf24" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              <span>읽기 전용</span>
            </div>
          )}

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1 text-[11px] font-semibold rounded-lg cursor-pointer transition-all px-2.5 py-1.5"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#e2e8f0"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#94a3b8"; }}
          >
            <span>⚙️</span>
            <span className="hidden sm:inline">설정</span>
          </button>

          {isAdmin && undoStack.length > 0 && (
            <button
              onClick={handleUndo}
              title={`되돌리기 (${undoStack.length}개 남음)`}
              className="flex items-center gap-1 text-[11px] font-semibold rounded-lg cursor-pointer transition-all px-2.5 py-1.5"
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24" }}
            >
              <span>↩</span>
              <span className="hidden sm:inline">되돌리기</span>
              <span className="text-[9px] px-1 rounded" style={{ background: "rgba(245,158,11,0.25)" }}>{undoStack.length}</span>
            </button>
          )}

          <button
            onClick={() => fetchScheduleData(currentYear, currentMonth)}
            className="flex items-center gap-1 text-[11px] font-semibold rounded-lg cursor-pointer transition-all px-2.5 py-1.5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748b" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#94a3b8"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "#64748b"; }}
          >
            <span className="hidden sm:inline text-xs">새로고침</span>
            <span className="sm:hidden">↺</span>
          </button>

          {isAdmin ? (
            <>
              <button
                onClick={() => setIsEmpModalOpen(true)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-white rounded-lg cursor-pointer transition-all px-2.5 py-1.5 shadow-sm"
                style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", boxShadow: "0 2px 8px rgba(99,102,241,0.35)" }}
              >
                <UserPlus size={12} />
                <span className="hidden sm:inline">직원 등록</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-[11px] font-semibold rounded-lg cursor-pointer transition-all px-2.5 py-1.5"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
              >
                <LogOut size={12} />
                <span className="hidden sm:inline">로그아웃</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setLoginError("");
                setIsLoginModalOpen(true);
              }}
              className="flex items-center gap-1.5 text-[11px] font-bold text-white rounded-lg cursor-pointer transition-all px-2.5 py-1.5 shadow-sm"
              style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", boxShadow: "0 2px 8px rgba(99,102,241,0.35)" }}
            >
              <Lock size={11} />
              <span>관리자 로그인</span>
            </button>
          )}
        </div>
      </header>

      {/* 1.5 Sub-Header Control Bar */}
      {viewMode === "sheet" && (
        <div className="px-3 sm:px-5 py-2 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2 shrink-0"
          style={{ background: "#111827", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          {/* Filter Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-widest shrink-0" style={{ color: "#4b5563" }}>필터</span>
            <div className="inline-flex p-0.5 gap-0.5 rounded-lg flex-wrap"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {([
                { key: "전체", label: "전체", icon: <Layers size={11} />, activeColor: "rgba(99,102,241,0.9)", count: employees.length },
                { key: "매장", label: "매장", icon: <Building2 size={11} />, activeColor: "rgba(16,185,129,0.9)", count: employees.filter(e => (e.workplace || "매장") === "매장").length },
                { key: "창고", label: "창고", icon: <Warehouse size={11} />, activeColor: "rgba(99,102,241,0.9)", count: employees.filter(e => e.workplace === "창고").length },
                { key: "약사", label: "약사", icon: null, activeColor: "rgba(139,92,246,0.9)", count: employees.filter(e => e.position === "약사").length },
                { key: "캐셔", label: "캐셔", icon: null, activeColor: "rgba(245,158,11,0.9)", count: employees.filter(e => e.position === "캐셔").length },
                { key: "물류", label: "물류", icon: null, activeColor: "rgba(14,165,233,0.9)", count: employees.filter(e => e.position === "물류").length },
              ] as const).map(({ key, label, icon, activeColor, count }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as typeof activeTab)}
                  className="px-2 py-1 text-[10px] sm:text-[11px] font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1 min-h-[26px]"
                  style={activeTab === key
                    ? { background: activeColor, color: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }
                    : { color: "#6b7280" }
                  }
                >
                  {icon}
                  <span>{label}</span>
                  <span className="hidden sm:inline" style={{ opacity: 0.7 }}>{count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sort Section */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-[9px] font-bold uppercase tracking-widest shrink-0" style={{ color: "#4b5563" }}>정렬</span>
            <div className="inline-flex p-0.5 gap-0.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {[
                { id: "position" as const, label: "직급별", title: "직급순 정렬" },
                { id: "hireDate" as const, label: "입사일", title: "입사일 순 정렬" },
                { id: "name" as const, label: "성명", title: "이름순 정렬" },
              ].map(({ id, label, title }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (sortBy === id) setSortOrder(prev => prev === "asc" ? "desc" : "asc");
                    else { setSortBy(id); setSortOrder("asc"); }
                  }}
                  className="px-2 py-1 text-[10px] sm:text-[11px] font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1 min-h-[26px]"
                  style={sortBy === id
                    ? { background: "rgba(99,102,241,0.9)", color: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }
                    : { color: "#6b7280" }
                  }
                  title={title}
                >
                  <span>{label}</span>
                  {sortBy === id && <span className="text-[9px] font-mono">{sortOrder === "asc" ? "↑" : "↓"}</span>}
                </button>
              ))}

              {sortBy !== "none" && (
                <button
                  type="button"
                  onClick={() => { setSortBy("none"); setSortOrder("asc"); }}
                  className="px-2 py-1 text-[10px] font-medium rounded-md transition cursor-pointer min-h-[26px]"
                  style={{ color: "#f87171" }}
                >
                  초기화
                </button>
              )}

              {sortBy === "none" && typeof window !== "undefined" && localStorage.getItem("megatown_employee_order") && (
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm("드래그 앤 드롭으로 재배치한 순서를 지우고, 원래 기본 순서로 복구하시겠습니까?")) {
                      localStorage.removeItem("megatown_employee_order");
                      await fetchScheduleData(currentYear, currentMonth);
                      showNotification("정렬 순서가 기본값으로 초기화되었습니다.");
                    }
                  }}
                  className="px-2 py-1 text-[9px] font-bold rounded-md transition cursor-pointer shrink-0 min-h-[26px]"
                  style={{ color: "#f87171" }}
                >
                  순서초기화
                </button>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="flex sm:items-center gap-2 sm:max-w-xs w-full">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none" style={{ color: "#4b5563" }}>
                <Search size={12} />
              </div>
              <input
                type="text"
                placeholder="성명으로 조회..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-[11px] font-medium pl-8 pr-7 py-1.5 rounded-lg focus:outline-none transition-all min-h-[30px]"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}
                onFocus={e => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.5)"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-2.5 flex items-center transition-colors"
                  style={{ color: "#4b5563" }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1.6 Personal Schedule Search Results Quick Insights */}
      {viewMode === "sheet" && searchQuery.trim() !== "" && (
        <div className="px-3 sm:px-5 py-3 sm:py-4 flex flex-col gap-2 sm:gap-3 animate-in fade-in slide-in-from-top-2 duration-250"
          style={{ background: "rgba(99,102,241,0.05)", borderBottom: "1px solid rgba(99,102,241,0.12)" }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "#818cf8" }}>
              <Award size={13} style={{ color: "#818cf8" }} />
              <span>'{searchQuery}' 검색 결과 — {currentMonth}월 스케줄 분석</span>
            </h3>
            <button
              onClick={() => setSearchQuery("")}
              className="text-[11px] font-bold underline cursor-pointer transition-colors"
              style={{ color: "#818cf8" }}
            >
              전체 보기
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {employees
              .filter((emp) => emp.name.toLowerCase().includes(searchQuery.toLowerCase().trim()))
              .map((emp) => {
                const monthStr = String(currentMonth).padStart(2, "0");
                let workDaysCount = 0;
                let offDaysCount = 0;
                let shiftBreakdown: Record<string, number> = {
                  "오픈": 0,
                  "미들": 0,
                  "마감": 0,
                  "오전반차": 0,
                  "오후반차": 0,
                };

                emp.schedules.forEach((s) => {
                  if (s.date.startsWith(`${currentYear}-${monthStr}-`)) {
                    const type = s.type;
                    if (["휴무", "월차", "지정휴무"].includes(type)) {
                      offDaysCount++;
                    } else if (type.trim() !== "") {
                      workDaysCount++;
                      if (type in shiftBreakdown) {
                        shiftBreakdown[type]++;
                      }
                    }
                  }
                });

                return (
                  <div key={`search-result-${emp.id}`} className="rounded-xl p-3 flex flex-col justify-between transition-all"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(99,102,241,0.15)" }}
                  >
                    <div className="flex items-center justify-between pb-2 mb-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white text-sm">{emp.name}</span>
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)", color: "#94a3b8" }}>
                          {emp.position}
                        </span>
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                          style={(emp.workplace || "매장") === "매장"
                            ? { background: "rgba(16,185,129,0.12)", color: "#34d399", border: "1px solid rgba(16,185,129,0.2)" }
                            : { background: "rgba(99,102,241,0.12)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)" }}
                        >
                          {emp.workplace || "매장"}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono" style={{ color: "#4b5563" }}>
                        {emp.hireDate ? emp.hireDate.split("-").slice(1).join("/") : "-"}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-medium" style={{ color: "#6b7280" }}>
                        <span>{currentMonth}월 개요</span>
                        <span className="font-bold">
                          근무 <span style={{ color: "#818cf8" }}>{workDaysCount}일</span> / 휴무 <span style={{ color: "#f87171" }}>{offDaysCount}일</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1 pt-1">
                        {shiftBreakdown["오픈"] > 0 && (
                          <span className="text-[9px] px-2 py-0.5 rounded-md font-bold" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.25)" }}>
                            오픈 {shiftBreakdown["오픈"]}
                          </span>
                        )}
                        {shiftBreakdown["미들"] > 0 && (
                          <span className="text-[9px] px-2 py-0.5 rounded-md font-bold" style={{ background: "rgba(14,165,233,0.15)", color: "#38bdf8", border: "1px solid rgba(14,165,233,0.25)" }}>
                            미들 {shiftBreakdown["미들"]}
                          </span>
                        )}
                        {shiftBreakdown["마감"] > 0 && (
                          <span className="text-[9px] px-2 py-0.5 rounded-md font-bold" style={{ background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid rgba(16,185,129,0.25)" }}>
                            마감 {shiftBreakdown["마감"]}
                          </span>
                        )}
                        {shiftBreakdown["오전반차"] > 0 && (
                          <span className="text-[9px] px-2 py-0.5 rounded-md font-bold" style={{ background: "rgba(245,158,11,0.1)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.2)" }}>
                            오전반차 {shiftBreakdown["오전반차"]}
                          </span>
                        )}
                        {shiftBreakdown["오후반차"] > 0 && (
                          <span className="text-[9px] px-2 py-0.5 rounded-md font-bold" style={{ background: "rgba(16,185,129,0.1)", color: "#34d399", border: "1px solid rgba(16,185,129,0.2)" }}>
                            오후반차 {shiftBreakdown["오후반차"]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            {employees.filter((emp) => emp.name.toLowerCase().includes(searchQuery.toLowerCase().trim())).length === 0 && (
              <div className="col-span-full py-4 text-center text-[11px] font-semibold" style={{ color: "#4b5563" }}>
                '{searchQuery}'에 해당하는 직원이 없습니다.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          settings={{
            positions: PRESET_POSITIONS,
            workplaces: settingsWorkplaces,
            scheduleTypes: settingsScheduleTypes,
            openShiftHour,
            middleShiftHour,
            closeShiftHour,
          }}
          onUpdate={updateSettings}
          onApplyShiftHours={applyShiftHoursToAll}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {/* 2. Grid Container Block */}
      <div className="flex-1 flex flex-col p-2 sm:p-3 gap-0" style={{ background: "#0d1117" }}>
        {/* Month Navigation Toolbar */}
        <div className="h-11 sm:h-12 flex items-center justify-between px-2.5 sm:px-4 shrink-0 rounded-t-xl"
          style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)", borderBottom: "none" }}
        >
          {/* Left: Month navigation */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handlePrevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer"
              style={{ color: "#6b7280" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#e2e8f0"; }}
              onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "#6b7280"; }}
              title="이전 달"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="font-bold tracking-tight text-white text-sm px-2 min-w-[90px] text-center">
              {currentYear}년 {String(currentMonth).padStart(2, "0")}월
            </span>
            <button
              onClick={handleNextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer"
              style={{ color: "#6b7280" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#e2e8f0"; }}
              onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "#6b7280"; }}
              title="다음 달"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Center: Legend */}
          <div className="hidden lg:flex items-center gap-3 text-[10px] font-semibold">
            {[
              { bg: "rgba(234,179,8,0.2)", border: "rgba(234,179,8,0.4)", label: "오픈" },
              { bg: "rgba(16,185,129,0.2)", border: "rgba(16,185,129,0.4)", label: "마감" },
              { bg: "rgba(239,68,68,0.2)", border: "rgba(239,68,68,0.4)", label: "휴무" },
              { bg: "rgba(245,158,11,0.4)", border: "rgba(245,158,11,0.6)", label: "월차" },
              { bg: "rgba(14,165,233,0.2)", border: "rgba(14,165,233,0.4)", label: "지정휴무" },
            ].map(({ bg, border, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded inline-block" style={{ background: bg, border: `1px solid ${border}` }}></span>
                <span style={{ color: "#6b7280" }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Right: Year/Month selectors */}
          <div className="flex gap-1.5">
            <select
              value={currentYear}
              onChange={(e) => setCurrentYear(parseInt(e.target.value))}
              className="font-semibold px-2 py-1 text-xs rounded-lg focus:outline-none cursor-pointer transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}
            >
              {[2024, 2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y} style={{ background: "#1e293b" }}>{y}년</option>
              ))}
            </select>

            <select
              value={currentMonth}
              onChange={(e) => setCurrentMonth(parseInt(e.target.value))}
              className="font-semibold px-2 py-1 text-xs rounded-lg focus:outline-none cursor-pointer transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m} style={{ background: "#1e293b" }}>{m}월</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Multi-View: Sheet vs Store Map */}
        {viewMode === "sheet" ? (
          <div className="overflow-hidden flex flex-col flex-1 rounded-b-xl"
            style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)", borderTop: "none" }}
          >
            {/* Copy Previous Month Callout Banner */}
            {!isLoading && !error && isAdmin && employees.length > 0 && !employees.some(emp => emp.schedules && emp.schedules.some(s => s.type.trim() !== "")) && (
              <div className="m-3 p-3 sm:p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-2 duration-300"
                style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg shrink-0" style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}>
                    <Layers size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">이번 달 ({currentMonth}월) 스케줄 데이터가 비어 있습니다</h4>
                    <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: "#6b7280" }}>
                      이전 달의 스케줄 패턴을 그대로 복사해 오시겠습니까?
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCopyFromPreviousMonth}
                  disabled={isCopying}
                  className="px-4 py-2 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 select-none cursor-pointer shrink-0"
                  style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 2px 8px rgba(99,102,241,0.4)" }}
                >
                  {isCopying ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                      <span>복사 중...</span>
                    </>
                  ) : (
                    <>
                      <Layers size={12} />
                      <span>이전달({currentMonth === 1 ? 12 : currentMonth - 1}월) 복사</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Mobile scroll hint */}
            <div className="sm:hidden px-3 py-2 flex items-center gap-2 text-[10px] font-medium"
              style={{ background: "rgba(99,102,241,0.05)", borderBottom: "1px solid rgba(99,102,241,0.1)", color: "#6366f1" }}
            >
              <span>←</span>
              <span>좌우 스크롤로 날짜를 확인하세요. 날짜 탭 = 타임라인</span>
              <span>→</span>
            </div>

            <div className="relative overflow-x-auto overflow-y-auto max-h-[55vh] sm:max-h-[60vh] md:max-h-[65vh]">
              {isLoading ? (
                <div className="w-full py-32 flex flex-col items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8" style={{ border: "2px solid rgba(99,102,241,0.2)", borderTopColor: "#6366f1" }}></div>
                  <p className="text-[11px] font-bold mt-4 tracking-wider" style={{ color: "#4b5563" }}>스케줄 데이터 불러오는 중...</p>
                </div>
              ) : error ? (
                <div className="w-full py-24 flex flex-col items-center justify-center text-center">
                  <div className="p-3 rounded-full mb-3" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                    <Info size={28} />
                  </div>
                  <p className="font-bold text-xs" style={{ color: "#f87171" }}>{error}</p>
                  <button
                    onClick={() => fetchScheduleData(currentYear, currentMonth)}
                    className="mt-4 px-3 py-1.5 text-xs font-semibold rounded-lg transition"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}
                  >
                    다시 시도
                  </button>
                </div>
              ) : employees.length === 0 ? (
                <div className="w-full py-24 flex flex-col items-center justify-center text-center">
                  <div className="p-3 rounded-full mb-3" style={{ background: "rgba(255,255,255,0.05)", color: "#4b5563" }}>
                    <Users size={28} />
                  </div>
                  <p className="font-bold text-xs" style={{ color: "#6b7280" }}>등록된 직원이 없습니다.</p>
                  <button
                    onClick={() => openCreateEmployeeModal()}
                    className="mt-4 px-3 py-1.5 text-xs font-bold text-white rounded-lg flex items-center gap-1 transition"
                    style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 2px 8px rgba(99,102,241,0.4)" }}
                  >
                    <UserPlus size={13} />
                    <span>첫 직원 등록하기</span>
                  </button>
                </div>
              ) : (() => {
                return (
                  <table className="text-left border-collapse table-fixed w-max sm:w-full sm:min-w-[780px] md:min-w-[900px]">
                    {/* Table Headers */}
                    <thead className="sticky top-0 z-30" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
                      {/* Header Row 1: Day numbers */}
                      <tr className="select-none" style={{ background: "#0f1623" }}>
                        <th
                          ref={nameThRef}
                          className="text-center text-[10px] sm:text-[11px] font-semibold sticky left-0 z-40 py-2 sm:py-2.5 tracking-wide whitespace-nowrap px-1.5 sm:px-3"
                          style={{ width: "80px", minWidth: "80px", background: "#0f1623", borderRight: "1px solid rgba(99,102,241,0.2)", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#6b7280" }}
                        >
                          <span className="hidden sm:inline">직원 성명</span>
                          <span className="sm:hidden">성명</span>
                        </th>

                        {daysList.map((day) => {
                          const { fullDate } = getDayDetails(day);
                          const dayIndex = new Date(currentYear, currentMonth - 1, day).getDay();
                          const isSat = dayIndex === 6;
                          const isSun = dayIndex === 0;
                          return (
                            <th
                              key={`day-num-${day}`}
                              onClick={() => setTimelineDate(fullDate)}
                              className="p-0.5 sm:p-1 text-center text-[9px] sm:text-[10px] font-bold w-[30px] sm:w-[36px] cursor-pointer transition-all"
                              style={{
                                background: isSat ? "rgba(14,165,233,0.08)" : isSun ? "rgba(239,68,68,0.08)" : "#0f1623",
                                color: isSat ? "#38bdf8" : isSun ? "#f87171" : "#9ca3af",
                                borderRight: "1px solid rgba(255,255,255,0.04)",
                                borderBottom: "1px solid rgba(255,255,255,0.06)",
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = "rgba(99,102,241,0.2)"; e.currentTarget.style.color = "#fff"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = isSat ? "rgba(14,165,233,0.08)" : isSun ? "rgba(239,68,68,0.08)" : "#0f1623"; e.currentTarget.style.color = isSat ? "#38bdf8" : isSun ? "#f87171" : "#9ca3af"; }}
                              title={`${fullDate} 타임라인`}
                            >
                              {day}
                            </th>
                          );
                        })}
                      </tr>

                      {/* Header Row 2: Day of week */}
                      <tr className="select-none" style={{ background: "#0d1117" }}>
                        <th className="sticky left-0 z-40 h-5 sm:h-6"
                          style={{ background: "#0d1117", borderRight: "1px solid rgba(99,102,241,0.2)", borderBottom: "1px solid rgba(255,255,255,0.05)", minWidth: "80px" }}
                        ></th>

                        {daysList.map((day) => {
                          const { dayWord } = getDayDetails(day);
                          const dayIndex = new Date(currentYear, currentMonth - 1, day).getDay();
                          const isSat = dayIndex === 6;
                          const isSun = dayIndex === 0;
                          return (
                            <th
                              key={`day-name-${day}`}
                              className="p-0.5 text-center text-[8px] sm:text-[9px] w-[30px] sm:w-[36px]"
                              style={{
                                background: "#0d1117",
                                color: isSat ? "#38bdf8" : isSun ? "#f87171" : "#374151",
                                fontWeight: isSat || isSun ? 700 : 500,
                                borderRight: "1px solid rgba(255,255,255,0.04)",
                                borderBottom: "1px solid rgba(255,255,255,0.05)",
                              }}
                            >
                              {dayWord}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    {/* Table Body */}
                    <tbody>
                      {filteredEmployees.map((emp) => (
                        <tr
                          key={emp.id}
                          draggable={isAdmin}
                          onDragStart={(e) => handleRowDragStart(e, emp.id)}
                          onDragOver={(e) => handleRowDragOver(e, emp.id)}
                          onDrop={(e) => handleRowDrop(e, emp.id)}
                          onDragEnd={() => {
                            setDraggedRowId(null);
                            setDragOverRowId(null);
                          }}
                          className="group transition-colors"
                          style={{
                            background: draggedRowId === emp.id ? "rgba(255,255,255,0.01)" : dragOverRowId === emp.id ? "rgba(99,102,241,0.06)" : "#111827",
                            opacity: draggedRowId === emp.id ? 0.4 : 1,
                            outline: dragOverRowId === emp.id ? "1px solid rgba(99,102,241,0.4)" : "none",
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}
                        >

                          {/* Column 1: Sticky Employee Name */}
                          <td className="p-1 sm:p-1.5 text-center text-xs font-medium sticky left-0 z-[25] h-10 sm:h-11 whitespace-nowrap min-w-[80px] sm:min-w-[96px] sticky-name-shadow"
                            style={{ background: "#111827", borderRight: "1px solid rgba(99,102,241,0.15)" }}
                          >
                            <div className="flex items-center gap-1 sm:gap-1.5 px-0.5">
                              {isAdmin && (
                                <div
                                  className="cursor-grab active:cursor-grabbing p-0.5 rounded transition shrink-0 hidden sm:block"
                                  style={{ color: "#374151" }}
                                  title="드래그하여 행 순서 변경"
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#818cf8"; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#374151"; }}
                                >
                                  <GripVertical size={11} />
                                </div>
                              )}
                              <div className="flex-1 flex items-center justify-between min-w-0">
                                <div className="flex flex-col min-w-0">
                                  <div className="flex items-center gap-0.5">
                                    <span
                                      onClick={() => setCalendarEmployee(emp)}
                                      className="font-bold text-[10px] sm:text-[11px] cursor-pointer select-none transition whitespace-nowrap"
                                      style={{ color: "#818cf8" }}
                                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#a5b4fc"; (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#818cf8"; (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
                                      title="개인 스케줄 달력 보기"
                                    >
                                      {emp.name}
                                    </span>
                                    {emp.description && (
                                      <span
                                        className="transition cursor-default shrink-0 hidden sm:inline"
                                        style={{ color: "#374151" }}
                                        title={emp.description}
                                      >
                                        <MessageSquare size={9} />
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[8px] sm:text-[9px] font-semibold whitespace-nowrap leading-tight truncate max-w-[68px] sm:max-w-none" style={{ color: "#4b5563" }}>
                                    {emp.position}{isAdmin && emp.employmentType ? ` (${emp.employmentType})` : ""}
                                  </span>
                                </div>
                                {isAdmin && (
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition duration-150 ml-0.5 sm:ml-1 shrink-0">
                                    <button
                                      onClick={() => openEditEmployeeModal(emp)}
                                      className="cursor-pointer p-0.5 rounded transition"
                                      style={{ color: "#374151" }}
                                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#818cf8"; }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#374151"; }}
                                      title="직원 정보 수정"
                                    >
                                      <Edit size={9} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                                      className="cursor-pointer p-0.5 rounded transition"
                                      style={{ color: "#374151" }}
                                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#374151"; }}
                                      title="직원 삭제"
                                    >
                                      <Trash2 size={9} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Schedule Cells */}
                          {daysList.map((day) => {
                            const { fullDate } = getDayDetails(day);
                            const currentSched = emp.schedules.find((s) => s.date === fullDate);

                            return (
                              <td key={`${emp.id}-${day}`} className="p-0" style={{ borderRight: "1px solid rgba(255,255,255,0.04)" }}>
                                <ScheduleCell
                                  schedule={currentSched}
                                  dateStr={fullDate}
                                  employeeId={emp.id}
                                  onUpdate={handleCellUpdate}
                                  isAdmin={isAdmin}
                                  openShiftHour={openShiftHour}
                                  middleShiftHour={middleShiftHour}
                                  closeShiftHour={closeShiftHour}
                                  scheduleTypes={settingsScheduleTypes.map((v) => ({ value: v, label: v }))}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}

                      {/* Real-time calculated Bottom Summary Rows */}
                      <SummaryRow summaries={currentSummaryList} label="약사" />
                      <SummaryRow summaries={currentSummaryList} label="사원" />
                      <SummaryRow summaries={currentSummaryList} label="근무인원" />
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Attendance & Status Analysis Dashboard */}
            <div id="attendance-dashboard" className="m-2 sm:m-4 p-3 sm:p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-slate-100 text-slate-600 rounded-xl">
                    <Award size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                      {currentMonth}월 근태 현황 대시보드
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      이달의 지각, 조퇴, 결근 현황을 실시간 집계합니다.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                  실시간
                </span>
              </div>

              {/* Stat Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* 1. Lateness Stats */}
                <div className="bg-amber-50/50 border border-amber-250 rounded-xl p-3 flex items-center justify-between shadow-3xs">
                  <div>
                    <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider block">⚠️ 지각 (Lateness) 건수</span>
                    <span className="text-2xl font-black text-amber-900 mt-1 block">{attSummary.totalLates}회</span>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-sm shadow-3xs">
                    ⚠️
                  </div>
                </div>

                {/* 2. Early Leaves Stats */}
                <div className="bg-purple-50/50 border border-purple-200 rounded-xl p-3 flex items-center justify-between shadow-3xs">
                  <div>
                    <span className="text-[10px] font-black text-purple-800 uppercase tracking-wider block">🏃 조퇴 (Early Leave) 건수</span>
                    <span className="text-2xl font-black text-purple-900 mt-1 block">{attSummary.totalEarlyLeaves}회</span>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-purple-100 border border-purple-200 flex items-center justify-center text-sm shadow-3xs">
                    🏃
                  </div>
                </div>

                {/* 3. Absence Stats */}
                <div className="bg-rose-50/50 border border-rose-250 rounded-xl p-3 flex items-center justify-between shadow-3xs">
                  <div>
                    <span className="text-[10px] font-black text-rose-800 uppercase tracking-wider block">🚨 결근 (Absence) 건수</span>
                    <span className="text-2xl font-black text-rose-900 mt-1 block">{attSummary.totalAbsences}회</span>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center text-sm shadow-3xs">
                    🚨
                  </div>
                </div>
              </div>

              {/* Detailed Breakdown Lists */}
              {attSummary.employeeRecords.length === 0 ? (
                <div className="border border-slate-200 rounded-xl py-6 text-center text-[#64748b] bg-slate-50/40 text-[11px] font-semibold">
                  🎉 이달 해당 사원의 지각 · 조퇴 · 결근 등 근태 이상 수치가 매우 깨끗합니다. 성실 근무 중!
                </div>
              ) : (
                <div className="border border-[#cbd5e1] rounded-xl overflow-x-auto bg-white">
                  <table className="w-full text-xs text-left text-slate-700 min-w-[700px]">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5 border-b border-[#cbd5e1] w-[140px]">사원명 (직책)</th>
                        <th className="px-4 py-2.5 border-b border-[#cbd5e1] border-l border-[#e2e8f0]">지각 기록 ⚠️ ({attSummary.totalLates}건)</th>
                        <th className="px-4 py-2.5 border-b border-[#cbd5e1] border-l border-[#e2e8f0]">조퇴 기록 🏃 ({attSummary.totalEarlyLeaves}건)</th>
                        <th className="px-4 py-2.5 border-b border-[#cbd5e1] border-l border-[#e2e8f0]">결근 기록 🚨 ({attSummary.totalAbsences}건)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {attSummary.employeeRecords.map((rec) => (
                        <tr key={`att-row-${rec.employee.id}`} className="hover:bg-slate-50/50 transition bg-white">
                          <td className="px-4 py-3 font-extrabold text-slate-800 whitespace-nowrap bg-slate-50/10">
                            <div className="flex flex-col">
                              <span className="text-xs font-black">{rec.employee.name}</span>
                              <span className="text-[10px] text-slate-400 font-bold mt-0.5">{rec.employee.position} | {rec.employee.workplace || "매장"}</span>
                            </div>
                          </td>

                          {/* Lates Column */}
                          <td className="px-4 py-3 border-l border-[#e2e8f0]">
                            {rec.lates.length === 0 ? (
                              <span className="text-slate-300 text-[10px] font-semibold">-</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {rec.lates.map((l, idx) => (
                                  <span key={idx} className="inline-flex flex-col p-1 px-1.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[9px] font-black shadow-3xs" title={l.note}>
                                    <span>📅 {parseInt(l.date.split("-")[2])}일 ({l.schedType})</span>
                                    <span className="text-[8px] text-amber-600 font-extrabold">{l.note}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Early Leaves Column */}
                          <td className="px-4 py-3 border-l border-[#e2e8f0]">
                            {rec.earlyLeaves.length === 0 ? (
                              <span className="text-slate-300 text-[10px] font-semibold">-</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {rec.earlyLeaves.map((e, idx) => (
                                  <span key={idx} className="inline-flex flex-col p-1 px-1.5 rounded bg-purple-50 border border-purple-200 text-purple-800 text-[9px] font-black shadow-3xs" title={e.note}>
                                    <span>📅 {parseInt(e.date.split("-")[2])}일 ({e.schedType})</span>
                                    <span className="text-[8px] text-purple-600 font-extrabold">{e.note}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Absences Column */}
                          <td className="px-4 py-3 border-l border-[#e2e8f0]">
                            {rec.absences.length === 0 ? (
                              <span className="text-slate-300 text-[10px] font-semibold">-</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {rec.absences.map((a, idx) => (
                                  <span key={idx} className="inline-flex flex-col p-1 px-1.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-[9px] font-black shadow-3xs" title={a.note}>
                                    <span>📅 {parseInt(a.date.split("-")[2])}일 ({a.schedType})</span>
                                    <span className="text-[8px] text-rose-600 font-extrabold">{a.note}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) :
          <StoreMap
            employees={employees}
            currentYear={currentYear}
            currentMonth={currentMonth}
            getDaysArray={getDaysArray}
            getDayDetails={getDayDetails}
            isAdmin={isAdmin}
            openShiftHour={openShiftHour}
            middleShiftHour={middleShiftHour}
            closeShiftHour={closeShiftHour}
          />
        }
      </div>

      {/* Footer */}
      <footer className="h-9 bg-slate-900 border-t border-slate-800 shrink-0 px-4 sm:px-6 flex items-center justify-between text-[10px] text-slate-500 font-medium">
        <div className="flex items-center gap-2">
          <span className="text-slate-600">Connected to</span>
          <span className="font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5">
            sqlite://mega_town.db
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-4">
          <span>Latency: 12ms</span>
          <span>Sync: Just now</span>
        </div>
      </footer>

      {/* Roster Add Modal Popup Backdrop */}
      {isEmpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full sm:max-w-md bg-white sm:rounded-lg rounded-t-2xl shadow-2xl p-4 sm:p-6 border border-[#e2e8f0] transform scale-100 transition animate-in zoom-in-95 duration-100 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsEmpModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 border-b pb-3 mb-4">
              <Users className="text-[#2563eb]" size={20} />
              <h3 className="text-sm font-bold text-slate-900">{empModalMode === "edit" ? "직원 정보 수정" : "새로운 직원 등록"}</h3>
            </div>

            <form onSubmit={handleAddEmployeeSubmit} className="space-y-4">
              {/* Highlighted, prominent Description (상세 설명) at the very beginning */}
              <div className="bg-slate-50 p-3 rounded-lg border border-[#cbd5e1] space-y-1">
                <label className="block text-xs font-extrabold text-[#1e293b] flex items-center gap-1">
                  <span>💡 상세 설명 (근무 패턴 / 클래스)</span> <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 주6일 일 휴무, 금일, 주5일 (수목휴무) 등"
                  value={empDescription}
                  onChange={(e) => setEmpDescription(e.target.value)}
                  className="w-full text-sm font-bold rounded-md border border-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 p-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all duration-150"
                />

                {/* Visual Quick Recommendation Patterns to extremely simplify user interaction */}
                <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-[#e2e8f0]">
                  <span className="text-[10px] text-slate-500 font-bold self-center mr-1">추천 패턴:</span>
                  {["주6일 일 휴무", "수목 휴무", "토일", "금일", "일월", "3주 목<->토", "월화", "화수", "평일마감 주말오픈"].map((pat) => (
                    <button
                      key={pat}
                      type="button"
                      onClick={() => setEmpDescription(pat)}
                      className="px-1.5 py-0.5 text-[9px] bg-white hover:bg-slate-100 border border-[#cbd5e1] hover:border-slate-400 rounded text-slate-700 font-semibold cursor-pointer transition duration-100"
                    >
                      {pat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <span>직원 성명</span> <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 홍길동"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  className="w-full text-xs rounded border border-[#e2e8f0] focus:border-[#2563eb] p-2 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <Briefcase size={13} /> 구분 / 직급 <span className="text-rose-500">*</span>
                </label>

                <div className="flex gap-2">
                  <select
                    value={PRESET_POSITIONS.includes(empPosition) ? empPosition : (empPosition ? "기타" : "")}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "기타") {
                        setEmpPosition("기타");
                        if (!empCustomPosition) {
                          setEmpCustomPosition("");
                        }
                      } else {
                        setEmpPosition(val);
                        setEmpCustomPosition("");
                      }
                    }}
                    className="flex-1 text-xs rounded border border-[#e2e8f0] focus:border-[#2563eb] p-2 bg-white font-medium text-slate-800 focus:outline-none cursor-pointer text-ellipsis overflow-hidden"
                  >
                    <option value="">-- 프리셋 선택 --</option>
                    {PRESET_POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                    <option value="기타">기타 (직접 수정/입력)</option>
                  </select>

                  <input
                    type="text"
                    required
                    placeholder="직급명 직접 입력 또는 수정"
                    value={empPosition === "기타" ? empCustomPosition : empPosition}
                    onChange={(e) => {
                      const text = e.target.value;
                      if (PRESET_POSITIONS.includes(text)) {
                        setEmpPosition(text);
                        setEmpCustomPosition("");
                      } else {
                        setEmpPosition("기타");
                        setEmpCustomPosition(text);
                      }
                    }}
                    className="flex-1 text-xs rounded border border-[#e2e8f0] focus:border-[#2563eb] p-2 bg-white font-semibold text-slate-800 placeholder:text-slate-400"
                  />
                </div>

                {/* Visual Quick-Select Buttons to make employee position editing/creation extremely rapid */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {PRESET_POSITIONS.map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => {
                        setEmpPosition(pos);
                        setEmpCustomPosition("");
                      }}
                      className={`px-2 py-0.5 text-[10px] rounded transition duration-150 font-bold cursor-pointer border ${empPosition === pos
                        ? "bg-blue-50 text-[#2563eb] border-blue-200"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                        }`}
                    >
                      {pos}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setEmpPosition("기타");
                    }}
                    className={`px-2 py-0.5 text-[10px] rounded transition duration-150 font-bold cursor-pointer border ${empPosition === "기타"
                      ? "bg-blue-50 text-[#2563eb] border-blue-200"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                      }`}
                  >
                    직접 입력✒️
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <Calendar size={13} /> 입사일
                </label>
                <input
                  type="date"
                  value={empHireDate}
                  onChange={(e) => setEmpHireDate(e.target.value)}
                  className="w-full text-xs rounded border border-[#e2e8f0] focus:border-[#2563eb] p-2 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                  근무 형태 <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-3 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg flex-wrap">
                  {PRESET_EMPLOYMENT_TYPES.map((et) => (
                    <label key={et} className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-slate-700">
                      <input
                        type="radio"
                        name="empEmploymentType"
                        value={et}
                        checked={empEmploymentType === et}
                        onChange={() => setEmpEmploymentType(et)}
                        className="cursor-pointer"
                      />
                      <span>{et === "정직원" ? "🟢 정직원" : et === "계약직" ? "🔵 계약직" : "🟡 알바"}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                  근무부서 / 근무지 <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-4 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg">
                  <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-slate-700">
                    <input
                      type="radio"
                      name="empWorkplace"
                      value="매장"
                      checked={empWorkplace === "매장"}
                      onChange={() => setEmpWorkplace("매장")}
                      className="cursor-pointer"
                    />
                    <span>🏬 매장 (기본)</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-slate-700">
                    <input
                      type="radio"
                      name="empWorkplace"
                      value="창고"
                      checked={empWorkplace === "창고"}
                      onChange={() => setEmpWorkplace("창고")}
                      className="cursor-pointer"
                    />
                    <span>📦 창고 (물류)</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t mt-6">
                <button
                  type="button"
                  onClick={() => setIsEmpModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold bg-slate-50 hover:bg-slate-100 rounded border border-[#e2e8f0] text-slate-650 text-slate-600 transition cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-[#2563eb] hover:bg-blue-700 text-white rounded transition cursor-pointer"
                >
                  {empModalMode === "edit" ? "수정 완료" : "등록 완료"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Admin Login Dialog Modal */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-150 p-6 flex flex-col justify-between overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#0f172a] text-white rounded-lg">
                  <Lock size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">관리자 로그인</h3>
                  <p className="text-[10px] text-slate-400 font-medium">관리자 계정정보를 기입해 주십시오.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsLoginModalOpen(false);
                  setLoginError("");
                }}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-50 rounded-lg transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Box */}
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {loginError && (
                <div className="p-3 bg-rose-50 text-rose-800 border border-rose-100 rounded-xl text-xs flex items-center gap-2 animate-pulse">
                  <ShieldAlert size={14} className="shrink-0 text-rose-500" />
                  <span className="font-semibold">{loginError}</span>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  관리자 아이디 (osanmega)
                </label>
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="아이디를 입력하세요"
                  className="w-full text-xs rounded-xl border border-[#e2e8f0] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 p-3 bg-white focus:outline-none font-semibold text-slate-800 transition"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  비밀번호
                </label>
                <input
                  type="password"
                  value={loginPw}
                  onChange={(e) => setLoginPw(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className="w-full text-xs rounded-xl border border-[#e2e8f0] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 p-3 bg-white focus:outline-none font-semibold text-slate-800 transition"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsLoginModalOpen(false);
                    setLoginError("");
                  }}
                  className="flex-1 p-3 text-xs font-bold bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-slate-600 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 p-3 text-xs font-bold bg-[#0f172a] hover:bg-slate-800 text-white border border-[#0f172a] rounded-xl transition shadow-sm inline-flex items-center justify-center gap-1.5"
                >
                  <LogIn size={13} />
                  <span>로그인</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {timelineDate && (
        <DayTimelineModal
          date={timelineDate}
          employees={employees}
          openShiftHour={openShiftHour}
          middleShiftHour={middleShiftHour}
          closeShiftHour={closeShiftHour}
          onClose={() => setTimelineDate(null)}
          onEditEmployee={isAdmin ? openEditEmployeeModal : undefined}
          onScheduleUpdate={() => fetchScheduleData(currentYear, currentMonth)}
        />
      )}

      {calendarEmployee && (
        <EmployeeCalendarModal
          employee={calendarEmployee}
          initialYear={currentYear}
          initialMonth={currentMonth}
          onClose={() => setCalendarEmployee(null)}
          isAdmin={isAdmin}
          onUpdate={handleCellUpdate}
          onBulkSave={async (items) => {
            await axios.post("/api/schedules/batch", {
              items: items.map(item => ({ employeeId: calendarEmployee.id, ...item })),
            });
            showNotification(`${calendarEmployee.name}님의 ${items.length}일 일괄 스케줄이 반영되었습니다.`);
            await fetchScheduleData(currentYear, currentMonth);
          }}
          scheduleTypes={settingsScheduleTypes.map(v => ({ value: v, label: v }))}
          openShiftHour={openShiftHour}
          middleShiftHour={middleShiftHour}
          closeShiftHour={closeShiftHour}
        />
      )}
    </div>
  );
};
export default SchedulePage;
