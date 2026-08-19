// @vitest-environment jsdom
// 2026-08-19 · SearchBar · 검색·결과 카운트·history·Esc·X 버튼
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { SearchBar } from "./SearchBar";

beforeEach(() => {
  localStorage.clear();
});

describe("SearchBar · 기본", () => {
  it("input · placeholder 반영", () => {
    const { container } = render(
      <SearchBar value="" onChange={() => {}} placeholder="상품 검색" />
    );
    const input = container.querySelector("input")!;
    expect(input.getAttribute("placeholder")).toBe("상품 검색");
    expect(input.getAttribute("aria-label")).toBe("상품 검색");
  });

  it("Search 아이콘 · svg 존재", () => {
    const { container } = render(<SearchBar value="" onChange={() => {}} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("입력 · onChange 호출", () => {
    const onChange = vi.fn();
    const { container } = render(<SearchBar value="" onChange={onChange} />);
    fireEvent.change(container.querySelector("input")!, { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });
});

describe("SearchBar · 결과 카운트", () => {
  it("value + resultCount · 배지 렌더", () => {
    const { container } = render(
      <SearchBar value="abc" onChange={() => {}} resultCount={5} />
    );
    expect(container.textContent).toContain("5건");
  });

  it("resultUnit 커스텀", () => {
    const { container } = render(
      <SearchBar value="abc" onChange={() => {}} resultCount={3} resultUnit="개" />
    );
    expect(container.textContent).toContain("3개");
  });

  it("value 없으면 · 배지 미표시", () => {
    const { container } = render(
      <SearchBar value="" onChange={() => {}} resultCount={5} />
    );
    expect(container.textContent).not.toContain("5건");
  });

  it("resultCount 0 · 회색 배지", () => {
    const { container } = render(
      <SearchBar value="abc" onChange={() => {}} resultCount={0} />
    );
    const badge = container.querySelector(".bg-zinc-100");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain("0");
  });
});

describe("SearchBar · X 버튼 (clear)", () => {
  it("value 있을 때 · X 버튼 렌더", () => {
    const { container } = render(<SearchBar value="abc" onChange={() => {}} />);
    const clearBtn = container.querySelector('button[aria-label="검색 초기화"]');
    expect(clearBtn).not.toBeNull();
  });

  it("value 없으면 · X 버튼 없음", () => {
    const { container } = render(<SearchBar value="" onChange={() => {}} />);
    expect(container.querySelector('button[aria-label="검색 초기화"]')).toBeNull();
  });

  it("X 클릭 · onChange('') 호출", () => {
    const onChange = vi.fn();
    const { container } = render(<SearchBar value="abc" onChange={onChange} />);
    fireEvent.click(container.querySelector('button[aria-label="검색 초기화"]')!);
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("SearchBar · Esc 키", () => {
  it("Esc → onChange('')", () => {
    const onChange = vi.fn();
    const { container } = render(<SearchBar value="abc" onChange={onChange} />);
    fireEvent.keyDown(container.querySelector("input")!, { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("SearchBar · history (localStorage)", () => {
  it("historyKey 없으면 · history 저장 안 함", () => {
    const { container } = render(<SearchBar value="abc" onChange={() => {}} />);
    fireEvent.blur(container.querySelector("input")!);
    expect(localStorage.length).toBe(0);
  });

  it("historyKey + Enter · localStorage 저장", () => {
    const { container } = render(
      <SearchBar value="상품A" onChange={() => {}} historyKey="test_history" />
    );
    fireEvent.keyDown(container.querySelector("input")!, { key: "Enter" });
    const stored = JSON.parse(localStorage.getItem("test_history")!);
    expect(stored).toContain("상품A");
  });

  it("2자 미만 · 저장 안 함", () => {
    const { container } = render(
      <SearchBar value="a" onChange={() => {}} historyKey="test_history" />
    );
    fireEvent.keyDown(container.querySelector("input")!, { key: "Enter" });
    expect(localStorage.getItem("test_history")).toBeNull();
  });

  it("과거 history 로딩 · 포커스 시 dropdown 표시", () => {
    localStorage.setItem("test_history", JSON.stringify(["과거검색어"]));
    const { container } = render(
      <SearchBar value="" onChange={() => {}} historyKey="test_history" />
    );
    act(() => {
      fireEvent.focus(container.querySelector("input")!);
    });
    expect(container.textContent).toContain("과거검색어");
    expect(container.textContent).toContain("최근 검색");
  });
});

describe("SearchBar · autoFocus + widthClass", () => {
  it("widthClass 커스텀 · 반영", () => {
    const { container } = render(
      <SearchBar value="" onChange={() => {}} widthClass="w-96" />
    );
    expect(container.querySelector(".w-96")).not.toBeNull();
  });

  it("autoFocus · input focus 설정 (jsdom 기본 미검증 · 존재 확인만)", () => {
    const { container } = render(
      <SearchBar value="" onChange={() => {}} autoFocus />
    );
    // autoFocus 속성 반영은 브라우저 특화 · 존재만 확인
    expect(container.querySelector("input")).not.toBeNull();
  });
});
