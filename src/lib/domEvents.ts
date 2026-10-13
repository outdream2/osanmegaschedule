// src/lib/domEvents.ts
// 2026-10-13 · P1-3 · CustomEvent 이름 상수 SSOT · 리터럴 산발 오타 방지
//
// 사용 패턴:
//   import { DOM_EVENTS, dispatchDomEvent, addDomEventListener } from "../lib/domEvents";
//   dispatchDomEvent(DOM_EVENTS.VENDORS_CHANGED);
//   dispatchDomEvent(DOM_EVENTS.INVENTORY_CHECKS_UPDATED, { source: "real-stock", productCode });
//   addDomEventListener(DOM_EVENTS.APPROVAL_COUNT_UPDATED, handler);
//
// 레거시 호환: 기존 리터럴 (`window.dispatchEvent(new CustomEvent("vendors-changed"))`) 그대로 동작.
// 신규 코드부터 상수 사용 권장 · 점진 이관.

export const DOM_EVENTS = {
  /** 공급사 CRUD 완료 · useVendors 캐시 강제 refetch */
  VENDORS_CHANGED: "vendors-changed",
  /** 실재고 (inventory_checks) 저장 완료 · 재고 리스트 갱신 */
  INVENTORY_CHECKS_UPDATED: "inventory-checks-updated",
  /** 승인/요청 카운트 변경 · 사이드바 배지 + 경영 dashboard 갱신 */
  APPROVAL_COUNT_UPDATED: "approval-count-updated",
  /** 반품필요 상품 수 갱신 · 매입 탭 서브탭 배지 */
  RETURN_NEED_COUNT: "return-need-count",
  /** 상품 CRUD 완료 · productsCache 즉시 무효화 */
  PRODUCT_MUTATED: "product-mutated",
  /** 세션 만료 (401) · 로그인 화면 즉시 이동 */
  API_SESSION_EXPIRED: "api-session-expired",
} as const;

export type DomEventName = typeof DOM_EVENTS[keyof typeof DOM_EVENTS];

/** CustomEvent dispatch · detail 선택 */
export function dispatchDomEvent<T = unknown>(name: DomEventName, detail?: T): void {
  try {
    window.dispatchEvent(detail === undefined
      ? new CustomEvent(name)
      : new CustomEvent(name, { detail }));
  } catch { /* silent · SSR 등 window 없음 환경 */ }
}

/** addEventListener wrapper · cleanup fn 반환 (useEffect 호환) */
export function addDomEventListener<T = unknown>(
  name: DomEventName,
  handler: (ev: CustomEvent<T>) => void,
): () => void {
  const wrap = handler as EventListener;
  window.addEventListener(name, wrap);
  return () => window.removeEventListener(name, wrap);
}
