// @vitest-environment jsdom
// 2026-08-20 · useStampsMap · 도장 이미지 매핑
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../lib/apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { useStampsMap } from "./useStampsMap";
import { api } from "../lib/apiClient";

const mockGet = api.get as ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { value: null } });
  (api.post as ReturnType<typeof vi.fn>).mockReset();
  (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
});

describe("useStampsMap · 서버 로드", () => {
  it("서버 값 · 배열 · sanitize 후 반영", async () => {
    mockGet.mockResolvedValue({
      data: {
        value: [
          { name: "홍길동", imageUrl: "https://cdn/hong.png" },
          { name: "김철수", imageUrl: "https://cdn/kim.png", bundledFallback: "sungstamp" },
        ],
      },
    });
    const { result } = renderHook(() => useStampsMap());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.stamps).toHaveLength(2);
    expect(result.current.stamps[0].name).toBe("홍길동");
  });

  it("배열 아님 · sanitize null · default fallback", async () => {
    mockGet.mockResolvedValue({ data: { value: { not: "array" } } });
    const { result } = renderHook(() => useStampsMap());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    // DEFAULT_STAMPS_MAP · 빈 배열 or 초기값
    expect(Array.isArray(result.current.stamps)).toBe(true);
  });

  it("이름 없는 항목 · 필터", async () => {
    mockGet.mockResolvedValue({
      data: {
        value: [
          { name: "정상", imageUrl: "url1" },
          { name: "", imageUrl: "url2" }, // 빈 이름 필터
          { imageUrl: "url3" }, // 이름 없음 필터
          null,
          "string",
        ],
      },
    });
    const { result } = renderHook(() => useStampsMap());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.stamps).toHaveLength(1);
    expect(result.current.stamps[0].name).toBe("정상");
  });

  it("bundledFallback · sungstamp/kyustamp 만 허용", async () => {
    mockGet.mockResolvedValue({
      data: {
        value: [
          { name: "a", imageUrl: "", bundledFallback: "sungstamp" },
          { name: "b", imageUrl: "", bundledFallback: "kyustamp" },
          { name: "c", imageUrl: "", bundledFallback: "invalid" },
        ],
      },
    });
    const { result } = renderHook(() => useStampsMap());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.stamps[0].bundledFallback).toBe("sungstamp");
    expect(result.current.stamps[1].bundledFallback).toBe("kyustamp");
    expect(result.current.stamps[2].bundledFallback).toBeUndefined();
  });
});

describe("useStampsMap · findStamp", () => {
  it("이름 매칭 · 반환", async () => {
    mockGet.mockResolvedValue({
      data: { value: [{ name: "홍길동", imageUrl: "url1" }] },
    });
    const { result } = renderHook(() => useStampsMap());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.findStamp("홍길동")).toBeDefined();
    expect(result.current.findStamp("홍길동")!.name).toBe("홍길동");
  });

  it("공백 trim 후 매칭", async () => {
    mockGet.mockResolvedValue({
      data: { value: [{ name: "홍길동", imageUrl: "url1" }] },
    });
    const { result } = renderHook(() => useStampsMap());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.findStamp("  홍길동  ")).toBeDefined();
  });

  it("없는 이름 · undefined", async () => {
    const { result } = renderHook(() => useStampsMap());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.findStamp("없음")).toBeUndefined();
  });
});

describe("useStampsMap · addStamp / removeStamp", () => {
  it("addStamp · 신규 추가", async () => {
    const { result } = renderHook(() => useStampsMap());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const initialLen = result.current.stamps.length;
    act(() => result.current.addStamp({ name: "새로운", imageUrl: "url" }));
    expect(result.current.stamps.length).toBe(initialLen + 1);
    expect(result.current.findStamp("새로운")).toBeDefined();
  });

  it("addStamp · 같은 이름 · 교체 (중복 방지)", async () => {
    const { result } = renderHook(() => useStampsMap());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => {
      result.current.addStamp({ name: "홍길동", imageUrl: "url1" });
      result.current.addStamp({ name: "홍길동", imageUrl: "url2" });
    });
    const found = result.current.stamps.filter(s => s.name === "홍길동");
    expect(found).toHaveLength(1);
    expect(found[0].imageUrl).toBe("url2");
  });

  it("removeStamp · 이름으로 삭제", async () => {
    const { result } = renderHook(() => useStampsMap());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.addStamp({ name: "삭제대상", imageUrl: "url" }));
    expect(result.current.findStamp("삭제대상")).toBeDefined();
    act(() => result.current.removeStamp("삭제대상"));
    expect(result.current.findStamp("삭제대상")).toBeUndefined();
  });
});
