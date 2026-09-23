// @vitest-environment jsdom
// 2026-09-23 · B-1 · ScheduleCell 편집 flow · refactor 사전 safety net
// 대상: src/components/SchedulePage/ScheduleCell.tsx (429 라인)
// 목적: B-2 useEditScheduleForm 훅 추출 전 현재 동작 고정
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor, act } from "@testing-library/react";
import { ScheduleCell } from "./ScheduleCell";
import type { Schedule } from "../../types";

afterEach(() => cleanup());

// ---- helpers ----------------------------------------------------------------
const baseProps = {
  dateStr: "2026-09-15",
  employeeId: 1,
  onUpdate: vi.fn().mockResolvedValue(undefined),
};

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 1,
    employeeId: 1,
    date: "2026-09-15",
    type: "오픈",
    workingHours: "10:00-18:00",
    actualHours: "",
    memo: "",
    ...overrides,
  };
}

// ---- 1. 초기 렌더 · schedule 없음 --------------------------------------------
describe("ScheduleCell · 초기 렌더 · schedule 없음", () => {
  it("schedule 없음 · '-' 표시 · popover 미표시", () => {
    const { container } = render(<ScheduleCell {...baseProps} />);
    expect(container.textContent).toContain("-");
    // popover(저장 버튼) 없음
    expect(screen.queryByText("저장")).toBeNull();
  });
});

// ---- 2. 초기 렌더 · schedule 있음 --------------------------------------------
describe("ScheduleCell · 초기 렌더 · schedule 있음", () => {
  it("type '오픈' 표시", () => {
    render(<ScheduleCell {...baseProps} schedule={makeSchedule({ type: "오픈" })} />);
    expect(screen.getByText("오픈")).toBeTruthy();
  });

  it("actualHours 있으면 해당 텍스트 표시", () => {
    render(
      <ScheduleCell
        {...baseProps}
        schedule={makeSchedule({ actualHours: "2시간 연장" })}
      />,
    );
    // whitespace-pre-line + replace 변환: "2시간\n연장" — 텍스트 노드 포함 확인
    const container = document.body;
    expect(container.textContent).toContain("2시간");
    expect(container.textContent).toContain("연장");
  });

  it("schedule 없을 때 배경색 없음 (white 폴백)", () => {
    const { container } = render(<ScheduleCell {...baseProps} />);
    // style 속성 없거나 backgroundColor 미설정
    const cell = container.querySelector('[id^="cell-"]') as HTMLElement | null;
    expect(cell?.style.backgroundColor ?? "").toBe("");
  });
});

// ---- 3. 편집 버튼 · popover 열기 (isAdmin=true 필요) -------------------------
describe("ScheduleCell · 편집 팝오버 열기", () => {
  it("isAdmin=true · 편집 버튼 클릭 → popover 표시", () => {
    render(
      <ScheduleCell
        {...baseProps}
        isAdmin
        schedule={makeSchedule()}
      />,
    );
    const editBtn = screen.getByTitle("상세 편집");
    fireEvent.click(editBtn);
    expect(screen.getByText("저장")).toBeTruthy();
  });

  it("isAdmin=false · 편집 버튼 없음", () => {
    render(<ScheduleCell {...baseProps} schedule={makeSchedule()} />);
    expect(screen.queryByTitle("상세 편집")).toBeNull();
  });

  it("popover 열림 · 스케줄 설정 제목 표시", () => {
    render(<ScheduleCell {...baseProps} isAdmin schedule={makeSchedule()} />);
    fireEvent.click(screen.getByTitle("상세 편집"));
    expect(screen.getByText(/스케줄 설정/)).toBeTruthy();
  });
});

// ---- 4. 편집 저장 · onUpdate 호출 검증 ----------------------------------------
describe("ScheduleCell · 편집 저장 · onUpdate payload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("저장 클릭 → onUpdate 가 employeeId·date·type 포함해 호출됨", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <ScheduleCell
        {...baseProps}
        onUpdate={onUpdate}
        isAdmin
        schedule={makeSchedule({ type: "오픈", workingHours: "10:00-18:00" })}
      />,
    );
    fireEvent.click(screen.getByTitle("상세 편집"));
    await act(async () => {
      fireEvent.click(screen.getByText("저장"));
    });
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(1);
    });
    const payload = onUpdate.mock.calls[0][0];
    expect(payload.employeeId).toBe(1);
    expect(payload.date).toBe("2026-09-15");
    expect(payload.type).toBe("오픈");
    expect(payload.workingHours).toBe("10:00-18:00");
  });

  it("type 빈값 저장 → onUpdate payload type = '휴무' (기본값 폴백)", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <ScheduleCell
        {...baseProps}
        onUpdate={onUpdate}
        isAdmin
        // schedule 없음 → type 빈값
      />,
    );
    fireEvent.click(screen.getByTitle("상세 편집"));
    await act(async () => {
      fireEvent.click(screen.getByText("저장"));
    });
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate.mock.calls[0][0].type).toBe("휴무");
  });

  it("API 실패 시 popover 닫히지 않음 (사용자 재시도 가능)", async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error("network error"));
    render(
      <ScheduleCell
        {...baseProps}
        onUpdate={onUpdate}
        isAdmin
        schedule={makeSchedule()}
      />,
    );
    fireEvent.click(screen.getByTitle("상세 편집"));
    await act(async () => {
      fireEvent.click(screen.getByText("저장"));
    });
    // popover 는 아직 열려 있어야 함 (저장 버튼 유지)
    await waitFor(() => {
      expect(screen.queryByText("저장")).toBeTruthy();
    });
  });
});

