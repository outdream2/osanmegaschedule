// @vitest-environment jsdom
// 2026-08-23 · #252 · useSessionTimeoutSetting · sanitize · fallback
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  useSessionTimeoutSetting,
  SESSION_TIMEOUT_DEFAULT_MINUTES,
  SESSION_TIMEOUT_MIN_MINUTES,
  SESSION_TIMEOUT_MAX_MINUTES,
} from "./useSessionTimeoutSetting";

vi.mock("../lib/apiClient", () => ({
  api: {
    get: vi.fn(async () => ({ data: null })),
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
  },
  ApiError: class ApiError extends Error {},
}));

import { api } from "../lib/apiClient";

describe("useSessionTimeoutSetting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try { localStorage.clear(); } catch { /* noop */ }
  });
  afterEach(() => {
    vi.clearAllMocks();
    try { localStorage.clear(); } catch { /* noop */ }
  });

  it("상수 · DEFAULT 30 · MIN 5 · MAX 480", () => {
    expect(SESSION_TIMEOUT_DEFAULT_MINUTES).toBe(30);
    expect(SESSION_TIMEOUT_MIN_MINUTES).toBe(5);
    expect(SESSION_TIMEOUT_MAX_MINUTES).toBe(480);
  });

  it("KV 부재 시 · DEFAULT (30분) fallback", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    const { result } = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.minutes).toBe(30);
    expect(result.current.ms).toBe(30 * 60 * 1000);
  });

  it("KV 유효 (60분) · 반환", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 60 } });
    const { result } = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.minutes).toBe(60);
    expect(result.current.ms).toBe(60 * 60 * 1000);
  });

  it("KV 범위 밖 (500) · DEFAULT fallback", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 500 } });
    const { result } = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.minutes).toBe(30);
  });

  it("KV 범위 밖 (3) · DEFAULT fallback", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 3 } });
    const { result } = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.minutes).toBe(30);
  });

  it("KV 문자열 (\"120\") · 숫자 반환", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: "120" } });
    const { result } = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.minutes).toBe(120);
  });

  it("경계값 · MIN (5) · MAX (480) 모두 인정", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 5 } });
    const r1 = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(r1.result.current.loaded).toBe(true));
    expect(r1.result.current.minutes).toBe(5);
    r1.unmount();

    (api.get as any).mockResolvedValueOnce({ data: { value: 480 } });
    const r2 = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(r2.result.current.loaded).toBe(true));
    expect(r2.result.current.minutes).toBe(480);
  });

  it("ms · minutes * 60 * 1000", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 45 } });
    const { result } = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.ms).toBe(45 * 60 * 1000);
  });
});
