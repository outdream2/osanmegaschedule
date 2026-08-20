// @vitest-environment jsdom
// 2026-08-20 · useBrandIdentity · brand_identity settings key wrapping
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../lib/apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { useBrandIdentity } from "./useBrandIdentity";
import { api } from "../lib/apiClient";
import { DEFAULT_BRAND_IDENTITY } from "../types";

const mockGet = api.get as ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { value: null } });
  (api.post as ReturnType<typeof vi.fn>).mockReset();
  (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
});

describe("useBrandIdentity", () => {
  it("초기 · DEFAULT_BRAND_IDENTITY", () => {
    const { result } = renderHook(() => useBrandIdentity());
    expect(result.current.brand).toEqual(DEFAULT_BRAND_IDENTITY);
  });

  it("서버 값 · shortName·brandNameEn 반영", async () => {
    mockGet.mockResolvedValue({
      data: { value: { shortName: "테스트약국", brandNameEn: "TEST", appTitle: "관리시스템" } }
    });
    const { result } = renderHook(() => useBrandIdentity());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.brand.shortName).toBe("테스트약국");
    expect(result.current.brand.brandNameEn).toBe("TEST");
  });

  it("setBrand · patch 병합", () => {
    const { result } = renderHook(() => useBrandIdentity());
    act(() => result.current.setBrand({ shortName: "새 이름" }));
    expect(result.current.brand.shortName).toBe("새 이름");
    // 다른 필드 유지
    expect(result.current.brand.appTitle).toBe(DEFAULT_BRAND_IDENTITY.appTitle);
  });

  it("악성 logoUrl · safeUrl 필터", async () => {
    mockGet.mockResolvedValue({
      data: { value: { logoUrl: "javascript:alert(1)" } }
    });
    const { result } = renderHook(() => useBrandIdentity());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    // 악성은 undefined 처리
    expect(result.current.brand.logoUrl).toBeUndefined();
  });

  it("정상 logoUrl · 유지", async () => {
    mockGet.mockResolvedValue({
      data: { value: { logoUrl: "https://cdn.example.com/logo.png" } }
    });
    const { result } = renderHook(() => useBrandIdentity());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.brand.logoUrl).toBe("https://cdn.example.com/logo.png");
  });

  it("빈 문자열 필드 · default fallback", async () => {
    mockGet.mockResolvedValue({
      data: { value: {} }
    });
    const { result } = renderHook(() => useBrandIdentity());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.brand.shortName).toBe(DEFAULT_BRAND_IDENTITY.shortName);
  });
});