// ---- 5. 취소 버튼 · popover 닫힘 ---------------------------------------------
describe("ScheduleCell · 취소 · popover 닫힘", () => {
  it("취소 버튼 클릭 → popover 닫힘", () => {
    render(<ScheduleCell {...baseProps} isAdmin schedule={makeSchedule()} />);
    fireEvent.click(screen.getByTitle("상세 편집"));
    expect(screen.getByText("저장")).toBeTruthy();
    fireEvent.click(screen.getByText("취소"));
    expect(screen.queryByText("저장")).toBeNull();
  });
});

// ---- 6. 근무 사이클 (CYCLE) · handleQuickCycle --------------------------------
describe("ScheduleCell · 근무 사이클 CYCLE · 클릭 순환", () => {
  // CYCLE = ["오픈", "미들", "마감", "휴무"]
  // 현재 type → 클릭 → 다음 type 으로 onUpdate 호출

  beforeEach(() => vi.clearAllMocks());

  it("오픈 → 클릭 → onUpdate(type='미들') 호출", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <ScheduleCell
        {...baseProps}
        onUpdate={onUpdate}
        isAdmin
        schedule={makeSchedule({ type: "오픈" })}
      />,
    );
    // 셀 자체(id=cell-...) 클릭 → handleQuickCycle
    const cell = document.querySelector('[id^="cell-"]') as HTMLElement;
    await act(async () => { fireEvent.click(cell); });
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate.mock.calls[0][0].type).toBe("미들");
  });

  it("미들 → 클릭 → onUpdate(type='마감') 호출", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <ScheduleCell
        {...baseProps}
        onUpdate={onUpdate}
        isAdmin
        schedule={makeSchedule({ type: "미들" })}
      />,
    );
    const cell = document.querySelector('[id^="cell-"]') as HTMLElement;
    await act(async () => { fireEvent.click(cell); });
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate.mock.calls[0][0].type).toBe("마감");
  });

  it("마감 → 클릭 → onUpdate(type='휴무') 호출", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <ScheduleCell
        {...baseProps}
        onUpdate={onUpdate}
        isAdmin
        schedule={makeSchedule({ type: "마감" })}
      />,
    );
    const cell = document.querySelector('[id^="cell-"]') as HTMLElement;
    await act(async () => { fireEvent.click(cell); });
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate.mock.calls[0][0].type).toBe("휴무");
  });

  it("휴무 → 클릭 → onUpdate(type='오픈') 순환", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <ScheduleCell
        {...baseProps}
        onUpdate={onUpdate}
        isAdmin
        schedule={makeSchedule({ type: "휴무" })}
      />,
    );
    const cell = document.querySelector('[id^="cell-"]') as HTMLElement;
    await act(async () => { fireEvent.click(cell); });
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate.mock.calls[0][0].type).toBe("오픈");
  });

  it("schedule 없음(empty) → 클릭 → onUpdate(type='미들') — CYCLE indexOf('')=-1 → (−1+1)%4=0 → '오픈'", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <ScheduleCell
        {...baseProps}
        onUpdate={onUpdate}
        isAdmin
        // schedule 없음 → cur=""
      />,
    );
    const cell = document.querySelector('[id^="cell-"]') as HTMLElement;
    await act(async () => { fireEvent.click(cell); });
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    // indexOf("") = -1 → (-1+1)%4 = 0 → "오픈"
    expect(onUpdate.mock.calls[0][0].type).toBe("오픈");
  });

  it("isAdmin=false · 클릭해도 onUpdate 호출 안 됨", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <ScheduleCell
        {...baseProps}
        onUpdate={onUpdate}
        isAdmin={false}
        schedule={makeSchedule({ type: "오픈" })}
      />,
    );
    const cell = document.querySelector('[id^="cell-"]') as HTMLElement;
    await act(async () => { fireEvent.click(cell); });
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

// ---- 7. displayActualHours · 지각 아이콘 표시 ---------------------------------
describe("ScheduleCell · displayActualHours · 아이콘 표시", () => {
  it("actualHours '지각' → ⚠️ 아이콘 표시", () => {
    render(
      <ScheduleCell
        {...baseProps}
        schedule={makeSchedule({ actualHours: "지각" })}
      />,
    );
    expect(document.body.textContent).toContain("⚠️");
  });

  it("actualHours '조퇴' → 🏃 아이콘 표시", () => {
    render(
      <ScheduleCell
        {...baseProps}
        schedule={makeSchedule({ actualHours: "조퇴" })}
      />,
    );
    expect(document.body.textContent).toContain("🏃");
  });

  it("actualHours '결근' → 🚨 아이콘 표시", () => {
    render(
      <ScheduleCell
        {...baseProps}
        schedule={makeSchedule({ actualHours: "결근" })}
      />,
    );
    expect(document.body.textContent).toContain("🚨");
  });
});

