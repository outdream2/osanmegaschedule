// src/components/common/NotificationToast.tsx
// 2026-08-18 · 공용 프레임워크 · 우측 상단 프리미엄 dark toast
//   · ScanPage/ProductArrivalPage 등 반복 사용 · 통합
//   · frosted dark bg + status dot + white text · 2026 트렌드
//
// 사용:
//   {toast && <NotificationToast message={toast} />}
//   {toast && <NotificationToast message={toast} tone="teal" />}

import React from "react";

export type NotificationTone = "emerald" | "teal" | "sky" | "amber" | "rose";

const DOT_CLS: Record<NotificationTone, string> = {
  emerald: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]",
  teal:    "bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.5)]",
  sky:     "bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.5)]",
  amber:   "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]",
  rose:    "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.5)]",
};

export interface NotificationToastProps {
  /** 표시 메시지 */
  message: React.ReactNode;
  /** 상태 dot tone · 기본 emerald */
  tone?: NotificationTone;
  /** 위치 · top-right (기본) or bottom */
  position?: "top-right" | "bottom-center";
  /** 추가 className */
  className?: string;
}

/**
 * 프리미엄 dark toast · 페이지 우측 상단 · frosted + status dot
 *   · role=status · aria-live=polite (SR announce)
 *   · z-[9999] · animate-in slide-in-from-top
 */
export const NotificationToast: React.FC<NotificationToastProps> = ({
  message,
  tone = "emerald",
  position = "top-right",
  className = "",
}) => {
  const posCls = position === "bottom-center"
    ? "bottom-6 left-1/2 -translate-x-1/2 animate-in slide-in-from-bottom-2 fade-in"
    : "top-4 right-4 animate-in slide-in-from-top-2 fade-in";
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed z-[9999] inline-flex items-center gap-2.5",
        "px-4 py-3 rounded-xl",
        "bg-zinc-900/95 backdrop-blur-md text-white",
        "text-[13px] font-bold tracking-tight",
        "shadow-[0_8px_32px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)]",
        "border border-white/[0.10]",
        "duration-200",
        posCls,
        className,
      ].filter(Boolean).join(" ")}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_CLS[tone]}`} />
      <span>{message}</span>
    </div>
  );
};

export default NotificationToast;
