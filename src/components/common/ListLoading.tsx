// src/components/common/ListLoading.tsx
// 2026-08-04 · 공통 리스트 로딩 표시 (feedback_ui_principles B-3 · 공통 컴포넌트 원칙)
//   모든 리스트/테이블 로딩 · 통일된 스타일
//   props · size · label · fullHeight (컨테이너 전체 채움 여부)

import React from "react";
import { Loader2 } from "lucide-react";

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

const TONE_MAP: Record<NonNullable<ListLoadingProps["tone"]>, string> = {
  slate:   "text-zinc-400",
  emerald: "text-emerald-500",
  sky:     "text-sky-500",
  indigo:  "text-indigo-500",
  rose:    "text-rose-500",
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
  return (
    <div
      className={`flex items-center justify-center gap-2 text-[12px] font-semibold ${toneCls} ${
        fullHeight ? "flex-1 min-h-0 h-full py-8" : "py-8"
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      <Loader2 size={size} className="animate-spin" />
      <span>{label}</span>
    </div>
  );
};

export default ListLoading;
