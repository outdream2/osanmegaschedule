// 2026-08-19 · vendorNameNormalize · stripVendorAnnotation · isVatAnnotation · stripCorporatePrefix · displayVendorName · normalizeVendorCategory
import { describe, it, expect } from "vitest";
import {
  stripVendorAnnotation,
  isVatAnnotation,
  stripCorporatePrefix,
  displayVendorName,
  normalizeVendorCategory,
} from "./vendorNameNormalize";

describe("stripVendorAnnotation", () => {
  it("vat 괄호 제거 (포함/미포함/별도/없음)", () => {
    expect(stripVendorAnnotation("(주)대웅제약 (vat포함)")).toBe("(주)대웅제약");
    expect(stripVendorAnnotation("(주)대웅제약 (vat미포함)")).toBe("(주)대웅제약");
    expect(stripVendorAnnotation("(주)대웅제약 (vat별도)")).toBe("(주)대웅제약");
    expect(stripVendorAnnotation("(주)대웅제약 (vat없음)")).toBe("(주)대웅제약");
  });

  it("대소문자 무관 · VAT 도 처리", () => {
    expect(stripVendorAnnotation("(주)대웅제약 (VAT 별도)")).toBe("(주)대웅제약");
  });

  it("vat 없으면 · 원본 그대로", () => {
    expect(stripVendorAnnotation("(주)대웅제약")).toBe("(주)대웅제약");
  });

  it("null/undefined · 빈 문자열", () => {
    expect(stripVendorAnnotation(null)).toBe("");
    expect(stripVendorAnnotation(undefined)).toBe("");
  });

  it("빈 문자열 · 빈 문자열", () => {
    expect(stripVendorAnnotation("")).toBe("");
  });

  it("앞·중간 괄호는 유지 · 뒤쪽 1개만 제거", () => {
    // "(주)" 앞부분은 유지
    expect(stripVendorAnnotation("(주)대웅제약 (vat 포함)")).toBe("(주)대웅제약");
    expect(stripVendorAnnotation("대웅(중외) (vat)")).toBe("대웅(중외)");
  });

  it("앞뒤 공백 · trim", () => {
    expect(stripVendorAnnotation("  (주)대웅제약  ")).toBe("(주)대웅제약");
  });
});

describe("isVatAnnotation", () => {
  it("vat 포함 텍스트 · true", () => {
    expect(isVatAnnotation("vat 포함")).toBe(true);
    expect(isVatAnnotation("(vat)")).toBe(true);
    expect(isVatAnnotation("VAT 별도")).toBe(true);
  });

  it("vat 없는 텍스트 · false", () => {
    expect(isVatAnnotation("대웅제약")).toBe(false);
    expect(isVatAnnotation("(주)")).toBe(false);
  });

  it("null/undefined/empty · false", () => {
    expect(isVatAnnotation(null)).toBe(false);
    expect(isVatAnnotation(undefined)).toBe(false);
    expect(isVatAnnotation("")).toBe(false);
  });
});

describe("stripCorporatePrefix", () => {
  it("(주) 앞접두어 제거", () => {
    expect(stripCorporatePrefix("(주)대웅제약")).toBe("대웅제약");
  });

  it("㈜ 앞접두어 제거", () => {
    expect(stripCorporatePrefix("㈜대웅제약")).toBe("대웅제약");
  });

  it("주식회사 앞접두어 제거 (공백 있음)", () => {
    expect(stripCorporatePrefix("주식회사 대웅제약")).toBe("대웅제약");
  });

  it("(주) 뒷접미어 제거", () => {
    expect(stripCorporatePrefix("대웅제약(주)")).toBe("대웅제약");
  });

  it("주식회사 뒷접미어 제거 (공백 있음)", () => {
    expect(stripCorporatePrefix("대웅제약 주식회사")).toBe("대웅제약");
  });

  it("앞뒤 모두 제거", () => {
    expect(stripCorporatePrefix("(주)대웅제약 주식회사")).toBe("대웅제약");
  });

  it("주식회사 · 공백 없는 붙임형 · 단독 '주' 매칭 방지 버그 회귀 방지", () => {
    // 2026-08-06 · 순서 중요 · "주식회사" 를 "(주)" 보다 먼저 시도
    expect(stripCorporatePrefix("주식회사대웅제약")).toBe("대웅제약");
    // "주" 단독은 매칭 X · 아래는 그대로 유지
    expect(stripCorporatePrefix("주대웅제약")).toBe("주대웅제약");
  });

  it("접두/접미어 없음 · 그대로", () => {
    expect(stripCorporatePrefix("대웅제약")).toBe("대웅제약");
  });

  it("null/undefined · 빈 문자열", () => {
    expect(stripCorporatePrefix(null)).toBe("");
    expect(stripCorporatePrefix(undefined)).toBe("");
  });
});

describe("displayVendorName · 종합 정제", () => {
  it("vat + (주) 앞접두어 · 모두 제거", () => {
    expect(displayVendorName("(주)대웅제약 (vat포함)")).toBe("대웅제약");
  });

  it("vat + 접미어 · 모두 제거", () => {
    expect(displayVendorName("대웅제약(주) (VAT 별도)")).toBe("대웅제약");
  });

  it("아무 정제 대상 없음 · 그대로", () => {
    expect(displayVendorName("대웅제약")).toBe("대웅제약");
  });
});

describe("normalizeVendorCategory · legacy 호환", () => {
  it("60일회전 → 60회전", () => {
    expect(normalizeVendorCategory("60일회전")).toBe("60회전");
  });

  it("90일회전 → 90회전", () => {
    expect(normalizeVendorCategory("90일회전")).toBe("90회전");
  });

  it("현행 카테고리 · 그대로", () => {
    expect(normalizeVendorCategory("60회전")).toBe("60회전");
    expect(normalizeVendorCategory("위탁")).toBe("위탁");
    expect(normalizeVendorCategory("선결제")).toBe("선결제");
  });

  it("null/undefined · null 반환", () => {
    expect(normalizeVendorCategory(null)).toBeNull();
    expect(normalizeVendorCategory(undefined)).toBeNull();
  });

  it("빈 문자열 · 빈 문자열 그대로", () => {
    expect(normalizeVendorCategory("")).toBe("");
  });

  it("앞뒤 공백 · trim 후 매칭", () => {
    expect(normalizeVendorCategory("  60일회전  ")).toBe("60회전");
  });
});
