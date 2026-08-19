// @vitest-environment jsdom
// 2026-08-19 · useColumnResize · localStorage · getWidth · resizerProps · resetWidth · resetAll
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useColumnResize } from "./useColumnResize";

const defs = {
  name: { default: 180, min: 80, max: 400 },
  amount: { default: 100, min: 60, max: 200 },
  memo: { default: 240 },
} as const;

beforeEach(() => {
  localStorage.clear();
});

describe("useColumnResize · 초기 폭", () => {
  it("localStorage 값 없음 · defaultWidth 사용", () => {
    const { result } = renderHook(() => useColumnResize("test", defs));
    expect(result.current.getWidth("name")).toBe(180);
    expect(result.current.getWidth("amount")).toBe(100);
    expect(result.current.getWidth("memo")).toBe(240);
  });

  it("localStorage 값 존재 · 저장값 우선", () => {
    localStorage.setItem("megatown_col_width.test.name", "250");
    localStorage.setItem("megatown_col_width.test.amount", "150");
    const { result } = renderHook(() => useColumnResize("test", defs));
    expect(result.current.getWidth("name")).toBe(250);
    expect(result.current.getWidth("amount")).toBe(150);
  });

  it("localStorage 값 · 유효하지 않은 문자열 · default fallback", () => {
    localStorage.setItem("megatown_col_width.test.name", "abc");
    const { result } = renderHook(() => useColumnResize("test", defs));
    expect(result.current.getWidth("name")).toBe(180);
  });

  it("localStorage 값 · 음수 · default fallback", () => {
    localStorage.setItem("megatown_col_width.test.name", "-50");
    const { result } = renderHook(() => useColumnResize("test", defs));
    expect(result.current.getWidth("name")).toBe(180);
  });
});

describe("useColumnResize · resizerProps", () => {
  it("resizerProps · onMouseDown · onTouchStart · role=separator · aria-label", () => {
    const { result } = renderHook(() => useColumnResize("test", defs));
    const props = result.current.resizerProps("name");
    expect(typeof props.onMouseDown).toBe("function");
    expect(typeof props.onTouchStart).toBe("function");
    expect(props.role).toBe("separator");
    expect(props["aria-label"]).toBe("name 컬럼 폭 조절");
  });

  it("touchAction: none · style 반영", () => {
    const { result } = renderHook(() => useColumnResize("test", defs));
    const props = result.current.resizerProps("amount");
    expect(props.style.touchAction).toBe("none");
  });
});

describe("useColumnResize · resetWidth", () => {
  it("resetWidth · 특정 컬럼만 · default 복원 · localStorage 삭제", () => {
    localStorage.setItem("megatown_col_width.test.name", "300");
    const { result } = renderHook(() => useColumnResize("test", defs));
    expect(result.current.getWidth("name")).toBe(300);
    act(() => { result.current.resetWidth("name"); });
    expect(result.current.getWidth("name")).toBe(180);
    expect(localStorage.getItem("megatown_col_width.test.name")).toBeNull();
  });
});

describe("useColumnResize · resetAll", () => {
  it("resetAll · 모든 컬럼 default 복원 · localStorage 전부 삭제", () => {
    localStorage.setItem("megatown_col_width.test.name", "300");
    localStorage.setItem("megatown_col_width.test.amount", "180");
    localStorage.setItem("megatown_col_width.test.memo", "350");
    const { result } = renderHook(() => useColumnResize("test", defs));
    act(() => { result.current.resetAll(); });
    expect(result.current.getWidth("name")).toBe(180);
    expect(result.current.getWidth("amount")).toBe(100);
    expect(result.current.getWidth("memo")).toBe(240);
    expect(localStorage.getItem("megatown_col_width.test.name")).toBeNull();
    expect(localStorage.getItem("megatown_col_width.test.amount")).toBeNull();
    expect(localStorage.getItem("megatown_col_width.test.memo")).toBeNull();
  });
});

describe("useColumnResize · pageKey 별 격리", () => {
  it("서로 다른 pageKey · localStorage 격리", () => {
    localStorage.setItem("megatown_col_width.page1.name", "200");
    localStorage.setItem("megatown_col_width.page2.name", "300");
    const { result: r1 } = renderHook(() => useColumnResize("page1", defs));
    const { result: r2 } = renderHook(() => useColumnResize("page2", defs));
    expect(r1.current.getWidth("name")).toBe(200);
    expect(r2.current.getWidth("name")).toBe(300);
  });
});

describe("useColumnResize · localStorage quota fail · silent", () => {
  it("localStorage 예외 · 크래시 없이 fallback", () => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = vi.fn(() => { throw new Error("quota"); });
    const { result } = renderHook(() => useColumnResize("test", defs));
    expect(result.current.getWidth("name")).toBe(180);
    Storage.prototype.getItem = originalGetItem;
  });
});
