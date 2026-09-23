// src/components/SchedulePage/scheduleHelpers.ts
// 2026-08-22 · #framework-4 · SchedulePage 분리 · 순수 헬퍼 함수
// #342 · 2026-09-23 · positionToCategoryDynamic import · wageRateKeys 기반 동적 필터 지원
import { Employee, MonthlySummary } from "../../types";
import {
  isPharmPosition as isPharm,
  isLogisticsPosition as isLogistics,
  isPartTimeEmployment as isPartTime,
  isOtherPosition,
} from "../../lib/employeeCategory";
import type { ScheduleTypeEntry } from "../../constants";
import { positionToCategoryDynamic } from "./usePositionCategories";

export const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

// 2026-09-18 · #91 · Plan C 하이브리드 · position → category 매핑 상수화
// - 신규 직군(settings.positions)이 추가되어도 아래 매핑에 없으면 "기타"로 분류
// - 필터 탭·요약 카운트·인건비 집계 모두 이 상수를 SSOT로 사용
// #342 · 2026-09-23 · string 으로 완화 · settings.wageRates keys 기반 동적 카테고리 지원
export type PositionCategory = string;

/**
 * position (원본 문자열) → PositionCategory 매핑
 * - 약사 → 약사
 * - 캐셔·진열·사원 → 사원
 * - 물류·창고 → 창고
 * - 매장 → 매장
 * - 그 외 (신규 직군 포함) → "기타"
 */
export const POSITION_TO_CATEGORY: Record<string, PositionCategory> = {
  "약사":  "약사",
  "캐셔":  "사원",
  "진열":  "사원",
  "사원":  "사원",
  "물류":  "창고",
  "창고":  "창고",
  "매장":  "매장",
};

/**
 * position 문자열을 PositionCategory 로 분류.
 * - 정확 매칭이 최우선, 매칭 실패 시 부분 매칭(물류/창고 하위 표기 대응) → "기타"
 * - 회귀 방지: 기존 buildFilteredEmployees·getCalculatedSummary 규칙과 동치
 */
export function positionToCategory(pos: string): PositionCategory {
  if (!pos) return "기타";
  const exact = POSITION_TO_CATEGORY[pos];
  if (exact) return exact;
  // 부분 매칭 (기존 코드: emp.position.includes("물류"))
  if (pos.includes("물류")) return "창고";
  return "기타";
}

/**
 * 활성 카테고리 순서 (탭·요약 행 정렬용)
 * @deprecated #342 · settings.wageRates 기반 동적 순서를 권장 · usePositionCategories 훅 사용
 * 하위 호환을 위해 유지
 */
export const POSITION_CATEGORY_ORDER: PositionCategory[] = ["약사", "사원", "창고", "매장", "기타"];

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
    // 2026-08-31 · #50 · 물류·창고 분리 카운트
    let logisticsCount = 0, warehouseCount = 0;

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
          // 2026-09-18 · #91 · Plan C · positionToCategory + isOtherPosition 하이브리드
          // - isOtherPosition 은 employmentType(알바 등) 기반 → 우선 판정 유지
          // - 그 외 · POSITION_TO_CATEGORY 매핑으로 5-field 카운트 계산
          if (isPharm(emp.position)) pharmacistCount++;
          else if (isOtherPosition(emp.position, emp.employmentType)) otherCount++;
          else {
            const cat = positionToCategory(emp.position);
            if (cat === "창고") {
              // 물류/창고 세분화 (기존 규칙 유지)
              if (emp.position === "창고") warehouseCount++;
              else if (emp.position.includes("물류")) logisticsCount++;
              else warehouseCount++; // 기타 창고 카테고리 · 창고로 흡수
              staffCount++;
            } else if (cat === "기타") {
              // 신규/미매핑 직군 · MonthlySummary 스키마 유지 · otherCount 로 흡수
              otherCount++;
            } else {
              // "사원", "매장" → staffCount
              staffCount++;
            }
          }
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
      logisticsCount,
      warehouseCount,
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
  todayStr: string,
  /** #342 · settings.wageRates keys · 동적 카테고리 매칭 · 없으면 레거시 폴백 */
  wageRateKeys: string[] = [],
): Employee[] => {
  const filtered = employees.filter(emp => {
    if (positionTab !== "전체") {
      // #342 · 2026-09-23 · 동적 카테고리 매칭
      // - wageRateKeys 있으면 positionToCategoryDynamic 사용 (settings SSOT)
      // - wageRateKeys 없으면 레거시 positionToCategory 폴백 유지
      // - 약사 · isPharm() 특수 판정 유지 (하드코딩 허용 · 별도 태스크)
      // - 창고(물류) · isLogistics() 특수 판정 유지
      // - 기타 · 매칭 안 된 직군 fallback
      const pharm     = isPharm(emp.position);

      if (positionTab === "약사") {
        if (!pharm) return false;
      } else if (positionTab === "기타") {
        const cat = wageRateKeys.length > 0
          ? positionToCategoryDynamic(emp.position, wageRateKeys)
          : positionToCategory(emp.position);
        if (cat !== "기타" || pharm) return false;
      } else {
        // settings.wageRates 에 등록된 직군 탭
        // 약사 제외 후 동적 카테고리 매칭 · 창고 계열 물류 포함 유지
        if (pharm) return false;
        const cat = wageRateKeys.length > 0
          ? positionToCategoryDynamic(emp.position, wageRateKeys)
          : positionToCategory(emp.position);
        // 2026-09-23 · #341 fix 유지 · 매장 탭 · workplace fallback
        if (positionTab === "매장") {
          if (cat !== "매장" && emp.position !== "매장" && emp.workplace !== "매장") return false;
        } else {
          if (cat !== positionTab) return false;
        }
      }
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
