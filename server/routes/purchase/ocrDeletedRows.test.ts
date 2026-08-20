// 2026-08-20 · ocrDeletedRows · normName · 품명 정규화 (서명용) 순수 함수 검증
//   원본 파일: server/routes/purchase/ocrDeletedRows.ts (normName)
//   module-scoped 헬퍼 · 로직 사본 검증 (source 파일 변경 없음)
import { describe, it, expect } from "vitest";

// ── 원본 로직 사본 (server/routes/purchase/ocrDeletedRows.ts) ────────

function normName(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .replace(/[\s\-_()（）,·./[\]{}「」『』@*※~+【】<>《》"'`^!?:;|]/g, "")
    .trim();
}

// ─── tests ───────────────────────────────────────────────────────────

describe("normName · 빈 입력", () => {
  it("null · 빈 문자열", () => expect(normName(null)).toBe(""));
  it("undefined · 빈 문자열", () => expect(normName(undefined)).toBe(""));
  it("빈 문자열 · 빈 문자열", () => expect(normName("")).toBe(""));
});

describe("normName · 정규화", () => {
  it("공백 제거", () => {
    expect(normName("타이레놀 정")).toBe("타이레놀정");
  });

  it("소문자 변환", () => {
    expect(normName("Tylenol PM")).toBe("tylenolpm");
  });

  it("괄호 제거 (반각·전각)", () => {
    expect(normName("아스피린(500mg)")).toBe("아스피린500mg");
    expect(normName("아스피린（500mg）")).toBe("아스피린500mg");
  });

  it("하이픈·언더스코어 제거", () => {
    expect(normName("A-B_C")).toBe("abc");
  });

  it("쉼표·마침표·슬래시 제거", () => {
    expect(normName("A, B. C/D")).toBe("abcd");
  });

  it("특수문자 · 제거 (·)", () => {
    expect(normName("A·B")).toBe("ab");
  });

  it("따옴표·백틱 제거", () => {
    expect(normName(`A"B'C\`D`)).toBe("abcd");
  });

  it("느낌표/물음표/콜론 제거", () => {
    expect(normName("A!B?C:D;E|F")).toBe("abcdef");
  });

  it("대괄호·중괄호·꺾쇠 제거", () => {
    expect(normName("A[B]{C}<D>")).toBe("abcd");
  });

  it("한글 괄호 「」『』【】《》 제거", () => {
    expect(normName("A「B」『C』【D】《E》")).toBe("abcde");
  });

  it("숫자 · 한글은 유지", () => {
    expect(normName("타이레놀 500")).toBe("타이레놀500");
  });

  it("실전 · 시그니처 일치", () => {
    // 같은 품명, 다른 표기 → 같은 정규화 결과
    expect(normName("타이레놀 정 500mg")).toBe(normName("타이레놀정500MG"));
  });
});
