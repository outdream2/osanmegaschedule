// @vitest-environment jsdom
// 2026-09-06 · #261 · SplitRightHeader 프리미티브 tests
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SplitRightHeader } from "./SplitRightHeader";

describe("SplitRightHeader · 기본 렌더", () => {
  it("title 필수 렌더", () => {
    const { container } = render(<SplitRightHeader title="매입이력" />);
    expect(container.textContent).toContain("매입이력");
  });
  it("subtitle 렌더", () => {
    const { container } = render(
      <SplitRightHeader title="매입이력" subtitle="최근 6개월" />
    );
    expect(container.textContent).toContain("최근 6개월");
  });
  it("right slot 렌더", () => {
    const { getByText } = render(
      <SplitRightHeader title="매입이력" right={<span>닫기</span>} />
    );
    expect(getByText("닫기")).toBeTruthy();
  });
  it("role=heading aria-level=2", () => {
    const { container } = render(<SplitRightHeader title="매입이력" />);
    const heading = container.querySelector("[role='heading']");
    expect(heading).not.toBeNull();
    expect(heading?.getAttribute("aria-level")).toBe("2");
  });
  it("withBorder=false · border-b 없음", () => {
    const { container } = render(<SplitRightHeader title="헤더" withBorder={false} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).not.toContain("border-b");
  });
});
