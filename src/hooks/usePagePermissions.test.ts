// @vitest-environment jsdom
// 2026-08-20 · usePagePermissions · fetch 캐시 · invalidate · fallback
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const mockGet = vi.fn();

vi.mock("../lib/apiClient", () => ({
  api: { get: (...args: any[]) => mockGet(...args) },
}));

const samplePerms = {
  landing: { read: 0, write: 9 },
  order: { read: 3, write: 5 },
};

beforeEach(() => {
  mockGet.mockReset();
  vi.resetModules(); // 모듈 캐시 리셋 · cachedPerms 초기화
});

describe("usePagePermissions · fetch 성공", () => {
  it("마운트 · GET /api/permissions · 서버 값 반영", async () => {
    mockGet.mockResolvedValue({ data: samplePerms });
    const { usePagePermissions } = await import("./usePagePermissions");
    const { result } = renderHook(() => usePagePermissions());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.perms.landing).toEqual({ read: 0, write: 9 });
    expect(result.current.perms.order).toEqual({ read: 3, write: 5 });
  });

  it("DEFAULT_PERMISSIONS 병합 · 서버 값 우선", async () => {
    mockGet.mockResolvedValue({ data: { landing: { read: 5, write: 5 } } });
    const { usePagePermissions } = await import("./usePagePermissions");
    const { result } = renderHook(() => usePagePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // 서버 값 · landing 오버라이드
    expect(result.current.perms.landing).toEqual({ read: 5, write: 5 });
  });
});

describe("usePagePermissions · fetch 실패", () => {
  it("에러 시 · DEFAULT_PERMISSIONS 반환", async () => {
    mockGet.mockRejectedValue(new Error("network"));
    const { usePagePermissions } = await import("./usePagePermissions");
    const { result } = renderHook(() => usePagePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // DEFAULT_PERMISSIONS · landing key 존재 확인
    expect(result.current.perms).toBeTruthy();
    expect(typeof result.current.perms).toBe("object");
  });
});

describe("usePagePermissions · 캐시 공유", () => {
  it("두 번째 마운트 · 캐시 즉시 반환 · fetch 1회만", async () => {
    mockGet.mockResolvedValue({ data: samplePerms });
    const { usePagePermissions } = await import("./usePagePermissions");
    const { result: r1 } = renderHook(() => usePagePermissions());
    await waitFor(() => expect(r1.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);
    // 두 번째 hook · 캐시 사용
    const { result: r2 } = renderHook(() => usePagePermissions());
    // 캐시 있으므로 loading 초기부터 false
    expect(r2.current.loading).toBe(false);
    expect(r2.current.perms.order).toEqual({ read: 3, write: 5 });
    // GET · 여전히 1회만
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

describe("usePagePermissions · invalidate", () => {
  it("invalidatePagePermissions · 캐시 무효화 + 이벤트 · 재fetch", async () => {
    mockGet.mockResolvedValue({ data: samplePerms });
    const { usePagePermissions, invalidatePagePermissions } = await import("./usePagePermissions");
    const { result } = renderHook(() => usePagePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);
    // 새 값
    mockGet.mockResolvedValue({ data: { ...samplePerms, order: { read: 7, write: 9 } } });
    act(() => { invalidatePagePermissions(); });
    // 이벤트 발신 · 훅이 재fetch
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.perms.order).toEqual({ read: 7, write: 9 }));
  });
});
