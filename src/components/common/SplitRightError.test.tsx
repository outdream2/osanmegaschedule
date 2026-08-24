// @vitest-environment jsdom
// 2026-08-24 · #261 · SplitRightError tests
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SplitRightError } from "./SplitRightError";

describe("SplitRightError", () => {
  it("기본 title · '조회 실패'", () => {
    const { container } = render(<SplitRightError />);
    expect(container.textContent).toContain("조회 실패");
  });
  it("custom title", () => {
    const { container } = render(<SplitRightError title="원장 조회 실패" />);
    expect(container.textContent).toContain("원장 조회 실패");
  });
  it("message · mono 블럭", () => {
    const { container } = render(<SplitRightError message="404 not found" />);
    expect(container.textContent).toContain("404 not found");
    expect(container.querySelector(".font-mono")).not.toBeNull();
  });
  it("onRetry 있음 · 버튼 렌더 + 클릭 콜백", () => {
    const onRetry = vi.fn();
    const { container } = render(<SplitRightError onRetry={onRetry} />);
    const btn = container.querySelector("button")!;
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("onRetry 없음 · 버튼 미렌더", () => {
    const { container } = render(<SplitRightError />);
    expect(container.querySelector("button")).toBeNull();
  });
  it("retryLabel custom", () => {
    const { container } = render(<SplitRightError onRetry={() => {}} retryLabel="재조회" />);
    expect(container.textContent).toContain("재조회");
  });
});
