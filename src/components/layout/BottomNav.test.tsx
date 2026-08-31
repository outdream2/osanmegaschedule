// @vitest-environment jsdom
// 2026-08-20 · BottomNav · 모바일 하단 5탭 · 더보기 sheet
// 2026-08-23 · #191 · BottomSheet primitive 마이그레이션 · 애니메이션 250ms 대기 필요
// 2026-08-31 · #49/#66 · sideNavGroups 재편 반영
//   · 하단 탭: landing(홈)·schedule(스케줄)·board(이슈) = 3탭 + 더보기
//     · requests 는 DERIVED_TOP_TABS 에 key="requests" 없음 → 필터 제외
//     · approval-request(승인) 는 BOTTOM_TAB_KEYS["requests"] 에 매핑 안 됨
//   · 더보기 sheet: approvals 그룹(연차신청·점심불참·요청목록) + display 그룹 + business 그룹 + settings 그룹
//   · 권한관리 → "메뉴 설정" (permissions key · label 변경)
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { BottomNav } from "./BottomNav";
import type { AuthSession } from "../../types";

const employeeSession: AuthSession = { employeeId: 1, name: "직원", role: "employee", level: 1 } as any;
const managerSession: AuthSession = { employeeId: 2, name: "매니저", role: "manager", level: 2 } as any;
const adminSession: AuthSession = { employeeId: 9, name: "관리자", role: "admin", level: 9 } as any;

describe("BottomNav · 5탭 렌더", () => {
  // 2026-08-31 · sideNavGroups 재편
  //   · BOTTOM_TAB_KEYS = ["landing","schedule","requests","board"]
  //   · "requests" 는 DERIVED_TOP_TABS 에 없어 필터됨 → 실제 하단 탭 3개
  //   · 하단 탭: 홈·스케줄·이슈·더보기
  it("홈·스케줄·이슈·더보기", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={null} onNavigate={() => {}} />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("홈");
    expect(text).toContain("스케줄");
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

  // 2026-08-31 · "요청" 탭은 제거됨 (requests 는 DERIVED_TOP_TABS 에 없어 하단탭 미노출)
  //   · 이슈 탭(board) 클릭 → onNavigate('board') 로 대체
  it("이슈 탭 클릭 · onNavigate('board')", () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={null} onNavigate={onNavigate} />
    );
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("이슈"))!;
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledWith("board");
  });
});

describe("BottomNav · 더보기 sheet", () => {
  // 2026-08-31 · 더보기 sheet 열림 확인
  //   · employee(lv1) · approvals 그룹 → 연차신청·점심불참 노출
  //   · "상품스캔" 라벨 없음 → "연차신청" 으로 변경
  it("더보기 클릭 · sheet 열림", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={employeeSession} onNavigate={() => {}} />
    );
    // 처음엔 sheet 없음
    expect(container.textContent).not.toMatch(/연차신청|점심불참/);

    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);

    // sheet 안 항목 (approvals 그룹)
    expect(container.textContent).toContain("연차신청");
    expect(container.textContent).toContain("점심불참");
  });

  it("employee 세션 · 관리자 전용 항목 미노출", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={employeeSession} onNavigate={() => {}} />
    );
    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);
    // managerOnly 항목 · 직원관리·요청목록·상품 미노출
    expect(container.textContent).not.toContain("직원관리");
    expect(container.textContent).not.toContain("요청목록");
    expect(container.textContent).not.toContain("상품");
  });

  // 2026-08-31 · manager(lv2) 더보기 시트 항목
  //   · approvals: 연차신청·점심불참·요청목록(managerOnly)
  //   · display: 상품(managerOnly) — 나머지 minLevel:9 제외
  //   · business: 직원관리·근로계약서작성·각종양식(managerOnly)
  //   · "매장관리"·"연차승인"·"입고알림" 라벨 없음 (입고알림 minLevel:3, lv2 미노출)
  it("manager 세션 · 연차신청·점심불참·요청목록·직원관리 노출", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={managerSession} onNavigate={() => {}} />
    );
    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);
    expect(container.textContent).toContain("연차신청");
    expect(container.textContent).toContain("점심불참");
    expect(container.textContent).toContain("요청목록");
    expect(container.textContent).toContain("직원관리");
  });

  // 2026-08-31 · admin(lv9) · settings 그룹 노출 (모두 minLevel:9)
  //   · "메뉴 설정" = permissions key (구 "권한관리" → 현재 label "메뉴 설정")
  it("admin(lv9) · 메뉴 설정 노출", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={adminSession} onNavigate={() => {}} />
    );
    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);
    expect(container.textContent).toContain("메뉴 설정");
  });

  it("manager (lv2) · 메뉴 설정 미노출 (lv9 전용)", () => {
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={managerSession} onNavigate={() => {}} />
    );
    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);
    expect(container.textContent).not.toContain("메뉴 설정");
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

  // 2026-08-31 · sheet tile 클릭 → onNavigate
  //   · 점심불참 클릭 → key="approval-request" · subTab="lunch"
  //   · onNavigate("approval-request") 호출
  it("sheet 안 tile 클릭 · sheet 닫힘 + onNavigate", async () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <BottomNav activePage={"landing" as any} authSession={employeeSession} onNavigate={onNavigate} />
    );
    const moreBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("더보기"))!;
    fireEvent.click(moreBtn);

    const lunchTile = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("점심불참"))!;
    fireEvent.click(lunchTile);
    expect(onNavigate).toHaveBeenCalledWith("approval-request");
    // sheet 닫혔는지 · BottomSheet 는 250ms 애니메이션 후 unmount · waitFor 대기
    await waitFor(() => {
      expect(container.textContent).not.toContain("점심불참");
    }, { timeout: 500 });
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
