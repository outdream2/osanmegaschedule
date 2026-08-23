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

// 2026-08-23 · v2 확장 · countDisplay · footer · bodyClassName
describe("SplitListPanel · v2 · countDisplay 커스텀 표시", () => {
  it("countDisplay · count StatusPill 대체 · 복합 표시 (예: '3/50')", () => {
    const { container } = render(
      <SplitListPanel title="직원" count={100} countDisplay={<span data-testid="cd">3/100</span>}>
        <div />
      </SplitListPanel>
    );
    expect(container.querySelector('[data-testid="cd"]')).not.toBeNull();
    expect(container.textContent).toContain("3/100");
    // count StatusPill 은 렌더 안 됨 (countDisplay 우선)
    const zincPill = container.querySelector(".bg-zinc-100");
    expect(zincPill).toBeNull();
  });

  it("countDisplay 없으면 · count StatusPill 표시 (기본 동작 유지)", () => {
    const { container } = render(
      <SplitListPanel title="X" count={5}>
        <div />
      </SplitListPanel>
    );
    expect(container.textContent).toContain("5");
    // count StatusPill 존재
    const zincPill = container.querySelector(".bg-zinc-100");
    expect(zincPill).not.toBeNull();
  });
});

describe("SplitListPanel · v2 · footer 슬롯", () => {
  it("footer · body 아래 · shrink-0 border-t 렌더", () => {
    const { container } = render(
      <SplitListPanel footer={<button data-testid="fb">신규 등록</button>}>
        <div />
      </SplitListPanel>
    );
    expect(container.querySelector('[data-testid="fb"]')).not.toBeNull();
    expect(container.textContent).toContain("신규 등록");
  });

  it("footer 없으면 · 하단 border 없음", () => {
    const { container } = render(
      <SplitListPanel>
        <div />
      </SplitListPanel>
    );
    // footer div 는 border-t border-line + shrink-0 이어야 · 없어야 함
    const footerDiv = container.querySelector(".border-t.border-line.bg-white:not(.border-b)");
    expect(footerDiv).toBeNull();
  });
});

describe("SplitListPanel · v2 · bodyClassName override", () => {
  it("bodyClassName 지정 · body div 클래스 대체", () => {
    const { container } = render(
      <SplitListPanel bodyClassName="custom-body-cls">
        <div />
      </SplitListPanel>
    );
    expect(container.querySelector(".custom-body-cls")).not.toBeNull();
    // 기본 클래스 없음
    expect(container.querySelector(".flex-1.min-h-0.overflow-y-auto")).toBeNull();
  });

  it("bodyClassName 미지정 · 기본 flex-1 min-h-0 overflow-y-auto", () => {
    const { container } = render(
      <SplitListPanel>
        <div />
      </SplitListPanel>
    );
    expect(container.querySelector(".flex-1.min-h-0.overflow-y-auto")).not.toBeNull();
  });
});

// 2026-08-23 · v3 확장 · subHeader (header ↔ body 사이 KPI/부가정보 슬롯)
describe("SplitListPanel · v3 · subHeader 슬롯", () => {
  it("subHeader · header 아래 body 위 · 렌더", () => {
    const { container } = render(
      <SplitListPanel title="X" subHeader={<div data-testid="sh">총잔고 100원 · 최근결제 오늘</div>}>
        <div />
      </SplitListPanel>
    );
    expect(container.querySelector('[data-testid="sh"]')).not.toBeNull();
    expect(container.textContent).toContain("총잔고 100원");
  });

  it("subHeader 없음 · 렌더 없음", () => {
    const { container } = render(
      <SplitListPanel title="X">
        <div />
      </SplitListPanel>
    );
    // subHeader div (shrink-0) 없음
    const shDivs = container.querySelectorAll(".modal-card > .shrink-0");
    // header 는 shrink-0 (px-3.5 py-2.5) · footer 도 shrink-0 · subHeader 만 있으면 pure shrink-0
    // header 는 border-b 있어야 · 다른 것과 구별
    const pureSh = Array.from(container.querySelectorAll(".shrink-0")).find(el =>
      !el.className.includes("border-b") &&
      !el.className.includes("border-t") &&
      !el.className.includes("px-3.5")
    );
    expect(pureSh).toBeUndefined();
    void shDivs;
  });

  it("subHeader · header + subHeader + body · 순서 유지", () => {
    const { container } = render(
      <SplitListPanel title="X" subHeader={<div data-testid="sh">SUB</div>} footer={<div data-testid="ft">FT</div>}>
        <div data-testid="body">BODY</div>
      </SplitListPanel>
    );
    // 순서 · header (border-b) → subHeader → body → footer (border-t)
    const root = container.firstElementChild!;
    const children = Array.from(root.children);
    // 최소 4개 (header + subHeader + body + footer)
    expect(children.length).toBe(4);
    expect(children[1].textContent).toContain("SUB");
    expect(children[2].textContent).toContain("BODY");
    expect(children[3].textContent).toContain("FT");
  });
});
