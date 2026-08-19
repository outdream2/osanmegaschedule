// @vitest-environment jsdom
// 2026-08-19 · SearchFilterChips · options/selected/onToggle + 전체 chip + count + size
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SearchFilterChips } from "./SearchFilterChips";

type K = "zero" | "low" | "over";
const OPTS = [
  { key: "zero" as K, label: "재고 0", color: "rose" as const, count: 12 },
  { key: "low" as K, label: "저재고", color: "amber" as const, count: 34 },
  { key: "over" as K, label: "과잉", color: "sky" as const },
];

describe("SearchFilterChips · 렌더", () => {
  it("options 개수 + 전체 · button 렌더", () => {
    const { container } = render(
      <SearchFilterChips options={OPTS} selected={new Set()} onToggle={() => {}} />
    );
    const btns = container.querySelectorAll("button");
    expect(btns.length).toBe(OPTS.length + 1); // + 전체
  });

  it("showAll=false · 전체 chip 없음", () => {
    const { container } = render(
      <SearchFilterChips options={OPTS} selected={new Set()} onToggle={() => {}} showAll={false} />
    );
    expect(container.querySelectorAll("button").length).toBe(OPTS.length);
  });

  it("label · InlineLabel 렌더", () => {
    const { container } = render(
      <SearchFilterChips label="재고 상태" options={OPTS} selected={new Set()} onToggle={() => {}} />
    );
    expect(container.textContent).toContain("재고 상태");
  });

  it("allLabel 커스텀", () => {
    const { container } = render(
      <SearchFilterChips options={OPTS} selected={new Set()} onToggle={() => {}} allLabel="모두" />
    );
    expect(container.textContent).toContain("모두");
  });
});

describe("SearchFilterChips · 선택 상태", () => {
  it("selected 비어있으면 · 전체 active", () => {
    const { container } = render(
      <SearchFilterChips options={OPTS} selected={new Set()} onToggle={() => {}} />
    );
    const allBtn = container.querySelectorAll("button")[0];
    expect(allBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("selected 에 key 있으면 · 해당 chip active", () => {
    const { container } = render(
      <SearchFilterChips options={OPTS} selected={new Set<K>(["low"])} onToggle={() => {}} />
    );
    const btns = container.querySelectorAll("button");
    expect(btns[0].getAttribute("aria-pressed")).toBe("false"); // 전체
    expect(btns[2].getAttribute("aria-pressed")).toBe("true"); // 저재고
  });

  it("chip 클릭 · onToggle 호출", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <SearchFilterChips options={OPTS} selected={new Set()} onToggle={onToggle} />
    );
    fireEvent.click(container.querySelectorAll("button")[1]); // 재고 0
    expect(onToggle).toHaveBeenCalledWith("zero");
  });

  it("전체 클릭 · 선택된 모든 key 에 onToggle · 해제 효과", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <SearchFilterChips options={OPTS} selected={new Set<K>(["zero", "low"])} onToggle={onToggle} />
    );
    fireEvent.click(container.querySelectorAll("button")[0]); // 전체
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onToggle).toHaveBeenCalledWith("zero");
    expect(onToggle).toHaveBeenCalledWith("low");
  });
});

describe("SearchFilterChips · count 배지", () => {
  it("count 있으면 · 숫자 렌더", () => {
    const { container } = render(
      <SearchFilterChips options={OPTS} selected={new Set()} onToggle={() => {}} />
    );
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("34");
  });

  it("count 없으면 · 배지 미렌더 (해당 chip 만)", () => {
    const { container } = render(
      <SearchFilterChips options={OPTS} selected={new Set()} onToggle={() => {}} />
    );
    // '과잉' chip 은 count 없음
    const overBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("과잉"))!;
    expect(overBtn.querySelector(".tabular-nums")).toBeNull();
  });
});

describe("SearchFilterChips · size", () => {
  it("sm (기본) · h-8", () => {
    const { container } = render(
      <SearchFilterChips options={OPTS} selected={new Set()} onToggle={() => {}} />
    );
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("h-8");
  });

  it("xs · h-7", () => {
    const { container } = render(
      <SearchFilterChips options={OPTS} selected={new Set()} onToggle={() => {}} size="xs" />
    );
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("h-7");
  });
});
