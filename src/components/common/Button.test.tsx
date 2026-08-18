// @vitest-environment jsdom
// 2026-08-18 · Button · variant/size/loading/icon 렌더 테스트
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { Button } from "./Button";

describe("Button · 기본 렌더", () => {
  it("children 표시", () => {
    const { container } = render(<Button>저장</Button>);
    expect(container.textContent).toContain("저장");
  });

  it("기본 · variant=primary · size=md · type=button", () => {
    const { container } = render(<Button>x</Button>);
    const btn = container.querySelector("button")!;
    expect(btn.type).toBe("button");
    expect(btn.className).toContain("bg-brand-deep");
    expect(btn.className).toContain("text-white");
    expect(btn.className).toContain("h-10");
    expect(btn.className).toContain("text-[17px]"); // md · 폰트 +2
  });
});

describe("Button · variant 매핑", () => {
  it("primary · brand-deep + inset light + brand glow", () => {
    const { container } = render(<Button variant="primary">x</Button>);
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("bg-brand-deep");
    expect(btn.className).toContain("border-brand-deep");
    expect(btn.className).toContain("shadow-[inset_0_1px_0");
  });

  it("secondary · white bg + border-line + hover brand", () => {
    const { container } = render(<Button variant="secondary">x</Button>);
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("bg-white");
    expect(btn.className).toContain("border-line");
    expect(btn.className).toContain("text-ink");
  });

  it("ghost · transparent · hover neutral", () => {
    const { container } = render(<Button variant="ghost">x</Button>);
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("bg-transparent");
  });

  it("danger · rose-600 + inset light + rose glow", () => {
    const { container } = render(<Button variant="danger">x</Button>);
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("bg-rose-600");
    expect(btn.className).toContain("border-rose-600");
  });
});

describe("Button · size 매핑", () => {
  it("sm · h-8 text-15", () => {
    const { container } = render(<Button size="sm">x</Button>);
    expect(container.querySelector("button")!.className).toContain("h-8");
    expect(container.querySelector("button")!.className).toContain("text-[15px]");
  });
  it("md · h-10 text-17", () => {
    const { container } = render(<Button size="md">x</Button>);
    expect(container.querySelector("button")!.className).toContain("h-10");
    expect(container.querySelector("button")!.className).toContain("text-[17px]");
  });
  it("lg · h-11 text-18", () => {
    const { container } = render(<Button size="lg">x</Button>);
    expect(container.querySelector("button")!.className).toContain("h-11");
    expect(container.querySelector("button")!.className).toContain("text-[18px]");
  });
});

describe("Button · icon + suffix + loading", () => {
  it("icon prop · 좌측 렌더", () => {
    const { container } = render(
      <Button icon={<svg data-testid="ico" />}>저장</Button>,
    );
    expect(container.querySelector('[data-testid="ico"]')).not.toBeNull();
  });

  it("suffix prop · 우측 렌더", () => {
    const { container } = render(
      <Button suffix={<svg data-testid="sfx" />}>다음</Button>,
    );
    expect(container.querySelector('[data-testid="sfx"]')).not.toBeNull();
  });

  it("loading=true · spinner 표시 + disabled", () => {
    const { container } = render(<Button loading icon={<svg data-testid="ico" />}>저장</Button>);
    const btn = container.querySelector("button")!;
    expect(btn.disabled).toBe(true);
    // Loader2 spinner render (아이콘 자리 대신)
    expect(container.querySelector('[data-testid="ico"]')).toBeNull();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });
});

describe("Button · fullWidth · disabled · onClick", () => {
  it("fullWidth · w-full 추가", () => {
    const { container } = render(<Button fullWidth>x</Button>);
    expect(container.querySelector("button")!.className).toContain("w-full");
  });

  it("disabled · disabled attribute", () => {
    const { container } = render(<Button disabled>x</Button>);
    expect(container.querySelector("button")!.disabled).toBe(true);
  });

  it("onClick 호출", () => {
    const fn = vi.fn();
    const { container } = render(<Button onClick={fn}>x</Button>);
    (container.querySelector("button") as HTMLElement).click();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("loading + onClick · disabled 이므로 호출 안 됨", () => {
    const fn = vi.fn();
    const { container } = render(<Button loading onClick={fn}>x</Button>);
    (container.querySelector("button") as HTMLElement).click();
    expect(fn).not.toHaveBeenCalled();
  });
});
