// @vitest-environment jsdom
// 2026-08-19 · EmptyState · icon + title + hint + action + skeleton
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EmptyState } from "./EmptyState";
import { Package } from "lucide-react";

describe("EmptyState · 기본 렌더", () => {
  it("title 표시 · role=status · aria-live=polite", () => {
    const { container } = render(<EmptyState title="결과 없음" />);
    expect(container.textContent).toContain("결과 없음");
    const div = container.firstElementChild!;
    expect(div.getAttribute("role")).toBe("status");
    expect(div.getAttribute("aria-live")).toBe("polite");
  });

  it("기본 · Inbox 아이콘 · 원형 brand-tint 배경", () => {
    const { container } = render(<EmptyState title="x" />);
    const iconWrap = container.querySelector(".w-14.h-14.rounded-full");
    expect(iconWrap).not.toBeNull();
    expect(iconWrap!.className).toContain("bg-brand-tint");
    // svg 이 wrap 안에 있음
    expect(iconWrap!.querySelector("svg")).not.toBeNull();
  });

  it("icon prop · 커스텀 아이콘 렌더", () => {
    const { container } = render(<EmptyState icon={Package} title="x" />);
    const iconWrap = container.querySelector(".w-14.h-14.rounded-full");
    expect(iconWrap!.querySelector("svg")).not.toBeNull();
  });
});

describe("EmptyState · hint + action", () => {
  it("hint 표시 · title 아래", () => {
    const { container } = render(<EmptyState title="결과 없음" hint="검색어 변경" />);
    expect(container.textContent).toContain("검색어 변경");
  });

  it("hint 없으면 · text-ink-soft 요소 없음 (title 외)", () => {
    const { container } = render(<EmptyState title="x" />);
    const softs = container.querySelectorAll(".text-ink-soft");
    expect(softs.length).toBe(0);
  });

  it("action 표시 · mt-3 wrapper", () => {
    const { container } = render(
      <EmptyState title="x" action={<button data-testid="a">발주</button>} />
    );
    expect(container.querySelector('[data-testid="a"]')).not.toBeNull();
    expect(container.querySelector(".mt-3")).not.toBeNull();
  });
});

describe("EmptyState · size 매핑", () => {
  it("compact · py-8", () => {
    const { container } = render(<EmptyState title="x" size="compact" />);
    expect(container.firstElementChild!.className).toContain("py-8");
  });
  it("normal (기본) · py-14", () => {
    const { container } = render(<EmptyState title="x" />);
    expect(container.firstElementChild!.className).toContain("py-14");
  });
  it("large · py-24", () => {
    const { container } = render(<EmptyState title="x" size="large" />);
    expect(container.firstElementChild!.className).toContain("py-24");
  });
});

describe("EmptyState · className", () => {
  it("className 추가 적용", () => {
    const { container } = render(<EmptyState title="x" className="mt-4" />);
    expect(container.firstElementChild!.className).toContain("mt-4");
  });
});
