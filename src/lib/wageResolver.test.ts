// src/lib/wageResolver.test.ts
// 2026-10-07 · Phase 2 · 임금 결정 SSOT 검증
import { describe, it, expect } from "vitest";
import { resolveEmployeeWage } from "./wageResolver";

const emptySettings = { wageRates: {}, employeeWageOverrides: {} };

describe("resolveEmployeeWage · priority chain", () => {
  it("A. override 있음 → employee_override · configured", () => {
    const result = resolveEmployeeWage(42, "약사", {
      wageRates: { "약사": { weekday: 35000, weekend: 40000 } },
      employeeWageOverrides: { 42: { weekday: 50000, weekend: 55000 } },
    });
    expect(result.status).toBe("configured");
    expect(result.source).toBe("employee_override");
    expect(result.wage).toEqual({ weekday: 50000, weekend: 55000 });
  });

  it("B. override 없음 + base 있음 → base_rate · configured", () => {
    const result = resolveEmployeeWage(42, "약사", {
      wageRates: { "약사": { weekday: 35000, weekend: 40000 } },
      employeeWageOverrides: {},
    });
    expect(result.status).toBe("configured");
    expect(result.source).toBe("base_rate");
    expect(result.wage).toEqual({ weekday: 35000, weekend: 40000 });
  });

  it("C. 둘 다 없음 → unconfigured · wage=null · laborCost=unknown", () => {
    const result = resolveEmployeeWage(42, "캐셔", emptySettings);
    expect(result.status).toBe("unconfigured");
    expect(result.source).toBeNull();
    expect(result.wage).toBeNull();
  });

  it("D. 하드코드 35000/40000 fallback = 0 (resolver 리턴 null · 호출측 UI 결정)", () => {
    const result = resolveEmployeeWage(null, "약사", emptySettings);
    expect(result.status).toBe("unconfigured");
    expect(result.wage).toBeNull();
    // 하드코드 fallback 복원 금지 보장
  });

  it("employeeId null 이면 override skip · position base 확인", () => {
    const result = resolveEmployeeWage(null, "약사", {
      wageRates: { "약사": { weekday: 35000, weekend: 40000 } },
      employeeWageOverrides: { 1: { weekday: 99999, weekend: 99999 } },
    });
    expect(result.source).toBe("base_rate");
    expect(result.wage).toEqual({ weekday: 35000, weekend: 40000 });
  });

  it("position 빈 문자열 → unconfigured (base lookup skip)", () => {
    const result = resolveEmployeeWage(null, "", {
      wageRates: { "약사": { weekday: 35000, weekend: 40000 } },
      employeeWageOverrides: {},
    });
    expect(result.status).toBe("unconfigured");
  });

  it("임의 position 매핑 금지 · '대표' key 없으면 unconfigured (약사 변환 X)", () => {
    const result = resolveEmployeeWage(null, "대표", {
      wageRates: { "약사": { weekday: 35000, weekend: 40000 } },
      employeeWageOverrides: {},
    });
    expect(result.status).toBe("unconfigured");
    expect(result.wage).toBeNull();
  });

  it("override 가 0/0 이어도 configured 로 인정 (사용자 명시적 0 저장 존중)", () => {
    const result = resolveEmployeeWage(42, "약사", {
      wageRates: {},
      employeeWageOverrides: { 42: { weekday: 0, weekend: 0 } },
    });
    expect(result.status).toBe("configured");
    expect(result.source).toBe("employee_override");
    expect(result.wage).toEqual({ weekday: 0, weekend: 0 });
  });

  it("override 가 invalid shape → base rate 로 fallback", () => {
    const result = resolveEmployeeWage(42, "약사", {
      wageRates: { "약사": { weekday: 35000, weekend: 40000 } },
      employeeWageOverrides: { 42: { weekday: "invalid" as any, weekend: 40000 } },
    });
    expect(result.source).toBe("base_rate");
    expect(result.wage).toEqual({ weekday: 35000, weekend: 40000 });
  });
});
