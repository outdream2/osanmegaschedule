// src/components/SchedulePage/usePopoverPosition.ts
// 2026-09-23 · B-4 · ScheduleCell popover 위치 로직 격리 · 재사용 가능한 커스텀 훅
import { useState, useEffect } from "react";

export interface UsePopoverPositionOptions {
  anchorRef: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
  /** dayNum >= 20 등 · 초기값 hint — true 이면 초기 정렬을 "right" 로 설정 */
  forceRight?: boolean;
  /** popover 예상 폭 (px) · default 288 */
  popoverWidth?: number;
  /** viewport 우측 마진 비율 · default 0.72 */
  viewportRightThreshold?: number;
}

/**
 * 앵커 요소가 viewport 우측 가장자리에 가까운지 감지해 popover 정렬 방향을 반환한다.
 * isOpen 이 true 로 바뀔 때 BoundingClientRect 를 측정하고, anchorRef 가 없으면
 * forceRight hint 만으로 결정한다.
 */
export function usePopoverPosition({
  anchorRef,
  isOpen,
  forceRight = false,
  popoverWidth = 288,
  viewportRightThreshold = 0.72,
}: UsePopoverPositionOptions): "left" | "right" {
  const [align, setAlign] = useState<"left" | "right">(forceRight ? "right" : "left");

  useEffect(() => {
    if (isOpen && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setAlign(
        forceRight || rect.left + popoverWidth > window.innerWidth * viewportRightThreshold
          ? "right"
          : "left",
      );
    }
  }, [isOpen]);

  return align;
}
