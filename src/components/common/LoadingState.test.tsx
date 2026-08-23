// @vitest-environment jsdom
// 2026-08-19 · LoadingState · spinner + skeleton + size + tone + label
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LoadingState } from "./LoadingState";

describe("LoadingState · 기본 (spinner)", () => {
  it("기본 · Loader2 svg + role=status + aria-live=polite", () => {
    const { container } = render(<LoadingState />);
    expect(container.querySelector("svg")).not.toBeNull();
    const root = container.firstElementChild!;
    expect(root.getAttribute("role")).toBe("status");
    expect(root.getAttribute("aria-live")).toBe("polite");
  });

  it("기본 라벨 · 로딩 중...", () => {
    const { container } = render(<LoadingState />);
    expect(container.textContent).toContain("로딩 중...");
  });

  it("커스텀 라벨 반영", () => {
    const { container } = render(<LoadingState label="데이터 로딩 중..." />);
    expect(container.textContent).toContain("데이터 로딩 중...");
  });

  it("spinner · animate-spin", () => {
    const { container } = render(<LoadingState />);
    const svg = container.querySelector("svg")!;
    expect(svg.classList.contains("animate-spin")).toBe(true);
  });
});

describe("LoadingState · size", () => {
  it("compact · py-6", () => {
    const { container } = render(<LoadingState size="compact" />);
    expect(container.firstElementChild!.className).toContain("py-6");
  });
  it("normal (기본) · py-12", () => {
    const { container } = render(<LoadingState />);
    expect(container.firstElementChild!.className).toContain("py-12");
  });
  it("large · py-20", () => {
    const { container } = render(<LoadingState size="large" />);
    expect(container.firstElementChild!.className).toContain("py-20");
  });
});

describe("LoadingState · tone", () => {
  // 2026-08-23 · Spinner primitive 마이그레이션 · SVG는 Spinner의 SPINNER_TONE 매핑 사용
  //   · slate → "zinc" → text-zinc-400 · indigo → "brand" → text-brand-deep
  //   · label span 은 여전히 TONE_CLS 사용 (text-ink-soft 유지)
  it("slate (기본) · SVG text-zinc-400 · label text-ink-soft", () => {
    const { container } = render(<LoadingState />);
    const svg = container.querySelector("svg")!;
    expect(svg.classList.contains("text-zinc-400")).toBe(true);
    // label span · text-ink-soft 유지 확인
    const label = container.querySelector(".text-ink-soft");
    expect(label).not.toBeNull();
  });
  it("indigo · SVG text-brand-deep", () => {
    const { container } = render(<LoadingState tone="indigo" />);
    const svg = container.querySelector("svg")!;
    expect(svg.classList.contains("text-brand-deep")).toBe(true);
  });
});

describe("LoadingState · skeleton", () => {
  it("skeleton=true · svg 없음 (spinner 미렌더)", () => {
    const { container } = render(<LoadingState skeleton />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("skeleton=true · 기본 3행", () => {
    const { container } = render(<LoadingState skeleton />);
    const rows = container.querySelectorAll(".h-4.rounded-md");
    expect(rows.length).toBe(3);
  });

  it("skeleton · rows=5 · 5행", () => {
    const { container } = render(<LoadingState skeleton rows={5} />);
    const rows = container.querySelectorAll(".h-4.rounded-md");
    expect(rows.length).toBe(5);
  });

  it("skeleton · aria-label=로딩 중", () => {
    const { container } = render(<LoadingState skeleton />);
    expect(container.firstElementChild!.getAttribute("aria-label")).toBe("로딩 중");
  });
});

describe("LoadingState · className", () => {
  it("className 병합", () => {
    const { container } = render(<LoadingState className="my-4" />);
    expect(container.firstElementChild!.className).toContain("my-4");
  });
});
