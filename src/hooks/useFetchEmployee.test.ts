// @vitest-environment jsdom
// 2026-09-03 · useFetchEmployee · GET /api/employees/:id · id null·전환·race·reload·error
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFetchEmployee } from "./useFetchEmployee";

const mockGet = vi.fn();

vi.mock("../lib/apiClient", () => ({
  api: { get: (...args: any[]) => mockGet(...args) },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "ApiError";
    }
  },
}));

beforeEach(() => {
  mockGet.mockReset();
});

describe("useFetchEmployee · id null", () => {
  it("id null · fetch 미호출 · employee null", () => {
    const { result } = renderHook(() => useFetchEmployee(null));
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.employee).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("id undefined · fetch 미호출", () => {
    const { result } = renderHook(() => useFetchEmployee(undefined));
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.employee).toBeNull();
  });
});

describe("useFetchEmployee · 기본 성공", () => {
  it("id 지정 · GET /api/employees/:id · employee 반영", async () => {
    mockGet.mockResolvedValue({ data: { id: 42, name: "홍길동", position: "약사" } });
    const { result } = renderHook(() => useFetchEmployee(42));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith("/api/employees/42");
    expect(result.current.employee).toEqual({ id: 42, name: "홍길동", position: "약사" });
    expect(result.current.error).toBeNull();
  });
});

describe("useFetchEmployee · id 전환", () => {
  it("id 변경 · 새 fetch · employee 교체", async () => {
    mockGet
      .mockResolvedValueOnce({ data: { id: 1, name: "A" } })
      .mockResolvedValueOnce({ data: { id: 2, name: "B" } });
    const { result, rerender } = renderHook(({ id }) => useFetchEmployee(id), {
      initialProps: { id: 1 as number | null },
    });
    await waitFor(() => expect(result.current.employee?.id).toBe(1));
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.employee?.id).toBe(2));
    expect(mockGet).toHaveBeenNthCalledWith(1, "/api/employees/1");
    expect(mockGet).toHaveBeenNthCalledWith(2, "/api/employees/2");
  });

  it("id → null · employee 초기화", async () => {
    mockGet.mockResolvedValue({ data: { id: 1, name: "A" } });
    const { result, rerender } = renderHook(({ id }) => useFetchEmployee(id), {
      initialProps: { id: 1 as number | null },
    });
    await waitFor(() => expect(result.current.employee?.id).toBe(1));
    rerender({ id: null });
    await waitFor(() => expect(result.current.employee).toBeNull());
  });
});

describe("useFetchEmployee · error", () => {
  it("fetch 실패 · error 세팅 · employee null", async () => {
    mockGet.mockRejectedValue(new Error("네트워크 오류"));
    const { result } = renderHook(() => useFetchEmployee(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.employee).toBeNull();
    expect(result.current.error).toBe("네트워크 오류");
  });
});

describe("useFetchEmployee · reload", () => {
  it("reload · 재호출 · 최신값 반영", async () => {
    mockGet
      .mockResolvedValueOnce({ data: { id: 1, name: "old" } })
      .mockResolvedValueOnce({ data: { id: 1, name: "new" } });
    const { result } = renderHook(() => useFetchEmployee(1));
    await waitFor(() => expect(result.current.employee?.name).toBe("old"));
    await act(async () => { await result.current.reload(); });
    expect(result.current.employee?.name).toBe("new");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("id null 상태 · reload · noop", async () => {
    const { result } = renderHook(() => useFetchEmployee(null));
    await act(async () => { await result.current.reload(); });
    expect(mockGet).not.toHaveBeenCalled();
  });
});
