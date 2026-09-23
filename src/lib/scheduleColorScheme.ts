// src/lib/scheduleColorScheme.ts
// B-5 · 스케줄 색상·톤 매핑 정규화 유틸
// SummaryRow · UpcomingLeaveBanner · (향후) ScheduleCell 에서 재사용

// ─── 1. 지각/조퇴/결근 상태 배지 ────────────────────────────────────────────

export type StatusTone = "late" | "leave-early" | "absent" | "extended" | "default";

export interface StatusBadgeClasses {
  container: string; // text + bg + border 조합 Tailwind 클래스
  icon: string;      // 이모지 prefix (공백 포함) or ""
  tone: StatusTone;
}

/**
 * actualHours 문자열에서 상태 톤을 감지한다.
 * - "지각" 포함 → "late"
 * - "조퇴" 포함 → "leave-early"
 * - "결근" 포함 → "absent"
 * - 그 외 비어있지 않음 → "extended"
 * - null/undefined/빈 문자열 → "default"
 */
export function detectStatusTone(actualHours: string | null | undefined): StatusTone {
  if (!actualHours) return "default";
  if (actualHours.includes("지각")) return "late";
  if (actualHours.includes("조퇴")) return "leave-early";
  if (actualHours.includes("결근")) return "absent";
  return "extended";
}

const STATUS_BADGE_MAP: Record<StatusTone, StatusBadgeClasses> = {
  late: {
    container: "text-amber-700 bg-amber-50 border border-amber-200",
    icon: "⚠️ ",
    tone: "late",
  },
  "leave-early": {
    container: "text-purple-700 bg-purple-50 border border-purple-200",
    icon: "🏃 ",
    tone: "leave-early",
  },
  absent: {
    container: "text-rose-700 bg-rose-50 border border-rose-200",
    icon: "🚨 ",
    tone: "absent",
  },
  extended: {
    container: "text-rose-600 bg-rose-50/50 border border-rose-100",
    icon: "",
    tone: "extended",
  },
  default: {
    container: "text-rose-600 bg-rose-50/50 border border-rose-100",
    icon: "",
    tone: "default",
  },
};

/**
 * actualHours 문자열을 받아 Tailwind 클래스 + 아이콘 프리픽스를 반환한다.
 * ScheduleCell · SummaryRow · UpcomingLeaveBanner 에서 재사용.
 */
export function getStatusBadgeClass(actualHours: string | null | undefined): StatusBadgeClasses {
  return STATUS_BADGE_MAP[detectStatusTone(actualHours)];
}

// ─── 2. SummaryRow 직원 유형별 색상 클래스 ──────────────────────────────────

export type EmployeeLabel = "약사" | "사원" | "기타" | "물류" | "창고" | "근무인원";

export interface SummaryLabelClasses {
  label: string;       // sticky 헤더 셀 bg+text+border
  valActive: string;   // 값 있는 셀
  monthTotal: string;  // 월 합계 셀
}

const SUMMARY_LABEL_MAP: Record<EmployeeLabel, SummaryLabelClasses> = {
  약사: {
    label:      "bg-emerald-600 text-white border-r border-emerald-500",
    valActive:  "bg-emerald-50 text-emerald-700 font-bold",
    monthTotal: "bg-emerald-50 text-emerald-700 border-l-2 border-line",
  },
  사원: {
    label:      "bg-zinc-600 text-white border-r border-zinc-500",
    valActive:  "bg-zinc-50 text-zinc-700 font-bold",
    monthTotal: "bg-zinc-100 text-zinc-600 border-l-2 border-line",
  },
  기타: {
    label:      "bg-zinc-400 text-white border-r border-zinc-300",
    valActive:  "bg-zinc-50/70 text-zinc-600 font-bold",
    monthTotal: "bg-zinc-50 text-zinc-500 border-l-2 border-line",
  },
  물류: {
    label:      "bg-sky-600 text-white border-r border-sky-500",
    valActive:  "bg-sky-50 text-sky-700 font-bold",
    monthTotal: "bg-sky-50 text-sky-700 border-l-2 border-line",
  },
  창고: {
    label:      "bg-amber-600 text-white border-r border-amber-500",
    valActive:  "bg-amber-50 text-amber-700 font-bold",
    monthTotal: "bg-amber-50 text-amber-700 border-l-2 border-line",
  },
  근무인원: {
    label:      "bg-brand-deep text-white border-r border-indigo-500",
    valActive:  "bg-indigo-50 text-indigo-700 font-bold",
    monthTotal: "bg-indigo-50 text-indigo-700 border-l-2 border-line",
  },
};

/**
 * SummaryRow 라벨 유형을 받아 Tailwind 색상 클래스 묶음을 반환한다.
 */
export function getSummaryLabelClasses(label: EmployeeLabel): SummaryLabelClasses {
  return SUMMARY_LABEL_MAP[label];
}

// ─── 3. UpcomingLeaveBanner 연차 유형별 텍스트 색상 ──────────────────────────

const LEAVE_TYPE_COLOR: Record<string, string> = {
  월차:    "text-amber-700",
  오전반차: "text-sky-700",
  오후반차: "text-indigo-700",
};

/**
 * 연차 유형 문자열을 받아 Tailwind 텍스트 색상 클래스를 반환한다.
 * 미등록 유형은 "text-zinc-600" 폴백.
 */
export function getLeaveTypeColor(type: string): string {
  return LEAVE_TYPE_COLOR[type] ?? "text-zinc-600";
}
