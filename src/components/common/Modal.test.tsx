// @vitest-environment jsdom
// 2026-08-18 · Modal v2 · 확장 props + backward compat
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import Modal from "./Modal";

describe("Modal · 렌더 · open/close 제어", () => {
  it("open=false · 렌더 안 함", () => {
    const { container } = render(<Modal open={false} onClose={() => {}}>x</Modal>);
    expect(container.querySelector(".modal-backdrop")).toBeNull();
  });

  it("open=true · backdrop + card 렌더", () => {
    const { container } = render(<Modal open onClose={() => {}}>x</Modal>);
    expect(container.querySelector(".modal-backdrop")).not.toBeNull();
    expect(container.querySelector(".modal-card")).not.toBeNull();
    expect(container.textContent).toContain("x");
  });

  it("size 매핑 · sm=max-w-md · lg=max-w-4xl", () => {
    const { container: sm } = render(<Modal open size="sm" onClose={() => {}}>x</Modal>);
    expect(sm.querySelector(".modal-card")!.className).toContain("max-w-md");
    const { container: lg } = render(<Modal open size="lg" onClose={() => {}}>x</Modal>);
    expect(lg.querySelector(".modal-card")!.className).toContain("max-w-4xl");
  });
});

describe("Modal · v2 · icon · titleAccent · headerRight · backdropIntensity", () => {
  it("icon prop · 헤더 좌측 렌더", () => {
    const { container } = render(
      <Modal open onClose={() => {}} icon={<svg data-testid="ico" />} title="t">x</Modal>,
    );
    expect(container.querySelector('[data-testid="ico"]')).not.toBeNull();
  });

  it("titleAccent · 3px accent bar 렌더", () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="t" titleAccent>x</Modal>,
    );
    const accents = container.querySelectorAll(".rounded-full.bg-brand-deep");
    expect(accents.length).toBeGreaterThan(0);
  });

  it("headerRight · slot 렌더 · close 앞", () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="t" headerRight={<span data-testid="right">x</span>}>y</Modal>,
    );
    expect(container.querySelector('[data-testid="right"]')).not.toBeNull();
  });

  it("backdropIntensity=brand-strong · backdrop-brand-strong 클래스", () => {
    const { container } = render(
      <Modal open onClose={() => {}} backdropIntensity="brand-strong">x</Modal>,
    );
    const backdrop = container.querySelector(".backdrop-brand-strong");
    expect(backdrop).not.toBeNull();
  });

  it("headerTint=false · bg-zinc-50/60 없음", () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="t" headerTint={false}>x</Modal>,
    );
    const header = container.querySelector(".modal-header");
    expect(header?.className).not.toContain("bg-zinc-50/60");
  });

  it("headerTint=true (기본) · bg-zinc-50/60 적용", () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="t">x</Modal>,
    );
    const header = container.querySelector(".modal-header");
    expect(header?.className).toContain("bg-zinc-50/60");
  });
});

describe("Modal · close · ESC · backdrop 클릭", () => {
  it("close 버튼 클릭 · onClose 호출", () => {
    const fn = vi.fn();
    const { container } = render(<Modal open onClose={fn} title="t">x</Modal>);
    const closeBtn = container.querySelector('button[aria-label="닫기"]') as HTMLElement;
    closeBtn.click();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("showClose=false · 닫기 버튼 없음", () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="t" showClose={false}>x</Modal>,
    );
    expect(container.querySelector('button[aria-label="닫기"]')).toBeNull();
  });

  it("ESC · onClose 호출", () => {
    const fn = vi.fn();
    render(<Modal open onClose={fn}>x</Modal>);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("closeOnEsc=false · ESC 무시", () => {
    const fn = vi.fn();
    render(<Modal open onClose={fn} closeOnEsc={false}>x</Modal>);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("Modal · footer slot", () => {
  it("footer 렌더 · border-t 구분선", () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="t" footer={<button data-testid="btn">OK</button>}>x</Modal>,
    );
    expect(container.querySelector('[data-testid="btn"]')).not.toBeNull();
  });
});
