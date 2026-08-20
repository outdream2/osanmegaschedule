// @vitest-environment jsdom
// 2026-08-20 · useVendors · 공급사 캐시 · findVendorByName · getVendorCategory
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../lib/apiClient", () => ({
  api: { get: vi.fn() },
}));

import { useVendors } from "./useVendors";
import { api } from "../lib/apiClient";

const mockGet = api.get as ReturnType<typeof vi.fn>;

const sampleVendors = [
  { id: 1, company_name: "대웅제약", category: "60회전", contact_name: null, phone: null, email: null, business_number: null },
  { id: 2, company_name: "(주)한독", category: "위탁", contact_name: null, phone: null, email: null, business_number: null },
  { id: 3, company_name: "코스트팜약국 (본점)", category: null, contact_name: null, phone: null, email: null, business_number: null },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: sampleVendors });
  // 모듈 캐시 리셋을 위해 재초기화가 필요하지만 exports가 없음 · vendors-changed 이벤트로 강제 재조회
});

describe("useVendors · 초기 로드", () => {
  it("mockGet · /api/vendors 호출 · 목록 반영", async () => {
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.vendors.length).toBeGreaterThan(0));
    expect(mockGet).toHaveBeenCalledWith("/api/vendors?withBalances=1");
    expect(result.current.vendors).toHaveLength(3);
  });
});

describe("useVendors · findVendorByName", () => {
  it("정확 일치 · 반환", async () => {
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.vendors.length).toBeGreaterThan(0));
    expect(result.current.findVendorByName("대웅제약")?.id).toBe(1);
  });

  it("공백 포함 · trim 후 매칭", async () => {
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.vendors.length).toBeGreaterThan(0));
    expect(result.current.findVendorByName("  대웅제약  ")?.id).toBe(1);
  });

  it("괄호 부가정보 제거 후 매칭", async () => {
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.vendors.length).toBeGreaterThan(0));
    // "(주)한독" 검색 → 괄호 제거 후 "한독" · 그러나 "(주)한독" 자체가 정확 일치
    expect(result.current.findVendorByName("(주)한독")?.id).toBe(2);
  });

  it("includes 포함 매칭 · 상호 부분일치", async () => {
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.vendors.length).toBeGreaterThan(0));
    expect(result.current.findVendorByName("코스트팜약국")?.id).toBe(3);
  });

  it("빈 문자열/없는 이름 · undefined", async () => {
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.vendors.length).toBeGreaterThan(0));
    expect(result.current.findVendorByName("")).toBeUndefined();
    expect(result.current.findVendorByName("없는공급사XYZ")).toBeUndefined();
  });
});

describe("useVendors · vendorMap", () => {
  it("company_name → Vendor 매핑", async () => {
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.vendors.length).toBeGreaterThan(0));
    expect(result.current.vendorMap["대웅제약"]).toBeDefined();
    expect(result.current.vendorMap["대웅제약"].id).toBe(1);
  });
});

describe("useVendors · getVendorCategory", () => {
  it("정확 일치 · category 반환", async () => {
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.vendors.length).toBeGreaterThan(0));
    expect(result.current.getVendorCategory("대웅제약")).toBe("60회전");
  });

  it("(주) 접두어 있는 이름도 정규화 매칭", async () => {
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.vendors.length).toBeGreaterThan(0));
    // "한독" → "(주)한독" 매칭 (displayVendorName 정규화)
    const cat = result.current.getVendorCategory("한독");
    expect(cat).toBe("위탁");
  });

  it("null/undefined · null 반환", async () => {
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.vendors.length).toBeGreaterThan(0));
    expect(result.current.getVendorCategory(null)).toBeNull();
    expect(result.current.getVendorCategory(undefined)).toBeNull();
    expect(result.current.getVendorCategory("")).toBeNull();
  });

  it("없는 공급사 · null", async () => {
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.vendors.length).toBeGreaterThan(0));
    expect(result.current.getVendorCategory("없는공급사XYZ12345")).toBeNull();
  });
});

describe("useVendors · vendors-changed 이벤트", () => {
  it("vendors-changed dispatch · 강제 재조회", async () => {
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.vendors.length).toBeGreaterThan(0));
    const callCountBefore = mockGet.mock.calls.length;

    // 새 데이터로 응답 설정
    mockGet.mockResolvedValueOnce({ data: [...sampleVendors, { id: 999, company_name: "신규", category: null, contact_name: null, phone: null, email: null, business_number: null }] });

    act(() => {
      window.dispatchEvent(new CustomEvent("vendors-changed"));
    });

    await waitFor(() => expect(mockGet.mock.calls.length).toBeGreaterThan(callCountBefore));
  });
});
