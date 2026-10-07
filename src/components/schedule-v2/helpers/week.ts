// src/components/schedule-v2/helpers/week.ts
// 2026-10-07 · 스케줄 V2 · 주간 helper (ISO week · 월~일 · timezone naive YYYY-MM-DD)
//   · 프로젝트 기존 schedule date 는 "YYYY-MM-DD" 로컬 날짜 문자열 · 동일 convention 유지
//   · 주 시작: 월요일 (ISO 8601) · 주 끝: 일요일
//   · anchor month 산정 · 주의 목요일 (ISO week year 규칙) 이 속한 month 를 사용
//     · 월 경계 주 (예: 9/28~10/4) · 목요일이 10/1 → anchor = 10월
//     · 데이터 fetch 한 월만 schedule 반영 · 다른 월 날짜는 editable=false (lock 혼동 방지)

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 주 시작 (월요일) · 입력 anchor 는 Date (local) · 반환은 새 Date */
export function startOfISOWeek(anchor: Date): Date {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=일 ~ 6=토
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** 주 끝 (일요일) · 7일 window 끝 */
export function endOfISOWeek(anchor: Date): Date {
  const s = startOfISOWeek(anchor);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return e;
}

/** 7-day YYYY-MM-DD list · 월~일 */
export function buildWeekDateList(anchor: Date): string[] {
  const start = startOfISOWeek(anchor);
  const list: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    list.push(toYmd(d));
  }
  return list;
}

/**
 * anchor month · 주의 목요일 (ISO 규칙) 기준 month
 *   · 월 경계 주 (예: 9/28~10/4) · 목요일 = 10/1 → anchor = {year: Y, month: 10}
 *   · 이 month 를 useScheduleData 에 전달 · schedule fetch 는 해당 월만
 *   · 반대 월 날짜 (예: 9/28~9/30) 는 데이터 없음 → cell 비어있음 + 편집 비활성 처리
 */
export function anchorMonthOfWeek(anchor: Date): { year: number; month: number } {
  const start = startOfISOWeek(anchor);
  const thursday = new Date(start);
  thursday.setDate(start.getDate() + 3);
  return { year: thursday.getFullYear(), month: thursday.getMonth() + 1 };
}
