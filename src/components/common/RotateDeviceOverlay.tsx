// src/components/common/RotateDeviceOverlay.tsx
// 2026-10-06 · 사용자 지시 · 태블릿 세로모드 → 가로 회전 안내 overlay
//   · needsRotate 시만 렌더 · 가로 전환 즉시 해제 · reload 불필요
//   · body scroll lock · 뒤 화면 클릭/터치 차단
//   · screen.orientation.lock() 미사용 (iPad Safari 미지원)
//   · CSS rotate(90deg) 미사용 (터치좌표 깨짐 방지)

import React from "react";
import { useTabletOrientation } from "../../hooks/useTabletOrientation";

export const RotateDeviceOverlay: React.FC = () => {
  const { needsRotate } = useTabletOrientation();

  React.useEffect(() => {
    if (!needsRotate) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [needsRotate]);

  if (!needsRotate) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="가로 모드 전환 안내"
      className="fixed inset-0 z-[10000] bg-zinc-950/95 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6"
      onClick={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.preventDefault()}
    >
      <div className="mb-6 text-white animate-pulse">
        {/* 태블릿 회전 아이콘 (SVG · 세로 → 가로 화살표) */}
        <svg
          width="96"
          height="96"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="4" y="2" width="12" height="18" rx="2" />
          <path d="M10 17h0.01" />
          <path d="M19 12l3-3-3-3" />
          <path d="M22 9H15" />
        </svg>
      </div>
      <div className="text-white text-[22px] font-bold mb-2 tracking-tight">
        가로 화면으로 돌려주세요
      </div>
      <div className="text-zinc-300 text-[15px] leading-relaxed max-w-[320px]">
        이 화면은 가로 모드에 최적화되어 있습니다.
        <br />
        기기를 회전하면 자동으로 사라집니다.
      </div>
    </div>
  );
};

export default RotateDeviceOverlay;
