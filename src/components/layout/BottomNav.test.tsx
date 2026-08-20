// @vitest-environment jsdom
// 2026-08-20 · BottomNav · 모바일 하단 5탭 · 더보기 sheet
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { BottomNav } from "./BottomNav";
import type { AuthSession } from "../../types";

const employeeSession: AuthSession = { employeeId: 1, name: "직원", role: "employee", level: 1 } as any;
const managerSession: AuthSession = { employeeId: 2, name: "매니저", role: "manager", level: 2 } as any;
const adminSession: AuthSession = { employeeId: 9, name: "관리자", role: "admin", level: 9 } as any;

describe("BottomNav · 5탭 렌더", () => {
  it("홈·스케줄·요청·이슈·더보기", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={null} onNavigate={() => {}} />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("홈");
    expect(text).toContain("스케줄");
    expect(text).toContain("요청");
    expect(text).toContain("이슈");
    expect(text).toContain("더보기");
  });

  it("모바일 전용 · sm:hidden 클래스", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={null} onNavigate={() => {}} />
    );
    const nav = container.querySelector("nav");
    expect(nav?.className).toContain("sm:hidden");
  });
});

describe("BottomNav · onNavigate", () => {
  it("스케줄 탭 클릭 · onNavigate('schedule')", () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={null} onNavigate={onNavigate} />
    );
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("스케줄"))!;
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledWith("schedule");
  });

  it("요청 탭 클릭 · onNavigate('requests')", () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={null} onNavigate={onNavigate} />
    );
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("요청"))!;
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledWith("requests");
  });
});

describe("BottomNav · 더보기 sheet", () => {
  it("더보기 클릭 · sheet 열림", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={employeeSession} onNavigate={() => {}} />
    );
    // 처음엔 sheet 없음
    expect(container.textContent).not.toMatch(/점심불참|상품스캔/);

    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);

    // sheet 안 항목
    expect(container.textContent).toContain("점심불참");
    expect(container.textContent).toContain("상품스캔");
  });

  it("employee 세션 · 매장관리 (관리자 전용) 미노출", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={employeeSession} onNavigate={() => {}} />
    );
    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);
    expect(container.textContent).not.toContain("매장관리");
    expect(container.textContent).not.toContain("연차승인");
  });

  it("manager 세션 · 매장관리·연차승인·상품관리·거래명세서·입고알림 노출", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={managerSession} onNavigate={() => {}} />
    );
    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);
    expect(container.textContent).toContain("매장관리");
    expect(container.textContent).toContain("연차승인");
    expect(container.textContent).toContain("입고알림");
  });

  it("admin(lv9) · 권한관리 노출", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={adminSession} onNavigate={() => {}} />
    );
    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);
    expect(container.textContent).toContain("권한관리");
  });

  it("manager (lv2) · 권한관리 미노출 (lv9 전용)", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={managerSession} onNavigate={() => {}} />
    );
    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);
    expect(container.textContent).not.toContain("권한관리");
  });

  it("onLogout · 로그아웃 타일 노출", () => {
    const onLogout = vi.fn();
    const { container } = render(
      <BottomNav
        activePage={"landing" as any}
        authSession={employeeSession}
        onNavigate={() => {}}
        onLogout={onLogout}
      />
    );
    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);
    expect(container.textContent).toContain("로그아웃");

    const logoutTile = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("로그아웃"))!;
    fireEvent.click(logoutTile);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("onLogout 없음 · 로그아웃 타일 미노출", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={employeeSession} onNavigate={() => {}} />
    );
    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);
    expect(container.textContent).not.toContain("로그아웃");
  });

  it("sheet 안 tile 클릭 · sheet 닫힘 + onNavigate", () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={employeeSession} onNavigate={onNavigate} />
    );
    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);

    const lunchTile = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("점심불참"))!;
    fireEvent.click(lunchTile);
    expect(onNavigate).toHaveBeenCalledWith("lunch");
    // sheet 닫혔는지 · 점심불참 텍스트가 sheet 안에만 있었으므로 사라짐
    expect(container.textContent).not.toContain("점심불참");
  });
});

describe("BottomNav · 활성 스타일", () => {
  it("현재 페이지 · text-orange-600 클래스", () => {
    const { container } = render(
      <BottomNav activePage={"schedule" as any} authSession={null} onNavigate={() => {}} />
    );
    const schedBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("스케줄"))!;
    expect(schedBtn.className).toContain("text-orange-600");
  });

  it("더보기 그룹 페이지 (display) · 더보기 활성", () => {
    const { container } = render(
      <BottomNav activePage={"display" as any} authSession={null} onNavigate={() => {}} />
    );
    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    expect(moreBtn.className).toContain("text-orange-600");
  });
});
