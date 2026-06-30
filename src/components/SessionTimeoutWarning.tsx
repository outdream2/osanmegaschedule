// src/components/SessionTimeoutWarning.tsx
import React, { useEffect, useState } from "react";
import { AlertTriangle, Clock, X } from "lucide-react";

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
  }, [countdown > 0]); // restart only when we go from 0→positive

  const urgent = countdown <= 60;

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-label="세션 만료 경고"
      className={`
        fixed bottom-5 right-5 z-[9999] w-80 rounded-xl shadow-2xl
        border backdrop-blur-sm
        ${urgent
          ? "bg-red-950/95 border-red-500/60 text-red-100"
          : "bg-gray-900/95 border-yellow-500/60 text-yellow-50"}
        transition-colors duration-500
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle
            size={18}
            className={urgent ? "text-red-400" : "text-yellow-400"}
          />
          <span className="font-semibold text-sm">세션 만료 임박</span>
        </div>
        <button
          onClick={onExtend}
          aria-label="경고 닫기"
          className="text-gray-400 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 pb-3">
        <p className="text-xs text-gray-300 leading-relaxed">
          장시간 활동이 없어 곧 자동 로그아웃됩니다.
          <br />
          작업 중이라면 <strong className="text-white">계속 사용</strong>을 눌러 세션을 연장하세요.
        </p>

        {/* Countdown */}
        <div className="flex items-center gap-1.5 mt-3">
          <Clock size={14} className={urgent ? "text-red-400" : "text-yellow-400"} />
          <span className={`font-mono text-lg font-bold tabular-nums ${urgent ? "text-red-300" : "text-yellow-300"}`}>
            {formatTime(countdown)}
          </span>
          <span className="text-xs text-gray-400 ml-1">후 자동 로그아웃</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 pb-4">
        <button
          onClick={onExtend}
          className={`
            flex-1 rounded-lg py-2 text-sm font-semibold transition-colors
            ${urgent
              ? "bg-red-500 hover:bg-red-400 text-white"
              : "bg-yellow-500 hover:bg-yellow-400 text-gray-900"}
          `}
        >
          계속 사용
        </button>
        <button
          onClick={onLogout}
          className="flex-1 rounded-lg py-2 text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
};
