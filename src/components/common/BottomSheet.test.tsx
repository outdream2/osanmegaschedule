// @vitest-environment jsdom
// 2026-08-19 · BottomSheet · open/onClose + title + right + maxHeight + backdrop/ESC
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { BottomSheet } from "./BottomSheet";

afterEach(() => cleanup());

describe("BottomSheet · open 제어", () => {
  it("open=false · 렌더 안 함", () => {
    const { container } = render(
      <BottomSheet open={false} onClose={() => {}}>x</BottomSheet>
    );
    expect(container.firstChild).toBeNull();
  });

  it("open=true · dialog role · aria-modal", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}}>x</BottomSheet>
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("aria-modal")).toBe("true");
  });

  it("open=true · children 렌더", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}}>
        <div data-testid="c">본문</div>
      </BottomSheet>
    );
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
  });

  it("open=true · drag handle bar 렌더 (w-10 h-1)", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}}>c</BottomSheet>
    );
    expect(container.querySelector(".w-10.h-1")).not.toBeNull();
  });
});

describe("BottomSheet · 헤더 (title + right + close)", () => {
  it("title 표시", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}} title="필터">c</BottomSheet>
    );
    expect(container.textContent).toContain("필터");
  });

  it("title 있을 때 · 닫기 버튼 렌더", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}} title="x">c</BottomSheet>
    );
    const closeBtn = container.querySelector('button[aria-label="닫기"]');
    expect(closeBtn).not.toBeNull();
  });

  it("right 슬롯 렌더", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}} title="x" right={<button data-testid="r">저장</button>}>c</BottomSheet>
    );
    expect(container.querySelector('[data-testid="r"]')).not.toBeNull();
  });

  it("title/right 모두 없으면 · 헤더 미렌더", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}}>c</BottomSheet>
    );
    expect(container.querySelector('button[aria-label="닫기"]')).toBeNull();
  });

  it("title string · aria-labelledby 반영 (P3 a11y · 2026-09-01)", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}} title="필터">c</BottomSheet>
    );
    // 2026-09-01 · P3 a11y · aria-label 대신 aria-labelledby="bottomsheet-title" 로 변경
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-labelledby")).toBe("bottomsheet-title");
    const titleEl = container.querySelector('#bottomsheet-title');
    expect(titleEl?.textContent).toBe("필터");
  });
});

describe("BottomSheet · 이벤트", () => {
  it("닫기 버튼 클릭 · onClose", () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheet open onClose={onClose} title="x">c</BottomSheet>
    );
    fireEvent.click(container.querySelector('button[aria-label="닫기"]')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop 클릭 · onClose", () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheet open onClose={onClose}>c</BottomSheet>
    );
    // dialog 자체가 backdrop wrapper
    const backdrop = container.querySelector('[role="dialog"]')!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("컨텐츠 클릭 · onClose 호출 안 됨 (stopPropagation)", () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheet open onClose={onClose}>
        <div data-testid="c">본문</div>
      </BottomSheet>
    );
    fireEvent.click(container.querySelector('[data-testid="c"]')!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ESC 키 · onClose", () => {
    const onClose = vi.fn();
    render(<BottomSheet open onClose={onClose}>c</BottomSheet>);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("open=true · body scroll 잠금", () => {
    document.body.style.overflow = "";
    const { unmount } = render(<BottomSheet open onClose={() => {}}>c</BottomSheet>);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
  });
});

describe("BottomSheet · maxHeight", () => {
  it("기본 · 60vh", () => {
    const { container } = render(<BottomSheet open onClose={() => {}}>c</BottomSheet>);
    const sheet = container.querySelector(".rounded-t-2xl") as HTMLElement;
    expect(sheet.style.maxHeight).toBe("60vh");
  });

  it("커스텀 · 반영", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}} maxHeight="80vh">c</BottomSheet>
    );
    const sheet = container.querySelector(".rounded-t-2xl") as HTMLElement;
    expect(sheet.style.maxHeight).toBe("80vh");
  });
});

describe("BottomSheet · className", () => {
  it("className 병합", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}} className="custom-x">c</BottomSheet>
    );
    const sheet = container.querySelector(".custom-x");
    expect(sheet).not.toBeNull();
  });
});

// 2026-08-23 · v2 · header/fullscreen/disableHandle/backdropClass/zIndex/footer 커버리지
describe("BottomSheet · v2 · header · fullscreen · disableHandle", () => {
  it("header 커스텀 JSX · title 무시 (커스텀 대체)", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}} title="원래타이틀" header={<div data-testid="h">커스텀</div>}>c</BottomSheet>
    );
    expect(container.querySelector('[data-testid="h"]')).not.toBeNull();
    expect(container.textContent).toContain("커스텀");
    expect(container.textContent).not.toContain("원래타이틀");
  });

  it("fullscreen · maxHeight 100vh · max-w 제거", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}} fullscreen>c</BottomSheet>
    );
    const sheet = container.querySelector(".rounded-t-2xl") as HTMLElement;
    expect(sheet.style.maxHeight).toBe("100vh");
    expect(sheet.className).not.toContain("max-w-[600px]");
  });

  it("disableHandle=true · drag handle 숨김", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}} disableHandle>c</BottomSheet>
    );
    const handle = container.querySelector("span.w-10.h-1.rounded-full.bg-zinc-300");
    expect(handle).toBeNull();
  });

  it("disableHandle=false (기본) · drag handle 노출", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}}>c</BottomSheet>
    );
    const handle = container.querySelector("span.w-10.h-1.rounded-full.bg-zinc-300");
    expect(handle).not.toBeNull();
  });
});

describe("BottomSheet · v2 · backdropClass · zIndex · footer", () => {
  it("backdropClass · 커스텀 배경 (dark 등)", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}} backdropClass="bg-zinc-900/70">c</BottomSheet>
    );
    const backdrop = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(backdrop.className).toContain("bg-zinc-900/70");
  });

  it("zIndex · 인라인 style override · z-[100] 클래스 제거", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}} zIndex={70}>c</BottomSheet>
    );
    const backdrop = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(backdrop.style.zIndex).toBe("70");
    expect(backdrop.className).not.toContain("z-[100]");
  });

  it("footer slot · 렌더", () => {
    const { container } = render(
      <BottomSheet open onClose={() => {}} footer={<button data-testid="fb">저장</button>}>c</BottomSheet>
    );
    expect(container.querySelector('[data-testid="fb"]')).not.toBeNull();
  });
});
