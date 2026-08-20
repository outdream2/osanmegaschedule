// 2026-08-20 · invoice-vocab · 도메인 사전 검증 · pure lookup 함수
import { describe, it, expect } from "vitest";
import {
  HEADER_ALIASES,
  TOTAL_ROW_RE,
  SUPPLIER_LABELS,
  RECIPIENT_LABELS,
  DELIVERY_INFO_LABELS,
  ALL_HEADER_KEYWORDS,
  DOSE_FORMS,
  CORP_SUFFIX_RE,
  isDeliveryOrAdminInfo,
  isHeaderNoise,
  isTotalRow,
  normalizeHeaderCell,
} from "./invoice-vocab";

describe("HEADER_ALIASES · 표준 헤더", () => {
  it("필수 컬럼 정의 · 품명·수량·단가·금액", () => {
    expect(HEADER_ALIASES["품명"]).toBeDefined();
    expect(HEADER_ALIASES["수량"]).toBeDefined();
    expect(HEADER_ALIASES["단가"]).toBeDefined();
    expect(HEADER_ALIASES["금액"]).toBeDefined();
  });

  it("품명 · 오독 별칭 포함", () => {
    expect(HEADER_ALIASES["품명"]).toContain("품로명"); // 품→로
    expect(HEADER_ALIASES["품명"]).toContain("품루명"); // 품→루
  });

  it("수량 · OCR 오독 량→강/랑", () => {
    expect(HEADER_ALIASES["수량"]).toContain("수강");
    expect(HEADER_ALIASES["수량"]).toContain("수랑");
    expect(HEADER_ALIASES["수량"]).toContain("슈량");
  });

  it("금액 · 오독 액→엑/역", () => {
    expect(HEADER_ALIASES["금액"]).toContain("금엑");
    expect(HEADER_ALIASES["금액"]).toContain("금역");
  });
});

describe("SUPPLIER_LABELS · RECIPIENT_LABELS", () => {
  it("공급자 라벨 · 공급자·공급처·판매자", () => {
    expect(SUPPLIER_LABELS).toContain("공급자");
    expect(SUPPLIER_LABELS).toContain("공급처");
    expect(SUPPLIER_LABELS).toContain("판매자");
  });

  it("수신자 라벨 · 공급받는자·구매자·수신처", () => {
    expect(RECIPIENT_LABELS).toContain("공급받는자");
    expect(RECIPIENT_LABELS).toContain("구매자");
    expect(RECIPIENT_LABELS).toContain("수신처");
  });
});

describe("DELIVERY_INFO_LABELS · 배송/행정 정보", () => {
  it("차량번호·기사명·담당자·TEL 등", () => {
    expect(DELIVERY_INFO_LABELS).toContain("차량번호");
    expect(DELIVERY_INFO_LABELS).toContain("차람번호"); // OCR 오독
    expect(DELIVERY_INFO_LABELS).toContain("기사명");
    expect(DELIVERY_INFO_LABELS).toContain("담당자");
    expect(DELIVERY_INFO_LABELS).toContain("TEL");
  });
});

describe("isDeliveryOrAdminInfo", () => {
  it("차량번호 · true", () => {
    expect(isDeliveryOrAdminInfo("차량번호")).toBe(true);
    expect(isDeliveryOrAdminInfo("차량번호 : 12가3456")).toBe(true);
  });

  it("공백 정규화 · '차 량 번 호' → true", () => {
    expect(isDeliveryOrAdminInfo("차 량 번 호")).toBe(true);
  });

  it("일반 상호 · false", () => {
    expect(isDeliveryOrAdminInfo("한독제약")).toBe(false);
  });

  it("빈 문자열 · false", () => {
    expect(isDeliveryOrAdminInfo("")).toBe(false);
    expect(isDeliveryOrAdminInfo("   ")).toBe(false);
  });
});

describe("isHeaderNoise · 단일 문자 노이즈", () => {
  it("빈/공백 · true", () => {
    expect(isHeaderNoise("")).toBe(true);
    expect(isHeaderNoise("   ")).toBe(true);
  });

  it("정상 헤더 · false", () => {
    expect(isHeaderNoise("품명")).toBe(false);
    expect(isHeaderNoise("수량")).toBe(false);
  });
});

