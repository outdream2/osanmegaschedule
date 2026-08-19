// @vitest-environment jsdom
// 2026-08-19 · ListLoading · label/size/fullHeight/tone
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ListLoading } from "./ListLoading";

describe("ListLoading · 기본", () => {
  it("기본 라벨 · 불러오는 중...", () => {
    const { container } = render(<ListLoading />);
    expect(container.textContent).toContain("불러오는 중...");
  });

  it("Loader2 svg + animate-spin", () => {
    const { container } = render(<ListLoading />);
    const svg = container.querySelector("svg")!;
    expect(svg).not.toBeNull();
    expect(svg.classList.contains("animate-spin")).toBe(true);
  });

  it("role=status + aria-live=polite", () => {
    const { container } = render(<ListLoading />);
    const root = container.firstElementChild!;
    expect(root.getAttribute("role")).toBe("status");
    expect(root.getAttribute("aria-live")).toBe("polite");
  });

  it("커스텀 label 반영", () => {
    const { container } = render(<ListLoading label="공급사 불러오는 중..." />);
    expect(container.textContent).toContain("공급사 불러오는 중...");
  });

  it("size prop · svg width/height 반영", () => {
    const { container } = render(<ListLoading size={20} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.getAttribute("height")).toBe("20");
  });
});

describe("ListLoading · fullHeight", () => {
  it("fullHeight=false (기본) · py-8", () => {
    const { container } = render(<ListLoading />);
    expect(container.firstElementChild!.className).toContain("py-8");
    expect(container.firstElementChild!.className).not.toContain("flex-1");
  });

  it("fullHeight=true · flex-1 + h-full", () => {
    const { container } = render(<ListLoading fullHeight />);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("flex-1");
    expect(cls).toContain("h-full");
  });
});

describe("ListLoading · tone", () => {
  it("slate (기본) · text-ink-soft", () => {
    const { container } = render(<ListLoading />);
    expect(container.firstElementChild!.className).toContain("text-ink-soft");
  });

  it("rose · text-rose-500 (semantic)", () => {
    const { container } = render(<ListLoading tone="rose" />);
    expect(container.firstElementChild!.className).toContain("text-rose-500");
  });

  it("emerald/sky/indigo · 모두 brand-deep 통일", () => {
    ["emerald", "sky", "indigo"].forEach(tone => {
      const { container } = render(<ListLoading tone={tone as any} />);
      expect(container.firstElementChild!.className).toContain("text-brand-deep");
    });
  });
});

describe("ListLoading · className", () => {
  it("className 병합", () => {
    const { container } = render(<ListLoading className="my-4" />);
    expect(container.firstElementChild!.className).toContain("my-4");
  });
});
