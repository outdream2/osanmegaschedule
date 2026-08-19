// @vitest-environment jsdom
// 2026-08-19 · FilterSortBar · FilterSortLabel · FilterSortGroup · FilterSortRow
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import {
  FilterSortLabel,
  FilterSortGroup,
  FilterSortRow,
} from "./FilterSortBar";

describe("FilterSortLabel", () => {
  it("children 표시", () => {
    const { container } = render(<FilterSortLabel>정렬</FilterSortLabel>);
    expect(container.textContent).toContain("정렬");
  });

  it("AccentBar + 큰 폰트 · text-[17px] font-bold", () => {
    const { container } = render(<FilterSortLabel>x</FilterSortLabel>);
    const label = container.querySelector(".text-\\[17px\\]");
    expect(label).not.toBeNull();
    expect(label!.className).toContain("font-bold");
    expect(label!.className).toContain("text-ink");
  });

  it("className 병합", () => {
    const { container } = render(<FilterSortLabel className="mr-4">x</FilterSortLabel>);
    expect(container.firstElementChild!.className).toContain("mr-4");
  });
});

type K = "recent" | "old" | "name";
const OPTIONS = [
  { key: "recent" as K, label: "최신순", count: 42 },
  { key: "old" as K, label: "오래된순", count: 18 },
  { key: "name" as K, label: "이름순" },
];

describe("FilterSortGroup · 렌더", () => {
  it("options 개수만큼 · button 렌더", () => {
    const { container } = render(
      <FilterSortGroup options={OPTIONS} active="recent" onSelect={() => {}} />
    );
    expect(container.querySelectorAll("button").length).toBe(3);
  });

  it("count 있으면 · (숫자) 표시", () => {
    const { container } = render(
      <FilterSortGroup options={OPTIONS} active="recent" onSelect={() => {}} />
    );
    expect(container.textContent).toContain("(42)");
    expect(container.textContent).toContain("(18)");
  });

  it("count 없으면 · (숫자) 없음 (해당 항목)", () => {
    const { container } = render(
      <FilterSortGroup options={OPTIONS} active="recent" onSelect={() => {}} />
    );
    const btns = container.querySelectorAll("button");
    // '이름순' 은 count 없음
    expect(btns[2].textContent).toBe("이름순");
  });
});

describe("FilterSortGroup · active 상태 + 정렬", () => {
  it("active · bg-brand-deep + text-white", () => {
    const { container } = render(
      <FilterSortGroup options={OPTIONS} active="old" onSelect={() => {}} />
    );
    const btns = container.querySelectorAll("button");
    expect(btns[1].className).toContain("bg-brand-deep");
    expect(btns[1].className).toContain("text-white");
    expect(btns[0].className).not.toContain("bg-brand-deep");
  });

  it("sortDir=asc · ↑ 표시 · active 인 경우만", () => {
    const opts = [{ key: "name" as K, label: "이름순", sortDir: "asc" as const }];
    const { container } = render(
      <FilterSortGroup options={opts} active="name" onSelect={() => {}} />
    );
    expect(container.textContent).toContain("↑");
  });

  it("sortDir=desc · ↓ 표시 · active", () => {
    const opts = [{ key: "name" as K, label: "이름순", sortDir: "desc" as const }];
    const { container } = render(
      <FilterSortGroup options={opts} active="name" onSelect={() => {}} />
    );
    expect(container.textContent).toContain("↓");
  });

  it("sortDir 있어도 · 비활성 · 화살표 없음", () => {
    const opts = [
      { key: "name" as K, label: "이름순", sortDir: "asc" as const },
      { key: "other" as K, label: "기타" },
    ];
    const { container } = render(
      <FilterSortGroup options={opts} active="other" onSelect={() => {}} />
    );
    expect(container.textContent).not.toContain("↑");
  });
});

describe("FilterSortGroup · onSelect", () => {
  it("클릭 · onSelect · key 전달", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <FilterSortGroup options={OPTIONS} active="recent" onSelect={onSelect} />
    );
    fireEvent.click(container.querySelectorAll("button")[1]);
    expect(onSelect).toHaveBeenCalledWith("old");
  });
});

describe("FilterSortGroup · right + className", () => {
  it("right slot · 렌더", () => {
    const { container } = render(
      <FilterSortGroup
        options={OPTIONS}
        active="recent"
        onSelect={() => {}}
        right={<button data-testid="r">리셋</button>}
      />
    );
    expect(container.querySelector('[data-testid="r"]')).not.toBeNull();
  });

  it("className 병합", () => {
    const { container } = render(
      <FilterSortGroup options={OPTIONS} active="recent" onSelect={() => {}} className="ml-4" />
    );
    expect(container.firstElementChild!.className).toContain("ml-4");
  });
});

describe("FilterSortRow", () => {
  it("children 렌더 · flex + wrap", () => {
    const { container } = render(
      <FilterSortRow>
        <span data-testid="c">child</span>
      </FilterSortRow>
    );
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
    const root = container.firstElementChild!;
    expect(root.className).toContain("flex");
    expect(root.className).toContain("flex-wrap");
  });

  it("className 병합", () => {
    const { container } = render(<FilterSortRow className="mt-4">x</FilterSortRow>);
    expect(container.firstElementChild!.className).toContain("mt-4");
  });
});
