// src/lib/koreanHolidays.ts
// 2026-10-12 · 사용자 지시 · 홈 오늘 예상매출 계산용 공휴일 분류 (평일/토/일/공휴일 4-tier)
//   · 2026-2027 법정 공휴일 하드코딩 (음력 공휴일 포함)
//   · 매년 추가 (2028~) 업데이트 필요
//   · 대체공휴일 포함 (대체공휴일 적용 공휴일 · 어린이날/설/추석)

const HOLIDAYS_2026 = new Set<string>([
  "2026-01-01", // 신정
  "2026-02-16", // 설날 (음력 1/1)
  "2026-02-17",
  "2026-02-18",
  "2026-03-01", // 삼일절
  "2026-03-02", // 대체공휴일 (삼일절 일요일)
  "2026-05-05", // 어린이날
  "2026-05-24", // 부처님오신날 (음력 4/8)
  "2026-05-25", // 대체공휴일 (부처님오신날 일요일)
  "2026-06-06", // 현충일
  "2026-08-15", // 광복절
  "2026-08-17", // 대체공휴일 (광복절 토요일 → 월요일)
  "2026-09-24", // 추석 (음력 8/15 전날)
  "2026-09-25",
  "2026-09-26",
  "2026-10-03", // 개천절
  "2026-10-05", // 대체공휴일 (개천절 토요일 → 월요일)
  "2026-10-09", // 한글날
  "2026-12-25", // 성탄절
]);

const HOLIDAYS_2027 = new Set<string>([
  "2027-01-01", // 신정
  "2027-02-06", // 설날 (음력 1/1)
  "2027-02-07",
  "2027-02-08",
  "2027-02-09", // 대체공휴일 (설날 토요일)
  "2027-03-01", // 삼일절
  "2027-05-05", // 어린이날
  "2027-05-13", // 부처님오신날 (음력 4/8)
  "2027-06-06", // 현충일
  "2027-06-07", // 대체공휴일 (현충일 일요일)
  "2027-08-15", // 광복절
  "2027-08-16", // 대체공휴일 (광복절 일요일)
  "2027-09-14", // 추석
  "2027-09-15",
  "2027-09-16",
  "2027-10-03", // 개천절
  "2027-10-04", // 대체공휴일 (개천절 일요일)
  "2027-10-09", // 한글날
  "2027-12-25", // 성탄절
]);

const ALL_HOLIDAYS = new Set<string>([...HOLIDAYS_2026, ...HOLIDAYS_2027]);

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
