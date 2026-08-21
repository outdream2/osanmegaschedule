// 2026-08-19 · 공용 프레임워크 · Card (surface + variant + padding + rounded)
//   · 41+ 반복 패턴 통합 · bg-white border border-line rounded-xl shadow-sm overflow-hidden
//   · Attio 세련 톤 · inset light + 2-layer shadow (Panel/PageToolbar 와 통일)
//
// 사용 예:
//   <Card>기본 카드 (shadow-sm · rounded-xl · p-4)</Card>
//   <Card variant="md" padding="lg">더 두꺼운 shadow · 큰 padding</Card>
//   <Card padding="none" className="overflow-hidden"><Table /></Card>
//   <Card as="button" onClick={handler} variant="lg">클릭 가능</Card>

import React from "react";
import type { CSSProperties, ReactNode } from "react";

// 2026-08-21 · raw-* 추가 · tailwind 원본 shadow 그대로 (레거시 wrapper 이관 시 시각 동일 · 나중에 sm/md/lg 으로 승격)
//   · raw-sm  · tailwind shadow-sm
//   · raw-md  · tailwind shadow-md
//   · raw-lg  · tailwind shadow-lg
//   · brand-modal · shadow-brand-modal (모달 · 이미 프로젝트 정의 토큰)
export type CardVariant = "flat" | "raw-sm" | "raw-md" | "raw-lg" | "brand-modal" | "sm" | "md" | "lg";
export type CardPadding = "none" | "sm" | "md" | "lg";
export type CardRounded = "md" | "lg" | "xl" | "2xl";

const VARIANT_SHADOW: Record<CardVariant, string> = {
  flat: "",
  "raw-sm": "shadow-sm",
  "raw-md": "shadow-md",
  "raw-lg": "shadow-lg",
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
  /** semantic 태그 · 기본 div */
  as?: "div" | "button" | "section" | "article" | "aside";
  /** onClick · button 스타일 자동 (cursor-pointer + hover) */
  onClick?: () => void;
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
  const baseCls = [
    "bg-white",
    "border",
    "border-line",
    ROUNDED_CLS[rounded],
    VARIANT_SHADOW[variant],
    PADDING_CLS[padding],
    clip ? "overflow-hidden" : "",
    onClick ? "cursor-pointer hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_2px_4px_rgba(10,46,74,0.08),0_8px_20px_-4px_rgba(10,46,74,0.14)] hover:-translate-y-0.5 transition-all duration-200 ease-out active:translate-y-0" : "",
    className,
  ].filter(Boolean).join(" ");

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
      {children}
    </Tag>
  );
};

export default Card;
