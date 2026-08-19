// @vitest-environment jsdom
// 2026-08-19 · useConfirm · ConfirmProvider · Promise 반환 · confirm/cancel resolve
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act, renderHook } from "@testing-library/react";
import React from "react";
import { ConfirmProvider, useConfirm } from "./useConfirm";

describe("useConfirm · Provider 없이 사용", () => {
  it("Provider 없이 useConfirm · 에러 throw", () => {
    // console.error 억제 · React 에러 로그
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useConfirm())).toThrow(
      /ConfirmProvider 가 마운트되지 않았습니다/
    );
    errSpy.mockRestore();
  });
});

function Consumer({ onResult, options }: {
  onResult: (result: boolean) => void;
  options: Parameters<ReturnType<typeof useConfirm>>[0];
}) {
  const confirm = useConfirm();
  return (
    <button
      onClick={async () => {
        const r = await confirm(options);
        onResult(r);
      }}
    >
      트리거
    </button>
  );
}

describe("useConfirm · 기본 동작", () => {
  it("confirm 호출 · ConfirmDialog 열림 · message 표시", () => {
    const { container } = render(
      <ConfirmProvider>
        <Consumer onResult={() => {}} options={{ message: "정말 삭제?" }} />
      </ConfirmProvider>
    );
    // 초기 · 다이얼로그 없음
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    // 트리거 클릭 · 다이얼로그 열림
    act(() => {
      fireEvent.click(container.querySelector("button")!);
    });
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(container.textContent).toContain("정말 삭제?");
  });

  it("확인 버튼 · Promise resolve(true)", async () => {
    const onResult = vi.fn();
    const { container } = render(
      <ConfirmProvider>
        <Consumer onResult={onResult} options={{ message: "x" }} />
      </ConfirmProvider>
    );
    act(() => {
      fireEvent.click(container.querySelector("button")!);
    });
    // 확인 버튼 (dialog 안)
    const dialogBtns = container.querySelectorAll('[role="alertdialog"] button');
    const confirmBtn = Array.from(dialogBtns).find(
      (b) => b.textContent?.trim() === "확인"
    )!;
    act(() => {
      fireEvent.click(confirmBtn);
    });
    // Promise flush
    await Promise.resolve();
    await Promise.resolve();
    expect(onResult).toHaveBeenCalledWith(true);
    // dialog 닫힘
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("취소 버튼 · Promise resolve(false)", async () => {
    const onResult = vi.fn();
    const { container } = render(
      <ConfirmProvider>
        <Consumer onResult={onResult} options={{ message: "x" }} />
      </ConfirmProvider>
    );
    act(() => {
      fireEvent.click(container.querySelector("button")!);
    });
    const dialogBtns = container.querySelectorAll('[role="alertdialog"] button');
    const cancelBtn = Array.from(dialogBtns).find(
      (b) => b.textContent?.trim() === "취소"
    )!;
    act(() => {
      fireEvent.click(cancelBtn);
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(onResult).toHaveBeenCalledWith(false);
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
});

describe("useConfirm · options 전달", () => {
  it("title/confirmLabel/cancelLabel · Dialog 전달", () => {
    const { container } = render(
      <ConfirmProvider>
        <Consumer
          onResult={() => {}}
          options={{
            title: "삭제 확인",
            message: "메시지",
            confirmLabel: "삭제",
            cancelLabel: "닫기",
          }}
        />
      </ConfirmProvider>
    );
    act(() => {
      fireEvent.click(container.querySelector("button")!);
    });
    expect(container.textContent).toContain("삭제 확인");
    const btns = container.querySelectorAll('[role="alertdialog"] button');
    expect(Array.from(btns).map(b => b.textContent?.trim()).slice(0, 2)).toEqual(["닫기", "삭제"]);
  });

  it("danger · Dialog 에 danger prop 전달 · rose 버튼", () => {
    const { container } = render(
      <ConfirmProvider>
        <Consumer onResult={() => {}} options={{ message: "위험", danger: true }} />
      </ConfirmProvider>
    );
    act(() => {
      fireEvent.click(container.querySelector("button")!);
    });
    // rose 버튼 존재 (Dialog 내부)
    const roseBtn = container.querySelector('[role="alertdialog"] .bg-rose-600');
    expect(roseBtn).not.toBeNull();
  });
});
