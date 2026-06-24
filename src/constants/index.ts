export const DEFAULT_SCHEDULE_TYPES: string[] = [
  "오픈",
  "미들",
  "마감",
  "오전반차",
  "오후반차",
  "휴무",
  "월차",
  "지정휴무",
  "결근",
];

export const SCHEDULE_TYPES: { value: string; label: string }[] = DEFAULT_SCHEDULE_TYPES.map(
  (v) => ({ value: v, label: v })
);

export interface ScheduleColor {
  bg: string;
  text: string;
}

export const SCHEDULE_COLORS: Record<string, ScheduleColor> = {
  오픈:     { bg: "bg-amber-100",   text: "text-amber-800" },
  미들:     { bg: "bg-sky-100",     text: "text-sky-800" },
  마감:     { bg: "bg-emerald-100", text: "text-emerald-800" },
  오전반차: { bg: "bg-amber-50",    text: "text-amber-700" },
  오후반차: { bg: "bg-emerald-50",  text: "text-emerald-700" },
  휴무:     { bg: "bg-rose-100",    text: "text-rose-700" },
  월차:     { bg: "bg-amber-200",   text: "text-amber-900" },
  지정휴무: { bg: "bg-sky-100",     text: "text-sky-700" },
  결근:     { bg: "bg-red-200",     text: "text-red-900" },
};

export const DEFAULT_COLOR: ScheduleColor = {
  bg: "bg-slate-100",
  text: "text-slate-700",
};
