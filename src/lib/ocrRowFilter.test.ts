// 2026-08-19 · ocrRowFilter · 상품 아닌 텍스트 판정 · 유효 상품명 · cleanProductName · scoreProductRow · isValidSupplierHint
import { describe, it, expect } from "vitest";
import {
  isNonProductText,
  isValidProductName,
  cleanProductName,
  scoreProductRow,
  isValidSupplierHint,
} from "./ocrRowFilter";

describe("isNonProductText · 짧은 텍스트/빈 값", () => {
  it("빈 문자열 · true", () => {
    expect(isNonProductText("")).toBe(true);
  });

  it("2자 이하 · true", () => {
    expect(isNonProductText("A2")).toBe(true);
    expect(isNonProductText("가")).toBe(true);
  });
});

describe("isNonProductText · 배송·행정 라벨", () => {
  it("차량번호/기사명/배송처 · true", () => {
    expect(isNonProductText("차량번호")).toBe(true);
    expect(isNonProductText("기사명 홍길동")).toBe(true);
    expect(isNonProductText("배송처 강남지점")).toBe(true);
  });

  it("HC사업부 · true", () => {
    expect(isNonProductText("HC사업부 서울지사")).toBe(true);
  });
});

describe("isNonProductText · 표 헤더 (여러 키워드)", () => {
  it("헤더 키워드 3개+ · true", () => {
    expect(isNonProductText("코드 일자 품목 규격 단위 수량")).toBe(true);
  });

  it("슬래시 + 헤더 키워드 2개 · true", () => {
    expect(isNonProductText("코드/일자")).toBe(true);
  });
});

describe("isNonProductText · 주소 패턴", () => {
  it("도·시·구·동 다수 · true", () => {
    expect(isNonProductText("경기도 오산시 원동")).toBe(true);
    expect(isNonProductText("서울시 강남구 역삼동 아파트")).toBe(true);
  });
});

describe("isNonProductText · 전화·사업자번호", () => {
  it("사업자번호 패턴 · true", () => {
    expect(isNonProductText("123-45-67890")).toBe(true);
  });

  it("전화번호 패턴 · true", () => {
    expect(isNonProductText("02-1234-5678")).toBe(true);
    expect(isNonProductText("010-1234-5678")).toBe(true);
  });

  it("전화번호 포함 문자열 · true", () => {
    expect(isNonProductText("031-725-9017,9011/동탄상은판매부서")).toBe(true);
  });
});

describe("isNonProductText · 사람 이름", () => {
  it("2-4자 한글 이름 · 약품 접미어 없음 · true", () => {
    // 주의 · '환' 은 pharma suffix · '김충환'은 상품명 취급 (false)
    expect(isNonProductText("홍길동")).toBe(true);
    expect(isNonProductText("박영수")).toBe(true);
  });

  it("약품 접미어 있음 (정/캡 등) · false (상품명 유지)", () => {
    expect(isNonProductText("이바네정")).toBe(false);
    expect(isNonProductText("알지텍정")).toBe(false);
    expect(isNonProductText("타이레놀캡")).toBe(false);
  });
});

describe("isNonProductText · 로트/배치 번호", () => {
  it("알파벳+숫자 배치 · true", () => {
    expect(isNonProductText("A20 1302")).toBe(true);
    expect(isNonProductText("AB12345")).toBe(true);
  });
});

describe("isNonProductText · 업태·종목", () => {
  it("제조업/소매/의약품 등 단일 단어 · true", () => {
    expect(isNonProductText("제조업")).toBe(true);
    expect(isNonProductText("의약품")).toBe(true);
  });
});

describe("isNonProductText · 정상 상품명 · false", () => {
  it("일반 상품명 · false", () => {
    expect(isNonProductText("타이레놀 500mg")).toBe(false);
    expect(isNonProductText("이바네정 20mg 30정")).toBe(false);
    expect(isNonProductText("스크릴에스캡슐")).toBe(false);
  });
});

describe("isValidProductName", () => {
  it("한글 미포함 · false", () => {
    expect(isValidProductName("ABC 123")).toBe(false);
    expect(isValidProductName("500mg")).toBe(false);
  });

  it("정상 상품명 · true", () => {
    expect(isValidProductName("타이레놀 500mg")).toBe(true);
    expect(isValidProductName("이바네정 20mg")).toBe(true);
  });

  it("null/undefined/empty · false", () => {
    expect(isValidProductName(null)).toBe(false);
    expect(isValidProductName(undefined)).toBe(false);
    expect(isValidProductName("")).toBe(false);
  });

  it("금액 패턴 · 한글 <= 2자 · false", () => {
    expect(isValidProductName("121,600원")).toBe(false);
    expect(isValidProductName("W8,400원")).toBe(false);
  });

  it("한글 비율 < 30% · false", () => {
    // "#84,00세 W 8.400" · 한글 1자 (세) · 나머지 숫자·기호 · flat: "#84,00세W8.400"
    expect(isValidProductName("#84,00세 W 8.400")).toBe(false);
  });

  it("표 헤더 텍스트 · false", () => {
    expect(isValidProductName("코드 일자 품목 규격")).toBe(false);
  });
});

