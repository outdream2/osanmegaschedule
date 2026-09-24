// src/lib/pushNotifications.ts
// #328 · iOS 앱 Expo 푸시 알림 · Frontend 통합 SSOT
// 2026-09-21 · 사용자 지시 · WebView 앱 v1.0.1 · 앱 개발자 가이드 수령
//
// 역할:
//   · savePushToken()               · window.OSAN_APP.pushToken 읽기 · 서버 등록
//   · deletePushToken(token)        · 로그아웃 시 · 서버 삭제
//   · initPushTokenListener()       · 'osan-push-token' 이벤트 리스너 설치
//   · requestPushTokenFromApp()     · 앱에게 토큰 재발급 요청 (setBadge 채널)
//   · setAppBadge(count)            · WebView native 배지 갱신
//   · initBadgeSync()               · approval-count-updated 이벤트 → setAppBadge 자동 sync
//
// 앱 ↔ 웹 인터페이스:
//   앱 → 웹 (매 페이지 로드):
//     window.OSAN_APP = { pushToken: "ExponentPushToken[xxxx]", platform: "ios" }
//     window.dispatchEvent(new CustomEvent("osan-push-token", { detail: window.OSAN_APP }))
//   웹 → 앱:
//     window.ReactNativeWebView.postMessage(JSON.stringify({ type: "setBadge", count: N }))
//     window.ReactNativeWebView.postMessage(JSON.stringify({ type: "getPushToken" }))

import { api, ApiError } from "./apiClient";
import { devLog, devWarn } from "./devLog";
import { SK_PUSH_TOKEN } from "./storageKeys";

// ─────────────────────────────────────────────────
// 타입: WebView 인터페이스
// ─────────────────────────────────────────────────
export interface OsanAppShim {
  pushToken?: string;
  platform?: "ios" | "android" | "web";
}

interface ReactNativeWebViewShim {
  postMessage: (payload: string) => void;
}

declare global {
  interface Window {
    OSAN_APP?: OsanAppShim;
    ReactNativeWebView?: ReactNativeWebViewShim;
  }
}

// ─────────────────────────────────────────────────
// 유틸: WebView 여부 확인
// ─────────────────────────────────────────────────
function isInsideWebView(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.ReactNativeWebView?.postMessage === "function";
}

function readAppPushToken(): { token: string; platform: string } | null {
  if (typeof window === "undefined") return null;
  const app = window.OSAN_APP;
  if (!app || typeof app.pushToken !== "string" || app.pushToken.length < 10) return null;
  return {
    token: app.pushToken,
    platform: app.platform ?? "ios",
  };
}

// ─────────────────────────────────────────────────
// 서버 저장 · savePushToken()
// · window.OSAN_APP.pushToken 읽기 → localStorage 캐시 비교 → 다르면 POST
// · 토큰 없으면 조용히 skip (웹 브라우저 정상 접근)
// · 401 등 실패 시 · 캐시 저장 X (다음 로드에서 재시도)
// ─────────────────────────────────────────────────
export async function savePushToken(): Promise<
  | { ok: true; action: "saved" | "unchanged" }
  | { ok: false; reason: string }
> {
  const appInfo = readAppPushToken();
  if (!appInfo) return { ok: false, reason: "no_token" };

  const { token, platform } = appInfo;
  const cached = typeof localStorage !== "undefined" ? localStorage.getItem(SK_PUSH_TOKEN) : null;
  if (cached === token) {
    return { ok: true, action: "unchanged" };
  }
  try {
    await api.post("/api/push-token", { token, platform });
    try {
      localStorage.setItem(SK_PUSH_TOKEN, token);
    } catch {
      /* localStorage 실패해도 서버 저장은 성공 */
    }
    devLog(`[PUSH-TOKEN] saved · platform=${platform} · token=${token.slice(0, 32)}...`);
    return { ok: true, action: "saved" };
  } catch (err: any) {
    // 401 등 · 로그인 전이면 · silent skip (재로그인 후 재시도)
    if (err instanceof ApiError && err.status === 401) {
      devWarn(`[PUSH-TOKEN] save skipped · 미인증 (재시도 대기)`);
      return { ok: false, reason: "unauthorized" };
    }
    devWarn(`[PUSH-TOKEN] save failed · ${err?.message ?? err}`);
    return { ok: false, reason: err?.message ?? "unknown" };
  }
}

// ─────────────────────────────────────────────────
// 서버 삭제 · deletePushToken()
// · 로그아웃 시 호출 · localStorage 캐시 제거
// · 실패해도 앱 흐름 방해 X (best-effort)
// ─────────────────────────────────────────────────
export async function deletePushToken(): Promise<void> {
  const cached = typeof localStorage !== "undefined" ? localStorage.getItem(SK_PUSH_TOKEN) : null;
  // localStorage 는 무조건 제거 (재로그인 시 강제 재등록 트리거)
  try {
    localStorage.removeItem(SK_PUSH_TOKEN);
  } catch {
    /* ignore */
  }
  if (!cached) return;
  try {
    await api.del(`/api/push-token/${encodeURIComponent(cached)}`);
    devLog(`[PUSH-TOKEN] deleted · token=${cached.slice(0, 32)}...`);
  } catch (err: any) {
    devWarn(`[PUSH-TOKEN] delete failed (silent) · ${err?.message ?? err}`);
  }
}

