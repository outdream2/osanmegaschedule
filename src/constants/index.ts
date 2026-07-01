export interface ScheduleTypeEntry {
  type: string;
  hours: string;
  pharmHours: string;
}

export const DEFAULT_SCHEDULE_TYPES: ScheduleTypeEntry[] = [
  { type: "오픈",     hours: "10:00-18:00", pharmHours: "" },
  { type: "미들",     hours: "11:00-18:00", pharmHours: "" },
  { type: "마감",     hours: "12:00-20:00", pharmHours: "" },
  { type: "오픈마감", hours: "10:00-22:00", pharmHours: "" },
  { type: "오전반차", hours: "",             pharmHours: "" },
  { type: "오후반차", hours: "",             pharmHours: "" },
  { type: "휴무",     hours: "",             pharmHours: "" },
  { type: "월차",     hours: "",             pharmHours: "" },
  { type: "지정휴무", hours: "",             pharmHours: "" },
  { type: "결근",     hours: "",             pharmHours: "" },
];

export const SCHEDULE_TYPES: { value: string; label: string }[] = DEFAULT_SCHEDULE_TYPES.map(e => ({ value: e.type, label: e.type }));

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
