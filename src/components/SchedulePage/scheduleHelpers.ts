// src/components/SchedulePage/scheduleHelpers.ts
// 2026-08-22 · #framework-4 · SchedulePage 분리 · 순수 헬퍼 함수
import { Employee, MonthlySummary } from "../../types";
import {
  isPharmPosition as isPharm,
  isLogisticsPosition as isLogistics,
  isPartTimeEmployment as isPartTime,
  isOtherPosition,
} from "../../lib/employeeCategory";
import type { ScheduleTypeEntry } from "../../constants";

export const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

export const getTodayStr = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getDayDetails = (dateStr: string, todayStr: string) => {
  const d = new Date(dateStr + "T00:00:00");
  const dayIndex = d.getDay();
  const dayWord = weekdays[dayIndex];
  const isToday = dateStr === todayStr;
  let colorClass = "text-zinc-600 bg-zinc-50";
  if (isToday) colorClass = "text-white bg-rose-500 font-bold";
  else if (dayIndex === 6) colorClass = "text-blue-600 bg-blue-50 font-bold";
  else if (dayIndex === 0) colorClass = "text-rose-600 bg-rose-50 font-bold";
  return { dayWord, colorClass, fullDate: dateStr, isToday, dayIndex };
};

export const buildDateList = (currentYear: number, currentMonth: number): string[] => {
  const result: string[] = [];
  for (let offset = -1; offset <= 1; offset++) {
    let y = currentYear, m = currentMonth + offset;
    if (m <= 0) { m += 12; y--; }
    if (m > 12) { m -= 12; y++; }
    const days = new Date(y, m, 0).getDate();
    for (let d = 1; d <= days; d++) {
      result.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
  return result;
};

export const getTypeHoursMap = (
  position: string,
  employmentType: string = "",
  settingsScheduleTypes: ScheduleTypeEntry[]
): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const entry of settingsScheduleTypes) {
    let h = entry.hours;
    if (isPharm(position) && entry.pharmHours) h = entry.pharmHours;
    else if (isLogistics(position) && entry.logisticsHours) h = entry.logisticsHours;
    else if (isPartTime(employmentType) && entry.partTimeHours) h = entry.partTimeHours;
    map[entry.type] = h;
  }
  return map;
};

export const parseWorkingHours = (wh: string): number => {
  if (!wh) return 0;
  const m = wh.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  const start = parseInt(m[1]) * 60 + parseInt(m[2]);
  const end = parseInt(m[3]) * 60 + parseInt(m[4]);
  return Math.max(0, (end - start) / 60);
};

export const getBreakHoursForEmp = (emp: Employee): number => {
  if (emp.break_apply_paid === false) return 0;
  const min = emp.break_time_minutes ?? 60;
  return Math.max(0, min) / 60;
};

export const OFF_TYPES_SET = new Set(["휴무", "월차", "결근"]);

export const getEmpMonthStats = (
  emp: Employee,
  monthKey: string,
  settingsScheduleTypes: ScheduleTypeEntry[],
  settingsWageRates: Record<string, any>,
  settingsEmployeeWageOverrides: Record<number, any>
) => {
  const visibleSchedules = emp.schedules.filter(s => s.date.startsWith(monthKey));
  const workDays = visibleSchedules.filter(s => s.type && !OFF_TYPES_SET.has(s.type)).length;
  let totalHours = 0;
  let laborCost = 0;

  const empRate = settingsEmployeeWageOverrides[emp.id] ?? settingsWageRates[emp.position] ?? null;
  const shiftHourFallback = getTypeHoursMap(emp.position, emp.employmentType, settingsScheduleTypes);
  const breakHours = getBreakHoursForEmp(emp);

  for (const s of visibleSchedules) {
    if (!s.type || OFF_TYPES_SET.has(s.type)) continue;
    const wh = s.workingHours || shiftHourFallback[s.type] || "";
    const rawHours = parseWorkingHours(wh);
    const paidHours = Math.max(0, rawHours - breakHours);
    totalHours += paidHours;
    if (empRate && paidHours > 0) {
      const d = new Date(s.date);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      laborCost += paidHours * (isWeekend ? empRate.weekend : empRate.weekday);
    }
  }

  return { workDays, totalHours, laborCost };
};

