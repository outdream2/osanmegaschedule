// src/components/common/LoadingState.tsx
// T-CSS Phase 1 · 2026-08-05
// 공통 로딩 상태 컴포넌트 (페이지 전체 / 섹션 레벨)
//   - 기존 ListLoading (리스트 행 내부 인디케이터)과 구분
//   - 페이지 전체 · 카드 전체 · 섹션 영역 로딩에 사용
//   - skeleton=true 시 shimmer 블록 표시 (index.css shimmer 애니메이션 활용)
//
// 사용 예:
//   {loading && <LoadingState />}
//   {loading && <LoadingState label="공급사 데이터 로딩 중..." />}
//   {loading && <LoadingState skeleton rows={5} />}

import React from "react";
import { Loader2 } from "lucide-react";

export interface LoadingStateProps {
  /** 로딩 라벨 · 기본 "로딩 중..." */
  label?: string;
  /** skeleton 모드 · true 시 shimmer 블록 표시 · 라벨 숨김 */
  skeleton?: boolean;
  /** skeleton 행 수 · 기본 3 */
  rows?: number;
  /** 세로 패딩 · 기본 normal */
  size?: "compact" | "normal" | "large";
  /** 색상 톤 프리셋 · 기본 slate */
  tone?: "slate" | "indigo" | "emerald" | "sky";
  /** 추가 className */
  className?: string;
}

const TONE_CLS: Record<NonNullable<LoadingStateProps["tone"]>, string> = {
  slate:   "text-zinc-400",
  indigo:  "text-indigo-400",
  emerald: "text-emerald-400",
  sky:     "text-sky-400",
};

const SIZE_PAD: Record<NonNullable<LoadingStateProps["size"]>, string> = {
  compact: "py-6",
  normal:  "py-12",
  large:   "py-20",
};

/** shimmer 효과가 있는 skeleton 행 */
const SkeletonRow: React.FC<{ widthCls: string }> = ({ widthCls }) => (
  <div className={`relative overflow-hidden h-4 rounded-md bg-zinc-100 ${widthCls}`}>
    <div
      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
      style={{ animation: "shimmer 1.4s ease-in-out infinite" }}
    />
  </div>
);

const ROW_WIDTHS = ["w-3/4", "w-full", "w-5/6", "w-2/3", "w-4/5", "w-full", "w-3/5"];

/**
 * 공통 로딩 상태 표시
 *   - spinner + 라벨 (기본)
 *   - skeleton=true 시 shimmer 블록 N행 표시
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  label = "로딩 중...",
  skeleton = false,
  rows = 3,
  size = "normal",
  tone = "slate",
  className = "",
}) => {
  const toneCls = TONE_CLS[tone];
  const padCls = SIZE_PAD[size];

  if (skeleton) {
    return (
      <div
        className={[
          "flex flex-col gap-3 px-4",
          padCls,
          className,
        ].filter(Boolean).join(" ")}
        role="status"
        aria-label="로딩 중"
        aria-live="polite"
      >
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow
            key={i}
            widthCls={ROW_WIDTHS[i % ROW_WIDTHS.length]}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={[
        "flex flex-col items-center justify-center gap-2.5",
        padCls,
        className,
      ].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
    >
      <Loader2
        size={22}
        className={`${toneCls} animate-spin`}
        strokeWidth={2}
      />
      <span className={`text-[12px] font-semibold ${toneCls}`}>
        {label}
      </span>
    </div>
  );
};

export default LoadingState;
