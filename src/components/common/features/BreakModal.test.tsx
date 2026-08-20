// @vitest-environment jsdom
// 2026-08-19 · BreakModal · 시간 입력 · 저장/취소 · 초기화 버튼
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { BreakModal, type BreakModalState } from "./BreakModal";

const defaultState: BreakModalState = {
  employeeId: 1,
  date: "2026-08-19",
  scheduleId: 100,
  type: "N",
  workingHours: "9-18",
  actualHours: "8",
  memo: "",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  breakStart: "",
  breakEnd: "",
};

describe("BreakModal · 렌더", () => {
  it("Modal 열림 · 헤더 · 점심 · 휴게 시간", () => {
    const { container } = render(
      <BreakModal
        breakModal={defaultState}
        setBreakModal={vi.fn()}
        isSavingBreak={false}
        onSave={vi.fn()}
      />
    );
    expect(container.textContent).toContain("점심 · 휴게 시간");
    expect(container.textContent).toContain("2026-08-19");
    expect(container.textContent).toContain("점심 시간");
    expect(container.textContent).toContain("휴게 시간");
  });

  it("time input 4개 · lunchStart/lunchEnd/breakStart/breakEnd", () => {
    const { container } = render(
      <BreakModal
        breakModal={defaultState}
        setBreakModal={vi.fn()}
        isSavingBreak={false}
        onSave={vi.fn()}
      />
    );
    const timeInputs = container.querySelectorAll('input[type="time"]');
    expect(timeInputs.length).toBe(4);
    expect((timeInputs[0] as HTMLInputElement).value).toBe("12:00");
    expect((timeInputs[1] as HTMLInputElement).value).toBe("13:00");
    expect((timeInputs[2] as HTMLInputElement).value).toBe("");
    expect((timeInputs[3] as HTMLInputElement).value).toBe("");
  });
});

describe("BreakModal · 시간 입력 존재 확인 (jsdom time input 제약으로 변경 이벤트 test 생략)", () => {
  it("4개 time input · defaultState 값 반영", () => {
    const { container } = render(
      <BreakModal
        breakModal={{ ...defaultState, breakStart: "14:00", breakEnd: "15:00" }}
        setBreakModal={vi.fn()}
        isSavingBreak={false}
        onSave={vi.fn()}
      />
    );
    const inputs = container.querySelectorAll('input[type="time"]');
    expect((inputs[0] as HTMLInputElement).value).toBe("12:00");
    expect((inputs[1] as HTMLInputElement).value).toBe("13:00");
    expect((inputs[2] as HTMLInputElement).value).toBe("14:00");
    expect((inputs[3] as HTMLInputElement).value).toBe("15:00");
  });
});

describe("BreakModal · 초기화 버튼", () => {
  it("점심 초기화 · lunchStart/lunchEnd 빈 값", () => {
    const setBreakModal = vi.fn();
    const { container } = render(
      <BreakModal
        breakModal={defaultState}
        setBreakModal={setBreakModal}
        isSavingBreak={false}
        onSave={vi.fn()}
      />
    );
    const resetBtns = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent?.trim() === "초기화"
    );
    expect(resetBtns.length).toBe(2);
    fireEvent.click(resetBtns[0]); // 점심 초기화
    const updater = setBreakModal.mock.calls[0][0];
    const next = updater(defaultState);
    expect(next.lunchStart).toBe("");
    expect(next.lunchEnd).toBe("");
    // breakStart/End 는 변경 없음
    expect(next.breakStart).toBe(defaultState.breakStart);
  });

  it("휴게 초기화 · breakStart/breakEnd 빈 값", () => {
    const setBreakModal = vi.fn();
    const state = { ...defaultState, breakStart: "14:00", breakEnd: "15:00" };
    const { container } = render(
      <BreakModal
        breakModal={state}
        setBreakModal={setBreakModal}
        isSavingBreak={false}
        onSave={vi.fn()}
      />
    );
    const resetBtns = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent?.trim() === "초기화"
    );
    fireEvent.click(resetBtns[1]); // 휴게 초기화
    const updater = setBreakModal.mock.calls[0][0];
    const next = updater(state);
    expect(next.breakStart).toBe("");
    expect(next.breakEnd).toBe("");
  });
});

describe("BreakModal · 저장/취소", () => {
  it("저장 클릭 · onSave 호출", () => {
    const onSave = vi.fn();
    const { container } = render(
      <BreakModal
        breakModal={defaultState}
        setBreakModal={vi.fn()}
        isSavingBreak={false}
        onSave={onSave}
      />
    );
    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "저장"
    )!;
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("isSavingBreak=true · 저장 중… 표시 + 버튼 disabled", () => {
    const { container } = render(
      <BreakModal
        breakModal={defaultState}
        setBreakModal={vi.fn()}
        isSavingBreak={true}
        onSave={vi.fn()}
      />
    );
    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "저장 중…"
    )! as HTMLButtonElement;
    expect(saveBtn).toBeTruthy();
    expect(saveBtn.disabled).toBe(true);
  });

  it("취소 클릭 · setBreakModal(null)", () => {
    const setBreakModal = vi.fn();
    const { container } = render(
      <BreakModal
        breakModal={defaultState}
        setBreakModal={setBreakModal}
        isSavingBreak={false}
        onSave={vi.fn()}
      />
    );
    const cancelBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "취소"
    )!;
    fireEvent.click(cancelBtn);
    expect(setBreakModal).toHaveBeenCalledWith(null);
  });
});
