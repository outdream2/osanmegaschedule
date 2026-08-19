// @vitest-environment jsdom
// 2026-08-19 · ConfirmDialog · open + message + labels + danger + onConfirm/onCancel + 키보드
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

const noop = () => {};

describe("ConfirmDialog · open 제어", () => {
  it("open=false · 렌더 안 함", () => {
    const { container } = render(
      <ConfirmDialog open={false} message="x" onConfirm={noop} onCancel={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("open=true · alertdialog role · aria-modal", () => {
    const { container } = render(
      <ConfirmDialog open message="삭제할까요?" onConfirm={noop} onCancel={noop} />
    );
    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("aria-modal")).toBe("true");
  });
});

describe("ConfirmDialog · 라벨", () => {
  it("기본 라벨 · 확인 · 취소", () => {
    const { container } = render(
      <ConfirmDialog open message="x" onConfirm={noop} onCancel={noop} />
    );
    const btns = container.querySelectorAll("button");
    expect(Array.from(btns).map(b => b.textContent)).toEqual(["취소", "확인"]);
  });

  it("커스텀 라벨 적용", () => {
    const { container } = render(
      <ConfirmDialog
        open
        message="x"
        confirmLabel="삭제"
        cancelLabel="닫기"
        onConfirm={noop}
        onCancel={noop}
      />
    );
    const btns = container.querySelectorAll("button");
    expect(Array.from(btns).map(b => b.textContent)).toEqual(["닫기", "삭제"]);
  });

  it("title 있으면 · 헤더 렌더 + aria-labelledby", () => {
    const { container } = render(
      <ConfirmDialog open title="확인" message="x" onConfirm={noop} onCancel={noop} />
    );
    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog!.getAttribute("aria-labelledby")).toBe("confirm-dialog-title");
    expect(container.querySelector("#confirm-dialog-title")!.textContent).toBe("확인");
  });
});

describe("ConfirmDialog · 이벤트", () => {
  it("확인 버튼 클릭 · onConfirm 호출", () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <ConfirmDialog open message="x" onConfirm={onConfirm} onCancel={noop} />
    );
    const btns = container.querySelectorAll("button");
    fireEvent.click(btns[1]); // 확인
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("취소 버튼 클릭 · onCancel 호출", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog open message="x" onConfirm={noop} onCancel={onCancel} />
    );
    const btns = container.querySelectorAll("button");
    fireEvent.click(btns[0]); // 취소
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("backdrop 클릭 · onCancel", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog open message="x" onConfirm={noop} onCancel={onCancel} />
    );
    const backdrop = container.querySelector('[role="alertdialog"]')!;
    fireEvent.click(backdrop, { bubbles: true });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("ConfirmDialog · 키보드", () => {
  it("Enter → onConfirm", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open message="x" onConfirm={onConfirm} onCancel={noop} />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Escape → onCancel", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open message="x" onConfirm={noop} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("open=false · 키보드 리스너 미등록", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open={false} message="x" onConfirm={onConfirm} onCancel={noop} />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("ConfirmDialog · danger", () => {
  it("danger=true · AlertTriangle 아이콘 + accent bar bg-rose-500", () => {
    const { container } = render(
      <ConfirmDialog open danger message="x" onConfirm={noop} onCancel={noop} />
    );
    // svg (AlertTriangle) 존재
    expect(container.querySelector("svg")).not.toBeNull();
    // rose accent bar
    const accent = container.querySelector(".bg-rose-500");
    expect(accent).not.toBeNull();
  });

  it("danger=true · 확인 버튼 · bg-rose-600", () => {
    const { container } = render(
      <ConfirmDialog open danger message="x" onConfirm={noop} onCancel={noop} />
    );
    const btns = container.querySelectorAll("button");
    expect(btns[1].className).toContain("bg-rose-600");
  });

  it("danger=false (기본) · 확인 버튼 · bg-brand-deep", () => {
    const { container } = render(
      <ConfirmDialog open message="x" onConfirm={noop} onCancel={noop} />
    );
    const btns = container.querySelectorAll("button");
    expect(btns[1].className).toContain("bg-brand-deep");
  });
});
