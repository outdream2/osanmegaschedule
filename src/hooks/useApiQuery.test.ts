// @vitest-environment jsdom
// 2026-08-19 · useApiQuery · GET · loading/error · skip · select · initialData · 401 handler
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useApiQuery } from "./useApiQuery";

const mockGet = vi.fn();

class MockApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

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

describe("useApiQuery · 기본 성공", () => {
  it("마운트 즉시 · GET 호출 · data 반영", async () => {
    mockGet.mockResolvedValue({ data: { id: 1, name: "테스트" } });
    const { result } = renderHook(() => useApiQuery("/api/x"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ id: 1, name: "테스트" });
    expect(result.current.error).toBeNull();
    expect(mockGet).toHaveBeenCalledWith("/api/x");
  });

  it("initialData · 초기값 제공 · fetch 후 대체", async () => {
    mockGet.mockResolvedValue({ data: [1, 2, 3] });
    const { result } = renderHook(() => useApiQuery<number[]>("/api/x", { initialData: [] }));
    expect(result.current.data).toEqual([]);
    await waitFor(() => expect(result.current.data).toEqual([1, 2, 3]));
  });
});

describe("useApiQuery · select · 응답 매핑", () => {
  it("select · 응답 변환", async () => {
    mockGet.mockResolvedValue({ data: { rows: [1, 2] } });
    const { result } = renderHook(() =>
      useApiQuery<number[]>("/api/x", { select: (raw) => (raw as any).rows })
    );
    await waitFor(() => expect(result.current.data).toEqual([1, 2]));
  });
});

describe("useApiQuery · skip", () => {
  it("skip=true · fetch 미호출 · loading=false", () => {
    const { result } = renderHook(() => useApiQuery("/api/x", { skip: true }));
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("skip 변경 · false 되면 fetch 시작", async () => {
    mockGet.mockResolvedValue({ data: "loaded" });
    let skip = true;
    const { result, rerender } = renderHook(({ s }) =>
      useApiQuery("/api/x", { skip: s }), { initialProps: { s: skip } }
    );
    expect(mockGet).not.toHaveBeenCalled();
    skip = false;
    rerender({ s: false });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
  });
});

describe("useApiQuery · 에러 처리", () => {
  it("ApiError · error 메시지 반영", async () => {
    const { ApiError } = await import("../lib/apiClient");
    mockGet.mockRejectedValue(new (ApiError as any)(500, "서버 오류"));
    const { result } = renderHook(() => useApiQuery("/api/x"));
    await waitFor(() => expect(result.current.error).toBe("서버 오류"));
  });

  it("일반 Error · error 메시지 · 네트워크 오류 기본", async () => {
    mockGet.mockRejectedValue(new Error("network fail"));
    const { result } = renderHook(() => useApiQuery("/api/x"));
    await waitFor(() => expect(result.current.error).toBe("network fail"));
  });

  it("401 · onUnauthorized 콜백 호출", async () => {
    const { ApiError } = await import("../lib/apiClient");
    mockGet.mockRejectedValue(new (ApiError as any)(401, "세션 만료"));
    const onUnauthorized = vi.fn();
    renderHook(() => useApiQuery("/api/x", { onUnauthorized }));
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
  });
});

describe("useApiQuery · refetch", () => {
  it("refetch · 새 데이터 로드", async () => {
    mockGet.mockResolvedValue({ data: "first" });
    const { result } = renderHook(() => useApiQuery<string>("/api/x"));
    await waitFor(() => expect(result.current.data).toBe("first"));
    mockGet.mockResolvedValue({ data: "second" });
    await act(async () => { await result.current.refetch(); });
    expect(result.current.data).toBe("second");
  });
});

describe("useApiQuery · url 변경", () => {
  it("url 변경 · 새 fetch", async () => {
    mockGet.mockResolvedValue({ data: "x" });
    const { rerender } = renderHook(({ url }) => useApiQuery(url), {
      initialProps: { url: "/api/a" },
    });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    rerender({ url: "/api/b" });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(mockGet).toHaveBeenLastCalledWith("/api/b");
  });
});
