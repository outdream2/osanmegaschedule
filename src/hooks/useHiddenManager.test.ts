// @vitest-environment jsdom
// 2026-08-19 · useHiddenManager · 숨김 상품 로드/해제 · API mock
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useHiddenManager } from "./useHiddenManager";

const mockGet = vi.fn();
const mockPatch = vi.fn();
vi.mock("../lib/apiClient", () => ({
  api: {
    get: (...args: any[]) => mockGet(...args),
    patch: (...args: any[]) => mockPatch(...args),
  },
}));

beforeEach(() => {
  mockGet.mockReset();
  mockPatch.mockReset();
});

const sample = [
  { product_code: "P1", product_name: "타이레놀" },
  { product_code: "P2", product_name: "이바네정" },
];

describe("useHiddenManager · 초기 상태", () => {
  it("초기 · modalOpen=false · list=[] · loading=false · unhideBusyCode=null", () => {
    const { result } = renderHook(() => useHiddenManager());
    expect(result.current.modalOpen).toBe(false);
    expect(result.current.list).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.unhideBusyCode).toBeNull();
  });
});

describe("useHiddenManager · load", () => {
  it("load 성공 · list 반영 · loading false", async () => {
    mockGet.mockResolvedValue({ data: sample });
    const { result } = renderHook(() => useHiddenManager());
    await act(async () => { await result.current.load(); });
    expect(mockGet).toHaveBeenCalledWith("/api/products/hidden");
    expect(result.current.list).toEqual(sample);
    expect(result.current.loading).toBe(false);
  });

  it("load 실패 · list=[]", async () => {
    mockGet.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useHiddenManager());
    await act(async () => { await result.current.load(); });
    expect(result.current.list).toEqual([]);
  });

  it("Array 아닌 응답 · list=[]", async () => {
    mockGet.mockResolvedValue({ data: { not: "array" } });
    const { result } = renderHook(() => useHiddenManager());
    await act(async () => { await result.current.load(); });
    expect(result.current.list).toEqual([]);
  });
});

describe("useHiddenManager · open / close", () => {
  it("open · modalOpen=true + load 자동 호출", async () => {
    mockGet.mockResolvedValue({ data: sample });
    const { result } = renderHook(() => useHiddenManager());
    act(() => { result.current.open(); });
    expect(result.current.modalOpen).toBe(true);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
  });

  it("close · modalOpen=false", () => {
    const { result } = renderHook(() => useHiddenManager());
    act(() => { result.current.setModalOpen(true); });
    expect(result.current.modalOpen).toBe(true);
    act(() => { result.current.close(); });
    expect(result.current.modalOpen).toBe(false);
  });
});

describe("useHiddenManager · unhide", () => {
  it("unhide 성공 · PATCH 호출 · list 에서 제거", async () => {
    mockGet.mockResolvedValue({ data: sample });
    mockPatch.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useHiddenManager());
    await act(async () => { await result.current.load(); });
    expect(result.current.list.length).toBe(2);
    await act(async () => { await result.current.unhide("P1"); });
    expect(mockPatch).toHaveBeenCalledWith("/api/products/P1", { hidden: false });
    expect(result.current.list.length).toBe(1);
    expect(result.current.list[0].product_code).toBe("P2");
    expect(result.current.unhideBusyCode).toBeNull();
  });

  it("unhide 실패 · list 유지 (제거 안 됨)", async () => {
    mockGet.mockResolvedValue({ data: sample });
    mockPatch.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useHiddenManager());
    await act(async () => { await result.current.load(); });
    await act(async () => { await result.current.unhide("P1"); });
    expect(result.current.list.length).toBe(2);
    expect(result.current.unhideBusyCode).toBeNull();
  });

  it("빈 code · PATCH 호출 안 함", async () => {
    const { result } = renderHook(() => useHiddenManager());
    await act(async () => { await result.current.unhide(""); });
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("URL 인코딩 · 특수 문자", async () => {
    mockPatch.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useHiddenManager());
    await act(async () => { await result.current.unhide("P/1"); });
    expect(mockPatch).toHaveBeenCalledWith("/api/products/P%2F1", { hidden: false });
  });

  it("onUnhideSuccess 콜백 호출", async () => {
    mockGet.mockResolvedValue({ data: sample });
    mockPatch.mockResolvedValue({ data: {} });
    const onUnhideSuccess = vi.fn();
    const { result } = renderHook(() => useHiddenManager({ onUnhideSuccess }));
    await act(async () => { await result.current.load(); });
    await act(async () => { await result.current.unhide("P1"); });
    expect(onUnhideSuccess).toHaveBeenCalledWith("P1");
  });
});