describe("isTotalRow · 합계/소계/부가세 행", () => {
  it("합계 · true", () => {
    expect(isTotalRow(["합계", "", "", "10000"])).toBe(true);
  });

  it("소계 · true", () => {
    expect(isTotalRow(["소계", 5000])).toBe(true);
  });

  it("공백 포함 합 계 · true", () => {
    expect(isTotalRow(["합 계", 5000])).toBe(true);
  });

  it("부가세 · true", () => {
    expect(isTotalRow(["부가세", 1000])).toBe(true);
  });

  it("일반 상품 행 · false", () => {
    expect(isTotalRow(["타이레놀", "500mg", 10, 1000, 10000])).toBe(false);
  });

  it("null · 무시 후 판정", () => {
    expect(isTotalRow([null, "합계", null, 1000])).toBe(true);
  });
});

describe("normalizeHeaderCell · 오독 정규화", () => {
  it("정상 헤더 · 원본 반환", () => {
    expect(normalizeHeaderCell("품명")).toBe("품명");
  });

  it("공백 trim", () => {
    // trim만 · 매칭 없으면 원본
    expect(normalizeHeaderCell("  품명  ")).toBe("품명");
  });
});

describe("ALL_HEADER_KEYWORDS · flatten + dedup", () => {
  it("배열 · 50개 이상", () => {
    expect(Array.isArray(ALL_HEADER_KEYWORDS)).toBe(true);
    expect(ALL_HEADER_KEYWORDS.length).toBeGreaterThan(50);
  });

  it("중복 없음", () => {
    const set = new Set(ALL_HEADER_KEYWORDS);
    expect(set.size).toBe(ALL_HEADER_KEYWORDS.length);
  });

  it("품명·수량·단가·금액 포함", () => {
    expect(ALL_HEADER_KEYWORDS).toContain("품명");
    expect(ALL_HEADER_KEYWORDS).toContain("수량");
    expect(ALL_HEADER_KEYWORDS).toContain("단가");
    expect(ALL_HEADER_KEYWORDS).toContain("금액");
  });
});

describe("DOSE_FORMS · 제형", () => {
  it("주요 제형 포함 · 정·캡슐·시럽·주사·연고", () => {
    ["정", "캡슐", "시럽", "주사", "연고", "크림", "겔"].forEach((f) => {
      expect(DOSE_FORMS).toContain(f);
    });
  });

  it("길이 내림차순 확인 · 긴 것 먼저 (부분치환 오류 방지)", () => {
    // 연질캡슐(4자) 이 캡슐(2자) 보다 먼저
    const idxLong = DOSE_FORMS.indexOf("연질캡슐");
    const idxShort = DOSE_FORMS.indexOf("캡슐");
    expect(idxLong).toBeLessThan(idxShort);
  });
});

describe("TOTAL_ROW_RE · 합계 정규식", () => {
  it("합계·소계·총계·부가세 매칭", () => {
    expect(TOTAL_ROW_RE.test("합계")).toBe(true);
    expect(TOTAL_ROW_RE.test("소계")).toBe(true);
    expect(TOTAL_ROW_RE.test("총계")).toBe(true);
    expect(TOTAL_ROW_RE.test("부가세")).toBe(true);
  });

  it("일반 상품명 · 매칭 X", () => {
    expect(TOTAL_ROW_RE.test("타이레놀")).toBe(false);
  });
});

describe("CORP_SUFFIX_RE · 법인 접미어", () => {
  it("주식회사·(주)·㈜ 등 매칭", () => {
    expect("한독제약주식회사".match(CORP_SUFFIX_RE)).not.toBeNull();
    CORP_SUFFIX_RE.lastIndex = 0;
    expect("(주)한독".match(CORP_SUFFIX_RE)).not.toBeNull();
    CORP_SUFFIX_RE.lastIndex = 0;
    expect("㈜한독".match(CORP_SUFFIX_RE)).not.toBeNull();
  });
});
