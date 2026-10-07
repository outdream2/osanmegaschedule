// 2026-10-07 · formatDisplayLocation / formatCompactDisplayLocation 유닛 테스트
// 사용자 지시 · OPTION C · 진열위치 compact formatter SSOT
import { describe, it, expect } from "vitest";
import { formatDisplayLocation, formatCompactDisplayLocation } from "./formatDisplayLocation";

describe("formatDisplayLocation · 상세 포매터 (기존 유지)", () => {
  it("5매대>Ａ>1열>전체 → 5A 1열", () => {
    expect(formatDisplayLocation("5매대>Ａ>1열>전체")).toBe("5A 1열");
  });

  it("벽>22>전체>전체 → 벽 22", () => {
    expect(formatDisplayLocation("벽>22>전체>전체")).toBe("벽 22");
  });

  it("3매대>Ｂ>2열>3단 → 3B 2열 3단", () => {
    expect(formatDisplayLocation("3매대>Ｂ>2열>3단")).toBe("3B 2열 3단");
  });

  it("전체>전체>전체>전체 → \"\"", () => {
    expect(formatDisplayLocation("전체>전체>전체>전체")).toBe("");
  });

  it("null → \"\"", () => {
    expect(formatDisplayLocation(null)).toBe("");
  });
});

describe("formatCompactDisplayLocation · 축약 포매터 (신규)", () => {
  it("5매대>Ａ>1열>전체 → 5A", () => {
    expect(formatCompactDisplayLocation("5매대>Ａ>1열>전체")).toBe("5A");
  });

  it("9매대>A → 9A", () => {
    expect(formatCompactDisplayLocation("9매대>A")).toBe("9A");
  });

  it("9매대 A → 9A", () => {
    expect(formatCompactDisplayLocation("9매대 A")).toBe("9A");
  });

  it("벽>21>전체>전체 → 21", () => {
    expect(formatCompactDisplayLocation("벽>21>전체>전체")).toBe("21");
  });

  it("벽21 → 21", () => {
    expect(formatCompactDisplayLocation("벽21")).toBe("21");
  });

  it("벽 21 → 21", () => {
    expect(formatCompactDisplayLocation("벽 21")).toBe("21");
  });

  it("뷰티>1 → 뷰티1", () => {
    expect(formatCompactDisplayLocation("뷰티>1")).toBe("뷰티1");
  });

  it("뷰티1 → 뷰티1", () => {
    expect(formatCompactDisplayLocation("뷰티1")).toBe("뷰티1");
  });

  it("null → -", () => {
    expect(formatCompactDisplayLocation(null)).toBe("-");
  });

  it("\"\" → -", () => {
    expect(formatCompactDisplayLocation("")).toBe("-");
  });

  it("undefined → -", () => {
    expect(formatCompactDisplayLocation(undefined)).toBe("-");
  });

  it("전체>전체>전체>전체 → -", () => {
    expect(formatCompactDisplayLocation("전체>전체>전체>전체")).toBe("-");
  });

  it("multiple [5매대>A>1열, 벽>21, 뷰티>1] → 5A · 21 · 뷰티1", () => {
    expect(
      formatCompactDisplayLocation(["5매대>A>1열", "벽>21", "뷰티>1"])
    ).toBe("5A · 21 · 뷰티1");
  });

  it("중복 제거 [5A, 5A, 21] → 5A · 21", () => {
    expect(formatCompactDisplayLocation(["5A", "5A", "21"])).toBe("5A · 21");
  });

  it("배열 전체 비어있음 → -", () => {
    expect(formatCompactDisplayLocation([])).toBe("-");
    expect(formatCompactDisplayLocation(["", null, undefined])).toBe("-");
  });

  it("전각 letter · Ｂ 포함 (3매대>Ｂ) → 3B", () => {
    expect(formatCompactDisplayLocation("3매대>Ｂ>2열>3단")).toBe("3B");
  });

  it("상세 열/단 전부 제외 (3매대>B>2열>3단) → 3B", () => {
    expect(formatCompactDisplayLocation("3매대>B>2열>3단")).toBe("3B");
  });

  it("벽만 (전체 다 제거) → -", () => {
    expect(formatCompactDisplayLocation("벽>전체>전체>전체")).toBe("-");
  });
});
