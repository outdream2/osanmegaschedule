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
    <div className="flex items-center gap-1.5 shrink-0" title={title}>
      <span className={`text-[10px] font-black tracking-tight hidden sm:inline ${
        isDenied ? "text-slate-400" : isOn ? "text-emerald-600" : "text-slate-400"
      }`}>
        알림 {isDenied ? "차단" : isOn ? "ON" : "OFF"}
      </span>
      {/* iOS 스타일 토글 스위치 */}
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        onClick={isOn ? turnOff : turnOn}
        disabled={busy || isDenied}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition-colors duration-200 cursor-pointer shadow-inner ${
          isDenied
            ? "bg-slate-200 border-slate-300 cursor-not-allowed"
            : isOn
            ? "bg-emerald-500 border-emerald-600"
            : "bg-slate-300 border-slate-400"
        } ${busy ? "opacity-60 cursor-wait" : ""}`}
      >
        {/* 이동하는 원 */}
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
            isOn ? "translate-x-[22px]" : "translate-x-[2px]"
          }`}
        />
        {/* 스위치 내부 아이콘 */}
        <span className={`absolute inset-y-0 flex items-center pointer-events-none transition-opacity ${
          isOn ? "left-1.5 opacity-100" : "opacity-0"
        }`}>
          <BellRing size={10} strokeWidth={2.8} className="text-white" />
        </span>
        <span className={`absolute inset-y-0 flex items-center pointer-events-none transition-opacity ${
          !isOn ? "right-1.5 opacity-100" : "opacity-0"
        }`}>
          <BellOff size={10} strokeWidth={2.8} className={isDenied ? "text-slate-400" : "text-slate-500"} />
        </span>
      </button>
    </div>
  );
};

export default NotificationToggle;
