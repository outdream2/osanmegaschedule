// @vitest-environment jsdom
// 2026-08-16 · useToast · React 실제 렌더 테스트 (jsdom + @testing-library/react)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useToast, toastClass } from "./useToast";

describe("useToast · 실 렌더", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("초기 · toast=null", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toast).toBeNull();
  });

  it("show · toast 세팅 · 기본 tone=info", () => {
    const { result } = renderHook(() => useToast(2500));
    act(() => { result.current.show("저장됨"); });
    expect(result.current.toast).toEqual({ message: "저장됨", tone: "info" });
  });

  it("defaultMs 후 · 자동 clear", () => {
    const { result } = renderHook(() => useToast(2500));
    act(() => { result.current.show("x"); });
    expect(result.current.toast).not.toBeNull();
    act(() => { vi.advanceTimersByTime(2499); });
    expect(result.current.toast).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toast).toBeNull();
  });

  it("show 재호출 · 이전 timer clear · 새 시간으로", () => {
    const { result } = renderHook(() => useToast(1000));
    act(() => { result.current.show("첫번째"); });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { result.current.show("두번째"); });
    expect(result.current.toast?.message).toBe("두번째");
    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current.toast?.message).toBe("두번째"); // 아직 살아있음
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toast).toBeNull();
  });

  it("showSuccess · tone=success", () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.showSuccess("완료"); });
    expect(result.current.toast).toEqual({ message: "완료", tone: "success" });
  });

  it("showError · tone=error · 기본 4000ms", () => {
    const { result } = renderHook(() => useToast(2000));
    act(() => { result.current.showError("실패"); });
    expect(result.current.toast).toEqual({ message: "실패", tone: "error" });
    act(() => { vi.advanceTimersByTime(3999); });
    expect(result.current.toast).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toast).toBeNull();
  });

  it("clear · 즉시 null", () => {
    const { result } = renderHook(() => useToast(10000));
    act(() => { result.current.show("x"); });
    act(() => { result.current.clear(); });
    expect(result.current.toast).toBeNull();
  });

  it("unmount · timer 누수 없음 (fake timer 검증)", () => {
    const { result, unmount } = renderHook(() => useToast(1000));
    act(() => { result.current.show("x"); });
    unmount();
    // unmount 후 timer 진행해도 setState 호출 안 됨 (React warning 없음)
    act(() => { vi.advanceTimersByTime(2000); });
  });
});

describe("toastClass · 2026-08-17 v2 · 브랜드 통일", () => {
  it("tone 별 · 색상 매핑 (info 는 brand-deep 로 변경됨)", () => {
    expect(toastClass("success")).toContain("emerald");
    expect(toastClass("error")).toContain("rose");
    expect(toastClass("warn")).toContain("amber");
    expect(toastClass("info")).toContain("brand-deep"); // v2 · indigo → brand-deep 통일
  });
  it("공통 base · 폰트 +2 · rounded-xl · 2-layer shadow", () => {
    const cls = toastClass("info");
    expect(cls).toContain("text-[13px]"); // 폰트 +2 (11→13)
    expect(cls).toContain("rounded-xl");  // rounded-full → rounded-xl (Linear 톤)
    expect(cls).toContain("shadow-");     // 2-layer shadow
  });
});
