// @vitest-environment jsdom
// 2026-08-21 · useAutoBalanceLoad · 공급사별 최신 잔고 자동 채움
//   - 이미 사용자 override 있으면 skip
//   - 공급사 매칭 (rawSupplierByPage → page.meta.supplier fallback)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAutoBalanceLoad } from "./useAutoBalanceLoad";
import type { RawPage } from "./types";

function makePage(page: number, supplier?: string): RawPage {
  return {
    page,
    headers: ["h"],
    rows: [["a"]],
    meta: { supplier },
  };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => { /* noop */ });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAutoBalanceLoad · 공급사 잔고 자동 채움", () => {
  it("records 없음 · setPageBalanceOverride 미호출", () => {
    const setBal = vi.fn();
    renderHook(() =>
      useAutoBalanceLoad({
        supplierBalanceRecords: [],
        structuredPages: [makePage(1, "동아")],
        rawSupplierByPage: {},
        setPageBalanceOverride: setBal,
      }),
    );
    expect(setBal).not.toHaveBeenCalled();
  });

  it("structuredPages 없음 · setPageBalanceOverride 미호출", () => {
    const setBal = vi.fn();
    renderHook(() =>
      useAutoBalanceLoad({
        supplierBalanceRecords: [{ supplier_name: "동아", balance: 5000 }],
        structuredPages: [],
        rawSupplierByPage: {},
        setPageBalanceOverride: setBal,
      }),
    );
    expect(setBal).not.toHaveBeenCalled();
  });

  it("공급사 매칭 · balance 채움", () => {
    const setBal = vi.fn();
    renderHook(() =>
      useAutoBalanceLoad({
        supplierBalanceRecords: [{ supplier_name: "동아", balance: 5000 }],
        structuredPages: [makePage(1, "동아")],
        rawSupplierByPage: {},
        setPageBalanceOverride: setBal,
      }),
    );
    expect(setBal).toHaveBeenCalledTimes(1);
    // updater 함수 호출 · prev({}) → { 1: 5000 }
    const updater = setBal.mock.calls[0][0];
    expect(updater({})).toEqual({ 1: 5000 });
  });

  it("첫 등장이 최신 (created_at DESC 가정)", () => {
    const setBal = vi.fn();
    renderHook(() =>
      useAutoBalanceLoad({
        supplierBalanceRecords: [
          { supplier_name: "동아", balance: 5000 },  // 최신
          { supplier_name: "동아", balance: 3000 },  // 과거
        ],
        structuredPages: [makePage(1, "동아")],
        rawSupplierByPage: {},
        setPageBalanceOverride: setBal,
      }),
    );
    const updater = setBal.mock.calls[0][0];
    expect(updater({})).toEqual({ 1: 5000 });
  });

  it("사용자 override 있으면 skip", () => {
    const setBal = vi.fn();
    renderHook(() =>
      useAutoBalanceLoad({
        supplierBalanceRecords: [{ supplier_name: "동아", balance: 5000 }],
        structuredPages: [makePage(1, "동아")],
        rawSupplierByPage: {},
        setPageBalanceOverride: setBal,
      }),
    );
    const updater = setBal.mock.calls[0][0];
    // prev 에 이미 값 있음 → 유지
    expect(updater({ 1: 999 })).toEqual({ 1: 999 });
  });

  it("balance <= 0 · 채움 X", () => {
    const setBal = vi.fn();
    renderHook(() =>
      useAutoBalanceLoad({
        supplierBalanceRecords: [{ supplier_name: "동아", balance: 0 }],
        structuredPages: [makePage(1, "동아")],
        rawSupplierByPage: {},
        setPageBalanceOverride: setBal,
      }),
    );
    const updater = setBal.mock.calls[0][0];
    // 변경 없음 → prev 그대로
    expect(updater({})).toEqual({});
  });

  it("rawSupplierByPage · meta.supplier 보다 우선", () => {
    const setBal = vi.fn();
    renderHook(() =>
      useAutoBalanceLoad({
        supplierBalanceRecords: [
          { supplier_name: "재정의", balance: 8000 },
          { supplier_name: "동아", balance: 5000 },
        ],
        structuredPages: [makePage(1, "동아")],
        rawSupplierByPage: { 1: "재정의" },
        setPageBalanceOverride: setBal,
      }),
    );
    const updater = setBal.mock.calls[0][0];
    expect(updater({})).toEqual({ 1: 8000 });
  });

  it("여러 페이지 · 각 공급사 매칭", () => {
    const setBal = vi.fn();
    renderHook(() =>
      useAutoBalanceLoad({
        supplierBalanceRecords: [
          { supplier_name: "동아", balance: 5000 },
          { supplier_name: "메가팜", balance: 7000 },
        ],
        structuredPages: [makePage(1, "동아"), makePage(2, "메가팜")],
        rawSupplierByPage: {},
        setPageBalanceOverride: setBal,
      }),
    );
    const updater = setBal.mock.calls[0][0];
    expect(updater({})).toEqual({ 1: 5000, 2: 7000 });
  });

  it("공급사 없음 · 스킵", () => {
    const setBal = vi.fn();
    renderHook(() =>
      useAutoBalanceLoad({
        supplierBalanceRecords: [{ supplier_name: "동아", balance: 5000 }],
        structuredPages: [makePage(1)],   // supplier 없음
        rawSupplierByPage: {},
        setPageBalanceOverride: setBal,
      }),
    );
    const updater = setBal.mock.calls[0][0];
    expect(updater({})).toEqual({});
  });
});
