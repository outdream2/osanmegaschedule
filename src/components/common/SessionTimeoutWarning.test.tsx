// @vitest-environment jsdom
// 2026-08-19 · SessionTimeoutWarning · countdown · urgent 스타일 · onExtend/onLogout
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { SessionTimeoutWarning } from "./SessionTimeoutWarning";

describe("SessionTimeoutWarning · 기본", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("role=alertdialog · aria-label 반영", () => {
    const { container } = render(
      <SessionTimeoutWarning initialSeconds={180} onExtend={() => {}} onLogout={() => {}} />
    );
    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("aria-label")).toBe("세션 만료 경고");
  });

  it("헤더 · 세션 만료 임박 표시", () => {
    const { container } = render(
      <SessionTimeoutWarning initialSeconds={180} onExtend={() => {}} onLogout={() => {}} />
    );
    expect(container.textContent).toContain("세션 만료 임박");
  });

  it("countdown · 3:00 형식", () => {
    const { container } = render(
      <SessionTimeoutWarning initialSeconds={180} onExtend={() => {}} onLogout={() => {}} />
    );
    expect(container.textContent).toContain("3:00");
  });

  it("countdown · 59초 · 0:59 (앞 0 있음)", () => {
    const { container } = render(
      <SessionTimeoutWarning initialSeconds={59} onExtend={() => {}} onLogout={() => {}} />
    );
    expect(container.textContent).toContain("0:59");
  });

  it("countdown · 0 · 0:00", () => {
    const { container } = render(
      <SessionTimeoutWarning initialSeconds={0} onExtend={() => {}} onLogout={() => {}} />
    );
    expect(container.textContent).toContain("0:00");
  });
});

describe("SessionTimeoutWarning · urgent 스타일 (60초 이하)", () => {
  it("61초 · 일반 · yellow tone", () => {
    const { container } = render(
      <SessionTimeoutWarning initialSeconds={61} onExtend={() => {}} onLogout={() => {}} />
    );
    const dialog = container.querySelector('[role="alertdialog"]')!;
    expect(dialog.className).toContain("bg-gray-900");
    expect(dialog.className).not.toContain("bg-red-950");
  });

  it("60초 · urgent · red tone", () => {
    const { container } = render(
      <SessionTimeoutWarning initialSeconds={60} onExtend={() => {}} onLogout={() => {}} />
    );
    const dialog = container.querySelector('[role="alertdialog"]')!;
    expect(dialog.className).toContain("bg-red-950");
  });

  it("30초 · urgent · red button", () => {
    const { container } = render(
      <SessionTimeoutWarning initialSeconds={30} onExtend={() => {}} onLogout={() => {}} />
    );
    const btns = container.querySelectorAll("button");
    const extendBtn = Array.from(btns).find((b) => b.textContent?.trim() === "계속 사용")!;
    expect(extendBtn.className).toContain("bg-red-500");
  });
});

describe("SessionTimeoutWarning · 이벤트", () => {
  it("계속 사용 · onExtend", () => {
    const onExtend = vi.fn();
    const { container } = render(
      <SessionTimeoutWarning initialSeconds={180} onExtend={onExtend} onLogout={() => {}} />
    );
    const btn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "계속 사용"
    )!;
    fireEvent.click(btn);
    expect(onExtend).toHaveBeenCalledTimes(1);
  });

  it("로그아웃 · onLogout", () => {
    const onLogout = vi.fn();
    const { container } = render(
      <SessionTimeoutWarning initialSeconds={180} onExtend={() => {}} onLogout={onLogout} />
    );
    const btn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "로그아웃"
    )!;
    fireEvent.click(btn);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("X 버튼 · onExtend (경고 닫기 = 세션 연장)", () => {
    const onExtend = vi.fn();
    const { container } = render(
      <SessionTimeoutWarning initialSeconds={180} onExtend={onExtend} onLogout={() => {}} />
    );
    const closeBtn = container.querySelector('button[aria-label="경고 닫기"]')!;
    fireEvent.click(closeBtn);
    expect(onExtend).toHaveBeenCalledTimes(1);
  });
});

describe("SessionTimeoutWarning · 카운트다운", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("1초 지날 때마다 · countdown 감소", () => {
    const { container } = render(
      <SessionTimeoutWarning initialSeconds={10} onExtend={() => {}} onLogout={() => {}} />
    );
    expect(container.textContent).toContain("0:10");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.textContent).toContain("0:09");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.textContent).toContain("0:06");
  });

  it("0 도달 시 · 정지 (더 이상 감소 안 함)", () => {
    const { container } = render(
      <SessionTimeoutWarning initialSeconds={2} onExtend={() => {}} onLogout={() => {}} />
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container.textContent).toContain("0:00");
  });
});
