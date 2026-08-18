// src/components/common/Spinner.tsx
// 2026-08-18 · 공용 프레임워크 · Loader2 wrapper + 인라인 로딩 텍스트
//   · 반복 패턴 (Loader2 + "로딩 중...") 55+곳 · 통합
//   · LoadingState (블록형 · 페이지 전체) 와 구분 · Spinner 는 인라인·소형
//
// 사용:
//   <Spinner />                                // 14px · brand-deep
//   <Spinner size={16} tone="emerald" />
//   <Spinner label="저장 중..." />              // 아이콘 + 텍스트 nb-space
//   <Spinner label="로딩 중..." size={12} />

import { Loader2 } from "lucide-react";

export type SpinnerTone = "brand" | "emerald" | "amber" | "rose" | "sky" | "zinc" | "white";

const TONE_CLS: Record<SpinnerTone, string> = {
  brand:   "text-brand-deep",
  emerald: "text-emerald-600",
  amber:   "text-amber-600",
  rose:    "text-rose-600",
  sky:     "text-sky-600",
  zinc:    "text-zinc-400",
  white:   "text-white",
};

export interface SpinnerProps {
  /** 사이즈 (Loader2 size) · 기본 14 */
  size?: number;
  /** 톤 · 기본 brand (brand-deep) */
  tone?: SpinnerTone;
  /** 라벨 텍스트 · 있으면 옆에 표시 */
  label?: string;
  /** 라벨 폰트 사이즈 · 기본 14px */
  labelSize?: number;
  /** 추가 className (wrapper) */
  className?: string;
}

/**
 * 공용 인라인 스피너 · Loader2 + 라벨
 *   · 버튼 안 · 리스트 로딩 row · 인라인 상태 표시 등
 *   · 페이지 전체 로딩은 LoadingState 사용
 */
export function Spinner({
  size = 14,
  tone = "brand",
  label,
  labelSize = 14,
  className = "",
}: SpinnerProps) {
  const toneCls = TONE_CLS[tone];
  if (!label) {
    return <Loader2 size={size} className={`${toneCls} animate-spin ${className}`.trim()} />;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
      <Loader2 size={size} className={`${toneCls} animate-spin`} />
      <span
        className={`font-semibold ${toneCls} tracking-tight`}
        style={{ fontSize: `${labelSize}px` }}
      >
        {label}
      </span>
    </span>
  );
}

export default Spinner;
