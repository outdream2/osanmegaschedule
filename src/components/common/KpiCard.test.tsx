// @vitest-environment jsdom
// 2026-08-18 · KpiCard · Vercel Dashboard 톤 검증
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { KpiCard } from "./KpiCard";

describe("KpiCard · 기본 렌더", () => {
  it("label + value 표시", () => {
    const { container } = render(<KpiCard label="총 매입" value={125} />);
    expect(container.textContent).toContain("총 매입");
    expect(container.textContent).toContain("125");
  });

  it("unit · value 뒤에 표시", () => {
    const { container } = render(<KpiCard label="x" value={12} unit="건" />);
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("건");
  });

  it(".kpi-card CSS 클래스 적용", () => {
    const { container } = render(<KpiCard label="x" value={1} />);
    const card = container.querySelector(".kpi-card");
    expect(card).not.toBeNull();
  });
});

describe("KpiCard · Vercel tone · dot + value color", () => {
  it("tone=emerald · dot bg-emerald-500 · active value text-emerald-700", () => {
    const { container } = render(<KpiCard tone="emerald" label="x" value={12} />);
    const dot = container.querySelector(".rounded-full.bg-emerald-500");
    expect(dot).not.toBeNull();
    // value text (has kpi-card-value class)
    const value = container.querySelector(".kpi-card-value")!;
    expect(value.className).toContain("text-emerald-700");
  });

  it("tone=brand · dot bg-brand-deep · value text-brand-deep", () => {
    const { container } = render(<KpiCard tone="brand" label="x" value={5} />);
    const dot = container.querySelector(".rounded-full.bg-brand-deep");
    expect(dot).not.toBeNull();
  });

  it("value=0 · 자동 inactive (opacity-40 dot + ink-soft text)", () => {
    const { container } = render(<KpiCard tone="rose" label="x" value={0} />);
    const dot = container.querySelector(".rounded-full.bg-rose-500")!;
    expect(dot.className).toContain("opacity-40");
    const value = container.querySelector(".kpi-card-value")!;
    expect(value.className).toContain("text-ink-soft");
  });

  it("isActive=true · value>0 아니어도 강제 active", () => {
    const { container } = render(<KpiCard tone="sky" label="x" value={0} isActive />);
    const dot = container.querySelector(".rounded-full.bg-sky-500")!;
    expect(dot.className).not.toContain("opacity-40");
  });
});

describe("KpiCard · delta 표시 (semantic tone)", () => {
  it("delta 양수 · ▲ + text-emerald-600", () => {
    const { container } = render(
      <KpiCard tone="brand" label="x" value={10} delta={3.2} deltaUnit="%" />,
    );
    expect(container.textContent).toContain("▲");
    expect(container.textContent).toContain("3.2%");
    const delta = container.querySelector(".text-emerald-600");
    expect(delta).not.toBeNull();
  });

  it("delta 음수 · ▼ + text-rose-600", () => {
    const { container } = render(
      <KpiCard tone="brand" label="x" value={10} delta={-1.5} deltaUnit="%" />,
    );
    expect(container.textContent).toContain("▼");
    expect(container.textContent).toContain("1.5%");
    const delta = container.querySelector(".text-rose-600");
    expect(delta).not.toBeNull();
  });

  it("delta 0 · 미표시", () => {
    const { container } = render(<KpiCard tone="brand" label="x" value={0} delta={0} />);
    expect(container.textContent).not.toContain("▲");
    expect(container.textContent).not.toContain("▼");
  });
});

describe("KpiCard · hint · subtitle · onClick", () => {
  it("hint · 하단 표시", () => {
    const { container } = render(<KpiCard tone="brand" label="x" value={5} hint="어제 대비" />);
    expect(container.textContent).toContain("어제 대비");
  });

  it("subtitle (backward compat) · 하단 표시", () => {
    const { container } = render(<KpiCard label="x" value={5} subtitle="이번달" />);
    expect(container.textContent).toContain("이번달");
  });

  it("onClick · role=button + cursor-pointer", () => {
    const { container } = render(<KpiCard label="x" value={1} onClick={() => {}} />);
    const card = container.querySelector(".kpi-card")!;
    expect(card.getAttribute("role")).toBe("button");
    expect(card.className).toContain("cursor-pointer");
  });
});
