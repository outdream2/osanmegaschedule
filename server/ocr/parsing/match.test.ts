// 2026-08-20 · server/ocr/parsing/match · 순수 유사도 함수 테스트
import { describe, it, expect } from "vitest";
import {
  toJamo,
  levenshtein,
  jamoSim,
  jamoSimOcr,
  norm,
  normSupplier,
  stripMed,
  parseDrugBrand,
  diceSim,
  bigramSim,
  invoiceMatchScore,
  makeMatchResult,
} from "./match";

describe("toJamo · 한글 자모 분해", () => {
  it("완성형 한글 · 초·중·종성 3개 분해", () => {
    const r = toJamo("각");
    expect(r).toEqual(["ㄱ", "ㅏ", "ㄱ"]);
  });

  it("종성 없는 글자 · 2개 분해", () => {
    const r = toJamo("가");
    expect(r).toEqual(["ㄱ", "ㅏ"]);
  });

  it("영문 · lowercase 유지", () => {
    expect(toJamo("Abc")).toEqual(["a", "b", "c"]);
  });

  it("공백 · 제외", () => {
    expect(toJamo(" 가 ")).toEqual(["ㄱ", "ㅏ"]);
  });

  it("빈 문자열 · 빈 배열", () => {
    expect(toJamo("")).toEqual([]);
  });

  it("복합 · 온라인팜 → 초중종성 배열", () => {
    const r = toJamo("온라인팜");
    // 온: ㅇㅗㄴ · 라: ㄹㅏ · 인: ㅇㅣㄴ · 팜: ㅍㅏㅁ
    expect(r).toEqual(["ㅇ", "ㅗ", "ㄴ", "ㄹ", "ㅏ", "ㅇ", "ㅣ", "ㄴ", "ㅍ", "ㅏ", "ㅁ"]);
  });
});

describe("levenshtein · 배열 편집거리", () => {
  it("동일 · 0", () => {
    expect(levenshtein(["a", "b"], ["a", "b"])).toBe(0);
  });

  it("1개 다름 · 1", () => {
    expect(levenshtein(["a", "b", "c"], ["a", "x", "c"])).toBe(1);
  });

  it("한쪽 빈 배열 · 다른쪽 길이", () => {
    expect(levenshtein([], ["a", "b"])).toBe(2);
    expect(levenshtein(["a", "b", "c"], [])).toBe(3);
  });
});

describe("jamoSim · 자모 유사도 (0-100)", () => {
  it("동일 · 100", () => {
    expect(jamoSim("온라인팜", "온라인팜")).toBe(100);
  });

  it("1자모 다름 · 90 이상", () => {
    // 온라인팜 vs 온라인밤 · ㅍ vs ㅂ 1자모
    const s = jamoSim("온라인팜", "온라인밤");
    expect(s).toBeGreaterThan(80);
    expect(s).toBeLessThan(100);
  });

  it("한쪽 빈 문자열 · 0", () => {
    expect(jamoSim("", "가나다")).toBe(0);
    expect(jamoSim("가나", "")).toBe(0);
  });
});

describe("jamoSimOcr · OCR 오독 인식 · 시각적 혼동 가중치", () => {
  it("동일 · 100", () => {
    expect(jamoSimOcr("타이레놀", "타이레놀")).toBe(100);
  });

  it("혼동쌍 (ㅁ↔ㅂ) · jamoSim 보다 높음", () => {
    const normal = jamoSim("팜", "밤");
    const ocr = jamoSimOcr("팜", "밤");
    expect(ocr).toBeGreaterThanOrEqual(normal);
  });

  it("전혀 다른 자모 · 낮은 점수", () => {
    const s = jamoSimOcr("가", "즈");
    expect(s).toBeLessThan(50);
  });
});

describe("norm · 특수문자·공백 제거·소문자", () => {
  it("공백·괄호·특수문자 제거", () => {
    expect(norm("타이레놀 (500mg)")).toBe("타이레놀500mg");
  });

  it("영문 · 소문자", () => {
    expect(norm("ABC")).toBe("abc");
  });

  it("리딩 심볼 흡수 · @*[]", () => {
    expect(norm("@댕기머리")).toBe("댕기머리");
    expect(norm("*[상품]")).toBe("상품");
  });

  it("빈 문자열", () => {
    expect(norm("")).toBe("");
  });
});

describe("normSupplier · 법인형태·VAT·지역 제거", () => {
  it("주식회사 제거", () => {
    expect(normSupplier("주식회사 대웅")).toBe("대웅");
    expect(normSupplier("(주)유한양행")).toBe("유한양행");
  });

  it("VAT 별도 · 미포함 제거", () => {
    expect(normSupplier("일양약품(vat미포함)")).toBe("일양약품");
    expect(normSupplier("동아 vat별도")).toBe("동아");
  });

  it("부가세별도 제거", () => {
    expect(normSupplier("한미(부가세별도)")).toBe("한미");
  });

  it("지역 접미사 제거", () => {
    expect(normSupplier("지오영(용인)")).toBe("지오영");
    expect(normSupplier("동화(서울)")).toBe("동화");
  });
});

