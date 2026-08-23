// src/components/common/ListLoading.tsx
// 2026-08-04 · 공통 리스트 로딩 표시 (feedback_ui_principles B-3 · 공통 컴포넌트 원칙)
//   모든 리스트/테이블 로딩 · 통일된 스타일
//   props · size · label · fullHeight (컨테이너 전체 채움 여부)

import React from "react";
import { Spinner, type SpinnerTone } from "./Spinner";

export interface ListLoadingProps {
  /** 커스텀 라벨 · 기본 "불러오는 중..." */
  label?: string;
  /** spinner 크기 · 기본 14 */
  size?: number;
  /** 컨테이너 전체 채움 (flex-1) · 기본 false → 자체 padding */
  fullHeight?: boolean;
  /** 색상 톤 · 기본 slate */
  tone?: "slate" | "emerald" | "sky" | "indigo" | "rose";
  className?: string;
}

// 2026-08-17 v2 · 딥네이비 통일 · semantic tone (rose) 유지
const TONE_MAP: Record<NonNullable<ListLoadingProps["tone"]>, string> = {
  slate:   "text-ink-soft",
  emerald: "text-brand-deep",
  sky:     "text-brand-deep",
  indigo:  "text-brand-deep",
  rose:    "text-rose-500",
};

// ListLoading tone → Spinner tone 매핑
const SPINNER_TONE_MAP: Record<NonNullable<ListLoadingProps["tone"]>, SpinnerTone> = {
  slate:   "zinc",
  emerald: "brand",
  sky:     "brand",
  indigo:  "brand",
  rose:    "rose",
};

/**
 * 공통 리스트 로딩 인디케이터
 * 사용 예:
 *   {loading && <ListLoading />}
 *   {loading && <ListLoading label="공급사 불러오는 중..." tone="emerald" />}
 *   {loading && <ListLoading fullHeight />}
 */
export const ListLoading: React.FC<ListLoadingProps> = ({
  label = "불러오는 중...",
  size = 14,
  fullHeight = false,
  tone = "slate",
  className = "",
}) => {
  const toneCls = TONE_MAP[tone];
  const spinnerTone = SPINNER_TONE_MAP[tone];
  return (
    // 2026-08-17 v2 · 폰트 +2 (12→14) · tracking-tight · 세련
    <div
      className={`flex items-center justify-center gap-2 text-[14px] font-semibold tracking-tight ${toneCls} ${
        fullHeight ? "flex-1 min-h-0 h-full py-8" : "py-8"
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      <Spinner size={size} tone={spinnerTone} />
      <span>{label}</span>
    </div>
  );
};

export default ListLoading;
