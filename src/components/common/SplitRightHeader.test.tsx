// @vitest-environment jsdom
// 2026-08-25 · SplitRightHeader 프리미티브 · v9 시그니처 · tests
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SplitRightHeader } from "./SplitRightHeader";

describe("SplitRightHeader · 기본 렌더", () => {
  it("title 렌더 + role=heading + 폰트 +2 (19px)", () => {
    const { container, getByRole } = render(<SplitRightHeader title="상세 정보" />);
    expect(container.textContent).toContain("상세 정보");
    const h = getByRole("heading", { level: 2 });
    expect(h.className).toContain("text-[21px]");
    expect(h.className).toContain("font-bold");
  });

  it("icon 렌더 (좌측 · brand-deep 톤)", () => {
    const { container } = render(
      <SplitRightHeader icon={<span data-testid="ic">I</span>} title="테스트" />,
    );
    expect(container.querySelector("[data-testid='ic']")).toBeTruthy();
  });

  it("right 슬롯 렌더 (우측)", () => {
    const { container } = render(
      <SplitRightHeader title="테스트" right={<button>편집</button>} />,
    );
    expect(container.textContent).toContain("편집");
  });

  it("subtitle 렌더 (title 아래)", () => {
    const { container } = render(<SplitRightHeader title="상세" subtitle="메타 데이터" />);
    expect(container.textContent).toContain("상세");
    expect(container.textContent).toContain("메타 데이터");
  });
});

describe("SplitRightHeader · v9 gradient accent", () => {
  it("topAccent=true (기본) · gradient span 렌더", () => {
    const { container } = render(<SplitRightHeader title="X" />);
    const span = container.querySelector("span[aria-hidden]");
    expect(span).not.toBeNull();
    expect(span!.className).toContain("bg-gradient-to-r");
    expect(span!.className).toContain("from-brand-deep");
    expect(span!.className).toContain("via-sky-500");
    expect(span!.className).toContain("to-brand-deep");
    expect(span!.className).toContain("opacity-90");
    expect(span!.className).toContain("pointer-events-none");
  });

  it("topAccent=false · gradient span 미렌더", () => {
    const { container } = render(<SplitRightHeader title="X" topAccent={false} />);
    expect(container.querySelector("span[aria-hidden]")).toBeNull();
  });
});

describe("SplitRightHeader · sticky · withBorder · bg", () => {
  it("sticky=true · sticky top-0 z-30 클래스", () => {
    const { container } = render(<SplitRightHeader title="X" sticky />);
    const root = container.firstElementChild!;
    expect(root.className).toContain("sticky");
    expect(root.className).toContain("top-0");
    expect(root.className).toContain("z-30");
  });

  it("sticky=false (기본) · sticky 없음", () => {
    const { container } = render(<SplitRightHeader title="X" />);
    expect(container.firstElementChild!.className).not.toContain("sticky");
  });

  it("withBorder=false · border-b 없음", () => {
    const { container } = render(<SplitRightHeader title="X" withBorder={false} />);
    expect(container.firstElementChild!.className).not.toContain("border-b");
  });

  it("bg 커스텀 · bg-transparent 반영", () => {
    const { container } = render(<SplitRightHeader title="X" bg="bg-transparent" />);
    expect(container.firstElementChild!.className).toContain("bg-transparent");
  });

  it("bg 기본 · bg-white", () => {
    const { container } = render(<SplitRightHeader title="X" />);
    expect(container.firstElementChild!.className).toContain("bg-white");
  });
});
