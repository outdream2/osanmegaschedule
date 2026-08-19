// @vitest-environment jsdom
// 2026-08-19 · VendorCategoryBadge · 5 category 매핑 + null 처리
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { VendorCategoryBadge } from "./VendorCategoryBadge";

describe("VendorCategoryBadge · null 처리", () => {
  it("category null · 아무것도 렌더 안 함", () => {
    const { container } = render(<VendorCategoryBadge category={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("category undefined · 아무것도 렌더 안 함", () => {
    const { container } = render(<VendorCategoryBadge category={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("빈 문자열 · 아무것도 렌더 안 함", () => {
    const { container } = render(<VendorCategoryBadge category="" />);
    expect(container.firstChild).toBeNull();
  });

  it("공백만 · trim 후 empty · 렌더 안 함 (실제로는 valid 검증에서 걸림)", () => {
    const { container } = render(<VendorCategoryBadge category="   " />);
    expect(container.firstChild).toBeNull();
  });

  it("유효하지 않은 category · 렌더 안 함", () => {
    const { container } = render(<VendorCategoryBadge category="알수없음" />);
    expect(container.firstChild).toBeNull();
  });
});

describe("VendorCategoryBadge · 5 카테고리 색상", () => {
  const cases = [
    { cat: "위탁", color: "text-violet-600" },
    { cat: "선결제", color: "text-rose-600" },
    { cat: "60회전", color: "text-emerald-600" },
    { cat: "90회전", color: "text-teal-600" },
    { cat: "기타", color: "text-zinc-500" },
  ];

  cases.forEach(({ cat, color }) => {
    it(`${cat} · ${color}`, () => {
      const { container } = render(<VendorCategoryBadge category={cat} />);
      const span = container.querySelector("span")!;
      expect(span).not.toBeNull();
      expect(span.textContent).toBe(cat);
      expect(span.className).toContain(color);
    });
  });
});

describe("VendorCategoryBadge · 기본 스타일", () => {
  it("text-[11px] font-bold leading-none shrink-0 whitespace-nowrap", () => {
    const { container } = render(<VendorCategoryBadge category="위탁" />);
    const span = container.querySelector("span")!;
    expect(span.className).toContain("text-[11px]");
    expect(span.className).toContain("font-bold");
    expect(span.className).toContain("leading-none");
    expect(span.className).toContain("shrink-0");
    expect(span.className).toContain("whitespace-nowrap");
  });

  it("className 병합", () => {
    const { container } = render(<VendorCategoryBadge category="위탁" className="ml-2" />);
    expect(container.querySelector("span")!.className).toContain("ml-2");
  });
});

describe("VendorCategoryBadge · trim", () => {
  it("앞뒤 공백 · trim 후 매칭", () => {
    const { container } = render(<VendorCategoryBadge category="  위탁  " />);
    const span = container.querySelector("span")!;
    expect(span).not.toBeNull();
    expect(span.textContent).toBe("위탁");
  });
});
