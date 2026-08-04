import { useMemo, useState } from "react";

// 공용 정렬 훅 (T30 · 23파일 중복 통합용)
// 사용법:
//   const cmps = {
//     name: (a, b) => a.name.localeCompare(b.name, "ko"),
//     price: (a, b) => a.price - b.price,
//   };
//   const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(data, "name", cmps);
//
// - `comparators`: 각 컬럼 비교 함수 (asc 기준 · 방향은 훅이 자동 반전)
// - `toggleSort(key)`: 같은 컬럼 클릭 시 asc↔desc · 다른 컬럼 클릭 시 asc 로 리셋
// - `sorted`: 정렬된 배열 (원본 불변 · [...arr].sort)
// - React 재렌더 최소화 위해 useMemo · comparators 는 안정된 참조 권장 (컴포넌트 외부 정의 or useMemo)

export type SortDir = "asc" | "desc";
export type Comparator<T> = (a: T, b: T) => number;

export interface UseSortableTableResult<T, K extends string> {
  sorted: T[];
  sortKey: K;
  sortDir: SortDir;
  toggleSort: (k: K) => void;
  setSort: (k: K, dir?: SortDir) => void;
}

export function useSortableTable<T, K extends string>(
  data: T[],
  defaultKey: K,
  comparators: Record<K, Comparator<T>>,
  defaultDir: SortDir = "asc",
): UseSortableTableResult<T, K> {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggleSort = (k: K) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const setSort = (k: K, dir?: SortDir) => {
    setSortKey(k);
    if (dir) setSortDir(dir);
  };

  const sorted = useMemo(() => {
    const cmp = comparators[sortKey];
    if (!cmp) return data;
    const sign = sortDir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => sign * cmp(a, b));
  }, [data, sortKey, sortDir, comparators]);

  return { sorted, sortKey, sortDir, toggleSort, setSort };
}
