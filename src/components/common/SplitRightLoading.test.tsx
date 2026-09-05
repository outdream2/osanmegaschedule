// @vitest-environment jsdom
// 2026-09-06 · #261 · SplitRightLoading 프리미티브 tests
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SplitRightLoading } from "./SplitRightLoading";

describe("SplitRightLoading · 기본 렌더", () => {
  it("기본 라벨 렌더", () => {
    const { container } = render(<SplitRightLoading />);
    expect(container.textContent).toContain("불러오는 중...");
  });
  it("custom 라벨 렌더", () => {
    const { container } = render(<SplitRightLoading label="매입이력 조회 중..." />);
    expect(container.textContent).toContain("매입이력 조회 중...");
  });
  it("minHeight 기본 400 · style 적용", () => {
    const { container } = render(<SplitRightLoading />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.minHeight).toBe("400px");
  });
  it("minHeight custom number → px", () => {
    const { container } = render(<SplitRightLoading minHeight={300} />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.minHeight).toBe("300px");
  });
  it("minHeight string 그대로", () => {
    const { container } = render(<SplitRightLoading minHeight="60vh" />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.minHeight).toBe("60vh");
  });
});
