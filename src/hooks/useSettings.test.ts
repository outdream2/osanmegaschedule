// @vitest-environment jsdom
// 2026-08-20 · useSettings · positions·wageRates·scheduleTypes 통합 설정
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../lib/apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import {
  useSettings,
  defaultWageForPosition,
  DEFAULT_PHARMACIST_WAGE,
  DEFAULT_STAFF_WAGE,
} from "./useSettings";
import { api } from "../lib/apiClient";

const mockGet = api.get as ReturnType<typeof vi.fn>;
const mockPost = api.post as ReturnType<typeof vi.fn>;

// 각 테스트 · 완전 격리 · vi.useFakeTimers 로 800ms save timer 제어
beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { value: null } });
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: {} });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DEFAULT wage 상수", () => {
  it("PHARMACIST · 주중 35000·주말 40000", () => {
    expect(DEFAULT_PHARMACIST_WAGE).toEqual({ weekday: 35000, weekend: 40000 });
  });

  it("STAFF · 2026년 최저 기반 (10030/12000)", () => {
    expect(DEFAULT_STAFF_WAGE).toEqual({ weekday: 10030, weekend: 12000 });
  });
});

describe("defaultWageForPosition", () => {
  it("약사 · PHARMACIST_WAGE", () => {
    expect(defaultWageForPosition("약사")).toEqual(DEFAULT_PHARMACIST_WAGE);
  });

  it("그 외 (캐셔/물류/대표) · STAFF_WAGE", () => {
    expect(defaultWageForPosition("캐셔")).toEqual(DEFAULT_STAFF_WAGE);
    expect(defaultWageForPosition("물류")).toEqual(DEFAULT_STAFF_WAGE);
    expect(defaultWageForPosition("대표")).toEqual(DEFAULT_STAFF_WAGE);
  });

  it("반환 · 새 객체 (mutation 방지)", () => {
    const a = defaultWageForPosition("약사");
    a.weekday = 99999;
    expect(DEFAULT_PHARMACIST_WAGE.weekday).toBe(35000);
  });
});

// DB 로드 · update 이전에 배치 (update 의 800ms save timer 가 다음 테스트로 흘러들어와
// dispatchSettingsUpdated 로 서버 값을 덮어쓰는 것 방지)
describe("useSettings · DB 로드", () => {
  it("서버 값 · positions 반영", async () => {
    mockGet.mockResolvedValue({
      data: { value: { positions: ["서버직군A", "서버직군B"], employmentTypes: ["정직원"] } }
    });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.positions).toEqual(["서버직군A", "서버직군B"]));
  });
});

describe("useSettings · 기본값", () => {
  it("초기 · positions·employmentTypes·workplaces 정의", () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.positions.length).toBeGreaterThan(0);
    expect(result.current.employmentTypes.length).toBeGreaterThan(0);
    expect(result.current.workplaces.length).toBeGreaterThan(0);
    expect(result.current.wageRates).toEqual({});
    expect(result.current.underConstruction).toBe(false);
  });

  it("scheduleTypes · DEFAULT · 배열", () => {
    const { result } = renderHook(() => useSettings());
    expect(Array.isArray(result.current.scheduleTypes)).toBe(true);
    expect(result.current.scheduleTypes.length).toBeGreaterThan(0);
  });
});

describe("useSettings · update", () => {
  it("positions patch · localStorage 저장", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.update({ positions: ["신직군1", "신직군2"] }));
    expect(result.current.positions).toEqual(["신직군1", "신직군2"]);
    const stored = JSON.parse(localStorage.getItem("app_settings")!);
    expect(stored.positions).toEqual(["신직군1", "신직군2"]);
  });

  it("underConstruction true 저장", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.update({ underConstruction: true }));
    expect(result.current.underConstruction).toBe(true);
  });

  it("wageRates patch · 병합", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.update({ wageRates: { 약사: { weekday: 40000, weekend: 45000 } } }));
    expect(result.current.wageRates["약사"]).toEqual({ weekday: 40000, weekend: 45000 });
  });
});

describe("useSettings · settings-updated 이벤트", () => {
  it("다른 인스턴스에서 dispatch · 동기화", async () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      window.dispatchEvent(new CustomEvent("settings-updated", {
        detail: {
          positions: ["동기화됨"],
          employmentTypes: ["정직원"],
          workplaces: ["매장"],
          scheduleTypes: [],
          wageRates: {},
          employeeWageOverrides: {},
          underConstruction: false,
        },
      }));
    });
    expect(result.current.positions).toEqual(["동기화됨"]);
  });
});

