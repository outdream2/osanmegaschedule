// @vitest-environment jsdom
// 2026-08-20 · useMobileVisibility · boolean 기반 (legacy · useMobilePageLevel 병행)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../lib/apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { useMobileVisibility } from "./useMobileVisibility";
import { api } from "../lib/apiClient";

const mockGet = api.get as ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { value: null } });
  (api.post as ReturnType<typeof vi.fn>).mockReset();
  (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
});

describe("useMobileVisibility · isMobileAllowed", () => {
  it("값 없음 · true (기본 허용)", () => {
    const { result } = renderHook(() => useMobileVisibility());
    expect(result.current.isMobileAllowed("schedule")).toBe(true);
  });

  it("서버 값 · false · 차단", async () => {
    mockGet.mockResolvedValue({ data: { value: { hidden: false } } });
    const { result } = renderHook(() => useMobileVisibility());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.isMobileAllowed("hidden")).toBe(false);
  });

  it("서버 값 · true · 허용", async () => {
    mockGet.mockResolvedValue({ data: { value: { visible: true } } });
    const { result } = renderHook(() => useMobileVisibility());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.isMobileAllowed("visible")).toBe(true);
  });
});

describe("useMobileVisibility · setMobileAllowed", () => {
  it("특정 페이지 · true → false 토글", () => {
    const { result } = renderHook(() => useMobileVisibility());
    act(() => result.current.setMobileAllowed("test", false));
    expect(result.current.isMobileAllowed("test")).toBe(false);
    act(() => result.current.setMobileAllowed("test", true));
    expect(result.current.isMobileAllowed("test")).toBe(true);
  });

  it("여러 페이지 · 독립 관리", () => {
    const { result } = renderHook(() => useMobileVisibility());
    act(() => {
      result.current.setMobileAllowed("page1", false);
      result.current.setMobileAllowed("page2", true);
    });
    expect(result.current.isMobileAllowed("page1")).toBe(false);
    expect(result.current.isMobileAllowed("page2")).toBe(true);
    expect(result.current.isMobileAllowed("page3")).toBe(true); // 기본 허용
  });
});

describe("useMobileVisibility · sanitize", () => {
  it("배열 · null → default fallback", async () => {
    mockGet.mockResolvedValue({ data: { value: [1, 2, 3] } });
    const { result } = renderHook(() => useMobileVisibility());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.isMobileAllowed("any")).toBe(true);
  });

  it("boolean 아닌 값 · 필터", async () => {
    mockGet.mockResolvedValue({
      data: { value: { valid: false, invalid1: "str", invalid2: 0 } }
    });
    const { result } = renderHook(() => useMobileVisibility());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.isMobileAllowed("valid")).toBe(false);
    expect(result.current.isMobileAllowed("invalid1")).toBe(true); // 필터되어 default
    expect(result.current.isMobileAllowed("invalid2")).toBe(true);
  });
});
