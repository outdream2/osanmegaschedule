// @vitest-environment jsdom
// 2026-08-18 · Spinner · Loader2 + 라벨 렌더
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Spinner } from "./Spinner";

describe("Spinner · 기본 렌더", () => {
  it("Loader2 svg · animate-spin · brand-deep", () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector("svg")!;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("class")).toContain("animate-spin");
    expect(svg.getAttribute("class")).toContain("text-brand-deep");
  });

  it("size prop · svg 크기 변경", () => {
    const { container } = render(<Spinner size={20} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("20");
  });

  it("tone=emerald · text-emerald-600", () => {
    const { container } = render(<Spinner tone="emerald" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("text-emerald-600");
  });
});

describe("Spinner · 라벨", () => {
  it("label 없으면 · svg 만 렌더", () => {
    const { container } = render(<Spinner />);
    expect(container.textContent).toBe("");
    expect(container.querySelector("span")).toBeNull();
  });

  it("label 있으면 · span wrapper + text", () => {
    const { container } = render(<Spinner label="로딩 중..." />);
    expect(container.textContent).toContain("로딩 중...");
    const wrapper = container.querySelector("span");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.className).toContain("inline-flex");
    expect(wrapper!.className).toContain("gap-1.5");
  });

  it("labelSize · inline style fontSize", () => {
    const { container } = render(<Spinner label="x" labelSize={16} />);
    // 두번째 span 이 label text
    const labels = container.querySelectorAll("span");
    const label = labels[1] as HTMLSpanElement;
    expect(label.style.fontSize).toBe("16px");
  });
});

describe("Spinner · className", () => {
  it("className 통과 · wrapper 에 추가", () => {
    const { container } = render(<Spinner label="x" className="mt-2" />);
    expect(container.querySelector("span")!.className).toContain("mt-2");
  });
  it("label 없을 때도 svg 에 className 통과", () => {
    const { container } = render(<Spinner className="mt-2" />);
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("mt-2");
  });
});
