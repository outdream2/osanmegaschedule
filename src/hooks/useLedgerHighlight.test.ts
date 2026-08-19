// @vitest-environment jsdom
// 2026-08-19 · useLedgerHighlight · triggerHighlight/clearHighlight/자동 해제/unmount 정리
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLedgerHighlight } from "./useLedgerHighlight";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useLedgerHighlight · 초기 상태", () => {
  it("highlightId · 초기 null", () => {
    const { result } = renderHook(() => useLedgerHighlight());
    expect(result.current.highlightId).toBeNull();
  });

  it("triggerHighlight · clearHighlight · 함수 반환", () => {
    const { result } = renderHook(() => useLedgerHighlight());
    expect(typeof result.current.triggerHighlight).toBe("function");
    expect(typeof result.current.clearHighlight).toBe("function");
  });
});

describe("useLedgerHighlight · triggerHighlight", () => {
  it("id 설정 · highlightId 반영", () => {
    const { result } = renderHook(() => useLedgerHighlight());
    act(() => { result.current.triggerHighlight(42); });
    expect(result.current.highlightId).toBe(42);
  });

  it("string id 도 허용", () => {
    const { result } = renderHook(() => useLedgerHighlight());
    act(() => { result.current.triggerHighlight("row-1"); });
    expect(result.current.highlightId).toBe("row-1");
  });

  it("기본 duration=3000ms 후 · 자동 clear (null 로 전환)", () => {
    const { result } = renderHook(() => useLedgerHighlight());
    act(() => { result.current.triggerHighlight(42); });
    expect(result.current.highlightId).toBe(42);
    act(() => { vi.advanceTimersByTime(2999); });
    expect(result.current.highlightId).toBe(42);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.highlightId).toBeNull();
  });

  it("커스텀 duration=500ms", () => {
    const { result } = renderHook(() => useLedgerHighlight(500));
    act(() => { result.current.triggerHighlight(1); });
    act(() => { vi.advanceTimersByTime(499); });
    expect(result.current.highlightId).toBe(1);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.highlightId).toBeNull();
  });

  it("duration=0 · 자동 clear 안 함 (수동 clear 필요)", () => {
    const { result } = renderHook(() => useLedgerHighlight(0));
    act(() => { result.current.triggerHighlight(1); });
    act(() => { vi.advanceTimersByTime(100000); });
    expect(result.current.highlightId).toBe(1);
  });

  it("연속 trigger · 이전 타이머 취소 · 두번째 id 유지", () => {
    const { result } = renderHook(() => useLedgerHighlight(1000));
    act(() => { result.current.triggerHighlight(1); });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { result.current.triggerHighlight(2); });
    expect(result.current.highlightId).toBe(2);
    act(() => { vi.advanceTimersByTime(500); });
    // 첫번째 타이머 만료 시점 · 아직 살아있어야 함 (재트리거로 리셋됨)
    expect(result.current.highlightId).toBe(2);
    act(() => { vi.advanceTimersByTime(500); });
    // 두번째 트리거 후 1000ms 지남
    expect(result.current.highlightId).toBeNull();
  });

  it("null 전달 · highlight 해제", () => {
    const { result } = renderHook(() => useLedgerHighlight());
    act(() => { result.current.triggerHighlight(1); });
    act(() => { result.current.triggerHighlight(null); });
    expect(result.current.highlightId).toBeNull();
  });
});

describe("useLedgerHighlight · clearHighlight", () => {
  it("즉시 null · 타이머 취소", () => {
    const { result } = renderHook(() => useLedgerHighlight());
    act(() => { result.current.triggerHighlight(42); });
    expect(result.current.highlightId).toBe(42);
    act(() => { result.current.clearHighlight(); });
    expect(result.current.highlightId).toBeNull();
    // 이후 3000ms 지나도 상태 변화 없음
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.highlightId).toBeNull();
  });
});

describe("useLedgerHighlight · unmount", () => {
  it("unmount · 타이머 정리 · 에러 없음", () => {
    const { result, unmount } = renderHook(() => useLedgerHighlight());
    act(() => { result.current.triggerHighlight(1); });
    expect(() => unmount()).not.toThrow();
  });
});
