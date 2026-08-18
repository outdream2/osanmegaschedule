// src/lib/approvalEvents.ts
// 2026-08-18 · 승인/요청 상태 변경 · 실시간 이벤트 브로드캐스트
//   문제: 연차/발주/진열 요청 제출·승인 시 · 알림 배지·pending count 즉시 반영 안 됨
//   해결: window CustomEvent 로 UI 컴포넌트에 즉시 알림
//
// 발신 (제출/승인/거절/취소 후 · 성공 시):
//   import { dispatchApprovalChange } from "../lib/approvalEvents";
//   dispatchApprovalChange("leave");
//   dispatchApprovalChange("display");
//
// 수신 (Landing badge · NotificationBell 등):
//   import { useApprovalRefreshListener } from "../lib/approvalEvents";
//   useApprovalRefreshListener(() => { refetchCounts(); });
//
// 추가: window focus 시 자동 refresh (다른 탭에서 발생한 변경 대응)

import { useEffect } from "react";

export type ApprovalScope = "leave" | "display" | "order" | "return" | "lunch" | "mismatch" | "notification" | "all";

const EVENT_NAME = "mt-approval-change";

/** 승인/요청 상태 변경 발신 · scope 지정 (기본 all) */
export function dispatchApprovalChange(scope: ApprovalScope = "all"): void {
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { scope } }));
  } catch { /* SSR/JSDOM 무시 */ }
}

/**
 * 승인/요청 변경 리스너 훅
 *   · 이벤트 발생 시 callback 실행 (해당 scope 또는 "all")
 *   · window focus 시에도 callback 실행 (다른 탭에서의 변경 대응)
 */
export function useApprovalRefreshListener(
  callback: () => void,
  scopes: readonly ApprovalScope[] = ["all"],
): void {
  useEffect(() => {
    const scopeSet = new Set<string>(scopes);
    scopeSet.add("all"); // "all" 은 항상 반응

    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ scope?: ApprovalScope }>).detail;
      const s = detail?.scope ?? "all";
      if (scopeSet.has(s)) callback();
    };
    const onFocus = () => { callback(); };

    window.addEventListener(EVENT_NAME, onEvent);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(EVENT_NAME, onEvent);
      window.removeEventListener("focus", onFocus);
    };
    // callback identity 변화 무시 · scopes 도 초기 값 고정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
