// @vitest-environment jsdom
// 2026-08-19 · PageToolbar · title/count/selectedCount/icon/search/right/leftSlot
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PageToolbar } from "./PageToolbar";

describe("PageToolbar · 기본", () => {
  it("title 표시", () => {
    const { container } = render(<PageToolbar title="발주 요청" />);
    expect(container.textContent).toContain("발주 요청");
  });

  it("surface · bg-white + rounded-xl + border + padding", () => {
    const { container } = render(<PageToolbar title="x" />);
    const root = container.firstElementChild!;
    expect(root.className).toContain("bg-white");
    expect(root.className).toContain("rounded-xl");
    expect(root.className).toContain("border");
    expect(root.className).toContain("px-4");
    expect(root.className).toContain("py-3");
  });

  it("AccentBar (좌측) 렌더", () => {
    const { container } = render(<PageToolbar title="x" />);
    // AccentBar 는 rounded-full 요소로 렌더 (bar 시각)
    expect(container.querySelector(".bg-brand-deep")).not.toBeNull();
  });
});

describe("PageToolbar · icon", () => {
  it("icon 슬롯 렌더", () => {
    const { container } = render(
      <PageToolbar title="x" icon={<span data-testid="i">📦</span>} />
    );
    expect(container.querySelector('[data-testid="i"]')).not.toBeNull();
  });

  it("icon 없으면 · 아이콘 wrapper 없음", () => {
    const { container } = render(<PageToolbar title="x" />);
    // AccentBar 만 · icon wrapper 는 없음
    // .text-brand-deep 이 있는지 확인 · icon wrapper 는 text-brand-deep 색상
    // 대신 정확한 검증 · title span 은 text-ink 이니 · text-brand-deep inline-flex 없음
    const iconWrap = container.querySelector(".text-brand-deep.shrink-0.inline-flex");
    expect(iconWrap).toBeNull();
  });
});

describe("PageToolbar · count · selectedCount", () => {
  it("count · StatusPill 렌더 · 기본 단위 건", () => {
    const { container } = render(<PageToolbar title="x" count={12} />);
    expect(container.textContent).toContain("12건");
  });

  it("countLabel 커스텀 반영", () => {
    const { container } = render(<PageToolbar title="x" count={5} countLabel="개" />);
    expect(container.textContent).toContain("5개");
  });

  it("count=undefined · pill 없음", () => {
    const { container } = render(<PageToolbar title="x" />);
    expect(container.textContent).not.toContain("건");
  });

  it("selectedCount > 0 · 선택 N 배지 렌더", () => {
    const { container } = render(<PageToolbar title="x" selectedCount={3} />);
    expect(container.textContent).toContain("선택 3");
  });

  it("selectedCount=0 · 배지 미렌더", () => {
    const { container } = render(<PageToolbar title="x" selectedCount={0} />);
    expect(container.textContent).not.toContain("선택");
  });
});

describe("PageToolbar · search", () => {
  it("search 지정 · input 렌더 · placeholder 반영", () => {
    const { container } = render(
      <PageToolbar
        title="x"
        search={{ value: "", onChange: () => {}, placeholder: "상품 검색" }}
      />
    );
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(input!.getAttribute("placeholder")).toBe("상품 검색");
  });

  it("입력 · onChange 호출", () => {
    const onChange = vi.fn();
    const { container } = render(
      <PageToolbar title="x" search={{ value: "", onChange }} />
    );
    fireEvent.change(container.querySelector("input")!, { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });

  it("기본 placeholder · 검색", () => {
    const { container } = render(
      <PageToolbar title="x" search={{ value: "", onChange: () => {} }} />
    );
    expect(container.querySelector("input")!.getAttribute("placeholder")).toBe("검색");
  });

  it("search 없으면 · input 없음", () => {
    const { container } = render(<PageToolbar title="x" />);
    expect(container.querySelector("input")).toBeNull();
  });
});

describe("PageToolbar · right + leftSlot", () => {
  it("right 슬롯 렌더 · ml-auto", () => {
    const { container } = render(
      <PageToolbar title="x" right={<button data-testid="r">+ 추가</button>} />
    );
    expect(container.querySelector('[data-testid="r"]')).not.toBeNull();
    expect(container.querySelector(".ml-auto")).not.toBeNull();
  });

  it("leftSlot 렌더 · 좌측 flex 안", () => {
    const { container } = render(
      <PageToolbar title="x" leftSlot={<span data-testid="l">부제</span>} />
    );
    expect(container.querySelector('[data-testid="l"]')).not.toBeNull();
  });
});

describe("PageToolbar · className", () => {
  it("className 병합", () => {
    const { container } = render(<PageToolbar title="x" className="mt-4" />);
    expect(container.firstElementChild!.className).toContain("mt-4");
  });
});
