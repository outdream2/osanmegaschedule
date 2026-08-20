// @vitest-environment jsdom
// 2026-08-20 · #175 · useEmploymentStatus · retireDate 파생 · admin 스킵 · 캐시 공유
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const mockGet = vi.fn();

vi.mock("../lib/apiClient", () => ({
  api: { get: (...args: any[]) => mockGet(...args) },
}));

beforeEach(() => {
  mockGet.mockReset();
  vi.resetModules(); // 모듈 캐시 리셋 · cachedRetireDate 초기화
});

describe("useEmploymentStatus · admin 스킵", () => {
  it("level 9 · fetch 스킵 · status=null · loading=false", async () => {
    mockGet.mockResolvedValue({ data: { retireDate: null } });
    const { useEmploymentStatus } = await import("./useEmploymentStatus");
    const { result } = renderHook(() =>
      useEmploymentStatus({ level: 9, role: "admin", employeeId: 1 } as any),
    );
    expect(result.current.status).toBe(null);
    expect(result.current.loading).toBe(false);
    // 잠시 대기해도 fetch 호출 없음
    await new Promise((r) => setTimeout(r, 10));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("session null · fetch 스킵", async () => {
    const { useEmploymentStatus } = await import("./useEmploymentStatus");
    const { result } = renderHook(() => useEmploymentStatus(null));
    expect(result.current.status).toBe(null);
    expect(result.current.loading).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("employeeId 없음 · fetch 스킵", async () => {
    const { useEmploymentStatus } = await import("./useEmploymentStatus");
    const { result } = renderHook(() =>
      useEmploymentStatus({ level: 1, role: "employee" } as any),
    );
    expect(result.current.status).toBe(null);
    expect(result.current.loading).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe("useEmploymentStatus · 일반 직원 fetch", () => {
  it("retireDate=null · active", async () => {
    mockGet.mockResolvedValue({ data: { retireDate: null } });
    const { useEmploymentStatus } = await import("./useEmploymentStatus");
    const { result } = renderHook(() =>
      useEmploymentStatus({ level: 1, role: "employee", employeeId: 10 } as any),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe("active");
    expect(mockGet).toHaveBeenCalledWith("/api/employees/10");
  });

  it("retireDate 미래 · pending_resignation", async () => {
    // 오늘 이후 날짜 · 100년 뒤로 넉넉히
    const future = new Date();
    future.setFullYear(future.getFullYear() + 100);
    const futureYmd = future.toISOString().slice(0, 10);
    mockGet.mockResolvedValue({ data: { retireDate: futureYmd } });
    const { useEmploymentStatus } = await import("./useEmploymentStatus");
    const { result } = renderHook(() =>
      useEmploymentStatus({ level: 1, role: "employee", employeeId: 11 } as any),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe("pending_resignation");
  });

  it("retireDate 과거 · retired", async () => {
    mockGet.mockResolvedValue({ data: { retireDate: "2020-01-01" } });
    const { useEmploymentStatus } = await import("./useEmploymentStatus");
    const { result } = renderHook(() =>
      useEmploymentStatus({ level: 1, role: "employee", employeeId: 12 } as any),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe("retired");
  });
});

describe("useEmploymentStatus · fetch 실패", () => {
  it("에러 시 · active fallback (사직서 미노출)", async () => {
    mockGet.mockRejectedValue(new Error("network"));
    const { useEmploymentStatus } = await import("./useEmploymentStatus");
    const { result } = renderHook(() =>
      useEmploymentStatus({ level: 1, role: "employee", employeeId: 13 } as any),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    // fallback · null retireDate → active
    expect(result.current.status).toBe("active");
  });
});

describe("useEmploymentStatus · 캐시 공유", () => {
  it("두 번째 마운트 · 캐시 즉시 반환 · fetch 1회", async () => {
    mockGet.mockResolvedValue({ data: { retireDate: null } });
    const { useEmploymentStatus } = await import("./useEmploymentStatus");
    const { result: r1 } = renderHook(() =>
      useEmploymentStatus({ level: 1, role: "employee", employeeId: 20 } as any),
    );
    await waitFor(() => expect(r1.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);

    // 두 번째 hook · 캐시 사용
    const { result: r2 } = renderHook(() =>
      useEmploymentStatus({ level: 1, role: "employee", employeeId: 20 } as any),
    );
    expect(r2.current.loading).toBe(false);
    expect(r2.current.status).toBe("active");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

describe("useEmploymentStatus · invalidate", () => {
  it("invalidateEmploymentStatus · 캐시 무효화 · 재fetch", async () => {
    mockGet.mockResolvedValue({ data: { retireDate: null } });
    const { useEmploymentStatus, invalidateEmploymentStatus } = await import(
      "./useEmploymentStatus"
    );
    const { result } = renderHook(() =>
      useEmploymentStatus({ level: 1, role: "employee", employeeId: 30 } as any),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);

    // 새 데이터
    const future = new Date();
    future.setFullYear(future.getFullYear() + 100);
    const futureYmd = future.toISOString().slice(0, 10);
    mockGet.mockResolvedValue({ data: { retireDate: futureYmd } });

    act(() => {
      invalidateEmploymentStatus();
    });

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.status).toBe("pending_resignation"),
    );
  });
});
