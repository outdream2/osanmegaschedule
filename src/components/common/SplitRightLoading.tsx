// src/components/common/SplitRightLoading.tsx
// 2026-08-24 · #261 · SplitPanel 우측 · 로딩 상태 공용 프리미티브
//   · 사용처 · 데이터 fetch 중 · Spinner + label
//   · Card wrapper + Spinner center · 부드러운 배경
//
// 사용:
//   {loading && !data ? (
//     <SplitRightLoading label="매입 데이터 불러오는 중..." tone="brand" />
//   ) : ...}

import React from "react";
import { Card } from "./Card";
import { Spinner } from "./Spinner";

export interface SplitRightLoadingProps {
  /** 라벨 · Spinner 옆 · 기본 "불러오는 중..." */
  label?: string;
  /** Spinner tone · 기본 brand */
  tone?: "brand" | "sky" | "emerald" | "amber" | "rose" | "violet" | "zinc";
  /** Spinner size · 기본 20 */
  size?: number;
  /** min-height · 기본 400px */
  minHeight?: number | string;
  /** wrapper className */
  className?: string;
}

/**
 * SplitPanel 우측 · 데이터 로딩 상태 공용
 *   · Card + Spinner center · flex-1
 *   · 폰트 +2 (14px label)
 */
export function SplitRightLoading({
  label = "불러오는 중...",
  tone = "brand",
  size = 20,
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
      <Spinner size={size} tone={tone} label={label} labelSize={14} />
    </Card>
  );
}

export default SplitRightLoading;
