// @vitest-environment jsdom
// 2026-08-19 · MiniCard · color/icon/title/desc/onClick
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MiniCard } from "./MiniCard";
import { ShoppingCart } from "@phosphor-icons/react";

describe("MiniCard · 기본", () => {
  it("title + description 표시", () => {
    const { container } = render(
      <MiniCard color="teal" icon={ShoppingCart} title="발주" description="공급사 발주" onClick={() => {}} />
    );
    expect(container.textContent).toContain("발주");
    expect(container.textContent).toContain("공급사 발주");
  });

  it("button 렌더 · type=button", () => {
    const { container } = render(
      <MiniCard color="teal" icon={ShoppingCart} title="x" description="y" onClick={() => {}} />
    );
    const btn = container.querySelector("button")!;
    expect(btn.getAttribute("type")).toBe("button");
  });

  it("onClick 호출", () => {
    const onClick = vi.fn();
    const { container } = render(
      <MiniCard color="teal" icon={ShoppingCart} title="x" description="y" onClick={onClick} />
    );
    fireEvent.click(container.querySelector("button")!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("icon 렌더 · svg 존재", () => {
    const { container } = render(
      <MiniCard color="teal" icon={ShoppingCart} title="x" description="y" onClick={() => {}} />
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("MiniCard · color 매핑", () => {
  const cases = [
    { color: "teal" as const, bg: "bg-brand-tint" },
    { color: "amber" as const, bg: "bg-brand-amber-tint" },
    { color: "coral" as const, bg: "bg-brand-coral-tint" },
    { color: "sky" as const, bg: "bg-brand-sky-tint" },
    { color: "zinc" as const, bg: "bg-zinc-100" },
  ];

  cases.forEach(({ color, bg }) => {
    it(`${color} · icon wrap ${bg}`, () => {
      const { container } = render(
        <MiniCard color={color} icon={ShoppingCart} title="x" description="y" onClick={() => {}} />
      );
      const iconWrap = container.querySelector(".w-8.h-8");
      expect(iconWrap!.className).toContain(bg);
    });
  });
});

describe("MiniCard · orderClass", () => {
  it("orderClass 병합", () => {
    const { container } = render(
      <MiniCard color="teal" icon={ShoppingCart} title="x" description="y" onClick={() => {}} orderClass="order-2" />
    );
    expect(container.firstElementChild!.className).toContain("order-2");
  });
});