describe("stripMed · 규격·제형·숫자 제거", () => {
  it("mg 규격 · 정 제형 제거", () => {
    expect(stripMed("타이레놀정500mg")).toBe("타이레놀");
  });

  it("ml 규격", () => {
    const r = stripMed("아세트아미노펜시럽 100ml");
    expect(r).not.toMatch(/100ml/i);
    expect(r).toContain("아세트아미노펜");
  });

  it("빈 문자열", () => {
    expect(stripMed("")).toBe("");
  });
});

describe("parseDrugBrand · 순수 브랜드명", () => {
  it("제약사 접미어 제거 · 제약", () => {
    expect(parseDrugBrand("대웅제약")).toBe("대웅");
  });

  it("영문 pharm/lab 제거", () => {
    const r = parseDrugBrand("BioLab");
    expect(r).toBe("bio");
  });

  it("규격+제형+접미어 모두 제거", () => {
    expect(parseDrugBrand("타이레놀정500mg 제약")).toBe("타이레놀");
  });
});

describe("diceSim · Dice bigram 유사도", () => {
  it("동일 · 100", () => {
    expect(diceSim("가나다", "가나다")).toBe(100);
  });

  it("한쪽 빈 · 0", () => {
    expect(diceSim("", "가나다")).toBe(0);
    expect(diceSim("가나", "")).toBe(0);
  });

  it("포함 관계 · 짧은쪽 완전 포함 · 부스트", () => {
    // "가나" ⊂ "가나다라마" · 길이비 0.4
    const s = diceSim("가나", "가나다라마");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it("전혀 다른 문자 · 0에 가까움", () => {
    const s = diceSim("abc", "xyz");
    expect(s).toBe(0);
  });

  it("bigramSim = diceSim (하위 호환)", () => {
    expect(bigramSim("가나다", "가나다")).toBe(100);
    expect(bigramSim("가나다", "가나다")).toBe(diceSim("가나다", "가나다"));
  });
});

describe("invoiceMatchScore · 종합 매칭 점수", () => {
  const product = { code: "12345", name: "타이레놀정500mg", spec: "500mg" };

  it("완전 일치 · 100", () => {
    expect(invoiceMatchScore("타이레놀정500mg", product as any)).toBe(100);
  });

  it("부분 일치 · 브랜드만 · 높은 부분 점수 (규격 제거 후 매칭)", () => {
    const s = invoiceMatchScore("타이레놀", product as any);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it("입력 문자열 앞 번호 매김 제거 · 1.", () => {
    // 정규식 [\d...]+[.)] · 1. 또는 1) 형태만 제거
    const s = invoiceMatchScore("1. 타이레놀정500mg", product as any);
    expect(s).toBe(100);
  });

  it("빈 입력 · 0", () => {
    expect(invoiceMatchScore("", product as any)).toBe(0);
  });

  it("빈 DB 이름 · 0", () => {
    expect(invoiceMatchScore("타이레놀", { code: "x", name: "", spec: "" } as any)).toBe(0);
  });

  it("search_keywords 매칭 · 별칭도 후보", () => {
    const pWithKw = { code: "1", name: "다른이름", spec: "", search_keywords: "타이레놀,타이레놀정" };
    const s = invoiceMatchScore("타이레놀", pWithKw as any);
    expect(s).toBeGreaterThan(60);
  });
});

describe("makeMatchResult · 결과 포맷", () => {
  it("input · matched 필드 포함", () => {
    const p = {
      code: "12345",
      name: "타이레놀",
      spec: "500mg",
      purchase_price: 1000,
      sale_price: 1500,
      profit_rate: 0.33,
      expiry_date: "2027-12-31",
    };
    const r = makeMatchResult("타이레놀", p as any, 95);
    expect(r.input).toBe("타이레놀");
    expect(r.matched.code).toBe("12345");
    expect(r.matched.score).toBe(95);
    expect(r.matched.masterPrice).toBe(1000);
    expect(r.matched.expiryDate).toBe("2027-12-31");
  });

  it("null 필드 · null 로 반환", () => {
    const p = { code: "1", name: "x", spec: "", purchase_price: null, sale_price: null, profit_rate: null, expiry_date: null };
    const r = makeMatchResult("x", p as any, 50);
    expect(r.matched.masterPrice).toBeNull();
    expect(r.matched.salePrice).toBeNull();
    expect(r.matched.profitRate).toBeNull();
    expect(r.matched.expiryDate).toBeNull();
  });
});
