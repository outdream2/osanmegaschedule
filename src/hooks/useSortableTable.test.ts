// @vitest-environment jsdom
// 2026-08-19 · useSortableTable · 정렬 · toggleSort · setSort · 방향 반전
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSortableTable, type Comparator } from "./useSortableTable";

interface Row {
  id: number;
  name: string;
  price: number;
}

const DATA: Row[] = [
  { id: 1, name: "바나나", price: 3000 },
  { id: 2, name: "사과", price: 5000 },
  { id: 3, name: "가지", price: 2000 },
];

const cmps: Record<"name" | "price", Comparator<Row>> = {
  name: (a, b) => a.name.localeCompare(b.name, "ko"),
  price: (a, b) => a.price - b.price,
};

describe("useSortableTable · 초기 상태", () => {
  it("기본 · defaultKey + defaultDir=asc + sorted 반영", () => {
    const { result } = renderHook(() => useSortableTable(DATA, "name", cmps));
    expect(result.current.sortKey).toBe("name");
    expect(result.current.sortDir).toBe("asc");
    expect(result.current.sorted.map(r => r.name)).toEqual(["가지", "바나나", "사과"]);
  });

  it("defaultDir=desc · sorted 역순", () => {
    const { result } = renderHook(() => useSortableTable(DATA, "price", cmps, "desc"));
    expect(result.current.sortDir).toBe("desc");
    expect(result.current.sorted.map(r => r.price)).toEqual([5000, 3000, 2000]);
  });

  it("원본 배열 · 불변", () => {
    const original = [...DATA];
    renderHook(() => useSortableTable(DATA, "name", cmps));
    expect(DATA).toEqual(original);
  });
});

describe("useSortableTable · toggleSort", () => {
  it("같은 컬럼 · asc → desc → asc 순환", () => {
    const { result } = renderHook(() => useSortableTable(DATA, "name", cmps));
    expect(result.current.sortDir).toBe("asc");
    act(() => { result.current.toggleSort("name"); });
    expect(result.current.sortDir).toBe("desc");
    act(() => { result.current.toggleSort("name"); });
    expect(result.current.sortDir).toBe("asc");
  });

  it("다른 컬럼 클릭 · asc 로 리셋", () => {
    const { result } = renderHook(() => useSortableTable(DATA, "name", cmps, "desc"));
    expect(result.current.sortDir).toBe("desc");
    act(() => { result.current.toggleSort("price"); });
    expect(result.current.sortKey).toBe("price");
    expect(result.current.sortDir).toBe("asc");
  });

  it("정렬 방향 반영 · desc 시 · sorted 역순", () => {
    const { result } = renderHook(() => useSortableTable(DATA, "price", cmps, "asc"));
    expect(result.current.sorted.map(r => r.price)).toEqual([2000, 3000, 5000]);
    act(() => { result.current.toggleSort("price"); });
    expect(result.current.sorted.map(r => r.price)).toEqual([5000, 3000, 2000]);
  });
});

describe("useSortableTable · setSort", () => {
  it("setSort(key) · key 만 변경 · 방향 유지", () => {
    const { result } = renderHook(() => useSortableTable(DATA, "name", cmps, "desc"));
    act(() => { result.current.setSort("price"); });
    expect(result.current.sortKey).toBe("price");
    expect(result.current.sortDir).toBe("desc"); // 유지
  });

  it("setSort(key, dir) · 명시 방향 반영", () => {
    const { result } = renderHook(() => useSortableTable(DATA, "name", cmps, "asc"));
    act(() => { result.current.setSort("price", "desc"); });
    expect(result.current.sortKey).toBe("price");
    expect(result.current.sortDir).toBe("desc");
    expect(result.current.sorted.map(r => r.price)).toEqual([5000, 3000, 2000]);
  });
});

describe("useSortableTable · data 변경", () => {
  it("data 배열 변경 시 · sorted 재계산", () => {
    let data = DATA;
    const { result, rerender } = renderHook(({ d }) => useSortableTable(d, "name", cmps), {
      initialProps: { d: data },
    });
    expect(result.current.sorted.map(r => r.name)).toEqual(["가지", "바나나", "사과"]);

    data = [...DATA, { id: 4, name: "감자", price: 1500 }];
    rerender({ d: data });
    expect(result.current.sorted.map(r => r.name)).toEqual(["가지", "감자", "바나나", "사과"]);
  });

  it("빈 배열 · sorted = []", () => {
    const { result } = renderHook(() => useSortableTable<Row, "name">([], "name", cmps));
    expect(result.current.sorted).toEqual([]);
  });
});

describe("useSortableTable · comparators 없는 key · pass-through", () => {
  it("cmp 없으면 · 원본 데이터 그대로", () => {
    const partialCmps = { name: cmps.name } as Record<"name", Comparator<Row>>;
    const { result } = renderHook(() =>
      useSortableTable<Row, "name">(DATA, "name", partialCmps)
    );
    expect(result.current.sorted.length).toBe(DATA.length);
  });
});