// ─────────────────────────────────────────────────
// 이벤트 리스너 · initPushTokenListener()
// · 'osan-push-token' 이벤트 (앱 → 웹 매 페이지 로드) 감지
// · 자동 savePushToken() 호출
// · 반환값 · cleanup 함수
// ─────────────────────────────────────────────────
export function initPushTokenListener(): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    void savePushToken();
  };
  window.addEventListener("osan-push-token", handler);
  return () => window.removeEventListener("osan-push-token", handler);
}

// ─────────────────────────────────────────────────
// 앱에게 토큰 재요청 · requestPushTokenFromApp()
// · WebView 환경에서만 동작 (native bridge)
// · 앱은 응답으로 window.OSAN_APP 갱신 + 'osan-push-token' 이벤트 dispatch
// ─────────────────────────────────────────────────
export function requestPushTokenFromApp(): void {
  if (!isInsideWebView()) return;
  try {
    window.ReactNativeWebView!.postMessage(JSON.stringify({ type: "getPushToken" }));
    devLog(`[PUSH-TOKEN] requested from app`);
  } catch (err: any) {
    devWarn(`[PUSH-TOKEN] request failed · ${err?.message ?? err}`);
  }
}

// ─────────────────────────────────────────────────
// 배지 sync · setAppBadge(count)
// · WebView native 배지 갱신 (iOS 홈스크린 아이콘 숫자)
// · count === 0 → 배지 제거
// · WebView 아니면 no-op
// ─────────────────────────────────────────────────
export function setAppBadge(count: number): void {
  if (!isInsideWebView()) return;
  // 2026-09-21 · NaN·Infinity 안전 처리 · Number.isFinite 체크 (Math.floor(NaN)=NaN 방지)
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  try {
    window.ReactNativeWebView!.postMessage(JSON.stringify({ type: "setBadge", count: n }));
    devLog(`[PUSH-BADGE] setBadge=${n}`);
  } catch (err: any) {
    devWarn(`[PUSH-BADGE] setBadge failed · ${err?.message ?? err}`);
  }
}

// ─────────────────────────────────────────────────
// 배지 auto-sync · initBadgeSync()
// · approval-count-updated (승인대기) CustomEvent 감지 → 서버 조회 → setAppBadge
// · 60초 폴링 fallback (기존 SideNav/BusinessManage 로직과 일치)
// · 반환값 · cleanup 함수
//
// · 서버 조회 · GET /api/leave-requests/pending-count · 승인대기 갯수
//   · 필요시 · 사직서 pending 도 통합 (기존 SideNav 참조) · 초기에는 leave 만 (사용자 지시 · scope 최소화)
// ─────────────────────────────────────────────────
export function initBadgeSync(employeeId?: number | null): () => void {
  if (typeof window === "undefined") return () => {};
  if (!isInsideWebView()) return () => {}; // WebView 아니면 완전 no-op

  let cancelled = false;
  let intervalId: number | null = null;

  async function refresh(): Promise<void> {
    if (cancelled) return;
    try {
      // 2026-09-24 · 사용자 보고 · "앱 갯수 틀림" · 서버 count endpoint 로 통일
      //   · 이전 · GET /api/notifications?limit=100 · 클라 filter · limit=30 (Bell) vs 100 (badge) 불일치
      //   · 이후 · GET /api/notifications/unread-count · 서버 count(exact) · limit 무관 · 완전 일치
      if (!employeeId) {
        setAppBadge(0);
        return;
      }
      const { data } = await api.get<{ count: number }>(
        `/api/notifications/unread-count?employeeId=${employeeId}`
      );
      if (cancelled) return;
      const unread = Number(data?.count ?? 0);
      devLog(`[PUSH-BADGE] refresh · notifications unread=${unread}`);
      setAppBadge(unread);
    } catch (err: any) {
      // 401 등 · 미로그인 시 · 배지 clear
      if (err instanceof ApiError && err.status === 401) {
        setAppBadge(0);
        return;
      }
      devWarn(`[PUSH-BADGE] refresh failed · ${err?.message ?? err}`);
    }
  }

  const eventHandler = () => {
    void refresh();
  };

  window.addEventListener("approval-count-updated", eventHandler);
  // 60초 폴링 fallback
  intervalId = window.setInterval(() => {
    void refresh();
  }, 60_000);
  // 즉시 1회 실행
  void refresh();

  return () => {
    cancelled = true;
    window.removeEventListener("approval-count-updated", eventHandler);
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };
}
