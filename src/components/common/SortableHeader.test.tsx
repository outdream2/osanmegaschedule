// @vitest-environment jsdom
// 2026-08-19 · SortableHeader · columns/activeKey/activeDir/onSort + align + sortable + size
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SortableHeader } from "./SortableHeader";
import type { SortableColumn } from "./SortableHeader";

type K = "name" | "date" | "qty";
const COLS: SortableColumn<K>[] = [
  { key: "name", label: "이름", align: "left" },
  { key: "date", label: "매입일", align: "center" },
  { key: "qty", label: "수량", align: "right", sortable: true },
];

// tr 요소는 tbody/table 내부에서만 렌더 · 테스트용 wrap
function wrap(ui: React.ReactNode) {
  return <table><thead>{ui}</thead></table>;
}

describe("SortableHeader · 렌더", () => {
  it("columns 개수만큼 th 렌더", () => {
    const { container } = render(wrap(
      <SortableHeader columns={COLS} activeKey="name" activeDir="asc" onSort={() => {}} />
    ));
    const ths = container.querySelectorAll("th");
    expect(ths.length).toBe(3);
    expect(Array.from(ths).map(t => t.textContent?.trim())).toEqual(
      expect.arrayContaining(["이름▲", "매입일▲▼", "수량▲▼"])
    );
  });

  it("align 반영 · left/center/right", () => {
    const { container } = render(wrap(
      <SortableHeader columns={COLS} activeKey="name" activeDir="asc" onSort={() => {}} />
    ));
    const ths = container.querySelectorAll("th");
    expect(ths[0].className).toContain("text-left");
    expect(ths[1].className).toContain("text-center");
    expect(ths[2].className).toContain("text-right");
  });

  it("width 반영 · style", () => {
    const cols: SortableColumn<K>[] = [{ key: "name", label: "이름", width: 200 }];
    const { container } = render(wrap(
      <SortableHeader columns={cols} activeKey={null} activeDir="asc" onSort={() => {}} />
    ));
    const th = container.querySelector("th") as HTMLElement;
    expect(th.style.width).toBe("200px");
  });

  it("width 문자열 · 그대로", () => {
    const cols: SortableColumn<K>[] = [{ key: "name", label: "이름", width: "40%" }];
    const { container } = render(wrap(
      <SortableHeader columns={cols} activeKey={null} activeDir="asc" onSort={() => {}} />
    ));
    const th = container.querySelector("th") as HTMLElement;
    expect(th.style.width).toBe("40%");
  });
});

describe("SortableHeader · 정렬 순환", () => {
  it("다른 컬럼 클릭 · asc 로 초기화", () => {
    const onSort = vi.fn();
    const { container } = render(wrap(
      <SortableHeader columns={COLS} activeKey="name" activeDir="desc" onSort={onSort} />
    ));
    fireEvent.click(container.querySelectorAll("th")[1]); // date
    expect(onSort).toHaveBeenCalledWith("date", "asc");
  });

  it("같은 컬럼 · asc → desc", () => {
    const onSort = vi.fn();
    const { container } = render(wrap(
      <SortableHeader columns={COLS} activeKey="name" activeDir="asc" onSort={onSort} />
    ));
    fireEvent.click(container.querySelectorAll("th")[0]); // name
    expect(onSort).toHaveBeenCalledWith("name", "desc");
  });

  it("같은 컬럼 · desc → asc", () => {
    const onSort = vi.fn();
    const { container } = render(wrap(
      <SortableHeader columns={COLS} activeKey="name" activeDir="desc" onSort={onSort} />
    ));
    fireEvent.click(container.querySelectorAll("th")[0]);
    expect(onSort).toHaveBeenCalledWith("name", "asc");
  });
});

describe("SortableHeader · sortable=false", () => {
  it("sortable=false · 클릭해도 onSort 호출 안 됨", () => {
    const cols: SortableColumn<K>[] = [
      { key: "name", label: "이름", sortable: false },
    ];
    const onSort = vi.fn();
    const { container } = render(wrap(
      <SortableHeader columns={cols} activeKey={null} activeDir="asc" onSort={onSort} />
    ));
    fireEvent.click(container.querySelector("th")!);
    expect(onSort).not.toHaveBeenCalled();
  });

  it("sortable=false · 커서 pointer 클래스 없음", () => {
    const cols: SortableColumn<K>[] = [{ key: "name", label: "이름", sortable: false }];
    const { container } = render(wrap(
      <SortableHeader columns={cols} activeKey={null} activeDir="asc" onSort={() => {}} />
    ));
    const th = container.querySelector("th")!;
    expect(th.className).not.toContain("cursor-pointer");
  });
});

describe("SortableHeader · active 표시", () => {
  it("activeKey · ▲ (asc)", () => {
    const { container } = render(wrap(
      <SortableHeader columns={COLS} activeKey="name" activeDir="asc" onSort={() => {}} />
    ));
    expect(container.textContent).toContain("▲");
  });

  it("activeKey · ▼ (desc)", () => {
    const { container } = render(wrap(
      <SortableHeader columns={COLS} activeKey="name" activeDir="desc" onSort={() => {}} />
    ));
    expect(container.textContent).toContain("▼");
  });

  it("비활성 sortable · ▲▼ (dim)", () => {
    const { container } = render(wrap(
      <SortableHeader columns={COLS} activeKey="name" activeDir="asc" onSort={() => {}} />
    ));
    // name 은 active · date/qty 는 ▲▼ 표시
    expect(container.textContent).toContain("▲▼");
  });
});

describe("SortableHeader · size", () => {
  it("normal (기본) · px-2.5 py-2", () => {
    const { container } = render(wrap(
      <SortableHeader columns={COLS} activeKey={null} activeDir="asc" onSort={() => {}} />
    ));
    const th = container.querySelector("th")!;
    expect(th.className).toContain("px-2.5");
    expect(th.className).toContain("py-2");
  });

  it("compact · px-1.5 py-1.5", () => {
    const { container } = render(wrap(
      <SortableHeader columns={COLS} activeKey={null} activeDir="asc" onSort={() => {}} size="compact" />
    ));
    const th = container.querySelector("th")!;
    expect(th.className).toContain("px-1.5");
    expect(th.className).toContain("py-1.5");
  });
});
