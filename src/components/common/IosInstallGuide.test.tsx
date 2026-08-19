// @vitest-environment jsdom
// 2026-08-19 · IosInstallGuide · step wizard + onClose + diagnostic
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { IosInstallGuide } from "./IosInstallGuide";

describe("IosInstallGuide · 기본", () => {
  it("헤더 · 카메라 활성화 필요 표시", () => {
    const { container } = render(<IosInstallGuide />);
    expect(container.textContent).toContain("카메라 활성화 필요");
    expect(container.textContent).toContain("iOS 정식 웹앱 재설치");
  });

  it("초기 · Step 1 표시 (이전 홈화면 아이콘 삭제)", () => {
    const { container } = render(<IosInstallGuide />);
    expect(container.textContent).toContain("이전 홈화면 아이콘 삭제");
    expect(container.textContent).not.toContain("Safari 앱 직접 열기");
    expect(container.textContent).not.toContain("정식 웹앱으로 등록");
  });

  it("진행 인디케이터 · 3개 버튼", () => {
    const { container } = render(<IosInstallGuide />);
    // 1/2/3 순환 버튼 · Step 버튼 + '다음' 버튼 등
    const stepButtons = container.querySelectorAll(".w-8.h-8.rounded-full");
    expect(stepButtons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("IosInstallGuide · onClose", () => {
  it("onClose 제공 시 · X 버튼 렌더", () => {
    const onClose = vi.fn();
    const { container } = render(<IosInstallGuide onClose={onClose} />);
    // 헤더 · X 아이콘 버튼
    const svgs = container.querySelectorAll("svg");
    const closeBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.querySelector('svg[width="18"]')
    );
    expect(closeBtn).toBeTruthy();
  });

  it("onClose 없으면 · X 버튼 없음", () => {
    const { container } = render(<IosInstallGuide />);
    // 헤더 X 없음
    const btns = container.querySelectorAll("button");
    // 진행 인디케이터 (3) + 다음 (1) = 4 · X 없으면 4
    // 실제 구조에 맞게 검증
    expect(btns.length).toBe(4);
  });
});

describe("IosInstallGuide · 단계 이동", () => {
  it("Step 1 · '다음' 클릭 · Step 2 표시", () => {
    const { container } = render(<IosInstallGuide />);
    const nextBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("삭제 완료")
    );
    expect(nextBtn).toBeTruthy();
    fireEvent.click(nextBtn!);
    expect(container.textContent).toContain("Safari 앱 직접 열기");
  });

  it("Step 2 · '이전' 클릭 · Step 1 로 복귀", () => {
    const { container } = render(<IosInstallGuide />);
    // Step 1 → 2
    fireEvent.click(
      Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("삭제 완료")
      )!
    );
    expect(container.textContent).toContain("Safari 앱 직접 열기");
    // Step 2 → 1
    fireEvent.click(
      Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.trim() === "← 이전"
      )!
    );
    expect(container.textContent).toContain("이전 홈화면 아이콘 삭제");
  });

  it("Step 2 · '다음' 클릭 · Step 3 표시", () => {
    const { container } = render(<IosInstallGuide />);
    fireEvent.click(
      Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("삭제 완료")
      )!
    );
    fireEvent.click(
      Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Safari 접속 완료")
      )!
    );
    expect(container.textContent).toContain("정식 웹앱으로 등록");
  });

  it("진행 인디케이터 클릭 · 직접 Step 이동", () => {
    const { container } = render(<IosInstallGuide />);
    // 3번 인디케이터 · 클릭 시 Step 3 로 점프
    const dot3 = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "3" && b.className.includes("rounded-full")
    );
    expect(dot3).toBeTruthy();
    fireEvent.click(dot3!);
    expect(container.textContent).toContain("정식 웹앱으로 등록");
  });
});

describe("IosInstallGuide · Safari 자동 열기 시도", () => {
  it("Step 2 · Safari 자동 열기 버튼 · 클릭 시 x-safari-https:// 로 이동 시도", () => {
    const { container } = render(<IosInstallGuide />);
    fireEvent.click(
      Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("삭제 완료")
      )!
    );
    const safariBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Safari 로 자동 열기 시도")
    );
    expect(safariBtn).toBeTruthy();
    // jsdom · location.href 세팅은 실패해도 catch 됨 · 에러 없이 클릭만 확인
    expect(() => fireEvent.click(safariBtn!)).not.toThrow();
  });
});

describe("IosInstallGuide · diagnostic 정보", () => {
  it("diagnostic 제공 시 · 기술 진단 details 렌더", () => {
    const { container } = render(
      <IosInstallGuide
        diagnostic={{
          url: "test.com",
          mediaDevices: false,
          getUserMedia: false,
          standalone: false,
          inApp: false,
          ua: "Mozilla/5.0 iPhone",
        }}
      />
    );
    expect(container.querySelector("details")).not.toBeNull();
    expect(container.textContent).toContain("기술 진단 정보");
  });

  it("diagnostic 없으면 · details 미렌더", () => {
    const { container } = render(<IosInstallGuide />);
    expect(container.querySelector("details")).toBeNull();
  });

  it("mediaDevices=true · 초록색 표시", () => {
    const { container } = render(
      <IosInstallGuide
        diagnostic={{
          url: "test.com",
          mediaDevices: true,
          getUserMedia: true,
          standalone: false,
          inApp: false,
          ua: "x",
        }}
      />
    );
    const emeraldTexts = container.querySelectorAll(".text-emerald-300");
    expect(emeraldTexts.length).toBeGreaterThan(0);
  });
});
