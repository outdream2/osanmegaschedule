// @vitest-environment jsdom
// 2026-08-19 · useToast · show/showSuccess/showError/showWarn · timeout · clear · unmount cleanup
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useToast, toastClass } from "./useToast";

describe("useToast · 초기 상태", () => {
  it("초기 · toast null", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toast).toBeNull();
  });

  it("show/showSuccess/showError/showWarn/clear · 함수 반환", () => {
    const { result } = renderHook(() => useToast());
    expect(typeof result.current.show).toBe("function");
    expect(typeof result.current.showSuccess).toBe("function");
    expect(typeof result.current.showError).toBe("function");
    expect(typeof result.current.showWarn).toBe("function");
    expect(typeof result.current.clear).toBe("function");
  });
});

describe("useToast · show 기본", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("show · toast 상태 설정 · 기본 tone=info", () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.show("저장됨"); });
    expect(result.current.toast).toEqual({ message: "저장됨", tone: "info" });
  });

  it("show · 기본 2500ms 후 자동 소멸", () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.show("hi"); });
    expect(result.current.toast).not.toBeNull();
    act(() => { vi.advanceTimersByTime(2499); });
    expect(result.current.toast).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toast).toBeNull();
  });

  it("show · 커스텀 ms 반영", () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.show("hi", 5000); });
    act(() => { vi.advanceTimersByTime(4999); });
    expect(result.current.toast).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toast).toBeNull();
  });

  it("show · tone=error", () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.show("에러", 3000, "error"); });
    expect(result.current.toast?.tone).toBe("error");
  });

  it("연속 show · 이전 타이머 취소 · 두번째 메시지 유지", () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.show("첫번째", 1000); });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { result.current.show("두번째", 2000); });
    expect(result.current.toast?.message).toBe("두번째");
    act(() => { vi.advanceTimersByTime(1999); });
    expect(result.current.toast).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toast).toBeNull();
  });
});

describe("useToast · 편의 · showSuccess/showError/showWarn", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("showSuccess · tone=success", () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.showSuccess("성공"); });
    expect(result.current.toast).toEqual({ message: "성공", tone: "success" });
  });

  it("showError · tone=error · 기본 ms=4000", () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.showError("실패"); });
    expect(result.current.toast?.tone).toBe("error");
    act(() => { vi.advanceTimersByTime(3999); });
    expect(result.current.toast).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toast).toBeNull();
  });

  it("showWarn · tone=warn · 기본 ms=3500", () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.showWarn("경고"); });
    expect(result.current.toast?.tone).toBe("warn");
    act(() => { vi.advanceTimersByTime(3499); });
    expect(result.current.toast).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toast).toBeNull();
  });
});

describe("useToast · clear", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("clear · toast 즉시 null", () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.show("hi"); });
    expect(result.current.toast).not.toBeNull();
    act(() => { result.current.clear(); });
    expect(result.current.toast).toBeNull();
  });

  it("clear 후 · 타이머 취소됨 (추가 소멸 안 함)", () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.show("hi", 1000); });
    act(() => { result.current.clear(); });
    // 이미 null · 타임 지나도 state 변화 없음
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.toast).toBeNull();
  });
});

describe("useToast · defaultMs 커스텀", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("useToast(1000) · 기본 1000ms 후 소멸", () => {
    const { result } = renderHook(() => useToast(1000));
    act(() => { result.current.show("hi"); });
    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current.toast).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toast).toBeNull();
  });
});

describe("toastClass", () => {
  it("기본 base 클래스 · text-[13px] · font-bold · rounded-xl", () => {
    const cls = toastClass("info");
    expect(cls).toContain("text-[13px]");
    expect(cls).toContain("font-bold");
    expect(cls).toContain("rounded-xl");
  });

  it("info · brand-tint 배경 · brand-deep 텍스트", () => {
    const cls = toastClass("info");
    expect(cls).toContain("bg-brand-tint");
    expect(cls).toContain("text-brand-deep");
  });

  it("success · emerald tone", () => {
    const cls = toastClass("success");
    expect(cls).toContain("text-emerald-700");
    expect(cls).toContain("bg-emerald-50");
  });

  it("error · rose tone", () => {
    const cls = toastClass("error");
    expect(cls).toContain("text-rose-700");
    expect(cls).toContain("bg-rose-50");
  });

  it("warn · amber tone", () => {
    const cls = toastClass("warn");
    expect(cls).toContain("text-amber-700");
    expect(cls).toContain("bg-amber-50");
  });
});
