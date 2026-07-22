import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Employee, Schedule } from "../../types";
import { ZONE_DEFS, ZONES_STORAGE_KEY, SECTION_LABEL } from "../../constants/displayZones";
import {
  Calendar,
  Clock,
  User,
  Coffee,
  Briefcase,
  MapPin,
  Sparkles,
  Package,
  ShoppingCart,
  Layers,
  Smile,
  CheckCircle,
  Building2,
  Info,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Activity,
  RotateCcw,
  Trash2,
  HelpCircle,
  ArrowRight,
  Plus
} from "lucide-react";

interface StoreMapProps {
  employees: Employee[];
  currentYear: number;
  currentMonth: number;
  getDaysArray: () => number[];
  getDayDetails: (dayNum: number) => { dayWord: string; colorClass: string; fullDate: string };
  isAdmin: boolean;
  openShiftHour?: string;
  middleShiftHour?: string;
  closeShiftHour?: string;
}

export const StoreMap: React.FC<StoreMapProps> = ({
  employees,
  currentYear,
  currentMonth,
  getDaysArray,
  getDayDetails,
  isAdmin,
  openShiftHour = "09:30-18:30",
  middleShiftHour = "11:00-20:00",
  closeShiftHour = "13:00-22:00"
}) => {
  // Calendar Dates List
  const daysList = getDaysArray();

  // Selected date inside the store map view
  const [selectedDate, setSelectedDate] = useState<string>("");
  // Selected shift: "전체" | "오픈" | "미들" | "마감"
  const [selectedShift, setSelectedShift] = useState<string>("전체");

  // Position filter for sidebar active staff list
  const [sidebarPositionFilter, setSidebarPositionFilter] = useState<string>("전체");

  // Open & Close operating hours (Korean store business hours)
  const [openTime, setOpenTime] = useState<string>(() => localStorage.getItem("store_open_time") || "09:00");
  const [closeTime, setCloseTime] = useState<string>(() => localStorage.getItem("store_close_time") || "22:00");

  // Search filter for staff in the left sidebar
  const [staffSearchQuery, setStaffSearchQuery] = useState<string>("");

  // Tab State for left sidebar: "active" (출근 직원) or "off" (휴무 직원)
  const [sidebarTab, setSidebarTab] = useState<"active" | "off">("active");

  // Selected hour for interactive timeline details (10 to 20 or null)
  const [inspectedHour, setInspectedHour] = useState<number | null>(null);

  // Drag-and-Drop assignments state: employeeId (string) => zoneId (string)
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  // Hover target track for dragover highlighting
  const [dragOverZone, setDragOverZone] = useState<string | null>(null);

  // Display zone assignments (ZONE_DEFS 기반, 41개 진열대 담당직원 표시)
  type DisplayZoneSlim = {
    id: string; num: number; assignedStaffId: number | null;
    assignedStaffName: string; status: string; label: string;
    category: string; section: string; products: string;
  };
  const [displayZones, setDisplayZones] = useState<DisplayZoneSlim[]>([]);
  const [zoneVer, setZoneVer] = useState(0);
  const [dragOverZoneNum, setDragOverZoneNum] = useState<number | null>(null);

  // Responsive Zoom-scale level configuration for L-shape blueprint view
  const [zoomLevel, setZoomLevel] = useState<number>(0.9);

  // Drag-to-scroll ref for horizontal date bar
  const dateScrollRef = useRef<HTMLDivElement>(null);

  // Set default selected date once component mounts or year/month changes
  useEffect(() => {
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    const todayDayStr = String(today.getDate()).padStart(2, "0");
    const todayFormatted = `${todayYear}-${String(todayMonth).padStart(2, "0")}-${todayDayStr}`;

    const monthStr = String(currentMonth).padStart(2, "0");
    const startOfMonthDate = `${currentYear}-${monthStr}-01`;

    if (todayYear === currentYear && todayMonth === currentMonth) {
      setSelectedDate(todayFormatted);
    } else {
      setSelectedDate(startOfMonthDate);
    }
  }, [currentYear, currentMonth]);

  // Center selected date scroll indicator
  useEffect(() => {
    if (selectedDate && dateScrollRef.current) {
      const activeElement = dateScrollRef.current.querySelector('[data-active="true"]');
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [selectedDate]);

  // Translate fullDate string to day details
  const getSelectedDayDetails = () => {
    if (!selectedDate) return { dayWord: "", isWeekend: false, dayNum: 1 };
    const parts = selectedDate.split("-");
    const dayNum = parseInt(parts[2] || "1");
    const dateObj = new Date(currentYear, currentMonth - 1, dayNum);
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const dayWord = weekdays[dateObj.getDay()];
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    return { dayWord, isWeekend, dayNum };
  };

  const { dayWord, isWeekend, dayNum } = getSelectedDayDetails();

  // Load assignments whenever selected date changes
  useEffect(() => {
    if (!selectedDate) return;
    const stored = localStorage.getItem(`store_map_sim_${selectedDate}`);
    if (stored) {
      try {
        setAssignments(JSON.parse(stored));
      } catch (e) {
        console.error("Error loading simulation assignments", e);
        initializeDefaultAssignments();
      }
    } else {
      initializeDefaultAssignments();
    }
  }, [selectedDate, employees]);

  // Save operating hours when changed
  const handleOpenTimeChange = (val: string) => {
    setOpenTime(val);
    localStorage.setItem("store_open_time", val);
  };

  const handleCloseTimeChange = (val: string) => {
    setCloseTime(val);
    localStorage.setItem("store_close_time", val);
  };

  // Helper inside Component to match if employee is working on selected date & shift
  const getEmployeeWorkingSchedule = (emp: Employee): Schedule | null => {
    const sched = emp.schedules.find((s) => s.date === selectedDate);
    if (!sched) return null;

    const type = sched.type.trim();
    // Non-working Types
    if (!type || ["휴무", "월차", "지정휴무", "결근"].includes(type)) {
      return null;
    }

    // Filter by specific selected shift
    if (selectedShift !== "전체") {
      if (selectedShift === "오픈" && !(type.includes("오픈") || type.includes("오전"))) {
        return null;
      }
      if (selectedShift === "미들" && !type.includes("미들")) {
        return null;
      }
      if (selectedShift === "마감" && !(type.includes("마감") || type.includes("오후"))) {
        return null;
      }
    }

    return sched;
  };

  // Get list of active working employees & off-duty employees on selected day
  const activeWorkingStaff: { employee: Employee; schedule: Schedule }[] = [];
  const offDutyStaff: Employee[] = [];

  employees.forEach((emp) => {
    const sched = getEmployeeWorkingSchedule(emp);
    if (sched) {
      activeWorkingStaff.push({ employee: emp, schedule: sched });
    } else {
      offDutyStaff.push(emp);
    }
  });

  // Multi-assignment 대상 zone (여러명 배정 가능)
  const MULTI_ASSIGN_ZONES = new Set<number>([36, 42]);

  // Load display zone assignments from localStorage (ZONES_STORAGE_KEY)
  const loadDisplayZones = (): DisplayZoneSlim[] => {
    try {
      const raw = localStorage.getItem(ZONES_STORAGE_KEY);
      if (!raw) return ZONE_DEFS.map(d => ({
        id: String(d.num), num: d.num, label: d.label,
        category: d.category, section: d.section,
        assignedStaffId: null, assignedStaffName: "",
        status: "normal", products: ""
      }));
      return JSON.parse(raw) as DisplayZoneSlim[];
    } catch { return []; }
  };

  // Zone에 배정된 staff 목록 파싱 helper (multi-assign 대응 comma-separated name 목록 지원)
  // 이름 → employees prop에서 id 조회. 다중 배정 zone에서만 사용.
  const parseZoneStaffList = (dz: DisplayZoneSlim | undefined): { id: number | null; name: string }[] => {
    if (!dz) return [];
    const names = (dz.assignedStaffName || "").split(",").map(s => s.trim()).filter(Boolean);
    return names.map((name) => {
      const found = employees.find(e => e.name === name);
      return { id: found ? found.id : null, name };
    });
  };

  // DB에서 zone 정보 fetch → localStorage 및 state 동기화
  const fetchZonesFromDB = async () => {
    try {
      const res = await fetch("/api/zones");
      if (!res.ok) return;
      const rows: Array<{ zone_id: string; employee_id: number | null; employee_name: string; status: string; products: string }> = await res.json();
      if (!Array.isArray(rows)) return;
      const merged: DisplayZoneSlim[] = ZONE_DEFS.map((def) => {
        const row = rows.find((r) => r.zone_id === String(def.num));
        if (!row || !row.employee_name) {
          return {
            id: String(def.num), num: def.num, label: def.label,
            category: def.category, section: def.section,
            assignedStaffId: null, assignedStaffName: "",
            status: "normal", products: row?.products ?? "",
          };
        }
        // 다중 배정(comma-separated) 또는 단일 배정 검증
        const names = row.employee_name.split(",").map((s: string) => s.trim()).filter(Boolean);
        const validNames = names.filter((name: string) => employees.some(e => e.name === name));
        const validName = validNames.join(",");
        const firstEmployee = validNames.length > 0 ? employees.find(e => e.name === validNames[0]) : null;
        return {
          id: String(def.num), num: def.num, label: def.label,
          category: def.category, section: def.section,
          assignedStaffId: validNames.length > 0 ? (firstEmployee?.id ?? null) : null,
          assignedStaffName: validName,
          status: row.status ?? "normal",
          products: row.products ?? "",
        };
      });
      localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(merged));
      setDisplayZones(merged);
    } catch {
      setDisplayZones(loadDisplayZones());
    }
  };

  const persistZones = (updated: DisplayZoneSlim[]) => {
    localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(updated));
    setDisplayZones(updated);
    // DB와 동기화 (DisplayPage 마운트 시 localStorage 덮어쓰기 방지)
    fetch("/api/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zones: updated.map(z => ({
          zone_id: z.id,
          employee_id: z.assignedStaffId,
          employee_name: z.assignedStaffName,
          status: z.status,
          products: z.products,
        })),
      }),
    }).catch(() => {});
  };

  const saveZoneAssignment = (zoneNum: number, empId: number | null, empName: string) => {
    const current = loadDisplayZones();
    const isMulti = MULTI_ASSIGN_ZONES.has(zoneNum);
    const updated = current.map(z => {
      if (z.num !== zoneNum) return z;
      if (!isMulti) {
        return { ...z, assignedStaffId: empId, assignedStaffName: empName };
      }
      // 다중 배정: 기존 목록에 append (중복 제거)
      if (empId == null || !empName) {
        return { ...z, assignedStaffId: null, assignedStaffName: "" };
      }
      const existing = parseZoneStaffList(z);
      if (existing.some(e => e.id === empId || e.name === empName)) return z;
      const nextList = [...existing, { id: empId, name: empName }];
      return {
        ...z,
        // 다중 배정 zone은 이름을 comma-separated로 저장 (id 조회는 employees prop에서)
        assignedStaffId: nextList[0]?.id ?? null,
        assignedStaffName: nextList.map(e => e.name).join(","),
      };
    });
    persistZones(updated);
    setZoneVer(v => v + 1);
  };

  // Multi-assign zone에서 특정 인원만 해제
  const removeZoneStaffMember = (zoneNum: number, empId: number) => {
    const current = loadDisplayZones();
    const updated = current.map(z => {
      if (z.num !== zoneNum) return z;
      const existing = parseZoneStaffList(z).filter(e => e.id !== empId);
      if (existing.length === 0) {
        return { ...z, assignedStaffId: null, assignedStaffName: "" };
      }
      return {
        ...z,
        assignedStaffId: existing[0].id,
        assignedStaffName: existing.map(e => e.name).join(","),
      };
    });
    persistZones(updated);
    setZoneVer(v => v + 1);
  };

  // Sync displayZones state whenever zoneVer changes (fallback to localStorage)
  useEffect(() => {
    if (zoneVer === 0) return; // 초기값은 fetchZonesFromDB에서 처리
    setDisplayZones(loadDisplayZones());
  }, [zoneVer]);

  // 마운트 시 & selectedDate / employees 변경 시 DB에서 zone 정보 재조회
  // (매장 관리 메뉴 로딩 시 과거 배정직원 이름이 남는 문제 해결)
  useEffect(() => {
    fetchZonesFromDB();
  }, [selectedDate, employees.length]);

  // Zone drag-and-drop handlers (담당직원 배정용, 시뮬레이터 핸들러와는 별개)
  const handleZoneDragOver = (e: React.DragEvent, num: number) => {
    e.preventDefault();
    setDragOverZoneNum(num);
  };
  const handleZoneDragLeave = () => setDragOverZoneNum(null);
  const handleZoneDrop = (e: React.DragEvent, zoneNum: number) => {
    e.preventDefault();
    const empId = e.dataTransfer.getData("text/plain");
    if (!empId) { setDragOverZoneNum(null); return; }
    const emp = employees.find(e => String(e.id) === empId);
    if (!emp) { setDragOverZoneNum(null); return; }
    saveZoneAssignment(zoneNum, emp.id, emp.name);
    setDragOverZoneNum(null);
  };
  const handleZoneUnassign = (zoneNum: number) => saveZoneAssignment(zoneNum, null, "");

  // Default distribution initializer based on roles
  const initializeDefaultAssignments = () => {
    const defaultAssigns: Record<string, string> = {};
    const shopStaff: Employee[] = [];

    employees.forEach((emp) => {
      const sched = getEmployeeWorkingSchedule(emp);
      if (sched) {
        const pos = emp.position;
        const workplace = emp.workplace || "매장";

        if (workplace === "창고") {
          defaultAssigns[String(emp.id)] = "slot_warehouse";
        } else if (pos.includes("약사")) {
          defaultAssigns[String(emp.id)] = "slot_pharmacy";
        } else if (pos.includes("캐셔")) {
          defaultAssigns[String(emp.id)] = "slot_counter";
        } else {
          shopStaff.push(emp);
        }
      }
    });

    // Round-robin distribution of floor staff to relevant slots
    const shopSlots = [
      "slot_event1",
      "slot_event2",
      "slot_event3",
      "slot_best_set",
      "slot_expiring",
      "slot_bulk",
      "slot_aisles"
    ];

    shopStaff.forEach((emp, index) => {
      const slot = shopSlots[index % shopSlots.length];
      defaultAssigns[String(emp.id)] = slot;
    });

    setAssignments(defaultAssigns);
    if (selectedDate) {
      localStorage.setItem(`store_map_sim_${selectedDate}`, JSON.stringify(defaultAssigns));
    }
  };

  // Manual save function helper
  const saveAssignments = (newAssigns: Record<string, string>) => {
    setAssignments(newAssigns);
    if (selectedDate) {
      localStorage.setItem(`store_map_sim_${selectedDate}`, JSON.stringify(newAssigns));
    }
  };

  // Reset to auto algorithm distribution
  const handleResetToAuto = () => {
    initializeDefaultAssignments();
  };

  // Reset/Clear all assignments to make everyone unallocated pool
  const handleClearAllAssignments = () => {
    const cleared: Record<string, string> = {};
    activeWorkingStaff.forEach((item) => {
      cleared[String(item.employee.id)] = "unassigned";
    });
    saveAssignments(cleared);
  };

  // Drag and Drop operation handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, zoneId: string) => {
    e.preventDefault();
    if (dragOverZone !== zoneId) {
      setDragOverZone(zoneId);
    }
  };

  const handleDragLeave = () => {
    setDragOverZone(null);
  };

  const handleDrop = (e: React.DragEvent, zoneId: string) => {
    e.preventDefault();
    const empId = e.dataTransfer.getData("text/plain");
    if (empId) {
      const updated = {
        ...assignments,
        [empId]: zoneId
      };
      saveAssignments(updated);
    }
    setDragOverZone(null);
  };

  // Remove single assignment
  const handleUnassign = (empId: string) => {
    const updated = {
      ...assignments,
      [empId]: "unassigned"
    };
    saveAssignments(updated);
  };

  // 2026-07-20: 14회 반복 filter → 1회 groupBy 로 병목 완화 (useMemo · 재계산 최소화)
  //   assignments 또는 activeWorkingStaff 가 바뀔 때만 재계산
  const staffByZone = useMemo(() => {
    const groups: Record<string, typeof activeWorkingStaff> = {};
    for (const item of activeWorkingStaff) {
      const zoneId = assignments[String(item.employee.id)] ?? "unassigned";
      if (!groups[zoneId]) groups[zoneId] = [];
      groups[zoneId].push(item);
    }
    return groups;
  }, [activeWorkingStaff, assignments]);
  const getStaffInZone = useCallback((zoneId: string) => staffByZone[zoneId] ?? [], [staffByZone]);

  // Categorized personnel list in current zone model
  const expiringStaff = getStaffInZone("slot_expiring");
  const mainAisleStaff = getStaffInZone("slot_aisles");
  const bulkConsultStaff = getStaffInZone("slot_bulk");
  const bestSetStaff = getStaffInZone("slot_best_set");
  const event1Staff = getStaffInZone("slot_event1");
  const event2Staff = getStaffInZone("slot_event2");
  const event3Staff = getStaffInZone("slot_event3");
  const pharmacists = getStaffInZone("slot_pharmacy");
  const cashiers = getStaffInZone("slot_counter");
  const warehouseStaff = getStaffInZone("slot_warehouse");
  const drinkStaff = getStaffInZone("slot_drink");
  const breakroomStaff = getStaffInZone("slot_breakroom");
  const lockerStaff = getStaffInZone("slot_lockers");
  const cartStaff = getStaffInZone("slot_cart");

  // Unplaced personnel pool
  const unassignedStaff = activeWorkingStaff.filter((item) => {
    const zone = assignments[String(item.employee.id)];
    return !zone || zone === "unassigned";
  });

  // Calculate search matching lists
  const matchedActiveStaff = activeWorkingStaff
    .filter((item) =>
      sidebarPositionFilter === "전체" || item.employee.position.includes(sidebarPositionFilter)
    )
    .filter((item) =>
      item.employee.name.toLowerCase().includes(staffSearchQuery.toLowerCase()) ||
      item.employee.position.toLowerCase().includes(staffSearchQuery.toLowerCase())
    );

  const matchedOffStaff = offDutyStaff.filter((emp) =>
    emp.name.toLowerCase().includes(staffSearchQuery.toLowerCase()) ||
    emp.position.toLowerCase().includes(staffSearchQuery.toLowerCase())
  );

  // Badge styles according to schedule type
  const getBadgeStyle = (type: string) => {
    if (type.includes("오픈") || type.includes("오전")) return "bg-amber-100 text-amber-900 border-amber-300";
    if (type.includes("미들")) return "bg-sky-100 text-sky-900 border-sky-300";
    if (type.includes("마감") || type.includes("오후")) return "bg-emerald-100 text-emerald-900 border-emerald-300";
    return "bg-slate-100 text-slate-800 border-slate-300";
  };

  // Hours requested: 10:00 to 20:00 (10 ~ 20)
  const hoursTimeline = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  const getStaffForHour = (hour: number) => {
    return activeWorkingStaff.filter((item) => {
      const sched = item.schedule;
      if (!sched) return false;

      // Check working hours like "09:30-18:30"
      if (sched.workingHours && sched.workingHours.includes("-")) {
        const parts = sched.workingHours.split("-");
        const parseTimeToDecimal = (timeStr: string) => {
          const match = timeStr.trim().match(/(\d+):(\d+)/);
          if (match) {
            return parseInt(match[1]) + parseInt(match[2]) / 60;
          }
          const hourOnly = parseInt(timeStr.trim());
          if (!isNaN(hourOnly)) return hourOnly;
          return -1;
        };
        const startVal = parseTimeToDecimal(parts[0]);
        const endVal = parseTimeToDecimal(parts[1]);

        if (startVal !== -1 && endVal !== -1) {
          return hour >= Math.floor(startVal) && hour < Math.ceil(endVal);
        }
      }

      // Default fallback based on type string if workingHours parsing isn't applicable
      const type = sched.type || "";
      const parseTimeToDecimal = (timeStr: string) => {
        const match = timeStr.trim().match(/(\d+):(\d+)/);
        if (match) {
          return parseInt(match[1]) + parseInt(match[2]) / 60;
        }
        const hourOnly = parseInt(timeStr.trim());
        if (!isNaN(hourOnly)) return hourOnly;
        return -1;
      };

      if (type.includes("오픈") || type.includes("오전")) {
        const parts = openShiftHour.split("-");
        const startVal = parseTimeToDecimal(parts[0] || "09:30");
        const endVal = parseTimeToDecimal(parts[1] || "18:30");
        return startVal !== -1 && endVal !== -1
          ? hour >= Math.floor(startVal) && hour < Math.ceil(endVal)
          : hour >= 9 && hour <= 18;
      }
      if (type.includes("미들")) {
        const parts = middleShiftHour.split("-");
        const startVal = parseTimeToDecimal(parts[0] || "11:00");
        const endVal = parseTimeToDecimal(parts[1] || "20:00");
        return startVal !== -1 && endVal !== -1
          ? hour >= Math.floor(startVal) && hour < Math.ceil(endVal)
          : hour >= 11 && hour <= 20;
      }
      if (type.includes("마감") || type.includes("오후")) {
        const parts = closeShiftHour.split("-");
        const startVal = parseTimeToDecimal(parts[0] || "13:00");
        const endVal = parseTimeToDecimal(parts[1] || "22:00");
        return startVal !== -1 && endVal !== -1
          ? hour >= Math.floor(startVal) && hour < Math.ceil(endVal)
          : hour >= 13 && hour <= 22;
      }

      return hour >= 10 && hour <= 19; // standard default fallback
    });
  };

  // Text colors based on shifts
  const shiftColors: Record<string, string> = {
    전체: "bg-slate-900 text-white",
    오픈: "bg-amber-500 text-white shadow-xs shadow-amber-500/20",
    미들: "bg-sky-500 text-white shadow-xs shadow-sky-500/20",
    마감: "bg-emerald-500 text-white shadow-xs shadow-emerald-500/20"
  };

  const formatWithKoreanWeekday = (dateStr: string) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    return `${parseInt(m)}월 ${parseInt(d)}일 (${weekdays[dateObj.getDay()]})`;
  };

  const handleShiftDate = (direction: "prev" | "next") => {
    const parts = selectedDate.split("-");
    if (parts.length < 3) return;
    const currentDay = parseInt(parts[2]);
    let targetDay = currentDay;

    if (direction === "prev" && currentDay > 1) {
      targetDay--;
    } else if (direction === "next" && currentDay < daysList.length) {
      targetDay++;
    }

    const monthStr = String(currentMonth).padStart(2, "0");
    const dayStr = String(targetDay).padStart(2, "0");
    setSelectedDate(`${currentYear}-${monthStr}-${dayStr}`);
  };

  // Helper renderer for staff tokens placed inside floor slots
  const renderPlacedStaffTags = (staffList: typeof activeWorkingStaff) => {
    return (
      <div className="flex flex-wrap gap-1 mt-1 w-full">
        {staffList.map((item) => (
          <div
            key={`placed-tag-${item.employee.id}`}
            draggable
            onDragStart={(e) => handleDragStart(e, String(item.employee.id))}
            className={`px-1.5 py-0.5 border rounded-lg text-[11px] font-black inline-flex items-center gap-1 shadow-3xs cursor-grab active:cursor-grabbing hover:scale-102 hover:border-blue-500 transition-transform ${getBadgeStyle(item.schedule.type)}`}
            title={`드래그하여 이동 가능 / ${item.employee.position} / ${item.schedule.type}`}
          >
            <span>{item.employee.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUnassign(String(item.employee.id));
              }}
              className="text-[10px] font-extrabold hover:text-red-600 rounded px-0.5 transition"
              title="배치 빼기"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div id="store-map-dashboard" className="flex flex-col gap-4 animate-in fade-in duration-300">

      {/* 1. Date & Operating Hours control panel */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col gap-4">

        {/* Title, Shift pills & Operational hours selection */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <Activity size={18} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                매장맵 배치 및 스케줄 시뮬레이터 🗺️
              </h3>
              <p className="text-[12px] text-slate-500 font-semibold mt-0.5">
                {formatWithKoreanWeekday(selectedDate)}
                <span className="mx-2 text-slate-300">|</span>
                출역 직원을 드래그 앤 드롭으로 맵에 직접 매치하여 오늘의 진열 배치를 자유롭게 시뮬레이션하십시오.
              </p>
            </div>
          </div>

          {/* Controls Area */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Shift filter */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-0.5">
              {(["전체", "오픈", "미들", "마감"] as const).map((shift) => (
                <button
                  key={`shift-pill-${shift}`}
                  onClick={() => setSelectedShift(shift)}
                  className={`px-2.5 py-1 text-[12px] font-bold rounded-lg cursor-pointer transition ${
                    selectedShift === shift
                      ? shiftColors[shift]
                      : "text-slate-600 hover:text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  {shift === "전체" && "전체 👥"}
                  {shift === "오픈" && "오픈 ☀️"}
                  {shift === "미들" && "미들 ⛅"}
                  {shift === "마감" && "마감 🌙"}
                </button>
              ))}
            </div>

            {/* Operating business hours */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1 px-2.5 rounded-xl text-xs font-semibold">
              <Clock size={13} className="text-blue-500" />
              <span className="text-slate-600">영업 시간:</span>
              <select
                value={openTime}
                onChange={(e) => handleOpenTimeChange(e.target.value)}
                className="bg-white border border-slate-200 p-0.5 rounded text-[12px] font-extrabold text-slate-705 cursor-pointer focus:outline-none"
              >
                {Array.from({ length: 7 }, (_, i) => `${String(6 + i).padStart(2, "0")}:00`).map((t) => (
                  <option key={`open-${t}`} value={t}>{t} 오픈</option>
                ))}
              </select>
              <span className="text-slate-450 text-slate-400">~</span>
              <select
                value={closeTime}
                onChange={(e) => handleCloseTimeChange(e.target.value)}
                className="bg-white border border-slate-200 p-0.5 rounded text-[12px] font-extrabold text-slate-705 cursor-pointer focus:outline-none"
              >
                {Array.from({ length: 7 }, (_, i) => `${String(18 + i).padStart(2, "0")}:00`).map((t) => (
                  <option key={`close-${t}`} value={t}>{t} 마감</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Date Selector Wrap Panel - shows all days of the month at once */}
        <div className="border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <span>📅 {currentMonth}월 전체 시뮬레이션 일자 선택기 (한 달 전체 날짜가 한 눈에 표시됩니다)</span>
              <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-bold">원클릭 실시간 전환</span>
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => handleShiftDate("prev")}
                className="p-1 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 transition cursor-pointer shrink-0"
                title="이전 날짜로 이동"
              >
                ◀ 이전 일
              </button>
              <button
                onClick={() => handleShiftDate("next")}
                className="p-1 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 transition cursor-pointer shrink-0"
                title="다음 날짜로 이동"
              >
                다음 일 ▶
              </button>
            </div>
          </div>

          <div
            ref={dateScrollRef}
            className="flex flex-wrap gap-1 select-none w-full"
          >
            {daysList.map((day) => {
              const { dayWord: dStr, colorClass, fullDate } = getDayDetails(day);
              const isSelected = selectedDate === fullDate;

              // Count total scheduled active crew counts on this day filter
              const count = employees.filter(emp => {
                const s = emp.schedules.find(sc => sc.date === fullDate);
                if (!s) return false;
                const type = s.type.trim();
                if (!type || ["휴무", "월차", "지정휴무", "결근"].includes(type)) return false;
                if (selectedShift !== "전체") {
                  if (selectedShift === "오픈" && !(type.includes("오픈") || type.includes("오전"))) return false;
                  if (selectedShift === "미들" && !type.includes("미들")) return false;
                  if (selectedShift === "마감" && !(type.includes("마감") || type.includes("오후"))) return false;
                }
                return true;
              }).length;

              return (
                <button
                  key={`map-date-${day}`}
                  data-active={isSelected}
                  onClick={() => setSelectedDate(fullDate)}
                  className={`flex flex-col items-center justify-between p-1 md:py-1.5 md:px-2 rounded-xl border transition min-w-[42px] md:min-w-[48px] h-13 md:h-14 cursor-pointer text-center relative flex-1 ${
                    isSelected
                      ? "bg-slate-900 border-slate-900 text-white shadow-sm scale-102 z-10"
                      : "bg-white border-slate-200 hover:border-slate-300 text-slate-800"
                  }`}
                >
                  <span className={`text-[8px] md:text-[10px] font-extrabold uppercase tracking-wider leading-none ${
                    isSelected ? "text-amber-300" : colorClass.split(" ")[0]
                  }`}>
                    {dStr}
                  </span>
                  <span className="text-xs md:text-sm font-black leading-none my-0.5">
                    {day}
                  </span>

                  <span className={`text-[8px] font-black px-1 py-0.2 rounded mt-0.5 ${
                    isSelected
                      ? "bg-blue-600 text-white"
                      : count > 0
                        ? "bg-blue-50 text-blue-800 border border-blue-100"
                        : "bg-slate-100 text-slate-400"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Primary Showcase: Two-Column Dashboard Layout (Map Area vs Stats/Staff Sidebar) */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-stretch">

        {/* LEFT SIDEBAR: Interactive Roster Tab & Tools panel (1/4 width) */}
        <div className="xl:col-span-1 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col gap-3">

          {/* Quick Stats overview panel */}
          <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-1.5">
            <span className="text-[11px] uppercase font-extrabold text-blue-600 tracking-wider flex items-center gap-1">
              <span>📋 시뮬레이션 지표</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            </span>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-bold">출근 ({activeWorkingStaff.length}명) 중 배치</span>
              <span className="text-xs font-black text-slate-800 bg-white border px-1.5 py-0.2 rounded shadow-3xs">
                {activeWorkingStaff.length - unassignedStaff.length} / {activeWorkingStaff.length} 명
              </span>
            </div>
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${activeWorkingStaff.length ? ((activeWorkingStaff.length - unassignedStaff.length) / activeWorkingStaff.length) * 100 : 0}%` }}
              ></div>
            </div>
          </div>

          {/* Tab buttons */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setSidebarTab("active")}
              className={`flex-1 pb-2 text-xs font-extrabold text-center transition-colors border-b-2 ${
                sidebarTab === "active"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              출근 직원 ({activeWorkingStaff.length}명)
            </button>
            <button
              onClick={() => setSidebarTab("off")}
              className={`flex-1 pb-2 text-xs font-extrabold text-center transition-colors border-b-2 ${
                sidebarTab === "off"
                  ? "border-rose-500 text-rose-500"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              휴무 직원 ({offDutyStaff.length}명)
            </button>
          </div>

          {/* Shift filter pills (오늘 출근인원 아래) */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-0.5">
            {(["전체", "오픈", "미들", "마감"] as const).map((shift) => (
              <button
                key={`sidebar-shift-${shift}`}
                onClick={() => setSelectedShift(shift)}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg cursor-pointer transition ${
                  selectedShift === shift
                    ? shiftColors[shift]
                    : "text-slate-600 hover:text-slate-800 hover:bg-slate-200"
                }`}
              >
                {shift === "전체" && "전체"}
                {shift === "오픈" && "☀️ 오픈"}
                {shift === "미들" && "⛅ 미들"}
                {shift === "마감" && "🌙 마감"}
              </button>
            ))}
          </div>

          {/* Position filter pills */}
          <div className="flex gap-1">
            {(["전체", "약사", "물류", "캐셔"] as const).map((pos) => (
              <button
                key={`pos-filter-${pos}`}
                onClick={() => setSidebarPositionFilter(pos)}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg cursor-pointer transition border ${
                  sidebarPositionFilter === pos
                    ? pos === "전체"
                      ? "bg-slate-800 text-white border-slate-800"
                      : pos === "약사"
                      ? "bg-violet-600 text-white border-violet-600"
                      : pos === "물류"
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-teal-500 text-white border-teal-500"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {pos === "전체" && "전체"}
                {pos === "약사" && "💊 약사"}
                {pos === "물류" && "📦 물류"}
                {pos === "캐셔" && "💳 캐셔"}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative">
            <input
              type="text"
              placeholder="이름 또는 직급 검색..."
              value={staffSearchQuery}
              onChange={(e) => setStaffSearchQuery(e.target.value)}
              className="w-full text-xs font-semibold p-2 pl-3 border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:border-blue-500 placeholder-slate-400"
            />
          </div>

          {/* Tab Content Box */}
          {sidebarTab === "active" ? (
            <div
              className="flex-1 flex flex-col gap-2.5 min-h-[300px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, "unassigned")}
            >
              {/* Drag tips info banner */}
              <div className="p-2.5 bg-blue-50/60 border border-blue-150 rounded-xl text-[12px] text-blue-800 font-semibold leading-relaxed flex gap-1.5">
                <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
                <p>
                  이름을 <strong>직접 드래그</strong>하여 오른쪽 맵 배치도의 구역 안에 넣어 배치하거나, 맵에 끌어올려 이동하세요.<br />
                  여기로 끌어 놓으면 <strong>배치가 회수(미지정)</strong>처리 됩니다.
                </p>
              </div>

              {/* Roster Listing */}
              <div className="flex-1 space-y-2 w-full">
                {matchedActiveStaff.length > 0 ? (
                  matchedActiveStaff.map((item) => {
                    const zoneId = assignments[String(item.employee.id)];
                    const isPlaced = zoneId && zoneId !== "unassigned";

                    // Map zone label
                    let zoneLabel = "미배치 Pool 📦";
                    if (isPlaced) {
                      if (zoneId === "slot_expiring") zoneLabel = "임박존 ⚠️";
                      else if (zoneId === "slot_aisles") zoneLabel = "중앙진열 🛒";
                      else if (zoneId === "slot_cart") zoneLabel = "카트존 🛒";
                      else if (zoneId === "slot_bulk") zoneLabel = "대량상담 👥";
                      else if (zoneId === "slot_counter") zoneLabel = "메인POS 💳";
                      else if (zoneId === "slot_best_set") zoneLabel = "베스트세트 🧬";
                      else if (zoneId === "slot_event1") zoneLabel = "이벤트1 🎈";
                      else if (zoneId === "slot_event2") zoneLabel = "이벤트2 🎈";
                      else if (zoneId === "slot_event3") zoneLabel = "이벤트3 🎈";
                      else if (zoneId === "slot_pharmacy") zoneLabel = "약국진열 💊";
                      else if (zoneId === "slot_drink") zoneLabel = "완제음료 🥤";
                      else if (zoneId === "slot_breakroom") zoneLabel = "임시휴식 ☕";
                      else if (zoneId === "slot_warehouse") zoneLabel = "물류창고 📦";
                      else if (zoneId === "slot_lockers") zoneLabel = "사물함 🗄️";
                    }

                    return (
                      <div
                        key={`tab-staff-${item.employee.id}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, String(item.employee.id))}
                        className={`p-2.5 rounded-xl border flex items-center justify-between transition cursor-grab active:cursor-grabbing hover:shadow-xs hover:border-slate-350 bg-white ${
                          isPlaced ? "border-slate-200" : "border-slate-300 ring-2 ring-blue-500/10"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">
                            {item.employee.position.includes("약사") ? "🧑‍⚕️" : item.employee.position.includes("캐셔") ? "🧑‍💼" : "👤"}
                          </span>
                          <div>
                            <span className="text-xs font-black text-slate-800 block leading-tight">{item.employee.name}</span>
                            <span className="text-[10px] text-slate-400 font-bold block mt-0.5">{item.employee.position} ({item.schedule.type})</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                            isPlaced ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-800"
                          }`}>
                            {zoneLabel}
                          </span>
                          {isPlaced && (
                            <button
                              onClick={() => handleUnassign(String(item.employee.id))}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-lg"
                              title="배치 해제"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-xs text-slate-400 font-semibold">
                    검색 결과와 호환되는 출근 직원이 없습니다.
                  </div>
                )}
              </div>

              {/* Roster Controls Action Panel */}
              <div className="border-t border-slate-150 pt-2.5 flex gap-2">
                <button
                  onClick={handleResetToAuto}
                  className="flex-1 text-[11px] font-black p-2 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                  title="초기 역할별 자동 배정 알고리즘 작동"
                >
                  <RotateCcw size={11} />
                  자동 배치 초기화
                </button>
                <button
                  onClick={handleClearAllAssignments}
                  className="flex-1 text-[11px] font-black p-2 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                  title="전체 직원을 배치 대기 상태로 회수"
                >
                  <Trash2 size={11} />
                  전체 배치 해제
                </button>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-2.5 min-h-[300px]">
              <div className="p-2.5 bg-rose-50/50 border border-rose-150 rounded-xl text-[12px] text-rose-800 font-semibold flex gap-1.5">
                <Coffee size={14} className="text-rose-500 shrink-0 mt-0.5" />
                <p>금일 공식 스케줄 상 '휴무', '월차', '지정휴무' 및 '결근' 처리되어 현장 배치에서 제외된 휴식 인원입니다.</p>
              </div>

              {/* Off Duty Listing */}
              <div className="flex-1 space-y-2 w-full">
                {matchedOffStaff.length > 0 ? (
                  matchedOffStaff.map((emp) => {
                    const labelSched = emp.schedules.find(s => s.date === selectedDate);
                    const offType = labelSched?.type || "오프";

                    return (
                      <div
                        key={`tab-off-staff-${emp.id}`}
                        className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between opacity-80"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-xs">💤</span>
                          <div>
                            <span className="text-xs font-black text-slate-800 leading-tight">{emp.name}</span>
                            <span className="text-[10px] text-slate-400 font-bold block mt-0.5">{emp.position}</span>
                          </div>
                        </div>

                        <span className="text-[11px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100">
                          {offType}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex items-center justify-center text-center p-8">
                    <span className="text-xs text-slate-400 font-semibold leading-relaxed">
                      이 날은 공식 휴무자가 없습니다.<br />전원이 정상 출역하였습니다!
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* RIGHT SIDEBAR: Beautiful 2D Floor Plan Blueprint (3/4 width) */}
        <div className="xl:col-span-3 bg-slate-100/50 rounded-2xl border border-slate-200 p-4 md:p-5 flex flex-col justify-between shadow-sm relative overflow-hidden min-h-[660px]">

          {/* Interactive Zoom Level Selection for full responsiveness */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3 bg-white border border-slate-200 p-2.5 rounded-xl z-20 relative shadow-3xs">
            <div className="flex items-center gap-1.5 text-left">
              <span className="text-[11px] md:text-xs font-black text-slate-800 flex items-center gap-1">
                <span>🏬 2D 매장 실무 배치도 (ㄱ자 구조)</span>
              </span>
              <span className="text-[8px] md:text-[10px] bg-blue-50 border border-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black hidden xs:inline-block shadow-3xs animate-pulse">
                시뮬레이션 작동 중
              </span>
            </div>
            
            {/* Quick Zoom Controller for mobile/tablet responsiveness */}
            <div className="flex items-center gap-1 w-full sm:w-auto justify-end">
              <span className="text-[10px] font-black text-slate-500 hidden md:inline">화면 크기 맞춤 (반응형 줌):</span>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 shadow-inner flex-wrap justify-end gap-0.5">
                {[
                  { label: "📱 모바일 (0.5x)", val: 0.5 },
                  { label: "📟 태블릿 (0.75x)", val: 0.75 },
                  { label: "🖥️ 중형화면 (0.9x)", val: 0.9 },
                  { label: "📏 원본크기 (1.0x)", val: 1.0 }
                ].map((zm) => (
                  <button
                    key={`zoom-${zm.val}`}
                    type="button"
                    onClick={() => setZoomLevel(zm.val)}
                    className={`px-1.5 py-1 text-[10px] font-extrabold rounded-md transition cursor-pointer ${
                      zoomLevel === zm.val
                        ? "bg-slate-900 text-white shadow-3xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white"
                    }`}
                  >
                    {zm.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Blueprint Canvas Container with graph pattern background */}
          <div className="flex-1 flex flex-col gap-4 relative z-10 w-full overflow-x-auto">

            {/* The Unified Store Map Layout (Inverted L-shape floor plan) */}
            <div
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: "top left",
                width: `${100 / zoomLevel}%`,
                transition: "transform 0.15s ease-out, width 0.15s ease-out",
              }}
              className="min-w-[850px] p-6 bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[size:20px_20px] bg-[#f8fafc] border border-slate-350 rounded-xl shadow-inner flex flex-col gap-4"
            >

              {/* ========================================================================== */}
              {/* SECTION 1: TOP HORIZONTAL BAND (Shelving aisles spanning across most of width  */}
              {/* + tiny corner block at far right for elevator/stairs)                          */}
              {/* Mirrors map.png: a long horizontal shelving wing with a small corner annex.    */}
              {/* ========================================================================== */}
              <div className="grid grid-cols-16 gap-3">

                {/* 1A. 매장 메인 진열대 가로라인 (Long horizontal shelf wing — spans 14/16 cols) */}
                <div className="col-span-16 xl:col-span-14 bg-white border-4 border-blue-600 rounded-2xl p-3.5 flex flex-col shadow-md relative min-h-[170px]">

                  {/* Floating ㄱ-자 Section Badge */}
                  <div className="absolute -top-3 left-4 bg-blue-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm z-20 flex items-center gap-1">
                    <span>🏬 [ㄱ자 매장실내] 가로 매대 라인</span>
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                  </div>

                  {/* Header Row */}
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-blue-500 text-xs">🏬</span>
                      <span className="text-xs font-black text-slate-900">매장 진열대 및 통로정리구역 (Aisles & Shelves)</span>
                    </div>

                    {/* Integrated: 유통기한 임박존 banner and drop zone inside top row */}
                    <div
                      onDragOver={(e) => handleDragOver(e, "slot_expiring")}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, "slot_expiring")}
                      className={`p-1.5 rounded-xl transition border border-dashed flex items-center gap-1.5 mx-2 cursor-pointer ${
                        dragOverZone === "slot_expiring"
                          ? "bg-orange-100 border-orange-500 scale-[1.01] z-20"
                          : "bg-orange-50/40 border-orange-200"
                      }`}
                    >
                      <span className="text-amber-600 text-[12px] font-bold">⚠️ 임박존</span>
                      <div className="flex items-center gap-1">
                        {expiringStaff.length > 0 ? (
                          renderPlacedStaffTags(expiringStaff)
                        ) : (
                          <span className="text-[8px] text-orange-500 font-bold bg-white px-1.5 rounded py-0.5">배치 대기</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 구역별 담당직원 배정 타일 (ZONE_DEFS 기반, ZONES_STORAGE_KEY 연동) */}
                  <div className="space-y-2 mb-2">
                    {(["top_wall", "aisle", "bottom_wall", "wing", "event"] as const).map((section) => {
                      const sectionZones = ZONE_DEFS.filter(z => z.section === section);
                      if (sectionZones.length === 0) return null;
                      const sectionLabel = SECTION_LABEL[section];
                      return (
                        <div key={section}>
                          <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 px-0.5">
                            {sectionLabel}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {sectionZones.map((zoneDef) => {
                              const dz = displayZones.find(z => z.num === zoneDef.num);
                              const isMulti = MULTI_ASSIGN_ZONES.has(zoneDef.num);
                              const staffList = isMulti ? parseZoneStaffList(dz) : [];
                              const isAssigned = isMulti ? staffList.length > 0 : !!(dz?.assignedStaffId);
                              const isDragTarget = dragOverZoneNum === zoneDef.num;

                              // 42(이벤트존)/36(프로모션) 은 카운터(메인 POS)와 세로 길이를 맞춰 확장
                              const wideClass = isMulti ? "flex-1 basis-full min-w-full min-h-[280px]" : "min-w-[36px]";

                              return (
                                <div
                                  key={zoneDef.num}
                                  onDragOver={(e) => handleZoneDragOver(e, zoneDef.num)}
                                  onDragLeave={handleZoneDragLeave}
                                  onDrop={(e) => handleZoneDrop(e, zoneDef.num)}
                                  className={`relative flex ${isMulti ? "flex-row items-center gap-1.5 p-1.5" : "flex-col items-center justify-between p-1"} rounded border transition-all ${wideClass} ${
                                    isDragTarget
                                      ? "bg-violet-100 border-violet-500 scale-[1.02] z-10 shadow-sm"
                                      : isAssigned
                                        ? "bg-violet-50 border-violet-300"
                                        : "bg-white border-slate-200 hover:border-violet-300 hover:bg-violet-50/40"
                                  }`}
                                  title={`${zoneDef.num}번 - ${zoneDef.category}${isMulti ? " (다중배정 가능)" : ""}`}
                                >
                                  {isMulti ? (
                                    <>
                                      <div className="flex flex-col items-center shrink-0 border-r border-slate-200 pr-1.5 min-w-[42px]">
                                        <span className={`text-[10px] font-black leading-none ${isAssigned ? "text-violet-700" : "text-slate-500"}`}>
                                          {zoneDef.num}
                                        </span>
                                        <span className={`text-[7px] leading-none mt-0.5 text-center ${isAssigned ? "text-violet-600" : "text-slate-400"}`}>
                                          {zoneDef.label}
                                        </span>
                                      </div>
                                      <div className="flex-1 flex flex-wrap items-center gap-1">
                                        {staffList.length > 0 ? (
                                          staffList.map((s, idx) => (
                                            <div
                                              key={`multi-${zoneDef.num}-${s.id ?? idx}-${s.name}`}
                                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white border border-violet-300 rounded text-[10px] font-black text-violet-700 shadow-3xs"
                                            >
                                              <span>{s.name}</span>
                                              {s.id != null && (
                                                <button
                                                  type="button"
                                                  onClick={(e) => { e.stopPropagation(); removeZoneStaffMember(zoneDef.num, s.id!); }}
                                                  className="text-[8px] font-black text-rose-500 hover:text-rose-700 ml-0.5 cursor-pointer"
                                                  title={`${s.name} 담당 해제`}
                                                >
                                                  ✕
                                                </button>
                                              )}
                                            </div>
                                          ))
                                        ) : (
                                          <span className="text-[8px] text-slate-400 italic">여기에 드래그하여 여러 명 배정 가능</span>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <span className={`text-[10px] font-black leading-none ${isAssigned ? "text-violet-700" : "text-slate-500"}`}>
                                        {zoneDef.num}
                                      </span>
                                      <span className={`text-[7px] leading-none mt-0.5 text-center ${isAssigned ? "text-violet-600" : "text-slate-300"}`}>
                                        {dz?.assignedStaffName
                                          ? dz.assignedStaffName.length > 3
                                            ? dz.assignedStaffName.slice(0, 3)
                                            : dz.assignedStaffName
                                          : "·"}
                                      </span>
                                      {isAssigned && (
                                        <button
                                          type="button"
                                          onClick={() => handleZoneUnassign(zoneDef.num)}
                                          className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-400 hover:bg-rose-600 text-white rounded-full text-[7px] font-black flex items-center justify-center transition cursor-pointer z-10"
                                          title="담당 해제"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Drop zone for aisles staff (the wide aisle/walkway underneath the shelves) */}
                  <div
                    onDragOver={(e) => handleDragOver(e, "slot_aisles")}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, "slot_aisles")}
                    className={`flex-1 p-2 border-2 border-dashed rounded-xl flex flex-col justify-center transition ${
                      dragOverZone === "slot_aisles"
                        ? "bg-blue-100 border-blue-500 scale-102"
                        : "bg-slate-50/50 border-slate-220 hover:border-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-slate-500 font-bold block">🏬 중앙통로/진열대 전담 배치</span>
                      <span className="text-[8px] text-slate-400">총 {mainAisleStaff.length}명 배치됨</span>
                    </div>

                    {mainAisleStaff.length > 0 ? (
                      renderPlacedStaffTags(mainAisleStaff)
                    ) : (
                      <span className="text-[10px] text-slate-400 italic text-center py-1">여기에 드래그하여 중앙 진열대 담당을 지정하세요.</span>
                    )}
                  </div>

                </div>

                {/* 1B. 우상단 코너: 엘리베이터 / 계단실 (Tiny corner block — spans 2/16 cols) */}
                <div className="col-span-16 xl:col-span-2 bg-white border-4 border-blue-600 rounded-2xl p-2 flex flex-col justify-between shadow-md relative min-h-[170px]">

                  {/* Floating Corner Badge */}
                  <div className="absolute -top-3 left-2 bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm z-20 flex items-center gap-1">
                    <span>📍 코너</span>
                  </div>

                  <div className="border-b border-indigo-100 pb-1 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-extrabold text-indigo-950 flex items-center gap-1">
                      🛗 엘베
                    </span>
                    <span className="text-[7px] text-slate-400 font-bold mt-0.5">2층 연결</span>
                  </div>

                  {/* Compact vertical stack: EV / Stairs icons */}
                  <div className="grid grid-cols-1 gap-1 my-1 flex-1">
                    <div className="bg-slate-50 px-1 py-1 border rounded flex items-center justify-center shadow-3xs text-[11px] font-bold text-slate-500">
                      🛗
                    </div>
                    <div className="bg-slate-50 px-1 py-1 border rounded flex items-center justify-center shadow-3xs text-[11px] font-bold text-slate-500">
                      ↗️
                    </div>
                  </div>

                  {/* No drop zone here — tiny corner is just an annotation */}
                  <div className="text-[7px] text-slate-400 font-extrabold text-center border-t border-slate-100 pt-1">엘베/계단</div>

                </div>

              </div>

              {/* ========================================================================== */}
              {/* SECTION 2: BODY — Open floor on left + Vertical Wing on right                 */}
              {/* Matches map.png: a large open simulation/floor area occupies the bottom-left   */}
              {/* "ㄱ-자" interior, while the right vertical wing stacks: 메인카운터(blue) ▼      */}
              {/* 약국(orange) ▼ 카트(bottom). Right wing is narrower (4/16) like in the map.    */}
              {/* ========================================================================== */}
              <div className="grid grid-cols-16 gap-3 items-stretch">

                {/* Left Side: Open floor / Simulation console (the empty ㄱ inner corner) */}
                <div className="col-span-16 xl:col-span-6 bg-white/95 border border-slate-300 rounded-2xl p-4 flex flex-col justify-start shadow-sm relative overflow-hidden gap-3">
                  
                  {/* Real-time map guidance banner */}
                  <div className="p-3 bg-blue-50/65 border border-blue-150 rounded-xl">
                    <span className="text-[11px] uppercase font-extrabold text-blue-600 tracking-wider flex items-center gap-1.5">
                      <span>💡 실제 소매 매장 동선 설계 (ㄱ자 구조) 안내</span>
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                    </span>
                    <p className="text-[11px] text-blue-800 font-semibold mt-1 leading-relaxed">
                      본 시뮬레이터는 매장의 실제 **ㄱ자(L-shape)형** 레이아웃을 정확하게 재현했습니다. 
                      상단의 넓은 가로 매대 라인과 우측 수직 프로모션/약국 카운터 동선, 최하단 창고·휴게 부속지를 드래그 앤 드롭으로 자유롭게 매핑하여 효율적인 실무 교대 시점을 관리하세요.
                    </p>
                  </div>

                  {/* 오픈, 미들, 마감 직원색상 설명 */}
                  <div className="space-y-1.5 border-t border-slate-100 pt-2 pb-0.5">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-wide block mb-1">
                      🎨 근무조 분류 설명 및 가이드
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 text-[12px] font-semibold text-slate-700">
                      <div className="flex flex-col justify-between p-1.5 rounded-xl bg-amber-50/60 border border-amber-200">
                        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400 border border-amber-500"></span>오픈조 (☀️)</span>
                        <span className="text-[8px] text-amber-800 font-black mt-0.5 tracking-tight">{openShiftHour.replace("-", " ~ ")}</span>
                      </div>
                      <div className="flex flex-col justify-between p-1.5 rounded-xl bg-sky-50/60 border border-sky-200">
                        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-sky-400 border border-sky-500"></span>미들조 (⛅)</span>
                        <span className="text-[8px] text-sky-800 font-black mt-0.5 tracking-tight">{middleShiftHour.replace("-", " ~ ")}</span>
                      </div>
                      <div className="flex flex-col justify-between p-1.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 border border-emerald-500"></span>마감조 (🌙)</span>
                        <span className="text-[8px] text-emerald-800 font-black mt-0.5 tracking-tight">{closeShiftHour.replace("-", " ~ ")}</span>
                      </div>
                    </div>
                  </div>

                  {/* 10시부터 8시까지 시간별 인원 배치 상태 */}
                  <div className="space-y-2 border-t border-slate-150 pt-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                          ⏱️ 시간대별 인원배치 실시간 집계 (10시 ~ 20시)
                        </span>
                        <span className="text-[8px] text-[#2563eb] bg-blue-50 px-1.5 py-0.5 rounded font-black">자동 계산</span>
                      </div>

                      {/* Hourly pills bar */}
                      <div className="grid grid-cols-6 md:grid-cols-11 gap-1">
                        {hoursTimeline.map((hour) => {
                          const staffAtHour = getStaffForHour(hour);
                          const count = staffAtHour.length;
                          const isInspected = inspectedHour === hour;
                          
                          return (
                            <button
                              key={`hour-pill-${hour}`}
                              type="button"
                              onClick={() => setInspectedHour(isInspected ? null : hour)}
                              className={`p-1 py-1.5 rounded-lg border text-center transition flex flex-col justify-between items-center cursor-pointer ${
                                isInspected
                                  ? "bg-blue-600 border-blue-700 text-white shadow-xs"
                                  : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-705"
                              }`}
                              title={`${hour}시 근무자 확인 (총 ${count}명)`}
                            >
                              <span className={`text-[10px] font-black tracking-tight ${isInspected ? "text-white" : "text-slate-500"}`}>
                                {hour === 20 ? "8(20)시" : `${hour}시`}
                              </span>
                              <div className="mt-1 flex items-center justify-center">
                                <span className={`text-[11px] font-black ${isInspected ? "text-blue-100" : (count > 0 ? "text-[#2563eb]" : "text-slate-400")}`}>
                                  {count}명
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Inspected Hour Employee Details Pool */}
                    <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl min-h-[70px] flex flex-col justify-center">
                      {inspectedHour !== null ? (
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5 text-[10px] font-bold text-slate-500">
                            <span>🕒 {inspectedHour}시 실무 출근 인원 명단 ({getStaffForHour(inspectedHour).length}명)</span>
                            <button onClick={() => setInspectedHour(null)} className="text-slate-400 hover:text-red-500 font-extrabold text-[10px] px-1">✕</button>
                          </div>
                          {getStaffForHour(inspectedHour).length > 0 ? (
                            <div className="flex flex-wrap gap-1 w-full">
                              {getStaffForHour(inspectedHour).map((item) => (
                                <div
                                  key={`inspected-staff-${item.employee.id}`}
                                  className={`px-1.5 py-0.5 rounded text-[10px] border font-bold flex items-center gap-1 ${getBadgeStyle(item.schedule.type)}`}
                                  title={`${item.employee.position} / ${item.schedule.workingHours}`}
                                >
                                  <span>{item.employee.name}</span>
                                  <span className="text-[8px] opacity-75 font-normal">({item.employee.position.split("(")[0]})</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic block text-center">해당 시간대 출근 수속자 없음</span>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-1 text-slate-500 font-medium flex flex-col items-center gap-0.5">
                          <span className="text-[11px] font-extrabold text-[#2563eb]">💡 위 시간표 버튼을 눌러보세요</span>
                          <span className="text-[10px] text-slate-400 font-normal">교대 시간대별 근무 가능 인원 명단을 정렬하여 보여줍니다.</span>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Middle: 베스트세트존 + 이벤트존 side by side (matching map.png) */}
                <div className="col-span-16 xl:col-span-6 bg-white border-2 border-violet-400 rounded-2xl p-3 flex flex-col gap-2 shadow-md relative">

                  {/* Floating Badge */}
                  <div className="absolute -top-3 left-3 bg-violet-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm z-20 flex items-center gap-1">
                    <span>🧬 프로모션 구역</span>
                  </div>

                  <div className="flex items-center justify-between border-b pb-1.5 mt-1">
                    <span className="text-[12px] font-black text-slate-800 flex items-center gap-1">🧬 베스트·이벤트 라인</span>
                    <span className="text-[8px] bg-violet-100 text-violet-700 rounded px-1 py-0.5 font-bold">중앙 섹션</span>
                  </div>

                  {/* 베스트세트존 + 이벤트존 side by side */}
                  <div className="flex flex-row gap-2 flex-1">

                    {/* 베스트 세트존 */}
                    <div
                      onDragOver={(e) => handleDragOver(e, "slot_best_set")}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, "slot_best_set")}
                      className={`flex-1 bg-blue-50/50 border-2 border-blue-400 rounded-lg p-2 flex flex-col justify-between min-h-[120px] relative transition ${
                        dragOverZone === "slot_best_set" ? "bg-blue-100 border-blue-500 scale-[1.01] z-20 shadow-xs" : ""
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 border-b border-blue-200/70 pb-1 mb-1">
                        <span className="text-[11px] font-black text-blue-950 flex items-center gap-1">🧬 베스트 세트존</span>
                        <span className="text-[7px] text-blue-600 font-extrabold">연령/질환별</span>
                      </div>
                      <div className="flex-1 py-1 flex flex-col justify-center">
                        {bestSetStaff.length > 0 ? (
                          renderPlacedStaffTags(bestSetStaff)
                        ) : (
                          <span className="text-[8px] text-blue-700 italic block text-center">진열 상담원 공석</span>
                        )}
                      </div>
                      <div className="text-[7px] text-blue-600 font-extrabold text-right">상담 테이블</div>
                    </div>

                    {/* 이벤트존 (3 stacked sub-zones) */}
                    <div className="flex-1 bg-white border border-slate-200 rounded-lg p-2 flex flex-col gap-1.5">
                      <span className="text-[11px] font-black text-slate-800 flex items-center gap-1 border-b border-slate-200 pb-1">
                        🎈 이벤트 존
                      </span>
                      <div className="flex-1 flex flex-col gap-1">
                        <div
                          onDragOver={(e) => handleDragOver(e, "slot_event1")}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, "slot_event1")}
                          className={`flex-1 bg-slate-50 border rounded-lg p-1.5 flex flex-col justify-between min-h-[30px] transition relative ${
                            dragOverZone === "slot_event1" ? "bg-red-50 border-red-500 scale-[1.01] z-20 shadow-xs" : "border-slate-200 hover:bg-slate-100/50"
                          }`}
                        >
                          <span className="text-[8px] font-black text-red-700 bg-red-50 px-1 rounded absolute top-1 right-1">Z1</span>
                          <span className="text-[8px] font-extrabold text-slate-700">이벤트존 1</span>
                          {renderPlacedStaffTags(event1Staff)}
                          {event1Staff.length === 0 && <span className="text-[8px] text-slate-400 italic">대기</span>}
                        </div>
                        <div
                          onDragOver={(e) => handleDragOver(e, "slot_event2")}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, "slot_event2")}
                          className={`flex-1 bg-slate-50 border rounded-lg p-1.5 flex flex-col justify-between min-h-[30px] transition relative ${
                            dragOverZone === "slot_event2" ? "bg-red-50 border-red-500 scale-[1.01] z-20 shadow-xs" : "border-slate-200 hover:bg-slate-100/50"
                          }`}
                        >
                          <span className="text-[8px] font-black text-red-700 bg-red-50 px-1 rounded absolute top-1 right-1">Z2</span>
                          <span className="text-[8px] font-extrabold text-slate-700">이벤트존 2</span>
                          {renderPlacedStaffTags(event2Staff)}
                          {event2Staff.length === 0 && <span className="text-[8px] text-slate-400 italic">대기</span>}
                        </div>
                        <div
                          onDragOver={(e) => handleDragOver(e, "slot_event3")}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, "slot_event3")}
                          className={`flex-1 bg-slate-50 border rounded-lg p-1.5 flex flex-col justify-between min-h-[30px] transition relative ${
                            dragOverZone === "slot_event3" ? "bg-red-50 border-red-500 scale-[1.01] z-20 shadow-xs" : "border-slate-200 hover:bg-slate-100/50"
                          }`}
                        >
                          <span className="text-[8px] font-black text-red-700 bg-red-50 px-1 rounded absolute top-1 right-1">Z3</span>
                          <span className="text-[8px] font-extrabold text-slate-700">이벤트존 3</span>
                          {renderPlacedStaffTags(event3Staff)}
                          {event3Staff.length === 0 && <span className="text-[8px] text-slate-400 italic">대기</span>}
                        </div>
                      </div>
                    </div>

                  </div>

                </div>

                {/* Right Side: The Vertical Wing of the ㄱ-자 — stacked colored zones matching map.png */}
                <div className="col-span-16 xl:col-span-4 bg-slate-50 border-4 border-blue-600 rounded-2xl p-3 flex flex-col gap-2.5 shadow-md relative">

                  {/* Floating ㄱ-자 Section Badge */}
                  <div className="absolute -top-3 left-3 bg-blue-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm z-20 flex items-center gap-1">
                    <span>🚪 우측 수직 윙</span>
                  </div>

                  {/* Wing Title Badge */}
                  <div className="flex items-center justify-between border-b pb-1.5 mb-0.5 mt-1">
                    <span className="text-[12px] font-black text-slate-800 flex items-center gap-1">
                      🚪 우측 카운터 라인
                    </span>
                    <span className="text-[8px] bg-slate-200 text-slate-600 rounded px-1 py-0.5 font-bold">수직 윙</span>
                  </div>

                  {/* 2-1. 영양제 냉장고 (Yellow Box — small horizontal block at top of wing) */}
                  <div
                    onDragOver={(e) => handleDragOver(e, "slot_drink")}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, "slot_drink")}
                    className={`bg-[#fef08a]/20 border-2 border-yellow-400 rounded-lg p-2 flex flex-row items-center gap-2 transition min-h-[44px] ${
                      dragOverZone === "slot_drink" ? "ring-2 ring-yellow-500 bg-yellow-100" : ""
                    }`}
                  >
                    <span className="text-[11px] font-black text-amber-950 flex items-center gap-1 shrink-0">🧊 냉장고</span>
                    <div className="flex-1 flex items-center justify-end gap-1">
                      {drinkStaff.length > 0 ? (
                        renderPlacedStaffTags(drinkStaff)
                      ) : (
                        <span className="text-[8px] text-amber-700 font-semibold italic">-4°C</span>
                      )}
                    </div>
                  </div>

                  {/* 2-2. 메인 POS 카운터 (Blue) — 3개 창구로 분할, 창구 사이 spacing */}
                  <div
                    onDragOver={(e) => handleDragOver(e, "slot_counter")}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, "slot_counter")}
                    className={`bg-blue-50/70 border-2 border-blue-500 rounded-lg p-2 flex flex-row transition flex-[2] min-h-[180px] relative ${
                      dragOverZone === "slot_counter" ? "bg-blue-100 border-blue-600 z-20 scale-[1.01] shadow-xs" : ""
                    }`}
                  >
                    {/* Vertical title label (rotated) */}
                    <div className="flex items-center justify-center shrink-0 w-5 mr-2 border-r border-blue-300/60">
                      <span
                        className="text-[11px] font-black text-blue-900 whitespace-nowrap"
                        style={{ writingMode: "vertical-rl" }}
                      >
                        💳 메인 카운터 (Checkout)
                      </span>
                    </div>
                    {/* Content — 3개 창구 (카운터1·2·3) 세로로 나눔, gap으로 사이 공간 */}
                    <div className="flex-1 flex flex-col gap-2">
                      {[1, 2, 3].map(deskNum => {
                        // 담당자를 3개 창구에 라운드로빈으로 배분 (2026-07-20: 렌더마다 3회 filter · cashiers 짧으니 유지)
                        const deskStaff = cashiers.filter((_, i) => (i % 3) + 1 === deskNum);
                        return (
                          <div
                            key={`counter-desk-${deskNum}`}
                            className="flex-1 bg-white/80 border border-blue-300 rounded-md px-1.5 py-1 flex items-center gap-1.5 shadow-sm"
                          >
                            {/* 창구 번호 배지 */}
                            <div className="flex flex-col items-center justify-center shrink-0 w-6">
                              <span className="text-[8px] font-black text-blue-700 leading-none">창구</span>
                              <span className="text-sm font-black text-blue-800 leading-none">{deskNum}</span>
                            </div>
                            {/* 고객 체어 아이콘 (3석) */}
                            <div className="flex items-center gap-0.5 shrink-0">
                              {[0, 1, 2].map(s => (
                                <div key={`stool-${deskNum}-${s}`} className="w-1.5 h-1.5 rounded-full border border-slate-300 bg-slate-50" />
                              ))}
                            </div>
                            {/* 배정된 직원 태그 */}
                            <div className="flex-1 min-w-0 flex flex-wrap items-center gap-0.5">
                              {deskStaff.length > 0 ? renderPlacedStaffTags(deskStaff) : (
                                <span className="text-[8px] text-slate-400 italic">셀프결제</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div className="text-[7px] text-blue-700 font-extrabold text-right border-t border-blue-200/50 pt-0.5">POS 결제 라인 · 3창구 운영</div>
                    </div>
                  </div>

                  {/* 2-3. 정면 약국 진열 (Orange) — the bright orange block below the blue counter in map.png */}
                  <div
                    onDragOver={(e) => handleDragOver(e, "slot_pharmacy")}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, "slot_pharmacy")}
                    className={`bg-orange-50 border-2 border-orange-400 rounded-lg p-2 flex flex-col justify-between transition min-h-[100px] relative ${
                      dragOverZone === "slot_pharmacy" ? "bg-orange-100 border-orange-500 z-20 scale-[1.01] shadow-xs" : ""
                    }`}
                  >
                    <div className="flex items-center gap-1 border-b border-orange-300 pb-1">
                      <span className="text-orange-600 text-xs">💊</span>
                      <span className="text-[11px] font-black text-orange-950 leading-tight">정면 약국 진열</span>
                    </div>

                    <div className="flex-1 py-1 flex flex-col justify-center">
                      {renderPlacedStaffTags(pharmacists)}
                      {pharmacists.length === 0 && (
                        <span className="text-[8px] text-orange-700 italic block text-center leading-tight font-extrabold bg-white border border-dashed border-orange-200 rounded py-1">약사 부재 (대기 필요)</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[7px] text-orange-800 font-extrabold pt-0.5">
                      <span>전문약사 처방대</span>
                      <span className="bg-orange-100 text-orange-800 px-1 rounded">처방전</span>
                    </div>
                  </div>

                  {/* 2-4. 대량구매상담존 (Green) — small block below pharmacy */}
                  <div
                    onDragOver={(e) => handleDragOver(e, "slot_bulk")}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, "slot_bulk")}
                    className={`bg-emerald-50 border-2 border-emerald-400 rounded-lg p-2 flex flex-col justify-between transition min-h-[70px] ${
                      dragOverZone === "slot_bulk" ? "bg-emerald-100 border-emerald-500 scale-[1.01] z-20 shadow-xs" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-emerald-200 pb-0.5">
                      <span className="text-[10px] font-black text-emerald-950">👥 대량구매상담</span>
                      <span className="text-[7px] font-bold text-emerald-700">VIP</span>
                    </div>
                    <div className="flex-1 py-1">
                      {bulkConsultStaff.length > 0 ? (
                        renderPlacedStaffTags(bulkConsultStaff)
                      ) : (
                        <span className="text-[8px] text-emerald-700 font-bold italic text-center block">대량 문의 대기</span>
                      )}
                    </div>
                  </div>

                  {/* 2-5. 카트존 (Bottom of wing — small block at bottom-right matching map.png) */}
                  <div
                    onDragOver={(e) => handleDragOver(e, "slot_cart")}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, "slot_cart")}
                    className={`bg-white border-2 border-indigo-400 rounded-lg p-2 flex flex-col justify-between transition min-h-[60px] ${
                      dragOverZone === "slot_cart" ? "bg-indigo-100 border-indigo-500 scale-[1.01] z-20 shadow-xs" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-indigo-950">🛒 카트존</span>
                      <span className="text-[7px] text-slate-500 font-bold">반입정렬</span>
                    </div>
                    <div className="flex-1 py-0.5 flex items-center justify-center">
                      {cartStaff.length > 0 ? (
                        renderPlacedStaffTags(cartStaff)
                      ) : (
                        <span className="text-[8px] text-slate-400 italic">인원 없음</span>
                      )}
                    </div>
                  </div>

                </div>

              </div>

              {/* ========================================================================== */}
              {/* SECTION 3: BOTTOM ROW (warehouse, breakroom, lockers)                      */}
              {/* ========================================================================== */}
              <div className="grid grid-cols-12 gap-3">

                {/* 3A. 창고 및 물류고 배후지 */}
                <div
                  onDragOver={(e) => handleDragOver(e, "slot_warehouse")}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, "slot_warehouse")}
                  className={`col-span-12 md:col-span-4 bg-indigo-50/50 border border-indigo-200 rounded-xl p-2.5 flex flex-col justify-between transition min-h-[100px] ${
                    dragOverZone === "slot_warehouse" ? "bg-indigo-100 border-indigo-500 scale-102" : ""
                  }`}
                >
                  <div className="flex items-center gap-1 border-b border-indigo-100 pb-1 mb-1">
                    <span className="text-indigo-600 text-xs">📦</span>
                    <span className="text-[10px] font-black text-slate-950">창고/물류</span>
                  </div>
                  <div className="flex-1 py-1 flex items-center justify-center">
                    {warehouseStaff.length > 0 ? (
                      renderPlacedStaffTags(warehouseStaff)
                    ) : (
                      <span className="text-[8px] text-slate-400 italic text-center block">하역 인원 없음</span>
                    )}
                  </div>
                  <div className="text-[7px] text-indigo-600 font-extrabold text-right">하역대</div>
                </div>

                {/* 휴게실 / 사물함 / 정수기 / 화장실 제거됨 (사용자 요청) */}

              </div>

            </div>

          </div>

          {/* Footer of Blueprint design guidelines */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-200/60 pt-4 mt-6">
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              <span className="text-slate-500">범례 (근무 시간대 배지):</span>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-500"></div>
                <span className="text-slate-600 tracking-tight norm-case">오픈 (☀️)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-sky-400 border border-sky-500"></div>
                <span className="text-slate-600 tracking-tight norm-case">미들 (⛅)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-emerald-500"></div>
                <span className="text-slate-600 tracking-tight norm-case">마감 (🌙)</span>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 font-semibold tracking-tight">
              * 출역 직원을 자유롭게 드래그 배치할 수 있도록 설계된 인터랙티브 교대시점 시뮬레이터 시스템입니다.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
};
