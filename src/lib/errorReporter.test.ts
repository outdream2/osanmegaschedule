// @vitest-environment jsdom
// 2026-08-20 · errorReporter · reportError (batched fetch)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { reportError } from "./errorReporter";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  mockFetch = vi.fn().mockResolvedValue({ ok: true });
  (globalThis as any).fetch = mockFetch;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reportError · 큐잉 + batch flush", () => {
  it("단일 에러 · 2000ms 후 · fetch 1회 · /api/client-errors", async () => {
    reportError(new Error("테스트 에러"));
    expect(mockFetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2100);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/client-errors");
  });

  it("여러 에러 · 1회 flush 로 batch 전송", async () => {
    reportError(new Error("에러1"));
    reportError(new Error("에러2"));
    reportError(new Error("에러3"));

    await vi.advanceTimersByTimeAsync(2100);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.errors).toHaveLength(3);
  });

  it("Error 객체 · message + stack 포함", async () => {
    const err = new Error("실패");
    reportError(err, "unit-test");
    await vi.advanceTimersByTimeAsync(2100);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.errors[0].message).toBe("실패");
    expect(body.errors[0].source).toBe("unit-test");
    expect(body.errors[0].stack).toBeTruthy();
    expect(body.errors[0].timestamp).toBeGreaterThan(0);
  });

  it("문자열 에러 · message 로 변환", async () => {
    reportError("문자열 에러");
    await vi.advanceTimersByTimeAsync(2100);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.errors[0].message).toBe("문자열 에러");
    expect(body.errors[0].stack).toBeUndefined();
  });

  it("source 기본값 · 'custom'", async () => {
    reportError(new Error("x"));
    await vi.advanceTimersByTimeAsync(2100);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.errors[0].source).toBe("custom");
  });

  it("URL·UA 정보 포함", async () => {
    reportError(new Error("x"));
    await vi.advanceTimersByTimeAsync(2100);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.errors[0].url).toBeTruthy();
    expect(body.errors[0].ua).toBeTruthy();
  });

  it("fetch 실패 · silent (throw 없음)", async () => {
    mockFetch.mockRejectedValue(new Error("네트워크"));
    reportError(new Error("x"));
    // vi.advanceTimersByTimeAsync 는 처리 시간 리턴 · throw 여부만 검증
    await vi.advanceTimersByTimeAsync(2100);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("MAX_QUEUE (20) 초과 · 후속 에러 drop", async () => {
    for (let i = 0; i < 30; i++) reportError(new Error(`e${i}`));
    await vi.advanceTimersByTimeAsync(2100);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.errors.length).toBeLessThanOrEqual(20);
  });

  it("POST body · Content-Type application/json", async () => {
    reportError(new Error("x"));
    await vi.advanceTimersByTimeAsync(2100);
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    expect(mockFetch.mock.calls[0][1].headers).toEqual({ "Content-Type": "application/json" });
    expect(mockFetch.mock.calls[0][1].credentials).toBe("include");
  });
});
