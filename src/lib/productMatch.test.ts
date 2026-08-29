// 2026-08-29 · productMatch · 통일 상품 검색 로직 · vitest
import { describe, it, expect } from "vitest";
import { matchesProductQuery, filterProducts } from "./productMatch";

describe("matchesProductQuery · 통일 상품 검색", () => {
  const p = {
    product_name: "타이레놀 500mg",
    product_code: "PC001",
    supplier: "코스트팜",
    barcode: "8801234567890",
  };

  it("빈 query · 모두 통과", () => {
    expect(matchesProductQuery(p, "")).toBe(true);
    expect(matchesProductQuery(p, "   ")).toBe(true);
  });

  it("상품명 · 부분 일치", () => {
    expect(matchesProductQuery(p, "타이레놀")).toBe(true);
    expect(matchesProductQuery(p, "500mg")).toBe(true);
    expect(matchesProductQuery(p, "레놀")).toBe(true);
  });

  it("상품명 · 초성 매칭 (자음 낱자)", () => {
    expect(matchesProductQuery(p, "ㅌㅇㄹㄴ")).toBe(true);  // 타이레놀
    expect(matchesProductQuery(p, "ㄹㄴ")).toBe(true);       // 레놀
  });

  it("공급사 · 부분 일치 + 초성", () => {
    expect(matchesProductQuery(p, "코스트")).toBe(true);
    expect(matchesProductQuery(p, "ㅋㅅㅌㅍ")).toBe(true);  // 코스트팜
  });

  it("상품코드 · 대소문자 무시 부분일치", () => {
    expect(matchesProductQuery(p, "pc001")).toBe(true);
    expect(matchesProductQuery(p, "PC001")).toBe(true);
    expect(matchesProductQuery(p, "001")).toBe(true);
  });

  it("바코드 · 부분일치", () => {
    expect(matchesProductQuery(p, "88012")).toBe(true);
    expect(matchesProductQuery(p, "567890")).toBe(true);
  });

  it("매칭 없음 · false", () => {
    expect(matchesProductQuery(p, "감기약")).toBe(false);
    expect(matchesProductQuery(p, "XYZ")).toBe(false);
  });

  it("null 필드 · 안전 처리", () => {
    expect(matchesProductQuery({ product_name: null, product_code: "PC001" }, "PC001")).toBe(true);
    expect(matchesProductQuery({ supplier: null }, "test")).toBe(false);
  });
});

describe("filterProducts · 헬퍼", () => {
  const products = [
    { product_name: "타이레놀", product_code: "PC001", supplier: "코스트팜" },
    { product_name: "게보린", product_code: "PC002", supplier: "유한양행" },
    { product_name: "판피린", product_code: "PC003", supplier: "동아제약" },
  ];

  it("빈 query · 전체 반환", () => {
    expect(filterProducts(products, "")).toHaveLength(3);
  });

  it("상품명 필터", () => {
    const r = filterProducts(products, "타이레놀");
    expect(r).toHaveLength(1);
    expect(r[0].product_code).toBe("PC001");
  });

  it("공급사 필터", () => {
    const r = filterProducts(products, "동아");
    expect(r).toHaveLength(1);
    expect(r[0].product_name).toBe("판피린");
  });

  it("초성 필터", () => {
    const r = filterProducts(products, "ㄱㅂㄹ");  // 게보린
    expect(r).toHaveLength(1);
    expect(r[0].product_name).toBe("게보린");
  });

  it("코드 필터", () => {
    const r = filterProducts(products, "PC002");
    expect(r).toHaveLength(1);
    expect(r[0].product_name).toBe("게보린");
  });
});
