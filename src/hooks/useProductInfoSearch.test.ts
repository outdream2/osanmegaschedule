// @vitest-environment jsdom
// 2026-08-19 · useProductInfoSearch · 검색·debounce·API mock
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useProductInfoSearch } from "./useProductInfoSearch";

const mockGet = vi.fn();
vi.mock("../lib/apiClient", () => ({
  api: { get: (...args: any[]) => mockGet(...args) },
}));

beforeEach(() => {
  mockGet.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useProductInfoSearch · 초기 상태", () => {
  it("초기 · query='' · results=[] · selected=null", () => {
    const { result } = renderHook(() => useProductInfoSearch());
    expect(result.current.query).toBe("");
    expect(result.current.results).toEqual([]);
    expect(result.current.selected).toBeNull();
  });

  it("함수 반환 · setQuery/setResults/setSelected/runSearch", () => {
    const { result } = renderHook(() => useProductInfoSearch());
    expect(typeof result.current.setQuery).toBe("function");
    expect(typeof result.current.setResults).toBe("function");
    expect(typeof result.current.setSelected).toBe("function");
    expect(typeof result.current.runSearch).toBe("function");
  });
});

describe("useProductInfoSearch · setQuery + debounce", () => {
  it("query 설정 · 250ms 후 API 호출", async () => {
    mockGet.mockResolvedValue({ data: [{ product_code: "P1", product_name: "타이레놀" }] });
    const { result } = renderHook(() => useProductInfoSearch());
    act(() => { result.current.setQuery("타이레놀"); });
    // 250ms 전 · 호출 안 됨
    expect(mockGet).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(250); });
    await vi.runAllTimersAsync();
    expect(mockGet).toHaveBeenCalledWith("/api/products-search?q=%ED%83%80%EC%9D%B4%EB%A0%88%EB%86%80");
  });

  it("빈 query · API 미호출", () => {
    const { result } = renderHook(() => useProductInfoSearch());
    act(() => { result.current.setQuery(""); });
    vi.advanceTimersByTime(500);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("공백만 · 빈 검색 · API 미호출", () => {
    const { result } = renderHook(() => useProductInfoSearch());
    act(() => { result.current.setQuery("   "); });
    vi.advanceTimersByTime(500);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("연속 query 변경 · 이전 debounce 취소 · 마지막 값만 검색", async () => {
    mockGet.mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useProductInfoSearch());
    act(() => { result.current.setQuery("타이"); });
    await act(async () => { vi.advanceTimersByTime(100); });
    act(() => { result.current.setQuery("타이레"); });
    await act(async () => { vi.advanceTimersByTime(100); });
    act(() => { result.current.setQuery("타이레놀"); });
    await act(async () => { vi.advanceTimersByTime(250); });
    await vi.runAllTimersAsync();
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][0]).toContain("타이레놀".split("").map(c => encodeURIComponent(c)).join(""));
  });
});

describe("useProductInfoSearch · runSearch 수동", () => {
  it("runSearch · 즉시 API 호출 (debounce 없음)", async () => {
    vi.useRealTimers();
    mockGet.mockResolvedValue({ data: [{ product_code: "P1" }] });
    const { result } = renderHook(() => useProductInfoSearch());
    act(() => { result.current.setQuery("test"); });
    await act(async () => { await result.current.runSearch(); });
    expect(mockGet).toHaveBeenCalledWith("/api/products-search?q=test");
    expect(result.current.results.length).toBe(1);
    vi.useFakeTimers();
  });

  it("빈 query · runSearch · results=[] · API 미호출", async () => {
    const { result } = renderHook(() => useProductInfoSearch());
    await act(async () => { await result.current.runSearch(); });
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  it("API 실패 · results=[] · 크래시 없음", async () => {
    mockGet.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useProductInfoSearch());
    act(() => { result.current.setQuery("x"); });
    await act(async () => { await result.current.runSearch(); });
    expect(result.current.results).toEqual([]);
  });

  it("API · Array 아닌 응답 · results=[]", async () => {
    mockGet.mockResolvedValue({ data: { not: "array" } });
    const { result } = renderHook(() => useProductInfoSearch());
    act(() => { result.current.setQuery("x"); });
    await act(async () => { await result.current.runSearch(); });
    expect(result.current.results).toEqual([]);
  });
});

describe("useProductInfoSearch · 선택된 상품과 동일 · 재검색 스킵", () => {
  it("selected.product_name === query · debounce 무시", () => {
    const { result } = renderHook(() => useProductInfoSearch());
    act(() => { result.current.setSelected({ product_name: "타이레놀" } as any); });
    act(() => { result.current.setQuery("타이레놀"); });
    vi.advanceTimersByTime(500);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
