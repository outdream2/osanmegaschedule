// @vitest-environment jsdom
// 2026-08-20 · useCompanyInfo · company_info settings key wrapping
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../lib/apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { useCompanyInfo } from "./useCompanyInfo";
import { api } from "../lib/apiClient";
import { DEFAULT_COMPANY_INFO } from "../types";

const mockGet = api.get as ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { value: null } });
  (api.post as ReturnType<typeof vi.fn>).mockReset();
  (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
});

describe("useCompanyInfo", () => {
  it("초기 · DEFAULT_COMPANY_INFO", () => {
    const { result } = renderHook(() => useCompanyInfo());
    expect(result.current.info).toEqual(DEFAULT_COMPANY_INFO);
    expect(result.current.loaded).toBe(false);
  });

  it("서버 값 · 필수 필드 반영", async () => {
    mockGet.mockResolvedValue({
      data: { value: { name: "새 약국", address: "서울시", regNo: "111-11-11111", representativeName: "김대표" } }
    });
    const { result } = renderHook(() => useCompanyInfo());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.info.name).toBe("새 약국");
    expect(result.current.info.address).toBe("서울시");
    expect(result.current.info.regNo).toBe("111-11-11111");
    expect(result.current.info.representativeName).toBe("김대표");
  });

  it("setInfo · patch 병합", () => {
    const { result } = renderHook(() => useCompanyInfo());
    act(() => result.current.setInfo({ name: "신규명" }));
    expect(result.current.info.name).toBe("신규명");
    // 다른 필드 유지
    expect(result.current.info.address).toBe(DEFAULT_COMPANY_INFO.address);
  });

  it("setAll · 전체 교체", () => {
    const { result } = renderHook(() => useCompanyInfo());
    const next = {
      name: "전체 교체",
      address: "부산",
      regNo: "222-22-22222",
      representativeName: "이대표",
    };
    act(() => result.current.setAll(next));
    expect(result.current.info).toEqual(next);
  });

  it("sanitize · 잘못된 필드 타입 · default 로 보정", async () => {
    mockGet.mockResolvedValue({
      data: { value: { name: 123, address: null, regNo: "OK" } }
    });
    const { result } = renderHook(() => useCompanyInfo());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.info.name).toBe(DEFAULT_COMPANY_INFO.name); // 123 → default
    expect(result.current.info.address).toBe(DEFAULT_COMPANY_INFO.address);
    expect(result.current.info.regNo).toBe("OK");
  });

  it("representativeTitle · 선택 필드 · 문자열 아니면 undefined", async () => {
    mockGet.mockResolvedValue({
      data: { value: { representativeTitle: 42 } }
    });
    const { result } = renderHook(() => useCompanyInfo());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.info.representativeTitle).toBeUndefined();
  });
});
