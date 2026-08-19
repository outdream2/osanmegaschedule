// @vitest-environment jsdom
// 2026-08-19 · PageHeader · title + subtitle + icon + iconColor + actions + className
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PageHeader } from "./PageHeader";
import { Package } from "lucide-react";

describe("PageHeader · 기본 렌더", () => {
  it("title 필수 표시 · h2", () => {
    const { container } = render(<PageHeader title="재고 관리" />);
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.textContent).toBe("재고 관리");
  });

  it("subtitle 표시 · title 아래 p 태그", () => {
    const { container } = render(<PageHeader title="재고" subtitle="234건" />);
    const p = container.querySelector("p");
    expect(p).not.toBeNull();
    expect(p!.textContent).toBe("234건");
  });

  it("subtitle 없으면 · p 태그 없음", () => {
    const { container } = render(<PageHeader title="재고" />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("반응형 · flex-col sm:flex-row", () => {
    const { container } = render(<PageHeader title="x" />);
    expect(container.firstElementChild!.className).toContain("flex-col");
    expect(container.firstElementChild!.className).toContain("sm:flex-row");
  });
});

describe("PageHeader · icon", () => {
  it("icon 컴포넌트 렌더 · svg 존재", () => {
    const { container } = render(<PageHeader title="재고" icon={Package} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("iconColor · 기본 text-brand-deep", () => {
    const { container } = render(<PageHeader title="x" icon={Package} />);
    const iconWrap = container.querySelector("span");
    expect(iconWrap!.className).toContain("text-brand-deep");
  });

  it("iconColor · 커스텀 적용", () => {
    const { container } = render(
      <PageHeader title="x" icon={Package} iconColor="text-emerald-500" />
    );
    const iconWrap = container.querySelector("span");
    expect(iconWrap!.className).toContain("text-emerald-500");
  });

  it("icon 없으면 · svg 없음", () => {
    const { container } = render(<PageHeader title="x" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("PageHeader · actions", () => {
  it("actions slot 렌더", () => {
    const { container } = render(
      <PageHeader title="x" actions={<button data-testid="a">발주</button>} />
    );
    expect(container.querySelector('[data-testid="a"]')).not.toBeNull();
  });

  it("actions 없으면 · 우측 영역 렌더 안 함", () => {
    const { container } = render(<PageHeader title="x" />);
    // 좌측 wrap 하나만 있음
    const flexItems = container.querySelectorAll(".flex.items-center");
    expect(flexItems.length).toBe(1);
  });
});

describe("PageHeader · className", () => {
  it("className 병합", () => {
    const { container } = render(<PageHeader title="x" className="mt-4" />);
    expect(container.firstElementChild!.className).toContain("mt-4");
  });
});
