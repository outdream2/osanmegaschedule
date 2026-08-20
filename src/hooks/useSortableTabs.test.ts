// @vitest-environment jsdom
// 2026-08-20 · useSortableTabs · long-press 재정렬 훅
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSortableTabs } from "./useSortableTabs";

const DEFAULT = [
  { key: "a", label: "A" },
  { key: "b", label: "B" },
  { key: "c", label: "C" },
];

beforeEach(() => {
  localStorage.clear();
});

describe("useSortableTabs · enabled=false", () => {
  it("원본 순서 반환", () => {
    const { result } = renderHook(() => useSortableTabs("test", DEFAULT, false));
    expect(result.current.tabs.map(t => t.key)).toEqual(["a", "b", "c"]);
  });

  it("getTabProps · draggable=false · 모든 이벤트 no-op", () => {
    const { result } = renderHook(() => useSortableTabs("test", DEFAULT, false));
    const props = result.current.getTabProps("a");
    expect(props.draggable).toBe(false);
    expect(props.isArmed).toBe(false);
    expect(props.isBeingDragged).toBe(false);
  });

  it("isDragging=false · resetOrder 안전", () => {
    const { result } = renderHook(() => useSortableTabs("test", DEFAULT, false));
    expect(result.current.isDragging).toBe(false);
    act(() => result.current.resetOrder());
    expect(result.current.tabs.map(t => t.key)).toEqual(["a", "b", "c"]);
  });
});

describe("useSortableTabs · enabled=true · localStorage 로드", () => {
  it("저장된 순서 · 반영", () => {
    localStorage.setItem("megatown_test", JSON.stringify(["c", "a", "b"]));
    const { result } = renderHook(() => useSortableTabs("test", DEFAULT, true));
    expect(result.current.tabs.map(t => t.key)).toEqual(["c", "a", "b"]);
  });

  it("저장 순서에 없는 새 탭 · 뒤에 append", () => {
    localStorage.setItem("megatown_test", JSON.stringify(["b", "a"]));
    const { result } = renderHook(() => useSortableTabs("test", DEFAULT, true));
    expect(result.current.tabs.map(t => t.key)).toEqual(["b", "a", "c"]);
  });

  it("저장 데이터 손상 · 원본 순서 fallback", () => {
    localStorage.setItem("megatown_test", "not-json");
    const { result } = renderHook(() => useSortableTabs("test", DEFAULT, true));
    expect(result.current.tabs.map(t => t.key)).toEqual(["a", "b", "c"]);
  });

  it("배열 아님 · 원본 순서 fallback", () => {
    localStorage.setItem("megatown_test", JSON.stringify({ key: "a" }));
    const { result } = renderHook(() => useSortableTabs("test", DEFAULT, true));
    expect(result.current.tabs.map(t => t.key)).toEqual(["a", "b", "c"]);
  });
});

describe("useSortableTabs · resetOrder", () => {
  it("localStorage 삭제 · defaultTabs 순서 복귀", () => {
    localStorage.setItem("megatown_test", JSON.stringify(["c", "b", "a"]));
    const { result } = renderHook(() => useSortableTabs("test", DEFAULT, true));
    expect(result.current.tabs.map(t => t.key)).toEqual(["c", "b", "a"]);

    act(() => result.current.resetOrder());
    expect(result.current.tabs.map(t => t.key)).toEqual(["a", "b", "c"]);
    expect(localStorage.getItem("megatown_test")).toBeNull();
  });
});

describe("useSortableTabs · long-press → arm", () => {
  it("500ms 후 · isArmed=true", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSortableTabs("test", DEFAULT, true));
      const props = result.current.getTabProps("a");

      act(() => {
        props.onMouseDown({ button: 0 } as any);
      });
      expect(result.current.isArmed).toBe(false);

      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(result.current.isArmed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("우클릭 · arm 되지 않음", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSortableTabs("test", DEFAULT, true));
      const props = result.current.getTabProps("a");

      act(() => {
        props.onMouseDown({ button: 2 } as any); // 우클릭
        vi.advanceTimersByTime(600);
      });
      expect(result.current.isArmed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useSortableTabs · enabled 재정렬 상태 초기화", () => {
  it("enabled false 로 변경 · 모든 상태 리셋", () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useSortableTabs("test", DEFAULT, enabled),
      { initialProps: { enabled: true } }
    );
    expect(result.current.isDragging).toBe(false);

    rerender({ enabled: false });
    expect(result.current.isArmed).toBe(false);
    expect(result.current.isDragging).toBe(false);
  });
});
