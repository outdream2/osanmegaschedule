// @vitest-environment jsdom
// 2026-08-18 · InlineLabel · AccentBar + label 렌더 테스트
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { InlineLabel } from "./InlineLabel";

describe("InlineLabel · 기본 렌더", () => {
  it("children 표시 + AccentBar span 존재", () => {
    const { container } = render(<InlineLabel>기간</InlineLabel>);
    expect(container.textContent).toContain("기간");
    // 첫 span 이 wrapper · 두번째 span 이 AccentBar · 세번째가 label
    expect(container.querySelectorAll("span").length).toBeGreaterThanOrEqual(3);
  });

  it("기본 · md size · text-[15px] · gap-2", () => {
    const { container } = render(<InlineLabel>x</InlineLabel>);
    const outer = container.querySelector("span")!;
    expect(outer.className).toContain("gap-2");
    expect(outer.className).toContain("shrink-0");
    expect(outer.className).toContain("inline-flex");
    // 마지막 span (label text)
    const label = container.querySelectorAll("span")[2];
    expect(label.className).toContain("text-[15px]");
    expect(label.className).toContain("font-bold");
    expect(label.className).toContain("text-ink");
  });
});

describe("InlineLabel · size 매핑", () => {
  it("sm · text-[14px] + gap-1.5 + bar sm(h-14)", () => {
    const { container } = render(<InlineLabel size="sm">x</InlineLabel>);
    const outer = container.querySelector("span")!;
    expect(outer.className).toContain("gap-1.5");
    const label = container.querySelectorAll("span")[2];
    expect(label.className).toContain("text-[14px]");
    // AccentBar 두번째 span
    const bar = container.querySelectorAll("span")[1];
    expect(bar.className).toContain("h-[14px]");
  });

  it("md · text-[15px] + bar md(h-16)", () => {
    const { container } = render(<InlineLabel size="md">x</InlineLabel>);
    const bar = container.querySelectorAll("span")[1];
    expect(bar.className).toContain("h-[16px]");
    const label = container.querySelectorAll("span")[2];
    expect(label.className).toContain("text-[15px]");
  });

  it("lg · text-[16px] + bar lg(h-18)", () => {
    const { container } = render(<InlineLabel size="lg">x</InlineLabel>);
    const bar = container.querySelectorAll("span")[1];
    expect(bar.className).toContain("h-[18px]");
    const label = container.querySelectorAll("span")[2];
    expect(label.className).toContain("text-[16px]");
  });
});

describe("InlineLabel · className 통과", () => {
  it("추가 className 적용", () => {
    const { container } = render(<InlineLabel className="mt-2">x</InlineLabel>);
    expect(container.querySelector("span")!.className).toContain("mt-2");
  });
});