// ---- 8. "2시간 연장" 줄바꿈 (recent fix) -------------------------------------
describe("ScheduleCell · '2시간 연장' 줄바꿈 fix", () => {
  it("'2시간 연장' → whitespace-pre-line 클래스 + '\\n' 치환 렌더", () => {
    const { container } = render(
      <ScheduleCell
        {...baseProps}
        schedule={makeSchedule({ actualHours: "2시간 연장" })}
      />,
    );
    // whitespace-pre-line 클래스가 있는 요소 확인
    const el = container.querySelector(".whitespace-pre-line");
    expect(el).not.toBeNull();
    // 텍스트에 "2시간"과 "연장"이 모두 포함 (줄바꿈 후)
    expect(el?.textContent).toContain("2시간");
    expect(el?.textContent).toContain("연장");
  });

  it("'2시간 연장' · truncate 클래스 없음 (말줄임표 금지 대원칙)", () => {
    const { container } = render(
      <ScheduleCell
        {...baseProps}
        schedule={makeSchedule({ actualHours: "2시간 연장" })}
      />,
    );
    const el = container.querySelector(".whitespace-pre-line");
    expect(el?.className).not.toContain("truncate");
  });
});

// ---- 9. isLocked(isAdmin=false) · 편집 비활성 ---------------------------------
describe("ScheduleCell · isAdmin=false · 편집 불가", () => {
  it("isAdmin=false → 편집 버튼 없음 (disabled)", () => {
    render(<ScheduleCell {...baseProps} isAdmin={false} schedule={makeSchedule()} />);
    expect(screen.queryByTitle("상세 편집")).toBeNull();
  });

  it("isAdmin=false → 셀 cursor-default 클래스", () => {
    const { container } = render(
      <ScheduleCell {...baseProps} isAdmin={false} schedule={makeSchedule()} />,
    );
    const cell = container.querySelector('[id^="cell-"]') as HTMLElement;
    expect(cell?.className).toContain("cursor-default");
  });
});

// ---- 10. 메모 있음 · notification dot 표시 ------------------------------------
describe("ScheduleCell · 메모 notification dot", () => {
  it("메모 있음 → notification dot 렌더 (title='메모 있음')", () => {
    const { container } = render(
      <ScheduleCell
        {...baseProps}
        schedule={makeSchedule({ memo: "중요 메모" })}
      />,
    );
    const dot = container.querySelector('[title="메모 있음"]');
    expect(dot).not.toBeNull();
  });

  it("메모 없음 → notification dot 없음", () => {
    const { container } = render(
      <ScheduleCell {...baseProps} schedule={makeSchedule({ memo: "" })} />,
    );
    const dot = container.querySelector('[title="메모 있음"]');
    expect(dot).toBeNull();
  });

  it("메모 공백만 → notification dot 없음 (trim 처리)", () => {
    const { container } = render(
      <ScheduleCell {...baseProps} schedule={makeSchedule({ memo: "   " })} />,
    );
    const dot = container.querySelector('[title="메모 있음"]');
    expect(dot).toBeNull();
  });
});

// ---- 11. form state 초기화 · popover 재오픈 시 schedule 값으로 리셋 -------------
describe("ScheduleCell · form 초기화 · popover 재오픈", () => {
  it("popover 열면 schedule props 값으로 form 초기화", () => {
    render(
      <ScheduleCell
        {...baseProps}
        isAdmin
        schedule={makeSchedule({ type: "마감", workingHours: "12:00-20:00" })}
      />,
    );
    fireEvent.click(screen.getByTitle("상세 편집"));
    // select box 가 schedule.type 으로 초기화 되어야 함
    const select = document.querySelector("select") as HTMLSelectElement;
    expect(select?.value).toBe("마감");
  });

  it("popover 닫고 재오픈 → form 이 원래 schedule 값으로 리셋", () => {
    render(
      <ScheduleCell
        {...baseProps}
        isAdmin
        schedule={makeSchedule({ type: "오픈" })}
      />,
    );
    // 1. 열기
    fireEvent.click(screen.getByTitle("상세 편집"));
    // 2. select 변경
    const select = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "휴무" } });
    expect(select.value).toBe("휴무");
    // 3. 취소 (닫기)
    fireEvent.click(screen.getByText("취소"));
    // 4. 재오픈
    fireEvent.click(screen.getByTitle("상세 편집"));
    const select2 = document.querySelector("select") as HTMLSelectElement;
    // useEffect([isOpen, schedule]) → schedule.type = "오픈" 으로 리셋
    expect(select2.value).toBe("오픈");
  });
});
