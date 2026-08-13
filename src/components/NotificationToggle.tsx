// src/components/NotificationToggle.tsx
// 상단 헤더 · 알림 허용 온/오프 스위치
// - 현재 브라우저 권한 + 구독 상태 표시
// - ON: 브라우저 팝업 → 권한 요청 → /api/push-subscribe 호출
// - OFF: 서버에 push_subscription 삭제 요청 + 로컬 unsubscribe

import React, { useEffect, useState, useCallback } from "react";
import { BellRing, BellOff } from "lucide-react";
import { usePushSubscription } from "../hooks/usePushSubscription";
import type { AuthSession } from "../types";

interface Props {
  authSession: AuthSession | null;
}

type Status = "loading" | "on" | "off" | "denied" | "unsupported";

export const NotificationToggle: React.FC<Props> = ({ authSession }) => {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const employeeId = authSession?.employeeId ?? null;
  const { subscribe } = usePushSubscription({ employeeId, auto: false });

  const detect = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") { setStatus("denied"); return; }
    if (Notification.permission !== "granted") { setStatus("off"); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    } catch {
      setStatus("off");
    }
  }, []);

  useEffect(() => { void detect(); }, [detect]);

  const turnOn = async () => {
    if (busy || !employeeId) return;
    setBusy(true);
    try {
      const r = await subscribe({ force: true });
      if (r.ok) setStatus("on");
      else if (r.reason === "permission_denied") setStatus("denied");
      else setStatus("off");
    } finally { setBusy(false); }
  };

  const turnOff = async () => {
    if (busy || !employeeId) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe().catch(() => null);
      await fetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, subscription: null }),
      }).catch(() => null);
      try { localStorage.removeItem("megatown_push_subscribed_auto"); } catch { /* ignore */ }
      setStatus("off");
    } finally { setBusy(false); }
  };

  if (!employeeId || status === "unsupported") return null;

  const isOn = status === "on";
  const isDenied = status === "denied";
  const title = isDenied
    ? "브라우저 알림 차단됨 · 브라우저 사이트 설정에서 허용"
    : isOn
    ? "알림 ON · 탭하여 끄기"
    : "알림 OFF · 탭하여 켜기";

  return (
    <div className="flex items-center gap-1 shrink-0" title={title}>
      {/* 2026-08-12 · 사용자 지시 · "알림 " prefix 제거 · ON/OFF/차단 만 · 여백 반으로 (gap-1.5→gap-1) */}
      <span className={`text-[11px] font-black tracking-tight hidden sm:inline ${
        isDenied ? "text-zinc-400" : isOn ? "text-emerald-600" : "text-zinc-500"
      }`}>
        {isDenied ? "차단" : isOn ? "ON" : "OFF"}
      </span>
      {/* iOS 스타일 토글 스위치 — 더 크게 · 뚜렷한 색상 */}
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        onClick={isOn ? turnOff : turnOn}
        disabled={busy || isDenied}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full border transition-colors duration-200 cursor-pointer shadow-sm ${
          isDenied
            ? "bg-zinc-200 border-zinc-400 cursor-not-allowed"
            : isOn
            ? "bg-emerald-500 border-emerald-600"
            : "bg-zinc-300 border-zinc-400"
        } ${busy ? "opacity-60 cursor-wait" : ""}`}
      >
        {/* 이동하는 원 */}
        <span
          className={`inline-block h-[15px] w-[15px] transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
            isOn ? "translate-x-[18px]" : "translate-x-[2px]"
          }`}
        />
        {/* 스위치 내부 아이콘 */}
        <span className={`absolute inset-y-0 flex items-center pointer-events-none transition-opacity ${
          isOn ? "left-1 opacity-100" : "opacity-0"
        }`}>
          <BellRing size={9} strokeWidth={2.8} className="text-white" />
        </span>
        <span className={`absolute inset-y-0 flex items-center pointer-events-none transition-opacity ${
          !isOn ? "right-1 opacity-100" : "opacity-0"
        }`}>
          <BellOff size={9} strokeWidth={2.8} className={isDenied ? "text-zinc-400" : "text-zinc-500"} />
        </span>
      </button>
    </div>
  );
};

export default NotificationToggle;
