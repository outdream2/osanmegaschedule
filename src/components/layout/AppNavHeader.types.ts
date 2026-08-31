// src/components/layout/AppNavHeader.types.ts
// AppNavHeader 내부 타입 · 분리된 서브컴포넌트와 공유
import React from "react";

export interface TabDef {
  key: string;
  label: string;
  mobileLabel: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number; weight?: any }>;
  managerOnly: boolean;
  pharmacistOnly?: boolean;
  iconClassName?: string;
  color?: "slate" | "blue" | "red" | "sky" | "indigo" | "orange" | "emerald" | "violet" | "amber" | "cyan";
}

export const TAB_COLOR_MAP: Record<string, { activeBg: string; activeText: string; inactiveText: string; inactiveHoverText: string; }> = {
  slate:   { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  blue:    { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  red:     { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  sky:     { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  indigo:  { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  orange:  { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  emerald: { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  violet:  { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  amber:   { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  cyan:    { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
};
