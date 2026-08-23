// @vitest-environment jsdom
// 2026-08-23 · #193 · useOptimalStockPeriod 훅 · KV 조회 · sanitize · fallback
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  useOptimalStockPeriod,
  OPTIMAL_STOCK_DEFAULT_DAYS,
  OPTIMAL_STOCK_MIN_DAYS,
  OPTIMAL_STOCK_MAX_DAYS,
} from "./useOptimalStockPeriod";

// api mock (useKvSetting 이 apiClient 사용)
vi.mock("../lib/apiClient", () => ({
  api: {
    get: vi.fn(async () => ({ data: null })),
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
  },
  ApiError: class ApiError extends Error {},
}));

import { api } from "../lib/apiClient";

describe("useOptimalStockPeriod", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try { localStorage.clear(); } catch { /* noop */ }
  });
  afterEach(() => {
    vi.clearAllMocks();
    try { localStorage.clear(); } catch { /* noop */ }
  });

  it("KV 부재 시 · DEFAULT (15) fallback (2026-08-24 사용자 15로 변경)", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    const { result } = renderHook(() => useOptimalStockPeriod());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.days).toBe(OPTIMAL_STOCK_DEFAULT_DAYS);
    expect(OPTIMAL_STOCK_DEFAULT_DAYS).toBe(15);
  });

  it("KV 유효 값 (14일) · 그대로 반환", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 14 } });
    const { result } = renderHook(() => useOptimalStockPeriod());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.days).toBe(14);
  });

  it("KV 범위 밖 (100 · 초과) · sanitize null → DEFAULT", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 100 } });
    const { result } = renderHook(() => useOptimalStockPeriod());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    // sanitize 는 null 을 반환 · useKvSetting 은 default 유지
    expect(result.current.days).toBe(OPTIMAL_STOCK_DEFAULT_DAYS);
  });

  it("KV 범위 밖 (0 · 미달) · sanitize null → DEFAULT", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 0 } });
    const { result } = renderHook(() => useOptimalStockPeriod());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.days).toBe(OPTIMAL_STOCK_DEFAULT_DAYS);
  });

  it("KV 문자열 숫자 (\"45\") · 숫자로 정규화", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: "45" } });
    const { result } = renderHook(() => useOptimalStockPeriod());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.days).toBe(45);
  });

  it("KV 소수 (14.7) · 반올림 (15)", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 14.7 } });
    const { result } = renderHook(() => useOptimalStockPeriod());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.days).toBe(15);
  });

  it("KV null · sanitize null → DEFAULT", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: null } });
    const { result } = renderHook(() => useOptimalStockPeriod());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.days).toBe(OPTIMAL_STOCK_DEFAULT_DAYS);
  });

  it("경계값 · MIN (7) · MAX (90) 모두 인정", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: OPTIMAL_STOCK_MIN_DAYS } });
    const r1 = renderHook(() => useOptimalStockPeriod());
    await waitFor(() => expect(r1.result.current.loaded).toBe(true));
    expect(r1.result.current.days).toBe(OPTIMAL_STOCK_MIN_DAYS);
    r1.unmount();

    (api.get as any).mockResolvedValueOnce({ data: { value: OPTIMAL_STOCK_MAX_DAYS } });
    const r2 = renderHook(() => useOptimalStockPeriod());
    await waitFor(() => expect(r2.result.current.loaded).toBe(true));
    expect(r2.result.current.days).toBe(OPTIMAL_STOCK_MAX_DAYS);
  });

  it("api.get 실패 · DEFAULT fallback (안전)", async () => {
    (api.get as any).mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useOptimalStockPeriod());
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(result.current.days).toBe(OPTIMAL_STOCK_DEFAULT_DAYS);
  });
});
