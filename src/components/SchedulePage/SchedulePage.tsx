// src/components/SchedulePage.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { ZONE_DEFS, ZONES_STORAGE_KEY } from "../../constants/displayZones";
import { Employee, MonthlySummary, Schedule, AuthSession } from "../../types";
import { ScheduleCell } from "../ScheduleCell";
import { SummaryRow } from "../SummaryRow";
import { DayTimelineModal } from "../DayTimelineModal";
import { EmployeeCalendarModal, type LogisticsZoneProps } from "../EmployeeCalendarModal";
import { SettingsModal } from "../SettingsModal";
import { EmployeeFormModal } from "../EmployeeFormModal";
import { ScheduleFilterBar } from "../ScheduleFilterBar";
import { BreakModal } from "../BreakModal";
import { useSettings } from "../../hooks/useSettings";
import {
  Calendar,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Info,
  Users,
  X,
  Trash2,
  CheckCircle,
  Layers,
  Award,
  Clock,
  MessageSquare,
  Lock,
  LogIn,
  LogOut,
  ShieldAlert,
  Edit,
  GripVertical,
  Settings,
  LayoutGrid,
  FileText,
  Package,
} from "lucide-react";

interface SchedulePageProps {
  onBack?: () => void;
  onLogout?: () => void;
  onNavigateToDisplay?: () => void;
  onNavigateToRequests?: () => void;
  onNavigateToLeave?: () => void;
  onNavigateToScan?: () => void;
  onNavigateToOcr?: () => void;
  initialEditEmployeeId?: number | null;
  onEditEmployeeHandled?: () => void;
  authSession?: AuthSession | null;
}

