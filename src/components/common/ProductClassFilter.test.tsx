// @vitest-environment jsdom
// 2026-08-19 · ProductClassFilter · value/onChange + 3 옵션 + label/counts/compact
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ProductClassFilter } from "./ProductClassFilter";

describe("ProductClassFilter · 3 옵션", () => {
  it("3 버튼 렌더 · all/stationery/general", () => {
    const { container } = render(
      <ProductClassFilter value="all" onChange={() => {}} />
    );
    const btns = container.querySelectorAll("button");
    expect(btns.length).toBe(3);
  });

  it("role=group · aria-label", () => {
    const { container } = render(<ProductClassFilter value="all" onChange={() => {}} />);
    const group = container.querySelector('[role="group"]');
    expect(group!.getAttribute("aria-label")).toBe("상품 구분 필터");
  });

  it("value=all · 첫 버튼 active · aria-pressed=true", () => {
    const { container } = render(<ProductClassFilter value="all" onChange={() => {}} />);
    const btns = container.querySelectorAll("button");
    expect(btns[0].getAttribute("aria-pressed")).toBe("true");
    expect(btns[1].getAttribute("aria-pressed")).toBe("false");
  });

  it("value=stationery · 두번째 버튼 active", () => {
    const { container } = render(<ProductClassFilter value="stationery" onChange={() => {}} />);
    const btns = container.querySelectorAll("button");
    expect(btns[1].getAttribute("aria-pressed")).toBe("true");
  });

  it("value=general · 세번째 버튼 active", () => {
    const { container } = render(<ProductClassFilter value="general" onChange={() => {}} />);
    const btns = container.querySelectorAll("button");
    expect(btns[2].getAttribute("aria-pressed")).toBe("true");
  });
});

describe("ProductClassFilter · onChange", () => {
  it("클릭 시 · onChange · 해당 key 전달", () => {
    const onChange = vi.fn();
    const { container } = render(<ProductClassFilter value="all" onChange={onChange} />);
    fireEvent.click(container.querySelectorAll("button")[1]);
    expect(onChange).toHaveBeenCalledWith("stationery");
  });

  it("all 클릭 · onChange('all')", () => {
    const onChange = vi.fn();
    const { container } = render(<ProductClassFilter value="stationery" onChange={onChange} />);
    fireEvent.click(container.querySelectorAll("button")[0]);
    expect(onChange).toHaveBeenCalledWith("all");
  });
});

describe("ProductClassFilter · label", () => {
  it("기본 · 구분 라벨 표시", () => {
    const { container } = render(<ProductClassFilter value="all" onChange={() => {}} />);
    expect(container.textContent).toContain("구분");
  });

  it("커스텀 label", () => {
    const { container } = render(<ProductClassFilter value="all" onChange={() => {}} label="필터" />);
    expect(container.textContent).toContain("필터");
  });

  it("빈 label · 라벨 숨김", () => {
    const { container } = render(<ProductClassFilter value="all" onChange={() => {}} label="" />);
    const labelEl = container.querySelector(".uppercase");
    expect(labelEl).toBeNull();
  });
});

describe("ProductClassFilter · counts", () => {
  it("counts 없으면 · 뱃지 없음", () => {
    const { container } = render(<ProductClassFilter value="all" onChange={() => {}} />);
    // count 배지는 text-[10px] font-bold 라 · 존재 검증
    const badge = container.querySelector(".tabular-nums.text-\\[10px\\]");
    expect(badge).toBeNull();
  });

  it("counts 지정 · 뱃지 렌더", () => {
    const { container } = render(
      <ProductClassFilter value="all" onChange={() => {}} counts={{ all: 100, stationery: 30, general: 70 }} />
    );
    expect(container.textContent).toContain("100");
    expect(container.textContent).toContain("30");
    expect(container.textContent).toContain("70");
  });

  it("일부 counts만 · 해당 버튼만 뱃지", () => {
    const { container } = render(
      <ProductClassFilter value="all" onChange={() => {}} counts={{ all: 100 }} />
    );
    expect(container.textContent).toContain("100");
  });
});

describe("ProductClassFilter · compactOnMobile", () => {
  it("compactOnMobile=true · 텍스트 hidden sm:inline", () => {
    const { container } = render(
      <ProductClassFilter value="all" onChange={() => {}} compactOnMobile />
    );
    const hiddenSm = container.querySelectorAll(".hidden.sm\\:inline");
    expect(hiddenSm.length).toBe(3);
  });

  it("compactOnMobile=false (기본) · 텍스트 항상 표시", () => {
    const { container } = render(<ProductClassFilter value="all" onChange={() => {}} />);
    const hiddenSm = container.querySelectorAll(".hidden.sm\\:inline");
    expect(hiddenSm.length).toBe(0);
  });
});

describe("ProductClassFilter · className", () => {
  it("className 병합", () => {
    const { container } = render(
      <ProductClassFilter value="all" onChange={() => {}} className="ml-4" />
    );
    expect(container.firstElementChild!.className).toContain("ml-4");
  });
});
