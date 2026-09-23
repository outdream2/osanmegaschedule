// @vitest-environment jsdom
// 2026-09-23 · B-2 · useEditScheduleForm 직접 단위 테스트
// 대상: src/components/SchedulePage/useEditScheduleForm.ts (97줄)
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type React from "react";
import {
  useEditScheduleForm,
  SCHEDULE_CYCLE,
  type UseEditScheduleFormOptions,
} from "./useEditScheduleForm";
import type { Schedule } from "../../types";

// ---- helpers -----------------------------------------------------------------
function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 1,
    employeeId: 1,
    date: "2026-09-15",
    type: "오픈",
    workingHours: "10:00-18:00",
    actualHours: "8",
    memo: "테스트 메모",
    ...overrides,
  };
}

function baseOpts(overrides: Partial<UseEditScheduleFormOptions> = {}): UseEditScheduleFormOptions {
  return {
    initialSchedule: null,
    isOpen: false,
    onSave: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const typeHoursMap: Record<string, string> = {
  오픈: "10:00-18:00",
  마감: "14:00-22:00",
  미들: "11:00-19:00",
  휴무: "",
};

// ---- 1. SCHEDULE_CYCLE 상수 --------------------------------------------------
describe("SCHEDULE_CYCLE 상수", () => {
  it("오픈·미들·마감·휴무 순서 검증", () => {
    expect(SCHEDULE_CYCLE).toEqual(["오픈", "미들", "마감", "휴무"]);
  });

  it("총 4개 항목", () => {
    expect(SCHEDULE_CYCLE.length).toBe(4);
  });

  it("readonly tuple — 배열 형태", () => {
    expect(Array.isArray(SCHEDULE_CYCLE)).toBe(true);
  });
});

// ---- 2. 초기값 · initialSchedule null ---------------------------------------
describe("useEditScheduleForm · 초기값 · initialSchedule null", () => {
  it("모든 필드 빈 문자열로 초기화", () => {
    const { result } = renderHook(() => useEditScheduleForm(baseOpts()));
    expect(result.current.values.type).toBe("");
    expect(result.current.values.workingHours).toBe("");
    expect(result.current.values.actualHours).toBe("");
    expect(result.current.values.memo).toBe("");
  });

  it("saving 초기값 false", () => {
    const { result } = renderHook(() => useEditScheduleForm(baseOpts()));
    expect(result.current.saving).toBe(false);
  });
});

// ---- 3. 초기값 · initialSchedule 존재 ---------------------------------------
describe("useEditScheduleForm · 초기값 · initialSchedule 존재", () => {
  it("type·workingHours·actualHours·memo 모두 설정", () => {
    const schedule = makeSchedule();
    const { result } = renderHook(() =>
      useEditScheduleForm(baseOpts({ initialSchedule: schedule })),
    );
    expect(result.current.values.type).toBe("오픈");
    expect(result.current.values.workingHours).toBe("10:00-18:00");
    expect(result.current.values.actualHours).toBe("8");
    expect(result.current.values.memo).toBe("테스트 메모");
  });

  it("memo 없는 schedule · memo 빈 문자열", () => {
    const schedule = makeSchedule({ memo: undefined });
    const { result } = renderHook(() =>
      useEditScheduleForm(baseOpts({ initialSchedule: schedule })),
    );
    expect(result.current.values.memo).toBe("");
  });
});

// ---- 4. setType · form 업데이트 --------------------------------------------
describe("useEditScheduleForm · setType", () => {
  it("setType 호출 · values.type 변경", () => {
    const { result } = renderHook(() => useEditScheduleForm(baseOpts()));
    act(() => {
      result.current.setType("마감");
    });
    expect(result.current.values.type).toBe("마감");
  });
});

// ---- 5. setWorkingHours · setActualHours · setMemo --------------------------
describe("useEditScheduleForm · 개별 setter", () => {
  it("setWorkingHours · values.workingHours 변경", () => {
    const { result } = renderHook(() => useEditScheduleForm(baseOpts()));
    act(() => {
      result.current.setWorkingHours("09:00-17:00");
    });
    expect(result.current.values.workingHours).toBe("09:00-17:00");
  });

  it("setActualHours · values.actualHours 변경", () => {
    const { result } = renderHook(() => useEditScheduleForm(baseOpts()));
    act(() => {
      result.current.setActualHours("7.5");
    });
    expect(result.current.values.actualHours).toBe("7.5");
  });

  it("setMemo · values.memo 변경", () => {
    const { result } = renderHook(() => useEditScheduleForm(baseOpts()));
    act(() => {
      result.current.setMemo("새 메모");
    });
    expect(result.current.values.memo).toBe("새 메모");
  });

  it("여러 setter 독립 동작 · 나머지 필드 불변", () => {
    const { result } = renderHook(() =>
      useEditScheduleForm(baseOpts({ initialSchedule: makeSchedule() })),
    );
    act(() => {
      result.current.setMemo("수정된 메모");
    });
    // 다른 필드는 그대로
    expect(result.current.values.type).toBe("오픈");
    expect(result.current.values.workingHours).toBe("10:00-18:00");
    expect(result.current.values.memo).toBe("수정된 메모");
  });
});

// ---- 6. applyPreset ----------------------------------------------------------
describe("useEditScheduleForm · applyPreset", () => {
  it("applyPreset · type + workingHours 동시 업데이트", () => {
    const { result } = renderHook(() =>
      useEditScheduleForm(baseOpts({ typeHoursMap })),
    );
    act(() => {
      result.current.applyPreset("마감");
    });
    expect(result.current.values.type).toBe("마감");
    expect(result.current.values.workingHours).toBe("14:00-22:00");
  });

  it("applyPreset · typeHoursMap 없으면 workingHours 빈 문자열", () => {
    const { result } = renderHook(() => useEditScheduleForm(baseOpts()));
    act(() => {
      result.current.applyPreset("오픈");
    });
    expect(result.current.values.type).toBe("오픈");
    expect(result.current.values.workingHours).toBe("");
  });

  it("applyPreset '휴무' · workingHours 빈 문자열", () => {
    const { result } = renderHook(() =>
      useEditScheduleForm(baseOpts({ typeHoursMap })),
    );
    act(() => {
      result.current.applyPreset("휴무");
    });
    expect(result.current.values.type).toBe("휴무");
    expect(result.current.values.workingHours).toBe("");
  });
});

// ---- 7. handleTypeChange ----------------------------------------------------
describe("useEditScheduleForm · handleTypeChange", () => {
  it("workingHours 비어있을 때 · typeHoursMap 값으로 자동 채움", () => {
    const { result } = renderHook(() =>
      useEditScheduleForm(baseOpts({ typeHoursMap })),
    );
    act(() => {
      result.current.handleTypeChange("마감");
    });
    expect(result.current.values.type).toBe("마감");
    expect(result.current.values.workingHours).toBe("14:00-22:00");
  });

  it("workingHours 가 이전 type 의 자동값과 같을 때 · 새 type 의 값으로 교체", () => {
    // 초기: type=오픈, workingHours=오픈의 자동값
    const schedule = makeSchedule({ type: "오픈", workingHours: "10:00-18:00" });
    const { result } = renderHook(() =>
      useEditScheduleForm(baseOpts({ initialSchedule: schedule, typeHoursMap, isOpen: true })),
    );
    act(() => {
      result.current.handleTypeChange("마감");
    });
    expect(result.current.values.type).toBe("마감");
    expect(result.current.values.workingHours).toBe("14:00-22:00");
  });

  it("workingHours 를 수동으로 수정한 경우 · 자동 교체 안 함", () => {
    const { result } = renderHook(() =>
      useEditScheduleForm(baseOpts({ typeHoursMap })),
    );
    // 먼저 오픈으로 세팅 후 workingHours 수동 변경
    act(() => {
      result.current.applyPreset("오픈");
    });
    act(() => {
      result.current.setWorkingHours("수동입력");
    });
    act(() => {
      result.current.handleTypeChange("마감");
    });
    // 수동 수정값 유지
    expect(result.current.values.workingHours).toBe("수동입력");
    expect(result.current.values.type).toBe("마감");
  });

  it("typeHoursMap 없으면 workingHours 빈 문자열로 설정", () => {
    const { result } = renderHook(() => useEditScheduleForm(baseOpts()));
    act(() => {
      result.current.handleTypeChange("오픈");
    });
    expect(result.current.values.type).toBe("오픈");
    expect(result.current.values.workingHours).toBe("");
  });
});

// ---- 8. handleSave ----------------------------------------------------------
describe("useEditScheduleForm · handleSave", () => {
  it("handleSave · onSave 호출 · payload 정확", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    const { result } = renderHook(() =>
      useEditScheduleForm(baseOpts({ initialSchedule: schedule, onSave })),
    );
    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
    await act(async () => {
      await result.current.handleSave(fakeEvent);
    });
    expect(fakeEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      type: "오픈",
      workingHours: "10:00-18:00",
      actualHours: "8",
      memo: "테스트 메모",
    });
  });

  it("handleSave · saving true → onSave → saving false", async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn().mockImplementation(
      () => new Promise<void>((res) => { resolveSave = res; }),
    );
    const { result } = renderHook(() => useEditScheduleForm(baseOpts({ onSave })));
    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    // handleSave 시작 · saving true
    let savePromise: Promise<void>;
    act(() => {
      savePromise = result.current.handleSave(fakeEvent);
    });
    expect(result.current.saving).toBe(true);

    // onSave resolve · saving false
    await act(async () => {
      resolveSave();
      await savePromise;
    });
    expect(result.current.saving).toBe(false);
  });

  it("handleSave · onSave throw · saving false 복귀 (finally 보장)", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("저장 실패"));
    const { result } = renderHook(() => useEditScheduleForm(baseOpts({ onSave })));
    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      // 에러가 throw 되어도 saving=false 로 복귀해야 함
      try {
        await result.current.handleSave(fakeEvent);
      } catch {
        // 정상 (에러 전파)
      }
    });
    expect(result.current.saving).toBe(false);
  });
});

