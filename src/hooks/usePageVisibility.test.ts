// @vitest-environment jsdom
// 2026-08-23 · #188 · usePageVisibility 훅 · sanitize · isVisible · setVisible
// 2026-10-06 (DEPRECATED) · 단일 visibility 정책 · PC/mobile 동일 결과
// 2026-10-13 · 사용자 재지시 · PC/모바일 분리 복원 (2026-10-06 통일 override)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePageVisibility } from "./usePageVisibility";

// useKvSetting mock · in-memory storage (sanitize 통과)
const kvStore = new Map<string, unknown>();
vi.mock("./useKvSetting", () => ({
  useKvSetting: <T,>(opts: { key: string; defaultValue: T; sanitize?: (raw: unknown) => T | null }) => {
    const cur = kvStore.get(opts.key);
    const raw = cur ?? opts.defaultValue;
    const sanitized = opts.sanitize ? (opts.sanitize(raw) ?? opts.defaultValue) : raw;
    const value = sanitized as T;
    return {
      value,
      setValue: (updater: T | ((prev: T) => T)) => {
        const next = typeof updater === "function" ? (updater as (p: T) => T)(value) : updater;
        kvStore.set(opts.key, next);
      },
      loaded: true,
      saveState: "idle" as const,
      reload: () => {},
      saveNow: () => Promise.resolve(true),
    };
  },
}));

beforeEach(() => {
  kvStore.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("usePageVisibility · 2026-10-13 PC/모바일 분리 정책", () => {
  it("값 없으면 · 둘 다 true (기본 노출)", () => {
    const { result } = renderHook(() => usePageVisibility());
    expect(result.current.isVisible("landing", "pc")).toBe(true);
    expect(result.current.isVisible("landing", "mobile")).toBe(true);
  });

  it("setVisible pc=false · 모바일 true 유지 (분리 저장)", () => {
    const { result } = renderHook(() => usePageVisibility());
    act(() => { result.current.setVisible("display", "pc", false); });
    const saved = kvStore.get("page_visibility") as Record<string, { pc: boolean; mobile: boolean }>;
    expect(saved["display"]).toEqual({ pc: false, mobile: true });
    const { result: r2 } = renderHook(() => usePageVisibility());
    expect(r2.current.isVisible("display", "pc")).toBe(false);
    expect(r2.current.isVisible("display", "mobile")).toBe(true);
  });

  it("setVisible mobile=false · PC true 유지 (분리 저장)", () => {
    const { result } = renderHook(() => usePageVisibility());
    act(() => { result.current.setVisible("display", "mobile", false); });
    const saved = kvStore.get("page_visibility") as Record<string, { pc: boolean; mobile: boolean }>;
    expect(saved["display"]).toEqual({ pc: true, mobile: false });
    const { result: r2 } = renderHook(() => usePageVisibility());
    expect(r2.current.isVisible("display", "pc")).toBe(true);
    expect(r2.current.isVisible("display", "mobile")).toBe(false);
  });

  it("양쪽 모두 true 로 돌아오면 · 항목 삭제 (데이터 최소화)", () => {
    // mock useKvSetting 은 setValue 호출 시 re-render 하지 않으므로 · 각 토글마다 renderHook 재호출 (실제 React 환경 재현)
    kvStore.set("page_visibility", { display: { pc: false, mobile: false } });
    const { result: r1 } = renderHook(() => usePageVisibility());
    act(() => { r1.current.setVisible("display", "pc", true); });
    const { result: r2 } = renderHook(() => usePageVisibility());
    act(() => { r2.current.setVisible("display", "mobile", true); });
    const saved = kvStore.get("page_visibility") as Record<string, unknown>;
    expect(saved["display"]).toBeUndefined();
  });

  it("divergence 데이터 (pc=true/mobile=false) · 그대로 보존 (분리 정책)", () => {
    kvStore.set("page_visibility", { display: { pc: true, mobile: false } });
    const { result } = renderHook(() => usePageVisibility());
    expect(result.current.isVisible("display", "pc")).toBe(true);
    expect(result.current.isVisible("display", "mobile")).toBe(false);
  });

  it("divergence 데이터 (pc=false/mobile=true) · 그대로 보존 (분리 정책)", () => {
    kvStore.set("page_visibility", { stockcheck: { pc: false, mobile: true } });
    const { result } = renderHook(() => usePageVisibility());
    expect(result.current.isVisible("stockcheck", "pc")).toBe(false);
    expect(result.current.isVisible("stockcheck", "mobile")).toBe(true);
  });

  it("composite key fallback · 'approval-request:lunch' leaf 'lunch' 조회", () => {
    kvStore.set("page_visibility", { "approval-request:lunch": { pc: false, mobile: true } });
    const { result } = renderHook(() => usePageVisibility());
    expect(result.current.isVisible("lunch", "pc")).toBe(false);
    expect(result.current.isVisible("lunch", "mobile")).toBe(true);
  });

  it("자동 마이그레이션 없음 (레거시 mobile_min_level 참조 안함)", () => {
    const { result } = renderHook(() => usePageVisibility());
    expect(result.current.isVisible("display", "pc")).toBe(true);
    expect(result.current.isVisible("display", "mobile")).toBe(true);
    const saved = kvStore.get("page_visibility");
    expect(saved).toBeUndefined();
  });

  it("PC 체크 해제 · 모바일 체크 해제 · 둘 다 숨김 (독립 호출)", () => {
    const { result } = renderHook(() => usePageVisibility());
    act(() => { result.current.setVisible("display", "pc", false); });
    const { result: r2 } = renderHook(() => usePageVisibility());
    act(() => { r2.current.setVisible("display", "mobile", false); });
    const saved = kvStore.get("page_visibility") as Record<string, { pc: boolean; mobile: boolean }>;
    expect(saved["display"]).toEqual({ pc: false, mobile: false });
  });
});
