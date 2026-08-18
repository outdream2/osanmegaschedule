// @vitest-environment jsdom
// 2026-08-18 · NotificationToast · dark toast · tone/position
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NotificationToast } from "./NotificationToast";

describe("NotificationToast · 기본 렌더", () => {
  it("message 표시 · role=status · aria-live=polite", () => {
    const { container } = render(<NotificationToast message="저장되었습니다" />);
    const div = container.firstElementChild!;
    expect(div.getAttribute("role")).toBe("status");
    expect(div.getAttribute("aria-live")).toBe("polite");
    expect(container.textContent).toContain("저장되었습니다");
  });

  it("기본 dark bg · white text · z-[9999]", () => {
    const { container } = render(<NotificationToast message="x" />);
    const div = container.firstElementChild!;
    expect(div.className).toContain("bg-zinc-900/95");
    expect(div.className).toContain("text-white");
    expect(div.className).toContain("z-[9999]");
  });

  it("dot 표시 · 기본 tone=emerald", () => {
    const { container } = render(<NotificationToast message="x" />);
    const dot = container.querySelector(".w-1\\.5.h-1\\.5.rounded-full");
    expect(dot).not.toBeNull();
    expect(dot!.className).toContain("bg-emerald-400");
  });
});

describe("NotificationToast · tone", () => {
  it("teal · bg-teal-400", () => {
    const { container } = render(<NotificationToast message="x" tone="teal" />);
    expect(container.querySelector(".rounded-full")!.className).toContain("bg-teal-400");
  });
  it("rose · bg-rose-400", () => {
    const { container } = render(<NotificationToast message="x" tone="rose" />);
    expect(container.querySelector(".rounded-full")!.className).toContain("bg-rose-400");
  });
});

describe("NotificationToast · position", () => {
  it("top-right (기본) · top-4 right-4", () => {
    const { container } = render(<NotificationToast message="x" />);
    const div = container.firstElementChild!;
    expect(div.className).toContain("top-4");
    expect(div.className).toContain("right-4");
  });
  it("bottom-center · bottom-6 left-1/2", () => {
    const { container } = render(<NotificationToast message="x" position="bottom-center" />);
    const div = container.firstElementChild!;
    expect(div.className).toContain("bottom-6");
    expect(div.className).toContain("left-1/2");
  });
});
