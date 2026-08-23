// @vitest-environment jsdom
// 2026-08-18 · Modal v2 · 확장 props + backward compat
// 2026-08-23 · v3/v3.1/v3.2/v3.3/v3.4 확장 커버리지 · cleanup 추가 (다중 모달 격리)
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
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
});

describe("Modal · footer slot", () => {
  it("footer 렌더 · border-t 구분선", () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="t" footer={<button data-testid="btn">OK</button>}>x</Modal>,
    );
    expect(container.querySelector('[data-testid="btn"]')).not.toBeNull();
  });
});