describe("cleanProductName · 잡문자 제거", () => {
  it("금액 제거", () => {
    expect(cleanProductName("121,600 이바네정")).toContain("이바네정");
    expect(cleanProductName("이바네정 121,600원")).toContain("이바네정");
    expect(cleanProductName("W8,400 이바네정")).toContain("이바네정");
  });

  it("전화번호 제거", () => {
    expect(cleanProductName("010-1234-5678 타이레놀")).toContain("타이레놀");
    expect(cleanProductName("010-1234-5678 타이레놀")).not.toContain("010");
  });

  it("사업자번호 제거", () => {
    expect(cleanProductName("123-45-67890 이바네정")).toContain("이바네정");
    expect(cleanProductName("123-45-67890 이바네정")).not.toContain("67890");
  });

  it("헤더 키워드 제거 · '품명' 등", () => {
    const cleaned = cleanProductName("품명 이바네정");
    expect(cleaned).toContain("이바네정");
    expect(cleaned).not.toContain("품명");
  });

  it("빈 문자열/null · 빈 문자열", () => {
    expect(cleanProductName(null)).toBe("");
    expect(cleanProductName(undefined)).toBe("");
    expect(cleanProductName("")).toBe("");
  });

  it("연속 공백 정리", () => {
    expect(cleanProductName("이바네정   500mg")).toBe("이바네정 500mg");
  });
});

describe("scoreProductRow", () => {
  it("수량 유효 · +0.30", () => {
    const { score } = scoreProductRow({ quantity: 10, price: 0, productName: "" });
    expect(score).toBeCloseTo(0.30, 2);
  });

  it("단가 유효 · +0.30", () => {
    const { score } = scoreProductRow({ quantity: 0, price: 5000, productName: "" });
    expect(score).toBeCloseTo(0.30, 2);
  });

  it("한글 3자+ · +0.25", () => {
    const { score } = scoreProductRow({ quantity: 0, price: 0, productName: "이바네정" });
    expect(score).toBeCloseTo(0.25, 2);
  });

  it("최장 품명 · +0.10", () => {
    const { score } = scoreProductRow({
      quantity: 0, price: 0, productName: "이바네정 500mg 30T",
      maxNameLen: 20,
    });
    // 한글 3자+ +0.25 + 장문 +0.10 = 0.35
    expect(score).toBeCloseTo(0.35, 2);
  });

  it("공급사 겹침 · +0.05", () => {
    const { score } = scoreProductRow({
      quantity: 0, price: 0, productName: "대웅제약 이바네정",
      supplier: "대웅제약",
    });
    // 한글 5자+ +0.25 + 공급사 +0.05 = 0.30
    expect(score).toBeCloseTo(0.30, 2);
  });

  it("완전 매칭 · 1.0 clamp", () => {
    const { score } = scoreProductRow({
      quantity: 10, price: 5000, productName: "대웅제약 이바네정 500mg 정",
      supplier: "대웅제약", maxNameLen: 20,  // 20 * 0.7 = 14 · name 19자 >= 14 → 장문
    });
    // 0.30 + 0.30 + 0.25 + 0.10 + 0.05 = 1.00
    expect(score).toBe(1);
  });

  it("null/undefined · 0", () => {
    const { score } = scoreProductRow({ quantity: null, price: undefined, productName: null });
    expect(score).toBe(0);
  });

  it("수량 범위 밖 · 가점 없음", () => {
    const { score } = scoreProductRow({ quantity: 100000, price: 0, productName: "" });
    expect(score).toBe(0);
    const { score: s2 } = scoreProductRow({ quantity: 0, price: 0, productName: "" });
    expect(s2).toBe(0);
  });

  it("reasons · 조건 이유 나열", () => {
    const { reasons } = scoreProductRow({ quantity: 10, price: 5000, productName: "이바네정" });
    expect(reasons).toContain("수량OK");
    expect(reasons).toContain("단가OK");
    expect(reasons.some((r) => r.includes("한글"))).toBe(true);
  });
});

describe("isValidSupplierHint", () => {
  it("정상 공급사 · true (5자 이상 · 사람 이름 필터 회피)", () => {
    // 주의 · 2-4자 한글 (사람 이름 오인) 필터 · 5자 이상 공급사만 유효
    expect(isValidSupplierHint("한국제약공사")).toBe(true);
    expect(isValidSupplierHint("종근당제약")).toBe(true);
  });

  it("2자 미만 · false", () => {
    expect(isValidSupplierHint("A")).toBe(false);
  });

  it("25자 초과 · false", () => {
    expect(isValidSupplierHint("가나다라마바사아자차카타파하가나다라마바사아자차카타파하")).toBe(false);
  });

  it("상품 규격 포함 · false", () => {
    expect(isValidSupplierHint("이바네정 500mg")).toBe(false);
    expect(isValidSupplierHint("30정")).toBe(false);
  });

  it("배송·행정 정보 · false", () => {
    expect(isValidSupplierHint("차량번호")).toBe(false);
  });

  it("빈 문자열 · false", () => {
    expect(isValidSupplierHint("")).toBe(false);
  });
});