// ---- 9. isOpen 변경 · form 리셋 --------------------------------------------
describe("useEditScheduleForm · isOpen 변경 시 form 리셋", () => {
  it("isOpen false→true · schedule 값으로 form 리셋", () => {
    const schedule = makeSchedule({ type: "마감", workingHours: "14:00-22:00" });
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useEditScheduleForm(baseOpts({ initialSchedule: schedule, isOpen })),
      { initialProps: { isOpen: false } },
    );

    // 수동 변경
    act(() => {
      result.current.setType("휴무");
    });
    expect(result.current.values.type).toBe("휴무");

    // isOpen true 로 변경 · 리셋
    rerender({ isOpen: true });
    expect(result.current.values.type).toBe("마감");
    expect(result.current.values.workingHours).toBe("14:00-22:00");
  });

  it("isOpen true → false · 리셋 트리거 없음 · 현재 값 유지", () => {
    const schedule = makeSchedule({ type: "오픈" });
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useEditScheduleForm(baseOpts({ initialSchedule: schedule, isOpen })),
      { initialProps: { isOpen: true } },
    );
    act(() => {
      result.current.setType("미들");
    });
    rerender({ isOpen: false });
    // false 로 닫힐 때 리셋 없음
    expect(result.current.values.type).toBe("미들");
  });
});

// ---- 10. initialSchedule 변경 · form 리셋 -----------------------------------
describe("useEditScheduleForm · initialSchedule 변경 시 form 리셋", () => {
  it("isOpen=true 상태에서 initialSchedule 변경 · 새 값으로 리셋", () => {
    const schedule1 = makeSchedule({ type: "오픈", workingHours: "10:00-18:00" });
    const schedule2 = makeSchedule({ type: "마감", workingHours: "14:00-22:00" });
    const { result, rerender } = renderHook(
      ({ sched }: { sched: Schedule }) =>
        useEditScheduleForm(baseOpts({ initialSchedule: sched, isOpen: true })),
      { initialProps: { sched: schedule1 } },
    );
    expect(result.current.values.type).toBe("오픈");

    rerender({ sched: schedule2 });
    expect(result.current.values.type).toBe("마감");
    expect(result.current.values.workingHours).toBe("14:00-22:00");
  });
});
