// @vitest-environment jsdom
// 2026-08-24 · SplitLeftHeader 프리미티브 렌더 tests
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SplitLeftHeader } from "./SplitLeftHeader";

describe("SplitLeftHeader · 기본 렌더", () => {
  it("title 렌더 + AccentBar + role=heading", () => {
    const { container, getByRole } = render(<SplitLeftHeader title="사직서 조건 입력" />);
    expect(container.textContent).toContain("사직서 조건 입력");
    const h = getByRole("heading", { level: 2 });
    expect(h.className).toContain("text-[17px]");
    expect(h.className).toContain("font-bold");
  });

  it("icon 렌더 (좌측)", () => {
    const { container } = render(
      <SplitLeftHeader icon={<span data-testid="icon-slot">ICON</span>} title="테스트" />,
    );
    expect(container.querySelector("[data-testid='icon-slot']")).toBeTruthy();
  });

  it("right 슬롯 렌더 (우측)", () => {
    const { container } = render(
      <SplitLeftHeader title="테스트" right={<button>초기화</button>} />,
    );
    expect(container.textContent).toContain("초기화");
  });

  it("subtitle 렌더 (title 아래)", () => {
    const { container } = render(<SplitLeftHeader title="계약서" subtitle="필수 항목 3/10" />);
    expect(container.textContent).toContain("계약서");
    expect(container.textContent).toContain("필수 항목 3/10");
  });

  it("withBorder=false · border-b 클래스 없음", () => {
    const { container } = render(<SplitLeftHeader title="테스트" withBorder={false} />);
    expect(container.firstChild).toBeTruthy();
    expect((container.firstChild as HTMLElement).className).not.toContain("border-b");
  });

  it("withBorder=true (기본) · border-b border-line", () => {
    const { container } = render(<SplitLeftHeader title="테스트" />);
    expect((container.firstChild as HTMLElement).className).toContain("border-b");
    expect((container.firstChild as HTMLElement).className).toContain("border-line");
  });

  it("className prop · 추가 클래스 적용", () => {
    const { container } = render(<SplitLeftHeader title="테스트" className="mb-2" />);
    expect((container.firstChild as HTMLElement).className).toContain("mb-2");
  });
});
