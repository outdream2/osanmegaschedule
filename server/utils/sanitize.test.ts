// 2026-08-20 · sanitizeOrValue · PostgREST 특수문자 방어
import { describe, it, expect } from "vitest";
import { sanitizeOrValue } from "./sanitize";

describe("sanitizeOrValue", () => {
  it("comma 제거", () => {
    expect(sanitizeOrValue("a,b,c")).toBe("a b c");
  });

  it("괄호 제거", () => {
    expect(sanitizeOrValue("(주)대웅제약")).toBe("주 대웅제약");
  });

  it("쌍따옴표 제거", () => {
    expect(sanitizeOrValue('a"b')).toBe("a b");
  });

  it("backslash 제거", () => {
    expect(sanitizeOrValue("a\\b")).toBe("a b");
  });

  it("모든 특수문자 조합", () => {
    expect(sanitizeOrValue('(a,b)"c\\d')).toBe("a b c d");
  });

  it("연속 공백 · 하나로", () => {
    expect(sanitizeOrValue("a    b    c")).toBe("a b c");
  });

  it("앞뒤 공백 · trim", () => {
    expect(sanitizeOrValue("  abc  ")).toBe("abc");
  });

  it("특수문자 없음 · 그대로 (trim + 정규화)", () => {
    expect(sanitizeOrValue("타이레놀 500mg")).toBe("타이레놀 500mg");
  });

  it("빈 문자열 · 빈 문자열", () => {
    expect(sanitizeOrValue("")).toBe("");
  });

  it("공백만 · 빈 문자열", () => {
    expect(sanitizeOrValue("   ")).toBe("");
  });

  it("한글 유지 · 특수문자만 제거", () => {
    expect(sanitizeOrValue("(주)한독약품, 서울")).toBe("주 한독약품 서울");
  });
});
