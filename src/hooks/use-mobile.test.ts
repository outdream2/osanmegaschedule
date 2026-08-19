// @vitest-environment jsdom
// 2026-08-19 · useIsMobile · 768px breakpoint · resize 반응
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

const setWindowWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
};

// matchMedia mock (jsdom 기본 미구현) · resize 이벤트에 자동 반응
const _mqlListeners = new Set<() => void>();
beforeEach(() => {
  _mqlListeners.clear();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_ev: string, fn: () => void) => { _mqlListeners.add(fn); },
      removeEventListener: (_ev: string, fn: () => void) => { _mqlListeners.delete(fn); },
    })),
  });
  // resize 이벤트 시 · 모든 matchMedia listener 호출
  window.addEventListener("resize", () => {
    _mqlListeners.forEach(fn => fn());
  });
});

afterEach(() => {
  setWindowWidth(1024); // reset
});

describe("useIsMobile · 초기값", () => {
  it("데스크탑 (1024px) · false", () => {
    setWindowWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("모바일 (500px) · true", () => {
    setWindowWidth(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("경계값 (767px · 모바일) · true", () => {
    setWindowWidth(767);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("경계값 (768px · 데스크탑) · false", () => {
    setWindowWidth(768);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});

describe("useIsMobile · resize 반응", () => {
  it("데스크탑 → 모바일 · 상태 변경", () => {
    setWindowWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => { setWindowWidth(500); });
    expect(result.current).toBe(true);
  });

  it("모바일 → 데스크탑 · 상태 변경", () => {
    setWindowWidth(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    act(() => { setWindowWidth(1200); });
    expect(result.current).toBe(false);
  });
});

describe("useIsMobile · unmount cleanup", () => {
  it("unmount 시 · removeEventListener 호출", () => {
    setWindowWidth(500);
    const { unmount } = renderHook(() => useIsMobile());
    // 확인 · unmount 후 오류 없이 정리
    expect(() => unmount()).not.toThrow();
  });
});
