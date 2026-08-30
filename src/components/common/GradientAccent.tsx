// src/components/common/GradientAccent.tsx
// 2026-08-29 · #122 Phase 4 · 프레임워크 프리미티브 · 상단 가로 gradient accent
//
// 이미 여러 곳 (Card top border · SplitListPanel · SplitRightHeader · ProductDetailHero 등) 에서
// 인라인으로 반복 사용되는 3px gradient (brand-deep → sky-500 → brand-deep) 을 프리미티브화.
// 신규 페이지·컴포넌트에서 · 브랜드 시그니처 · 통일된 사용을 위한 프리미티브.
//
// 사용:
//   <div className="relative">
//     <GradientAccent />        // 상단 3px · 기본 · brand gradient
//     <div>본문 ...</div>
//   </div>
//   <GradientAccent size="thick" />   // 5px · Hero 카드
//   <GradientAccent tone="soft" />    // opacity-60 · sub 헤더

import React from "react";

export type GradientAccentSize = "thin" | "default" | "thick";
export type GradientAccentTone = "brand" | "soft";

export interface GradientAccentProps {
  size?: GradientAccentSize;
  tone?: GradientAccentTone;
  /** 상위 컨테이너 · position: relative 필요 (absolute 로 상단 고정) · 기본 true */
  absolute?: boolean;
  className?: string;
}

const SIZE_CLS: Record<GradientAccentSize, string> = {
  thin:    "h-[2px]",
  default: "h-[3px]",
  thick:   "h-[5px]",
};

const TONE_CLS: Record<GradientAccentTone, string> = {
  brand: "opacity-90",
  soft:  "opacity-60",
};

/**
 * 상단 가로 gradient accent · brand-deep → sky-500 → brand-deep
 *   · 신규 페이지·카드 · 브랜드 시그니처 통일
 *   · absolute=true (기본) · 상위 컨테이너 relative 필수
 *   · absolute=false · block 요소로 · 컨테이너 최상단 삽입 (ProductDetailHero 스타일)
 */
export function GradientAccent({
  size = "default",
  tone = "brand",
  absolute = true,
  className = "",
}: GradientAccentProps) {
  const posCls = absolute ? "absolute top-0 left-0 right-0 z-10 pointer-events-none" : "w-full";
  return (
    <span
      aria-hidden="true"
      className={`${posCls} ${SIZE_CLS[size]} bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep ${TONE_CLS[tone]} ${className}`.trim()}
    />
  );
}

export default GradientAccent;
