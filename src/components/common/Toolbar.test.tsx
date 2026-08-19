// @vitest-environment jsdom
// 2026-08-19 · Toolbar · left/right/search 슬롯 + 검색 clear · Esc
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Toolbar } from "./Toolbar";

describe("Toolbar · 슬롯", () => {
  it("left 슬롯 렌더", () => {
    const { container } = render(<Toolbar left={<span data-testid="l">좌</span>} />);
    expect(container.querySelector('[data-testid="l"]')).not.toBeNull();
  });

  it("right 슬롯 렌더", () => {
    const { container } = render(<Toolbar right={<button data-testid="r">추가</button>} />);
    expect(container.querySelector('[data-testid="r"]')).not.toBeNull();
  });

  it("left/right 모두 렌더 · 순서 유지", () => {
    const { container } = render(
      <Toolbar left={<span data-testid="l">L</span>} right={<span data-testid="r">R</span>} />
    );
    const l = container.querySelector('[data-testid="l"]')!;
    const r = container.querySelector('[data-testid="r"]')!;
    expect(l.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("아무 슬롯 없으면 · 빈 wrapper", () => {
    const { container } = render(<Toolbar />);
    expect(container.firstElementChild!.children.length).toBe(0);
  });

  it("right 는 ml-auto · 우측 정렬", () => {
    const { container } = render(<Toolbar left={<span>L</span>} right={<span>R</span>} />);
    const rightWrap = container.querySelector(".ml-auto");
    expect(rightWrap).not.toBeNull();
  });
});

describe("Toolbar · search", () => {
  it("search 지정 시 · 검색 input 렌더 · placeholder 반영", () => {
    const { container } = render(
      <Toolbar search={{ value: "", onChange: () => {}, placeholder: "상품 검색" }} />
    );
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(input!.getAttribute("placeholder")).toBe("상품 검색");
  });

  it("검색 입력 · onChange 호출", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Toolbar search={{ value: "", onChange }} />
    );
    fireEvent.change(container.querySelector("input")!, { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });

  it("value 있을 때 · X 버튼 렌더 · 클릭 시 clear", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Toolbar search={{ value: "abc", onChange }} />
    );
    const clearBtn = container.querySelector('button[aria-label="검색 초기화"]');
    expect(clearBtn).not.toBeNull();
    fireEvent.click(clearBtn!);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("value 비어있을 때 · X 버튼 없음", () => {
    const { container } = render(
      <Toolbar search={{ value: "", onChange: () => {} }} />
    );
    expect(container.querySelector('button[aria-label="검색 초기화"]')).toBeNull();
  });

  it("Esc 키 · 검색 clear", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Toolbar search={{ value: "abc", onChange }} />
    );
    fireEvent.keyDown(container.querySelector("input")!, { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("widthClass 커스텀 적용", () => {
    const { container } = render(
      <Toolbar search={{ value: "", onChange: () => {}, widthClass: "w-96" }} />
    );
    const wrap = container.querySelector(".w-96");
    expect(wrap).not.toBeNull();
  });
});

describe("Toolbar · className", () => {
  it("className 병합", () => {
    const { container } = render(<Toolbar className="mt-4" />);
    expect(container.firstElementChild!.className).toContain("mt-4");
  });
});
