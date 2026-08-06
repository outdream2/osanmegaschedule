// src/hooks/useSortableTabs.ts
// 2026-08-03 · 서브탭 long-press 드래그 재정렬 훅
//   - 관리자 (userLevel >= 8) 만 활성화 · 아니면 원본 순서 그대로 · 이벤트 핸들러도 모두 no-op
//   - 500ms 마우스/터치 유지 → draggable 활성화 (long-press)
//   - HTML5 native drag-and-drop 사용 · 드래그 핸들 아이콘 없음 (탭 자체가 드래그 대상)
//   - 재정렬 결과는 localStorage 에 저장 (storageKey · 예 "tabOrder.purchase")
//   - CustomEvent `tabs-reordered-{storageKey}` 발행 (다른 컴포넌트가 필요 시 구독 가능)
//
// 반환값
//   - tabs        : localStorage 순서 반영된 재정렬 배열 (defaultTabs 와 동일한 T)
//   - getTabProps : 각 탭 button 에 그대로 spread 가능한 이벤트/속성 오브젝트
//   - isDragging  : 현재 드래그 진행 중인지 (시각 피드백 · overlay 등 필요 시)
//   - resetOrder  : 저장된 순서 초기화 (defaultTabs 순서로 복귀)
//
// 시각 피드백은 각 페이지의 button 스타일에서 처리 (getTabProps 는 데이터만 노출):
//   - isBeingDragged : true 이면 opacity-50
//   - isDropTarget   : true 이면 ring-2 ring-indigo-400
//   - isArmed        : long-press 완료 · 드래그 준비 상태 (전체 탭바에 소프트 shake 적용 가능)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TIMING } from "../constants/timing";

const LONG_PRESS_MS = TIMING.PRESS_LONG;
const STORAGE_PREFIX = "megatown_"; // 앱 관례 (useAuth · settings 등과 동일)

export interface SortableTabBase {
  key: string;
}

export interface TabHandlerProps {
  // native drag props
  draggable: boolean;
  onDragStart: (e: React.DragEvent<HTMLElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onDragEnter: (e: React.DragEvent<HTMLElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>) => void;
  onDragEnd: (e: React.DragEvent<HTMLElement>) => void;
  // long-press arming
  onMouseDown: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseUp: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => void;
  onTouchStart: (e: React.TouchEvent<HTMLElement>) => void;
  onTouchEnd: (e: React.TouchEvent<HTMLElement>) => void;
  onTouchCancel: (e: React.TouchEvent<HTMLElement>) => void;
  // presentation flags (컴포넌트가 직접 스타일링에 사용)
  isBeingDragged: boolean;
  isDropTarget: boolean;
  isArmed: boolean;
}

export interface UseSortableTabsResult<T extends SortableTabBase> {
  tabs: T[];
  /** 탭 button 에 spread 할 이벤트/시각 flag · 인자는 tab 자체 또는 tab.key 문자열 모두 허용 */
  getTabProps: (tabOrKey: T | string) => TabHandlerProps;
  isDragging: boolean;
  /** long-press 이후 드래그 준비 완료 상태 (전체 탭바에 shake 효과 등 적용 가능) */
  isArmed: boolean;
  /** 저장된 순서 삭제 후 defaultTabs 순서로 복귀 */
  resetOrder: () => void;
}

function readStoredOrder(storageKey: string): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // 문자열 배열만 인정
    if (!parsed.every(x => typeof x === "string")) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

function writeStoredOrder(storageKey: string, order: string[]): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(order));
  } catch {
    // quota / private mode 등 · silent fail (UI 는 이미 새 순서로 렌더됨)
  }
}

/**
 * localStorage 저장된 순서를 defaultTabs 에 적용
 *   - 저장된 순서에 없는 새 탭은 원본 위치를 대략 유지 (뒤에 append)
 *   - 저장된 순서에 있으나 defaultTabs 에 없는 key 는 무시
 */
