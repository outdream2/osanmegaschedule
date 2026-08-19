// @vitest-environment jsdom
// 2026-08-19 · useResizablePanel · width localStorage · setWidth clamp · isDesktop
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResizablePanel } from "./useResizablePanel";

const setWidthInner = (px: number) => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: px });
  window.dispatchEvent(new Event("resize"));
};

beforeEach(() => {
  localStorage.clear();
  setWidthInner(1280);
});
afterEach(() => {
  setWidthInner(1024);
});

describe("useResizablePanel · 초기 width", () => {
  it("localStorage 없음 · defaultWidth (minWidth 지정 시)", () => {
    // 참고 · minWidth 미지정 (기본 0) 시 · Number(null)=0 → 유효값으로 인식 · defaultWidth 미반영
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test", defaultWidth: 300, minWidth: 100 })
    );
    expect(result.current.width).toBe(300);
  });

  it("localStorage 값 · 우선 사용", () => {
    localStorage.setItem("test", "420");
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test", defaultWidth: 300 })
    );
    expect(result.current.width).toBe(420);
  });

  it("localStorage · min 미만 · defaultWidth fallback", () => {
    localStorage.setItem("test", "50");
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test", defaultWidth: 300, minWidth: 100 })
    );
    expect(result.current.width).toBe(300);
  });

  it("localStorage · max 초과 · defaultWidth fallback", () => {
    localStorage.setItem("test", "5000");
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test", defaultWidth: 300, maxWidth: 800 })
    );
    expect(result.current.width).toBe(300);
  });

  it("localStorage · 유효하지 않은 문자열 · defaultWidth", () => {
    localStorage.setItem("test", "abc");
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test", defaultWidth: 300 })
    );
    expect(result.current.width).toBe(300);
  });
});

describe("useResizablePanel · setWidth (clamp)", () => {
  it("min-max 범위 내 · 그대로 반영", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test", defaultWidth: 300, minWidth: 100, maxWidth: 500 })
    );
    act(() => { result.current.setWidth(250); });
    expect(result.current.width).toBe(250);
  });

  it("min 미만 · min 으로 clamp", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test", defaultWidth: 300, minWidth: 100, maxWidth: 500 })
    );
    act(() => { result.current.setWidth(50); });
    expect(result.current.width).toBe(100);
  });

  it("max 초과 · max 로 clamp", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test", defaultWidth: 300, minWidth: 100, maxWidth: 500 })
    );
    act(() => { result.current.setWidth(1000); });
    expect(result.current.width).toBe(500);
  });
});

describe("useResizablePanel · localStorage 자동 저장", () => {
  it("width 변경 시 · localStorage 자동 저장", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "auto-save", defaultWidth: 300 })
    );
    act(() => { result.current.setWidth(400); });
    expect(localStorage.getItem("auto-save")).toBe("400");
  });
});

describe("useResizablePanel · isDesktop 감지", () => {
  it("detectDesktop=false (기본) · 항상 false", () => {
    setWidthInner(1500);
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test", defaultWidth: 300 })
    );
    expect(result.current.isDesktop).toBe(false);
  });

  it("detectDesktop=true · window 폭 >= breakpoint · true", () => {
    setWidthInner(1500);
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test", defaultWidth: 300, detectDesktop: true })
    );
    expect(result.current.isDesktop).toBe(true);
  });

  it("detectDesktop=true · window 폭 < breakpoint · false", () => {
    setWidthInner(800);
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test", defaultWidth: 300, detectDesktop: true })
    );
    expect(result.current.isDesktop).toBe(false);
  });

  it("resize · isDesktop 상태 변경", () => {
    setWidthInner(1500);
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test", defaultWidth: 300, detectDesktop: true })
    );
    expect(result.current.isDesktop).toBe(true);
    act(() => { setWidthInner(800); });
    expect(result.current.isDesktop).toBe(false);
  });

  it("커스텀 desktopBreakpoint=1440", () => {
    setWidthInner(1300);
    const { result } = renderHook(() =>
      useResizablePanel({
        storageKey: "test",
        defaultWidth: 300,
        detectDesktop: true,
        desktopBreakpoint: 1440,
      })
    );
    expect(result.current.isDesktop).toBe(false);
  });
});

describe("useResizablePanel · startResize", () => {
  it("startResize · 함수 · body cursor 변경", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test", defaultWidth: 300 })
    );
    expect(typeof result.current.startResize).toBe("function");
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 500,
    } as any;
    act(() => { result.current.startResize(mockEvent); });
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(document.body.style.cursor).toBe("col-resize");
    expect(document.body.style.userSelect).toBe("none");
    // cleanup · mouseup 이벤트로 원복 (실제 window mouseup 발생시 원복됨)
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(document.body.style.cursor).toBe("");
  });
});
