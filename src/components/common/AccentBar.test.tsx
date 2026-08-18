// @vitest-environment jsdom
// 2026-08-18 · AccentBar · size/tone/className 매핑
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AccentBar } from "./AccentBar";

describe("AccentBar · 기본 렌더", () => {
  it("span · w-[3px] · rounded-full", () => {
    const { container } = render(<AccentBar />);
    const span = container.querySelector("span")!;
    expect(span).not.toBeNull();
    expect(span.className).toContain("w-[3px]");
    expect(span.className).toContain("rounded-full");
  });

  it("기본 · size=md · tone=brand · h-[16px] · bg-brand-deep", () => {
    const { container } = render(<AccentBar />);
    const span = container.querySelector("span")!;
    expect(span.className).toContain("h-[16px]");
    expect(span.className).toContain("bg-brand-deep");
  });
});

describe("AccentBar · size 매핑", () => {
  it("sm · h-[14px]", () => {
    const { container } = render(<AccentBar size="sm" />);
    expect(container.querySelector("span")!.className).toContain("h-[14px]");
  });
  it("md · h-[16px]", () => {
    const { container } = render(<AccentBar size="md" />);
    expect(container.querySelector("span")!.className).toContain("h-[16px]");
  });
  it("lg · h-[18px]", () => {
    const { container } = render(<AccentBar size="lg" />);
    expect(container.querySelector("span")!.className).toContain("h-[18px]");
  });
  it("xl · h-[24px]", () => {
    const { container } = render(<AccentBar size="xl" />);
    expect(container.querySelector("span")!.className).toContain("h-[24px]");
  });
  it("hero · h-[40px] + gradient", () => {
    const { container } = render(<AccentBar size="hero" />);
    const cls = container.querySelector("span")!.className;
    expect(cls).toContain("h-[40px]");
    expect(cls).toContain("bg-gradient-to-b");
    expect(cls).toContain("from-brand-deep");
  });
});

describe("AccentBar · tone 매핑", () => {
  it("brand · bg-brand-deep", () => {
    const { container } = render(<AccentBar tone="brand" />);
    expect(container.querySelector("span")!.className).toContain("bg-brand-deep");
  });
  it("brand-soft · bg-brand-deep/70", () => {
    const { container } = render(<AccentBar tone="brand-soft" />);
    expect(container.querySelector("span")!.className).toContain("bg-brand-deep/70");
  });
  it("hero · tone 무시 · gradient 강제", () => {
    const { container } = render(<AccentBar size="hero" tone="brand-soft" />);
    const cls = container.querySelector("span")!.className;
    expect(cls).toContain("bg-gradient-to-b");
    expect(cls).not.toContain("bg-brand-deep/70");
  });
});

describe("AccentBar · className 통과", () => {
  it("shrink-0 · mt-0.5 · 추가 적용", () => {
    const { container } = render(<AccentBar className="shrink-0 mt-0.5" />);
    const cls = container.querySelector("span")!.className;
    expect(cls).toContain("shrink-0");
    expect(cls).toContain("mt-0.5");
  });
});

describe("AccentBar · h prop (커스텀 픽셀)", () => {
  it("h={17} · inline style height 적용 · preset 클래스 없음", () => {
    const { container } = render(<AccentBar h={17} />);
    const span = container.querySelector("span")! as HTMLSpanElement;
    expect(span.style.height).toBe("17px");
    expect(span.className).not.toContain("h-[16px]");
    expect(span.className).not.toContain("h-[14px]");
  });

  it("h={22} · 22px", () => {
    const { container } = render(<AccentBar h={22} />);
    expect((container.querySelector("span")! as HTMLSpanElement).style.height).toBe("22px");
  });
});
