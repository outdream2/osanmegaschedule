// src/components/SessionTimeoutWarning.tsx
// 2026-09-14 · UI 폴리시 · 최신 트렌드 (Linear/Vercel/Notion) · 텍스트 사이즈 축소 · glassmorphism
import React, { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { WarningCircle } from "@phosphor-icons/react";

interface Props {
  /** Seconds remaining at the moment the warning was first shown */
  initialSeconds: number;
  onExtend: () => void;
  onLogout: () => void;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

export const SessionTimeoutWarning: React.FC<Props> = ({
  initialSeconds,
  onExtend,
  onLogout,
}) => {
  const [countdown, setCountdown] = useState(initialSeconds);

  // Sync when the parent passes a fresh initialSeconds (e.g. after ticker fires)
  useEffect(() => {
    setCountdown(initialSeconds);
  }, [initialSeconds]);

  // Local 1-second countdown for smooth display
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [countdown > 0]);

  const urgent = countdown <= 60;

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-label="세션 만료 경고"
      className={`
        fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px)+8px)] right-4 z-[9999]
        w-full max-w-[280px] rounded-2xl
        border backdrop-blur-md
        shadow-[0_4px_16px_-4px_rgba(0,0,0,0.15),0_16px_48px_-16px_rgba(0,0,0,0.35)]
        transition-colors duration-300
        ${urgent
          ? "bg-white/95 border-rose-200/70 text-ink"
          : "bg-white/95 border-line text-ink"}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5">
          <WarningCircle
            size={14}
            weight="fill"
            className={urgent ? "text-rose-500" : "text-amber-500"}
          />
          <span className="text-[10px] font-semibold text-ink tracking-tight">세션 만료 임박</span>
        </div>
        <button
          onClick={onExtend}
          aria-label="경고 닫기"
          className="text-zinc-400 hover:text-zinc-700 transition-colors -m-1 p-1 cursor-pointer"
        >
          <X size={12} strokeWidth={2.4} />
        </button>
      </div>

      {/* Body */}
      <div className="px-3 pb-2.5">
        <p className="text-[9px] text-ink-soft leading-relaxed">
          장시간 활동 없음 · 자동 로그아웃 예정
        </p>

        {/* Countdown */}
        <div className="flex items-center gap-1 mt-1.5">
          <Clock size={11} className={urgent ? "text-rose-500" : "text-amber-500"} strokeWidth={2.4} />
          <span className={`text-[13px] font-bold tabular-nums tracking-tight ${urgent ? "text-rose-600" : "text-amber-600"}`}>
            {formatTime(countdown)}
          </span>
          <span className="text-[8px] text-ink-soft/70 ml-0.5">후 로그아웃</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 px-3 pb-3">
        <button
          onClick={onExtend}
          className={`
            flex-1 h-7 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer active:scale-[0.98]
            ${urgent
              ? "bg-rose-500 hover:bg-rose-600 text-white shadow-sm"
              : "bg-brand-deep hover:bg-[#0d3a5c] text-white shadow-sm"}
          `}
        >
          계속 사용
        </button>
        <button
          onClick={onLogout}
          className="flex-1 h-7 rounded-lg text-[10px] font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors cursor-pointer active:scale-[0.98]"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
};
