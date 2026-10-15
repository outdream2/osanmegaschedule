// src/lib/koreanHolidays.ts
// 2026-10-12 · 사용자 지시 · 홈 오늘 예상매출 계산용 공휴일 분류 (평일/토/일/공휴일 4-tier)
//   · 2026-2027 법정 공휴일 하드코딩 (음력 공휴일 포함)
//   · 매년 추가 (2028~) 업데이트 필요
//   · 대체공휴일 포함 (대체공휴일 적용 공휴일 · 어린이날/설/추석)
// 2026-10-15 · 사용자 리포트 "월별달력에 공휴일표시가 안돼"
//   · 하드코딩 데이터에 공휴일 이름 추가 (Map) · /api/holidays API 실패 시 UI fallback 용
//   · Set 는 하위 호환 유지 · Map 신규 export

const HOLIDAYS_2026_WITH_NAMES: ReadonlyArray<[string, string]> = [
  ["2026-01-01", "신정"],
  ["2026-02-16", "설날"],
  ["2026-02-17", "설날"],
  ["2026-02-18", "설날"],
  ["2026-03-01", "삼일절"],
  ["2026-03-02", "대체공휴일(삼일절)"],
  ["2026-05-05", "어린이날"],
  ["2026-05-24", "부처님오신날"],
  ["2026-05-25", "대체공휴일(부처님오신날)"],
  ["2026-06-06", "현충일"],
  ["2026-08-15", "광복절"],
  ["2026-08-17", "대체공휴일(광복절)"],
  ["2026-09-24", "추석"],
  ["2026-09-25", "추석"],
  ["2026-09-26", "추석"],
  ["2026-10-03", "개천절"],
  ["2026-10-05", "대체공휴일(개천절)"],
  ["2026-10-09", "한글날"],
  ["2026-12-25", "성탄절"],
];

const HOLIDAYS_2027_WITH_NAMES: ReadonlyArray<[string, string]> = [
  ["2027-01-01", "신정"],
  ["2027-02-06", "설날"],
  ["2027-02-07", "설날"],
  ["2027-02-08", "설날"],
  ["2027-02-09", "대체공휴일(설날)"],
  ["2027-03-01", "삼일절"],
  ["2027-05-05", "어린이날"],
  ["2027-05-13", "부처님오신날"],
  ["2027-06-06", "현충일"],
  ["2027-06-07", "대체공휴일(현충일)"],
  ["2027-08-15", "광복절"],
  ["2027-08-16", "대체공휴일(광복절)"],
  ["2027-09-14", "추석"],
  ["2027-09-15", "추석"],
  ["2027-09-16", "추석"],
  ["2027-10-03", "개천절"],
  ["2027-10-04", "대체공휴일(개천절)"],
  ["2027-10-09", "한글날"],
  ["2027-12-25", "성탄절"],
];

const HOLIDAYS_2026 = new Set<string>(HOLIDAYS_2026_WITH_NAMES.map(([d]) => d));
const HOLIDAYS_2027 = new Set<string>(HOLIDAYS_2027_WITH_NAMES.map(([d]) => d));

const ALL_HOLIDAYS = new Set<string>([...HOLIDAYS_2026, ...HOLIDAYS_2027]);
const ALL_HOLIDAY_NAMES = new Map<string, string>([
  ...HOLIDAYS_2026_WITH_NAMES,
  ...HOLIDAYS_2027_WITH_NAMES,
]);

/** 2026-10-15 · YYYY-MM-DD → 공휴일명 (없으면 null · API fallback 용)
 *  · 지원 범위 · 2026-2027 하드코딩 · 외 연도는 /api/holidays 응답 사용
 */
export function getHardcodedHolidayName(ymd: string): string | null {
  return ALL_HOLIDAY_NAMES.get(ymd) ?? null;
}

/** 2026-10-15 · 지정 연도 전체 공휴일 Map (YYYY-MM-DD → name)
 *  · /api/holidays 실패 시 fallback · 지원 범위 2026-2027
 */
export function getHardcodedHolidayMap(year: number): Map<string, string> {
  const result = new Map<string, string>();
  const yearStr = `${year}-`;
  for (const [date, name] of ALL_HOLIDAY_NAMES) {
    if (date.startsWith(yearStr)) result.set(date, name);
  }
  return result;
}

/** YYYY-MM-DD 문자열 → 공휴일 여부 */
export function isKoreanHolidayYmd(ymd: string): boolean {
  return ALL_HOLIDAYS.has(ymd);
}

/** Date 객체 → 공휴일 여부 (로컬 시간 기준) */
export function isKoreanHoliday(date: Date): boolean {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return ALL_HOLIDAYS.has(`${y}-${m}-${d}`);
}

export type DayType = "weekday" | "sat" | "sun" | "holiday";

/** YYYY-MM-DD · 날짜 유형 분류 · 공휴일 우선 (토·일에 공휴일 겹치면 holiday 로 분류 X · 요일 유지)
 *   · 공휴일 전용 : 평일인데 공휴일 (삼일절·광복절·개천절·한글날 등 평일 공휴일만)
 *   · 토·일에 공휴일 겹치면 → sat/sun (매출 패턴 요일 중심)
 */
export function getDayType(ymd: string): DayType {
  const d = new Date(ymd + "T00:00:00");
  const dow = d.getDay();
  if (dow === 0) return "sun";
  if (dow === 6) return "sat";
  if (isKoreanHolidayYmd(ymd)) return "holiday";
  return "weekday";
}
