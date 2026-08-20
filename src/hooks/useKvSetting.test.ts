// @vitest-environment jsdom
// 2026-08-20 · useKvSetting · 서버 KV 훅 · 로컬캐시·debounce·race 방어
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../lib/apiClient", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { useKvSetting } from "./useKvSetting";
import { api } from "../lib/apiClient";

const mockGet = api.get as ReturnType<typeof vi.fn>;
const mockPost = api.post as ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  mockPost.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useKvSetting · 초기값", () => {
  it("로컬 캐시 없음 · 서버 응답 전 · defaultValue", async () => {
    mockGet.mockResolvedValue({ data: { value: null } });
    const { result } = renderHook(() =>
      useKvSetting({ key: "test", defaultValue: { a: 1 } })
    );
    expect(result.current.value).toEqual({ a: 1 });
    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));
  });

  it("로컬 캐시 존재 · 즉시 반영 · loaded=false", () => {
    localStorage.setItem("kv:test", JSON.stringify({ a: 99 }));
    mockGet.mockResolvedValue({ data: { value: null } });
    const { result } = renderHook(() =>
      useKvSetting({ key: "test", defaultValue: { a: 1 } })
    );
    expect(result.current.value).toEqual({ a: 99 });
  });

  it("서버 값 · loaded 후 반영", async () => {
    mockGet.mockResolvedValue({ data: { value: { a: 42 } } });
    const { result } = renderHook(() =>
      useKvSetting({ key: "test", defaultValue: { a: 1 } })
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.value).toEqual({ a: 42 });
    expect(localStorage.getItem("kv:test")).toBe(JSON.stringify({ a: 42 }));
  });
});

describe("useKvSetting · sanitize", () => {
  it("서버 값이 sanitize 실패 · defaultValue 유지", async () => {
    mockGet.mockResolvedValue({ data: { value: "invalid" } });
    const sanitize = (raw: unknown) => (typeof raw === "object" && raw !== null ? raw as any : null);
    const { result } = renderHook(() =>
      useKvSetting({ key: "test", defaultValue: { a: 1 }, sanitize })
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.value).toEqual({ a: 1 });
  });
});

describe("useKvSetting · setValue · debounce 저장", () => {
  it("setValue · 로컬 즉시 · 서버 debounce POST", async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValue({ data: { value: null } });
    mockPost.mockResolvedValue({ data: { ok: true } });

    const { result } = renderHook(() =>
      useKvSetting({ key: "test", defaultValue: 0, debounceMs: 100 })
    );

    act(() => result.current.setValue(5));
    expect(result.current.value).toBe(5);
    expect(localStorage.getItem("kv:test")).toBe("5");
    expect(mockPost).not.toHaveBeenCalled(); // 아직 debounce 중

    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });
    expect(mockPost).toHaveBeenCalledWith("/api/settings", { key: "test", value: 5 });
  });

  it("연속 setValue · debounce 마지막 값만 서버 저장", async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValue({ data: { value: null } });
    mockPost.mockResolvedValue({ data: { ok: true } });

    const { result } = renderHook(() =>
      useKvSetting<number>({ key: "test", defaultValue: 0, debounceMs: 100 })
    );

    act(() => {
      result.current.setValue(1);
      result.current.setValue(2);
      result.current.setValue(3);
    });
    expect(result.current.value).toBe(3);

    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/api/settings", { key: "test", value: 3 });
  });

  it("setValue · updater 함수 형태", async () => {
    mockGet.mockResolvedValue({ data: { value: null } });
    mockPost.mockResolvedValue({ data: {} });
    const { result } = renderHook(() =>
      useKvSetting<number>({ key: "test", defaultValue: 10 })
    );
    act(() => result.current.setValue(prev => prev + 5));
    expect(result.current.value).toBe(15);
  });
});

describe("useKvSetting · race 방어", () => {
  it("서버 응답 도착 전 편집 · 서버 값이 사용자 편집을 덮지 않음", async () => {
    let resolveGet: (v: any) => void = () => {};
    mockGet.mockImplementation(() => new Promise((resolve) => { resolveGet = resolve; }));
    mockPost.mockResolvedValue({ data: {} });

    const { result } = renderHook(() =>
      useKvSetting<number>({ key: "test", defaultValue: 0 })
    );
    expect(result.current.value).toBe(0);

    // 사용자 편집
    act(() => result.current.setValue(100));
    expect(result.current.value).toBe(100);

    // 이제 서버 응답 도착
    await act(async () => {
      resolveGet({ data: { value: 999 } });
      await Promise.resolve();
    });

    // 사용자 편집이 유지되어야 함
    expect(result.current.value).toBe(100);
  });
});

describe("useKvSetting · saveNow", () => {
  it("debounce 취소 · 즉시 POST", async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValue({ data: { value: null } });
    mockPost.mockResolvedValue({ data: {} });

    const { result } = renderHook(() =>
      useKvSetting<number>({ key: "test", defaultValue: 0, debounceMs: 10000 })
    );

    act(() => result.current.setValue(7));
    expect(mockPost).not.toHaveBeenCalled();

    await act(async () => {
      const ok = await result.current.saveNow();
      expect(ok).toBe(true);
    });
    expect(mockPost).toHaveBeenCalledWith("/api/settings", { key: "test", value: 7 });
  });

  it("saveNow · POST 실패 · false 반환", async () => {
    mockGet.mockResolvedValue({ data: { value: null } });
    mockPost.mockRejectedValue(new Error("네트워크"));
    const { result } = renderHook(() =>
      useKvSetting<number>({ key: "test", defaultValue: 0 })
    );
    await act(async () => {
      const ok = await result.current.saveNow();
      expect(ok).toBe(false);
    });
    await waitFor(() => expect(result.current.saveState).toBe("error"));
  });
});

describe("useKvSetting · reload", () => {
  it("reload · 서버 재조회 · 값 갱신", async () => {
    mockGet.mockResolvedValueOnce({ data: { value: 10 } })
           .mockResolvedValueOnce({ data: { value: 20 } });
    const { result } = renderHook(() =>
      useKvSetting<number>({ key: "test", defaultValue: 0 })
    );
    await waitFor(() => expect(result.current.value).toBe(10));
    await act(async () => { await result.current.reload(); });
    expect(result.current.value).toBe(20);
  });
});
