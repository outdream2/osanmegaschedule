// @vitest-environment jsdom
// 2026-08-19 · FilterBar · children/gap/className
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FilterBar } from "./FilterBar";

describe("FilterBar · 기본", () => {
  it("children 렌더", () => {
    const { container } = render(
      <FilterBar>
        <span data-testid="c">child</span>
      </FilterBar>
    );
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
  });

  it("card surface · bg-white + rounded-xl + border", () => {
    const { container } = render(<FilterBar>x</FilterBar>);
    const root = container.firstElementChild!;
    expect(root.className).toContain("bg-white");
    expect(root.className).toContain("rounded-xl");
    expect(root.className).toContain("border");
    expect(root.className).toContain("border-line");
  });

  it("flex-wrap · items-center · padding", () => {
    const { container } = render(<FilterBar>x</FilterBar>);
    const root = container.firstElementChild!;
    expect(root.className).toContain("flex-wrap");
    expect(root.className).toContain("items-center");
    expect(root.className).toContain("px-4");
    expect(root.className).toContain("py-3");
  });
});

describe("FilterBar · gap", () => {
  it("medium (기본) · gap-x-4 gap-y-2", () => {
    const { container } = render(<FilterBar>x</FilterBar>);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("gap-x-4");
    expect(cls).toContain("gap-y-2");
  });

  it("tight · gap-x-2 gap-y-2", () => {
    const { container } = render(<FilterBar gap="tight">x</FilterBar>);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("gap-x-2");
    expect(cls).toContain("gap-y-2");
  });

  it("loose · gap-x-6 gap-y-3", () => {
    const { container } = render(<FilterBar gap="loose">x</FilterBar>);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("gap-x-6");
    expect(cls).toContain("gap-y-3");
  });
});

describe("FilterBar · className", () => {
  it("className 병합", () => {
    const { container } = render(<FilterBar className="mt-4">x</FilterBar>);
    expect(container.firstElementChild!.className).toContain("mt-4");
  });
});
