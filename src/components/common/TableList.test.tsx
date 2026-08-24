// @vitest-environment jsdom
// 2026-08-24 · v3 리스트 UI 프레임워크 · TableList 프리미티브 tests
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TableListWrap, tableHeadCls, tableThCls, tableTdCls } from "./TableList";

describe("TableListWrap · wrapper", () => {
  it("children 렌더", () => {
    const { container } = render(
      <TableListWrap><div data-testid="child">x</div></TableListWrap>,
    );
    expect(container.querySelector('[data-testid="child"]')).not.toBeNull();
  });

  it("topAccent 기본 true · gradient span 렌더", () => {
    const { container } = render(<TableListWrap><div /></TableListWrap>);
    const span = container.querySelector("span[aria-hidden]");
    expect(span).not.toBeNull();
    expect(span!.className).toContain("bg-gradient-to-r");
  });

  it("topAccent false · gradient span 미렌더", () => {
    const { container } = render(
      <TableListWrap topAccent={false}><div /></TableListWrap>,
    );
    expect(container.querySelector("span[aria-hidden]")).toBeNull();
  });

  it("loading true · opacity-40 · pointer-events-none", () => {
    const { container } = render(
      <TableListWrap loading><div /></TableListWrap>,
    );
    const wrap = container.firstChild as HTMLElement;
    expect(wrap.className).toContain("opacity-40");
    expect(wrap.className).toContain("pointer-events-none");
  });

  it("maxHeight custom · style 적용", () => {
    const { container } = render(
      <TableListWrap maxHeight="60vh"><div /></TableListWrap>,
    );
    const wrap = container.firstChild as HTMLElement;
    expect(wrap.style.maxHeight).toBe("60vh");
  });
});

describe("tableHeadCls · 헬퍼", () => {
  it("기본 · v3 표준 클래스 반환", () => {
    const cls = tableHeadCls();
    expect(cls).toContain("sticky");
    expect(cls).toContain("bg-zinc-100/70");
    expect(cls).toContain("uppercase");
    expect(cls).toContain("font-bold");
  });
  it("extra · 추가 클래스 병합", () => {
    const cls = tableHeadCls("my-extra");
    expect(cls).toContain("my-extra");
  });
});

describe("tableThCls · 정렬 방향", () => {
  it("기본 left · text-left", () => {
    expect(tableThCls()).toContain("text-left");
  });
  it("num · text-right", () => {
    expect(tableThCls("num")).toContain("text-right");
  });
  it("center · text-center", () => {
    expect(tableThCls("center")).toContain("text-center");
  });
});

describe("tableTdCls · 정렬 + tabular-nums (num)", () => {
  it("num · text-right tabular-nums", () => {
    const cls = tableTdCls("num");
    expect(cls).toContain("text-right");
    expect(cls).toContain("tabular-nums");
  });
  it("center · text-center", () => {
    expect(tableTdCls("center")).toContain("text-center");
  });
});
