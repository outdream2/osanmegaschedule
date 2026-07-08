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
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import {
  Calendar,
  Home,
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
} from "lucide-react";

interface SchedulePageProps {
  onBack?: () => void;
  onLogout?: () => void;
  onNavigate?: (page: AppNavPage) => void;
  initialEditEmployeeId?: number | null;
  onEditEmployeeHandled?: () => void;
  authSession?: AuthSession | null;
}

export const SchedulePage: React.FC<SchedulePageProps> = ({ onBack, onLogout, onNavigate, initialEditEmployeeId, onEditEmployeeHandled, authSession }) => {
  // ── Auth-derived flags (level-based, with role fallback for old sessions) ───
  const userLevel = authSession?.level ??
    (authSession?.role === "superadmin" || authSession?.role === "admin" ? 9
    : authSession?.role === "manager" ? 2
    : authSession?.role === "employee" ? 1 : 0);
  const isSuperAdmin = userLevel >= 9;             // 최고관리자 badge
  const isManagerRole = userLevel >= 2 && userLevel < 9;  // 관리자 badge
  const isEmployeeMode = userLevel === 1;          // 직원 read-only mode
  const sessionEmployeeId = authSession?.employeeId ?? null;
  // Settings hook (positions, workplaces, scheduleTypes)
  const {
    positions: PRESET_POSITIONS,
    employmentTypes: PRESET_EMPLOYMENT_TYPES,
    workplaces: settingsWorkplaces,
    scheduleTypes: settingsScheduleTypes,
    wageRates: settingsWageRates,
    employeeWageOverrides: settingsEmployeeWageOverrides,
    update: updateSettings,
  } = useSettings();

  // Build a Record<string, string> from scheduleTypes for a specific employee
  // Priority: 약사→pharmHours, 물류→logisticsHours, 알바→partTimeHours, else→hours
  const getTypeHoursMap = (position: string, employmentType: string = ""): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const entry of settingsScheduleTypes) {
      let h = entry.hours;
      if (position === "약사" && entry.pharmHours) h = entry.pharmHours;
      else if (position.includes("물류") && entry.logisticsHours) h = entry.logisticsHours;
      else if (employmentType === "알바" && entry.partTimeHours) h = entry.partTimeHours;
      map[entry.type] = h;
    }
    return map;
  };
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

  // Scroll position management
  const pendingScrollDateRef = useRef<string | null>(null); // date to scroll to after re-render
  const suppressScrollRef = useRef(false);                  // suppress listener during programmatic scroll
  const isInitialLoadRef = useRef(true);
  const isInitialFetchRef = useRef(true);                   // true only for the first data fetch



  // isAdmin = full edit access (schedule editing, employee management, labor costs)
  // level >= 2 means any manager or above can edit
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    const lvl = authSession?.level ?? 0;
    if (lvl >= 2) return true;
    if (lvl === 1) return false;
    return localStorage.getItem("megatown_admin") === "true";
  });

  // Keep isAdmin in sync if authSession changes during the page lifetime
  useEffect(() => {
    const lvl = authSession?.level ?? 0;
    if (lvl >= 2) setIsAdmin(true);
    else if (lvl === 1) setIsAdmin(false);
  }, [authSession?.level]);

  // Edit mode — must be explicitly activated to prevent accidental cell changes
  const [editMode, setEditMode] = useState(false);
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

  const handleNavPage = useCallback((p: AppNavPage) => {
    if (p === "landing") { onBack?.(); return; }
    onNavigate?.(p);
  }, [onNavigate, onBack]);

  // Modal / Form states for adding/editing employee
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [empModalMode, setEmpModalMode] = useState<"create" | "edit">("create");
  const [selectedEmpForEdit, setSelectedEmpForEdit] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState("");
  const [empPosition, setEmpPosition] = useState("");
  const [empCustomPosition, setEmpCustomPosition] = useState("");
  const [empEmploymentType, setEmpEmploymentType] = useState<string>("정직원");
  const [empHireDate, setEmpHireDate] = useState("");
  const [empRetireDate, setEmpRetireDate] = useState("");
  const [empDescription, setEmpDescription] = useState("");
  const [empWorkplace, setEmpWorkplace] = useState<string>("매장");
  const [empGender, setEmpGender] = useState<"남" | "여" | "">("");
  const [empRank, setEmpRank] = useState("");
  const [empAnnualLeave, setEmpAnnualLeave] = useState<number>(0);
  const [empLevel, setEmpLevel] = useState<number>(1);
  const [empZoneNums, setEmpZoneNums] = useState<number[]>([]);
  const [empPhone, setEmpPhone] = useState<string>("");
  const [empContractFile, setEmpContractFile] = useState<File | null>(null);
  const [empContractUrl, setEmpContractUrl] = useState<string | null>(null);
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
    calendarEmployee?.position.includes("물류")
      ? (() => {
          const zones = loadDisplayZones();
          const assignedZoneNums = zones.filter(z => z.assignedStaffId === calendarEmployee.id).map(z => z.num);
          const empId = calendarEmployee.id;
          const empName = calendarEmployee.name;
          return {
            assignedZoneNums,
            onToggle: (zoneNum: number) => {
              const current = loadDisplayZones();
              saveDisplayZones(current.map(z => {
                if (z.num !== zoneNum) return z;
                return z.assignedStaffId === empId
                  ? { ...z, assignedStaffId: null, assignedStaffName: "" }
                  : { ...z, assignedStaffId: empId, assignedStaffName: empName };
              }));
            },
            onClearAll: () => {
              saveDisplayZones(loadDisplayZones().map(z =>
                z.assignedStaffId === empId ? { ...z, assignedStaffId: null, assignedStaffName: "" } : z
              ));
            },
            onSaveToDow: async (dow: number) => {
              const currentZones = loadDisplayZones();
              const currentNums = currentZones.filter(z => z.assignedStaffId === empId).map(z => z.num);
              const key = `megatown_zone_template_emp${empId}_dow${dow}`;
              localStorage.setItem(key, JSON.stringify(currentNums));
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
    setEmpRetireDate("");
    setEmpDescription("");
    setEmpWorkplace("매장");
    setEmpGender("");
    setEmpRank("");
    setEmpLevel(1);
    setEmpZoneNums([]);
    setEmpPhone("");
    setEmpContractFile(null);
    setEmpContractUrl(null);
    setIsEmpModalOpen(true);
  };

  const openEditEmployeeModal = (emp: Employee) => {
    setSelectedEmpForEdit(emp);
    setEmpModalMode("edit");
    setEmpName(emp.name);

    const knownPositions = ["약사", "캐셔", "물류", "진열"];
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
    setEmpRetireDate(emp.retireDate || "");
    setEmpDescription(emp.description || "");
    setEmpWorkplace(emp.workplace || "매장");
    setEmpGender((emp.gender as "남" | "여") || "");
    if (emp.position.includes("물류")) {
      const zones = loadDisplayZones();
      setEmpZoneNums(zones.filter(z => z.assignedStaffId === emp.id).map(z => z.num));
    } else {
      setEmpZoneNums([]);
    }
    setEmpPhone(emp.phone ?? "");
    setEmpContractFile(null);
    setEmpContractUrl((emp as any).contract_file_url ?? null);
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
  const [positionTab, setPositionTab] = useState<"전체" | "약사" | "물류" | "캐셔" | "진열" | "알바" | "기타">("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"none" | "position" | "name">("none");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [todayFirst, setTodayFirst] = useState(true);

  // Settings modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const applyShiftHoursToAll = async () => {
    const monthStr = String(currentMonth).padStart(2, "0");
    const items: Array<{ employeeId: number; date: string; type: string; workingHours: string; actualHours: string; memo: string }> = [];
    for (const emp of employees) {
      const hoursMap = getTypeHoursMap(emp.position, emp.employmentType);
      for (const sc of emp.schedules) {
        if (!sc.date.startsWith(`${currentYear}-${monthStr}`)) continue;
        const wh = hoursMap[sc.type];
        if (!wh) continue;
        items.push({ employeeId: emp.id, date: sc.date, type: sc.type, workingHours: wh, actualHours: sc.actualHours || "", memo: sc.memo || "" });
      }
    }
    if (items.length > 0) await axios.post("/api/schedules/batch", { items });
    await fetchScheduleData(undefined, true);
    showNotification("기본 근무시간이 현재 월 전체에 적용되었습니다.", "success");
  };

  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Copy Previous Month state
  const [isCopying, setIsCopying] = useState(false);
  // 전월복사 모달 상태
  const [copyModal, setCopyModal] = useState<{
    open: boolean;
    copySchedules: boolean;
    copyDayAssignments: boolean;
  }>({ open: false, copySchedules: true, copyDayAssignments: true });

  // Month lock state
  const [isMonthLocked, setIsMonthLocked] = useState(false);
  const [isLockLoading, setIsLockLoading] = useState(false);

  // Monthly summary column visibility (hidden | summary | labor)
  // - hidden: 월합/월별합계 열 숨김
  // - summary: 월합 열만 표시 (인건비 제외)
  // - labor: 월합 열 + 인건비 항목 모두 표시
  const [showSummary, setShowSummary] = useState<"hidden" | "summary" | "labor">("hidden");

  // 전월복사 버튼 → 모달 열기 (선택 후 실제 실행)
  const handleCopyFromPreviousMonth = () => {
    setCopyModal(prev => ({ ...prev, open: true }));
  };

  const executeCopyFromPreviousMonth = async () => {
    const { copySchedules, copyDayAssignments } = copyModal;
    if (!copySchedules && !copyDayAssignments) {
      showNotification("복사할 항목을 하나 이상 선택하세요.", "error");
      return;
    }
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

    // 스케줄 기존 데이터 확인
    const currentMonthHasSchedules = employees.some(emp =>
      emp.schedules && emp.schedules.some(s => s.date.startsWith(monthPrefix) && s.type.trim() !== "")
    );

    // 일별 근무설정 기존 데이터 확인 (있는지만 체크)
    let curDayHasData = false;
    if (copyDayAssignments) {
      try {
        const daysInCur = new Date(currentYear, currentMonth, 0).getDate();
        for (let d = 1; d <= daysInCur; d++) {
          const dateStr = `${monthPrefix}-${String(d).padStart(2, "0")}`;
          const r = await axios.get(`/api/zone-day/${dateStr}`);
          if (r.data && !r.data._empty && (
            Object.keys(r.data.zone_slots ?? {}).length > 0 ||
            Object.keys(r.data.lunch_slots ?? {}).length > 0 ||
            Object.keys(r.data.rest_slots ?? {}).length > 0
          )) { curDayHasData = true; break; }
        }
      } catch { /* skip */ }
    }

    // 덮어쓰기 확인
    const needsScheduleOverwrite = copySchedules && currentMonthHasSchedules;
    const needsDayOverwrite = copyDayAssignments && curDayHasData;
    if (needsScheduleOverwrite || needsDayOverwrite) {
      const parts: string[] = [];
      if (needsScheduleOverwrite) parts.push("월별 스케쥴");
      if (needsDayOverwrite)      parts.push("일별 근무설정");
      if (!confirm(`${currentMonth}월에 이미 ${parts.join(" / ")} 데이터가 있습니다.\n${prevYear}년 ${prevMonth}월 데이터로 덮어쓰시겠습니까?`)) return;
      if (!confirm(`정말 덮어쓰시겠습니까?\n현재 ${currentMonth}월 ${parts.join(" / ")}이(가) 교체됩니다.`)) return;
    }

    setIsCopying(true);
    setCopyModal(prev => ({ ...prev, open: false }));
    try {
      const msgs: string[] = [];
      if (copySchedules) {
        const response = await axios.post("/api/schedules/copy", {
          targetYear: currentYear,
          targetMonth: currentMonth,
        });
        msgs.push(`월별 스케쥴 ${response.data.count || 0}건`);
      }
      if (copyDayAssignments) {
        const r = await axios.post("/api/zone-day/copy-month", {
          targetYear: currentYear,
          targetMonth: currentMonth,
          overwrite: needsDayOverwrite || true, // 이미 확인 완료
        });
        msgs.push(`일별 근무설정 ${r.data.count || 0}건`);
      }
      showNotification(`복사 완료 — ${msgs.join(" · ")}`);
      await fetchScheduleData(undefined, true);
    } catch (err: any) {
      console.error("Failed to copy:", err);
      showNotification("전월 복사 도중 오류가 발생했습니다.", "error");
    } finally {
      setIsCopying(false);
    }
  };

  const handleToggleMonthLock = async () => {
    const next = !isMonthLocked;
    const label = next ? "확정" : "확정해제";
    if (!confirm(`${currentYear}년 ${currentMonth}월 스케줄을 ${label}하시겠습니까?${next ? "\n확정 후에는 관리자도 수정할 수 없습니다." : ""}`)) return;
    setIsLockLoading(true);
    try {
      const key = `schedule_lock_${currentYear}-${String(currentMonth).padStart(2, "0")}`;
      await axios.post("/api/settings", { key, value: next });
      setIsMonthLocked(next);
      showNotification(`${currentMonth}월 스케줄이 ${label}되었습니다.`);
    } catch {
      showNotification("처리 중 오류가 발생했습니다.", "error");
    } finally {
      setIsLockLoading(false);
    }
  };

  const handlePrevMonth = () => {
    let year = currentYear;
    let month = currentMonth - 1;
    if (month < 1) { month = 12; year--; }
    pendingScrollDateRef.current = `${year}-${String(month).padStart(2, '0')}-01`;
    setCurrentYear(year);
    setCurrentMonth(month);
    setEditMode(false);
  };

  const handleNextMonth = () => {
    let year = currentYear;
    let month = currentMonth + 1;
    if (month > 12) { month = 1; year++; }
    pendingScrollDateRef.current = `${year}-${String(month).padStart(2, '0')}-01`;
    setCurrentYear(year);
    setCurrentMonth(month);
    setEditMode(false);
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

  const monthStr = String(currentMonth).padStart(2, '0');

  // 3-month date list: prev + current + next month — enables continuous scroll
  const dateList: string[] = React.useMemo(() => {
    const result: string[] = [];
    for (let offset = -1; offset <= 1; offset++) {
      let y = currentYear, m = currentMonth + offset;
      if (m <= 0) { m += 12; y--; }
      if (m > 12) { m -= 12; y++; }
      const days = new Date(y, m, 0).getDate();
      for (let d = 1; d <= days; d++) {
        result.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }
    return result;
  }, [currentYear, currentMonth]);

  const displayDates = dateList;

  // Scroll to pending date (or today on first load) after data loads
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
        // Use actual DOM position for reliability
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

  // Trigger loading schedule — supports a multi-month date range by fetching each month
  // in parallel and merging employee schedule arrays.
  const fetchScheduleData = async (dates?: string[], silent = false) => {
    const targetDates = dates ?? dateList;
    if (!silent) setIsLoading(true);
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

  // Re-fetch 3-month window whenever center month changes
  useEffect(() => {
    const silent = !isInitialFetchRef.current;
    isInitialFetchRef.current = false;
    fetchScheduleData(dateList, silent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, currentMonth]);

  // Scroll listener removed: auto-detecting month from scroll position caused the
  // dateList to shift mid-scroll, resetting scrollLeft and jumping to the wrong month.
  // Month navigation is now arrow-button only; adjacent months are still visible
  // by scrolling left/right in the 3-month dateList.

  // Load month lock state when month changes
  useEffect(() => {
    const key = `schedule_lock_${currentYear}-${String(currentMonth).padStart(2, "0")}`;
    axios.get(`/api/settings?key=${key}`)
      .then(res => setIsMonthLocked(res.data?.value === true))
      .catch(() => setIsMonthLocked(false));
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

    // Use filteredEmployees indices so drag matches what the user sees on screen.
    // After reordering, merge back into the full employees array while preserving
    // non-visible employees (those excluded by current filters) in their positions.
    const fromIdx = filteredEmployees.findIndex((emp) => emp.id === draggedRowId);
    const toIdx = filteredEmployees.findIndex((emp) => emp.id === targetId);

    if (fromIdx !== -1 && toIdx !== -1) {
      // Reorder the filtered slice
      const reorderedFiltered = [...filteredEmployees];
      const [draggedItem] = reorderedFiltered.splice(fromIdx, 1);
      reorderedFiltered.splice(toIdx, 0, draggedItem);

      // Find the slots in employees[] that the filtered employees occupy (in their current order)
      const filteredIds = new Set(filteredEmployees.map((emp) => emp.id));
      const slots: number[] = [];
      employees.forEach((emp, idx) => {
        if (filteredIds.has(emp.id)) slots.push(idx);
      });

      // Fill those slots with the reordered filtered employees
      const updatedEmployees = [...employees];
      slots.forEach((slotIdx, i) => {
        updatedEmployees[slotIdx] = reorderedFiltered[i];
      });

      setEmployees(updatedEmployees);
      if (sortBy !== "none") setSortBy("none");
      if (todayFirst) setTodayFirst(false);

      localStorage.setItem("megatown_employee_order", JSON.stringify(updatedEmployees.map((emp) => emp.id)));
      showNotification("직원 순서가 변경되었습니다.");
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
    const finalPosition = (!["약사", "캐셔", "물류", "진열"].includes(empPosition) && empCustomPosition.trim())
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
      const uploadContract = async (empId: number) => {
        if (!empContractFile) return;
        const fd = new FormData();
        fd.append("contract", empContractFile);
        try {
          await axios.post(`/api/employees/${empId}/contract`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch {
          showNotification("근로계약서 업로드 중 오류가 발생했습니다.", "error");
        }
      };

      if (empModalMode === "edit" && selectedEmpForEdit) {
        if (!window.confirm(`${empName} 직원의 정보를 수정하시겠습니까?`)) return;
        await axios.put(`/api/employees/${selectedEmpForEdit.id}`, {
          name: empName,
          position: finalPosition,
          rank: empRank.trim() || null,
          employmentType: empEmploymentType,
          hireDate: empHireDate || new Date().toISOString().split("T")[0],
          retireDate: empRetireDate || null,
          description: empDescription,
          workplace: empWorkplace,
          gender: empGender || null,
          phone: empPhone.trim() || null,
          annual_leave_days: empAnnualLeave > 0 ? empAnnualLeave : null,
          level: empLevel,
        });
        await uploadContract(selectedEmpForEdit.id);
        applyZones(selectedEmpForEdit.id, empName);
        showNotification(`${empName} 직원의 정보가 수정되었습니다.`);
      } else {
        const res = await axios.post("/api/employees", {
          name: empName,
          position: finalPosition,
          rank: empRank.trim() || null,
          employmentType: empEmploymentType,
          hireDate: empHireDate || new Date().toISOString().split("T")[0],
          retireDate: empRetireDate || null,
          description: empDescription,
          workplace: empWorkplace,
          gender: empGender || null,
          phone: empPhone.trim() || null,
          annual_leave_days: empAnnualLeave > 0 ? empAnnualLeave : null,
          level: empLevel,
        });
        if (res.data?.id) {
          await uploadContract(res.data.id);
          applyZones(res.data.id, empName);
        }
        showNotification(`새 직원 ${empName}님이 등록되었습니다.`);
      }

      setIsEmpModalOpen(false);
      setEmpName("");
      setEmpPosition("");
      setEmpCustomPosition("");
      setEmpEmploymentType("정직원");
      setEmpHireDate("");
      setEmpRetireDate("");
      setEmpDescription("");
      setEmpWorkplace("매장");
      setEmpGender("");
      setEmpRank("");
      setEmpAnnualLeave(0);
      setEmpLevel(1);
      setEmpZoneNums([]);
      setEmpPhone("");
      setEmpContractFile(null);
      setEmpContractUrl(null);
      setSelectedEmpForEdit(null);
      setEmpModalMode("create");
      fetchScheduleData(undefined, true); // refresh roster silently
    } catch (err: any) {
      console.error("Failed to solve employee form request:", err);
      const serverMsg = err?.response?.data?.error;
      const base = empModalMode === "edit" ? "직원 정보 수정 오류" : "직원 등록 오류";
      showNotification(serverMsg ? `${base}: ${serverMsg}` : `${base}가 발생했습니다.`, "error");
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
      setEmployees(prev => prev.filter(e => e.id !== id));
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

  const OFF_TYPES_SET = new Set(["휴무", "월차", "결근"]);

  // monthKey: "YYYY-MM". Defaults to currentYear/currentMonth when not provided.
  const getEmpMonthStats = (emp: Employee, monthKey?: string) => {
    const prefix = monthKey ?? `${currentYear}-${monthStr}`;
    const visibleSchedules = emp.schedules.filter(s => s.date.startsWith(prefix));
    const workDays = visibleSchedules.filter(s => s.type && !OFF_TYPES_SET.has(s.type)).length;
    let totalHours = 0;
    let laborCost = 0;

    const wageRates = settingsWageRates ?? {};
    const empOverrides = settingsEmployeeWageOverrides ?? {};
    const empRate = empOverrides[emp.id] ?? wageRates[emp.position] ?? null;
    const shiftHourFallback = getTypeHoursMap(emp.position, emp.employmentType);

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

  const KNOWN_POSITIONS = new Set(["약사", "캐셔", "물류", "진열"]);

  const filteredEmployees = employees
    .filter((emp) => {
      if (workplaceTab !== "전체") {
        if ((emp.workplace || "매장") !== workplaceTab) return false;
      }
      if (positionTab !== "전체") {
        // Partition (mutually exclusive): 약사 > 알바 > 물류(캐셔·진열 포함) > 기타
        const isPharm  = emp.position === "약사";
        const isAlba   = !isPharm && (emp.rank === "알바" || emp.position === "알바");
        const isLogist = !isPharm && !isAlba &&
          (emp.position.includes("물류") || emp.position === "캐셔" || emp.position === "진열");
        const isEtc    = !isPharm && !isAlba && !isLogist;

        if (positionTab === "약사")      { if (!isPharm)  return false; }
        else if (positionTab === "알바") { if (!isAlba)   return false; }
        else if (positionTab === "물류") { if (!isLogist) return false; }
        else if (positionTab === "기타") { if (!isEtc)    return false; }
        else if (positionTab === "캐셔") { if (!isLogist || !emp.position.includes("캐셔")) return false; }
        else if (positionTab === "진열") { if (!isLogist || emp.position !== "진열") return false; }
      }
      if (searchQuery.trim() !== "") {
        return emp.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      }
      return true;
    })
    .sort((a, b) => {
      const POSITION_ORDER: Record<string, number> = { "대표": 1, "임원": 2, "약사": 3, "캐셔": 4, "진열": 5, "물류": 6 };

      if (sortBy === "position") {
        const pA = POSITION_ORDER[a.position] ?? 99;
        const pB = POSITION_ORDER[b.position] ?? 99;
        if (pA !== pB) return sortOrder === "asc" ? pA - pB : pB - pA;
        return a.name.localeCompare(b.name, "ko");
      }

      if (sortBy === "name") {
        return sortOrder === "asc"
          ? a.name.localeCompare(b.name, "ko")
          : b.name.localeCompare(a.name, "ko");
      }

      // sortBy === "none": todayFirst — 오픈→마감→기타근무→휴무류→없음 순
      if (todayFirst) {
        // 휴무로 취급할 타입 (반차 포함)
        const TODAY_OFF_TYPES = new Set(["휴무", "월차", "지정휴무", "결근", "오전반차", "오후반차"]);
        // 출근 타입별 우선순위 (0=오픈, 1=마감, 2=기타근무)
        const TODAY_TYPE_ORDER: Record<string, number> = {
          "오픈": 0, "마감": 1,
        };
        const getOrder = (type: string): number => {
          if (!type) return 4;                    // 스케줄 없음
          if (TODAY_OFF_TYPES.has(type)) return 3; // 휴무류
          return TODAY_TYPE_ORDER[type] ?? 2;      // 오픈(0), 마감(1), 기타근무(2)
        };
        const aType = a.schedules.find(s => s.date === todayStr)?.type ?? "";
        const bType = b.schedules.find(s => s.date === todayStr)?.type ?? "";
        const aOrd = getOrder(aType);
        const bOrd = getOrder(bType);
        if (aOrd !== bOrd) return aOrd - bOrd;
        // 같은 카테고리(오픈/마감/휴무 등) 내에서는 이름 오름차순
        return a.name.localeCompare(b.name, "ko");
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
      let pharmacistCount = 0;
      let staffCount = 0;
      let otherCount = 0;

      for (const emp of sourceEmployees) {
        // 입사일 이전 · 퇴사일 이후는 합계에서 제외 (전체·일별 스케쥴 회색처리와 연동)
        if (emp.hireDate && currentDate < emp.hireDate) continue;
        if (emp.retireDate && currentDate > emp.retireDate) continue;
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
          const isOffType = ["휴무", "월차", "결근"].includes(type);
          if (!isOffType && type.trim() !== "") {
            // 기타 = 직종 "기타"/"알바" 이거나 고용형태 "알바"
            const isOther = emp.position === "기타" || emp.position === "알바" || emp.employmentType === "알바";
            if (emp.position === "약사") pharmacistCount++;
            else if (isOther) otherCount++;
            else staffCount++;
          }
        }
      }

      // totalCount는 3개 카테고리 합으로 계산 → 불일치 방지
      const totalCount = pharmacistCount + staffCount + otherCount;

      result.push({
        day,
        date: currentDate,
        openCount,
        middleCount,
        closeCount,
        totalCount,
        pharmacistCount,
        staffCount,
        otherCount,
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
        <div className="fixed top-5 right-5 z-[9999] pointer-events-none">
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
      <AppNavHeader
        activePage="schedule"
        authSession={authSession ?? null}
        onBack={onBack}
        onNavigate={handleNavPage}
        onLogout={handleLogout}
        rightSlot={
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                title="환경 설정"
                className="p-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 rounded-lg transition cursor-pointer"
              >
                <Settings size={14} />
              </button>
            )}
            {isAdmin && undoStack.length > 0 && (
              <button
                onClick={handleUndo}
                title={`되돌리기 (${undoStack.length}개 남음)`}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-lg text-amber-700 transition cursor-pointer"
              >
                ↩ <span className="text-[10px] bg-amber-200 px-1 rounded">{undoStack.length}</span>
              </button>
            )}
            <button
              onClick={() => fetchScheduleData()}
              className="p-2 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg text-gray-600 transition cursor-pointer"
              title="새로고침"
            >
              <span className="text-sm leading-none">↺</span>
            </button>
            {isAdmin && (
              <button
                onClick={() => openCreateEmployeeModal()}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-600 rounded-lg transition cursor-pointer shadow-sm"
              >
                <UserPlus size={13} />
                <span>직원 등록</span>
              </button>
            )}
            {userLevel < 1 && (
              <button
                onClick={() => { setLoginError(""); setIsLoginModalOpen(true); }}
                title="관리자 로그인"
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer shadow-sm"
              >
                <Lock size={12} />
                <span className="hidden sm:inline">관리자 로그인</span>
              </button>
            )}
            {/* Mobile: undo + add employee */}
            <div className="flex sm:hidden items-center gap-1">
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
        }
      />

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
          await fetchScheduleData(undefined, true);
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
                    if (["휴무", "월차", "결근"].includes(type)) {
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
            wageRates: settingsWageRates,
            employeeWageOverrides: settingsEmployeeWageOverrides,
          }}
          employees={employees.map(e => ({ id: e.id, name: e.name, position: e.position }))}
          onUpdate={updateSettings}
          onApplyShiftHours={applyShiftHoursToAll}
          onClose={() => setIsSettingsOpen(false)}
          editMode={editMode}
          onEnableEditMode={() => setEditMode(true)}
          sessionEmployeeId={sessionEmployeeId}
        />
      )}

      {/* 2. Grid Container Block */}
      <div className="flex-1 flex flex-col p-2 sm:p-3 md:p-4 bg-gray-100 gap-0">
        {/* Month Navigation Toolbar — responsive two-row layout */}
        <div className="bg-white border border-slate-200 border-b-0 rounded-t-xl py-1.5 sm:py-2 flex flex-col gap-1.5 px-2.5 sm:px-5 shrink-0 shadow-sm">
          {/* 1행: 월 네비게이션 + 오늘 + 범례 */}
          <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap min-w-0">
            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
              <button
                onClick={handlePrevMonth}
                className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center hover:bg-indigo-50 active:bg-indigo-100 rounded-xl text-slate-400 hover:text-indigo-600 transition-all cursor-pointer"
                title="이전 달"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                key={`${currentYear}-${currentMonth}`}
                title="1일로 이동"
                onClick={() => {
                  const firstOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
                  pendingScrollDateRef.current = firstOfMonth;
                  // Trigger scroll directly without waiting for useEffect
                  requestAnimationFrame(() => {
                    const el = scrollTableRef.current;
                    if (!el) return;
                    const targetEl = el.querySelector<HTMLElement>(`[title="${firstOfMonth} 타임라인 보기"]`);
                    if (!targetEl) return;
                    const elRect = el.getBoundingClientRect();
                    const targetRect = targetEl.getBoundingClientRect();
                    const nameWidth = nameThRef.current?.getBoundingClientRect().width ?? 96;
                    suppressScrollRef.current = true;
                    el.scrollLeft = Math.max(0, el.scrollLeft + (targetRect.left - elRect.left) - nameWidth);
                    setTimeout(() => { suppressScrollRef.current = false; }, 300);
                  });
                }}
                className="font-black tracking-tight text-slate-900 text-base sm:text-sm px-1 min-w-[100px] sm:min-w-[90px] text-center animate-in fade-in zoom-in-95 duration-200 hover:text-indigo-600 cursor-pointer rounded-lg hover:bg-indigo-50 transition-colors"
              >
                {currentYear}년 {String(currentMonth).padStart(2, "0")}월
              </button>
              <button
                onClick={handleNextMonth}
                className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center hover:bg-indigo-50 active:bg-indigo-100 rounded-xl text-slate-400 hover:text-indigo-600 transition-all cursor-pointer"
                title="다음 달"
              >
                <ChevronRight size={18} />
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  const newYear = today.getFullYear();
                  const newMonth = today.getMonth() + 1;
                  pendingScrollDateRef.current = todayStr;
                  setCurrentYear(newYear);
                  setCurrentMonth(newMonth);
                  setEditMode(false);
                }}
                className="ml-1 px-2.5 h-8 sm:h-7 flex items-center text-[11px] sm:text-[10px] font-black text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition cursor-pointer"
                title="오늘 날짜로 이동"
              >
                오늘
              </button>
            </div>
            {/* Legend indicators + 오늘 근무 서머리 */}
            <div className="flex items-center gap-2 text-[10px] font-semibold flex-wrap min-w-0">
              {[
                { color: "bg-yellow-100 border-yellow-300", label: "오픈" },
                { color: "bg-emerald-100 border-emerald-300", label: "마감" },
                { color: "bg-rose-100 border-rose-300", label: "휴무" },
                { color: "bg-amber-300 border-amber-400", label: "월차" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded border ${color} inline-block`}></span>
                  <span className="text-slate-500">{label}</span>
                </div>
              ))}
              {(() => {
                const today = new Date();
                const isThisMonth = today.getFullYear() === currentYear && today.getMonth() + 1 === currentMonth;
                const todaySummary = isThisMonth ? currentSummaryList.find(s => s.day === today.getDate()) : null;
                if (!todaySummary) return null;
                return (
                  <div className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
                    <Clock size={9} className="text-indigo-500" />
                    <span className="text-[10px] font-bold text-indigo-600">오늘</span>
                    <span className="text-indigo-300 text-[9px]">|</span>
                    <span className="text-[10px] font-black text-violet-700">약사 {todaySummary.pharmacistCount}</span>
                    <span className="text-slate-300 text-[9px]">·</span>
                    <span className="text-[10px] font-black text-sky-700">사원 {todaySummary.staffCount}</span>
                    <span className="text-slate-300 text-[9px]">·</span>
                    <span className="text-[10px] font-black text-slate-700">기타 {todaySummary.otherCount}</span>
                    <span className="text-slate-300 text-[9px]">·</span>
                    <span className="text-[10px] font-black text-indigo-700">총 {todaySummary.totalCount}명</span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* 2행: 합계/인건비 버튼 + 관리자 버튼 */}
          <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap justify-between min-w-0">
            {/* 합계보기 / 인건비보기 토글 버튼 */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setShowSummary(v => v === "summary" ? "hidden" : "summary")}
                title="월별 합계(근무일수/시간) 열 표시 토글"
                className={`px-2 py-1 text-xs rounded font-bold border transition cursor-pointer ${showSummary === "summary" ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}
              >
                합계보기
              </button>
              {isAdmin && (
                <button
                  onClick={() => setShowSummary(v => v === "labor" ? "hidden" : "labor")}
                  title="월별 합계 + 인건비 표시 토글"
                  className={`px-2 py-1 text-xs rounded font-bold border transition cursor-pointer ${showSummary === "labor" ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}
                >
                  인건비보기
                </button>
              )}
            </div>

            {/* 관리자 액션 버튼: 편집 / 확정 / 전월복사 */}
            {isAdmin && (
              <div className="flex items-center gap-1 shrink-0">
                {!isMonthLocked && (
                  <button
                    onClick={() => setEditMode(m => !m)}
                    title={editMode ? "편집 모드 종료" : "편집 모드 활성화 — 셀 클릭으로 스케줄 변경 가능"}
                    className={`flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      editMode
                        ? "border-emerald-400 bg-emerald-500 text-white shadow-sm"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500"
                    }`}
                  >
                    {editMode
                      ? <><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /><span>편집중</span></>
                      : <><Edit size={12} /><span>편집</span></>
                    }
                  </button>
                )}

                <button
                  onClick={handleToggleMonthLock}
                  disabled={isLockLoading}
                  title={isMonthLocked ? `${currentMonth}월 확정 해제` : `${currentMonth}월 스케줄 확정 (이후 수정 불가)`}
                  className={`flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isMonthLocked
                      ? "border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                  }`}
                >
                  {isLockLoading
                    ? <div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    : <Lock size={12} />
                  }
                  <span>{isMonthLocked ? "확정해제" : "확정"}</span>
                </button>

                {!isMonthLocked && (
                  <button
                    onClick={handleCopyFromPreviousMonth}
                    disabled={isCopying}
                    title={`${currentMonth === 1 ? 12 : currentMonth - 1}월 스케줄을 ${currentMonth}월로 복사`}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-600 hover:text-violet-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isCopying
                      ? <><div className="w-3 h-3 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" /><span>복사 중</span></>
                      : <><Layers size={12} /><span>전월복사</span></>
                    }
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-b-xl flex flex-col flex-1 shadow-sm overflow-x-hidden">
            {/* Month locked banner */}
            {isMonthLocked && (
              <div className="mx-2 mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
                <Lock size={13} className="text-amber-500 shrink-0" />
                <span className="text-xs font-bold text-amber-700">{currentMonth}월 스케줄이 확정된 상태입니다. 수정하려면 확정해제 후 진행하세요.</span>
              </div>
            )}
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

            {/* Admin quick-edit hint bar */}
            {isAdmin && !isMonthLocked && (
              <div className={`flex items-center gap-2 px-3 py-1.5 border-b shrink-0 min-w-0 overflow-hidden sticky top-0 z-30 ${editMode ? "bg-emerald-50 border-emerald-200 shadow-md" : "bg-slate-50 border-slate-100"}`}>
                {editMode ? (
                  <>
                    <span className="text-emerald-500 text-[10px]">✏️</span>
                    <span className="text-[10px] text-emerald-700 font-semibold truncate min-w-0">
                      편집 모드 ON — 셀 <strong>클릭</strong>: 오픈 → 미들 → 마감 → 휴무 순환 | <strong>⚙️</strong> 버튼: 상세 편집
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-400 text-[10px]">💡</span>
                    <span className="text-[10px] text-slate-500 truncate min-w-0">
                      셀을 직접 수정하려면 상단 <strong className="text-slate-700">편집</strong> 버튼을 눌러 편집 모드를 켜세요
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Schedule table — expands to content height, horizontal scroll only */}
            <div
              ref={scrollTableRef}
              className="relative overflow-x-auto w-full"
            >
              {/* Full spinner ONLY on initial load (no employees yet). Once data is loaded
                  all subsequent fetches are invisible so the table stays mounted and
                  scrollLeft is never reset (prevents the month-jumping bug). */}
              {isLoading && employees.length === 0 ? (
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
                          className="text-center text-[10px] sm:text-[11px] font-bold border-r border-gray-200 border-b border-b-gray-200 sticky left-0 bg-gray-100 z-40 py-2 sm:py-2.5 tracking-wide whitespace-nowrap px-1 sm:px-3"
                          style={{ width: "80px", minWidth: "80px" }}
                        >
                          <span className="hidden sm:inline">직원 성명</span>
                          <span className="sm:hidden">성명</span>
                        </th>

                        {displayDates.map((dateStr, dateIdx) => {
                          const { fullDate, isToday } = getDayDetails(dateStr);
                          const dayNum = parseInt(dateStr.split('-')[2]);
                          const dayIndex = new Date(dateStr + 'T00:00:00').getDay();
                          const headerClass = dayIndex === 6
                            ? "text-sky-600 bg-sky-50"
                            : dayIndex === 0
                              ? "text-rose-600 bg-rose-50"
                              : "text-gray-700 bg-gray-100";
                          const nextDate = displayDates[dateIdx + 1];
                          const isMonthEnd = !nextDate || nextDate.substring(0, 7) !== dateStr.substring(0, 7);
                          const monthLabel = parseInt(dateStr.substring(5, 7));
                          return (
                            <React.Fragment key={`day-num-${dateStr}`}>
                              <th
                                ref={isToday ? todayColRef : undefined}
                                onClick={() => setTimelineDate(fullDate)}
                                className={`p-0.5 sm:p-1 text-center text-[9px] sm:text-[10px] font-bold border-r border-b border-gray-200 w-[44px] cursor-pointer hover:bg-indigo-100 hover:text-indigo-700 transition-colors ${headerClass} ${isToday ? "ring-2 ring-inset ring-red-500 z-40 relative" : ""}`}
                                title={`${fullDate} 타임라인 보기`}
                              >
                                {dayNum}
                              </th>
                              {isMonthEnd && showSummary !== "hidden" && (
                                <th className="p-0.5 sm:p-1 text-center text-[9px] sm:text-[10px] font-bold border-b border-gray-200 bg-indigo-50 text-indigo-600 whitespace-nowrap border-l-2 border-l-gray-200 w-[44px] sm:w-[52px]">
                                  {monthLabel}월합
                                </th>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tr>

                      {/* Header Row 2: Day of Week Characters */}
                      <tr className="bg-gray-50 text-gray-500 select-none">
                        {/* Left spacing header matching Name column */}
                        <th className="border-r border-b border-gray-200 sticky left-0 bg-gray-50 z-40 h-5 sm:h-6" style={{ minWidth: "80px" }}></th>

                        {displayDates.map((dateStr, dateIdx) => {
                          const { dayWord, isToday } = getDayDetails(dateStr);
                          const dayIndex = new Date(dateStr + 'T00:00:00').getDay();
                          const wordClass = dayIndex === 6
                            ? "text-sky-500 font-bold"
                            : dayIndex === 0
                              ? "text-rose-500 font-bold"
                              : "text-gray-400";
                          const nextDate = displayDates[dateIdx + 1];
                          const isMonthEnd = !nextDate || nextDate.substring(0, 7) !== dateStr.substring(0, 7);
                          return (
                            <React.Fragment key={`day-name-${dateStr}`}>
                              <th
                                className={`p-0.5 text-center text-[8px] sm:text-[9px] border-r border-b border-gray-200 w-[44px] bg-gray-50 ${wordClass} ${isToday ? "ring-2 ring-inset ring-red-500 z-40 relative" : ""}`}
                              >
                                {dayWord}
                              </th>
                              {isMonthEnd && showSummary !== "hidden" && (
                                <th className="p-0.5 text-center text-[8px] sm:text-[9px] border-b border-gray-200 bg-indigo-50 text-indigo-500 border-l-2 border-l-gray-200 w-[44px] sm:w-[52px]">
                                  일·시간
                                </th>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    </thead>

                    {/* Table Body */}
                    <tbody className="divide-y divide-slate-100">
                      {filteredEmployees.map((emp, empIdx) => (
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
                          <td className="border-r border-slate-100 bg-white sticky left-0 z-[29] group-hover:bg-slate-50 shadow-[1px_0_0_0_#e2e8f0] min-w-[80px] sm:min-w-[96px] h-auto min-h-[54px] sm:min-h-[58px] p-0" style={{ willChange: "transform" }}>
                            <div className="flex items-stretch h-full">
                              {/* Row number — updates when drag-drop reorders */}
                              <div className="flex items-center justify-center w-4 sm:w-5 shrink-0 text-[8px] sm:text-[9px] font-bold text-slate-300 select-none">
                                {empIdx + 1}
                              </div>
                              {/* Drag handle — desktop only */}
                              {isAdmin && (
                                <div
                                  className="text-gray-300 hover:text-indigo-500 cursor-grab active:cursor-grabbing px-0.5 flex items-center transition shrink-0 hidden sm:flex"
                                  title="드래그하여 이 직원 행의 순서 변경"
                                >
                                  <GripVertical size={11} />
                                </div>
                              )}
                              {/* Name / position / actions — 2 lines */}
                              <div className="flex-1 flex flex-col justify-center py-1 pl-1 pr-1 min-w-0 gap-0">
                                {/* 1줄: 성별 + 이름 */}
                                <div className="flex items-center gap-0.5 min-w-0">
                                  {emp.gender === "남" && (
                                    <span className="text-[9px] font-bold text-sky-500 shrink-0">♂</span>
                                  )}
                                  {emp.gender === "여" && (
                                    <span className="text-[9px] font-bold text-rose-400 shrink-0">♀</span>
                                  )}
                                  <span
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); setCalendarEmployee(emp); }}
                                    className="text-indigo-600 hover:text-indigo-800 hover:underline font-bold text-xs sm:text-[13px] cursor-pointer select-none transition truncate"
                                    title="클릭하여 개인 스케줄 달력 보기"
                                  >
                                    {emp.name}
                                  </span>
                                </div>
                                {/* 2줄: 직종 + 월차 + 고용형태 */}
                                <div className="flex items-center gap-1 min-w-0">
                                  <span className="text-[8px] text-slate-400 font-medium shrink-0">{emp.position}</span>
                                  {(() => {
                                    const leaveTotal = parseInt(String(emp.annual_leave_days ?? ""), 10);
                                    if (!leaveTotal || !Number.isFinite(leaveTotal)) return null;
                                    const leaveUsed = emp.schedules.filter(s => s.type === "월차" && s.date.startsWith(`${currentYear}-`)).length;
                                    const leaveRemaining = Math.max(0, leaveTotal - leaveUsed);
                                    return <span className={`text-[8px] font-bold shrink-0 ${leaveRemaining === 0 ? "text-rose-500" : "text-amber-500"}`}>{leaveRemaining}</span>;
                                  })()}
                                  {userLevel >= 8 && emp.employmentType && emp.employmentType !== "정직원" && (
                                    <span className={`text-[8px] font-semibold shrink-0 ${emp.employmentType === "계약직" ? "text-blue-500" : "text-amber-500"}`}>
                                      {emp.employmentType}
                                    </span>
                                  )}
                                </div>
                                {/* 비고 */}
                                {emp.description && (
                                  <div className="text-[8px] text-amber-700 font-medium truncate leading-none" title={emp.description}>
                                    {emp.description}
                                  </div>
                                )}
                                {/* Bottom: edit / delete (admin) */}
                                {isAdmin && (
                                  <div className="flex items-center gap-0.5 opacity-20 group-hover:opacity-100 transition duration-150">
                                    <button
                                      draggable={false}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => { e.stopPropagation(); openEditEmployeeModal(emp); }}
                                      className="text-slate-400 hover:text-indigo-500 cursor-pointer p-0.5 rounded transition hover:bg-indigo-50"
                                      title="직원 상세 정보 수정"
                                    >
                                      <Edit size={9} />
                                    </button>
                                    <button
                                      draggable={false}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => { e.stopPropagation(); handleDeleteEmployee(emp.id, emp.name); }}
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

                          {/* Schedule Cells — with per-month total column after each month's last day */}
                          {displayDates.map((dateStr, dateIdx) => {
                            const { fullDate, isToday } = getDayDetails(dateStr);
                            const currentSched = emp.schedules.find((s) => s.date === fullDate);
                            const isOwnRow = isEmployeeMode && sessionEmployeeId === emp.id;
                            // 재직 기간 체크: 입사일 이전 · 퇴사일 이후 → 근무 불가 (회색 처리 + 클릭 차단)
                            const beforeHire = !!emp.hireDate && fullDate < emp.hireDate;
                            const afterRetire = !!emp.retireDate && fullDate > emp.retireDate;
                            const outOfEmployment = beforeHire || afterRetire;
                            const isHireDay   = !!emp.hireDate   && fullDate === emp.hireDate;
                            const isRetireDay = !!emp.retireDate && fullDate === emp.retireDate;
                            // 관리자: editMode 켜야 break modal 열림 / 직원: 본인 row는 항상 가능. 재직 기간 밖이면 불가.
                            const canOpenBreak = !outOfEmployment && ((isManagerRole && editMode) || isOwnRow);
                            const nextDate = displayDates[dateIdx + 1];
                            const isMonthEnd = !nextDate || nextDate.substring(0, 7) !== dateStr.substring(0, 7);

                            const cell = (
                              <td
                                key={`${emp.id}-${dateStr}`}
                                className={`relative p-0 border-r border-[#e2e8f0] ${isToday ? "ring-2 ring-inset ring-red-500 z-[25] relative" : ""} ${isHireDay ? "ring-2 ring-inset ring-emerald-500 z-[24] relative" : ""} ${isRetireDay ? "ring-2 ring-inset ring-rose-500 z-[24] relative" : ""} ${outOfEmployment ? "bg-slate-100/80 cursor-not-allowed" : (canOpenBreak ? "cursor-pointer hover:bg-amber-50/50" : "")}`}
                                onClick={canOpenBreak ? () => openBreakModalForCell(emp.id, fullDate) : undefined}
                                title={
                                  isHireDay ? `입사일 (${emp.hireDate})` :
                                  isRetireDay ? `퇴사일 (${emp.retireDate})` :
                                  outOfEmployment ? (beforeHire ? "입사일 이전 — 근무 불가" : "퇴사일 이후 — 근무 불가") :
                                  (canOpenBreak ? "클릭하여 점심/휴게 시간 설정" : undefined)
                                }
                              >
                                {/* 입사일/퇴사일 배지 (우상단 오버레이) */}
                                {isHireDay && (
                                  <span className="absolute top-0 right-0 z-30 text-[8px] font-black px-1 py-px rounded-bl bg-emerald-500 text-white leading-none shadow-sm pointer-events-none">입사</span>
                                )}
                                {isRetireDay && (
                                  <span className="absolute top-0 right-0 z-30 text-[8px] font-black px-1 py-px rounded-bl bg-rose-500 text-white leading-none shadow-sm pointer-events-none">퇴사</span>
                                )}
                                {outOfEmployment ? (
                                  <div className="w-full h-full min-h-[24px] flex items-center justify-center text-[10px] text-slate-400 font-medium select-none">
                                    <span className="opacity-40">─</span>
                                  </div>
                                ) : (
                                  <ScheduleCell
                                    schedule={currentSched}
                                    dateStr={fullDate}
                                    employeeId={emp.id}
                                    onUpdate={(isEmployeeMode || isManagerRole || isMonthLocked) ? (async () => {}) : handleCellUpdate}
                                    isAdmin={isAdmin && !isMonthLocked && editMode}
                                    isPharmacist={emp.position === "약사"}
                                    typeHoursMap={getTypeHoursMap(emp.position, emp.employmentType)}
                                    scheduleTypes={settingsScheduleTypes.map((e) => ({ value: e.type, label: e.type }))}
                                    scheduleTypeEntries={settingsScheduleTypes}
                                  />
                                )}
                              </td>
                            );

                            if (!isMonthEnd || showSummary === "hidden") return cell;

                            const mk = dateStr.substring(0, 7);
                            const { workDays, totalHours, laborCost } = getEmpMonthStats(emp, mk);
                            const h = Math.floor(totalHours);
                            const min = Math.round((totalHours - h) * 60);
                            const hoursLabel = h > 0 ? (min > 0 ? `${h}h${min}m` : `${h}h`) : "";
                            const costLabel = laborCost > 0
                              ? laborCost >= 10000 ? `${Math.round(laborCost / 10000)}만` : `${Math.round(laborCost).toLocaleString()}`
                              : "";
                            return (
                              <React.Fragment key={`${emp.id}-${dateStr}`}>
                                {cell}
                                <td className="border-l-2 border-slate-200 bg-indigo-50/50 text-center align-middle p-1">
                                  <div className="text-[11px] sm:text-xs font-black text-indigo-700 leading-tight">{workDays}일</div>
                                  {hoursLabel && <div className="text-[9px] sm:text-[10px] text-slate-500 font-medium leading-tight">{hoursLabel}</div>}
                                  {isAdmin && showSummary === "labor" && costLabel && <div className="text-[9px] sm:text-[10px] text-emerald-600 font-bold leading-tight">{costLabel}원</div>}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ))}

                      {/* Real-time calculated Bottom Summary Rows — always uses ALL employees regardless of filter */}
                      {(() => {
                        const fmtCost = (cost: number) => cost <= 0 ? "" :
                          cost >= 10000 ? `${Math.round(cost / 10000)}만원` : `${Math.round(cost).toLocaleString()}원`;
                        const isOtherE = (e: typeof employees[number]) => e.position === "기타" || e.position === "알바" || e.employmentType === "알바";
                        const pharmacistCost = employees
                          .filter(e => e.position === "약사")
                          .reduce((sum, e) => sum + getEmpMonthStats(e).laborCost, 0);
                        const staffCost = employees
                          .filter(e => e.position !== "약사" && !isOtherE(e))
                          .reduce((sum, e) => sum + getEmpMonthStats(e).laborCost, 0);
                        const otherCost = employees
                          .filter(e => e.position !== "약사" && isOtherE(e))
                          .reduce((sum, e) => sum + getEmpMonthStats(e).laborCost, 0);
                        const totalCost = pharmacistCost + staffCost + otherCost;
                        const showMonthTotal = showSummary !== "hidden";
                        const showLabor = showSummary === "labor";
                        return (
                          <>
                            <SummaryRow
                              summaries={totalSummaryList} label="약사"
                              showMonthTotal={showMonthTotal}
                              totalCell={<div className="leading-tight"><div>{totalSummaryList.reduce((a, s) => a + s.pharmacistCount, 0)}인일</div>{isAdmin && showLabor && pharmacistCost > 0 && <div className="text-emerald-600 font-bold text-[9px]">{fmtCost(pharmacistCost)}</div>}</div>}
                            />
                            <SummaryRow
                              summaries={totalSummaryList} label="사원"
                              showMonthTotal={showMonthTotal}
                              totalCell={<div className="leading-tight"><div>{totalSummaryList.reduce((a, s) => a + s.staffCount, 0)}인일</div>{isAdmin && showLabor && staffCost > 0 && <div className="text-emerald-600 font-bold text-[9px]">{fmtCost(staffCost)}</div>}</div>}
                            />
                            <SummaryRow
                              summaries={totalSummaryList} label="기타"
                              showMonthTotal={showMonthTotal}
                              totalCell={<div className="leading-tight"><div>{totalSummaryList.reduce((a, s) => a + s.otherCount, 0)}인일</div>{isAdmin && showLabor && otherCost > 0 && <div className="text-emerald-600 font-bold text-[9px]">{fmtCost(otherCost)}</div>}</div>}
                            />
                            <SummaryRow
                              summaries={totalSummaryList} label="근무인원"
                              showMonthTotal={showMonthTotal}
                              totalCell={<div className="leading-tight"><div>{totalSummaryList.reduce((a, s) => a + s.totalCount, 0)}인일</div>{isAdmin && showLabor && totalCost > 0 && <div className="text-emerald-600 font-bold text-[9px]">{fmtCost(totalCost)}</div>}</div>}
                            />
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                );
              })()}
            </div>

          </div>
      </div>

      {/* Footer — 저작권 표시 (가운데 정렬) */}
      <footer className="h-9 bg-white border-t border-gray-200 shrink-0 px-4 sm:px-6 flex items-center justify-center text-xs font-bold text-slate-600 tracking-wide">
        <span>© (주)이룸</span>
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
          empRetireDate={empRetireDate}
          setEmpRetireDate={setEmpRetireDate}
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
          empPhone={empPhone}
          setEmpPhone={setEmpPhone}
          empContractFile={empContractFile}
          setEmpContractFile={setEmpContractFile}
          empContractUrl={empContractUrl}
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
          typeHoursMap={getTypeHoursMap("", "")}
          pharmTypeHoursMap={getTypeHoursMap("약사", "")}
          onClose={() => setTimelineDate(null)}
          onDateChange={setTimelineDate}
          onEditEmployee={isAdmin ? openEditEmployeeModal : undefined}
          onScheduleUpdate={() => fetchScheduleData(undefined, true)}
          onUpdateSchedule={isAdmin ? handleCellUpdate : undefined}
          scheduleTypeEntries={settingsScheduleTypes}
        />
      )}

      {calendarEmployee && (
        <EmployeeCalendarModal
          employee={calendarEmployee}
          initialYear={currentYear}
          initialMonth={currentMonth}
          onClose={() => setCalendarEmployee(null)}
          isAdmin={isAdmin}
          isLocked={isMonthLocked}
          onUpdate={isMonthLocked ? undefined : handleCellUpdate}
          onBulkSave={isMonthLocked ? undefined : async (items) => {
            try {
              await axios.post("/api/schedules/batch", {
                items: items.map(item => ({ employeeId: calendarEmployee.id, ...item })),
              });
              showNotification(`${calendarEmployee.name}님의 ${items.length}일 일괄 스케줄이 반영되었습니다.`);
              const savedDates = items.map(i => i.date);
              const allDates = Array.from(new Set([...dateList, ...savedDates]));
              await fetchScheduleData(allDates, true);
            } catch (err) {
              console.error("Bulk save failed:", err);
              showNotification("일괄 저장 중 오류가 발생했습니다.", "error");
              throw err;
            }
          }}
          scheduleTypes={settingsScheduleTypes.map(e => ({ value: e.type, label: e.type }))}
          scheduleTypeEntries={settingsScheduleTypes}
          typeHoursMap={calendarEmployee ? getTypeHoursMap(calendarEmployee.position, calendarEmployee.employmentType) : undefined}
          logisticsZoneProps={calendarLogisticsZoneProps}
          onEditEmployee={isAdmin ? () => { const emp = calendarEmployee; setCalendarEmployee(null); if (emp) setTimeout(() => openEditEmployeeModal(emp), 0); } : undefined}
        />
      )}

      {/* 전월복사 항목 선택 모달 */}
      {copyModal.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
          onClick={() => setCopyModal(prev => ({ ...prev, open: false }))}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-violet-100 text-violet-600 rounded-lg shrink-0">
                <Layers size={18} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">전월 데이터 복사</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {currentMonth === 1 ? currentYear - 1 : currentYear}년 {currentMonth === 1 ? 12 : currentMonth - 1}월 → {currentYear}년 {currentMonth}월
                </p>
              </div>
            </div>

            <div className="space-y-2 mb-5">
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" className="mt-0.5 w-4 h-4 accent-indigo-500"
                  checked={copyModal.copySchedules}
                  onChange={e => setCopyModal(prev => ({ ...prev, copySchedules: e.target.checked }))} />
                <div className="flex-1">
                  <div className="text-sm font-bold text-slate-700">전체 월별 스케쥴</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">직원별 오픈/마감/휴무 등 근무 유형 스케줄</div>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" className="mt-0.5 w-4 h-4 accent-indigo-500"
                  checked={copyModal.copyDayAssignments}
                  onChange={e => setCopyModal(prev => ({ ...prev, copyDayAssignments: e.target.checked }))} />
                <div className="flex-1">
                  <div className="text-sm font-bold text-slate-700">일별 근무설정</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">일자별 구역/점심/휴게 배정 (같은 일자 기준으로 복사)</div>
                </div>
              </label>
            </div>

            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              ⚠️ 이번 달에 이미 데이터가 있으면 덮어쓸지 확인창이 뜹니다.
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setCopyModal(prev => ({ ...prev, open: false }))}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer">
                취소
              </button>
              <button
                onClick={executeCopyFromPreviousMonth}
                disabled={!copyModal.copySchedules && !copyModal.copyDayAssignments}
                className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                복사 시작
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 편집 모드 FAB (Floating Action Button) — 스크롤 위치 관계 없이 항상 우하단 노출 */}
      {isAdmin && !isMonthLocked && (
        <button
          type="button"
          onClick={() => setEditMode(m => !m)}
          title={editMode ? "편집 모드 종료" : "편집 모드 시작"}
          className={`fixed bottom-4 right-4 z-40 flex items-center gap-1.5 px-4 py-3 text-sm font-black rounded-full shadow-2xl transition-all cursor-pointer active:scale-95 ${
            editMode
              ? "bg-emerald-500 hover:bg-emerald-600 text-white ring-4 ring-emerald-300/40"
              : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 ring-2 ring-slate-200/60"
          }`}
        >
          {editMode ? (
            <>
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span>편집중 · 종료</span>
            </>
          ) : (
            <>
              <Edit size={14} />
              <span>편집</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};
export default SchedulePage;
