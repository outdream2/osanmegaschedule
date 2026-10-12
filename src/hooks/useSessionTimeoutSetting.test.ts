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

  it("상수 · DEFAULT 1440(1일) · MIN 1440(1일) · MAX 10080(7일)", () => {
    expect(SESSION_TIMEOUT_DEFAULT_MINUTES).toBe(1440);
    expect(SESSION_TIMEOUT_MIN_MINUTES).toBe(1440);
    expect(SESSION_TIMEOUT_MAX_MINUTES).toBe(10080);
  });

  it("KV 부재 시 · DEFAULT (1440분·1일) fallback", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    const { result } = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.minutes).toBe(1440);
    expect(result.current.ms).toBe(1440 * 60 * 1000);
  });

  it("KV 유효 (4320분·3일) · 반환", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 4320 } });
    const { result } = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.minutes).toBe(4320);
    expect(result.current.ms).toBe(4320 * 60 * 1000);
  });

  it("KV 범위 밖 (10081·7일 초과) · DEFAULT fallback", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 10081 } });
    const { result } = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.minutes).toBe(1440);
  });

  it("KV 범위 밖 (60·1일 미만) · DEFAULT fallback", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 60 } });
    const { result } = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.minutes).toBe(1440);
  });

  it("KV 문자열 (\"2880\"·2일) · 숫자 반환", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: "2880" } });
    const { result } = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.minutes).toBe(2880);
  });

  it("경계값 · MIN (1440·1일) · MAX (10080·7일) 모두 인정", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 1440 } });
    const r1 = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(r1.result.current.loaded).toBe(true));
    expect(r1.result.current.minutes).toBe(1440);
    r1.unmount();

    (api.get as any).mockResolvedValueOnce({ data: { value: 10080 } });
    const r2 = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(r2.result.current.loaded).toBe(true));
    expect(r2.result.current.minutes).toBe(10080);
  });

  it("ms · minutes * 60 * 1000", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 2880 } });
    const { result } = renderHook(() => useSessionTimeoutSetting());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.ms).toBe(2880 * 60 * 1000);
  });
});
