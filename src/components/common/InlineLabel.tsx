// src/components/common/InlineLabel.tsx
// 2026-08-18 · 공용 프레임워크 · AccentBar + 라벨 (inline)
//   · 반복 사용: 필터 그룹·툴바 앞 (14+ 파일)
//   · SectionLabel 은 mb 있는 블록형 · InlineLabel 은 inline · flex row 안 사용
//   · size sm(14px+bar14)/md(15px+bar16)/lg(16px+bar18)
//
// 사용:
//   <InlineLabel>기간</InlineLabel>
//   <InlineLabel size="sm">비교 기간</InlineLabel>
//   <InlineLabel size="lg">분류</InlineLabel>

import type { ReactNode } from "react";
import { AccentBar, type AccentBarSize } from "./AccentBar";

export type InlineLabelSize = "sm" | "md" | "lg";

export interface InlineLabelProps {
  children: ReactNode;
  /** 사이즈 · sm(14px + bar sm) · md(15px + bar md, 기본) · lg(16px + bar lg) */
  size?: InlineLabelSize;
  className?: string;
}

const TEXT_CLS: Record<InlineLabelSize, string> = {
  sm: "text-[14px]",
  md: "text-[15px]",
  lg: "text-[16px]",
};

const BAR_SIZE: Record<InlineLabelSize, AccentBarSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
};

const GAP_CLS: Record<InlineLabelSize, string> = {
  sm: "gap-1.5",
  md: "gap-2",
  lg: "gap-2",
};

/**
 * 인라인 라벨 · AccentBar + text · 필터·툴바 앞에 배치
 *   · brand-deep tone (SectionLabel 의 brand teal 과 구분)
 *   · shrink-0 · tracking-tight · font-bold
 */
export function InlineLabel({ children, size = "md", className = "" }: InlineLabelProps) {
  const textCls = TEXT_CLS[size];
  const gapCls = GAP_CLS[size];
  return (
    <span className={`inline-flex items-center ${gapCls} shrink-0 ${className}`}>
      <AccentBar size={BAR_SIZE[size]} />
      <span className={`${textCls} font-bold text-ink tracking-tight`}>{children}</span>
    </span>
  );
}

export default InlineLabel;