export const SchedulePage: React.FC<SchedulePageProps> = ({ onBack, onLogout, onNavigateToDisplay, onNavigateToRequests, onNavigateToLeave, onNavigateToScan, onNavigateToOcr, initialEditEmployeeId, onEditEmployeeHandled, authSession }) => {
  // ── Auth-derived flags ─────────────────────────────────────────────────────
  const isSuperAdmin = authSession?.role === "superadmin" || authSession?.role === "admin";
  // 관리자: read-only + can open break modal for any employee, no labor cost
  const isManagerRole = authSession?.role === "manager";
  // 직원모드: read-only + can open break modal on own row only
  const isEmployeeMode = authSession?.role === "employee";
  const sessionEmployeeId = authSession?.employeeId ?? null;
  // Settings hook (positions, workplaces, scheduleTypes, shift hours)
  const {
    positions: PRESET_POSITIONS,
    employmentTypes: PRESET_EMPLOYMENT_TYPES,
    workplaces: settingsWorkplaces,
    scheduleTypes: settingsScheduleTypes,
    openShiftHour: settingsOpenShiftHour,
    middleShiftHour: settingsMiddleShiftHour,
    closeShiftHour: settingsCloseShiftHour,
    wageRates: settingsWageRates,
    employeeWageOverrides: settingsEmployeeWageOverrides,
    update: updateSettings,
  } = useSettings();
  // Navigation states
  const [currentYear, setCurrentYear] = useState<number>(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(() => new Date().getMonth() + 1);

  // Today's date string in YYYY-MM-DD format (locale-safe, local timezone)
  const todayStr = (() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();


  // Server state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<MonthlySummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Undo history: stores previous schedule states for the last 20 cell changes
  const [undoStack, setUndoStack] = useState<Array<{
    employeeId: number; date: string; type: string; workingHours: string; actualHours: string; memo: string;
  }>>([]);

  // Drag and Drop row states (HTML5 desktop)
  const [draggedRowId, setDraggedRowId] = useState<number | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<number | null>(null);

  // Touch-based row reorder states (mobile)
  const [touchDragId, setTouchDragId] = useState<number | null>(null);
  const [touchOverId, setTouchOverId] = useState<number | null>(null);

  // Name column: auto-fit to content, measured via ref
  const nameThRef = useRef<HTMLTableCellElement>(null);
  const [nameColWidth, setNameColWidth] = useState<number>(80);
  useEffect(() => {
    if (nameThRef.current) {
      setNameColWidth(nameThRef.current.getBoundingClientRect().width);
    }
  }, [employees.length]);

  // Mobile date scroll ref
  const scrollTableRef = useRef<HTMLDivElement>(null);
  const todayColRef = useRef<HTMLTableCellElement>(null);
  const scrollDays = (days: number) => {
    if (scrollTableRef.current) {
      scrollTableRef.current.scrollLeft += days * 30;
    }
  };

  // Mobile 7-day window state
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Scroll today's column to center on data load (desktop only)
  useEffect(() => {
    if (employees.length === 0 || isMobile) return;
    requestAnimationFrame(() => {
      if (!scrollTableRef.current || !todayColRef.current) return;
      const container = scrollTableRef.current;
      const col = todayColRef.current;
      const containerRect = container.getBoundingClientRect();
      const colRect = col.getBoundingClientRect();
      const colCenter = colRect.left - containerRect.left + container.scrollLeft + col.offsetWidth / 2;
      container.scrollLeft = Math.max(0, colCenter - container.clientWidth / 2);
    });
  }, [employees, isMobile]);


  // Administrative / Auth states
  // isAdmin = full superadmin access (schedule editing, employee management, labor costs)
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    if (authSession?.role === "employee" || authSession?.role === "manager") return false;
    if (authSession?.role === "superadmin" || authSession?.role === "admin") return true;
    return localStorage.getItem("megatown_admin") === "true";
  });

  // Keep isAdmin in sync if authSession changes during the page lifetime
  useEffect(() => {
    if (authSession?.role === "employee" || authSession?.role === "manager") {
      setIsAdmin(false);
    } else if (authSession?.role === "superadmin" || authSession?.role === "admin") {
      setIsAdmin(true);
    }
  }, [authSession?.role]);
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
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem("megatown_admin");
      localStorage.removeItem("megatown_auth_session");
      onBack?.();
    }
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
  const [empGender, setEmpGender] = useState<"남" | "여" | "">("");
  const [empRank, setEmpRank] = useState("");
  const [empAnnualLeave, setEmpAnnualLeave] = useState<number>(0);
  const [empLevel, setEmpLevel] = useState<number>(1);
  const [empZoneNums, setEmpZoneNums] = useState<number[]>([]);
  const [yearLeaveStats, setYearLeaveStats] = useState<Record<number, number>>({});
  const [editingEmpId, setEditingEmpId] = useState<number | null>(null);
  const [tempDescription, setTempDescription] = useState("");
  const [timelineDate, setTimelineDate] = useState<string | null>(null);
  const [calendarEmployee, setCalendarEmployee] = useState<Employee | null>(null);

  // ── Employee break/lunch modal state (employee mode only) ───────────────────
  // When an employee clicks one of their own row cells, this modal opens so
  // they can record 점심/휴게 windows. Data is merged into the existing memo
  // field as JSON ({ lunch: "HH:MM-HH:MM", break: "HH:MM-HH:MM" }) to avoid
  // any Supabase schema changes.
  const [breakModal, setBreakModal] = useState<{
    employeeId: number;
    date: string;
    scheduleId?: number;
    type: string;
    workingHours: string;
    actualHours: string;
    memo: string;
    lunchStart: string;
    lunchEnd: string;
    breakStart: string;
    breakEnd: string;
  } | null>(null);
  const [isSavingBreak, setIsSavingBreak] = useState(false);

  // Parse possible JSON break info from a memo string. Tolerates plain text:
  // returns the original raw memo as `other` so we never lose user notes.
  const parseBreakMemo = (memoStr: string): { lunch?: string; break?: string; other?: string } => {
    if (!memoStr) return {};
    const trimmed = memoStr.trim();
    if (!trimmed.startsWith("{")) return { other: memoStr };
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return {
          lunch: typeof parsed.lunch === "string" ? parsed.lunch : undefined,
          break: typeof parsed.break === "string" ? parsed.break : undefined,
          other: typeof parsed.other === "string" ? parsed.other : undefined,
        };
      }
    } catch { /* fall through */ }
    return { other: memoStr };
  };

  const splitTimeRange = (range?: string): [string, string] => {
    if (!range) return ["", ""];
    const m = range.match(/^(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})$/);
    if (!m) return ["", ""];
    return [m[1], m[2]];
  };

  // ── Admin: per-employee password set (inline in edit modal) ─────────────────
  const [showPasswordSet, setShowPasswordSet] = useState(false);
  const [newEmpPassword, setNewEmpPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Keep calendarEmployee in sync when schedule updates happen
  useEffect(() => {
    if (calendarEmployee) {
      const updated = employees.find(e => e.id === calendarEmployee.id);
      if (updated) setCalendarEmployee(updated);
    }
  }, [employees]);

  // ── Open edit modal when navigated from DisplayPage ─────────────────────────
  useEffect(() => {
    if (!initialEditEmployeeId || employees.length === 0) return;
    const emp = employees.find(e => e.id === initialEditEmployeeId);
    if (emp) {
      openEditEmployeeModal(emp);
      onEditEmployeeHandled?.();
    }
  }, [initialEditEmployeeId, employees]);

  // ── Display zone assignment (shared with DisplayPage via localStorage) ───────
  type DisplayZoneSlim = { id: string; num: number; assignedStaffId: number | null; assignedStaffName: string; status: string; label: string; category: string; section: string; products: string };

  const [displayZoneVer, setDisplayZoneVer] = useState(0);

  const loadDisplayZones = (): DisplayZoneSlim[] => {
    try {
      const raw = localStorage.getItem(ZONES_STORAGE_KEY);
      if (!raw) return ZONE_DEFS.map(d => ({ id: String(d.num), num: d.num, label: d.label, category: d.category, section: d.section, assignedStaffId: null, assignedStaffName: "", status: "normal", products: "" }));
      return JSON.parse(raw) as DisplayZoneSlim[];
    } catch { return []; }
  };

  const saveDisplayZones = (zones: DisplayZoneSlim[]) => {
    localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(zones));
    setDisplayZoneVer(v => v + 1);
  };

  const calendarLogisticsZoneProps: LogisticsZoneProps | undefined =
    calendarEmployee?.position === "물류"
      ? (() => {
          const zones = loadDisplayZones();
          const assignedZoneNums = zones.filter(z => z.assignedStaffId === calendarEmployee.id).map(z => z.num);
          return {
            assignedZoneNums,
            onToggle: (zoneNum: number) => {
              const current = loadDisplayZones();
              saveDisplayZones(current.map(z => {
                if (z.num !== zoneNum) return z;
                return z.assignedStaffId === calendarEmployee.id
                  ? { ...z, assignedStaffId: null, assignedStaffName: "" }
                  : { ...z, assignedStaffId: calendarEmployee.id, assignedStaffName: calendarEmployee.name };
              }));
            },
            onClearAll: () => {
              saveDisplayZones(loadDisplayZones().map(z =>
                z.assignedStaffId === calendarEmployee.id ? { ...z, assignedStaffId: null, assignedStaffName: "" } : z
              ));
            },
          };
        })()
      : undefined;

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
    setEmpGender("");
    setEmpRank("");
    setEmpLevel(1);
    setEmpZoneNums([]);
    setIsEmpModalOpen(true);
  };

  const openEditEmployeeModal = (emp: Employee) => {
    setSelectedEmpForEdit(emp);
    setEmpModalMode("edit");
    setEmpName(emp.name);

    const knownPositions = ["약사", "캐셔", "물류"];
    if (emp.position && !knownPositions.includes(emp.position)) {
      setEmpPosition("기타");
      setEmpCustomPosition(emp.position);
    } else {
      setEmpPosition(emp.position || "");
      setEmpCustomPosition("");
    }
    setEmpRank(emp.rank || "");
    setEmpAnnualLeave(emp.annual_leave_days ?? 0);
    setEmpLevel(emp.level ?? 1);
    setEmpEmploymentType(emp.employmentType || "정직원");
    setEmpHireDate(emp.hireDate || "");
    setEmpDescription(emp.description || "");
    setEmpWorkplace(emp.workplace || "매장");
    setEmpGender((emp.gender as "남" | "여") || "");
    if (emp.position === "물류") {
      const zones = loadDisplayZones();
      setEmpZoneNums(zones.filter(z => z.assignedStaffId === emp.id).map(z => z.num));
    } else {
      setEmpZoneNums([]);
    }
    // Reset inline password set form
    setShowPasswordSet(false);
    setNewEmpPassword("");
    setIsSavingPassword(false);
    setIsEmpModalOpen(true);
  };

  // Open the break/lunch modal for an employee-mode cell click. Initializes
  // form values from the existing schedule's memo (so re-opening the same cell
  // pre-fills the previously chosen ranges).
  const openBreakModalForCell = useCallback((employeeId: number, date: string) => {
    const emp = employees.find(e => e.id === employeeId);
    const sched = emp?.schedules.find(s => s.date === date);
    const parsed = parseBreakMemo(sched?.memo || "");
    const [ls, le] = splitTimeRange(parsed.lunch);
    const [bs, be] = splitTimeRange(parsed.break);
    setBreakModal({
      employeeId,
      date,
      scheduleId: sched?.id,
      type: sched?.type || "",
      workingHours: sched?.workingHours || "",
      actualHours: sched?.actualHours || "",
      memo: sched?.memo || "",
      lunchStart: ls,
      lunchEnd: le,
      breakStart: bs,
      breakEnd: be,
    });
  }, [employees]);

  // Persist a break/lunch entry by merging into the schedule's memo JSON and
  // upserting the row through the existing PUT /api/schedules endpoint.
  const handleSaveBreak = async () => {
    if (!breakModal) return;
    setIsSavingBreak(true);
    try {
      const existing = parseBreakMemo(breakModal.memo || "");
      const next: { lunch?: string; break?: string; other?: string } = { ...existing };
      const lunch = breakModal.lunchStart && breakModal.lunchEnd
        ? `${breakModal.lunchStart}-${breakModal.lunchEnd}`
        : "";
      const brk = breakModal.breakStart && breakModal.breakEnd
        ? `${breakModal.breakStart}-${breakModal.breakEnd}`
        : "";
      if (lunch) next.lunch = lunch; else delete next.lunch;
      if (brk) next.break = brk; else delete next.break;

      // Empty payload → store plain string (preserve other text or empty memo)
      let memoOut = "";
      if (next.lunch || next.break) {
        memoOut = JSON.stringify(next);
      } else if (next.other) {
        memoOut = next.other;
      }

      await axios.put("/api/schedules", {
        employeeId: breakModal.employeeId,
        date: breakModal.date,
        type: breakModal.type || "휴무",
        workingHours: breakModal.workingHours || "",
        actualHours: breakModal.actualHours || "",
        memo: memoOut,
      });

      setEmployees(prev => prev.map(emp => {
        if (emp.id !== breakModal.employeeId) return emp;
        const idx = emp.schedules.findIndex(s => s.date === breakModal.date);
        const updatedSched: Schedule = {
          ...(idx >= 0 ? emp.schedules[idx] : {
            employeeId: breakModal.employeeId,
            date: breakModal.date,
            type: breakModal.type || "휴무",
            workingHours: breakModal.workingHours || "",
            actualHours: breakModal.actualHours || "",
          }),
          memo: memoOut,
        };
        const schedules = idx >= 0
          ? emp.schedules.map((s, i) => (i === idx ? updatedSched : s))
          : [...emp.schedules, updatedSched];
        return { ...emp, schedules };
      }));

      showNotification("점심/휴게 시간이 저장되었습니다.", "success");
      setBreakModal(null);
    } catch (err) {
      console.error("Failed to save break/lunch:", err);
      showNotification("점심/휴게 시간 저장에 실패했습니다.", "error");
    } finally {
      setIsSavingBreak(false);
    }
  };

  // Admin tool: set/reset an employee's login password
  const handleSetEmployeePassword = async () => {
    if (!selectedEmpForEdit) return;
    if (!newEmpPassword || newEmpPassword.length < 4) {
      showNotification("비밀번호는 최소 4자 이상이어야 합니다.", "error");
      return;
    }
    setIsSavingPassword(true);
    try {
      await axios.post("/api/auth/set-password", {
        employeeId: selectedEmpForEdit.id,
        password: newEmpPassword,
      });
      showNotification(`${selectedEmpForEdit.name}님의 비밀번호가 설정되었습니다.`, "success");
      setNewEmpPassword("");
      setShowPasswordSet(false);
    } catch (err) {
      console.error("Failed to set password:", err);
      showNotification("비밀번호 설정에 실패했습니다.", "error");
    } finally {
      setIsSavingPassword(false);
    }
  };

  // Tabs & Search states
  const [workplaceTab, setWorkplaceTab] = useState<"전체" | "매장" | "창고">("전체");
  const [positionTab, setPositionTab] = useState<"전체" | "약사" | "캐셔" | "물류" | "알바" | "기타">("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"none" | "position" | "rank" | "hireDate" | "name">("none");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [todayFirst, setTodayFirst] = useState(true);

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
    await fetchScheduleData();
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
      await fetchScheduleData();
    } catch (err: any) {
      console.error("Failed to copy schedules:", err);
      showNotification("이전 달 스케줄을 가져오는 도중 오류가 발생했습니다.", "error");
    } finally {
      setIsCopying(false);
    }
  };

  const handlePrevMonth = () => {
    let year = currentYear;
    let month = currentMonth - 1;
    if (month < 1) { month = 12; year--; }
    setCurrentYear(year);
    setCurrentMonth(month);
  };

  const handleNextMonth = () => {
    let year = currentYear;
    let month = currentMonth + 1;
    if (month > 12) { month = 1; year++; }
    setCurrentYear(year);
    setCurrentMonth(month);
  };

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  const getDayDetails = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const dayIndex = d.getDay();
    const dayWord = weekdays[dayIndex];
    const isToday = dateStr === todayStr;

    let colorClass = "text-slate-600 bg-slate-50";
    if (isToday) colorClass = "text-white bg-rose-500 font-bold";
    else if (dayIndex === 6) colorClass = "text-blue-600 bg-blue-50 font-bold";
    else if (dayIndex === 0) colorClass = "text-rose-600 bg-rose-50 font-bold";

    return { dayWord, colorClass, fullDate: dateStr, isToday };
  };

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const monthStr = String(currentMonth).padStart(2, '0');
  const dateList: string[] = Array.from({ length: daysInMonth }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    return `${currentYear}-${monthStr}-${day}`;
  });

  // Mobile: 7-day window centered on today (±3 days) + week offset
  const mobileDates = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayStr + "T00:00:00");
      d.setDate(d.getDate() + i - 3 + mobileWeekOffset * 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
  }, [todayStr, mobileWeekOffset]);

  const displayDates = isMobile ? mobileDates : dateList;

  // Trigger loading schedule — supports a multi-month date range by fetching each month
  // in parallel and merging employee schedule arrays.
  const fetchScheduleData = async (dates?: string[]) => {
    const targetDates = dates ?? dateList;
    setIsLoading(true);
    setError(null);
    try {
      // Unique YYYY-MM month keys present in the target date range
      const monthKeys = Array.from(new Set(targetDates.map(d => d.substring(0, 7))));
      const months = monthKeys.map(k => ({
        year: parseInt(k.substring(0, 4)),
        month: parseInt(k.substring(5, 7)),
      }));

      const responses = await Promise.all(
        months.map(({ year, month }) =>
          axios.get(`/api/schedules?year=${year}&month=${month}`)
        )
      );

      // Merge employee data across months (combine schedule arrays by employee id)
      const empMap = new Map<number, Employee>();
      for (const res of responses) {
        const empList: Employee[] = res.data.employees || [];
        for (const emp of empList) {
          if (empMap.has(emp.id)) {
            const existing = empMap.get(emp.id)!;
            const existingDates = new Set(existing.schedules.map(s => s.date));
            const newSchedules = emp.schedules.filter(s => !existingDates.has(s.date));
            existing.schedules = [...existing.schedules, ...newSchedules];
          } else {
            empMap.set(emp.id, { ...emp, schedules: [...emp.schedules] });
          }
        }
      }

      let merged = Array.from(empMap.values());

      // Apply the localStorage custom order if it exists
      const savedOrderStr = localStorage.getItem("megatown_employee_order");
      if (savedOrderStr) {
        try {
          const savedOrder = JSON.parse(savedOrderStr) as number[];
          merged.sort((a, b) => {
            const iA = savedOrder.indexOf(a.id);
            const iB = savedOrder.indexOf(b.id);
            if (iA !== -1 && iB !== -1) return iA - iB;
            if (iA !== -1) return -1;
            if (iB !== -1) return 1;
            return a.id - b.id; // secondary fallback
          });
        } catch (e) {
          console.error("Error parsing saved order", e);
        }
      }

      setEmployees(merged);

      // Prefer today's month summary when present in the loaded range; else first month's
      const todayMeta = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
      const primaryIdx = months.findIndex(m => m.year === todayMeta.year && m.month === todayMeta.month);
      if (primaryIdx !== -1) {
        setSummary(responses[primaryIdx].data.summary || []);
      } else if (responses.length > 0) {
        setSummary(responses[0].data.summary || []);
      }
      // Refresh year-to-date 월차 stats in background
      axios.get(`/api/leave-stats?year=${currentYear}`)
        .then(res => setYearLeaveStats(res.data ?? {}))
        .catch(() => {});
    } catch (err: any) {
      console.error("Error fetching schedules:", err);
      setError("스케줄 데이터를 불러오는 중에 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // Re-fetch whenever year or month changes
  useEffect(() => {
    fetchScheduleData(dateList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, currentMonth]);

  // Load year-to-date 월차 usage counts per employee
  useEffect(() => {
    axios.get(`/api/leave-stats?year=${currentYear}`)
      .then(res => setYearLeaveStats(res.data ?? {}))
      .catch(() => {});
  }, [currentYear]);

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
      // (today's month is the most useful for the sidebar dashboard)
      const primaryYear = new Date().getFullYear();
      const primaryMonth = new Date().getMonth() + 1;
      const summaryRes = await axios.get(`/api/schedules?year=${primaryYear}&month=${primaryMonth}`);
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
    const finalPosition = (!["약사", "캐셔", "물류"].includes(empPosition) && empCustomPosition.trim())
      ? empCustomPosition.trim()
      : empPosition.trim();
    if (!empName.trim() || !finalPosition) {
      showNotification("직원 성명과 구분을 입력해 주십시오.", "error");
      return;
    }

    const applyZones = (empId: number, name: string) => {
      if (finalPosition !== "물류") return;
      const current = loadDisplayZones();
      const cleared = current.map(z =>
        z.assignedStaffId === empId ? { ...z, assignedStaffId: null, assignedStaffName: "" } : z
      );
      const updated = cleared.map(z =>
        empZoneNums.includes(z.num) ? { ...z, assignedStaffId: empId, assignedStaffName: name } : z
      );
      saveDisplayZones(updated);
    };

    try {
      if (empModalMode === "edit" && selectedEmpForEdit) {
        await axios.put(`/api/employees/${selectedEmpForEdit.id}`, {
          name: empName,
          position: finalPosition,
          rank: empRank.trim() || null,
          employmentType: empEmploymentType,
          hireDate: empHireDate || new Date().toISOString().split("T")[0],
          description: empDescription,
          workplace: empWorkplace,
          gender: empGender || null,
          annual_leave_days: empAnnualLeave > 0 ? empAnnualLeave : null,
          level: empLevel,
        });
        applyZones(selectedEmpForEdit.id, empName);
        showNotification(`${empName} 직원의 정보가 수정되었습니다.`);
      } else {
        const res = await axios.post("/api/employees", {
          name: empName,
          position: finalPosition,
          rank: empRank.trim() || null,
          employmentType: empEmploymentType,
          hireDate: empHireDate || new Date().toISOString().split("T")[0],
          description: empDescription,
          workplace: empWorkplace,
          gender: empGender || null,
          annual_leave_days: empAnnualLeave > 0 ? empAnnualLeave : null,
          level: empLevel,
        });
        if (res.data?.id) applyZones(res.data.id, empName);
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
      setEmpGender("");
      setEmpRank("");
      setEmpAnnualLeave(0);
      setEmpLevel(1);
      setEmpZoneNums([]);
      setSelectedEmpForEdit(null);
      setEmpModalMode("create");
      fetchScheduleData(); // refresh roster
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
      fetchScheduleData(); // refresh roster
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
        rank: emp.rank ?? null,
        employmentType: emp.employmentType,
        hireDate: emp.hireDate,
        description: tempDescription,
        workplace: emp.workplace,
        gender: emp.gender ?? null,
        annual_leave_days: emp.annual_leave_days ?? null,
        level: emp.level ?? 1,
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

  // Parse "HH:MM-HH:MM" working hours string to decimal hours
  const parseWorkingHours = (wh: string): number => {
    if (!wh) return 0;
    const m = wh.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
    if (!m) return 0;
    const start = parseInt(m[1]) * 60 + parseInt(m[2]);
    const end = parseInt(m[3]) * 60 + parseInt(m[4]);
    return Math.max(0, (end - start) / 60);
  };

  const OFF_TYPES_SET = new Set(["휴무", "월차", "지정휴무", "결근"]);

  const getEmpMonthStats = (emp: Employee) => {
    const dateSet = new Set(dateList);
    const visibleSchedules = emp.schedules.filter(s => dateSet.has(s.date));
    const workDays = visibleSchedules.filter(s => s.type && !OFF_TYPES_SET.has(s.type)).length;
    let totalHours = 0;
    let laborCost = 0;

    // Resolve wage rate: individual override takes precedence over position rate.
    const wageRates = settingsWageRates ?? {};
    const empOverrides = settingsEmployeeWageOverrides ?? {};
    const empRate = empOverrides[emp.id] ?? wageRates[emp.position] ?? null;

    const shiftHourFallback: Record<string, string> = {
      "오픈": openShiftHour, "미들": middleShiftHour, "마감": closeShiftHour,
      "오전반차": openShiftHour, "오후반차": closeShiftHour,
    };

    for (const s of visibleSchedules) {
      if (!s.type || OFF_TYPES_SET.has(s.type)) continue;
      const wh = s.workingHours || shiftHourFallback[s.type] || "";
      const hours = parseWorkingHours(wh);
      totalHours += hours;
      if (empRate && hours > 0) {
        const d = new Date(s.date);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        laborCost += hours * (isWeekend ? empRate.weekend : empRate.weekday);
      }
    }

    return { workDays, totalHours, laborCost };
  };

  const KNOWN_POSITIONS = new Set(["약사", "캐셔", "물류"]);

  const filteredEmployees = employees
    .filter((emp) => {
      if (workplaceTab !== "전체") {
        if ((emp.workplace || "매장") !== workplaceTab) return false;
      }
      if (positionTab !== "전체") {
        if (positionTab === "알바") {
          if (emp.rank !== "알바" && emp.position !== "알바") return false;
        } else if (positionTab === "기타") {
          if (KNOWN_POSITIONS.has(emp.position) || emp.rank === "알바" || emp.position === "알바") return false;
        } else {
          if (emp.position !== positionTab) return false;
        }
      }
      if (searchQuery.trim() !== "") {
        return emp.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      }
      return true;
    })
    .sort((a, b) => {
      const POSITION_ORDER: Record<string, number> = { "대표": 1, "임원": 2, "약사": 3, "캐셔": 4, "물류": 5 };
      const RANK_ORDER: Record<string, number> = { "대표": 1, "이사": 2, "부장": 3, "차장": 4, "과장": 5, "팀장": 6, "사원": 7, "알바": 8 };

      if (sortBy === "position") {
        const pA = POSITION_ORDER[a.position] ?? 99;
        const pB = POSITION_ORDER[b.position] ?? 99;
        if (pA !== pB) return sortOrder === "asc" ? pA - pB : pB - pA;
        return a.name.localeCompare(b.name, "ko");
      }

      if (sortBy === "rank") {
        const rA = RANK_ORDER[a.rank ?? ""] ?? 99;
        const rB = RANK_ORDER[b.rank ?? ""] ?? 99;
        if (rA !== rB) return sortOrder === "asc" ? rA - rB : rB - rA;
        return a.name.localeCompare(b.name, "ko");
      }

      if (sortBy === "hireDate") {
        const dateA = a.hireDate ? new Date(a.hireDate).getTime() : 0;
        const dateB = b.hireDate ? new Date(b.hireDate).getTime() : 0;
        if (dateA !== dateB) return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
        return a.name.localeCompare(b.name, "ko");
      }

      if (sortBy === "name") {
        return sortOrder === "asc"
          ? a.name.localeCompare(b.name, "ko")
          : b.name.localeCompare(a.name, "ko");
      }

      // sortBy === "none": todayFirst as secondary sort only
      if (todayFirst) {
        const aToday = a.schedules.some(s => s.date === todayStr && s.type && !OFF_TYPES_SET.has(s.type));
        const bToday = b.schedules.some(s => s.date === todayStr && s.type && !OFF_TYPES_SET.has(s.type));
        if (aToday !== bToday) return aToday ? -1 : 1;
      }

      return 0;
    });

  const getCalculatedSummary = (sourceEmployees = filteredEmployees, dates = displayDates) => {
    const result: MonthlySummary[] = [];

    dates.forEach((currentDate) => {
      const day = parseInt(currentDate.split('-')[2]);

      let openCount = 0;
      let middleCount = 0;
      let closeCount = 0;
      let totalCount = 0;
      let pharmacistCount = 0;
      let staffCount = 0;

      for (const emp of sourceEmployees) {
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
    });

    return result;
  };

  const currentSummaryList = getCalculatedSummary(filteredEmployees);
  const totalSummaryList = getCalculatedSummary(employees);

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
    const visibleDateSet = new Set(dateList);

    for (const emp of employees) {
      const lates: Array<{ date: string; note: string; schedType: string }> = [];
      const earlyLeaves: Array<{ date: string; note: string; schedType: string }> = [];
      const absences: Array<{ date: string; note: string; schedType: string }> = [];

      emp.schedules.forEach((s) => {
        if (visibleDateSet.has(s.date)) {
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
    <div className="w-full min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
      {/* Toast Notification Alert */}
      {notification && (
        <div className="fixed top-5 right-5 z-[60] pointer-events-none">
          <div
            className={`px-4 py-3 rounded-xl shadow-md flex items-center gap-2.5 border text-sm font-semibold backdrop-blur-sm animate-in slide-in-from-top-2 duration-300 ${notification.type === "success"
              ? "bg-white text-emerald-800 border-emerald-200 shadow-emerald-100"
              : "bg-white text-rose-800 border-rose-200 shadow-rose-100"
              }`}
          >
            <CheckCircle size={15} className={notification.type === "success" ? "text-emerald-500 shrink-0" : "text-rose-500 shrink-0"} />
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* 1. App Header */}
      <header className="bg-white border-b border-gray-200 shrink-0 shadow-sm">

        {/* ── Row 1: Brand + Role badge + Logout ── */}
        <div className="h-14 flex items-center justify-between px-4 sm:px-6">

          {/* Left: back button + logo + desktop nav */}
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-500 hover:text-gray-900 transition cursor-pointer text-xs font-semibold shrink-0"
                title="메인으로 돌아가기"
              >
                <ChevronLeft size={13} />
                <span className="hidden sm:inline">메인</span>
              </button>
            )}
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm shrink-0">
              <Calendar size={14} className="text-white" />
            </div>
            <span className="font-black tracking-tight leading-none shrink-0">
              <span className="text-red-500 text-xl">OSAN</span>
              <span className="text-gray-900 text-base"> MEGATOWN</span>
            </span>

            {/* Desktop nav tabs */}
            <div className="hidden sm:flex items-center gap-1 ml-3 bg-gray-100 rounded-xl p-1">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black bg-white text-indigo-700 shadow-sm border border-indigo-100">
                <Calendar size={11} /> 스케줄관리
              </span>
              {(isAdmin || isManagerRole) && onNavigateToDisplay && (
                <button
                  onClick={onNavigateToDisplay}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 hover:text-gray-800 hover:bg-white transition cursor-pointer"
                >
                  <LayoutGrid size={11} /> 매장관리
                </button>
              )}
              {(isAdmin || isManagerRole) && onNavigateToRequests && (
                <button
                  onClick={onNavigateToRequests}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 hover:text-gray-800 hover:bg-white transition cursor-pointer"
                >
                  <MessageSquare size={11} /> 요청목록
                </button>
              )}
              {(isAdmin || isManagerRole) && onNavigateToLeave && (
                <button
                  onClick={onNavigateToLeave}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 hover:text-gray-800 hover:bg-white transition cursor-pointer"
                >
                  <CheckCircle size={11} /> 연차승인
                </button>
              )}
              {(isAdmin || isManagerRole) && onNavigateToScan && (
                <button
                  onClick={onNavigateToScan}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 hover:text-gray-800 hover:bg-white transition cursor-pointer"
                >
                  <Package size={11} /> 상품관리
                </button>
              )}
              {(isAdmin || isManagerRole) && onNavigateToOcr && (
                <button
                  onClick={onNavigateToOcr}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 hover:text-gray-800 hover:bg-white transition cursor-pointer"
                >
                  <FileText size={11} /> 거래명세서
                </button>
              )}
            </div>
          </div>

          {/* Right: role badge + actions */}
          <div className="flex items-center gap-1.5">
            {/* Role badge — desktop only */}
            {isAdmin ? (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>최고관리자</span>
              </div>
            ) : isManagerRole ? (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                <span>관리자</span>
                {authSession?.employeeName && (
                  <span className="text-sky-600 font-semibold border-l border-sky-300 pl-1.5 ml-0.5 truncate max-w-[60px]">{authSession.employeeName}</span>
                )}
              </div>
            ) : isEmployeeMode ? (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="truncate max-w-[80px]">{authSession?.employeeName ?? "직원 모드"}</span>
              </div>
            ) : null}

            {/* Settings gear — superadmin only, icon only */}
            {isAdmin && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                title="환경 설정"
                className="p-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 rounded-lg transition cursor-pointer"
              >
                <Settings size={14} />
              </button>
            )}

            {/* Undo — desktop only */}
            {isAdmin && undoStack.length > 0 && (
              <button
                onClick={handleUndo}
                title={`되돌리기 (${undoStack.length}개 남음)`}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-lg text-amber-700 transition cursor-pointer"
              >
                ↩ <span className="text-[10px] bg-amber-200 px-1 rounded">{undoStack.length}</span>
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={() => fetchScheduleData()}
              className="p-2 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg text-gray-600 transition cursor-pointer"
              title="새로고침"
            >
              <span className="text-sm leading-none">↺</span>
            </button>

            {/* 직원 등록 — desktop + superadmin */}
            {isAdmin && (
              <button
                onClick={() => openCreateEmployeeModal()}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-600 rounded-lg transition cursor-pointer shadow-sm"
              >
                <UserPlus size={13} />
                <span>직원 등록</span>
              </button>
            )}

            {/* Logout / Login */}
            {isAdmin || isManagerRole || isEmployeeMode ? (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 text-xs font-semibold bg-white hover:bg-rose-50 text-rose-600 border border-gray-200 hover:border-rose-300 rounded-lg transition cursor-pointer"
              >
                <LogOut size={13} />
                <span className="hidden sm:inline">로그아웃</span>
              </button>
            ) : (
              <button
                onClick={() => { setLoginError(""); setIsLoginModalOpen(true); }}
                title="관리자 로그인"
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer shadow-sm"
              >
                <Lock size={12} />
                <span className="hidden sm:inline">관리자 로그인</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Row 2: Mobile only — nav tabs + action buttons ── */}
        <div className="sm:hidden flex items-center gap-1.5 px-4 pb-2">
          {/* Nav tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 flex-1">
            <span className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-black bg-white text-indigo-700 shadow-sm border border-indigo-100">
              <Calendar size={11} /> 스케줄
            </span>
            {(isAdmin || isManagerRole) && onNavigateToDisplay && (
              <button
                onClick={onNavigateToDisplay}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 hover:text-gray-800 hover:bg-white transition cursor-pointer"
              >
                <LayoutGrid size={11} /> 매장관리
              </button>
            )}
          </div>

          {/* Mobile action buttons */}
          <div className="flex items-center gap-1">
            {isAdmin && undoStack.length > 0 && (
              <button
                onClick={handleUndo}
                className="flex items-center gap-0.5 px-2 py-1.5 text-[11px] font-semibold border border-amber-300 bg-amber-50 rounded-lg text-amber-700 cursor-pointer"
              >
                ↩<span className="text-[10px] bg-amber-200 px-1 rounded">{undoStack.length}</span>
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => openCreateEmployeeModal()}
                className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer"
                title="직원 등록"
              >
                <UserPlus size={13} />
              </button>
            )}
          </div>
        </div>

      </header>

      {/* 1.5 Sub-Header Control Bar for Workplace Tabs, Employee Sorting & Search */}
      <ScheduleFilterBar
        employees={employees}
        workplaceTab={workplaceTab}
        setWorkplaceTab={setWorkplaceTab}
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
        onResetCustomOrder={async () => {
          localStorage.removeItem("megatown_employee_order");
          await fetchScheduleData();
          showNotification("정렬 순서가 기본값으로 초기화되었습니다.");
        }}
      />

      {/* 1.6 Personal Schedule Search Results Quick Insights */}
      {searchQuery.trim() !== "" && (
        <div className="bg-blue-50/50 border-b border-[#e2e8f0] px-3 sm:px-6 py-3 sm:py-4 flex flex-col gap-2 sm:gap-3 animate-in fade-in slide-in-from-top-2 duration-250 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.01)]">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold text-[#1e40af] uppercase tracking-wider flex items-center gap-1.5">
              <Award size={14} className="text-blue-600 font-bold" />
              <span>'{searchQuery}' 성명 검색 결과 및 {currentMonth}월 스케줄 분석 요약</span>
            </h3>
            <button
              onClick={() => setSearchQuery("")}
              className="text-xs text-blue-600 hover:text-[#1e40af] font-bold underline cursor-pointer"
            >
              전체 보기로 돌아가기
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
                    if (["휴무", "월차", "지정휴무", "결근"].includes(type)) {
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
                  <div key={`search-result-${emp.id}`} className="bg-white border border-blue-100 rounded-xl p-3 shadow-sm flex flex-col justify-between hover:border-blue-300 transition">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-800 text-sm">{emp.name}</span>
                        <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {emp.position}
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${(emp.workplace || "매장") === "매장"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-100"
                          : "bg-indigo-50 text-indigo-800 border border-indigo-100"
                          }`}>
                          {emp.workplace || "매장"}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        입사일: {emp.hireDate ? emp.hireDate.split("-").slice(1).join("/") : "-"}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                        <span>📅 {currentMonth}월 스케줄 개요:</span>
                        <span className="text-slate-900 font-bold">
                          근무 <span className="text-blue-600">{workDaysCount}일</span> / 휴무 <span className="text-rose-600">{offDaysCount}일</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {shiftBreakdown["오픈"] > 0 && (
                          <span className="text-[10px] bg-amber-55 bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-lg font-extrabold">
                            오픈: {shiftBreakdown["오픈"]}회
                          </span>
                        )}
                        {shiftBreakdown["미들"] > 0 && (
                          <span className="text-[10px] bg-sky-50 text-sky-850 text-sky-850 text-sky-800 border border-sky-100 px-2 py-0.5 rounded-lg font-extrabold">
                            미들: {shiftBreakdown["미들"]}회
                          </span>
                        )}
                        {shiftBreakdown["마감"] > 0 && (
                          <span className="text-[10px] bg-emerald-55 bg-emerald-50 text-emerald-800 border border-emerald-100 px-2 py-0.5 rounded-lg font-extrabold">
                            마감: {shiftBreakdown["마감"]}회
                          </span>
                        )}
                        {shiftBreakdown["오전반차"] > 0 && (
                          <span className="text-[10px] bg-amber-50 text-amber-850 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-lg font-extrabold">
                            오전반차: {shiftBreakdown["오전반차"]}회
                          </span>
                        )}
                        {shiftBreakdown["오후반차"] > 0 && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-850 text-emerald-800 border border-emerald-100 px-2 py-0.5 rounded-lg font-extrabold">
                            오후반차: {shiftBreakdown["오후반차"]}회
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            {employees.filter((emp) => emp.name.toLowerCase().includes(searchQuery.toLowerCase().trim())).length === 0 && (
              <div className="col-span-full py-4 text-center text-xs font-semibold text-slate-500">
                입력하신 이름 '{searchQuery}'에 부합하는 사원이 없습니다. 철자를 확인해 주세요.
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
            employmentTypes: PRESET_EMPLOYMENT_TYPES,
            workplaces: settingsWorkplaces,
            scheduleTypes: settingsScheduleTypes,
            openShiftHour,
            middleShiftHour,
            closeShiftHour,
            wageRates: settingsWageRates,
            employeeWageOverrides: settingsEmployeeWageOverrides,
          }}
          employees={employees.map(e => ({ id: e.id, name: e.name, position: e.position }))}
          onUpdate={updateSettings}
          onApplyShiftHours={applyShiftHoursToAll}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {/* 2. Grid Container Block */}
      <div className="flex-1 flex flex-col p-2 sm:p-3 md:p-4 bg-gray-100 gap-0">
        {/* Month Navigation Toolbar */}
        <div className="bg-white border border-slate-200 border-b-0 rounded-t-xl h-11 sm:h-12 flex items-center justify-between px-2.5 sm:px-5 shrink-0 shadow-sm">
          {/* Left: Month navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
              title="이전 달"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-bold tracking-tight text-slate-900 text-sm px-1 min-w-[90px] text-center">
              {currentYear}년 {String(currentMonth).padStart(2, "0")}월
            </span>
            <button
              onClick={handleNextMonth}
              className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
              title="다음 달"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Center: Quick Legend indicators */}
          <div className="hidden lg:flex items-center gap-3 text-[10px] font-semibold">
            {[
              { color: "bg-yellow-100 border-yellow-300", label: "오픈" },
              { color: "bg-emerald-100 border-emerald-300", label: "마감" },
              { color: "bg-rose-100 border-rose-300", label: "휴무" },
              { color: "bg-amber-300 border-amber-400", label: "월차" },
              { color: "bg-sky-100 border-sky-300", label: "지정휴무" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded border ${color} inline-block`}></span>
                <span className="text-slate-500">{label}</span>
              </div>
            ))}
          </div>

          {/* Right: Year/Month selectors + 전월 복사 */}
          <div className="flex items-center gap-1.5">
            <select
              value={currentYear}
              onChange={(e) => setCurrentYear(parseInt(e.target.value))}
              className="hidden sm:block bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-2 py-1 text-xs rounded-lg focus:outline-none focus:border-indigo-400 cursor-pointer transition-colors"
            >
              {[2024, 2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>

            <select
              value={currentMonth}
              onChange={(e) => setCurrentMonth(parseInt(e.target.value))}
              className="bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-2 py-1 text-xs rounded-lg focus:outline-none focus:border-indigo-400 cursor-pointer transition-colors"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>

            {isAdmin && (
              <button
                onClick={handleCopyFromPreviousMonth}
                disabled={isCopying}
                title={`${currentMonth === 1 ? 12 : currentMonth - 1}월 스케줄을 ${currentMonth}월로 복사`}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-600 hover:text-violet-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isCopying
                  ? <><div className="w-3 h-3 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" /><span>복사 중</span></>
                  : <><Layers size={12} /><span>전월복사</span></>
                }
              </button>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-b-xl overflow-hidden flex flex-col flex-1 shadow-sm">
            {/* Copy Previous Month Callout Banner */}
            {!isLoading && !error && isAdmin && employees.length > 0 && !employees.some(emp => emp.schedules && emp.schedules.some(s => s.type.trim() !== "")) && (
              <div className="m-2 sm:m-4 p-3 sm:p-4 bg-indigo-50/50 border border-indigo-200/70 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg shrink-0">
                    <Layers size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">이번 달 ({currentMonth}월) 스케줄 데이터가 비어 있습니다</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      이전 달의 스케줄 패턴을 그대로 복사해 오시겠습니까?
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCopyFromPreviousMonth}
                  disabled={isCopying}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 transition disabled:opacity-50 select-none cursor-pointer shrink-0"
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

            {/* Mobile 7-day week navigation */}
            <div className="sm:hidden flex items-center gap-2 px-3 py-1.5 bg-indigo-50/60 border-b border-indigo-100 shrink-0">
              <button
                onClick={() => setMobileWeekOffset(o => o - 1)}
                className="w-8 h-7 flex items-center justify-center bg-white border border-indigo-200 hover:bg-indigo-100 active:bg-indigo-200 rounded-lg text-indigo-600 transition cursor-pointer shrink-0 shadow-sm"
                aria-label="이전 주"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setMobileWeekOffset(0)}
                className="flex-1 text-center text-[11px] text-indigo-600 font-bold py-1 hover:bg-indigo-100 rounded-lg transition cursor-pointer"
              >
                {mobileWeekOffset === 0 ? "오늘 기준 7일" : `${mobileDates[0].slice(5).replace("-", "/")} – ${mobileDates[6].slice(5).replace("-", "/")}`}
              </button>
              <button
                onClick={() => setMobileWeekOffset(o => o + 1)}
                className="w-8 h-7 flex items-center justify-center bg-white border border-indigo-200 hover:bg-indigo-100 active:bg-indigo-200 rounded-lg text-indigo-600 transition cursor-pointer shrink-0 shadow-sm"
                aria-label="7일 이후"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Admin quick-edit hint bar */}
            {isAdmin && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50/70 border-b border-indigo-100 shrink-0">
                <span className="text-indigo-500 text-[10px]">💡</span>
                <span className="text-[10px] text-indigo-700 font-semibold">
                  셀 <strong>클릭</strong>: 오픈 → 미들 → 마감 → 휴무 순환 변경
                </span>
                <span className="text-indigo-300 text-[10px] mx-0.5">|</span>
                <span className="text-[10px] text-indigo-500">
                  <strong>⚙️</strong> 호버 후 톱니바퀴: 시간·메모 상세 편집
                </span>
              </div>
            )}

            {/* Schedule table + Dashboard: side-by-side on desktop, stacked on mobile */}
            <div className="flex flex-col lg:flex-row flex-1 min-h-0">

            <div ref={scrollTableRef} className="relative overflow-x-auto overflow-y-auto flex-1 min-w-0" style={{ maxHeight: "calc(100vh - 220px)" }}>
              {isLoading ? (
                <div className="w-full py-32 flex flex-col items-center justify-center bg-slate-50/50">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2563eb]"></div>
                  <p className="text-[#64748b] text-[11px] font-bold mt-4 tracking-wider">메가타운 스케줄 데이터 분석 중...</p>
                </div>
              ) : error ? (
                <div className="w-full py-24 flex flex-col items-center justify-center text-center">
                  <div className="p-3 bg-rose-50 rounded-full text-rose-500 mb-2">
                    <Info size={30} />
                  </div>
                  <p className="text-rose-700 font-bold text-xs">{error}</p>
                  <button
                    onClick={() => fetchScheduleData()}
                    className="mt-4 px-3 py-1 text-xs bg-slate-50 border border-slate-200 hover:bg-slate-100 font-semibold rounded"
                  >
                    다시 시도
                  </button>
                </div>
              ) : employees.length === 0 ? (
                <div className="w-full py-24 flex flex-col items-center justify-center text-center">
                  <div className="p-3 bg-slate-100 rounded-full text-slate-400 mb-2">
                    <Users size={30} />
                  </div>
                  <p className="text-[#64748b] font-bold text-xs">등록된 직원이 없습니다.</p>
                  {isAdmin && (
                    <button
                      onClick={() => openCreateEmployeeModal()}
                      className="mt-4 px-3 py-1.5 text-xs bg-[#2563eb] font-semibold text-white rounded flex items-center gap-1"
                    >
                      <UserPlus size={14} />
                      <span>첫 직원 등록하기</span>
                    </button>
                  )}
                </div>
              ) : (() => {
                return (
                  <table className="text-left border-collapse table-fixed min-w-max w-full">
                    {/* Table Headers */}
                    <thead className="sticky top-0 z-30 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                      {/* Header Row 1: Day of Month Numbers */}
                      <tr className="bg-gray-100 text-gray-700 select-none">
                        <th
                          ref={nameThRef}
                          className="text-center text-[10px] sm:text-[11px] font-bold border-r border-gray-200 border-b border-b-gray-200 sticky left-0 bg-gray-100 z-40 py-2 sm:py-2.5 tracking-wide whitespace-nowrap px-1.5 sm:px-3"
                          style={{ width: "80px", minWidth: "80px" }}
                        >
                          <span className="hidden sm:inline">직원 성명</span>
                          <span className="sm:hidden">성명</span>
                        </th>

                        {displayDates.map((dateStr) => {
                          const { fullDate, isToday } = getDayDetails(dateStr);
                          const dayNum = parseInt(dateStr.split('-')[2]);
                          const dayIndex = new Date(dateStr + 'T00:00:00').getDay();
                          const headerClass = dayIndex === 6
                            ? "text-sky-600 bg-sky-50"
                            : dayIndex === 0
                              ? "text-rose-600 bg-rose-50"
                              : "text-gray-700 bg-gray-100";
                          return (
                            <th
                              key={`day-num-${dateStr}`}
                              ref={isToday ? todayColRef : undefined}
                              onClick={() => setTimelineDate(fullDate)}
                              className={`p-0.5 sm:p-1 text-center text-[9px] sm:text-[10px] font-bold border-r border-b border-gray-200 w-[30px] sm:w-[44px] cursor-pointer hover:bg-indigo-100 hover:text-indigo-700 transition-colors ${headerClass} ${isToday ? "shadow-[inset_0_0_0_2px_#ef4444] z-40 relative" : ""}`}
                              title={`${fullDate} 타임라인 보기`}
                            >
                              {dayNum}
                            </th>
                          );
                        })}
                        {/* Total column header */}
                        <th className="p-0.5 sm:p-1 text-center text-[9px] sm:text-[10px] font-bold border-b border-gray-200 bg-indigo-50 text-indigo-600 whitespace-nowrap border-l-2 border-l-gray-200 w-[44px] sm:w-[52px] lg:w-[64px]">
                          합계
                        </th>
                      </tr>

                      {/* Header Row 2: Day of Week Characters */}
                      <tr className="bg-gray-50 text-gray-500 select-none">
                        {/* Left spacing header matching Name column */}
                        <th className="border-r border-b border-gray-200 sticky left-0 bg-gray-50 z-40 h-5 sm:h-6" style={{ minWidth: "80px" }}></th>

                        {displayDates.map((dateStr) => {
                          const { dayWord, isToday } = getDayDetails(dateStr);
                          const dayIndex = new Date(dateStr + 'T00:00:00').getDay();
                          const wordClass = dayIndex === 6
                            ? "text-sky-500 font-bold"
                            : dayIndex === 0
                              ? "text-rose-500 font-bold"
                              : "text-gray-400";
                          return (
                            <th
                              key={`day-name-${dateStr}`}
                              className={`p-0.5 text-center text-[8px] sm:text-[9px] border-r border-b border-gray-200 w-[30px] sm:w-[44px] bg-gray-50 ${wordClass} ${isToday ? "shadow-[inset_0_0_0_2px_#ef4444] z-40 relative" : ""}`}
                            >
                              {dayWord}
                            </th>
                          );
                        })}
                        {/* Total column sub-header */}
                        <th className="p-0.5 text-center text-[8px] sm:text-[9px] border-b border-gray-200 bg-indigo-50 text-indigo-500 border-l-2 border-l-gray-200 w-[44px] sm:w-[52px] lg:w-[64px]">
                          일·시간
                        </th>
                      </tr>
                    </thead>

                    {/* Table Body */}
                    <tbody className="divide-y divide-slate-100">
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
                          className={`bg-white group transition-colors ${draggedRowId === emp.id ? "opacity-40 bg-slate-50" : ""
                            } ${dragOverRowId === emp.id ? "bg-indigo-50/60 outline outline-2 outline-indigo-400" : "hover:bg-slate-50/70"
                            }`}
                        >

                          {/* Column 1: Sticky Employee Name */}
                          <td className="border-r border-slate-100 bg-white sticky left-0 z-[25] group-hover:bg-slate-50 shadow-[1px_0_0_0_#e2e8f0] min-w-[90px] sm:min-w-[104px] h-auto min-h-[54px] sm:min-h-[58px] p-0">
                            <div className="flex items-stretch h-full">
                              {/* Drag handle — desktop only */}
                              {isAdmin && (
                                <div
                                  className="text-gray-300 hover:text-indigo-500 cursor-grab active:cursor-grabbing px-0.5 flex items-center transition shrink-0 hidden sm:flex"
                                  title="드래그하여 이 직원 행의 순서 변경"
                                >
                                  <GripVertical size={11} />
                                </div>
                              )}
                              {/* Name / position / actions — vertical stack */}
                              <div className="flex-1 flex flex-col justify-between py-1 px-1.5 min-w-0">
                                {/* Top: name + memo dot */}
                                <div className="flex items-center gap-0.5 min-w-0">
                                  {emp.gender === "남" && (
                                    <span className="text-[9px] font-bold text-sky-500 shrink-0 leading-none">♂</span>
                                  )}
                                  {emp.gender === "여" && (
                                    <span className="text-[9px] font-bold text-rose-400 shrink-0 leading-none">♀</span>
                                  )}
                                  <span
                                    onClick={() => setCalendarEmployee(emp)}
                                    className="text-indigo-600 hover:text-indigo-800 hover:underline font-bold text-[10px] sm:text-[11px] cursor-pointer select-none transition break-keep leading-tight"
                                    title="클릭하여 개인 스케줄 달력 보기"
                                  >
                                    {emp.name}
                                  </span>
                                  {emp.description && (
                                    <span
                                      className="text-indigo-300 hover:text-indigo-500 transition cursor-default shrink-0"
                                      title={emp.description}
                                    >
                                      <MessageSquare size={8} />
                                    </span>
                                  )}
                                </div>
                                {/* Middle: position (구분) · rank (직급) · employmentType */}
                                <span className="text-[8px] sm:text-[9px] text-slate-500 font-medium leading-tight break-keep">
                                  {emp.position}{emp.rank ? ` / ${emp.rank}` : ""}{emp.employmentType ? ` · ${emp.employmentType}` : ""}
                                </span>
                                {/* 남은 월차: 로딩된 스케줄에서 직접 계산 */}
                                {(() => {
                                  const leaveTotal = parseInt(String(emp.annual_leave_days ?? ""), 10);
                                  if (!leaveTotal || !Number.isFinite(leaveTotal)) return null;
                                  const leaveUsed = emp.schedules.filter(
                                    s => s.type === "월차" && s.date.startsWith(`${currentYear}-`)
                                  ).length;
                                  const leaveRemaining = Math.max(0, leaveTotal - leaveUsed);
                                  return (
                                    <span className={`text-[8px] font-bold leading-tight ${leaveRemaining === 0 ? "text-rose-500" : "text-amber-500"}`}>
                                      월차{leaveRemaining}
                                    </span>
                                  );
                                })()}
                                {/* Bottom: edit / delete (admin) */}
                                {isAdmin && (
                                  <div className="flex items-center gap-0.5 opacity-20 group-hover:opacity-100 transition duration-150">
                                    <button
                                      onClick={() => openEditEmployeeModal(emp)}
                                      className="text-slate-400 hover:text-indigo-500 cursor-pointer p-0.5 rounded transition hover:bg-indigo-50"
                                      title="직원 상세 정보 수정"
                                    >
                                      <Edit size={9} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                                      className="text-slate-400 hover:text-rose-500 cursor-pointer p-0.5 rounded transition hover:bg-rose-50"
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
                          {displayDates.map((dateStr) => {
                            const { fullDate, isToday } = getDayDetails(dateStr);
                            const currentSched = emp.schedules.find((s) => s.date === fullDate);
                            const isOwnRow = isEmployeeMode && sessionEmployeeId === emp.id;
                            // 관리자 can open break modal for any row; 직원 only own row
                            const canOpenBreak = isManagerRole || isOwnRow;

                            return (
                              <td
                                key={`${emp.id}-${dateStr}`}
                                className={`p-0 border-r border-[#e2e8f0] ${isToday ? "shadow-[inset_0_0_0_2px_#ef4444] z-25 relative" : ""} ${canOpenBreak ? "cursor-pointer hover:bg-amber-50/50" : ""}`}
                                onClick={canOpenBreak ? () => openBreakModalForCell(emp.id, fullDate) : undefined}
                                title={canOpenBreak ? "클릭하여 점심/휴게 시간 설정" : undefined}
                              >
                                <ScheduleCell
                                  schedule={currentSched}
                                  dateStr={fullDate}
                                  employeeId={emp.id}
                                  onUpdate={(isEmployeeMode || isManagerRole) ? (async () => {}) : handleCellUpdate}
                                  isAdmin={isAdmin}
                                  openShiftHour={openShiftHour}
                                  middleShiftHour={middleShiftHour}
                                  closeShiftHour={closeShiftHour}
                                  scheduleTypes={settingsScheduleTypes.map((v) => ({ value: v, label: v }))}
                                />
                              </td>
                            );
                          })}

                          {/* Total column: work days + hours + labor cost + 월차 remaining */}
                          {(() => {
                            const { workDays, totalHours, laborCost } = getEmpMonthStats(emp);
                            const h = Math.floor(totalHours);
                            const m = Math.round((totalHours - h) * 60);
                            const hoursLabel = h > 0 ? (m > 0 ? `${h}h${m}m` : `${h}h`) : "";
                            // Format: ≥10,000원 → "123만", else raw "1,234"
                            const costLabel = laborCost > 0
                              ? laborCost >= 10000
                                ? `${Math.round(laborCost / 10000)}만`
                                : `${Math.round(laborCost).toLocaleString()}`
                              : "";
                            return (
                              <td className="border-l-2 border-slate-200 bg-indigo-50/50 text-center align-middle p-1">
                                <div className="text-[11px] sm:text-xs font-black text-indigo-700 leading-tight">{workDays}일</div>
                                {hoursLabel && <div className="text-[9px] sm:text-[10px] text-slate-500 font-medium leading-tight">{hoursLabel}</div>}
                                {isSuperAdmin && costLabel && <div className="text-[9px] sm:text-[10px] text-emerald-600 font-bold leading-tight">{costLabel}원</div>}
                              </td>
                            );
                          })()}
                        </tr>
                      ))}

                      {/* Real-time calculated Bottom Summary Rows — always uses ALL employees regardless of filter */}
                      {(() => {
                        const fmtCost = (cost: number) => cost <= 0 ? "" :
                          cost >= 10000 ? `${Math.round(cost / 10000)}만원` : `${Math.round(cost).toLocaleString()}원`;
                        const pharmacistCost = employees
                          .filter(e => e.position === "약사")
                          .reduce((sum, e) => sum + getEmpMonthStats(e).laborCost, 0);
                        const staffCost = employees
                          .filter(e => e.position !== "약사")
                          .reduce((sum, e) => sum + getEmpMonthStats(e).laborCost, 0);
                        const totalCost = pharmacistCost + staffCost;
                        return (
                          <>
                            <SummaryRow
                              summaries={totalSummaryList} label="약사"
                              totalCell={<div className="leading-tight"><div>{totalSummaryList.reduce((a, s) => a + s.pharmacistCount, 0)}인일</div>{isSuperAdmin && pharmacistCost > 0 && <div className="text-emerald-600 font-bold text-[9px]">{fmtCost(pharmacistCost)}</div>}</div>}
                            />
                            <SummaryRow
                              summaries={totalSummaryList} label="사원"
                              totalCell={<div className="leading-tight"><div>{totalSummaryList.reduce((a, s) => a + s.staffCount, 0)}인일</div>{isSuperAdmin && staffCost > 0 && <div className="text-emerald-600 font-bold text-[9px]">{fmtCost(staffCost)}</div>}</div>}
                            />
                            <SummaryRow
                              summaries={totalSummaryList} label="근무인원"
                              totalCell={<div className="leading-tight"><div>{totalSummaryList.reduce((a, s) => a + s.totalCount, 0)}인일</div>{isSuperAdmin && totalCost > 0 && <div className="text-emerald-600 font-bold text-[9px]">{fmtCost(totalCost)}</div>}</div>}
                            />
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Attendance Dashboard — sidebar on desktop, below on mobile */}
            {(() => {
              const today = new Date();
              const isThisMonth = today.getFullYear() === currentYear && today.getMonth() + 1 === currentMonth;
              const todaySummary = isThisMonth ? currentSummaryList.find(s => s.day === today.getDate()) : null;
              const totalWorkdays = currentSummaryList.filter(s => s.totalCount > 0).length;
              const avgPerDay = totalWorkdays > 0
                ? (currentSummaryList.reduce((acc, s) => acc + s.totalCount, 0) / dateList.length).toFixed(1)
                : "0";
              return (
                <div id="attendance-dashboard" className="m-2 sm:m-4 p-3 lg:m-0 lg:p-4 lg:w-64 xl:w-72 lg:shrink-0 lg:border-l lg:border-slate-200 lg:overflow-y-auto bg-white border border-slate-200 lg:border-y-0 lg:border-r-0 rounded-2xl lg:rounded-none shadow-sm lg:shadow-none flex flex-col gap-3">

                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-slate-100 text-slate-600 rounded-lg">
                        <Award size={14} />
                      </div>
                      <span className="text-xs font-bold text-slate-800">{currentMonth}월 근태 현황</span>
                    </div>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                      실시간
                    </span>
                  </div>

                  {/* Today's attendance */}
                  {todaySummary && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <Clock size={10} />
                        오늘 ({today.getMonth() + 1}/{today.getDate()}) 근무 현황
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 text-center bg-white/70 rounded-lg py-1.5 border border-indigo-100">
                          <div className="text-xs font-black text-violet-700">{todaySummary.pharmacistCount}</div>
                          <div className="text-[9px] text-slate-500 font-medium">약사</div>
                        </div>
                        <div className="flex-1 text-center bg-white/70 rounded-lg py-1.5 border border-indigo-100">
                          <div className="text-xs font-black text-sky-700">{todaySummary.staffCount}</div>
                          <div className="text-[9px] text-slate-500 font-medium">사원</div>
                        </div>
                        <div className="flex-1 text-center bg-indigo-600 rounded-lg py-1.5">
                          <div className="text-xs font-black text-white">{todaySummary.totalCount}</div>
                          <div className="text-[9px] text-indigo-200 font-medium">전체</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Monthly quick stats */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                      <div className="text-sm font-black text-slate-800">{totalWorkdays}일</div>
                      <div className="text-[10px] text-slate-500 font-medium">근무 있는 날</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                      <div className="text-sm font-black text-slate-800">{avgPerDay}명</div>
                      <div className="text-[10px] text-slate-500 font-medium">일평균 근무자</div>
                    </div>
                  </div>

                  {/* Absence/late/early counters */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className={`rounded-xl p-2 text-center border ${attSummary.totalLates > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"}`}>
                      <div className={`text-sm font-black ${attSummary.totalLates > 0 ? "text-amber-700" : "text-slate-400"}`}>{attSummary.totalLates}</div>
                      <div className="text-[9px] text-slate-500 font-medium">⚠️ 지각</div>
                    </div>
                    <div className={`rounded-xl p-2 text-center border ${attSummary.totalEarlyLeaves > 0 ? "bg-purple-50 border-purple-200" : "bg-slate-50 border-slate-200"}`}>
                      <div className={`text-sm font-black ${attSummary.totalEarlyLeaves > 0 ? "text-purple-700" : "text-slate-400"}`}>{attSummary.totalEarlyLeaves}</div>
                      <div className="text-[9px] text-slate-500 font-medium">🏃 조퇴</div>
                    </div>
                    <div className={`rounded-xl p-2 text-center border ${attSummary.totalAbsences > 0 ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200"}`}>
                      <div className={`text-sm font-black ${attSummary.totalAbsences > 0 ? "text-rose-700" : "text-slate-400"}`}>{attSummary.totalAbsences}</div>
                      <div className="text-[9px] text-slate-500 font-medium">🚨 결근</div>
                    </div>
                  </div>

                  {/* Issue employee list */}
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">이달 근태 이상자</div>
                    {attSummary.employeeRecords.length === 0 ? (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl py-4 text-center">
                        <div className="text-base mb-0.5">🎉</div>
                        <div className="text-[11px] text-emerald-700 font-bold">이상 없음</div>
                        <div className="text-[10px] text-emerald-600">전원 성실 근무 중</div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {attSummary.employeeRecords.map((rec) => (
                          <div key={`att-${rec.employee.id}`} className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition">
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-bold text-slate-800 break-keep">{rec.employee.name}</div>
                              <div className="text-[9px] text-slate-400">{rec.employee.position}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {rec.lates.length > 0 && (
                                <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-lg border border-amber-200" title={rec.lates.map(l => `${parseInt(l.date.split("-")[2])}일`).join(", ")}>
                                  ⚠️{rec.lates.length}
                                </span>
                              )}
                              {rec.earlyLeaves.length > 0 && (
                                <span className="text-[10px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-lg border border-purple-200" title={rec.earlyLeaves.map(e => `${parseInt(e.date.split("-")[2])}일`).join(", ")}>
                                  🏃{rec.earlyLeaves.length}
                                </span>
                              )}
                              {rec.absences.length > 0 && (
                                <span className="text-[10px] font-black bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-lg border border-rose-200" title={rec.absences.map(a => `${parseInt(a.date.split("-")[2])}일`).join(", ")}>
                                  🚨{rec.absences.length}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              );
            })()}

            </div>{/* end flex row wrapper */}
          </div>
      </div>

      {/* Footer */}
      <footer className="h-9 bg-white border-t border-gray-200 shrink-0 px-4 sm:px-6 flex items-center justify-between text-[10px] text-gray-400 font-medium">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Connected to</span>
          <span className="font-mono text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
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
        <EmployeeFormModal
          empModalMode={empModalMode}
          empName={empName}
          setEmpName={setEmpName}
          empPosition={empPosition}
          setEmpPosition={setEmpPosition}
          empCustomPosition={empCustomPosition}
          setEmpCustomPosition={setEmpCustomPosition}
          empEmploymentType={empEmploymentType}
          setEmpEmploymentType={setEmpEmploymentType}
          empHireDate={empHireDate}
          setEmpHireDate={setEmpHireDate}
          empDescription={empDescription}
          setEmpDescription={setEmpDescription}
          empWorkplace={empWorkplace}
          setEmpWorkplace={setEmpWorkplace}
          empGender={empGender}
          setEmpGender={setEmpGender}
          empRank={empRank}
          setEmpRank={setEmpRank}
          empAnnualLeave={empAnnualLeave}
          setEmpAnnualLeave={setEmpAnnualLeave}
          empLevel={empLevel}
          setEmpLevel={setEmpLevel}
          empZoneNums={empZoneNums}
          setEmpZoneNums={setEmpZoneNums}
          employmentTypes={PRESET_EMPLOYMENT_TYPES}
          onSubmit={handleAddEmployeeSubmit}
          onClose={() => setIsEmpModalOpen(false)}
        />
      )}

      {/* 4a. Break/Lunch Time Modal (employee self-service) */}
      {breakModal && (
        <BreakModal
          breakModal={breakModal}
          setBreakModal={setBreakModal}
          isSavingBreak={isSavingBreak}
          onSave={handleSaveBreak}
        />
      )}

      {/* 4. Admin Login Dialog Modal */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 flex flex-col justify-between overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-600 text-white rounded-lg">
                  <Lock size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-gray-900 tracking-tight">관리자 로그인</h3>
                  <p className="text-[10px] text-gray-400 font-medium">관리자 계정정보를 기입해 주십시오.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsLoginModalOpen(false);
                  setLoginError("");
                }}
                className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Box */}
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {loginError && (
                <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs flex items-center gap-2 animate-pulse">
                  <ShieldAlert size={14} className="shrink-0 text-rose-500" />
                  <span className="font-semibold">{loginError}</span>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  관리자 아이디 (osanmega)
                </label>
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="아이디를 입력하세요"
                  className="w-full text-xs rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 p-3 bg-white focus:outline-none font-semibold text-gray-800 transition"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  비밀번호
                </label>
                <input
                  type="password"
                  value={loginPw}
                  onChange={(e) => setLoginPw(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className="w-full text-xs rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 p-3 bg-white focus:outline-none font-semibold text-gray-800 transition"
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
                  className="flex-1 p-3 text-xs font-bold bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 text-gray-600 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 p-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-600 rounded-xl transition shadow-sm inline-flex items-center justify-center gap-1.5"
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
          onScheduleUpdate={() => fetchScheduleData()}
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
            try {
              await axios.post("/api/schedules/batch", {
                items: items.map(item => ({ employeeId: calendarEmployee.id, ...item })),
              });
              showNotification(`${calendarEmployee.name}님의 ${items.length}일 일괄 스케줄이 반영되었습니다.`);
              // Include saved dates so the modal calendar refreshes even if it's on a different month
              const savedDates = items.map(i => i.date);
              const allDates = Array.from(new Set([...dateList, ...savedDates]));
              await fetchScheduleData(allDates);
            } catch (err) {
              console.error("Bulk save failed:", err);
              showNotification("일괄 저장 중 오류가 발생했습니다.", "error");
              throw err;
            }
          }}
          scheduleTypes={settingsScheduleTypes.map(v => ({ value: v, label: v }))}
          openShiftHour={openShiftHour}
          middleShiftHour={middleShiftHour}
          closeShiftHour={closeShiftHour}
          logisticsZoneProps={calendarLogisticsZoneProps}
        />
      )}
    </div>
  );
};
export default SchedulePage;
