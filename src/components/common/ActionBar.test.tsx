// @vitest-environment jsdom
// 2026-08-29 · #122 P6 · ActionBar 프리미티브 테스트
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ActionBar } from "./ActionBar";

afterEach(() => cleanup());

describe("ActionBar · 프리미티브", () => {
  it("left · right 슬롯 렌더", () => {
    const { container } = render(
      <ActionBar
        left={<span data-testid="L">left</span>}
        right={<button data-testid="R">Save</button>}
      />
    );
    expect(container.querySelector('[data-testid="L"]')?.textContent).toBe("left");
    expect(container.querySelector('[data-testid="R"]')?.textContent).toBe("Save");
  });

  it("기본 · sticky bottom-0 z-10", () => {
    const { container } = render(<ActionBar right={<button>OK</button>} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("sticky");
    expect(root.className).toContain("bottom-0");
    expect(root.className).toContain("z-10");
  });

  it("sticky=false · sticky 없음 · 흰 배경", () => {
    const { container } = render(<ActionBar sticky={false} right={<button>OK</button>} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain("sticky");
    // JSDOM · #fff → rgb(255, 255, 255) 변환
    const bg = (root.style.background || "").toLowerCase().replace(/\s+/g, "");
    expect(bg.includes("#fff") || bg.includes("rgb(255,255,255)")).toBe(true);
  });

  it("className prop · 병합", () => {
    const { container } = render(<ActionBar className="my-extra" right={<span>x</span>} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("my-extra");
  });

  it("left slot 생략 시 · 빈 div 유지 (justify-between 유지)", () => {
    const { container } = render(<ActionBar right={<span>x</span>} />);
    const root = container.firstElementChild as HTMLElement;
    // 좌·우 두 슬롯 컨테이너 존재
    expect(root.children.length).toBe(2);
  });
});
