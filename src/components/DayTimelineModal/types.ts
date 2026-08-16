// 2026-08-16 · #8 · Phase 2A · DayTimelineModal 타입
import type { Employee } from "../../types";

export type TypeTone = { bg: string; text: string; dot: string; chipBg: string; chipText: string; chipBorder: string };
export const DEFAULT_TONE: TypeTone = { bg: "#e2e8f0", text: "#334155", dot: "#94a3b8", chipBg: "#f1f5f9", chipText: "#334155", chipBorder: "#e2e8f0" };

export const ZONE_ROWS = ["카운터", "매장"] as const;
export type ZoneRow = typeof ZONE_ROWS[number];

export type BreakInterval = 30 | 60 | 90;
export type BreakCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type WorkerEntry = {
  emp: Employee;
  schedule: { type: string; date: string; workingHours?: string; actualHours?: string; memo?: string };
  wh: string;
};
export type SlotMap = Record<string, number[]>;
export type ZoneMap = Record<string, SlotMap>;

export const TYPE_ORDER: Record<string, number> = { "오픈": 0, "오전반차": 1, "미들": 2, "오후반차": 3, "마감": 4 };
export const SKIP_TYPES = new Set(["휴무", "월차", "지정휴무"]);
