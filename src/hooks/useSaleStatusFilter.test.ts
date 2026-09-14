// @vitest-environment jsdom
// src/hooks/useSaleStatusFilter.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSaleStatusFilter, isActiveStatus } from "./useSaleStatusFilter";

describe("isActiveStatus", () => {
  it("판매중 정확 매칭", () => {
    expect(isActiveStatus("판매중")).toBe(true);
    expect(isActiveStatus(" 판매중 ")).toBe(true);
    expect(isActiveStatus("판매중지")).toBe(false);
    expect(isActiveStatus("")).toBe(false);
    expect(isActiveStatus(null)).toBe(false);
    expect(isActiveStatus(undefined)).toBe(false);
  });
});

describe("useSaleStatusFilter", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("기본값 · active (판매중)", () => {
    const { result } = renderHook(() => useSaleStatusFilter());
    expect(result.current.value).toBe("active");
  });

  it("defaultValue override 반영", () => {
    const { result } = renderHook(() => useSaleStatusFilter({ defaultValue: "all" }));
    expect(result.current.value).toBe("all");
  });

  // 2026-09-10 · 사용자 지시 · localStorage 사용 X · 매 세션 default 강제 · 관련 test 삭제
  it("setValue · in-memory 만 반영 · 재마운트 시 default 로 복귀", () => {
    const { result } = renderHook(() => useSaleStatusFilter());
    act(() => { result.current.setValue("inactive"); });
    expect(result.current.value).toBe("inactive");
    // 새 훅 인스턴스 · default (active) 로 초기화 (localStorage 사용 X)
    const { result: r2 } = renderHook(() => useSaleStatusFilter());
    expect(r2.current.value).toBe("active");
  });

  it("storageKey option · 하위 호환 · 실제 저장 X · 값 유지 안 됨", () => {
    const { result: rA } = renderHook(() => useSaleStatusFilter({ storageKey: "pageA" }));
    act(() => { rA.current.setValue("all"); });
    expect(rA.current.value).toBe("all");
    // 재마운트 · default 복귀 · localStorage 저장 안 함
    const { result: rA2 } = renderHook(() => useSaleStatusFilter({ storageKey: "pageA" }));
    expect(rA2.current.value).toBe("active");
  });

  it("matches · value=active · 판매중만 true", () => {
    const { result } = renderHook(() => useSaleStatusFilter({ defaultValue: "active" }));
    expect(result.current.matches("판매중")).toBe(true);
    expect(result.current.matches("판매중지")).toBe(false);
    expect(result.current.matches(null)).toBe(false);
  });

  it("matches · value=inactive · 판매중이 아닌 것만 true", () => {
    const { result } = renderHook(() => useSaleStatusFilter({ defaultValue: "inactive" }));
    expect(result.current.matches("판매중")).toBe(false);
    expect(result.current.matches("판매중지")).toBe(true);
    expect(result.current.matches(null)).toBe(true);
  });

  it("matches · value=all · 항상 true", () => {
    const { result } = renderHook(() => useSaleStatusFilter({ defaultValue: "all" }));
    expect(result.current.matches("판매중")).toBe(true);
    expect(result.current.matches("판매중지")).toBe(true);
    expect(result.current.matches(null)).toBe(true);
  });

  // 2026-09-10 · localStorage 사용 X · 손상값 test 제거 (불필요)
  it("localStorage 손상값 · 매 세션 · default 유지 (localStorage 무시)", () => {
    localStorage.setItem("saleStatusFilter", "invalid_value");
    const { result } = renderHook(() => useSaleStatusFilter());
    expect(result.current.value).toBe("active");
  });
});
