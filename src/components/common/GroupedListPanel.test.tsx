// @vitest-environment jsdom
// 2026-08-24 · #258 · GroupedListPanel 프리미티브 렌더 tests
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GroupedListPanel } from "./GroupedListPanel";

interface Item { key: string; name: string; }

describe("GroupedListPanel · 기본 렌더", () => {
  it("빈 groups · empty title 렌더", () => {
    const { container } = render(
      <GroupedListPanel<Item>
        groups={[]}
        renderGroupHeader={() => null}
        renderItem={(i) => <span>{i.name}</span>}
        empty="아이템 없음"
      />
    );
    expect(container.textContent).toContain("아이템 없음");
  });

  it("groups 렌더 · 그룹 헤더 + 아이템 · listitem role", () => {
    const groups = [
      { key: "g1", items: [{ key: "a", name: "상품A" }, { key: "b", name: "상품B" }] },
      { key: "g2", items: [{ key: "c", name: "상품C" }] },
    ];
    const { container } = render(
      <GroupedListPanel<Item>
        groups={groups}
        renderGroupHeader={(g) => <span>그룹-{g.key}</span>}
        renderItem={(i) => <span>{i.name}</span>}
      />
    );
    expect(container.textContent).toContain("그룹-g1");
    expect(container.textContent).toContain("그룹-g2");
    expect(container.textContent).toContain("상품A");
    expect(container.textContent).toContain("상품C");
    // role=list 존재
    expect(container.querySelectorAll("[role='list']").length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll("[role='listitem']").length).toBeGreaterThanOrEqual(3);
  });

  it("loading=true · Spinner 렌더 · empty title X", () => {
    const { container } = render(
      <GroupedListPanel<Item>
        groups={[]}
        renderGroupHeader={() => null}
        renderItem={() => null}
        loading
        empty="빈"
      />
    );
    expect(container.textContent).toContain("불러오는 중...");
    expect(container.textContent).not.toContain("빈");
  });

  it("header + summary slot 렌더", () => {
    const groups = [{ key: "g1", items: [{ key: "a", name: "A" }] }];
    const { container } = render(
      <GroupedListPanel<Item>
        groups={groups}
        renderGroupHeader={() => null}
        renderItem={() => null}
        header={<div>toolbar-slot</div>}
        summary={<div>total-slot</div>}
      />
    );
    expect(container.textContent).toContain("toolbar-slot");
    expect(container.textContent).toContain("total-slot");
  });

  it("summary · loading 중일 때 미노출", () => {
    const { container } = render(
      <GroupedListPanel<Item>
        groups={[]}
        renderGroupHeader={() => null}
        renderItem={() => null}
        loading
        summary={<div>summary-should-hide</div>}
      />
    );
    expect(container.textContent).not.toContain("summary-should-hide");
  });

  it("empty object · title + hint 렌더", () => {
    const { container } = render(
      <GroupedListPanel<Item>
        groups={[]}
        renderGroupHeader={() => null}
        renderItem={() => null}
        empty={{ title: "발주 없음", hint: "발주 요청 대기" }}
      />
    );
    expect(container.textContent).toContain("발주 없음");
    expect(container.textContent).toContain("발주 요청 대기");
  });
});
