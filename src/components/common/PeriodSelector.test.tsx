// @vitest-environment jsdom
// 2026-08-19 · PeriodSelector · options/value/onChange + size + accent + preset
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import {
  PeriodSelector,
  PERIOD_MONTHS_PRESET,
  PERIOD_DAYS_PRESET,
  PERIOD_MONTHS_EXT_PRESET,
} from "./PeriodSelector";

const OPTS = [
  { value: 1, label: "1개월" },
  { value: 3, label: "3개월" },
  { value: 6, label: "6개월" },
] as const;

describe("PeriodSelector · 기본 렌더", () => {
  it("options 개수만큼 버튼 렌더", () => {
    const { container } = render(
      <PeriodSelector options={OPTS} value={1} onChange={() => {}} />
    );
    const btns = container.querySelectorAll("button");
    expect(btns.length).toBe(OPTS.length);
    expect(Array.from(btns).map(b => b.textContent)).toEqual(["1개월", "3개월", "6개월"]);
  });

  it("role=group · aria-label 반영", () => {
    const { container } = render(
      <PeriodSelector options={OPTS} value={1} onChange={() => {}} ariaLabel="필터 기간" />
    );
    const root = container.querySelector('[role="group"]');
    expect(root!.getAttribute("aria-label")).toBe("필터 기간");
  });

  it("ariaLabel 기본값 · 기간 선택", () => {
    const { container } = render(
      <PeriodSelector options={OPTS} value={1} onChange={() => {}} />
    );
    expect(container.querySelector('[role="group"]')!.getAttribute("aria-label")).toBe("기간 선택");
  });
});

describe("PeriodSelector · 선택", () => {
  it("value 와 일치하는 버튼 · active class 적용", () => {
    const { container } = render(
      <PeriodSelector options={OPTS} value={3} onChange={() => {}} />
    );
    const btns = container.querySelectorAll("button");
    expect(btns[1].className).toContain("bg-brand-deep");
    expect(btns[1].className).toContain("text-white");
    expect(btns[0].className).not.toContain("bg-brand-deep");
  });

  it("클릭 시 · onChange 호출 · 값 전달", () => {
    const onChange = vi.fn();
    const { container } = render(
      <PeriodSelector options={OPTS} value={1} onChange={onChange} />
    );
    fireEvent.click(container.querySelectorAll("button")[2]);
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("동일 값 클릭 시에도 · onChange 호출", () => {
    const onChange = vi.fn();
    const { container } = render(
      <PeriodSelector options={OPTS} value={1} onChange={onChange} />
    );
    fireEvent.click(container.querySelectorAll("button")[0]);
    expect(onChange).toHaveBeenCalledWith(1);
  });
});

describe("PeriodSelector · size", () => {
  it("sm (기본) · h-7", () => {
    const { container } = render(
      <PeriodSelector options={OPTS} value={1} onChange={() => {}} />
    );
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("h-7");
    expect(btn.className).toContain("text-[12px]");
  });

  it("md · h-8", () => {
    const { container } = render(
      <PeriodSelector options={OPTS} value={1} onChange={() => {}} size="md" />
    );
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("h-8");
    expect(btn.className).toContain("text-[14px]");
  });
});

describe("PeriodSelector · title tooltip", () => {
  it("options[i].title 설정 시 · button title 반영", () => {
    const opts = [{ value: 1, label: "1개월", title: "최근 1개월" }] as const;
    const { container } = render(
      <PeriodSelector options={opts} value={1} onChange={() => {}} />
    );
    expect(container.querySelector("button")!.getAttribute("title")).toBe("최근 1개월");
  });
});

describe("PeriodSelector · preset", () => {
  it("PERIOD_MONTHS_PRESET · 4개 · 1/3/6/12", () => {
    expect(PERIOD_MONTHS_PRESET).toHaveLength(4);
    expect(PERIOD_MONTHS_PRESET.map(o => o.value)).toEqual([1, 3, 6, 12]);
  });

  it("PERIOD_DAYS_PRESET · 4개 · 10/30/60/90", () => {
    expect(PERIOD_DAYS_PRESET).toHaveLength(4);
    expect(PERIOD_DAYS_PRESET.map(o => o.value)).toEqual([10, 30, 60, 90]);
  });

  it("PERIOD_MONTHS_EXT_PRESET · 5개 · 마지막 · 전체 (999)", () => {
    expect(PERIOD_MONTHS_EXT_PRESET).toHaveLength(5);
    expect(PERIOD_MONTHS_EXT_PRESET.at(-1)!.value).toBe(999);
    expect(PERIOD_MONTHS_EXT_PRESET.at(-1)!.label).toBe("전체");
  });
});

describe("PeriodSelector · className/style", () => {
  it("className 병합", () => {
    const { container } = render(
      <PeriodSelector options={OPTS} value={1} onChange={() => {}} className="ml-2" />
    );
    expect(container.firstElementChild!.className).toContain("ml-2");
  });

  it("style prop 적용", () => {
    const { container } = render(
      <PeriodSelector options={OPTS} value={1} onChange={() => {}} style={{ marginTop: 8 }} />
    );
    expect((container.firstElementChild as HTMLElement).style.marginTop).toBe("8px");
  });
});
