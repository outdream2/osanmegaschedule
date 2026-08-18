// @vitest-environment jsdom
// 2026-08-19 · IconButton · 렌더 + click + dot
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { IconButton } from "./IconButton";

describe("IconButton · 기본 렌더", () => {
  it("icon 표시 · button 렌더", () => {
    const { container } = render(<IconButton icon={<svg data-testid="i" />} />);
    expect(container.querySelector("button")).not.toBeNull();
    expect(container.querySelector('[data-testid="i"]')).not.toBeNull();
  });

  it("type='button' · 폼 안 사고 방지", () => {
    const { container } = render(<IconButton icon={<svg />} />);
    expect(container.querySelector("button")!.type).toBe("button");
  });

  it("기본 스타일 · w-9 h-9 · rounded-[10px] · border-line", () => {
    const { container } = render(<IconButton icon={<svg />} />);
    const cls = container.querySelector("button")!.className;
    expect(cls).toContain("w-9");
    expect(cls).toContain("h-9");
    expect(cls).toContain("rounded-[10px]");
    expect(cls).toContain("border-line");
  });
});

describe("IconButton · onClick", () => {
  it("클릭 시 · onClick 호출", () => {
    const fn = vi.fn();
    const { container } = render(<IconButton icon={<svg />} onClick={fn} />);
    (container.querySelector("button") as HTMLElement).click();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("onClick 미지정 · 클릭 후 에러 없음", () => {
    const { container } = render(<IconButton icon={<svg />} />);
    expect(() => (container.querySelector("button") as HTMLElement).click()).not.toThrow();
  });
});

describe("IconButton · notification dot", () => {
  it("showDot=false (기본) · dot 미표시", () => {
    const { container } = render(<IconButton icon={<svg />} />);
    const dots = container.querySelectorAll("span.rounded-full");
    expect(dots.length).toBe(0);
  });

  it("showDot=true · dot 표시 · absolute top/right", () => {
    const { container } = render(<IconButton icon={<svg />} showDot />);
    const dot = container.querySelector("span.absolute.rounded-full");
    expect(dot).not.toBeNull();
    expect(dot!.className).toContain("top-1.5");
    expect(dot!.className).toContain("right-1.5");
  });
});

describe("IconButton · aria + title + className", () => {
  it("ariaLabel · aria-label 적용", () => {
    const { container } = render(<IconButton icon={<svg />} ariaLabel="알림" />);
    expect(container.querySelector("button")!.getAttribute("aria-label")).toBe("알림");
  });

  it("title · title 속성 적용", () => {
    const { container } = render(<IconButton icon={<svg />} title="Bell" />);
    expect(container.querySelector("button")!.getAttribute("title")).toBe("Bell");
  });

  it("className · 추가 적용", () => {
    const { container } = render(<IconButton icon={<svg />} className="mt-2" />);
    expect(container.querySelector("button")!.className).toContain("mt-2");
  });
});
