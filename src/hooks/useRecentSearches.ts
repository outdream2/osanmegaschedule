// src/hooks/useRecentSearches.ts
// 2026-08-26 · 사용자 지시 · 모든 검색창 · 최근 검색어 3개
//   · 검색 확정 (Enter / 결과 선택) 시 · push
//   · localStorage 저장 · 페이지별 key (scope) 로 격리
//   · 최대 3개 · 중복 시 최상단으로 이동
//
// 사용:
//   const { recents, push, clear } = useRecentSearches("orderRequest");
//   push("파스"); recents === ["파스", ...]
//
// UI:
//   input focus + empty · recents.map · 클릭 시 setSearch(recent)

import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "megatown_recent_search:";
const MAX_ITEMS = 3;

function readStorage(key: string): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, MAX_ITEMS);
  } catch { return []; }
}

function writeStorage(key: string, items: string[]): void {
  try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(items)); } catch { /* quota etc · silent */ }
}

export interface UseRecentSearchesResult {
  /** 최근 검색어 · 최신 순 · 최대 3 */
  recents: string[];
  /** 검색어 추가 · 중복 시 최상단으로 · 빈 문자열 무시 */
  push: (q: string) => void;
  /** 특정 검색어 삭제 */
  remove: (q: string) => void;
  /** 전체 초기화 */
  clear: () => void;
}

export function useRecentSearches(scope: string): UseRecentSearchesResult {
  const [recents, setRecents] = useState<string[]>(() => readStorage(scope));

  // scope 변경 시 · 로드
  useEffect(() => { setRecents(readStorage(scope)); }, [scope]);

  const push = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecents((prev) => {
      const next = [trimmed, ...prev.filter((x) => x !== trimmed)].slice(0, MAX_ITEMS);
      writeStorage(scope, next);
      return next;
    });
  }, [scope]);

  const remove = useCallback((q: string) => {
    setRecents((prev) => {
      const next = prev.filter((x) => x !== q);
      writeStorage(scope, next);
      return next;
    });
  }, [scope]);

  const clear = useCallback(() => {
    setRecents(() => {
      writeStorage(scope, []);
      return [];
    });
  }, [scope]);

  return { recents, push, remove, clear };
}

export default useRecentSearches;
