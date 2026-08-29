// src/components/common/ActionBar.tsx
// 2026-08-29 · #122 P6 · 시스템설정 목업 · action-bar 프리미티브
//
// 목업 · docs/UI_MOCKUP_SETTINGS_SHELL_V2_2026-08-26.html
//   · sticky bottom · gradient fade-in · backdrop-blur · 액션 버튼 우측 정렬
//
// 사용:
//   <ActionBar left={<InfoText />} right={<><CancelBtn /><SaveBtn /></>} />
//   <ActionBar right={<SaveBtn />} sticky={false} />       // static · 페이지 하단

import React from "react";

export interface ActionBarProps {
  /** 좌측 슬롯 (예: 안내 텍스트 · 상태 배지) */
  left?: React.ReactNode;
  /** 우측 슬롯 (예: 취소·저장 버튼) */
  right?: React.ReactNode;
  /** sticky 활성 (기본 true) · false 면 static */
  sticky?: boolean;
  className?: string;
}

export function ActionBar({ left, right, sticky = true, className = "" }: ActionBarProps) {
  const stickyCls = sticky ? "sticky bottom-0 z-10" : "";
  return (
    <div
      className={`${stickyCls} flex items-center justify-between gap-3 py-3 mt-2 border-t border-line backdrop-blur-md ${className}`.trim()}
      style={sticky ? { background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.95) 30%, #fff)" } : { background: "#fff" }}
    >
      <div className="flex items-center gap-2 min-w-0">{left}</div>
      <div className="flex items-center gap-2 shrink-0">{right}</div>
    </div>
  );
}

export default ActionBar;
