// 2026-08-21 · OcrPage · types.ts · fmt 포맷터 검증
import { describe, it, expect } from "vitest";
import { fmt } from "./types";

describe("fmt · 숫자 → ko-KR 로케일 문자열", () => {
  it("null · '-' 반환", () => {
    expect(fmt(null)).toBe("-");
  });

  it("undefined · '-' 반환", () => {
    expect(fmt(undefined)).toBe("-");
  });

  it("정수 · 쉼표 구분자", () => {
    expect(fmt(1000)).toBe("1,000");
    expect(fmt(1234567)).toBe("1,234,567");
  });

  it("0 · '0'", () => {
    expect(fmt(0)).toBe("0");
  });

  it("음수 · 마이너스 부호 유지", () => {
    expect(fmt(-1234)).toBe("-1,234");
  });

  it("소수점 · 그대로", () => {
    expect(fmt(1234.5)).toBe("1,234.5");
  });

  it("한 자리 · 쉼표 없음", () => {
    expect(fmt(9)).toBe("9");
  });

  it("100 · 쉼표 없음", () => {
    expect(fmt(100)).toBe("100");
  });

  it("1000 · 쉼표 있음", () => {
    expect(fmt(1000)).toBe("1,000");
  });
});
