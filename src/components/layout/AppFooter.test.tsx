// @vitest-environment jsdom
// 2026-08-20 · AppFooter · brand·contact 반영 + fallback
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../lib/apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { AppFooter } from "./AppFooter";
import { api } from "../../lib/apiClient";

const mockGet = api.get as ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { value: null } });
  (api.post as ReturnType<typeof vi.fn>).mockReset();
  (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
});

describe("AppFooter · fallback (서버 값 없음)", () => {
  it("shortName · 기본값 (메가타운 or 오산메가타운)", () => {
    const { container } = render(<AppFooter />);
    // DEFAULT_BRAND_IDENTITY.shortName = "메가타운 약국"
    expect(container.textContent).toContain("메가타운");
  });

  it("영업시간 · '09:00 - 22:00'", () => {
    const { container } = render(<AppFooter />);
    expect(container.textContent).toContain("09:00 - 22:00");
  });

  it("copyright · 기본 '(주)이룸즈(IRUMS)'", () => {
    const { container } = render(<AppFooter />);
    expect(container.textContent).toContain("copyright");
    expect(container.textContent).toContain("이룸즈");
  });
});

describe("AppFooter · flex 레이아웃", () => {
  it("flex items-center justify-center + flex-wrap", () => {
    const { container } = render(<AppFooter />);
    const root = container.firstElementChild!;
    expect(root.className).toContain("flex");
    expect(root.className).toContain("items-center");
    expect(root.className).toContain("justify-center");
    expect(root.className).toContain("flex-wrap");
  });

  it("dot 구분자 · 2개", () => {
    const { container } = render(<AppFooter />);
    const dots = container.querySelectorAll(".rounded-full");
    expect(dots.length).toBe(2);
  });
});
