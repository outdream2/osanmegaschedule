// src/constants.ts

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

export const SCHEDULE_TYPES = DEFAULT_SCHEDULE_TYPES.map((e) => ({ value: e.type, label: e.type }));

export const SCHEDULE_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  오픈: {
    bg: "bg-[#fef08a]",  // Light yellow
    text: "text-slate-900 font-bold",
    border: "border-[#e2e8f0]",
    label: "오픈",
  },
  미들: {
    bg: "bg-[#dbeafe]",  // Light blue
    text: "text-slate-900 font-bold",
    border: "border-[#e2e8f0]",
    label: "미들",
  },
  마감: {
    bg: "bg-[#a7f3d0]", // Light emerald green
    text: "text-slate-900 font-bold",
    border: "border-[#e2e8f0]",
    label: "마감",
  },
  휴무: {
    bg: "bg-[#fecdd3]", // Soft rose/pink
    text: "text-slate-900 font-bold",
    border: "border-[#e2e8f0]",
    label: "휴무",
  },
  월차: {
    bg: "bg-[#fbbf24]", // Deep yellow
    text: "text-slate-900 font-bold",
    border: "border-[#e2e8f0]",
    label: "월차",
  },
  지정휴무: {
    bg: "bg-[#bae6fd]", // Sky blue
    text: "text-slate-900 font-bold",
    border: "border-[#e2e8f0]",
    label: "지정휴무",
  },
  오전반차: {
    bg: "bg-orange-100",
    text: "text-orange-950 font-bold",
    border: "border-orange-200",
    label: "오전반차",
  },
  오후반차: {
    bg: "bg-lime-100",
    text: "text-lime-950 font-bold",
    border: "border-lime-200",
    label: "오후반차",
  },
};

// Default styling fallback for unassigned or custom items
export const DEFAULT_COLOR = {
  bg: "bg-slate-50",
  text: "text-slate-500",
  border: "border-slate-200",
  label: "미지정",
};
