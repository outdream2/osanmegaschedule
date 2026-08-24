// @vitest-environment jsdom
// 2026-08-24 · #261 · SplitRightLoading tests
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SplitRightLoading } from "./SplitRightLoading";

describe("SplitRightLoading", () => {
  it("기본 label · '불러오는 중...'", () => {
    const { container } = render(<SplitRightLoading />);
    expect(container.textContent).toContain("불러오는 중...");
  });
  it("custom label", () => {
    const { container } = render(<SplitRightLoading label="매입 데이터 조회 중" />);
    expect(container.textContent).toContain("매입 데이터 조회 중");
  });
  it("Spinner SVG · 렌더", () => {
    const { container } = render(<SplitRightLoading />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
  it("minHeight 기본 400px", () => {
    const { container } = render(<SplitRightLoading />);
    expect((container.firstChild as HTMLElement).style.minHeight).toBe("400px");
  });
  it("minHeight custom · number", () => {
    const { container } = render(<SplitRightLoading minHeight={600} />);
    expect((container.firstChild as HTMLElement).style.minHeight).toBe("600px");
  });
});
