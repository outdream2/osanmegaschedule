// 2026-08-20 · parse · extractBusinessNumbersFromRawText · extractDiscount
import { describe, it, expect } from "vitest";
import { extractBusinessNumbersFromRawText, extractDiscount } from "./parse";

describe("extractBusinessNumbersFromRawText", () => {
  it("빈 문자열 · 빈 배열", () => {
    expect(extractBusinessNumbersFromRawText("")).toEqual([]);
    expect(extractBusinessNumbersFromRawText(null as any)).toEqual([]);
  });

  it("표준 3-2-5 하이픈 · 사업자번호 감지", () => {
    const r = extractBusinessNumbersFromRawText("사업자등록번호 123-45-67890");
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].bizNum).toBe("1234567890");
  });

  it("하이픈 없는 10자리 · 감지", () => {
    const r = extractBusinessNumbersFromRawText("사업자 1234567890 회사");
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].bizNum).toBe("1234567890");
  });

  it("휴대폰 번호 (010 등) · 배제", () => {
    const r = extractBusinessNumbersFromRawText("010-1234-5678 전화");
    expect(r).toEqual([]);
  });

  it("YYYYMMDD 유통기한 · 배제", () => {
    const r = extractBusinessNumbersFromRawText("유통기한 2027-12-31 회사");
    // 20271231 은 YYYYMMDD 형식 · 배제
    expect(r.find(x => x.bizNum === "20271231")).toBeUndefined();
  });

  it("중복 · dedup", () => {
    const r = extractBusinessNumbersFromRawText("사업자 123-45-67890 · 다시 1234567890");
    // 같은 번호 · 한번만
    expect(r.filter(x => x.bizNum === "1234567890")).toHaveLength(1);
  });

  it("supplier 라벨 근처 · role=supplier", () => {
    const r = extractBusinessNumbersFromRawText("공급자 123-45-67890 상호 대웅");
    const found = r.find(x => x.bizNum === "1234567890");
    expect(found?.role).toBe("supplier");
  });

  it("recipient 라벨 근처 · role=recipient", () => {
    const r = extractBusinessNumbersFromRawText("공급받는자 123-45-67890 상호 약국");
    const found = r.find(x => x.bizNum === "1234567890");
    expect(found?.role).toBe("recipient");
  });

  it("라벨 없음 · role=unknown", () => {
    const r = extractBusinessNumbersFromRawText("그냥 텍스트 123-45-67890 뒤 텍스트");
    expect(r[0]?.role).toBe("unknown");
  });

  it("여러 사업자번호 · 다중 감지", () => {
    const r = extractBusinessNumbersFromRawText(
      "공급자 111-11-11111 · 공급받는자 222-22-22222"
    );
    expect(r.length).toBeGreaterThanOrEqual(2);
    const nums = r.map(x => x.bizNum).sort();
    expect(nums).toContain("1111111111");
    expect(nums).toContain("2222222222");
  });
});

describe("extractDiscount · vatSeparate 감지", () => {
  it("total = rowsSum × 1.10 · vatSeparate=true", () => {
    const r = extractDiscount("", 100000, { total: 110000 });
    expect(r.vatSeparate).toBe(true);
    expect(r.inferred.some(s => s.includes("부가세별도"))).toBe(true);
  });

  it("total ≠ rowsSum × 1.10 · vatSeparate 아님", () => {
    const r = extractDiscount("", 100000, { total: 100000 });
    expect(r.vatSeparate).toBeUndefined();
  });

  it("meta.total 없음 · vatSeparate 판정 안 함", () => {
    const r = extractDiscount("", 100000, {});
    expect(r.vatSeparate).toBeUndefined();
  });
});

