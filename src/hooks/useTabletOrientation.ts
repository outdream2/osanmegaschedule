// src/hooks/useTabletOrientation.ts
// 2026-10-06 · 사용자 지시 · 태블릿 세로모드 → 가로회전 overlay 트리거
//   · isTablet · min(w,h) ≥ 600 && max(w,h) ≤ 1400 (휴대폰·PC 제외)
//   · isPortrait · innerHeight > innerWidth
//   · needsRotate · isTablet && isPortrait
//   · resize + orientationchange 이벤트로 상태 갱신 · 가로 전환 즉시 해제

import * as React from "react";

interface TabletOrientationState {
  isTablet: boolean;
  isPortrait: boolean;
  needsRotate: boolean;
}

function compute(): TabletOrientationState {
  if (typeof window === "undefined") {
    return { isTablet: false, isPortrait: false, needsRotate: false };
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  const minDim = Math.min(w, h);
  const maxDim = Math.max(w, h);
  const isTablet = minDim >= 600 && maxDim <= 1400;
  const isPortrait = h > w;
  return { isTablet, isPortrait, needsRotate: isTablet && isPortrait };
}

export function useTabletOrientation(): TabletOrientationState {
  const [state, setState] = React.useState<TabletOrientationState>(compute);

  React.useEffect(() => {
    const update = () => setState(compute());
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    // 초기 마운트 후 1회 재확인 (SSR hydration mismatch 방지)
    update();
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return state;
}
