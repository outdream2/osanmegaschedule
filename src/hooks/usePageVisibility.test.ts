// @vitest-environment jsdom
// 2026-08-23 · #188 · usePageVisibility 훅 · sanitize · isVisible · setVisible
// 2026-10-06 · 사용자 지시 · 단일 visibility 정책 · PC/mobile 동일 결과 · 자동 마이그레이션 제거
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePageVisibility } from "./usePageVisibility";

// useKvSetting mock · in-memory storage (sanitize 통과)
const kvStore = new Map<string, unknown>();
vi.mock("./useKvSetting", () => ({
  useKvSetting: <T,>(opts: { key: string; defaultValue: T; sanitize?: (raw: unknown) => T | null }) => {
    const cur = kvStore.get(opts.key);
    // 2026-10-06 · sanitize 가 pc=mobile 통일을 담당하므로 read 시 적용
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
    };
  },
}));

beforeEach(() => {
  kvStore.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("usePageVisibility · 단일 visibility 정책 (2026-10-06)", () => {
  it("값 없으면 · 둘 다 true (기본 노출)", () => {
    const { result } = renderHook(() => usePageVisibility());
    expect(result.current.isVisible("landing", "pc")).toBe(true);
    expect(result.current.isVisible("landing", "mobile")).toBe(true);
  });

  it("setVisible false · PC/모바일 둘 다 false 저장 · isVisible 둘 다 false", () => {
    const { result } = renderHook(() => usePageVisibility());
    act(() => { result.current.setVisible("display", "pc", false); });
    const saved = kvStore.get("page_visibility") as Record<string, { pc: boolean; mobile: boolean }>;
    expect(saved["display"]).toEqual({ pc: false, mobile: false });
    const { result: r2 } = renderHook(() => usePageVisibility());
    expect(r2.current.isVisible("display", "pc")).toBe(false);
    expect(r2.current.isVisible("display", "mobile")).toBe(false);
  });

  it("setVisible true 로 돌아오면 · 항목 삭제 (데이터 최소화)", () => {
    kvStore.set("page_visibility", { display: { pc: false, mobile: false } });
    const { result } = renderHook(() => usePageVisibility());
    act(() => { result.current.setVisible("display", "pc", true); });
    const saved = kvStore.get("page_visibility") as Record<string, unknown>;
    expect(saved["display"]).toBeUndefined();
  });

  it("legacy DB · pc=true/mobile=false divergence · canonical pc 로 통일 (양쪽 true 반환)", () => {
    // 과거 저장된 divergence · sanitize 가 mobile=pc 로 교정
    kvStore.set("page_visibility", { display: { pc: true, mobile: false } });
    const { result } = renderHook(() => usePageVisibility());
    expect(result.current.isVisible("display", "pc")).toBe(true);
    expect(result.current.isVisible("display", "mobile")).toBe(true);
  });

  it("legacy DB · pc=false/mobile=true divergence · canonical pc 로 통일 (양쪽 false 반환)", () => {
    kvStore.set("page_visibility", { stockcheck: { pc: false, mobile: true } });
    const { result } = renderHook(() => usePageVisibility());
    expect(result.current.isVisible("stockcheck", "pc")).toBe(false);
    expect(result.current.isVisible("stockcheck", "mobile")).toBe(false);
  });

  it("viewport 무관 · isVisible 결과 항상 동일 (SideNav/BottomNav/Header 통일)", () => {
    kvStore.set("page_visibility", { display: { pc: false, mobile: false } });
    const { result } = renderHook(() => usePageVisibility());
    const pcResult = result.current.isVisible("display", "pc");
    const mobileResult = result.current.isVisible("display", "mobile");
    expect(pcResult).toBe(mobileResult);
    expect(pcResult).toBe(false);
  });

  it("composite key fallback · 'approval-request:lunch' leaf 'lunch' 조회", () => {
    kvStore.set("page_visibility", { "approval-request:lunch": { pc: false, mobile: false } });
    const { result } = renderHook(() => usePageVisibility());
    expect(result.current.isVisible("lunch", "pc")).toBe(false);
    expect(result.current.isVisible("lunch", "mobile")).toBe(false);
  });

  it("자동 마이그레이션 제거 확인 · mobile_min_level 영향 없음 (레거시 제거됨)", () => {
    // 2026-10-06 · usePageVisibility 는 더 이상 useMobilePageLevel 참조 안함
    //   · divergence 재발 방지 · 설정은 UI 체크박스로만 변경
    const { result } = renderHook(() => usePageVisibility());
    expect(result.current.isVisible("display", "pc")).toBe(true);
    expect(result.current.isVisible("display", "mobile")).toBe(true);
    // storage 는 비어있음 · auto-migration 저장 없음
    const saved = kvStore.get("page_visibility");
    expect(saved).toBeUndefined();
  });
});
