// @vitest-environment jsdom
// 2026-08-20 · useLeaveManager · 연차 이력 로드/삭제
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../lib/apiClient", () => ({
  api: { get: vi.fn(), put: vi.fn() },
}));

import { useLeaveManager } from "./useLeaveManager";
import { api } from "../lib/apiClient";

const mockGet = api.get as ReturnType<typeof vi.fn>;
const mockPut = api.put as ReturnType<typeof vi.fn>;
const confirm = vi.fn().mockResolvedValue(true);

beforeEach(() => {
  mockGet.mockReset();
  mockPut.mockReset();
  confirm.mockReset();
  confirm.mockResolvedValue(true);
});

const monthResponse = (empId: number, schedules: any[]) => ({
  data: { employees: [{ id: empId, schedules }] }
});

describe("useLeaveManager · 초기 상태", () => {
  it("selectedId=null · usedLeaves 빈 배열", () => {
    const { result } = renderHook(() => useLeaveManager(null, confirm));
    expect(result.current.usedLeaves).toEqual([]);
    expect(result.current.leaveLoading).toBe(false);
    expect(result.current.leaveError).toBeNull();
  });

  it("현재 년도 · setLeaveYear 초기값", () => {
    const { result } = renderHook(() => useLeaveManager(null, confirm));
    expect(result.current.leaveYear).toBe(new Date().getFullYear());
    expect(result.current.currentYearNow).toBe(new Date().getFullYear());
  });
});

describe("useLeaveManager · loadUsedLeaves", () => {
  it("월차·오전반차·오후반차 · 이력 수집", async () => {
    mockGet.mockImplementation((url: string) => {
      const m = /month=(\d+)/.exec(url);
      const month = m ? Number(m[1]) : 1;
      if (month === 3) {
        return Promise.resolve(monthResponse(1, [
          { date: "2026-03-15", type: "월차", memo: "감기" },
          { date: "2026-03-20", type: "오전반차", memo: "" },
        ]));
      }
      if (month === 5) {
        return Promise.resolve(monthResponse(1, [
          { date: "2026-05-10", type: "오후반차", memo: "" },
          { date: "2026-05-11", type: "오픈", memo: "" }, // 연차 아님 · 제외
        ]));
      }
      return Promise.resolve({ data: { employees: [] } });
    });

    const { result } = renderHook(() => useLeaveManager(1, confirm));
    await waitFor(() => expect(result.current.usedLeaves.length).toBeGreaterThan(0));

    expect(result.current.usedLeaves).toHaveLength(3);
    // 날짜 오름차순
    expect(result.current.usedLeaves[0].date).toBe("2026-03-15");
    expect(result.current.usedLeaves[0].type).toBe("월차");
    expect(result.current.usedLeaves[0].weight).toBe(1);
    // 반차 weight 0.5
    const half = result.current.usedLeaves.find(l => l.type.includes("반차"));
    expect(half?.weight).toBe(0.5);
  });

  it("타 직원 스케줄 · 무시", async () => {
    mockGet.mockResolvedValue(monthResponse(999, [
      { date: "2026-03-15", type: "월차", memo: "" },
    ]));
    const { result } = renderHook(() => useLeaveManager(1, confirm));
    await waitFor(() => expect(result.current.leaveLoading).toBe(false));
    expect(result.current.usedLeaves).toEqual([]);
  });

  it("타 연도 스케줄 · 제외", async () => {
    mockGet.mockResolvedValue(monthResponse(1, [
      { date: "2025-03-15", type: "월차", memo: "" },
      { date: "2026-03-15", type: "월차", memo: "" },
    ]));
    const { result } = renderHook(() => useLeaveManager(1, confirm));
    await waitFor(() => expect(result.current.leaveLoading).toBe(false));
    // 2026 만 (year=현재년도)
    expect(result.current.usedLeaves.every(l => l.date.startsWith(`${new Date().getFullYear()}-`))).toBe(true);
  });

  it("year 변경 · 재조회", async () => {
    mockGet.mockResolvedValue({ data: { employees: [] } });
    const { result } = renderHook(() => useLeaveManager(1, confirm));
    await waitFor(() => expect(result.current.leaveLoading).toBe(false));
    const before = mockGet.mock.calls.length;

    act(() => result.current.setLeaveYear(2025));
    await waitFor(() => expect(mockGet.mock.calls.length).toBeGreaterThan(before));
  });
});

const monthSpecific = (targetMonth: number, empId: number, schedules: any[]) => {
  return (url: string) => {
    const m = /month=(\d+)/.exec(url);
    const month = m ? Number(m[1]) : 1;
    if (month === targetMonth) return Promise.resolve(monthResponse(empId, schedules));
    return Promise.resolve({ data: { employees: [] } });
  };
};

describe("useLeaveManager · deleteUsedLeave", () => {
  it("confirm true · PUT · 로컬 상태에서 제거", async () => {
    mockGet.mockImplementation(monthSpecific(3, 1, [
      { date: "2026-03-15", type: "월차", memo: "" },
    ]));
    mockPut.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useLeaveManager(1, confirm));
    await waitFor(() => expect(result.current.usedLeaves).toHaveLength(1));

    await act(async () => { await result.current.deleteUsedLeave(1, "2026-03-15"); });
    expect(mockPut).toHaveBeenCalledWith("/api/schedules", expect.objectContaining({
      employeeId: 1, date: "2026-03-15", type: "",
    }));
    expect(result.current.usedLeaves).toHaveLength(0);
  });

  it("confirm false · PUT 호출 안 함", async () => {
    confirm.mockResolvedValue(false);
    mockGet.mockImplementation(monthSpecific(3, 1, [
      { date: "2026-03-15", type: "월차", memo: "" },
    ]));

    const { result } = renderHook(() => useLeaveManager(1, confirm));
    await waitFor(() => expect(result.current.usedLeaves).toHaveLength(1));

    await act(async () => { await result.current.deleteUsedLeave(1, "2026-03-15"); });
    expect(mockPut).not.toHaveBeenCalled();
    expect(result.current.usedLeaves).toHaveLength(1);
  });
});
