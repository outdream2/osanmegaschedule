// @vitest-environment jsdom
// 2026-08-23 · SplitListPanel primitive · #198 · toolbar+list+loading/empty/error
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { SplitListPanel } from "./SplitListPanel";

afterEach(() => cleanup());

describe("SplitListPanel · 기본 렌더", () => {
  it("children 표시", () => {
    const { container } = render(
      <SplitListPanel>
        <div data-testid="body">리스트 내용</div>
      </SplitListPanel>
    );
    expect(container.querySelector('[data-testid="body"]')).not.toBeNull();
    expect(container.textContent).toContain("리스트 내용");
  });

  it("title + count 표시 · StatusPill zinc", () => {
    const { container } = render(
      <SplitListPanel title="직원" count={42}>
        <div />
      </SplitListPanel>
    );
    expect(container.textContent).toContain("직원");
    expect(container.textContent).toContain("42");
  });

  it("count 없으면 · 배지 없음", () => {
    const { container } = render(
      <SplitListPanel title="직원">
        <div />
      </SplitListPanel>
    );
    // count 배지 없음 (title 만)
    expect(container.textContent).toContain("직원");
    // StatusPill 요소 없음 확인
    const pills = container.querySelectorAll(".rounded-full");
    // header · rounded-full 은 StatusPill 뿐 (다른 요소 없음)
    expect(pills.length).toBe(0);
  });
});

describe("SplitListPanel · search", () => {
  it("search prop 없으면 · 검색 필드 숨김", () => {
    const { container } = render(
      <SplitListPanel title="X">
        <div />
      </SplitListPanel>
    );
    expect(container.querySelector('input[type="text"]')).toBeNull();
  });

  it("onSearchChange 있으면 · 검색 필드 표시", () => {
    const { container } = render(
      <SplitListPanel search="" onSearchChange={vi.fn()}>
        <div />
      </SplitListPanel>
    );
    expect(container.querySelector('input[type="text"]')).not.toBeNull();
  });

  it("search 입력 · onSearchChange 호출", () => {
    const onSearchChange = vi.fn();
    const { container } = render(
      <SplitListPanel search="" onSearchChange={onSearchChange}>
        <div />
      </SplitListPanel>
    );
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "홍길동" } });
    expect(onSearchChange).toHaveBeenCalledWith("홍길동");
  });

  it("search 값 있으면 · 지우기 X 버튼 · 클릭 시 빈 값", () => {
    const onSearchChange = vi.fn();
    const { container } = render(
      <SplitListPanel search="홍길동" onSearchChange={onSearchChange}>
        <div />
      </SplitListPanel>
    );
    const clearBtn = container.querySelector('button[aria-label="검색어 지우기"]') as HTMLButtonElement;
    expect(clearBtn).not.toBeNull();
    fireEvent.click(clearBtn);
    expect(onSearchChange).toHaveBeenCalledWith("");
  });

  it("searchPlaceholder · placeholder 반영", () => {
    const { container } = render(
      <SplitListPanel search="" onSearchChange={vi.fn()} searchPlaceholder="이름 검색">
        <div />
      </SplitListPanel>
    );
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.placeholder).toBe("이름 검색");
  });
});

describe("SplitListPanel · add 버튼", () => {
  it("onAdd 없으면 · 버튼 X", () => {
    const { container } = render(
      <SplitListPanel title="X">
        <div />
      </SplitListPanel>
    );
    // "신규 등록" 텍스트 없음
    expect(container.textContent).not.toContain("신규 등록");
  });

  it("onAdd 있으면 · + 버튼 표시 · 클릭 호출", () => {
    const onAdd = vi.fn();
    const { getByText } = render(
      <SplitListPanel title="X" onAdd={onAdd}>
        <div />
      </SplitListPanel>
    );
    const btn = getByText("신규 등록").closest("button")!;
    fireEvent.click(btn);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("addLabel · 라벨 커스텀", () => {
    const { getByText } = render(
      <SplitListPanel onAdd={vi.fn()} addLabel="상품 등록">
        <div />
      </SplitListPanel>
    );
    expect(getByText("상품 등록")).not.toBeNull();
  });
});

describe("SplitListPanel · loading/empty/error", () => {
  it("loading=true · Spinner + '불러오는 중' · children 미표시", () => {
    const { container, queryByTestId } = render(
      <SplitListPanel loading>
        <div data-testid="body">숨김</div>
      </SplitListPanel>
    );
    expect(container.textContent).toContain("불러오는 중");
    expect(queryByTestId("body")).toBeNull();
  });

  it("loadingLabel · 라벨 커스텀", () => {
    const { container } = render(
      <SplitListPanel loading loadingLabel="상품 조회 중...">
        <div />
      </SplitListPanel>
    );
    expect(container.textContent).toContain("상품 조회 중...");
  });

  it("empty=true · EmptyState · children 미표시", () => {
    const { container, queryByTestId } = render(
      <SplitListPanel empty emptyText="직원이 없습니다">
        <div data-testid="body">숨김</div>
      </SplitListPanel>
    );
    expect(container.textContent).toContain("직원이 없습니다");
    expect(queryByTestId("body")).toBeNull();
  });

  it("error · rose 카드 표시 · children 미표시", () => {
    const { container, queryByTestId } = render(
      <SplitListPanel error="서버 오류입니다">
        <div data-testid="body">숨김</div>
      </SplitListPanel>
    );
    expect(container.textContent).toContain("서버 오류입니다");
    expect(queryByTestId("body")).toBeNull();
  });

  it("loading > error > empty > children 우선순위", () => {
    // 3가지 동시 시나리오에서 · loading 우선
    const { container, queryByTestId } = render(
      <SplitListPanel loading error="error" empty>
        <div data-testid="body">x</div>
      </SplitListPanel>
    );
    expect(container.textContent).toContain("불러오는 중");
    expect(queryByTestId("body")).toBeNull();
  });
});

describe("SplitListPanel · filters + headerActions slot", () => {
  it("filters slot · 렌더", () => {
    const { getByTestId } = render(
      <SplitListPanel search="" onSearchChange={vi.fn()} filters={<div data-testid="filters">필터</div>}>
        <div />
      </SplitListPanel>
    );
    expect(getByTestId("filters")).not.toBeNull();
  });

  it("headerActions slot · 렌더", () => {
    const { getByTestId } = render(
      <SplitListPanel title="X" headerActions={<button data-testid="refresh">새로고침</button>}>
        <div />
      </SplitListPanel>
    );
    expect(getByTestId("refresh")).not.toBeNull();
  });
});
