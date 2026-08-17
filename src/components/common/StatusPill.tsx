// src/components/common/StatusPill.tsx
// 2026-08-17 · 공용 프레임워크 · 상태/카운트 배지
//   · 통일된 pill · rounded-full · border · optional dot
//   · 프레임워크 재사용 (여러 페이지의 배지 자체 스타일 통일)
//
// 사용 예:
//   <StatusPill tone="brand" dot>12건</StatusPill>
//   <StatusPill tone="emerald" dot>승인 완료</StatusPill>
//   <StatusPill tone="amber">대기</StatusPill>
//   <StatusPill tone="rose" pulse>미결</StatusPill>

import type { ReactNode } from "react";

export type PillTone = "brand" | "sky" | "emerald" | "amber" | "rose" | "violet" | "teal" | "indigo" | "zinc";

interface PillCls {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

const TONE_MAP: Record<PillTone, PillCls> = {
  brand:   { bg: "bg-brand-tint",  text: "text-brand-deep",  border: "border-brand/15",       dot: "bg-brand-deep" },
  sky:     { bg: "bg-sky-50",      text: "text-sky-700",     border: "border-sky-200",        dot: "bg-sky-500" },
  emerald: { bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200",    dot: "bg-emerald-500" },
  amber:   { bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200",      dot: "bg-amber-500" },
  rose:    { bg: "bg-rose-50",     text: "text-rose-700",    border: "border-rose-200",       dot: "bg-rose-500" },
  violet:  { bg: "bg-violet-50",   text: "text-violet-700",  border: "border-violet-200",     dot: "bg-violet-500" },
  teal:    { bg: "bg-teal-50",     text: "text-teal-700",    border: "border-teal-200",       dot: "bg-teal-500" },
  indigo:  { bg: "bg-indigo-50",   text: "text-indigo-700",  border: "border-indigo-200",     dot: "bg-indigo-500" },
  zinc:    { bg: "bg-zinc-100",    text: "text-zinc-700",    border: "border-line",           dot: "bg-zinc-400" },
};

export interface StatusPillProps {
  /** 색 tone · 기본 brand */
  tone?: PillTone;
  /** 사이즈 · xs (px-2 h-5 text-11) · sm (px-2.5 h-6 text-12) · md (px-2.5 py-0.5 text-13) · 기본 sm */
  size?: "xs" | "sm" | "md";
  /** 좌측 dot 표시 (Vercel 규칙 ≤10px · 여기선 6px) */
  dot?: boolean;
  /** dot 애니메이션 (pulse) · pending/urgent 상태에 */
  pulse?: boolean;
  /** 아이콘 (선택 · dot 대신) */
  icon?: ReactNode;
  /** tabular-nums (숫자 정렬용) · 기본 true */
  tabular?: boolean;
  /** 클릭 (선택) */
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

const SIZE_CLS: Record<NonNullable<StatusPillProps["size"]>, string> = {
  xs: "h-5 px-2 text-[11px] gap-1",
  sm: "h-6 px-2.5 text-[12px] gap-1.5",
  md: "px-2.5 py-0.5 text-[13px] gap-1.5",
};

/**
 * 통일 상태 pill
 *   · rounded-full · border · optional dot/icon
 *   · tone (brand/sky/emerald/amber/rose/violet/teal/indigo/zinc)
 *   · dot + pulse · pending/urgent 시각화
 */
export function StatusPill({
  tone = "brand",
  size = "sm",
  dot = false,
  pulse = false,
  icon,
  tabular = true,
  onClick,
  className = "",
  children,
}: StatusPillProps) {
  const t = TONE_MAP[tone];
  const sizeCls = SIZE_CLS[size];
  const numericCls = tabular ? "tabular-nums" : "";
  const clickableCls = onClick ? "cursor-pointer hover:brightness-95 active:scale-[0.98] transition-all" : "";

  return (
    <span
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex items-center rounded-full font-semibold border whitespace-nowrap ${t.bg} ${t.text} ${t.border} ${sizeCls} ${numericCls} ${clickableCls} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${t.dot} ${pulse ? "animate-pulse" : ""}`}
        />
      )}
      {icon && !dot && (
        <span className="inline-flex shrink-0">{icon}</span>
      )}
      {children}
    </span>
  );
}

export default StatusPill;
