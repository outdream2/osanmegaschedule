// src/hooks/usePushSubscription.ts
// 자동 웹푸시 구독 훅 · 로그인 시 자동 실행됨
// - 브라우저 지원 여부 확인
// - 사용자에게 알림 권한 요청 (1회)
// - 성공 시 endpoint 를 /api/push-subscribe 로 저장
// - 이미 구독된 상태이면 skip (localStorage 로 중복 요청 방지)
// - 실패해도 앱 동작 방해 X (silent fail)

import { useEffect, useRef } from "react";

const LS_KEY = "megatown_push_subscribed_auto";

interface Params {
  employeeId: number | null | undefined;
  /** 로그인 직후 자동 실행 여부 (false 면 수동 호출용) */
  auto?: boolean;
}

/**
 * 사용법 (자동):
 *   usePushSubscription({ employeeId: authSession?.employeeId, auto: true });
 * 사용법 (수동 버튼):
 *   const { subscribe, status } = usePushSubscription({ employeeId: X });
 *   <button onClick={subscribe}>알림 켜기</button>
 */
export function usePushSubscription({ employeeId, auto = true }: Params) {
  const attemptedRef = useRef(false);

  const subscribe = async (opts?: { force?: boolean; silent?: boolean }) => {
    if (!employeeId) return { ok: false as const, reason: "no_employee" };
    if (typeof window === "undefined") return { ok: false as const, reason: "no_window" };
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      if (!opts?.silent) console.info("[push] 브라우저 미지원");
      return { ok: false as const, reason: "unsupported" };
    }
    // 이미 자동 구독 시도한 employeeId 는 skip
    if (!opts?.force) {
      try {
        const list = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as number[];
        if (Array.isArray(list) && list.includes(employeeId)) {
          return { ok: true as const, reason: "already_subscribed" };
        }
      } catch { /* ignore */ }
    }
    // 권한 요청
    let permission: NotificationPermission = "default";
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
    if (permission !== "granted") {
      return { ok: false as const, reason: "permission_denied" };
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const vapidKey = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.warn("[push] VITE_VAPID_PUBLIC_KEY 미설정");
        return { ok: false as const, reason: "no_vapid_key" };
      }
      // 기존 구독 있으면 재사용, 없으면 신규
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });
      }
      // 서버 저장
      const res = await fetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        console.warn("[push] 서버 저장 실패:", res.status);
        return { ok: false as const, reason: "server_error" };
      }
      // 자동 구독 완료 마킹
      try {
        const list = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as number[];
        const next = Array.from(new Set([...(Array.isArray(list) ? list : []), employeeId]));
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return { ok: true as const, reason: "subscribed" };
    } catch (err: any) {
      console.warn("[push] 구독 실패:", err?.message);
      return { ok: false as const, reason: "exception" };
    }
  };

  useEffect(() => {
    if (!auto) return;
    if (!employeeId) return;
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    // 최초 로그인 후 살짝 딜레이 (Service Worker 준비 여유)
    const t = setTimeout(() => { void subscribe({ silent: true }); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, auto]);

  return { subscribe };
}
