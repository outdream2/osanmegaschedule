// @vitest-environment jsdom
// 2026-08-19 · MobileOnlyGate · PC/mobile 게이트 · pageKey/minLevel/userLevel 3-way 조합
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MobileOnlyGate } from "./MobileOnlyGate";

// 훅 mock
let mockIsMobile = false;
let mockMinLevel = 0;

vi.mock("../../hooks/use-mobile", () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock("../../hooks/useMobilePageLevel", () => ({
  useMobilePageLevel: () => ({
    getMinLevel: (_key: string) => mockMinLevel,
  }),
}));

vi.mock("../layout/sideNavGroups", () => ({
  deriveUserLevel: (session: any) => session?.level ?? 0,
}));

beforeEach(() => {
  mockIsMobile = false;
  mockMinLevel = 0;
});

describe("MobileOnlyGate · 통과 케이스", () => {
  it("PC (isMobile=false) · 무조건 children 렌더", () => {
    mockIsMobile = false;
    mockMinLevel = 9;
    const { container } = render(
      <MobileOnlyGate pageKey="admin" authSession={{ level: 1 } as any}>
        <div data-testid="c">본문</div>
      </MobileOnlyGate>
    );
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
  });

  it("landing 페이지 · 모바일에서도 무조건 통과", () => {
    mockIsMobile = true;
    mockMinLevel = 9;
    const { container } = render(
      <MobileOnlyGate pageKey="landing" authSession={null}>
        <div data-testid="c">로그인</div>
      </MobileOnlyGate>
    );
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
  });

  it("minLevel=0 · 모바일이라도 통과 (모두 허용)", () => {
    mockIsMobile = true;
    mockMinLevel = 0;
    const { container } = render(
      <MobileOnlyGate pageKey="myPage" authSession={null}>
        <div data-testid="c">본문</div>
      </MobileOnlyGate>
    );
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
  });

  it("모바일 · userLevel >= minLevel · 통과", () => {
    mockIsMobile = true;
    mockMinLevel = 5;
    const { container } = render(
      <MobileOnlyGate pageKey="admin" authSession={{ level: 7 } as any}>
        <div data-testid="c">허용</div>
      </MobileOnlyGate>
    );
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
  });

  it("모바일 · userLevel == minLevel · 통과", () => {
    mockIsMobile = true;
    mockMinLevel = 5;
    const { container } = render(
      <MobileOnlyGate pageKey="admin" authSession={{ level: 5 } as any}>
        <div data-testid="c">경계</div>
      </MobileOnlyGate>
    );
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
  });
});

describe("MobileOnlyGate · 차단 케이스 · PC 전용 화면 표시", () => {
  it("모바일 · userLevel < minLevel · 차단 안내", () => {
    mockIsMobile = true;
    mockMinLevel = 5;
    const { container } = render(
      <MobileOnlyGate pageKey="admin" authSession={{ level: 3 } as any}>
        <div data-testid="c">본문</div>
      </MobileOnlyGate>
    );
    expect(container.querySelector('[data-testid="c"]')).toBeNull();
    expect(container.textContent).toContain("PC 전용 화면입니다");
  });

  it("모바일 · authSession null · 차단", () => {
    mockIsMobile = true;
    mockMinLevel = 5;
    const { container } = render(
      <MobileOnlyGate pageKey="admin" authSession={null}>
        <div data-testid="c">본문</div>
      </MobileOnlyGate>
    );
    expect(container.textContent).toContain("PC 전용 화면입니다");
    expect(container.textContent).toContain("데스크탑 브라우저");
  });

  it("차단 화면 · Monitor 아이콘 · svg 렌더", () => {
    mockIsMobile = true;
    mockMinLevel = 5;
    const { container } = render(
      <MobileOnlyGate pageKey="admin" authSession={null}>
        <div>x</div>
      </MobileOnlyGate>
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
