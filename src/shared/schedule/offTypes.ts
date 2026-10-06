// 2026-10-06 · 서버·클라 공통 OFF_TYPES helper
//   · 기존 중복 배열 3곳 통합 (staff.ts · scheduleHelpers.ts · lunch.ts / LunchPage.tsx / ScheduleCell.tsx 등)
//   · 대원칙 · 공통된 기능은 단일 소스에서 import
//
//   · OFF_TYPES          : 완전 결근 (예약·점심·근무일 모두 X)
//   · HALF_DAY_TYPES     : 반차 (근무시간 일부만 노출 · 전체 OFF 아님)
//   · WORK_TYPES         : 정상 근무 (오픈·미들·마감·오픈마감)
//
//   · isOffType()        : 완전 OFF 여부
//   · isHalfDayType()    : 반차 여부
//   · isWorkDayType()    : workDays 집계용 (OFF 아니고 반차도 아닌 · 또는 반차 포함 로직은 호출측 결정)

export const OFF_TYPES = ["휴무", "월차", "지정휴무", "결근"] as const;
export type OffType = typeof OFF_TYPES[number];

export const HALF_DAY_TYPES = ["오전반차", "오후반차"] as const;
export type HalfDayType = typeof HALF_DAY_TYPES[number];

export const WORK_TYPES = ["오픈", "미들", "마감", "오픈마감"] as const;
export type WorkType = typeof WORK_TYPES[number];

const OFF_SET = new Set<string>(OFF_TYPES);
const HALF_SET = new Set<string>(HALF_DAY_TYPES);
const WORK_SET = new Set<string>(WORK_TYPES);

/** 완전 결근 (예약 · 점심 · 가능시간 모두 X) */
export function isOffType(type: string | null | undefined): boolean {
  if (!type) return false;
  return OFF_SET.has(type);
}

/** 반차 (가능시간 일부 노출) */
export function isHalfDayType(type: string | null | undefined): boolean {
  if (!type) return false;
  return HALF_SET.has(type);
}

/** 정상 근무 유형 */
export function isWorkType(type: string | null | undefined): boolean {
  if (!type) return false;
  return WORK_SET.has(type);
}

/** 예약·점심 등 "일부라도 가능" 판단 · OFF 가 아니면 true (반차 포함) */
export function isAvailableDay(type: string | null | undefined): boolean {
  if (!type) return true;         // type 없음 → 기본 가능
  return !OFF_SET.has(type);
}
