// @vitest-environment jsdom
// 2026-08-18 · IconTile · 렌더 + tone/size/shape 매핑
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { IconTile } from "./IconTile";

describe("IconTile · 기본 렌더", () => {
  it("icon element 표시", () => {
    const { container } = render(<IconTile icon={<svg data-testid="i" />} />);
    expect(container.querySelector('[data-testid="i"]')).not.toBeNull();
  });

  it("기본 · tone=brand · size=md · shape=rounded", () => {
    const { container } = render(<IconTile icon={<svg />} />);
    const span = container.querySelector("span")!;
    expect(span.className).toContain("bg-brand-tint");
    expect(span.className).toContain("text-brand-deep");
    expect(span.className).toContain("w-7"); // md
    expect(span.className).toContain("h-7");
    expect(span.className).toContain("rounded-lg");
  });

  it("size 변형 · sm=24 · lg=36", () => {
    const { container: sm } = render(<IconTile icon={<svg />} size="sm" />);
    expect(sm.querySelector("span")!.className).toContain("w-6");
    expect(sm.querySelector("span")!.className).toContain("h-6");
    const { container: lg } = render(<IconTile icon={<svg />} size="lg" />);
    expect(lg.querySelector("span")!.className).toContain("w-9");
    expect(lg.querySelector("span")!.className).toContain("h-9");
  });

  it("shape=full · rounded-full", () => {
    const { container } = render(<IconTile icon={<svg />} shape="full" />);
    expect(container.querySelector("span")!.className).toContain("rounded-full");
  });

  it("tone 매핑 · emerald · violet · rose · pine", () => {
    const cases: Array<[string, string, string]> = [
      ["emerald", "bg-emerald-100", "text-emerald-700"],
      ["violet",  "bg-violet-100",  "text-violet-700"],
      ["rose",    "bg-rose-100",    "text-rose-700"],
      ["pine",    "bg-[#01796F]/10", "text-[#01796F]"],
    ];
    cases.forEach(([tone, bg, text]) => {
      const { container } = render(<IconTile icon={<svg />} tone={tone as any} />);
      const span = container.querySelector("span")!;
      expect(span.className).toContain(bg);
      expect(span.className).toContain(text);
    });
  });

  it("inset light + subtle shadow · Attio 톤", () => {
    const { container } = render(<IconTile icon={<svg />} />);
    const span = container.querySelector("span")!;
    expect(span.className).toContain("shadow-[inset_0_1px_0");
    expect(span.className).toContain("rgba(10,46,74,0.05)");
  });

  it("className prop · 추가 적용", () => {
    const { container } = render(<IconTile icon={<svg />} className="extra-class" />);
    expect(container.querySelector("span")!.className).toContain("extra-class");
  });
});
