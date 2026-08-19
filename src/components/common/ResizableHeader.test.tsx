// @vitest-environment jsdom
// 2026-08-19 · ResizableTh · width/align/onClick/colSpan/resize handle
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ResizableTh } from "./ResizableHeader";

const defaultResizerProps = {
  onMouseDown: vi.fn(),
  onTouchStart: vi.fn(),
  role: "separator" as const,
  "aria-label": "컬럼 리사이즈",
  style: {},
};

function wrap(ui: React.ReactNode) {
  return <table><thead><tr>{ui}</tr></thead></table>;
}

describe("ResizableTh · 기본", () => {
  it("children 렌더 · th 태그", () => {
    const { container } = render(wrap(
      <ResizableTh width={100} resizerProps={defaultResizerProps}>이름</ResizableTh>
    ));
    const th = container.querySelector("th");
    expect(th).not.toBeNull();
    expect(th!.textContent).toContain("이름");
  });

  it("width · style 반영 (width/minWidth/maxWidth 모두)", () => {
    const { container } = render(wrap(
      <ResizableTh width={200} resizerProps={defaultResizerProps}>x</ResizableTh>
    ));
    const th = container.querySelector("th") as HTMLElement;
    expect(th.style.width).toBe("200px");
    expect(th.style.minWidth).toBe("200px");
    expect(th.style.maxWidth).toBe("200px");
  });

  it("리사이즈 핸들 · 우측 · role=separator", () => {
    const { container } = render(wrap(
      <ResizableTh width={100} resizerProps={defaultResizerProps}>x</ResizableTh>
    ));
    const handle = container.querySelector('[role="separator"]');
    expect(handle).not.toBeNull();
    expect(handle!.getAttribute("aria-label")).toBe("컬럼 리사이즈");
  });
});

describe("ResizableTh · align", () => {
  it("left (기본) · text-left", () => {
    const { container } = render(wrap(
      <ResizableTh width={100} resizerProps={defaultResizerProps}>x</ResizableTh>
    ));
    expect(container.querySelector("th")!.className).toContain("text-left");
  });
  it("center · text-center", () => {
    const { container } = render(wrap(
      <ResizableTh width={100} resizerProps={defaultResizerProps} align="center">x</ResizableTh>
    ));
    expect(container.querySelector("th")!.className).toContain("text-center");
  });
  it("right · text-right", () => {
    const { container } = render(wrap(
      <ResizableTh width={100} resizerProps={defaultResizerProps} align="right">x</ResizableTh>
    ));
    expect(container.querySelector("th")!.className).toContain("text-right");
  });
});

describe("ResizableTh · 이벤트", () => {
  it("th onClick · 호출", () => {
    const onClick = vi.fn();
    const { container } = render(wrap(
      <ResizableTh width={100} resizerProps={defaultResizerProps} onClick={onClick}>x</ResizableTh>
    ));
    fireEvent.click(container.querySelector("th")!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("리사이즈 핸들 onMouseDown · resizerProps 콜백 호출", () => {
    const onMouseDown = vi.fn();
    const rprops = { ...defaultResizerProps, onMouseDown };
    const { container } = render(wrap(
      <ResizableTh width={100} resizerProps={rprops}>x</ResizableTh>
    ));
    fireEvent.mouseDown(container.querySelector('[role="separator"]')!);
    expect(onMouseDown).toHaveBeenCalledTimes(1);
  });

  it("리사이즈 핸들 onTouchStart · 콜백 호출", () => {
    const onTouchStart = vi.fn();
    const rprops = { ...defaultResizerProps, onTouchStart };
    const { container } = render(wrap(
      <ResizableTh width={100} resizerProps={rprops}>x</ResizableTh>
    ));
    fireEvent.touchStart(container.querySelector('[role="separator"]')!);
    expect(onTouchStart).toHaveBeenCalledTimes(1);
  });
});

describe("ResizableTh · colSpan/rowSpan/title/className", () => {
  it("colSpan · 반영", () => {
    const { container } = render(wrap(
      <ResizableTh width={100} resizerProps={defaultResizerProps} colSpan={2}>x</ResizableTh>
    ));
    expect(container.querySelector("th")!.getAttribute("colspan")).toBe("2");
  });

  it("rowSpan · 반영", () => {
    const { container } = render(wrap(
      <ResizableTh width={100} resizerProps={defaultResizerProps} rowSpan={3}>x</ResizableTh>
    ));
    expect(container.querySelector("th")!.getAttribute("rowspan")).toBe("3");
  });

  it("title · tooltip 반영", () => {
    const { container } = render(wrap(
      <ResizableTh width={100} resizerProps={defaultResizerProps} title="컬럼 정렬">x</ResizableTh>
    ));
    expect(container.querySelector("th")!.getAttribute("title")).toBe("컬럼 정렬");
  });

  it("className 병합", () => {
    const { container } = render(wrap(
      <ResizableTh width={100} resizerProps={defaultResizerProps} className="bg-zinc-50">x</ResizableTh>
    ));
    expect(container.querySelector("th")!.className).toContain("bg-zinc-50");
  });
});
