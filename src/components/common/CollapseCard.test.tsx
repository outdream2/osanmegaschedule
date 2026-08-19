// @vitest-environment jsdom
// 2026-08-19 · CollapseCard · title + icon + right + open/onOpenChange + defaultOpen + depth + contentPadding
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CollapseCard } from "./CollapseCard";

describe("CollapseCard · 기본 렌더", () => {
  it("title + children 표시 · defaultOpen=true", () => {
    const { container } = render(
      <CollapseCard title="상품 정보">
        <div data-testid="c">본문</div>
      </CollapseCard>
    );
    expect(container.textContent).toContain("상품 정보");
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
  });

  it("defaultOpen=false · content 미렌더", () => {
    const { container } = render(
      <CollapseCard title="x" defaultOpen={false}>
        <div data-testid="c">본문</div>
      </CollapseCard>
    );
    expect(container.querySelector('[data-testid="c"]')).toBeNull();
    expect(container.textContent).toContain("— 펼치기");
  });

  it("헤더 button · aria-expanded 반영", () => {
    const { container } = render(<CollapseCard title="x" defaultOpen>c</CollapseCard>);
    const btn = container.querySelector("button")!;
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("CollapseCard · 토글 동작", () => {
  it("비제어 · 헤더 클릭 시 · 상태 토글", () => {
    const { container } = render(
      <CollapseCard title="x" defaultOpen>
        <div data-testid="c">본문</div>
      </CollapseCard>
    );
    const btn = container.querySelector("button")!;
    // 초기 열림
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
    // 클릭 → 닫힘
    fireEvent.click(btn);
    expect(container.querySelector('[data-testid="c"]')).toBeNull();
    // 다시 클릭 → 열림
    fireEvent.click(btn);
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
  });

  it("제어 · open + onOpenChange · 콜백 호출", () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <CollapseCard title="x" open={true} onOpenChange={onOpenChange}>c</CollapseCard>
    );
    fireEvent.click(container.querySelector("button")!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("제어 모드 · open prop 이 유일한 진실", () => {
    const { container, rerender } = render(
      <CollapseCard title="x" open={false} onOpenChange={() => {}}>
        <div data-testid="c">본문</div>
      </CollapseCard>
    );
    expect(container.querySelector('[data-testid="c"]')).toBeNull();
    rerender(
      <CollapseCard title="x" open={true} onOpenChange={() => {}}>
        <div data-testid="c">본문</div>
      </CollapseCard>
    );
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
  });
});

describe("CollapseCard · icon + right slot", () => {
  it("icon 렌더 · 헤더 좌측", () => {
    const { container } = render(
      <CollapseCard title="x" icon={<span data-testid="i">🎯</span>}>c</CollapseCard>
    );
    expect(container.querySelector('[data-testid="i"]')).not.toBeNull();
  });

  it("right slot 렌더 · 헤더 우측", () => {
    const { container } = render(
      <CollapseCard title="x" right={<button data-testid="r">액션</button>}>c</CollapseCard>
    );
    expect(container.querySelector('[data-testid="r"]')).not.toBeNull();
  });
});

describe("CollapseCard · depth", () => {
  it("depth=sm (기본) · 얇은 shadow", () => {
    const { container } = render(<CollapseCard title="x">c</CollapseCard>);
    const root = container.firstElementChild!;
    expect(root.className).toContain("shadow-[");
  });

  it("depth=md · 진한 shadow", () => {
    const { container } = render(<CollapseCard title="x" depth="md">c</CollapseCard>);
    const root = container.firstElementChild!;
    expect(root.className).toContain("0_4px_16px");
  });
});

describe("CollapseCard · contentPadding", () => {
  it("md (기본) · p-4", () => {
    const { container } = render(<CollapseCard title="x">c</CollapseCard>);
    const content = container.querySelector(".p-4");
    expect(content).not.toBeNull();
  });

  it("lg · p-5", () => {
    const { container } = render(
      <CollapseCard title="x" contentPadding="lg">c</CollapseCard>
    );
    expect(container.querySelector(".p-5")).not.toBeNull();
  });

  it("none · padding 클래스 없음", () => {
    const { container } = render(
      <CollapseCard title="x" contentPadding="none">
        <div data-testid="c">c</div>
      </CollapseCard>
    );
    const content = container.querySelector('[data-testid="c"]')!.parentElement!;
    expect(content.className).not.toContain("p-4");
    expect(content.className).not.toContain("p-5");
  });
});

describe("CollapseCard · status dot", () => {
  it("열림 시 · bg-brand-deep", () => {
    const { container } = render(<CollapseCard title="x" defaultOpen>c</CollapseCard>);
    const dot = container.querySelector(".w-2.h-2.rounded-full");
    expect(dot!.className).toContain("bg-brand-deep");
  });

  it("닫힘 시 · bg-zinc-300", () => {
    const { container } = render(
      <CollapseCard title="x" defaultOpen={false}>c</CollapseCard>
    );
    const dot = container.querySelector(".w-2.h-2.rounded-full");
    expect(dot!.className).toContain("bg-zinc-300");
  });
});
