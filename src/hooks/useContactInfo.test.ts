// @vitest-environment jsdom
// 2026-08-20 · useContactInfo · contact_info settings key wrapping
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../lib/apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { useContactInfo } from "./useContactInfo";
import { api } from "../lib/apiClient";
import { DEFAULT_CONTACT_INFO } from "../types";

const mockGet = api.get as ReturnType<typeof vi.fn>;
const mockPost = api.post as ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  mockPost.mockReset();
  mockGet.mockResolvedValue({ data: { value: null } });
  mockPost.mockResolvedValue({ data: {} });
});

describe("useContactInfo · defaults", () => {
  it("초기 · DEFAULT_CONTACT_INFO", () => {
    const { result } = renderHook(() => useContactInfo());
    expect(result.current.contact).toEqual(DEFAULT_CONTACT_INFO);
  });
});

describe("useContactInfo · 서버 값 로드", () => {
  it("정상 · sanitize 후 반영", async () => {
    mockGet.mockResolvedValue({
      data: { value: { phone: "010-1234-5678", email: "a@b.com", businessHours: "09-22" } }
    });
    const { result } = renderHook(() => useContactInfo());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.contact.phone).toBe("010-1234-5678");
    expect(result.current.contact.email).toBe("a@b.com");
    expect(result.current.contact.businessHours).toBe("09-22");
  });

  it("일부 필드만 · 나머지는 default fallback", async () => {
    mockGet.mockResolvedValue({ data: { value: { phone: "111" } } });
    const { result } = renderHook(() => useContactInfo());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.contact.phone).toBe("111");
    expect(result.current.contact.email).toBe(DEFAULT_CONTACT_INFO.email);
  });
});

describe("useContactInfo · setContact", () => {
  it("patch · 부분 merge", () => {
    const { result } = renderHook(() => useContactInfo());
    act(() => result.current.setContact({ phone: "999" }));
    expect(result.current.contact.phone).toBe("999");
    // 나머지 default 유지
    expect(result.current.contact.email).toBe(DEFAULT_CONTACT_INFO.email);
  });

  it("여러 필드 · 한 번에 patch", () => {
    const { result } = renderHook(() => useContactInfo());
    act(() => result.current.setContact({ phone: "111", email: "x@y.com" }));
    expect(result.current.contact.phone).toBe("111");
    expect(result.current.contact.email).toBe("x@y.com");
  });
});

describe("useContactInfo · sanitize · 안전 URL", () => {
  it("악성 URL · javascript: · 필터", async () => {
    mockGet.mockResolvedValue({
      data: { value: { website: "javascript:alert(1)" } }
    });
    const { result } = renderHook(() => useContactInfo());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    // safeLinkUrl 는 javascript: 제거 · default 로 fallback
    expect(result.current.contact.website).not.toContain("javascript:");
  });

  it("정상 URL · 유지", async () => {
    mockGet.mockResolvedValue({
      data: { value: { website: "https://example.com" } }
    });
    const { result } = renderHook(() => useContactInfo());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.contact.website).toBe("https://example.com");
  });
});
