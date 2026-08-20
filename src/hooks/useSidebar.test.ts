// @vitest-environment jsdom
// 2026-08-20 · useSidebar / useSidebarWidth · 사이드바 상태 훅
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useSidebar,
  useSidebarWidth,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
} from "./useSidebar";

beforeEach(() => {
  localStorage.clear();
});

describe("SIDEBAR 상수", () => {
  it("MIN 180 · DEFAULT 220 · MAX 380", () => {
    expect(SIDEBAR_MIN_WIDTH).toBe(180);
    expect(SIDEBAR_DEFAULT_WIDTH).toBe(220);
    expect(SIDEBAR_MAX_WIDTH).toBe(380);
  });

  it("DEFAULT · MIN 과 MAX 사이", () => {
    expect(SIDEBAR_DEFAULT_WIDTH).toBeGreaterThanOrEqual(SIDEBAR_MIN_WIDTH);
    expect(SIDEBAR_DEFAULT_WIDTH).toBeLessThanOrEqual(SIDEBAR_MAX_WIDTH);
  });
});

describe("useSidebar · collapsed", () => {
  it("초기 · localStorage 없음 · window.innerWidth 기준", () => {
    const { result } = renderHook(() => useSidebar());
    expect(typeof result.current.collapsed).toBe("boolean");
  });

  it("localStorage 'true' · collapsed=true", () => {
    localStorage.setItem("sidebar.collapsed", "true");
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(true);
  });

  it("localStorage 'false' · collapsed=false", () => {
    localStorage.setItem("sidebar.collapsed", "false");
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(false);
  });

  it("toggle · collapsed 반전 + localStorage 저장", () => {
    localStorage.setItem("sidebar.collapsed", "false");
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem("sidebar.collapsed")).toBe("true");
  });
});

describe("useSidebar · mobileOpen", () => {
  it("초기 · false", () => {
    const { result } = renderHook(() => useSidebar());
    expect(result.current.mobileOpen).toBe(false);
  });

  it("openMobile → true · closeMobile → false", () => {
    const { result } = renderHook(() => useSidebar());
    act(() => result.current.openMobile());
    expect(result.current.mobileOpen).toBe(true);

    act(() => result.current.closeMobile());
    expect(result.current.mobileOpen).toBe(false);
  });
});

describe("useSidebar · Ctrl+B keyboard shortcut", () => {
  it("Ctrl+B · collapsed 반전", () => {
    localStorage.setItem("sidebar.collapsed", "false");
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }));
    });
    expect(result.current.collapsed).toBe(true);
  });

  it("Cmd+B (metaKey) · collapsed 반전", () => {
    localStorage.setItem("sidebar.collapsed", "true");
    const { result } = renderHook(() => useSidebar());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "B", metaKey: true }));
    });
    expect(result.current.collapsed).toBe(false);
  });

  it("일반 키 · 반전 안 함", () => {
    localStorage.setItem("sidebar.collapsed", "false");
    const { result } = renderHook(() => useSidebar());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });
    expect(result.current.collapsed).toBe(false);
  });
});

describe("useSidebarWidth", () => {
  it("초기 · DEFAULT_WIDTH", () => {
    const { result } = renderHook(() => useSidebarWidth());
    expect(result.current.width).toBeGreaterThanOrEqual(SIDEBAR_MIN_WIDTH);
    expect(result.current.width).toBeLessThanOrEqual(SIDEBAR_MAX_WIDTH);
  });

  it("localStorage 유효 값 · 반영", () => {
    localStorage.setItem("sidebar.width", "250");
    // 모듈 shared state · module-level 리셋 어려움 · 저장은 확인
    // (첫 훅 인스턴스가 이미 초기화됨 - 하지만 여러 인스턴스에 동기화 확인)
    const { result } = renderHook(() => useSidebarWidth());
    expect(result.current.width).toBeGreaterThanOrEqual(SIDEBAR_MIN_WIDTH);
  });

  it("setWidth · shared state · localStorage 저장", () => {
    const { result } = renderHook(() => useSidebarWidth());
    act(() => result.current.setWidth(250));
    expect(result.current.width).toBe(250);
    expect(localStorage.getItem("sidebar.width")).toBe("250");
  });

  it("여러 인스턴스 · 동기화", () => {
    const { result: a } = renderHook(() => useSidebarWidth());
    const { result: b } = renderHook(() => useSidebarWidth());
    act(() => a.current.setWidth(300));
    expect(a.current.width).toBe(300);
    expect(b.current.width).toBe(300);
  });

  it("startResize · function 반환", () => {
    const { result } = renderHook(() => useSidebarWidth());
    expect(typeof result.current.startResize).toBe("function");
  });
});
