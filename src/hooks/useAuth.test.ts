// @vitest-environment jsdom
// 2026-08-20 · useAuth · localStorage 세션 + idle timeout + storage 이벤트
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "./useAuth";
import type { AuthSession } from "../types";

const STORAGE_KEY = "megatown_auth_session";

const validSession: AuthSession = {
  employeeId: 1,
  name: "홍길동",
  role: "admin",
  level: 9,
  loginAt: Date.now(),
  lastActiveAt: Date.now(),
} as any;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAuth · 초기 세션 로드", () => {
  it("localStorage 없음 · session=null", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.session).toBeNull();
  });

  it("유효 세션 · 반영", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));
    const { result } = renderHook(() => useAuth());
    expect(result.current.session).not.toBeNull();
    expect(result.current.session?.employeeId).toBe(1);
  });

  it("잘못된 role · null 반환", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...validSession, role: "invalid" }));
    const { result } = renderHook(() => useAuth());
    expect(result.current.session).toBeNull();
  });

  it("level 없음 (legacy) · null + localStorage 삭제", () => {
    const legacy = { ...validSession, level: undefined };
    delete (legacy as any).level;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const { result } = renderHook(() => useAuth());
    expect(result.current.session).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("잘못된 JSON · null", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    const { result } = renderHook(() => useAuth());
    expect(result.current.session).toBeNull();
  });
});

describe("useAuth · setSession", () => {
  it("session 저장 · loginAt·lastActiveAt 자동 세팅", () => {
    const { result } = renderHook(() => useAuth());
    const now = Date.now();
    act(() => {
      result.current.setSession({
        employeeId: 42, name: "이순신", role: "manager", level: 2,
      } as any);
    });
    expect(result.current.session?.employeeId).toBe(42);
    expect(result.current.session?.loginAt).toBeGreaterThanOrEqual(now);
    expect(result.current.session?.lastActiveAt).toBeGreaterThanOrEqual(now);
  });

  it("null 지정 · session 클리어 + localStorage 삭제", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));
    const { result } = renderHook(() => useAuth());
    expect(result.current.session).not.toBeNull();

    act(() => result.current.setSession(null));
    expect(result.current.session).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("useAuth · clearSession", () => {
  it("megatown_* 키 모두 삭제", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));
    localStorage.setItem("megatown_settings", "x");
    localStorage.setItem("megatown_theme", "dark");
    localStorage.setItem("other_key", "keep"); // 삭제 안 됨

    const { result } = renderHook(() => useAuth());
    act(() => result.current.clearSession());

    expect(result.current.session).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem("megatown_settings")).toBeNull();
    expect(localStorage.getItem("megatown_theme")).toBeNull();
    expect(localStorage.getItem("other_key")).toBe("keep");
  });
});

describe("useAuth · extendSession", () => {
  it("session 없음 · no-op", () => {
    const { result } = renderHook(() => useAuth());
    expect(() => act(() => result.current.extendSession())).not.toThrow();
  });

  it("세션 있음 · lastActiveAt 갱신", () => {
    const oldTime = Date.now() - 60000;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...validSession, lastActiveAt: oldTime }));
    const { result } = renderHook(() => useAuth());
    expect(result.current.session?.lastActiveAt).toBe(oldTime);

    act(() => result.current.extendSession());
    expect(result.current.session?.lastActiveAt).toBeGreaterThan(oldTime);
  });
});

describe("useAuth · 세션 만료 · 항상 적용 (2026-08-25 사용자 지시 · rememberMe 우회 제거)", () => {
  it("rememberMe=true 여도 · 100일 지난 세션은 만료 (absolute 24h 초과)", () => {
    // 2026-08-25 · 이전 · rememberMe true 시 · 무기한 유지
    // 변경 · '아이디 저장'과 '세션 만료' 분리 · rememberMe 무시 · 항상 만료 적용
    const veryOld = Date.now() - 100 * 24 * 60 * 60 * 1000; // 100일 전
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...validSession,
      rememberMe: true,
      loginAt: veryOld,
      lastActiveAt: veryOld,
    }));
    const { result } = renderHook(() => useAuth());
    // absolute timeout (24h) 초과 → 만료 · null
    expect(result.current.session).toBeNull();
  });

  it("rememberMe=false · 30분 idle 지난 세션도 만료", () => {
    const idle = Date.now() - 60 * 60 * 1000; // 1시간 전
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...validSession,
      rememberMe: false,
      loginAt: idle,
      lastActiveAt: idle,
    }));
    const { result } = renderHook(() => useAuth());
    expect(result.current.session).toBeNull();
  });
});

describe("useAuth · 초기 상태 · showTimeoutWarning=false", () => {
  it("경고 배너 · 기본 false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.showTimeoutWarning).toBe(false);
  });
});
