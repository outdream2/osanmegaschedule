// @vitest-environment jsdom
// 2026-08-24 · #261 · SplitRightEmpty 프리미티브 tests
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Package } from "lucide-react";
import { SplitRightEmpty } from "./SplitRightEmpty";

describe("SplitRightEmpty · 기본 렌더", () => {
  it("title 필수 렌더", () => {
    const { container } = render(<SplitRightEmpty title="좌측에서 공급사를 선택하세요" />);
    expect(container.textContent).toContain("좌측에서 공급사를 선택하세요");
  });
  it("hint · title 아래 렌더", () => {
    const { container } = render(
      <SplitRightEmpty title="선택하세요" hint="매입이력 표시됩니다" />
    );
    expect(container.textContent).toContain("매입이력 표시됩니다");
  });
  it("icon · SVG 렌더", () => {
    const { container } = render(
      <SplitRightEmpty icon={Package as unknown as React.ComponentType<{ size?: number; className?: string; weight?: string }>} title="선택" />
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });
  it("minHeight 기본 400 · style 적용", () => {
    const { container } = render(<SplitRightEmpty title="선택" />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.minHeight).toBe("400px");
  });
  it("minHeight custom · number → px", () => {
    const { container } = render(<SplitRightEmpty title="선택" minHeight={600} />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.minHeight).toBe("600px");
  });
  it("minHeight string · 그대로 적용", () => {
    const { container } = render(<SplitRightEmpty title="선택" minHeight="50vh" />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.minHeight).toBe("50vh");
  });
});
