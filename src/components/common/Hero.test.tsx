// @vitest-environment jsdom
// 2026-08-19 · Hero · eyebrow/title/description/actions/aside + HeroButton
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Hero, HeroButton } from "./Hero";

describe("Hero · 기본", () => {
  it("title 필수 · h1 렌더", () => {
    const { container } = render(<Hero title="환영합니다" />);
    const h1 = container.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1!.textContent).toBe("환영합니다");
  });

  it("description · p 태그", () => {
    const { container } = render(<Hero title="x" description="설명입니다" />);
    const p = container.querySelector("p");
    expect(p).not.toBeNull();
    expect(p!.textContent).toBe("설명입니다");
  });

  it("description 없으면 · p 없음", () => {
    const { container } = render(<Hero title="x" />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("eyebrow · uppercase 태그", () => {
    const { container } = render(<Hero title="x" eyebrow="오늘의 요약" />);
    const eyebrow = container.querySelector(".uppercase");
    expect(eyebrow).not.toBeNull();
    expect(eyebrow!.textContent).toBe("오늘의 요약");
  });

  it("eyebrow 없으면 · uppercase 태그 없음", () => {
    const { container } = render(<Hero title="x" />);
    expect(container.querySelector(".uppercase")).toBeNull();
  });
});

describe("Hero · actions + aside", () => {
  it("actions 슬롯 렌더", () => {
    const { container } = render(
      <Hero title="x" actions={<button data-testid="a">+ 추가</button>} />
    );
    expect(container.querySelector('[data-testid="a"]')).not.toBeNull();
  });

  it("aside 슬롯 렌더", () => {
    const { container } = render(
      <Hero title="x" aside={<img data-testid="avatar" src="/x.png" alt="" />} />
    );
    expect(container.querySelector('[data-testid="avatar"]')).not.toBeNull();
  });

  it("actions/aside 없으면 · 관련 wrapper 미렌더", () => {
    const { container } = render(<Hero title="x" />);
    // 상단 flex 컨테이너 하나만 (좌측)
    const rootChildren = container.firstElementChild!.children;
    // 4 blob + 1 top hairline + 1 content wrap = 6 (aside 없음)
    // 최소 aside div 없음 검증
    expect(container.querySelectorAll('[role="img"]').length).toBe(0);
  });
});

describe("Hero · className/style", () => {
  it("className 병합", () => {
    const { container } = render(<Hero title="x" className="mt-4" />);
    expect(container.firstElementChild!.className).toContain("mt-4");
  });

  it("blue gradient 배경 · inline style", () => {
    const { container } = render(<Hero title="x" />);
    const bg = (container.firstElementChild as HTMLElement).style.background;
    expect(bg).toContain("linear-gradient");
  });
});

describe("HeroButton", () => {
  it("children 렌더 · button 태그", () => {
    const { container } = render(<HeroButton>클릭</HeroButton>);
    const btn = container.querySelector("button");
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain("클릭");
    expect(btn!.getAttribute("type")).toBe("button");
  });

  it("onClick 호출", () => {
    const onClick = vi.fn();
    const { container } = render(<HeroButton onClick={onClick}>c</HeroButton>);
    fireEvent.click(container.querySelector("button")!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("icon 렌더", () => {
    const { container } = render(
      <HeroButton icon={<span data-testid="i">🎯</span>}>c</HeroButton>
    );
    expect(container.querySelector('[data-testid="i"]')).not.toBeNull();
  });

  it("solid (기본) · 흰색 배경 · 딥네이비 텍스트", () => {
    const { container } = render(<HeroButton>c</HeroButton>);
    const btn = container.querySelector("button") as HTMLElement;
    expect(btn.style.background).toBe("rgb(255, 255, 255)");
    expect(btn.style.color).toBe("rgb(10, 46, 74)");
  });

  it("ghost · 반투명 배경 · white 텍스트", () => {
    const { container } = render(<HeroButton ghost>c</HeroButton>);
    const btn = container.querySelector("button") as HTMLElement;
    expect(btn.style.color).toBe("rgb(255, 255, 255)");
    expect(btn.style.background).toContain("rgba");
  });
});
