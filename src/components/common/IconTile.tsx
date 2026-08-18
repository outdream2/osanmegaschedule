// src/components/common/IconTile.tsx
// 2026-08-18 · 공용 프레임워크 · 아이콘 컨테이너 tile
//   · 페이지/카드 헤더에 아이콘 표시용 (w-7 h-7 bg-{color}-100 flex 패턴 반복 정리)
//   · 10 tone · 3 size · rounded 통일 · inset light + subtle shadow (Attio 톤)
//
// 사용 예:
//   <IconTile icon={<Package size={14} />} tone="brand" size="md" />
//   <IconTile icon={<Bell size={12} />} tone="amber" size="sm" />
//   <IconTile icon={<Users size={16} />} tone="emerald" size="lg" />

import type { ReactNode } from "react";

export type IconTileTone = "brand" | "sky" | "emerald" | "amber" | "rose" | "violet" | "teal" | "indigo" | "zinc" | "pine";

interface ToneCls {
  bg: string;
  text: string;
}

const TONE_MAP: Record<IconTileTone, ToneCls> = {
  brand:   { bg: "bg-brand-tint",  text: "text-brand-deep" },
  sky:     { bg: "bg-sky-100",     text: "text-sky-700" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-700" },
  amber:   { bg: "bg-amber-100",   text: "text-amber-700" },
  rose:    { bg: "bg-rose-100",    text: "text-rose-700" },
  violet:  { bg: "bg-violet-100",  text: "text-violet-700" },
  teal:    { bg: "bg-teal-100",    text: "text-teal-700" },
  indigo:  { bg: "bg-indigo-100",  text: "text-indigo-700" },
  zinc:    { bg: "bg-zinc-100",    text: "text-zinc-700" },
  pine:    { bg: "bg-[#01796F]/10", text: "text-[#01796F]" },
};

export interface IconTileProps {
  /** 아이콘 · 이미 렌더된 element */
  icon: ReactNode;
  /** 색 tone · 기본 brand */
  tone?: IconTileTone;
  /** 사이즈 · sm(24) · md(28) · lg(36) · 기본 md */
  size?: "sm" | "md" | "lg";
  /** 모양 · rounded (md/lg) or full · 기본 rounded */
  shape?: "rounded" | "full";
  /** 추가 className */
  className?: string;
}

const SIZE_CLS: Record<NonNullable<IconTileProps["size"]>, string> = {
  sm: "w-6 h-6",   // 24
  md: "w-7 h-7",   // 28 (사이드바/헤더 아이콘 표준)
  lg: "w-9 h-9",   // 36
};

const SHAPE_CLS: Record<NonNullable<IconTileProps["shape"]>, string> = {
  rounded: "rounded-lg",
  full:    "rounded-full",
};

/**
 * 공용 아이콘 컨테이너 · icon + tinted background
 *   · inset light + subtle shadow (Attio 톤 · 통일)
 *   · 파스텔 다색 지양 · brand + semantic 만 사용 권장
 */
export function IconTile({
  icon,
  tone = "brand",
  size = "md",
  shape = "rounded",
  className = "",
}: IconTileProps) {
  const t = TONE_MAP[tone];
  const sizeCls = SIZE_CLS[size];
  const shapeCls = SHAPE_CLS[shape];
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${sizeCls} ${shapeCls} ${t.bg} ${t.text} shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_2px_rgba(10,46,74,0.05)] ${className}`}
    >
      {icon}
    </span>
  );
}

export default IconTile;
