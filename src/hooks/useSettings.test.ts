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