// 2026-10-07 · Phase 2 · P0-5 OPTION A · atomic path patch save
describe("useSettings · Phase 2 · P0-5 · atomic path patch", () => {
  it("update → debounce flush → POST /api/settings/patch 호출 (path patch)", async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValue({ data: { value: null } });
    mockPost.mockResolvedValue({ data: { ok: true, value: {} } });
    const { result } = renderHook(() => useSettings());
    act(() => result.current.update({ positions: ["약사"] }));
    // 800ms debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    // POST 호출 검증
    expect(mockPost).toHaveBeenCalled();
    const lastCall = mockPost.mock.calls[mockPost.mock.calls.length - 1];
    expect(lastCall[0]).toBe("/api/settings/patch");
    expect(lastCall[1]).toMatchObject({ key: "all_settings" });
    const patches = (lastCall[1] as any).patches;
    expect(Array.isArray(patches)).toBe(true);
    // positions 만 patch · path=["positions"]
    const positionsPatch = patches.find((p: any) => Array.isArray(p.path) && p.path[0] === "positions");
    expect(positionsPatch).toBeDefined();
    expect(positionsPatch.value).toEqual(["약사"]);
  });

  it("연속 update · 다른 top-level key · patch 에 둘 다 포함", async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValue({ data: { value: null } });
    mockPost.mockResolvedValue({ data: { ok: true, value: {} } });
    const { result } = renderHook(() => useSettings());
    act(() => result.current.update({ positions: ["약사"] }));
    act(() => result.current.update({ wageRates: { "약사": { weekday: 35000, weekend: 40000 } } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    const lastCall = mockPost.mock.calls[mockPost.mock.calls.length - 1];
    const patches = (lastCall[1] as any).patches;
    const paths = patches.map((p: any) => p.path);
    expect(paths).toContainEqual(["positions"]);
    expect(paths).toContainEqual(["wageRates"]);
  });

  it("saveNow · pending partial 즉시 flush", async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValue({ data: { value: null } });
    mockPost.mockResolvedValue({ data: { ok: true, value: {} } });
    const { result } = renderHook(() => useSettings());
    act(() => result.current.update({ underConstruction: true }));
    // 즉시 saveNow · debounce 대기 없이
    let ok: boolean = false;
    await act(async () => {
      ok = await result.current.saveNow();
    });
    expect(ok).toBe(true);
    const lastCall = mockPost.mock.calls[mockPost.mock.calls.length - 1];
    expect(lastCall[0]).toBe("/api/settings/patch");
    const patches = (lastCall[1] as any).patches;
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({ path: ["underConstruction"], value: true });
  });

  it("pending 비어있으면 saveNow · POST 호출 없음", async () => {
    mockGet.mockResolvedValue({ data: { value: { positions: ["약사"] } } });
    mockPost.mockResolvedValue({ data: { ok: true, value: {} } });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    mockPost.mockClear();
    const ok = await result.current.saveNow();
    expect(ok).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

// 2026-10-07 · Phase 2 · DB AUTHORITY · status flag · DB fetch 실패 시 business 계산 금지
describe("useSettings · Phase 2 · status flag", () => {
  it("mount 직후 · status=loading", () => {
    mockGet.mockResolvedValue({ data: { value: null } });
    const { result } = renderHook(() => useSettings());
    expect(result.current.status).toBe("loading");
    expect(result.current.isReady).toBe(false);
  });

  it("DB 응답 성공 (value 있음) · status=ready", async () => {
    mockGet.mockResolvedValue({ data: { value: { positions: ["약사"], employmentTypes: ["정직원"] } } });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.isReady).toBe(true);
    expect(result.current.errorMessage).toBeNull();
  });

  it("DB 응답 성공 (value=null · empty bootstrap) · status=ready · errorMessage=null", async () => {
    mockGet.mockResolvedValue({ data: { value: null } });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.errorMessage).toBeNull();
  });

  it("DB fetch 실패 · status=error · errorMessage 노출 · business 계산 금지", async () => {
    mockGet.mockRejectedValue(new Error("Network down"));
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.isReady).toBe(false);
    expect(result.current.errorMessage).toBe("Network down");
  });
});
