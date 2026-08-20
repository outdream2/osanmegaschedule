// @vitest-environment jsdom
// 2026-08-20 · SeasonButtons · 4계절 토글 버튼
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SeasonButtons } from "./SeasonButtons";

describe("SeasonButtons · 렌더", () => {
  it("4개 버튼 · 봄/여름/가을/겨울", () => {
    const { container } = render(<SeasonButtons value={null} onChange={() => {}} />);
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(4);
    const text = container.textContent ?? "";
    expect(text).toContain("봄");
    expect(text).toContain("여름");
    expect(text).toContain("가을");
    expect(text).toContain("겨울");
  });

  it("이모지 · 🌸☀️🍁❄️ 포함", () => {
    const { container } = render(<SeasonButtons value={null} onChange={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain("🌸");
    expect(text).toContain("☀️");
    expect(text).toContain("🍁");
    expect(text).toContain("❄️");
  });

  it("label 기본 · '계절' 표시", () => {
    const { container } = render(<SeasonButtons value={null} onChange={() => {}} />);
    expect(container.textContent).toContain("계절");
  });

  it("hideLabel=true · 라벨 미표시", () => {
    const { container } = render(<SeasonButtons value={null} onChange={() => {}} hideLabel />);
    expect(container.textContent).not.toContain("계절");
  });

  it("label='' · 라벨 미표시", () => {
    const { container } = render(<SeasonButtons value={null} onChange={() => {}} label="" />);
    // 커스텀 라벨 없음
    expect(container.textContent).not.toContain("계절 ");
  });

  it("커스텀 label", () => {
    const { container } = render(<SeasonButtons value={null} onChange={() => {}} label="시즌" />);
    expect(container.textContent).toContain("시즌");
  });
});

describe("SeasonButtons · onChange 동작", () => {
  it("비선택 상태 · 봄 클릭 → 'spring'", () => {
    const onChange = vi.fn();
    const { container } = render(<SeasonButtons value={null} onChange={onChange} />);
    const springBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("봄")
    );
    expect(springBtn).toBeDefined();
    fireEvent.click(springBtn!);
    expect(onChange).toHaveBeenCalledWith("spring");
  });

  it("여름 클릭 → 'summer'", () => {
    const onChange = vi.fn();
    const { container } = render(<SeasonButtons value={null} onChange={onChange} />);
    const btn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("여름")
    );
    fireEvent.click(btn!);
    expect(onChange).toHaveBeenCalledWith("summer");
  });

  it("선택된 계절 · 다시 클릭 → null (토글 해제)", () => {
    const onChange = vi.fn();
    const { container } = render(<SeasonButtons value="spring" onChange={onChange} />);
    const btn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("봄")
    );
    fireEvent.click(btn!);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("다른 계절 클릭 · 새 계절 반환", () => {
    const onChange = vi.fn();
    const { container } = render(<SeasonButtons value="spring" onChange={onChange} />);
    const winterBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("겨울")
    );
    fireEvent.click(winterBtn!);
    expect(onChange).toHaveBeenCalledWith("winter");
  });
});

describe("SeasonButtons · active 스타일 · title 안내", () => {
  it("선택된 버튼 · brand-deep 배경", () => {
    const { container } = render(<SeasonButtons value="autumn" onChange={() => {}} />);
    const btn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("가을")
    )!;
    expect(btn.className).toContain("bg-brand-deep");
  });

  it("비선택 · brand-deep 배경 없음", () => {
    const { container } = render(<SeasonButtons value={null} onChange={() => {}} />);
    const btn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("가을")
    )!;
    expect(btn.className).not.toContain("bg-brand-deep");
  });

  it("선택된 버튼 · title · '다시 클릭 → 해제' 안내", () => {
    const { container } = render(<SeasonButtons value="spring" onChange={() => {}} />);
    const btn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("봄")
    )!;
    expect(btn.getAttribute("title")).toContain("다시 클릭");
  });
});

describe("SeasonButtons · size", () => {
  it("size='sm' · h-7 클래스", () => {
    const { container } = render(<SeasonButtons value={null} onChange={() => {}} size="sm" />);
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("h-7");
  });

  it("size='md' (기본) · h-8 클래스", () => {
    const { container } = render(<SeasonButtons value={null} onChange={() => {}} />);
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("h-8");
  });
});
