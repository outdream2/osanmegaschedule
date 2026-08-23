// @vitest-environment jsdom
// 2026-08-18 · Modal v2 · 확장 props + backward compat
// 2026-08-23 · v3/v3.1/v3.2/v3.3/v3.4 확장 커버리지 · cleanup 추가 (다중 모달 격리)
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import Modal from "./Modal";

afterEach(() => cleanup());

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

  it("backdrop 클릭 · onClose 호출 (기본)", () => {
    const fn = vi.fn();
    const { container } = render(<Modal open onClose={fn}>x</Modal>);
    const backdrop = container.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("closeOnBackdrop=false · backdrop 클릭 무시", () => {
    const fn = vi.fn();
    const { container } = render(<Modal open onClose={fn} closeOnBackdrop={false}>x</Modal>);
    const backdrop = container.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(fn).not.toHaveBeenCalled();
  });

  it("card 클릭 · onClose 호출 안 함 (backdrop 만 닫힘)", () => {
    const fn = vi.fn();
    const { container } = render(<Modal open onClose={fn}>x</Modal>);
    const card = container.querySelector(".modal-card") as HTMLElement;
    fireEvent.click(card);
    expect(fn).not.toHaveBeenCalled();
  });

  it("closeOnEsc=false · ESC 무시", () => {
    const fn = vi.fn();
    render(<Modal open onClose={fn} closeOnEsc={false}>x</Modal>);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(fn).not.toHaveBeenCalled();
  });
});

// 2026-08-23 · v3/v3.1/v3.2/v3.3/v3.4 확장 props 커버리지
describe("Modal · v3+ 확장 · 신규 size / align / bodyPadding / zIndex / headerBgClass", () => {
  it("size lg-narrow · max-w-lg (v3)", () => {
    const { container } = render(<Modal open size="lg-narrow" onClose={() => {}}>x</Modal>);
    expect(container.querySelector(".modal-card")!.className).toContain("max-w-lg");
  });

  it("size 3xl · max-w-3xl (v3.1)", () => {
    const { container } = render(<Modal open size="3xl" onClose={() => {}}>x</Modal>);
    expect(container.querySelector(".modal-card")!.className).toContain("max-w-3xl");
  });

  it("size xl · max-w-6xl", () => {
    const { container } = render(<Modal open size="xl" onClose={() => {}}>x</Modal>);
    expect(container.querySelector(".modal-card")!.className).toContain("max-w-6xl");
  });

  it("size full · max-w-[95vw]", () => {
    const { container } = render(<Modal open size="full" onClose={() => {}}>x</Modal>);
    expect(container.querySelector(".modal-card")!.className).toContain("max-w-[95vw]");
  });

  it("backdropIntensity dark · bg-zinc-950/95 backdrop-blur (v3)", () => {
    const { container } = render(
      <Modal open onClose={() => {}} backdropIntensity="dark">x</Modal>,
    );
    // dark 는 modal-backdrop 클래스 대신 inline classes 사용
    const root = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(root.className).toContain("bg-zinc-950");
    expect(root.className).toContain("backdrop-blur-sm");
  });

  it("bodyPadding=none · body 클래스는 flex-1 overflow-y-auto (v3)", () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="t" bodyPadding="none">x</Modal>,
    );
    // bodyPadding=none 시 · body 클래스는 "flex-1 overflow-y-auto min-h-0" (modal-body 아님)
    const bodyNone = container.querySelector(".modal-card > .flex-1.overflow-y-auto");
    expect(bodyNone).not.toBeNull();
    expect(container.querySelector(".modal-card > .modal-body")).toBeNull();
  });

  it("bodyPadding=default (기본) · body 는 .modal-body 클래스", () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="t">x</Modal>,
    );
    // 기본 · body 는 .modal-body 클래스 (CSS 에서 p-5 정의)
    expect(container.querySelector(".modal-card > .modal-body")).not.toBeNull();
  });

  it("zIndex prop · 인라인 style z-index override (v3)", () => {
    const { container } = render(
      <Modal open onClose={() => {}} zIndex={100}>x</Modal>,
    );
    const backdrop = container.querySelector(".modal-backdrop") as HTMLElement;
    // zIndex prop 이 style 로 반영됨 or className z-[100] · 둘 중 하나
    const hasZ = backdrop.style.zIndex === "100" || backdrop.className.includes("z-[100]");
    expect(hasZ).toBe(true);
  });

  it("headerBgClass · 커스텀 헤더 배경 (v3.4)", () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="t" headerBgClass="bg-indigo-50/80">x</Modal>,
    );
    const header = container.querySelector(".modal-header");
    expect(header?.className).toContain("bg-indigo-50/80");
  });

  it("headerTextClass · 커스텀 title/icon 색 (v3.4)", () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="t" headerBgClass="bg-brand-deep" headerTextClass="text-white">x</Modal>,
    );
    // headerTextClass 는 title span 과 icon span 에 적용됨 (header div 가 아님)
    const title = container.querySelector('#modal-title') as HTMLElement;
    expect(title?.className).toContain("text-white");
  });

  it("cardStyle · 인라인 style override (v3)", () => {
    const { container } = render(
      <Modal open onClose={() => {}} cardStyle={{ maxHeight: "70vh" }}>x</Modal>,
    );
    const card = container.querySelector(".modal-card") as HTMLElement;
    expect(card.style.maxHeight).toBe("70vh");
  });

  // 2026-08-23 · v3.2 · align="bottom-mobile" 커버리지
  it("align=bottom-mobile · items-end sm:items-center + rounded-t-2xl (v3.2)", () => {
    const { container } = render(
      <Modal open onClose={() => {}} align="bottom-mobile">x</Modal>,
    );
    const root = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(root.className).toContain("items-end");
    expect(root.className).toContain("sm:items-center");
    const card = container.querySelector(".modal-card") as HTMLElement;
    expect(card.className).toContain("rounded-t-2xl");
    expect(card.className).toContain("sm:rounded-2xl");
  });

  // 2026-08-23 · v3.3 · align="top-mobile" 커버리지
  it("align=top-mobile · items-start sm:items-center + pt-4 (v3.3)", () => {
    const { container } = render(
      <Modal open onClose={() => {}} align="top-mobile">x</Modal>,
    );
    const root = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(root.className).toContain("items-start");
    expect(root.className).toContain("sm:items-center");
    expect(root.className).toContain("pt-4");
    const card = container.querySelector(".modal-card") as HTMLElement;
    expect(card.className).toContain("rounded-t-2xl");
  });

  it("align=center (기본) · .modal-backdrop 클래스 · rounded-t-2xl 없음", () => {
    const { container } = render(
      <Modal open onClose={() => {}}>x</Modal>,
    );
    const root = container.querySelector('[role="dialog"]') as HTMLElement;
    // 기본 · align=center + brand backdrop = .modal-backdrop 클래스 (CSS 로 items-center)
    expect(root.className).toContain("modal-backdrop");
    expect(root.className).not.toContain("items-end");
    expect(root.className).not.toContain("items-start");
    const card = container.querySelector(".modal-card") as HTMLElement;
    expect(card.className).not.toContain("rounded-t-2xl");
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
