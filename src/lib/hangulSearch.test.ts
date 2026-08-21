// 2026-08-20 · hangulSearch · toChosung · isChosungOnly · matchHangul
import { describe, it, expect } from "vitest";
import { toChosung, isChosungOnly, matchHangul } from "./hangulSearch";

describe("toChosung", () => {
  it("한글 · 초성만 추출", () => {
    expect(toChosung("아세트아미노펜")).toBe("ㅇㅅㅌㅇㅁㄴㅍ");
    expect(toChosung("홍길동")).toBe("ㅎㄱㄷ");
    expect(toChosung("타이레놀")).toBe("ㅌㅇㄹㄴ");
  });

  it("영문 · 소문자로 유지", () => {
    expect(toChosung("Tylenol")).toBe("tylenol");
    expect(toChosung("ABC")).toBe("abc");
  });

  it("한글 + 영문 혼합", () => {
    expect(toChosung("타이레놀ER")).toBe("ㅌㅇㄹㄴer");
  });

  it("숫자·특수문자 · 원문 유지", () => {
    expect(toChosung("500mg")).toBe("500mg");
    expect(toChosung("가-나")).toBe("ㄱ-ㄴ");
  });

  it("빈 문자열 · ''", () => {
    expect(toChosung("")).toBe("");
  });

  it("모든 초성 · ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ 매핑", () => {
    expect(toChosung("가까나다따라마바빠사싸아자짜차카타파하")).toBe("ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ");
  });
});

describe("isChosungOnly", () => {
  it("순수 초성 · true", () => {
    expect(isChosungOnly("ㅇㅅㅌ")).toBe(true);
    expect(isChosungOnly("ㅎㄱㄷ")).toBe(true);
    expect(isChosungOnly("ㄱ")).toBe(true);
  });

  it("한글 (초성 아닌 자음) · false", () => {
    expect(isChosungOnly("아")).toBe(false);
    expect(isChosungOnly("홍길동")).toBe(false);
  });

  it("영문 · false", () => {
    expect(isChosungOnly("abc")).toBe(false);
    expect(isChosungOnly("ㄱabc")).toBe(false);
  });

  it("빈 문자열 · false", () => {
    expect(isChosungOnly("")).toBe(false);
  });

  it("이중자음 · true", () => {
    expect(isChosungOnly("ㄲㄸㅃ")).toBe(true);
  });
});

describe("matchHangul", () => {
  it("원문 부분일치 · true", () => {
    expect(matchHangul("아세트아미노펜", "아미노")).toBe(true);
    expect(matchHangul("타이레놀", "타이")).toBe(true);
  });

  it("초성 매칭 · true", () => {
    expect(matchHangul("아세트아미노펜", "ㅇㅅㅌ")).toBe(true);
    expect(matchHangul("홍길동", "ㅎㄱㄷ")).toBe(true);
  });

  it("초성 부분일치 · true", () => {
    expect(matchHangul("아세트아미노펜", "ㅇㅁㄴㅍ")).toBe(true);
  });

  it("초성 아닌 needle · 원문 매칭만", () => {
    expect(matchHangul("타이레놀", "타이")).toBe(true);
    expect(matchHangul("타이레놀", "레놀")).toBe(true);
  });

  it("초성 매칭 실패 (자음 낱자지만 없는 초성) · false", () => {
    expect(matchHangul("아세트아미노펜", "ㅋㅋㅋ")).toBe(false);
  });

  it("영문 대소문자 무시", () => {
    expect(matchHangul("Tylenol", "TYLE")).toBe(true);
    expect(matchHangul("TYLENOL", "tyle")).toBe(true);
  });

  it("빈 needle · true (모두 매칭)", () => {
    expect(matchHangul("아무거나", "")).toBe(true);
    expect(matchHangul("아무거나", "   ")).toBe(true);
  });

  it("빈 hay · false (needle 있음)", () => {
    expect(matchHangul("", "타이")).toBe(false);
  });

  it("숫자 매칭", () => {
    expect(matchHangul("500mg 정제", "500")).toBe(true);
  });

  it("needle 앞뒤 공백 · trim", () => {
    expect(matchHangul("타이레놀", "  타이  ")).toBe(true);
  });
});
