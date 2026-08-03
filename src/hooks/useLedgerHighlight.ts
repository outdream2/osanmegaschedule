// src/hooks/useLedgerHighlight.ts
// 2026-08-03 · 매입원장 row highlight 상태 관리 훅
// 특정 id 를 highlight 로 세팅하면 duration (ms) 후 자동으로 null 로 clear
// 사용처 · PurchaseHistoryTab · 좌측 공급사 클릭 시 최신 매입건 잠깐 강조
// 재사용 · 다른 원장/리스트 UI 에서 동일 UX 필요할 때

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseLedgerHighlightResult {
  /** 현재 highlight 대상 id · null 이면 하이라이트 없음 */
  highlightId: string | number | null;
  /** highlight 발동 · duration 후 자동 clear */
  triggerHighlight: (id: string | number | null) => void;
  /** 즉시 clear */
  clearHighlight: () => void;
}

/**
 * 지정 duration 동안만 특정 id 를 highlight 상태로 유지하고 자동으로 해제한다.
 * @param duration ms · 기본 3000
 */
export function useLedgerHighlight(duration = 3000): UseLedgerHighlightResult {
  const [highlightId, setHighlightId] = useState<string | number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHighlight = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHighlightId(null);
  }, []);

  const triggerHighlight = useCallback((id: string | number | null) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHighlightId(id);
    if (id != null && duration > 0) {
      timerRef.current = setTimeout(() => {
        setHighlightId(null);
        timerRef.current = null;
      }, duration);
    }
  }, [duration]);

  // unmount 시 정리
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { highlightId, triggerHighlight, clearHighlight };
}

export default useLedgerHighlight;
