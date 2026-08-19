// @vitest-environment jsdom
// 2026-08-19 · Card · variant/padding/rounded/clip/as/onClick
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Card } from "./Card";

describe("Card · 기본", () => {
  it("children 렌더 · div 태그 · 기본 스타일", () => {
    const { container } = render(<Card><div data-testid="c">x</div></Card>);
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
    const root = container.firstElementChild!;
    expect(root.tagName).toBe("DIV");
    expect(root.className).toContain("bg-white");
    expect(root.className).toContain("border");
    expect(root.className).toContain("border-line");
    expect(root.className).toContain("rounded-xl");
    expect(root.className).toContain("p-4");
  });

  it("기본 · variant=sm · shadow-[inset...", () => {
    const { container } = render(<Card>x</Card>);
    const root = container.firstElementChild!;
    expect(root.className).toContain("shadow-[");
  });

  it("variant=flat · shadow 없음", () => {
    const { container } = render(<Card variant="flat">x</Card>);
    const root = container.firstElementChild!;
    expect(root.className).not.toContain("shadow-[");
  });
});

describe("Card · variant (4 종)", () => {
  const cases = ["flat", "sm", "md", "lg"] as const;
  cases.forEach((v) => {
    it(`variant=${v} · 렌더`, () => {
      const { container } = render(<Card variant={v}>x</Card>);
      const root = container.firstElementChild!;
      if (v === "flat") {
        expect(root.className).not.toContain("shadow-[");
      } else {
        expect(root.className).toContain("shadow-[");
      }
    });
  });
});

describe("Card · padding", () => {
  it("none · padding 클래스 없음", () => {
    const { container } = render(<Card padding="none">x</Card>);
    const cls = container.firstElementChild!.className;
    expect(cls).not.toContain("p-3");
    expect(cls).not.toContain("p-4");
    expect(cls).not.toContain("p-5");
  });
  it("sm · p-3", () => {
    const { container } = render(<Card padding="sm">x</Card>);
    expect(container.firstElementChild!.className).toContain("p-3");
  });
  it("md (기본) · p-4", () => {
    const { container } = render(<Card>x</Card>);
    expect(container.firstElementChild!.className).toContain("p-4");
  });
  it("lg · p-5", () => {
    const { container } = render(<Card padding="lg">x</Card>);
    expect(container.firstElementChild!.className).toContain("p-5");
  });
});

describe("Card · rounded", () => {
  const cases = [
    { r: "md" as const, cls: "rounded-md" },
    { r: "lg" as const, cls: "rounded-lg" },
    { r: "xl" as const, cls: "rounded-xl" },
    { r: "2xl" as const, cls: "rounded-2xl" },
  ];
  cases.forEach(({ r, cls }) => {
    it(`rounded=${r} · ${cls}`, () => {
      const { container } = render(<Card rounded={r}>x</Card>);
      expect(container.firstElementChild!.className).toContain(cls);
    });
  });
});

describe("Card · clip", () => {
  it("clip=true · overflow-hidden", () => {
    const { container } = render(<Card clip>x</Card>);
    expect(container.firstElementChild!.className).toContain("overflow-hidden");
  });
  it("clip=false (기본) · overflow-hidden 없음", () => {
    const { container } = render(<Card>x</Card>);
    expect(container.firstElementChild!.className).not.toContain("overflow-hidden");
  });
});

describe("Card · as (semantic)", () => {
  it("as=section · section 태그", () => {
    const { container } = render(<Card as="section">x</Card>);
    expect(container.firstElementChild!.tagName).toBe("SECTION");
  });
  it("as=article · article 태그", () => {
    const { container } = render(<Card as="article">x</Card>);
    expect(container.firstElementChild!.tagName).toBe("ARTICLE");
  });
  it("as=aside · aside 태그", () => {
    const { container } = render(<Card as="aside">x</Card>);
    expect(container.firstElementChild!.tagName).toBe("ASIDE");
  });
  it("as=button · button 태그 + type=button 기본", () => {
    const { container } = render(<Card as="button">x</Card>);
    const btn = container.firstElementChild! as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.type).toBe("button");
  });
});

describe("Card · onClick + button 상태", () => {
  it("onClick · button 자동 · 클릭 시 호출", () => {
    const onClick = vi.fn();
    const { container } = render(<Card as="button" onClick={onClick}>x</Card>);
    fireEvent.click(container.querySelector("button")!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("onClick (as=div) · cursor-pointer · hover 스타일", () => {
    const onClick = vi.fn();
    const { container } = render(<Card onClick={onClick}>x</Card>);
    const root = container.firstElementChild!;
    expect(root.className).toContain("cursor-pointer");
    expect(root.className).toContain("hover:");
  });

  it("onClick 없으면 · cursor-pointer 없음", () => {
    const { container } = render(<Card>x</Card>);
    expect(container.firstElementChild!.className).not.toContain("cursor-pointer");
  });

  it("as=button + disabled", () => {
    const onClick = vi.fn();
    const { container } = render(<Card as="button" onClick={onClick} disabled>x</Card>);
    const btn = container.querySelector("button")!;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Card · className + style + a11y", () => {
  it("className 병합", () => {
    const { container } = render(<Card className="mt-4">x</Card>);
    expect(container.firstElementChild!.className).toContain("mt-4");
  });

  it("style 반영", () => {
    const { container } = render(<Card style={{ marginTop: 12 }}>x</Card>);
    expect((container.firstElementChild as HTMLElement).style.marginTop).toBe("12px");
  });

  it("aria-label 반영", () => {
    const { container } = render(<Card aria-label="공지 카드">x</Card>);
    expect(container.firstElementChild!.getAttribute("aria-label")).toBe("공지 카드");
  });

  it("role 반영 (non-button)", () => {
    const { container } = render(<Card role="region">x</Card>);
    expect(container.firstElementChild!.getAttribute("role")).toBe("region");
  });
});
