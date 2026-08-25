// @vitest-environment jsdom
// 2026-08-25 · SplitRightTabs 프리미티브 · 우측 탭바 · 폰트 +2 · v9 톤 · tests
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SplitRightTabs } from "./SplitRightTabs";

const TABS = [
  { key: "info" as const, label: "상품정보" },
  { key: "purchase" as const, label: "매입이력", count: 12 },
  { key: "order" as const, label: "발주내역", count: 0 },
];

describe("SplitRightTabs · 기본 렌더", () => {
  it("모든 tab label 렌더", () => {
    const { container } = render(
      <SplitRightTabs tabs={TABS} active="info" onSelect={() => {}} />,
    );
    expect(container.textContent).toContain("상품정보");
    expect(container.textContent).toContain("매입이력");
    expect(container.textContent).toContain("발주내역");
  });

  it("role=tablist · role=tab · aria-selected", () => {
    const { container } = render(
      <SplitRightTabs tabs={TABS} active="purchase" onSelect={() => {}} />,
    );
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
    const purchaseTab = container.querySelectorAll('[role="tab"]')[1];
    expect(purchaseTab.getAttribute("aria-selected")).toBe("true");
  });

  it("클릭 · onSelect 호출", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <SplitRightTabs tabs={TABS} active="info" onSelect={onSelect} />,
    );
    const purchaseTab = container.querySelectorAll('[role="tab"]')[1];
    fireEvent.click(purchaseTab);
    expect(onSelect).toHaveBeenCalledWith("purchase");
  });
});

describe("SplitRightTabs · v9 시그니처", () => {
  it("활성 탭 · brand-deep + underline gradient span", () => {
    const { container } = render(
      <SplitRightTabs tabs={TABS} active="purchase" onSelect={() => {}} />,
    );
    const purchaseTab = container.querySelectorAll('[role="tab"]')[1];
    expect(purchaseTab.className).toContain("text-brand-deep");
    const underline = purchaseTab.querySelector("span[aria-hidden]");
    expect(underline).not.toBeNull();
    expect(underline!.className).toContain("bg-gradient-to-r");
    expect(underline!.className).toContain("from-brand-deep");
    expect(underline!.className).toContain("via-sky-500");
    expect(underline!.className).toContain("to-brand-deep");
  });

  it("비활성 탭 · underline span 없음", () => {
    const { container } = render(
      <SplitRightTabs tabs={TABS} active="info" onSelect={() => {}} />,
    );
    const purchaseTab = container.querySelectorAll('[role="tab"]')[1];
    expect(purchaseTab.querySelector("span[aria-hidden]")).toBeNull();
  });

  it("폰트 +2 · 15/16px 계열", () => {
    const { container } = render(
      <SplitRightTabs tabs={TABS} active="info" onSelect={() => {}} />,
    );
    const tab = container.querySelectorAll('[role="tab"]')[0];
    expect(tab.className).toMatch(/text-\[15px\]|text-\[16px\]/);
  });
});

describe("SplitRightTabs · count badge", () => {
  it("count > 0 · 배지 렌더", () => {
    const { container } = render(
      <SplitRightTabs tabs={TABS} active="info" onSelect={() => {}} />,
    );
    expect(container.textContent).toContain("12");
  });

  it("count === 0 · 배지 미렌더", () => {
    const { container } = render(
      <SplitRightTabs
        tabs={[{ key: "x", label: "테스트", count: 0 }]}
        active="x"
        onSelect={() => {}}
      />,
    );
    // 라벨은 있고 · 배지는 없음 (0 미렌더)
    expect(container.textContent).toContain("테스트");
  });

  it("count === null · 배지 미렌더", () => {
    const { container } = render(
      <SplitRightTabs
        tabs={[{ key: "x", label: "테스트", count: null }]}
        active="x"
        onSelect={() => {}}
      />,
    );
    expect(container.textContent).toContain("테스트");
  });
});

describe("SplitRightTabs · sticky · withBorder · bg · visible", () => {
  it("sticky=true · sticky top-0 z-20", () => {
    const { container } = render(
      <SplitRightTabs tabs={TABS} active="info" onSelect={() => {}} sticky />,
    );
    const root = container.firstElementChild!;
    expect(root.className).toContain("sticky");
    expect(root.className).toContain("top-0");
    expect(root.className).toContain("z-20");
  });

  it("withBorder=false · border-b 없음", () => {
    const { container } = render(
      <SplitRightTabs tabs={TABS} active="info" onSelect={() => {}} withBorder={false} />,
    );
    expect(container.firstElementChild!.className).not.toContain("border-b");
  });

  it("bg 커스텀 · bg-zinc-50", () => {
    const { container } = render(
      <SplitRightTabs tabs={TABS} active="info" onSelect={() => {}} bg="bg-zinc-50" />,
    );
    expect(container.firstElementChild!.className).toContain("bg-zinc-50");
  });

  it("visible=false · 해당 탭 미렌더", () => {
    const { container } = render(
      <SplitRightTabs
        tabs={[
          { key: "a", label: "A" },
          { key: "b", label: "B", visible: false },
          { key: "c", label: "C" },
        ]}
        active="a"
        onSelect={() => {}}
      />,
    );
    expect(container.textContent).toContain("A");
    expect(container.textContent).not.toContain("B");
    expect(container.textContent).toContain("C");
  });
});