function applyStoredOrder<T extends SortableTabBase>(
  defaultTabs: T[],
  storedOrder: string[] | null,
): T[] {
  if (!storedOrder || storedOrder.length === 0) return defaultTabs;
  const byKey = new Map(defaultTabs.map(t => [t.key, t]));
  const seen = new Set<string>();
  const result: T[] = [];
  for (const key of storedOrder) {
    const t = byKey.get(key);
    if (t && !seen.has(key)) {
      result.push(t);
      seen.add(key);
    }
  }
  // defaultTabs 에 새로 추가된 탭 (저장된 순서에 없던 key) → 원래 순서 유지하며 append
  for (const t of defaultTabs) {
    if (!seen.has(t.key)) result.push(t);
  }
  return result;
}

export function useSortableTabs<T extends SortableTabBase>(
  storageKey: string,
  defaultTabs: T[],
  enabled: boolean,
): UseSortableTabsResult<T> {
  // 정렬된 탭 배열
  const [tabs, setTabs] = useState<T[]>(() =>
    enabled ? applyStoredOrder(defaultTabs, readStoredOrder(storageKey)) : defaultTabs,
  );

  // defaultTabs 자체가 바뀌면 (탭 추가/제거) 저장된 순서 재적용
  //   - 주의: defaultTabs 는 상위에서 매 렌더 새 배열로 오지 않도록 useMemo 로 감싸는 게 이상적
  //   - 여기서는 key set 비교로 참조 변경에 둔감하게 대응
  const defaultKeysSig = defaultTabs.map(t => t.key).join("|");
  useEffect(() => {
    if (!enabled) {
      setTabs(defaultTabs);
      return;
    }
    setTabs(applyStoredOrder(defaultTabs, readStoredOrder(storageKey)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, storageKey, defaultKeysSig]);

  // ── long-press 상태 ──
  const [armed, setArmed] = useState<boolean>(false);
  const armedRef = useRef<boolean>(false);
  const pressTimerRef = useRef<number | null>(null);
  const pressedKeyRef = useRef<string | null>(null);

  const clearPressTimer = useCallback(() => {
    if (pressTimerRef.current != null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }, []);

  const disarm = useCallback(() => {
    armedRef.current = false;
    setArmed(false);
    pressedKeyRef.current = null;
    clearPressTimer();
  }, [clearPressTimer]);

  // ── drag 상태 ──
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const draggingKeyRef = useRef<string | null>(null);

  // enabled=false 로 바뀌면 모든 상태 초기화
  useEffect(() => {
    if (!enabled) {
      disarm();
      setDraggingKey(null);
      setOverKey(null);
      draggingKeyRef.current = null;
    }
  }, [enabled, disarm]);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (pressTimerRef.current != null) window.clearTimeout(pressTimerRef.current);
    };
  }, []);

  const persistOrder = useCallback((newTabs: T[]) => {
    const order = newTabs.map(t => t.key);
    writeStoredOrder(storageKey, order);
    try {
      window.dispatchEvent(new CustomEvent(`tabs-reordered-${storageKey}`, { detail: { order } }));
    } catch {
      // CustomEvent 미지원 환경 · silent fail
    }
  }, [storageKey]);

  const reorder = useCallback((fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    setTabs(prev => {
      const fromIdx = prev.findIndex(t => t.key === fromKey);
      const toIdx = prev.findIndex(t => t.key === toKey);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      persistOrder(next);
      return next;
    });
  }, [persistOrder]);

  const resetOrder = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_PREFIX + storageKey);
    } catch {
      // ignore
    }
    setTabs(defaultTabs);
  }, [storageKey, defaultTabs]);

  // ── handler factory ──
  const getTabProps = useCallback((tabOrKey: T | string): TabHandlerProps => {
    const armKey = typeof tabOrKey === "string" ? tabOrKey : tabOrKey.key;
    if (!enabled) {
      // 관리자 아님 · 모든 이벤트 no-op · 시각 flag 는 false
      return {
        draggable: false,
        onDragStart: () => {},
        onDragOver: () => {},
        onDragEnter: () => {},
        onDragLeave: () => {},
        onDrop: () => {},
        onDragEnd: () => {},
        onMouseDown: () => {},
        onMouseUp: () => {},
        onMouseLeave: () => {},
        onTouchStart: () => {},
        onTouchEnd: () => {},
        onTouchCancel: () => {},
        isBeingDragged: false,
        isDropTarget: false,
        isArmed: false,
      };
    }

    const startPressTimer = () => {
      clearPressTimer();
      pressedKeyRef.current = armKey;
      pressTimerRef.current = window.setTimeout(() => {
        armedRef.current = true;
        setArmed(true);
      }, LONG_PRESS_MS);
    };

    return {
      draggable: armedRef.current, // long-press 후에만 draggable=true
      onDragStart: (e) => {
        if (!armedRef.current) {
          e.preventDefault();
          return;
        }
        draggingKeyRef.current = armKey;
        setDraggingKey(armKey);
        try {
          e.dataTransfer.effectAllowed = "move";
          // FF 는 setData 없으면 드래그 자체가 시작되지 않음
          e.dataTransfer.setData("text/plain", armKey);
        } catch {
          // ignore
        }
      },
      onDragOver: (e) => {
        if (!draggingKeyRef.current) return;
        e.preventDefault(); // drop 허용
        try { e.dataTransfer.dropEffect = "move"; } catch { /* ignore */ }
      },
      onDragEnter: (e) => {
        if (!draggingKeyRef.current) return;
        e.preventDefault();
        if (draggingKeyRef.current !== armKey) setOverKey(armKey);
      },
      onDragLeave: () => {
        if (overKey === armKey) setOverKey(null);
      },
      onDrop: (e) => {
        e.preventDefault();
        const from = draggingKeyRef.current;
        if (from && from !== armKey) reorder(from, armKey);
        draggingKeyRef.current = null;
        setDraggingKey(null);
        setOverKey(null);
        disarm();
      },
      onDragEnd: () => {
        draggingKeyRef.current = null;
        setDraggingKey(null);
        setOverKey(null);
        disarm();
      },

      onMouseDown: (e) => {
        // 좌클릭만 (마우스 우클릭 · 중간 클릭은 arm 하지 않음)
        if (e.button !== 0) return;
        startPressTimer();
      },
      onMouseUp: () => {
        // arm 전 · 일반 클릭 (탭 전환) 으로 진행 · 타이머만 취소
        // arm 완료 후 드래그 없이 mouseup · disarm (탭 전환은 native onClick 이 처리)
        if (!armedRef.current) clearPressTimer();
        else if (draggingKeyRef.current === null) disarm();
      },
      onMouseLeave: () => {
        // 마우스가 버튼을 벗어나면 press 취소 (arm 전이라면)
        if (!armedRef.current) clearPressTimer();
      },
      onTouchStart: () => {
        startPressTimer();
      },
      onTouchEnd: () => {
        if (!armedRef.current) clearPressTimer();
        else if (draggingKeyRef.current === null) disarm();
      },
      onTouchCancel: () => {
        if (!armedRef.current) clearPressTimer();
        else if (draggingKeyRef.current === null) disarm();
      },

      isBeingDragged: draggingKey === armKey,
      isDropTarget: overKey === armKey && draggingKey !== null && draggingKey !== armKey,
      isArmed: armed,
    };
  }, [enabled, armed, draggingKey, overKey, reorder, disarm, clearPressTimer]);

  // memoize 반환값 (참조 안정성)
  return useMemo(() => ({
    tabs,
    getTabProps,
    isDragging: draggingKey !== null,
    isArmed: armed,
    resetOrder,
  }), [tabs, getTabProps, draggingKey, armed, resetOrder]);
}

export default useSortableTabs;
