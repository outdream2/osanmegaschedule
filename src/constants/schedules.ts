// src/constants/schedules.ts
// 2026-08-06 · T-Constants-Extract · 스케줄 관련 배열 상수 통합

export const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

export const START_TIMES = ["08:00", "09:00", "09:30", "10:00", "11:00", "12:00", "13:00", "14:00"] as const;
export const END_TIMES   = ["15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"] as const;

// DayTimelineModal 휴식/점심 슬롯
export const LUNCH_SLOTS = ["11:30", "12:00", "12:30", "13:00", "13:30", "14:00"] as const;
export const REST_SLOTS  = ["16:00", "16:30", "17:00", "17:30", "18:00"] as const;
