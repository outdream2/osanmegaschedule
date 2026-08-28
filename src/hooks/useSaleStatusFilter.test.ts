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

  it("setValue · localStorage 저장 + 재로드 시 유지", () => {
    const { result } = renderHook(() => useSaleStatusFilter());
    act(() => { result.current.setValue("inactive"); });
    expect(result.current.value).toBe("inactive");
    expect(localStorage.getItem("saleStatusFilter")).toBe("inactive");

    // 새 훅 인스턴스 · localStorage 값 로드
    const { result: r2 } = renderHook(() => useSaleStatusFilter());
    expect(r2.current.value).toBe("inactive");
  });

  it("storageKey override · 페이지별 분리 저장", () => {
    const { result: rA } = renderHook(() => useSaleStatusFilter({ storageKey: "pageA" }));
    const { result: rB } = renderHook(() => useSaleStatusFilter({ storageKey: "pageB" }));
    act(() => { rA.current.setValue("all"); });
    act(() => { rB.current.setValue("inactive"); });
    expect(localStorage.getItem("pageA")).toBe("all");
    expect(localStorage.getItem("pageB")).toBe("inactive");
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

  it("localStorage 손상값 · 기본값 fallback", () => {
    localStorage.setItem("saleStatusFilter", "invalid_value");
    const { result } = renderHook(() => useSaleStatusFilter());
    expect(result.current.value).toBe("active");
  });
});
