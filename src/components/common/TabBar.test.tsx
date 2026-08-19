// @vitest-environment jsdom
// 2026-08-19 · TabBar · 3 레벨 + tabs/activeKey/onSelect + badge + visible
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TabBar } from "./TabBar";
import type { TabDef } from "./TabBar";

type Key = "a" | "b" | "c";

const TABS: TabDef<Key>[] = [
  { key: "a", label: "발주", color: "sky" },
  { key: "b", label: "매입", color: "amber", badge: 3 },
  { key: "c", label: "반품", color: "rose" },
];

describe("TabBar · 렌더 · 공통", () => {
  it("L1 · tabs 개수만큼 button 렌더", () => {
    const { container } = render(
      <TabBar level={1} tabs={TABS} activeKey="a" onSelect={() => {}} />
    );
    const btns = container.querySelectorAll("button");
    expect(btns.length).toBe(TABS.length);
    expect(Array.from(btns).map(b => b.querySelector("span")?.textContent).slice(0, 3)).toEqual(["발주", "매입", "반품"]);
  });

  it("L2 · pill container 렌더", () => {
    const { container } = render(
      <TabBar level={2} tabs={TABS} activeKey="a" onSelect={() => {}} />
    );
    const pill = container.querySelector(".rounded-2xl");
    expect(pill).not.toBeNull();
  });

  it("L3 · filter chip 렌더", () => {
    const { container } = render(
      <TabBar level={3} tabs={TABS} activeKey="a" onSelect={() => {}} />
    );
    const chips = container.querySelectorAll(".rounded-full");
    expect(chips.length).toBeGreaterThan(0);
  });
});

describe("TabBar · onSelect", () => {
  it("L1 · 클릭 시 onSelect 호출", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TabBar level={1} tabs={TABS} activeKey="a" onSelect={onSelect} />
    );
    fireEvent.click(container.querySelectorAll("button")[1]);
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("L2 · 클릭 시 onSelect 호출", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TabBar level={2} tabs={TABS} activeKey="a" onSelect={onSelect} />
    );
    fireEvent.click(container.querySelectorAll("button")[2]);
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("L3 · 클릭 시 onSelect 호출", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TabBar level={3} tabs={TABS} activeKey="a" onSelect={onSelect} />
    );
    fireEvent.click(container.querySelectorAll("button")[1]);
    expect(onSelect).toHaveBeenCalledWith("b");
  });
});

describe("TabBar · badge", () => {
  it("L2 · badge > 0 · 표시", () => {
    const { container } = render(
      <TabBar level={2} tabs={TABS} activeKey="a" onSelect={() => {}} />
    );
    expect(container.textContent).toContain("3");
  });

  it("L3 · badge > 0 · 표시", () => {
    const { container } = render(
      <TabBar level={3} tabs={TABS} activeKey="a" onSelect={() => {}} />
    );
    expect(container.textContent).toContain("3");
  });

  it("badge=0 · 미표시", () => {
    const t: TabDef<Key>[] = [
      { key: "a", label: "발주", badge: 0 },
    ];
    const { container } = render(
      <TabBar level={2} tabs={t} activeKey="a" onSelect={() => {}} />
    );
    const badgeEl = container.querySelector(".rounded-full.text-\\[11px\\]");
    expect(badgeEl).toBeNull();
  });
});

describe("TabBar · visible=false 필터링", () => {
  it("visible=false 인 탭 · 렌더 안 됨", () => {
    const t: TabDef<Key>[] = [
      { key: "a", label: "발주" },
      { key: "b", label: "매입", visible: false },
      { key: "c", label: "반품" },
    ];
    const { container } = render(
      <TabBar level={1} tabs={t} activeKey="a" onSelect={() => {}} />
    );
    expect(container.textContent).not.toContain("매입");
    expect(container.querySelectorAll("button").length).toBe(2);
  });

  it("visible 명시 없으면 · 렌더 (기본 표시)", () => {
    const { container } = render(
      <TabBar level={1} tabs={TABS} activeKey="a" onSelect={() => {}} />
    );
    expect(container.querySelectorAll("button").length).toBe(3);
  });
});

describe("TabBar · variant=nested", () => {
  it("L2 · variant=nested · zinc-50/50 배경", () => {
    const { container } = render(
      <TabBar level={2} tabs={TABS} activeKey="a" onSelect={() => {}} variant="nested" />
    );
    expect(container.firstElementChild!.className).toContain("bg-zinc-50/50");
  });
});

describe("TabBar · className/maxWidth", () => {
  it("className 병합 · L1", () => {
    const { container } = render(
      <TabBar level={1} tabs={TABS} activeKey="a" onSelect={() => {}} className="mt-4" />
    );
    expect(container.firstElementChild!.className).toContain("mt-4");
  });

  it("maxWidth 숫자 · 스타일 반영 (L1 tab-bar-inner)", () => {
    const { container } = render(
      <TabBar level={1} tabs={TABS} activeKey="a" onSelect={() => {}} maxWidth={800} />
    );
    const inner = container.querySelector(".tab-bar-inner") as HTMLElement;
    expect(inner.style.maxWidth).toBe("800px");
  });

  it("maxWidth 문자열 · 그대로 반영", () => {
    const { container } = render(
      <TabBar level={2} tabs={TABS} activeKey="a" onSelect={() => {}} maxWidth="100%" />
    );
    const inner = container.querySelector(".tab-bar-inner") as HTMLElement;
    expect(inner.style.maxWidth).toBe("100%");
  });
});
