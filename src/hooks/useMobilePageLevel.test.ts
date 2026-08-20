// @vitest-environment jsdom
// 2026-08-20 · useMobilePageLevel · 페이지별 모바일 최소 레벨
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../lib/apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { useMobilePageLevel } from "./useMobilePageLevel";
import { api } from "../lib/apiClient";

const mockGet = api.get as ReturnType<typeof vi.fn>;
const mockPost = api.post as ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  mockPost.mockReset();
  mockGet.mockResolvedValue({ data: { value: null } });
  mockPost.mockResolvedValue({ data: {} });
});

describe("useMobilePageLevel · getMinLevel", () => {
  it("값 없음 · 0 (모두 허용)", async () => {
    const { result } = renderHook(() => useMobilePageLevel());
    expect(result.current.getMinLevel("schedule")).toBe(0);
  });

  it("서버 값 · 반영", async () => {
    mockGet.mockResolvedValue({ data: { value: { schedule: 5, business: 9 } } });
    const { result } = renderHook(() => useMobilePageLevel());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.getMinLevel("schedule")).toBe(5);
    expect(result.current.getMinLevel("business")).toBe(9);
  });
});

describe("useMobilePageLevel · setMinLevel", () => {
  it("level > 0 · 저장", () => {
    const { result } = renderHook(() => useMobilePageLevel());
    act(() => result.current.setMinLevel("schedule", 3));
    expect(result.current.getMinLevel("schedule")).toBe(3);
  });

  it("level 0 · 삭제 (모두 허용)", () => {
    const { result } = renderHook(() => useMobilePageLevel());
    act(() => result.current.setMinLevel("schedule", 5));
    expect(result.current.getMinLevel("schedule")).toBe(5);
    act(() => result.current.setMinLevel("schedule", 0));
    expect(result.current.getMinLevel("schedule")).toBe(0);
    expect(result.current.minLevelMap.schedule).toBeUndefined();
  });

  it("level > 9 · 9로 clamp", () => {
    const { result } = renderHook(() => useMobilePageLevel());
    act(() => result.current.setMinLevel("x", 99));
    expect(result.current.getMinLevel("x")).toBe(9);
  });

  it("소수점 · floor", () => {
    const { result } = renderHook(() => useMobilePageLevel());
    act(() => result.current.setMinLevel("x", 3.7));
    expect(result.current.getMinLevel("x")).toBe(3);
  });

  it("NaN · 삭제 처리", () => {
    const { result } = renderHook(() => useMobilePageLevel());
    act(() => result.current.setMinLevel("x", 5));
    act(() => result.current.setMinLevel("x", NaN));
    expect(result.current.getMinLevel("x")).toBe(0);
  });
});

describe("useMobilePageLevel · canAccessOnMobile", () => {
  it("userLevel >= minLevel · true", () => {
    const { result } = renderHook(() => useMobilePageLevel());
    act(() => result.current.setMinLevel("business", 5));
    expect(result.current.canAccessOnMobile("business", 5)).toBe(true);
    expect(result.current.canAccessOnMobile("business", 9)).toBe(true);
  });

  it("userLevel < minLevel · false", () => {
    const { result } = renderHook(() => useMobilePageLevel());
    act(() => result.current.setMinLevel("business", 5));
    expect(result.current.canAccessOnMobile("business", 3)).toBe(false);
    expect(result.current.canAccessOnMobile("business", 0)).toBe(false);
  });

  it("minLevel 없음 · userLevel 0 도 접근 가능", () => {
    const { result } = renderHook(() => useMobilePageLevel());
    expect(result.current.canAccessOnMobile("public", 0)).toBe(true);
  });
});

describe("useMobilePageLevel · sanitize", () => {
  it("서버 값 · 배열/null · defaultValue fallback", async () => {
    mockGet.mockResolvedValue({ data: { value: [1, 2, 3] } });
    const { result } = renderHook(() => useMobilePageLevel());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    // sanitize null → default 유지
    expect(result.current.getMinLevel("any")).toBe(0);
  });

  it("서버 값 · 유효하지 않은 숫자 값 필터", async () => {
    mockGet.mockResolvedValue({
      data: { value: { good: 5, negative: -1, tooHigh: 15, notNumber: "abc" } }
    });
    const { result } = renderHook(() => useMobilePageLevel());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.getMinLevel("good")).toBe(5);
    // -1, 15, "abc" 는 필터됨 · 0 반환
    expect(result.current.getMinLevel("negative")).toBe(0);
    expect(result.current.getMinLevel("tooHigh")).toBe(0);
    expect(result.current.getMinLevel("notNumber")).toBe(0);
  });
});
