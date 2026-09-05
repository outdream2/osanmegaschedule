// src/components/common/SplitRightHeader.tsx
// 2026-09-06 · #261 · SplitPanel 우측 상단 공용 헤더 프리미티브
//   · SplitLeftHeader 대칭 · 우측 패널 title/subtitle/right 슬롯
//   · 폰트 +2 · Linear/Attio 톤 · shrink-0

import React from "react";

export interface SplitRightHeaderProps {
  /** 헤더 제목 · 필수 */
  title: React.ReactNode;
  /** 서브 텍스트 · 상태·코드·힌트 */
  subtitle?: React.ReactNode;
  /** 우측 슬롯 · 액션 버튼·배지·카운트 */
  right?: React.ReactNode;
  /** border-b 하단 구분선 · 기본 true */
  withBorder?: boolean;
  /** wrapper className */
  className?: string;
}

/**
 * SplitPanel 우측 상단 공용 헤더
 *   · title text-[19px] bold · subtitle text-[15px] ink-soft
 *   · border-b border-line (구분선) · pb-3 · shrink-0
 *   · role=heading aria-level=2
 */
export function SplitRightHeader({
  title,
  subtitle,
  right,
  withBorder = true,
  className = "",
}: SplitRightHeaderProps) {
  const borderCls = withBorder ? "pb-3 border-b border-line" : "";
  return (
    <div className={`flex items-start gap-2 shrink-0 ${borderCls} ${className}`}>
      <div className="flex-1 min-w-0">
        <h3
          className="text-[19px] font-bold tracking-tight text-ink leading-tight"
          role="heading"
          aria-level={2}
        >
          {title}
        </h3>
        {subtitle && (
          <div className="text-[15px] text-ink-soft mt-0.5 leading-snug">{subtitle}</div>
        )}
      </div>
      {right && (
        <div className="shrink-0 inline-flex items-center gap-1.5">{right}</div>
      )}
    </div>
  );
}

export default SplitRightHeader;
