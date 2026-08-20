// 2026-08-20 · schema · INVOICE_SCHEMA 정규식 매칭 · GEMINI_OCR_PROMPT 검증
import { describe, it, expect } from "vitest";
import { INVOICE_SCHEMA, GEMINI_OCR_PROMPT } from "./schema";

describe("INVOICE_SCHEMA · 구조", () => {
  it("배열 · 표시 순서 · 품명·수량·단가·금액·규격·유통기한", () => {
    const names = INVOICE_SCHEMA.map((s) => s.name);
    expect(names[0]).toBe("품명");
    expect(names[1]).toBe("수량");
    expect(names[2]).toBe("단가");
    expect(names[3]).toBe("금액");
    expect(names[4]).toBe("규격");
    expect(names[5]).toBe("유통기한");
  });

  it("각 항목 · name + re (RegExp)", () => {
    INVOICE_SCHEMA.forEach((s) => {
      expect(s.name).toBeTruthy();
      expect(s.re).toBeInstanceOf(RegExp);
    });
  });
});

describe("INVOICE_SCHEMA · 정규식 매칭", () => {
  const bySchema = (name: string) => INVOICE_SCHEMA.find((s) => s.name === name)!.re;

  it("품명 · 다양한 오독·별칭 매칭", () => {
    const re = bySchema("품명");
    expect(re.test("품명")).toBe(true);
    expect(re.test("품 명")).toBe(true);
    expect(re.test("상품명")).toBe(true);
    expect(re.test("제품명")).toBe(true);
    expect(re.test("품목")).toBe(true);
  });

  it("수량 · 매수·수량", () => {
    const re = bySchema("수량");
    expect(re.test("수량")).toBe(true);
    expect(re.test("매수")).toBe(true);
    expect(re.test("수 량")).toBe(true);
  });

  it("단가 · 단가·단 가", () => {
    const re = bySchema("단가");
    expect(re.test("단가")).toBe(true);
    expect(re.test("단 가")).toBe(true);
  });

  it("금액 · 여러 별칭", () => {
    const re = bySchema("금액");
    expect(re.test("금액")).toBe(true);
    expect(re.test("공급가액")).toBe(true);
    expect(re.test("총매출액")).toBe(true);
    expect(re.test("합계금액")).toBe(true);
    expect(re.test("금 액")).toBe(true);
  });

  it("규격 · 규격·사양", () => {
    const re = bySchema("규격");
    expect(re.test("규격")).toBe(true);
    expect(re.test("사양")).toBe(true);
    expect(re.test("규 격")).toBe(true);
  });

  it("유통기한 · 소비/사용/유효 기한", () => {
    const re = bySchema("유통기한");
    expect(re.test("유통기한")).toBe(true);
    expect(re.test("소비기한")).toBe(true);
    expect(re.test("사용기한")).toBe(true);
    expect(re.test("유효기간")).toBe(true);
    expect(re.test("만료일")).toBe(true);
  });

  it("세액 · 세액·부가세", () => {
    const re = bySchema("세액");
    expect(re.test("세액")).toBe(true);
    expect(re.test("부가세")).toBe(true);
  });

  it("비고 · 비고·적요", () => {
    const re = bySchema("비고");
    expect(re.test("비고")).toBe(true);
    expect(re.test("적요")).toBe(true);
  });

  it("일자 · 발행일자·거래일자·월일", () => {
    const re = bySchema("일자");
    expect(re.test("발행일자")).toBe(true);
    expect(re.test("거래일자")).toBe(true);
    expect(re.test("월일")).toBe(true);
    expect(re.test("날짜")).toBe(true);
  });

  it("번호 · No.·순번", () => {
    const re = bySchema("번호");
    expect(re.test("번호")).toBe(true);
    expect(re.test("no")).toBe(true);
    expect(re.test("No.")).toBe(true);
    expect(re.test("순번")).toBe(true);
  });
});

describe("GEMINI_OCR_PROMPT", () => {
  it("한국 거래명세서 전문 안내", () => {
    expect(GEMINI_OCR_PROMPT).toContain("한국");
    expect(GEMINI_OCR_PROMPT).toContain("거래명세서");
    expect(GEMINI_OCR_PROMPT).toContain("OCR");
  });

  it("배송·행정 정보 제외 규칙 명시", () => {
    expect(GEMINI_OCR_PROMPT).toContain("차량번호");
    expect(GEMINI_OCR_PROMPT).toContain("담당자");
    expect(GEMINI_OCR_PROMPT).toContain("배송");
  });

  it("컬럼 순서 표준 · headers 배열", () => {
    expect(GEMINI_OCR_PROMPT).toContain("품명");
    expect(GEMINI_OCR_PROMPT).toContain("수량");
    expect(GEMINI_OCR_PROMPT).toContain("단가");
    expect(GEMINI_OCR_PROMPT).toContain("금액");
    expect(GEMINI_OCR_PROMPT).toContain("규격");
    expect(GEMINI_OCR_PROMPT).toContain("유통기한");
  });

  it("합계·소계 제외 지시", () => {
    expect(GEMINI_OCR_PROMPT).toContain("합계");
    expect(GEMINI_OCR_PROMPT).toContain("소계");
  });
});
