// @vitest-environment jsdom
// 2026-08-29 · #122 Phase 4 · GradientAccent 프리미티브 테스트
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { GradientAccent } from "./GradientAccent";

afterEach(() => cleanup());

describe("GradientAccent · 프리미티브", () => {
  it("기본 · h-[3px] · brand gradient · absolute", () => {
    const { container } = render(<GradientAccent />);
    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    const cls = span!.className;
    expect(cls).toContain("h-[3px]");
    expect(cls).toContain("from-brand-deep");
    expect(cls).toContain("via-sky-500");
    expect(cls).toContain("to-brand-deep");
    expect(cls).toContain("absolute");
    expect(cls).toContain("opacity-90");
  });

  it("size='thin' · h-[2px]", () => {
    const { container } = render(<GradientAccent size="thin" />);
    expect(container.querySelector("span")!.className).toContain("h-[2px]");
  });

  it("size='thick' · h-[5px]", () => {
    const { container } = render(<GradientAccent size="thick" />);
    expect(container.querySelector("span")!.className).toContain("h-[5px]");
  });

  it("tone='soft' · opacity-60", () => {
    const { container } = render(<GradientAccent tone="soft" />);
    const cls = container.querySelector("span")!.className;
    expect(cls).toContain("opacity-60");
    expect(cls).not.toContain("opacity-90");
  });

  it("absolute=false · w-full · absolute 없음", () => {
    const { container } = render(<GradientAccent absolute={false} />);
    const cls = container.querySelector("span")!.className;
    expect(cls).toContain("w-full");
    expect(cls).not.toContain("absolute");
  });

  it("className prop · 병합", () => {
    const { container } = render(<GradientAccent className="my-custom" />);
    expect(container.querySelector("span")!.className).toContain("my-custom");
  });
});
