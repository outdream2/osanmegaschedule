// src/components/common/SplitRightLoading.tsx
// 2026-09-06 · #261 · SplitPanel 우측 · 로딩 상태 공용 프리미티브
//   · SplitRightEmpty / SplitRightError 대칭
//   · Spinner + label · Card wrapper

import React from "react";
import { Card } from "./Card";
import { Spinner } from "./Spinner";

export interface SplitRightLoadingProps {
  /** 로딩 라벨 · 기본 "불러오는 중..." */
  label?: string;
  /** min-height · 기본 400px */
  minHeight?: number | string;
  /** wrapper className */
  className?: string;
}

/**
 * SplitPanel 우측 · 로딩 상태 공용
 *   · Card border-line rounded-xl
 *   · 중앙 Spinner + label
 *   · flex-1 · minHeight
 */
export function SplitRightLoading({
  label = "불러오는 중...",
  minHeight = 400,
  className = "",
}: SplitRightLoadingProps) {
  const mh = typeof minHeight === "number" ? `${minHeight}px` : minHeight;
  return (
    <Card
      variant="raw-sm"
      padding="none"
      rounded="xl"
      className={`flex items-center justify-center flex-1 ${className}`}
      style={{ minHeight: mh } as React.CSSProperties}
    >
      <Spinner size={18} tone="brand" label={label} labelSize={15} />
    </Card>
  );
}

export default SplitRightLoading;
