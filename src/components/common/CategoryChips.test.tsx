// @vitest-environment jsdom
// 2026-08-18 · CategoryChips · 렌더 + tone + active + count
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { CategoryChips } from "./CategoryChips";

const opts = [
  { value: "all",     label: "전체",   tone: "brand" as const },
  { value: "pending", label: "대기",   tone: "amber" as const, badge: "3" as any },
  { value: "done",    label: "완료",   tone: "emerald" as const, badge: "12" as any },
];

describe("CategoryChips · 기본 렌더", () => {
  it("모든 옵션 label 표시", () => {
    const { container } = render(
      <CategoryChips options={opts} value="all" onChange={() => {}} />,
    );
    expect(container.textContent).toContain("전체");
    expect(container.textContent).toContain("대기");
    expect(container.textContent).toContain("완료");
  });

  it("label prop · accent bar + 라벨 표시", () => {
    const { container } = render(
      <CategoryChips label="분류" options={opts} value="all" onChange={() => {}} />,
    );
    expect(container.textContent).toContain("분류");
    // accent bar span
    expect(container.querySelector(".bg-brand-deep")).not.toBeNull();
  });

  it("badge · 옵션별 렌더", () => {
    const { container } = render(
      <CategoryChips options={opts} value="all" onChange={() => {}} />,
    );
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("12");
  });
});

describe("CategoryChips · active tone glow", () => {
  it("active chip · bg-brand-deep + brand glow shadow", () => {
    const { container } = render(
      <CategoryChips options={opts} value="pending" onChange={() => {}} />,
    );
    const buttons = container.querySelectorAll("button");
    // active button (index 1 · pending)
    const activeBtn = buttons[1]!;
    expect(activeBtn.className).toContain("bg-brand-deep");
    expect(activeBtn.className).toContain("text-white");
    expect(activeBtn.className).toContain("shadow-[inset_0_1px_0"); // brand glow
  });

  it("inactive chip · hover brand text", () => {
    const { container } = render(
      <CategoryChips options={opts} value="all" onChange={() => {}} />,
    );
    const buttons = container.querySelectorAll("button");
    const inactiveBtn = buttons[1]!; // pending (not active)
    expect(inactiveBtn.className).toContain("text-ink");
    expect(inactiveBtn.className).toContain("hover:text-brand-deep");
  });
});

describe("CategoryChips · dot tone 매핑", () => {
  it("각 chip · status dot · tone 색 매핑", () => {
    const { container } = render(
      <CategoryChips options={opts} value="all" onChange={() => {}} />,
    );
    // dot 은 각 button 내부 첫 span
    const dots = container.querySelectorAll("button > span:first-child");
    // brand · amber · emerald
    expect(dots[0]!.className).toContain("bg-brand-deep");
    expect(dots[1]!.className).toContain("bg-amber-500");
    expect(dots[2]!.className).toContain("bg-emerald-500");
  });
});

describe("CategoryChips · onChange", () => {
  it("chip 클릭 · onChange(key) 호출", () => {
    const fn = vi.fn();
    const { container } = render(
      <CategoryChips options={opts} value="all" onChange={fn} />,
    );
    (container.querySelectorAll("button")[2] as HTMLElement).click(); // "done"
    expect(fn).toHaveBeenCalledWith("done");
  });
});

describe("CategoryChips · size 매핑", () => {
  it("size=sm · h-9 text-14", () => {
    const { container } = render(
      <CategoryChips options={opts} value="all" onChange={() => {}} size="sm" />,
    );
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("h-9");
    expect(btn.className).toContain("text-[16px]");
  });

  it("size=md (기본) · h-10 text-15", () => {
    const { container } = render(
      <CategoryChips options={opts} value="all" onChange={() => {}} />,
    );
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("h-10");
    expect(btn.className).toContain("text-[17px]");
  });
});
