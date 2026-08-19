// @vitest-environment jsdom
// 2026-08-19 · useFetch · GET · loading/error · select 매핑 · deps 재요청 · null url
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFetch } from "./useFetch";

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const errResponse = (status: number, body?: unknown) => ({
  ok: false,
  status,
  json: async () => body,
  text: async () => (body ? JSON.stringify(body) : ""),
});

describe("useFetch · 초기 · 성공", () => {
  it("마운트 즉시 · 성공 · data 반영 · loading false", async () => {
    mockFetch.mockResolvedValue(okResponse({ rows: [1, 2, 3] }));
    const { result } = renderHook(() => useFetch<{ rows: number[] }>("/api/test"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ rows: [1, 2, 3] });
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith("/api/test");
  });

  it("select · 응답 shape 매핑", async () => {
    mockFetch.mockResolvedValue(okResponse({ rows: [1, 2, 3] }));
    const { result } = renderHook(() =>
      useFetch<number[]>("/api/test", { select: (r) => (r as any).rows })
    );
    await waitFor(() => expect(result.current.data).toEqual([1, 2, 3]));
  });
});

describe("useFetch · 실패 처리", () => {
  it("HTTP 에러 · error 메시지 (server error 포함)", async () => {
    mockFetch.mockResolvedValue(errResponse(500, { error: "서버 오류" }));
    const { result } = renderHook(() => useFetch("/api/test"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("서버 오류");
    expect(result.current.data).toBeNull();
  });

  it("HTTP 404 · 기본 에러 메시지", async () => {
    mockFetch.mockResolvedValue(errResponse(404));
    const { result } = renderHook(() => useFetch("/api/test"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain("404");
  });

  it("네트워크 에러 · error 반영", async () => {
    mockFetch.mockRejectedValue(new Error("network fail"));
    const { result } = renderHook(() => useFetch("/api/test"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("network fail");
  });
});

describe("useFetch · null url · fetch 하지 않음", () => {
  it("url=null · fetch 미호출 · data null · loading false", async () => {
    const { result } = renderHook(() => useFetch<number>(null));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe("useFetch · immediate=false", () => {
  it("immediate=false · 마운트 시 fetch 미호출 · refetch 호출 시만 요청", async () => {
    mockFetch.mockResolvedValue(okResponse({ rows: [42] }));
    const { result } = renderHook(() =>
      useFetch<{ rows: number[] }>("/api/test", { immediate: false })
    );
    expect(mockFetch).not.toHaveBeenCalled();
    await result.current.refetch();
    await waitFor(() => expect(result.current.data).toEqual({ rows: [42] }));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("useFetch · deps 변경 · 자동 재요청", () => {
  it("deps 변경 시 · 재요청", async () => {
    mockFetch.mockResolvedValue(okResponse({ id: 1 }));
    let vendorId = 1;
    const { result, rerender } = renderHook(({ vid }) =>
      useFetch(`/api/x?id=${vid}`, { deps: [vid] })
    , { initialProps: { vid: vendorId } });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vendorId = 2;
    mockFetch.mockResolvedValue(okResponse({ id: 2 }));
    rerender({ vid: vendorId });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch).toHaveBeenLastCalledWith("/api/x?id=2");
  });
});

describe("useFetch · refetch", () => {
  it("수동 refetch · 새 데이터 가져옴", async () => {
    mockFetch.mockResolvedValue(okResponse({ n: 1 }));
    const { result } = renderHook(() => useFetch<{ n: number }>("/api/test"));
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));

    mockFetch.mockResolvedValue(okResponse({ n: 2 }));
    await result.current.refetch();
    await waitFor(() => expect(result.current.data).toEqual({ n: 2 }));
  });
});
