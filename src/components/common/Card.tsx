// 2026-08-19 · 공용 프레임워크 · Card (surface + variant + padding + rounded)
//   · 41+ 반복 패턴 통합 · bg-white border border-line rounded-xl shadow-sm overflow-hidden
//   · Attio 세련 톤 · inset light + 2-layer shadow (Panel/PageToolbar 와 통일)
// 2026-08-23 · v2 · borderColor prop 추가 · custom tint border (emerald/amber/rose 등)
//   · custom border 카드 마이그레이션 커버리지 확대 (이전 시도 실패 개선)
//
// 사용 예:
//   <Card>기본 카드 (shadow-sm · rounded-xl · p-4)</Card>
//   <Card variant="md" padding="lg">더 두꺼운 shadow · 큰 padding</Card>
//   <Card padding="none" className="overflow-hidden"><Table /></Card>
//   <Card as="button" onClick={handler} variant="lg">클릭 가능</Card>
//   <Card borderColor="border-emerald-200">emerald 테두리 카드</Card>
//   <Card bg="bg-emerald-50/50">tinted 배경 카드</Card>

import React from "react";
import type { CSSProperties, ReactNode } from "react";

// 2026-08-21 · raw-* 추가 · tailwind 원본 shadow 그대로 (레거시 wrapper 이관 시 시각 동일 · 나중에 sm/md/lg 으로 승격)
//   · raw-sm  · tailwind shadow-sm
//   · raw-md  · tailwind shadow-md
//   · raw-lg  · tailwind shadow-lg
//   · raw-xl  · tailwind shadow-xl
//   · brand-modal · shadow-brand-modal (모달 · 이미 프로젝트 정의 토큰)
export type CardVariant = "flat" | "raw-sm" | "raw-md" | "raw-lg" | "raw-xl" | "brand-modal" | "sm" | "md" | "lg";
export type CardPadding = "none" | "sm" | "md" | "lg";
export type CardRounded = "md" | "lg" | "xl" | "2xl";

const VARIANT_SHADOW: Record<CardVariant, string> = {
  flat: "",
  "raw-sm": "shadow-sm",
  "raw-md": "shadow-md",
  "raw-lg": "shadow-lg",
  "raw-xl": "shadow-xl",
  "brand-modal": "shadow-brand-modal",
  sm: "shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_2px_rgba(10,46,74,0.05),0_2px_8px_-2px_rgba(10,46,74,0.06)]",
  md: "shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_3px_rgba(10,46,74,0.08),0_4px_16px_-4px_rgba(10,46,74,0.10)]",
  lg: "shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_3px_rgba(10,46,74,0.12),0_8px_32px_-8px_rgba(10,46,74,0.24)]",
};

const PADDING_CLS: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

const ROUNDED_CLS: Record<CardRounded, string> = {
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
};

export interface CardProps {
  /** shadow depth · 기본 sm */
  variant?: CardVariant;
  /** padding · 기본 md (p-4) */
  padding?: CardPadding;
  /** rounded · 기본 xl */
  rounded?: CardRounded;
  /** true 시 · overflow-hidden 추가 (테이블·이미지 wrap 용) */
  clip?: boolean;
  /** 2026-08-24 · v9 · 상단 2px gradient accent (brand-deep → sky-500 → brand-deep) · true 시 clip 자동 · relative 자동 */
  topAccent?: boolean;
  /** 배경 override · 기본 bg-white · 예: "bg-emerald-50/50" · "bg-amber-50/70" */
  bg?: string;
  /** 테두리 색 override · 기본 border-line · 예: "border-emerald-200" · "border-amber-300" */
  borderColor?: string;
  /** semantic 태그 · 기본 div */
  as?: "div" | "button" | "section" | "article" | "aside";
  // 2026-08-21 · MouseEventHandler 확장 · e.stopPropagation() 등 이벤트 접근 필요 케이스 지원
  /** onClick · button 스타일 자동 (cursor-pointer + hover) · e 인자 optional */
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  /** 추가 className */
  className?: string;
  /** inline style */
  style?: CSSProperties;
  /** ARIA role */
  role?: string;
  /** ARIA label */
  "aria-label"?: string;
  /** disabled · button as 일 때만 */
  disabled?: boolean;
  /** button type · button as 일 때 · 기본 button */
  type?: "button" | "submit" | "reset";
  children: ReactNode;
}

/**
 * 공용 Card 서페이스
 *   · 기본 bg-white border border-line rounded-xl shadow-sm
 *   · Panel · CollapseCard · KpiCard 등 · 하위 개념 재사용 가능
 *   · variant · padding · rounded · clip · onClick 지원
 */
export const Card: React.FC<CardProps> = ({
  variant = "sm",
  padding = "md",
  rounded = "xl",
  clip = false,
  topAccent = false,
  bg,
  borderColor,
  as = "div",
  onClick,
  className = "",
  style,
  role,
  disabled,
  type = "button",
  children,
  ...rest
}) => {
  // v2 · bg · borderColor override · 기본 bg-white · border-line
  const bgCls = bg ?? "bg-white";
  const borderClsColor = borderColor ?? "border-line";
  // 2026-08-24 · topAccent · clip + relative 자동
  const effectiveClip = clip || topAccent;
  const baseCls = [
    topAccent ? "relative" : "",
    bgCls,
    "border",
    borderClsColor,
    ROUNDED_CLS[rounded],
    VARIANT_SHADOW[variant],
    PADDING_CLS[padding],
    effectiveClip ? "overflow-hidden" : "",
    onClick ? "cursor-pointer hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_2px_4px_rgba(10,46,74,0.08),0_8px_20px_-4px_rgba(10,46,74,0.14)] hover:-translate-y-0.5 transition-all duration-200 ease-out active:translate-y-0" : "",
    className,
  ].filter(Boolean).join(" ");

  // 2026-08-24 · v9 · 상단 2px gradient accent · brand-deep → sky-500 → brand-deep · opacity-90
  const accentSpan = topAccent ? (
    <span
      aria-hidden
      className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-10 pointer-events-none"
    />
  ) : null;

  if (as === "button") {
    return (
      <button
        type={type}
        onClick={onClick}
        className={baseCls}
        disabled={disabled}
        style={style}
        aria-label={(rest as any)["aria-label"]}
      >
        {accentSpan}
        {children}
      </button>
    );
  }

  const Tag: any = as;
  return (
    <Tag
      className={baseCls}
      style={style}
      onClick={onClick}
      role={role}
      aria-label={(rest as any)["aria-label"]}
    >
      {accentSpan}
      {children}
    </Tag>
  );
};

export default Card;
