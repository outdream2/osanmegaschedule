// @vitest-environment jsdom
// 2026-08-19 · SectionLabel · dot + text (block) 렌더
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SectionLabel } from "./SectionLabel";

describe("SectionLabel · 기본 렌더", () => {
  it("children 표시 · dot + text span 존재", () => {
    const { container } = render(<SectionLabel>발주필요</SectionLabel>);
    expect(container.textContent).toContain("발주필요");
    // dot span (w-[3px] h-[16px])
    expect(container.querySelector(".w-\\[3px\\]")).not.toBeNull();
  });

  it("기본 tone=teal · text-brand · dot bg-brand", () => {
    const { container } = render(<SectionLabel>x</SectionLabel>);
    const spans = container.querySelectorAll("span");
    // dot 은 두번째 (첫번째는 wrapper의 accent bar)
    const dot = container.querySelector(".w-\\[3px\\]");
    expect(dot!.className).toContain("bg-brand");
    // label text · text-brand class
    const label = spans[spans.length - 1];
    expect(label.className).toContain("text-brand");
  });
});

describe("SectionLabel · tone 매핑", () => {
  it("amber · text-brand-amber-ink + dot bg-brand-amber", () => {
    const { container } = render(<SectionLabel tone="amber">x</SectionLabel>);
    const spans = container.querySelectorAll("span");
    const dot = container.querySelector(".w-\\[3px\\]");
    expect(dot!.className).toContain("bg-brand-amber");
    const label = spans[spans.length - 1];
    expect(label.className).toContain("text-brand-amber-ink");
  });

  it("coral · text-brand-coral + dot bg-brand-coral", () => {
    const { container } = render(<SectionLabel tone="coral">x</SectionLabel>);
    const dot = container.querySelector(".w-\\[3px\\]");
    expect(dot!.className).toContain("bg-brand-coral");
  });

  it("sky · text-brand-sky", () => {
    const { container } = render(<SectionLabel tone="sky">x</SectionLabel>);
    const dot = container.querySelector(".w-\\[3px\\]");
    expect(dot!.className).toContain("bg-brand-sky");
  });

  it("zinc · text-zinc-600 + dot bg-zinc-400", () => {
    const { container } = render(<SectionLabel tone="zinc">x</SectionLabel>);
    const dot = container.querySelector(".w-\\[3px\\]");
    expect(dot!.className).toContain("bg-zinc-400");
  });
});

describe("SectionLabel · right slot", () => {
  it("right prop · ml-auto 로 우측 배치", () => {
    const { container } = render(
      <SectionLabel right={<span data-testid="btn">+ 추가</span>}>x</SectionLabel>
    );
    const btn = container.querySelector('[data-testid="btn"]');
    expect(btn).not.toBeNull();
    expect(btn!.parentElement!.className).toContain("ml-auto");
  });

  it("right 없으면 · 별도 wrapper 없음", () => {
    const { container } = render(<SectionLabel>x</SectionLabel>);
    expect(container.querySelector(".ml-auto")).toBeNull();
  });
});

describe("SectionLabel · className", () => {
  it("className 추가 적용", () => {
    const { container } = render(<SectionLabel className="mt-4">x</SectionLabel>);
    expect(container.querySelector("div")!.className).toContain("mt-4");
  });
});
