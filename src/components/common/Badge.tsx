// src/components/common/Badge.tsx
// 2026-08-23 · 공용 프레임워크 · 유연한 배지 (StatusPill 보완)
//   · StatusPill 은 pill 강제 · Badge 는 shape·variant 유연
//   · 통일 tone 시스템 + 커스텀 fallback
//   · 함수 색상 매핑 (positionColor 등) 도 Badge 로 이관 가능
//
// 사용:
//   <Badge tone="emerald">완료</Badge>                            // 기본 rounded-md · sm
//   <Badge tone="rose" variant="filled">거절</Badge>              // filled · bg 진함 · text-white
//   <Badge tone="amber" shape="pill" size="xs">대기</Badge>       // rounded-full
//   <Badge className="bg-purple-100 text-purple-700 border-purple-200">커스텀</Badge>  // tone 미사용

import type { ReactNode } from "react";
import type { PillTone } from "./StatusPill";

// StatusPill 의 PillTone 재사용 (통일성)
export type BadgeTone = PillTone;
export type BadgeVariant = "soft" | "filled" | "outline";
export type BadgeShape = "pill" | "rounded" | "square";
export type BadgeSize = "xs" | "sm" | "md";

// tone × variant 조합 · 정확 매칭
const TONE_STYLES: Record<BadgeTone, { soft: string; filled: string; outline: string }> = {
  brand:   { soft: "bg-brand-tint text-brand-deep border-brand/15",       filled: "bg-brand-deep text-white border-brand-deep",         outline: "text-brand-deep border-brand-deep/40" },
  sky:     { soft: "bg-sky-50 text-sky-700 border-sky-200",               filled: "bg-sky-600 text-white border-sky-600",               outline: "text-sky-700 border-sky-300" },
  emerald: { soft: "bg-emerald-50 text-emerald-700 border-emerald-200",   filled: "bg-emerald-600 text-white border-emerald-600",       outline: "text-emerald-700 border-emerald-300" },
  amber:   { soft: "bg-amber-50 text-amber-700 border-amber-200",         filled: "bg-amber-500 text-white border-amber-500",           outline: "text-amber-700 border-amber-300" },
  rose:    { soft: "bg-rose-50 text-rose-700 border-rose-200",            filled: "bg-rose-600 text-white border-rose-600",             outline: "text-rose-700 border-rose-300" },
  violet:  { soft: "bg-violet-50 text-violet-700 border-violet-200",      filled: "bg-violet-600 text-white border-violet-600",         outline: "text-violet-700 border-violet-300" },
  teal:    { soft: "bg-teal-50 text-teal-700 border-teal-200",            filled: "bg-teal-600 text-white border-teal-600",             outline: "text-teal-700 border-teal-300" },
  indigo:  { soft: "bg-indigo-50 text-indigo-700 border-indigo-200",      filled: "bg-indigo-600 text-white border-indigo-600",         outline: "text-indigo-700 border-indigo-300" },
  zinc:    { soft: "bg-zinc-100 text-zinc-700 border-line",               filled: "bg-zinc-700 text-white border-zinc-700",             outline: "text-zinc-700 border-zinc-300" },
  pine:    { soft: "bg-[#01796F]/10 text-[#01796F] border-[#01796F]/30",  filled: "bg-[#01796F] text-white border-[#01796F]",           outline: "text-[#01796F] border-[#01796F]/40" },
};

const SHAPE_CLS: Record<BadgeShape, string> = {
  pill:    "rounded-full",
  rounded: "rounded-md",
  square:  "",
};

const SIZE_CLS: Record<BadgeSize, string> = {
  xs: "text-[11px] px-1.5 py-0.5 gap-0.5",
  sm: "text-[12px] px-2 py-0.5 gap-1",
  md: "text-[13px] px-2.5 py-1 gap-1",
};

export interface BadgeProps {
  /** tone · 미설정 시 className 만 사용 (커스텀 색) */
  tone?: BadgeTone;
  /** variant · soft (기본 · 옅은 배경) · filled (진한 배경 · 흰 텍스트) · outline (테두리만) */
  variant?: BadgeVariant;
  /** 형태 · rounded (rounded-md · 기본) · pill (rounded-full) · square (rounded 없음) */
  shape?: BadgeShape;
  /** 사이즈 · xs · sm (기본) · md */
  size?: BadgeSize;
  /** 아이콘 (좌측) */
  icon?: ReactNode;
  /** 추가 className · tone 없이 커스텀 색상 지정 시 사용 */
  className?: string;
  /** 클릭 (선택) */
  onClick?: () => void;
  children: ReactNode;
}

/**
 * 공용 유연 배지 · StatusPill 보완
 *   · shape · variant 자유 조합
 *   · custom color · className 만으로 재사용 가능
 */
export function Badge({
  tone,
  variant = "soft",
  shape = "rounded",
  size = "sm",
  icon,
  className = "",
  onClick,
  children,
}: BadgeProps) {
  const toneCls = tone ? TONE_STYLES[tone][variant] : "";
  const shapeCls = SHAPE_CLS[shape];
  const sizeCls = SIZE_CLS[size];
  const clickableCls = onClick ? "cursor-pointer hover:brightness-95 active:scale-[0.98] transition-all" : "";
  const borderCls = tone ? "border" : "";

  return (
    <span
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex items-center font-semibold whitespace-nowrap leading-tight ${borderCls} ${shapeCls} ${sizeCls} ${toneCls} ${clickableCls} ${className}`.trim()}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      {children}
    </span>
  );
}

export default Badge;