describe("extractDiscount · 에누리 감지", () => {
  it("에누리액 · 쉼표 있는 숫자", () => {
    const r = extractDiscount("에누리액 500,000", 0, {});
    expect(r.discount).toBe(500000);
    expect(r.discountLabel).toBe("에누리액");
    expect(r.inferred.some(s => s.includes("에누리액"))).toBe(true);
  });

  it("특별에누리 · 특정 라벨 우선", () => {
    const r = extractDiscount("특별에누리 100,000", 0, {});
    expect(r.discount).toBe(100000);
    expect(r.discountLabel).toBe("특별에누리");
  });

  it("에누리 없음 · discount undefined", () => {
    const r = extractDiscount("그냥 텍스트", 0, {});
    expect(r.discount).toBeUndefined();
  });
});

describe("extractDiscount · 할인 감지", () => {
  it("할인액 · 매치", () => {
    const r = extractDiscount("할인액 250,000", 0, {});
    expect(r.discount).toBe(250000);
    expect(r.discountLabel).toBe("할인액");
  });

  it("매출할인 · 특정 라벨 우선", () => {
    const r = extractDiscount("매출할인 50,000", 0, {});
    expect(r.discount).toBe(50000);
    expect(r.discountLabel).toBe("매출할인");
  });

  it("DC · 영문 라벨", () => {
    const r = extractDiscount("총합 100,000 DC 10,000", 0, {});
    expect(r.discount).toBe(10000);
    expect(r.discountLabel).toContain("DC");
  });

  it("에누리 + 할인 · 합산 · 라벨 연결", () => {
    const r = extractDiscount("에누리액 100,000 할인액 50,000", 0, {});
    expect(r.discount).toBe(150000);
    expect(r.discountLabel).toContain("에누리액");
    expect(r.discountLabel).toContain("할인액");
  });
});

describe("extractDiscount · 반품", () => {
  it("반품액 · return_ 필드", () => {
    const r = extractDiscount("반품액 30,000", 0, {});
    expect(r.return_).toBe(30000);
  });

  it("반품 없음 · return_ undefined", () => {
    const r = extractDiscount("정상", 0, {});
    expect(r.return_).toBeUndefined();
  });
});

describe("extractDiscount · 차액 자동 추정", () => {
  it("total < rowsSum · 5~20% 차이 · 차액(추정) (rawText 존재 시)", () => {
    // rowsSum=100000, total=95000 · diff=5000 (5%)
    const r = extractDiscount("정상 명세서", 100000, { total: 95000 });
    expect(r.discount).toBe(5000);
    expect(r.discountLabel).toBe("차액(추정)");
  });

  it("차이 < 0.5% · 추정 안 함", () => {
    const r = extractDiscount("정상 명세서", 100000, { total: 99700 });
    expect(r.discount).toBeUndefined();
  });

  it("차이 > 20% · 추정 안 함", () => {
    const r = extractDiscount("정상 명세서", 100000, { total: 50000 });
    expect(r.discount).toBeUndefined();
  });

  it("vatSeparate 감지 · 차액 추정 X (rawText 있어도)", () => {
    // ratio = 1.10 · vatSeparate 활성 · discount 는 undefined
    const r = extractDiscount("정상 명세서", 100000, { total: 110000 });
    expect(r.vatSeparate).toBe(true);
    expect(r.discount).toBeUndefined();
  });

  it("이미 명시 discount 감지 · 자동 추정 skip", () => {
    // rawText 에서 할인 감지 · rowsSum≠total 이라도 자동 추정 skip
    const r = extractDiscount("할인액 5,000", 100000, { total: 95000 });
    expect(r.discount).toBe(5000);
    expect(r.discountLabel).toBe("할인액");
  });
});

describe("extractDiscount · rawText 빈 문자열", () => {
  it("rawText 빈 · vatSeparate 만 실행", () => {
    const r = extractDiscount("", 100000, { total: 110000 });
    expect(r.vatSeparate).toBe(true);
    expect(r.discount).toBeUndefined();
  });

  it("모든 입력 · undefined 채워짐", () => {
    const r = extractDiscount("", 0, {});
    expect(r.discount).toBeUndefined();
    expect(r.discountLabel).toBeUndefined();
    expect(r.vatSeparate).toBeUndefined();
    expect(r.inferred).toEqual([]);
  });
});
