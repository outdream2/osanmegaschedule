// @vitest-environment jsdom
// 2026-08-19 · Panel · title + moreLabel + onMore + children + className
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Panel } from "./Panel";

describe("Panel · 기본 렌더", () => {
  it("title + children 표시", () => {
    const { container } = render(
      <Panel title="공지사항">
        <div data-testid="content">내용</div>
      </Panel>
    );
    expect(container.textContent).toContain("공지사항");
    expect(container.querySelector('[data-testid="content"]')).not.toBeNull();
  });

  it("기본 surface · bg-white + border + rounded", () => {
    // 2026-08-23 · Panel · Card v2 primitive 마이그레이션 · rounded-[14px] → rounded-lg
    const { container } = render(<Panel title="x">c</Panel>);
    const root = container.firstElementChild!;
    expect(root.className).toContain("bg-white");
    expect(root.className).toContain("border");
    expect(root.className).toContain("rounded-lg");
    expect(root.className).toContain("p-4");
  });

  it("title · text-[15px] font-bold text-ink", () => {
    const { container } = render(<Panel title="공지사항">c</Panel>);
    const titleEl = container.querySelector(".text-\\[15px\\]");
    expect(titleEl).not.toBeNull();
    expect(titleEl!.className).toContain("font-bold");
    expect(titleEl!.className).toContain("text-ink");
  });
});

describe("Panel · moreLabel + onMore", () => {
  it("moreLabel + onMore 둘 다 있을 때만 버튼 렌더", () => {
    const onMore = vi.fn();
    const { container } = render(
      <Panel title="x" moreLabel="전체보기" onMore={onMore}>c</Panel>
    );
    const btn = container.querySelector("button");
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe("전체보기");
  });

  it("moreLabel 만 있고 onMore 없으면 · 버튼 렌더 안 함", () => {
    const { container } = render(
      <Panel title="x" moreLabel="전체보기">c</Panel>
    );
    expect(container.querySelector("button")).toBeNull();
  });

  it("onMore 클릭 시 · 콜백 호출", () => {
    const onMore = vi.fn();
    const { container } = render(
      <Panel title="x" moreLabel="더보기" onMore={onMore}>c</Panel>
    );
    fireEvent.click(container.querySelector("button")!);
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it("moreLabel · brand-deep 색상 + underline hover", () => {
    const { container } = render(
      <Panel title="x" moreLabel="더보기" onMore={() => {}}>c</Panel>
    );
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("text-brand-deep");
    expect(btn.className).toContain("hover:underline");
  });
});

describe("Panel · className", () => {
  it("추가 className 병합", () => {
    const { container } = render(<Panel title="x" className="mt-4">c</Panel>);
    expect(container.firstElementChild!.className).toContain("mt-4");
  });
});
