// @vitest-environment jsdom
// 2026-08-23 · #188 · usePageVisibility 훅 · sanitize · isVisible · setVisible · 마이그레이션
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePageVisibility } from "./usePageVisibility";

// useKvSetting mock · in-memory storage
const kvStore = new Map<string, unknown>();
vi.mock("./useKvSetting", () => ({
  useKvSetting: <T,>(opts: { key: string; defaultValue: T; sanitize?: (raw: unknown) => T | null }) => {
    const cur = kvStore.get(opts.key);
    const value = (cur ?? opts.defaultValue) as T;
    return {
      value,
      setValue: (updater: T | ((prev: T) => T)) => {
        const next = typeof updater === "function" ? (updater as (p: T) => T)(value) : updater;
        kvStore.set(opts.key, next);
      },
      loaded: true,
      saveState: "idle" as const,
      reload: () => {},
    };
  },
}));

// useMobilePageLevel mock (마이그레이션 소스)
let legacyLevel: Record<string, number> = {};
vi.mock("./useMobilePageLevel", () => ({
  useMobilePageLevel: () => ({
    minLevelMap: legacyLevel,
    loaded: true,
    saveState: "idle" as const,
    getMinLevel: (k: string) => legacyLevel[k] ?? 0,
    setMinLevel: vi.fn(),
    canAccessOnMobile: vi.fn(),
    setAll: vi.fn(),
    reload: vi.fn(),
  }),
}));

beforeEach(() => {
  kvStore.clear();
  legacyLevel = {};
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("usePageVisibility · 기본 동작", () => {
  it("값 없으면 · isVisible 둘 다 true (기본 노출)", () => {
    const { result } = renderHook(() => usePageVisibility());
    expect(result.current.isVisible("landing", "pc")).toBe(true);
    expect(result.current.isVisible("landing", "mobile")).toBe(true);
  });

  it("setVisible false · isVisible false 반환", () => {
    const { result } = renderHook(() => usePageVisibility());
    act(() => { result.current.setVisible("display", "mobile", false); });
    const { result: r2 } = renderHook(() => usePageVisibility());
    expect(r2.current.isVisible("display", "mobile")).toBe(false);
    expect(r2.current.isVisible("display", "pc")).toBe(true);
  });

  it("둘 다 true 로 돌아오면 · 항목 삭제 (데이터 최소화)", () => {
    kvStore.set("page_visibility", { display: { pc: true, mobile: false } });
    const { result } = renderHook(() => usePageVisibility());
    act(() => { result.current.setVisible("display", "mobile", true); });
    const saved = kvStore.get("page_visibility") as Record<string, unknown>;
    expect(saved["display"]).toBeUndefined();
  });

  it("PC · 모바일 · 각각 독립 토글", () => {
    const { result } = renderHook(() => usePageVisibility());
    act(() => { result.current.setVisible("stockcheck", "pc", false); });
    const { result: r2 } = renderHook(() => usePageVisibility());
    expect(r2.current.isVisible("stockcheck", "pc")).toBe(false);
    expect(r2.current.isVisible("stockcheck", "mobile")).toBe(true);
  });
});

describe("usePageVisibility · 자동 마이그레이션 (레벨 → 체크박스)", () => {
  it("page_visibility 비어있고 · legacy 레벨 5+ · mobile OFF 로 마이그레이션", async () => {
    legacyLevel = { display: 5, stockcheck: 9, landing: 3 };
    renderHook(() => usePageVisibility());
    // useEffect 실행 대기
    await waitFor(() => {
      const saved = kvStore.get("page_visibility") as Record<string, unknown>;
      expect(saved).toBeDefined();
    });
    const saved = kvStore.get("page_visibility") as Record<string, { pc: boolean; mobile: boolean }>;
    expect(saved["display"]).toEqual({ pc: true, mobile: false });
    expect(saved["stockcheck"]).toEqual({ pc: true, mobile: false });
    // 레벨 3 (< 5) · 마이그레이션 안 함
    expect(saved["landing"]).toBeUndefined();
  });

  it("page_visibility 이미 있으면 · 마이그레이션 skip", async () => {
    kvStore.set("page_visibility", { display: { pc: true, mobile: false } });
    legacyLevel = { schedule: 9 }; // legacy 는 있지만 마이그레이션 안 함
    renderHook(() => usePageVisibility());
    await new Promise(r => setTimeout(r, 50));
    const saved = kvStore.get("page_visibility") as Record<string, unknown>;
    // 원래 값 유지 · schedule 은 마이그레이션 안 됨
    expect(saved["schedule"]).toBeUndefined();
    expect(saved["display"]).toEqual({ pc: true, mobile: false });
  });

  it("legacy 레벨 없음 · 마이그레이션 skip · 빈 값 유지", async () => {
    legacyLevel = {};
    renderHook(() => usePageVisibility());
    await new Promise(r => setTimeout(r, 50));
    const saved = kvStore.get("page_visibility");
    expect(saved).toBeUndefined();
  });
});
