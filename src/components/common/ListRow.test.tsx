// @vitest-environment jsdom
// 2026-08-24 · #263 · ListRow · ListPanel 프리미티브 테스트
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ListRow, ListPanel } from "./ListRow";

describe("ListPanel · wrapper", () => {
  it("children 렌더 · role=list", () => {
    const { container } = render(<ListPanel><div>row1</div><div>row2</div></ListPanel>);
    const list = container.querySelector('[role="list"]');
    expect(list).not.toBeNull();
    expect(list!.textContent).toContain("row1");
    expect(list!.textContent).toContain("row2");
  });
  it("loading · opacity 낮춤 + pointer-events X", () => {
    const { container } = render(<ListPanel loading><div>x</div></ListPanel>);
    const card = container.querySelector(".opacity-40");
    expect(card).not.toBeNull();
    expect(card!.className).toContain("pointer-events-none");
  });
});

describe("ListRow · 기본 렌더", () => {
  it("title 필수 렌더", () => {
    const { container } = render(<ListRow title="상품A" />);
    expect(container.textContent).toContain("상품A");
  });
  it("subtitle · title 아래 렌더", () => {
    const { container } = render(<ListRow title="상품A" subtitle="Set 5개" />);
    expect(container.textContent).toContain("Set 5개");
  });
  it("meta · 우측 렌더", () => {
    const { container } = render(<ListRow title="상품A" meta="14:20" />);
    expect(container.textContent).toContain("14:20");
  });
  it("icon 없음 · tile 자체 미렌더", () => {
    const { container } = render(<ListRow title="상품A" />);
    const tile = container.querySelector(".w-9.h-9");
    expect(tile).toBeNull();
  });
  it("icon 있음 · tile 렌더", () => {
    const { container } = render(<ListRow icon={<span data-testid="ic">•</span>} title="상품A" />);
    const tile = container.querySelector(".w-9.h-9");
    expect(tile).not.toBeNull();
  });
});

describe("ListRow · 상호작용", () => {
  it("onClick 없음 · div role=listitem", () => {
    const { container } = render(<ListRow title="A" />);
    const el = container.querySelector('[role="listitem"]');
    expect(el?.tagName).toBe("DIV");
  });
  it("onClick 있음 · button role=listitem", () => {
    const onClick = vi.fn();
    const { container } = render(<ListRow title="A" onClick={onClick} />);
    const el = container.querySelector('[role="listitem"]');
    expect(el?.tagName).toBe("BUTTON");
  });
  it("onClick 클릭 · 콜백 호출", () => {
    const onClick = vi.fn();
    const { container } = render(<ListRow title="A" onClick={onClick} />);
    const btn = container.querySelector("button")!;
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("active · accent bar 렌더", () => {
    const { container } = render(<ListRow title="A" active />);
    const el = container.querySelector('[role="listitem"]')!;
    expect(el.className).toContain("bg-brand-tint");
  });
});

describe("ListRow · dense / iconTone", () => {
  it("dense · px-3 py-2 클래스", () => {
    const { container } = render(<ListRow title="A" dense />);
    const el = container.querySelector('[role="listitem"]')!;
    expect(el.className).toContain("px-3");
    expect(el.className).toContain("py-2");
  });
  it("iconTone=rose · bg-rose-50 · text-rose-700", () => {
    const { container } = render(<ListRow icon={<span>•</span>} title="A" iconTone="rose" />);
    const tile = container.querySelector(".w-9.h-9");
    expect(tile?.className).toContain("bg-rose-50");
    expect(tile!.querySelector("span.text-rose-700")).not.toBeNull();
  });
});
