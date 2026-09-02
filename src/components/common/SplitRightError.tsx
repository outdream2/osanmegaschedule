// src/components/common/SplitRightError.tsx
// 2026-08-24 · #261 · SplitPanel 우측 · 오류 상태 공용 프리미티브
//   · 사용처 · API 실패 · 조회 실패 · 재시도 액션
//   · Card rose border + 오류 메시지 + 재시도 버튼 (optional)
//
// 사용:
//   {error && (
//     <SplitRightError
//       title="원장 조회 실패"
//       message={ledgerError}
//       onRetry={() => reload()}
//     />
//   )}

import React from "react";
import { Card } from "./Card";

export interface SplitRightErrorProps {
  /** 제목 · 굵게 · 기본 "조회 실패" */
  title?: string;
  /** 상세 메시지 · 코드 블럭 (mono) */
  message?: string;
  /** 재시도 콜백 · 있으면 · [재시도] 버튼 표시 */
  onRetry?: () => void;
  /** 재시도 버튼 라벨 · 기본 "다시 시도" */
  retryLabel?: string;
  /** 아이콘 · title 앞 · optional */
  icon?: React.ReactNode;
  /** min-height · 기본 auto */
  minHeight?: number | string;
  /** wrapper className */
  className?: string;
}

/**
 * SplitPanel 우측 · 오류 상태 공용
 *   · Card border-rose 배경 rose-50
 *   · title (rose-700 bold) · message (mono background)
 *   · optional 재시도 버튼 (brand-deep)
 */
export function SplitRightError({
  title = "조회 실패",
  message,
  onRetry,
  retryLabel = "다시 시도",
  icon,
  minHeight,
  className = "",
}: SplitRightErrorProps) {
  const mh = typeof minHeight === "number" ? `${minHeight}px` : minHeight;
  return (
    <Card
      variant="flat"
      padding="md"
      rounded="lg"
      bg="bg-rose-50"
      borderColor="border-rose-200"
      className={`text-[14px] text-rose-700 space-y-2 ${className}`}
      style={mh ? ({ minHeight: mh } as React.CSSProperties) : undefined}
    >
      <div className="font-bold flex items-center gap-1.5">
        {icon && <span aria-hidden className="inline-flex">{icon}</span>}
        {title}
      </div>
      {message && (
        <div className="text-[14px] bg-rose-50 border border-rose-100 rounded px-2 py-1 break-words">
          {message}
        </div>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-rose-600 text-white text-[14px] font-bold hover:bg-rose-700 active:scale-[0.98] transition cursor-pointer"
        >
          {retryLabel}
        </button>
      )}
    </Card>
  );
}

export default SplitRightError;
