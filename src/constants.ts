// src/constants.ts

export interface ScheduleTypeEntry {
  type: string;
  hours: string;
  pharmHours: string;
  logisticsHours: string;
  partTimeHours: string;
  color?: string; // hex background color
}

export const DEFAULT_SCHEDULE_TYPES: ScheduleTypeEntry[] = [
  { type: "오픈",     hours: "10:00-18:00", pharmHours: "", logisticsHours: "", partTimeHours: "", color: "#dbeafe" },
  { type: "미들",     hours: "11:00-18:00", pharmHours: "", logisticsHours: "", partTimeHours: "", color: "#e0e7ff" },
  { type: "마감",     hours: "12:00-20:00", pharmHours: "", logisticsHours: "", partTimeHours: "", color: "#bfdbfe" },
  { type: "오픈마감", hours: "10:00-22:00", pharmHours: "", logisticsHours: "", partTimeHours: "", color: "#c7d2fe" },
  { type: "오전반차", hours: "",             pharmHours: "", logisticsHours: "", partTimeHours: "", color: "#ffedd5" },
  { type: "오후반차", hours: "",             pharmHours: "", logisticsHours: "", partTimeHours: "", color: "#ecfccb" },
  { type: "휴무",     hours: "",             pharmHours: "", logisticsHours: "", partTimeHours: "", color: "#fecdd3" },
  { type: "월차",     hours: "",             pharmHours: "", logisticsHours: "", partTimeHours: "", color: "#fef3c7" },
  { type: "결근",     hours: "",             pharmHours: "", logisticsHours: "", partTimeHours: "", color: "#fecaca" },
];

/**
 * Predefined color palette used by the SettingsModal color picker.
 * Each preset carries all hex tones needed across the app:
 *   - `bg` for schedule cell backgrounds (light pastel — used with dark text)
 *   - `chip` slightly saturated variant for chips/tabs (used with dark text)
 *   - `text` a dark-toned color usable as foreground on the light backgrounds
 *   - `dot` a mid-tone dot color for legends/indicators
 */
export interface ColorPreset {
  label: string;
  bg: string;      // hex, cell background (very light)
  chip: string;    // hex, chip background (a bit deeper than bg)
  text: string;    // hex, foreground text on bg/chip
  dot: string;     // hex, dot / accent color
}

export const COLOR_PRESETS: ColorPreset[] = [
  { label: "파랑",   bg: "#dbeafe", chip: "#bfdbfe", text: "#1e3a8a", dot: "#60a5fa" },
  { label: "인디고", bg: "#e0e7ff", chip: "#c7d2fe", text: "#3730a3", dot: "#818cf8" },
  { label: "하늘",   bg: "#e0f2fe", chip: "#bae6fd", text: "#075985", dot: "#38bdf8" },
  { label: "초록",   bg: "#d1fae5", chip: "#a7f3d0", text: "#065f46", dot: "#34d399" },
  { label: "라임",   bg: "#ecfccb", chip: "#d9f99d", text: "#3f6212", dot: "#a3e635" },
  { label: "노랑",   bg: "#fef3c7", chip: "#fde68a", text: "#78350f", dot: "#facc15" },
  { label: "주황",   bg: "#ffedd5", chip: "#fed7aa", text: "#9a3412", dot: "#fb923c" },
  { label: "빨강",   bg: "#fecaca", chip: "#fca5a5", text: "#7f1d1d", dot: "#f87171" },
  { label: "분홍",   bg: "#fce7f3", chip: "#fbcfe8", text: "#831843", dot: "#f472b6" },
  { label: "보라",   bg: "#ede9fe", chip: "#ddd6fe", text: "#4c1d95", dot: "#a78bfa" },
  { label: "회색",   bg: "#f1f5f9", chip: "#e2e8f0", text: "#334155", dot: "#94a3b8" },
];

/** Returns the preset whose bg hex matches, or null. Used to highlight the current preset in the picker. */
export function findPresetByBg(hex: string): ColorPreset | null {
  const norm = hex.trim().toLowerCase();
  return COLOR_PRESETS.find(p => p.bg.toLowerCase() === norm) ?? null;
}

/** Given a bg hex, derives the tones (chip/text/dot) — either from the matching preset or via generic light/dark fallbacks. */
export function derivePresetTones(bg: string): { bg: string; chip: string; text: string; dot: string } {
  const preset = findPresetByBg(bg);
  if (preset) return { bg: preset.bg, chip: preset.chip, text: preset.text, dot: preset.dot };
  // Fallback: use bg itself for both bg and chip, decide text from luminance, dot ≈ bg with darker cast.
  const light = isLightHex(bg);
  return {
    bg,
    chip: bg,
    text: light ? "#0f172a" : "#f8fafc",
    dot: light ? "#64748b" : "#e2e8f0",
  };
}

export const SCHEDULE_TYPES = DEFAULT_SCHEDULE_TYPES.map((e) => ({ value: e.type, label: e.type }));

export const SCHEDULE_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  오픈: {
    bg: "bg-[#dbeafe]",  // Light blue
    text: "text-slate-900 font-bold",
    border: "border-[#e2e8f0]",
    label: "오픈",
  },
  미들: {
    bg: "bg-[#e0e7ff]",  // Light indigo
    text: "text-slate-900 font-bold",
    border: "border-[#e2e8f0]",
    label: "미들",
  },
  마감: {
    bg: "bg-[#bfdbfe]", // Light blue (deeper)
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

// Fallback hex colors indexed by type name (matches DEFAULT_SCHEDULE_TYPES colors)
export const SCHEDULE_HEX_COLORS: Record<string, string> = Object.fromEntries(
  DEFAULT_SCHEDULE_TYPES.filter(e => e.color).map(e => [e.type, e.color!])
);

/** Returns the hex background color for a schedule type, preferring user-customized settings. */
export function getTypeHex(type: string, entries?: ScheduleTypeEntry[]): string {
  return entries?.find(e => e.type === type)?.color
    ?? SCHEDULE_HEX_COLORS[type]
    ?? "#f1f5f9";
}

/** Returns true if the hex color is light enough to need dark text. */
export function isLightHex(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}
