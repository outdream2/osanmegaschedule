// src/constants.ts

export const DEFAULT_SCHEDULE_TYPES: string[] = [
  "오픈",
  "미들",
  "마감",
  "휴무",
  "월차",
  "지정휴무",
  "오전반차",
  "오후반차",
];

export const SCHEDULE_TYPES = DEFAULT_SCHEDULE_TYPES.map((v) => ({ value: v, label: v }));

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
