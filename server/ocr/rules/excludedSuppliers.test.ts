// 2026-08-20 · excludedSuppliers · normalizeBizNum · isExcludedBusinessNumber
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_EXCLUDED_SUPPLIERS,
  DEFAULT_EXCLUDED_BUSINESS_NUMBERS,
  normalizeBizNum,
  isExcludedBusinessNumber,
} from "./excludedSuppliers";

describe("DEFAULT_EXCLUDED_SUPPLIERS · 기본 제외 리스트", () => {
  it("배열 · 20개 이상", () => {
    expect(Array.isArray(DEFAULT_EXCLUDED_SUPPLIERS)).toBe(true);
    expect(DEFAULT_EXCLUDED_SUPPLIERS.length).toBeGreaterThanOrEqual(20);
  });

  it("코스트팜 관련 · 오독 4종 포함 (팜/탐/팔/탕)", () => {
    expect(DEFAULT_EXCLUDED_SUPPLIERS).toContain("코스트팜");
    expect(DEFAULT_EXCLUDED_SUPPLIERS).toContain("코스트탐");
    expect(DEFAULT_EXCLUDED_SUPPLIERS).toContain("코스트팔");
    expect(DEFAULT_EXCLUDED_SUPPLIERS).toContain("코스트탕");
  });

  it("배송사 · 5종 이상", () => {
    ["고려택배", "한진택배", "롯데택배", "CJ대한통운", "우체국택배", "로젠택배"].forEach((n) => {
      expect(DEFAULT_EXCLUDED_SUPPLIERS).toContain(n);
    });
  });
});

describe("DEFAULT_EXCLUDED_BUSINESS_NUMBERS", () => {
  it("최소 1개 · 3101805493 (수신처)", () => {
    expect(DEFAULT_EXCLUDED_BUSINESS_NUMBERS.length).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_EXCLUDED_BUSINESS_NUMBERS).toContain("3101805493");
  });
});

describe("normalizeBizNum · 정규화", () => {
  it("숫자만 · 하이픈/공백 제거", () => {
    expect(normalizeBizNum("310-18-05493")).toBe("3101805493");
    expect(normalizeBizNum("310 18 05493")).toBe("3101805493");
    expect(normalizeBizNum("310.18.05493")).toBe("3101805493");
  });

  it("숫자만 · 이미 정제된 값", () => {
    expect(normalizeBizNum("3101805493")).toBe("3101805493");
  });

  it("빈/null/undefined · 빈 문자열", () => {
    expect(normalizeBizNum("")).toBe("");
    expect(normalizeBizNum(null as any)).toBe("");
    expect(normalizeBizNum(undefined as any)).toBe("");
  });

  it("문자 포함 · 문자 제거", () => {
    expect(normalizeBizNum("ABC 310 18 05493 XYZ")).toBe("3101805493");
  });
});

describe("isExcludedBusinessNumber · blacklist 검사", () => {
  const saved = { env: process.env.OCR_EXCLUDED_BUSINESS_NUMBERS };
  beforeEach(() => {
    delete process.env.OCR_EXCLUDED_BUSINESS_NUMBERS;
  });
  afterEach(() => {
    if (saved.env === undefined) delete process.env.OCR_EXCLUDED_BUSINESS_NUMBERS;
    else process.env.OCR_EXCLUDED_BUSINESS_NUMBERS = saved.env;
  });

  it("DEFAULT 리스트 · 3101805493 · true", () => {
    expect(isExcludedBusinessNumber("3101805493")).toBe(true);
  });

  it("하이픈 포함 · 정규화 후 매칭 · true", () => {
    expect(isExcludedBusinessNumber("310-18-05493")).toBe(true);
  });

  it("리스트 없는 번호 · false", () => {
    expect(isExcludedBusinessNumber("1234567890")).toBe(false);
  });

  it("빈 값 · false", () => {
    expect(isExcludedBusinessNumber("")).toBe(false);
  });

  it("env OCR_EXCLUDED_BUSINESS_NUMBERS · 추가 매칭", () => {
    process.env.OCR_EXCLUDED_BUSINESS_NUMBERS = "111-11-11111|222-22-22222";
    expect(isExcludedBusinessNumber("1111111111")).toBe(true);
    expect(isExcludedBusinessNumber("2222222222")).toBe(true);
  });

  it("env · 콤마 구분자도 지원", () => {
    process.env.OCR_EXCLUDED_BUSINESS_NUMBERS = "999-99-99999,888-88-88888";
    expect(isExcludedBusinessNumber("9999999999")).toBe(true);
    expect(isExcludedBusinessNumber("8888888888")).toBe(true);
  });
});
