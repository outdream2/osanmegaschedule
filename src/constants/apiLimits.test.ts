// 2026-08-20 · apiLimits · API 조회 limit 상수
import { describe, it, expect } from "vitest";
import { API_LIMITS } from "./apiLimits";

describe("API_LIMITS · 조회 상한", () => {
  it("MEDIUM · 500", () => {
    expect(API_LIMITS.MEDIUM).toBe(500);
  });

  it("LARGE · 5000", () => {
    expect(API_LIMITS.LARGE).toBe(5000);
  });

  it("MAX · 50000", () => {
    expect(API_LIMITS.MAX).toBe(50000);
  });

  it("MEDIUM < LARGE < MAX · 오름차순", () => {
    expect(API_LIMITS.MEDIUM).toBeLessThan(API_LIMITS.LARGE);
    expect(API_LIMITS.LARGE).toBeLessThan(API_LIMITS.MAX);
  });
});