export const getCalculatedSummary = (
  sourceEmployees: Employee[],
  dates: string[]
): MonthlySummary[] => {
  return dates.map(currentDate => {
    const day = parseInt(currentDate.split("-")[2]);
    let openCount = 0, middleCount = 0, closeCount = 0;
    let pharmacistCount = 0, staffCount = 0, otherCount = 0;

    for (const emp of sourceEmployees) {
      if (emp.hireDate && currentDate < emp.hireDate) continue;
      if (emp.retireDate && currentDate > emp.retireDate) continue;
      const sched = emp.schedules.find(s => s.date === currentDate);
      if (sched && sched.type) {
        const type = sched.type;
        if (type === "오픈" || type === "오전반차") openCount++;
        else if (type === "미들") middleCount++;
        else if (type === "마감" || type === "오후반차") closeCount++;

        const isOff = ["휴무", "월차", "결근"].includes(type);
        if (!isOff && type.trim() !== "") {
          if (isPharm(emp.position)) pharmacistCount++;
          else if (isOtherPosition(emp.position, emp.employmentType)) otherCount++;
          else staffCount++;
        }
      }
    }

    return {
      day,
      date: currentDate,
      openCount,
      middleCount,
      closeCount,
      totalCount: pharmacistCount + staffCount + otherCount,
      pharmacistCount,
      staffCount,
      otherCount,
    };
  });
};

export const parseBreakMemo = (memoStr: string): { lunch?: string; break?: string; other?: string } => {
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

export const splitTimeRange = (range?: string): [string, string] => {
  if (!range) return ["", ""];
  const m = range.match(/^(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})$/);
  if (!m) return ["", ""];
  return [m[1], m[2]];
};

export const buildFilteredEmployees = (
  employees: Employee[],
  positionTab: string,
  searchQuery: string,
  sortBy: string,
  sortOrder: "asc" | "desc",
  todayFirst: boolean,
  todayStr: string
): Employee[] => {
  const filtered = employees.filter(emp => {
    if (positionTab !== "전체") {
      const pharm     = isPharm(emp.position);
      const staff     = emp.position === "캐셔" || emp.position === "사원";
      const warehouse = !pharm && (isLogistics(emp.position) || emp.position === "창고");
      const store     = !pharm && emp.workplace === "매장";
      if (positionTab === "약사")      { if (!pharm)     return false; }
      else if (positionTab === "사원") { if (!staff)     return false; }
      else if (positionTab === "창고") { if (!warehouse) return false; }
      else if (positionTab === "매장") { if (!store)     return false; }
    }
    if (searchQuery.trim() !== "") {
      return emp.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    }
    return true;
  });

  const getPositionGroup = (pos: string): number => {
    if (pos === "약사") return 2;
    if (pos.includes("물류") || pos === "캐셔" || pos === "진열" || pos === "사원") return 3;
    return 1;
  };

  return filtered.sort((a, b) => {
    if (sortBy === "position") {
      const gA = getPositionGroup(a.position);
      const gB = getPositionGroup(b.position);
      if (gA !== gB) return sortOrder === "asc" ? gA - gB : gB - gA;
      return a.name.localeCompare(b.name, "ko");
    }
    if (sortBy === "workplace") {
      const wA = a.workplace || "";
      const wB = b.workplace || "";
      if (wA !== wB) return sortOrder === "asc" ? wA.localeCompare(wB, "ko") : wB.localeCompare(wA, "ko");
      return a.name.localeCompare(b.name, "ko");
    }
    if (sortBy === "name") {
      return sortOrder === "asc" ? a.name.localeCompare(b.name, "ko") : b.name.localeCompare(a.name, "ko");
    }
    if (sortBy === "today" || (sortBy === "none" && todayFirst)) {
      const TODAY_OFF_TYPES = new Set(["휴무", "월차", "지정휴무", "결근", "오전반차", "오후반차"]);
      const TODAY_TYPE_ORDER: Record<string, number> = { "오픈": 0, "마감": 1 };
      const getOrder = (type: string): number => {
        if (!type) return 4;
        if (TODAY_OFF_TYPES.has(type)) return 3;
        return TODAY_TYPE_ORDER[type] ?? 2;
      };
      const aType = a.schedules.find(s => s.date === todayStr)?.type ?? "";
      const bType = b.schedules.find(s => s.date === todayStr)?.type ?? "";
      const aOrd = getOrder(aType);
      const bOrd = getOrder(bType);
      if (aOrd !== bOrd) return aOrd - bOrd;
      const gA = getPositionGroup(a.position);
      const gB = getPositionGroup(b.position);
      if (gA !== gB) return gA - gB;
      return a.name.localeCompare(b.name, "ko");
    }
    return 0;
  });
};
