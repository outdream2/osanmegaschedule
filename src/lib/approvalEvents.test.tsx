// @vitest-environment jsdom
// 2026-08-18 · approvalEvents · dispatch + listener + window focus
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { dispatchApprovalChange, useApprovalRefreshListener } from "./approvalEvents";

describe("dispatchApprovalChange · CustomEvent 발신", () => {
  it("이벤트 window 에 dispatch (기본 scope=all)", () => {
    const listener = vi.fn();
    window.addEventListener("mt-approval-change", listener);
    dispatchApprovalChange();
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ scope: "all" });
    window.removeEventListener("mt-approval-change", listener);
  });

  it("scope 지정 · leave", () => {
    const listener = vi.fn();
    window.addEventListener("mt-approval-change", listener);
    dispatchApprovalChange("leave");
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ scope: "leave" });
    window.removeEventListener("mt-approval-change", listener);
  });
});

describe("useApprovalRefreshListener · callback 트리거", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("all scope 이벤트 · 항상 callback 호출", () => {
    const cb = vi.fn();
    renderHook(() => useApprovalRefreshListener(cb));
    act(() => dispatchApprovalChange("leave"));
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => dispatchApprovalChange("display"));
    expect(cb).toHaveBeenCalledTimes(2);
    act(() => dispatchApprovalChange("all"));
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("특정 scope 만 listen · 다른 scope 이벤트 무시", () => {
    const cb = vi.fn();
    renderHook(() => useApprovalRefreshListener(cb, ["leave"]));
    act(() => dispatchApprovalChange("display")); // 다른 scope · 무시
    expect(cb).not.toHaveBeenCalled();
    act(() => dispatchApprovalChange("leave"));
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => dispatchApprovalChange("all")); // "all" 은 항상 반응
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("window focus 이벤트 · callback 트리거", () => {
    const cb = vi.fn();
    renderHook(() => useApprovalRefreshListener(cb));
    act(() => { window.dispatchEvent(new FocusEvent("focus")); });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("unmount · listener 제거", () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useApprovalRefreshListener(cb));
    unmount();
    act(() => dispatchApprovalChange("all"));
    expect(cb).not.toHaveBeenCalled();
  });
});
