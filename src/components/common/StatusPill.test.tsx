// @vitest-environment jsdom
// 2026-08-18 · StatusPill · 렌더 + tone/size 매핑 테스트
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StatusPill } from "./StatusPill";

describe("StatusPill · 기본 렌더", () => {
  it("children 표시", () => {
    const { container } = render(<StatusPill>12건</StatusPill>);
    expect(container.textContent).toContain("12건");
  });

  it("기본 tone=brand · text-brand-deep + bg-brand-tint", () => {
    const { container } = render(<StatusPill>x</StatusPill>);
    const span = container.querySelector("span")!;
    expect(span.className).toContain("text-brand-deep");
    expect(span.className).toContain("bg-brand-tint");
  });

  it("tone=emerald · 색상 매핑 정확", () => {
    const { container } = render(<StatusPill tone="emerald">완료</StatusPill>);
    const span = container.querySelector("span")!;
    expect(span.className).toContain("text-emerald-700");
    expect(span.className).toContain("bg-emerald-50");
    expect(span.className).toContain("border-emerald-200");
  });

  it("tone=rose · 위험 색", () => {
    const { container } = render(<StatusPill tone="rose">미결</StatusPill>);
    const span = container.querySelector("span")!;
    expect(span.className).toContain("text-rose-700");
  });

  it("tone=pine · Hermès Pine hex", () => {
    const { container } = render(<StatusPill tone="pine">확정</StatusPill>);
    const span = container.querySelector("span")!;
    expect(span.className).toContain("text-[#01796F]");
  });

  it("size=xs · h-5 text-11", () => {
    const { container } = render(<StatusPill size="xs">x</StatusPill>);
    const span = container.querySelector("span")!;
    expect(span.className).toContain("h-5");
    expect(span.className).toContain("text-[11px]");
  });

  it("size=md · py-0.5 text-13", () => {
    const { container } = render(<StatusPill size="md">x</StatusPill>);
    const span = container.querySelector("span")!;
    expect(span.className).toContain("py-0.5");
    expect(span.className).toContain("text-[13px]");
  });
});

describe("StatusPill · dot + pulse + icon", () => {
  it("dot=true · 좌측 6px dot 렌더", () => {
    const { container } = render(<StatusPill tone="amber" dot>대기</StatusPill>);
    const spans = container.querySelectorAll("span");
    // outer span + dot span (최소 2개)
    expect(spans.length).toBeGreaterThanOrEqual(2);
    const dot = spans[1]!;
    expect(dot.className).toContain("w-1.5");
    expect(dot.className).toContain("h-1.5");
    expect(dot.className).toContain("bg-amber-500");
  });

  it("pulse=true · animate-pulse 적용", () => {
    const { container } = render(<StatusPill tone="rose" dot pulse>긴급</StatusPill>);
    const dot = container.querySelectorAll("span")[1]!;
    expect(dot.className).toContain("animate-pulse");
  });

  it("icon prop · dot 대신 icon 렌더", () => {
    const { container } = render(
      <StatusPill tone="indigo" icon={<svg data-testid="icon" />}>N건</StatusPill>,
    );
    expect(container.querySelector('[data-testid="icon"]')).not.toBeNull();
  });
});

describe("StatusPill · onClick + clickable", () => {
  it("onClick 있으면 role=button + hover class", () => {
    const { container } = render(<StatusPill onClick={() => {}}>action</StatusPill>);
    const span = container.querySelector("span")!;
    expect(span.getAttribute("role")).toBe("button");
    expect(span.className).toContain("cursor-pointer");
  });

  it("onClick 호출", () => {
    let clicked = false;
    const { container } = render(
      <StatusPill onClick={() => { clicked = true; }}>x</StatusPill>,
    );
    (container.querySelector("span") as HTMLElement).click();
    expect(clicked).toBe(true);
  });
});

describe("StatusPill · tabular-nums (숫자 정렬)", () => {
  it("기본 tabular-nums 적용", () => {
    const { container } = render(<StatusPill>12</StatusPill>);
    expect(container.querySelector("span")!.className).toContain("tabular-nums");
  });

  it("tabular=false · 제외", () => {
    const { container } = render(<StatusPill tabular={false}>x</StatusPill>);
    expect(container.querySelector("span")!.className).not.toContain("tabular-nums");
  });
});

// 2026-08-23 · v2 · shape prop 커버리지
describe("StatusPill · shape prop (v2)", () => {
  it("기본 shape=pill · rounded-full", () => {
    const { container } = render(<StatusPill>x</StatusPill>);
    expect(container.querySelector("span")!.className).toContain("rounded-full");
  });

  it("shape=rounded · rounded-md", () => {
    const { container } = render(<StatusPill shape="rounded">x</StatusPill>);
    expect(container.querySelector("span")!.className).toContain("rounded-md");
    expect(container.querySelector("span")!.className).not.toContain("rounded-full");
  });

  it("shape=square · rounded 없음", () => {
    const { container } = render(<StatusPill shape="square">x</StatusPill>);
    const cls = container.querySelector("span")!.className;
    expect(cls).not.toContain("rounded-full");
    expect(cls).not.toContain("rounded-md");
  });
});
