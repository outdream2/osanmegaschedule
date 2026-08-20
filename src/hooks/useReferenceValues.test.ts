// @vitest-environment jsdom
// 2026-08-20 · useReferenceValues · DB merge + fallback + cache
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockGet = vi.fn();
vi.mock("../lib/apiClient", () => ({
  api: { get: (...args: any[]) => mockGet(...args) },
}));

beforeEach(() => {
  mockGet.mockReset();
  vi.resetModules();
});

const dbSample = {
  vendorCategories: ["신규카테고리"],
  positions: ["신규직군"],
  ranks: ["신규직급"],
  contractTypes: ["신규계약형태"],
  workplaces: ["신규근무지"],
};

describe("useReferenceValues · 초기 상태", () => {
  it("첫 마운트 · loading=true (캐시 없음) · fallback 값 제공", async () => {
    mockGet.mockResolvedValue({ data: dbSample });
    const { useReferenceValues } = await import("./useReferenceValues");
    const { result } = renderHook(() => useReferenceValues());
    // 초기 · loading=true · fallback (하드코딩) 반환
    expect(result.current.loading).toBe(true);
    expect(result.current.positions.length).toBeGreaterThan(0);
  });
});

describe("useReferenceValues · DB merge", () => {
  it("fetch 성공 · DB 값 + 하드코딩 병합 · 유니크", async () => {
    mockGet.mockResolvedValue({ data: dbSample });
    const { useReferenceValues } = await import("./useReferenceValues");
    const { result } = renderHook(() => useReferenceValues());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // DB 신규값 포함
    expect(result.current.positions).toContain("신규직군");
    expect(result.current.vendorCategories).toContain("신규카테고리");
    expect(result.current.ranks).toContain("신규직급");
    expect(result.current.contractTypes).toContain("신규계약형태");
    expect(result.current.workplaces).toContain("신규근무지");
  });

  it("중복 값 · Set 으로 unique · 중복 제거", async () => {
    mockGet.mockResolvedValue({
      data: {
        vendorCategories: ["위탁", "새분류"], // "위탁"은 하드코딩에도 있을 것
        positions: [], ranks: [], contractTypes: [], workplaces: [],
      },
    });
    const { useReferenceValues } = await import("./useReferenceValues");
    const { result } = renderHook(() => useReferenceValues());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const wittakCount = result.current.vendorCategories.filter(v => v === "위탁").length;
    expect(wittakCount).toBeLessThanOrEqual(1);
  });
});

describe("useReferenceValues · fetch 실패 · fallback", () => {
  it("fetch 에러 · 하드코딩만 사용", async () => {
    mockGet.mockRejectedValue(new Error("network"));
    const { useReferenceValues } = await import("./useReferenceValues");
    const { result } = renderHook(() => useReferenceValues());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // 하드코딩 · positions/ranks/etc 여전히 있음
    expect(result.current.positions.length).toBeGreaterThan(0);
  });
});

describe("useReferenceValues · 캐시", () => {
  it("두 번째 마운트 · 캐시 사용 · fetch 1회만", async () => {
    mockGet.mockResolvedValue({ data: dbSample });
    const { useReferenceValues } = await import("./useReferenceValues");
    const { result: r1 } = renderHook(() => useReferenceValues());
    await waitFor(() => expect(r1.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);
    const { result: r2 } = renderHook(() => useReferenceValues());
    // 캐시 · 즉시 loading=false · 값 반환
    await waitFor(() => expect(r2.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1); // 캐시 사용
    expect(r2.current.positions).toContain("신규직군");
  });
});
