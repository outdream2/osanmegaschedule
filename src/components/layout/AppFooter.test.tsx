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

  it("copyright · 브랜드 통일 · IRUMs (주) 이룸즈 since 2026", () => {
    const { container } = render(<AppFooter />);
    expect(container.textContent).toContain("IRUMs");
    expect(container.textContent).toContain("이룸즈");
    expect(container.textContent).toContain("since 2026");
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

  it("dot 구분자 · 2개 (shortName · hours · copyright 사이)", () => {
    const { container } = render(<AppFooter />);
    // rounded-full · dot 구분자 · 2개 (지역명 · 시간 · 카피라이트 사이)
    const dots = container.querySelectorAll("span.w-1.h-1.rounded-full");
    expect(dots.length).toBe(2);
  });
});

// 2026-08-23 · #205 · 확장 props · compact · version · extraLinks · className
describe("AppFooter · #205 확장 props", () => {
  it("role=contentinfo · a11y semantic", () => {
    const { container } = render(<AppFooter />);
    expect(container.querySelector('[role="contentinfo"]')).not.toBeNull();
  });

  it("compact · 시간 숨김 · dot 개수 감소", () => {
    const { container } = render(<AppFooter compact />);
    expect(container.textContent).not.toContain("09:00 - 22:00");
    // dot 1개 (시간 앞뒤 중 앞 dot 제거 · copyright 앞만 유지)
    const dots = container.querySelectorAll(".rounded-full");
    expect(dots.length).toBe(1);
  });

  it("version prop · 표시 (font-mono)", () => {
    const { container } = render(<AppFooter version="v1.2.3" />);
    expect(container.textContent).toContain("v1.2.3");
    const versionSpan = Array.from(container.querySelectorAll("span")).find(s => s.textContent === "v1.2.3");
    expect(versionSpan?.className).toContain("font-mono");
  });

  it("extraLinks · 렌더 · 우측 정렬", () => {
    const { container } = render(
      <AppFooter extraLinks={[{ label: "이용약관", href: "/terms" }, { label: "개인정보", href: "/privacy" }]} />,
    );
    expect(container.textContent).toContain("이용약관");
    expect(container.textContent).toContain("개인정보");
    const links = container.querySelectorAll("a");
    expect(links.length).toBe(2);
    expect(links[0].getAttribute("href")).toBe("/terms");
  });

  it("http URL · target=_blank + rel=noopener", () => {
    const { container } = render(
      <AppFooter extraLinks={[{ label: "외부", href: "https://example.com" }]} />,
    );
    const link = container.querySelector("a")!;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("className · 추가 병합", () => {
    const { container } = render(<AppFooter className="sticky bottom-0" />);
    const root = container.firstElementChild!;
    expect(root.className).toContain("sticky");
    expect(root.className).toContain("bottom-0");
  });
});
