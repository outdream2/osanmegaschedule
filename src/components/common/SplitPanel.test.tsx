// @vitest-environment jsdom
// 2026-08-19 · SplitPanel · storage/desktop-mobile/모달/ESC · 최소 검증 (드래그·리사이즈는 이벤트 mock 어려움)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SplitPanel } from "./SplitPanel";

beforeEach(() => {
  localStorage.clear();
  // 데스크탑 모드 (lg 이상)
  Object.defineProperty(window, "innerWidth", { writable: true, value: 1280 });
});

const rendered = (props: Partial<Parameters<typeof SplitPanel>[0]> = {}) =>
  render(
    <SplitPanel
      storageKey="test.key"
      left={<div data-testid="L">left</div>}
      right={<div data-testid="R">right</div>}
      {...props}
    />
  );

describe("SplitPanel · 기본 렌더", () => {
  it("left + right 렌더 (데스크탑)", () => {
    const { container } = rendered();
    expect(container.querySelector('[data-testid="L"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="R"]')).not.toBeNull();
  });

  it("aside + section 태그", () => {
    const { container } = rendered();
    expect(container.querySelector("aside")).not.toBeNull();
    expect(container.querySelector("section")).not.toBeNull();
  });

  it("divider 렌더 (드래그 핸들)", () => {
    const { container } = rendered();
    expect(container.querySelector(".split-divider")).not.toBeNull();
  });
});

describe("SplitPanel · 폭 저장 (localStorage)", () => {
  it("초기 폭 · defaultWidth · aside width 반영", () => {
    const { container } = rendered({ defaultWidth: 300 });
    const aside = container.querySelector("aside") as HTMLElement;
    expect(aside.style.width).toBe("300px");
  });

  it("localStorage 저장값 우선 · defaultWidth 무시", () => {
    localStorage.setItem("megatown_test.key", "420");
    const { container } = rendered({ defaultWidth: 300 });
    const aside = container.querySelector("aside") as HTMLElement;
    expect(aside.style.width).toBe("420px");
  });

  it("localStorage 값이 min/max 범위 밖 · defaultWidth 로 fallback", () => {
    localStorage.setItem("megatown_test.key", "10000");
    const { container } = rendered({ defaultWidth: 300, minWidth: 100, maxWidth: 500 });
    const aside = container.querySelector("aside") as HTMLElement;
    expect(aside.style.width).toBe("300px");
  });
});

describe("SplitPanel · 모바일 모달 (mobileRightAsModal=true 기본)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 500 });
  });

  it("데스크탑 아님 + mobileOpen=false · 모달 없음", () => {
    const { container } = rendered({ mobileOpen: false, onMobileClose: () => {} });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("데스크탑 아님 + mobileOpen=true · 모달 렌더", () => {
    const { container } = rendered({ mobileOpen: true, onMobileClose: () => {}, mobileModalTitle: "상세" });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain("상세");
  });

  it("모바일 · 우측 section 미렌더 (모달로 이관)", () => {
    const { container } = rendered({ mobileOpen: false, onMobileClose: () => {} });
    expect(container.querySelector("section")).toBeNull();
  });

  it("모달 · X 버튼 클릭 · onMobileClose 호출", () => {
    const onMobileClose = vi.fn();
    const { container } = rendered({ mobileOpen: true, onMobileClose, mobileModalTitle: "x" });
    const closeBtn = container.querySelector('button[aria-label="닫기"]')!;
    fireEvent.click(closeBtn);
    expect(onMobileClose).toHaveBeenCalledTimes(1);
  });

  it("모달 · ESC · onMobileClose", () => {
    const onMobileClose = vi.fn();
    rendered({ mobileOpen: true, onMobileClose, mobileModalTitle: "x" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onMobileClose).toHaveBeenCalledTimes(1);
  });

  it("모달 · backdrop 클릭 · onMobileClose", () => {
    const onMobileClose = vi.fn();
    const { container } = rendered({ mobileOpen: true, onMobileClose, mobileModalTitle: "x" });
    const backdrop = container.querySelector('[role="dialog"]')!;
    fireEvent.click(backdrop);
    expect(onMobileClose).toHaveBeenCalledTimes(1);
  });
});

describe("SplitPanel · mobileRightAsModal=false", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 500 });
  });

  it("모바일에서 · 우측 section 함께 렌더 (모달 없음)", () => {
    const { container } = rendered({ mobileRightAsModal: false });
    expect(container.querySelector("section")).not.toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
