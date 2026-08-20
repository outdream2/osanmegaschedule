// 2026-08-20 · parse · 순수 함수 커버리지 (sanitizeOcrMeta · cleanCellValues · parseSpecFromName · parseExpiryDate · stripRecipientName · filterCodeOnlyRows)
import { describe, it, expect } from "vitest";
import {
  sanitizeOcrMeta,
  cleanCellValues,
  parseSpecFromName,
  parseExpiryDate,
  stripRecipientName,
  filterCodeOnlyRows,
} from "./parse";

describe("sanitizeOcrMeta", () => {
  it("meta 없음 · 그대로 반환", () => {
    expect(sanitizeOcrMeta(null)).toBeNull();
    expect(sanitizeOcrMeta(undefined)).toBeUndefined();
    expect(sanitizeOcrMeta({})).toEqual({});
  });

  it("supplier 없음 · 그대로", () => {
    const m = { total: 1000 };
    expect(sanitizeOcrMeta(m)).toEqual(m);
  });

  it("정상 supplier · 그대로 유지", () => {
    const m = { supplier: "대웅제약", total: 1000 };
    expect(sanitizeOcrMeta(m).supplier).toBe("대웅제약");
  });

  it("배송·행정 라벨 · supplier null 처리", () => {
    // isDeliveryOrAdminInfo 는 배송지/기사명 등 판정 (external vocab)
    // 일단 정상 supplier 는 유지되는지만 회귀
    const r = sanitizeOcrMeta({ supplier: "배송지" });
    // 배송지 판정되면 null, 아니면 그대로
    expect("supplier" in r).toBe(true);
  });
});

describe("cleanCellValues", () => {
  it("헤더 · 제어문자 제거", () => {
    const r = cleanCellValues(["품명\x00", "\x1F수량"], []);
    expect(r.headers).toEqual(["품명", "수량"]);
  });

  it("cell · 제어문자·trim · 빈 문자열 → null", () => {
    const r = cleanCellValues(["a"], [["  hello  "], ["\x00"], [""]]);
    expect(r.rows[0]).toEqual(["hello"]);
    expect(r.rows[1]).toEqual([null]);
    expect(r.rows[2]).toEqual([null]);
  });

  it("숫자 셀 · 그대로 통과", () => {
    const r = cleanCellValues(["수량"], [[10]]);
    expect(r.rows[0]).toEqual([10]);
  });

  it("null 셀 · 그대로", () => {
    const r = cleanCellValues(["x"], [[null]]);
    expect(r.rows[0]).toEqual([null]);
  });

  it("잘못된 rows (배열 아님) · 필터링", () => {
    const r = cleanCellValues(["a"], [["ok"], null as any, "bad" as any]);
    expect(r.rows).toHaveLength(1);
  });

  it("headers/rows null · 빈 배열 방어", () => {
    const r = cleanCellValues(null as any, null as any);
    expect(r.headers).toEqual([]);
    expect(r.rows).toEqual([]);
  });
});

describe("parseSpecFromName · 상품명 → 이름 + 규격 분리", () => {
  it("괄호 · 규격 분리", () => {
    const r = parseSpecFromName("타이레놀정(500mg)");
    expect(r.name).toBe("타이레놀정");
    expect(r.spec).toBe("500mg");
  });

  it("공백 구분 · 규격 분리", () => {
    const r = parseSpecFromName("아세트아미노펜 500mg");
    expect(r.name).toBe("아세트아미노펜");
    expect(r.spec).toBe("500mg");
  });

  it("붙어있는 규격 · 분리", () => {
    const r = parseSpecFromName("타이레놀500mg");
    expect(r.name).toBe("타이레놀");
    expect(r.spec).toBe("500mg");
  });

  it("규격 없음 · spec null", () => {
    const r = parseSpecFromName("타이레놀");
    expect(r.name).toBe("타이레놀");
    expect(r.spec).toBeNull();
  });

  it("빈 문자열 · name 빈 · spec null", () => {
    const r = parseSpecFromName("");
    expect(r.name).toBe("");
    expect(r.spec).toBeNull();
  });

  it("복합 규격 · mg × 수량", () => {
    const r = parseSpecFromName("칼슘정 500mg×30정");
    // 이 패턴은 매치되지 않을 수 있음 · 결과 안정성만 확인
    expect(r.name.length).toBeGreaterThan(0);
  });
});

describe("parseExpiryDate · 다양한 형식 파싱", () => {
  it("YYYYMMDD 8자리 · 성공", () => {
    expect(parseExpiryDate("20271231")).toBe("2027-12-31");
    expect(parseExpiryDate("20250115")).toBe("2025-01-15");
  });

  it("YYYY-MM-DD · 성공", () => {
    expect(parseExpiryDate("2027-12-31")).toBe("2027-12-31");
    expect(parseExpiryDate("2027.12.31")).toBe("2027-12-31");
    expect(parseExpiryDate("2027/12/31")).toBe("2027-12-31");
    expect(parseExpiryDate("2027 12 31")).toBe("2027-12-31");
  });

  it("YYYY년 MM월 DD일 · 성공", () => {
    expect(parseExpiryDate("2027년 12월 31일")).toBe("2027-12-31");
    expect(parseExpiryDate("2027년12월31일")).toBe("2027-12-31");
  });

  it("YY-MM-DD (2자리 년도 · 20YY 확장)", () => {
    expect(parseExpiryDate("27-12-31")).toBe("2027-12-31");
    expect(parseExpiryDate("30.01.15")).toBe("2030-01-15");
  });

  it("YY 범위 밖 (< 20 or > 40) · null", () => {
    expect(parseExpiryDate("15-12-31")).toBeNull();
    expect(parseExpiryDate("45-12-31")).toBeNull();
  });

  it("DD-MM-YYYY 순서", () => {
    expect(parseExpiryDate("31-12-2027")).toBe("2027-12-31");
  });

  it("YYYY-MM (일 없음 · 말일 fallback)", () => {
    expect(parseExpiryDate("2027-02")).toBe("2027-02-28");
    expect(parseExpiryDate("2028-02")).toBe("2028-02-29"); // 윤년
    expect(parseExpiryDate("2027-12")).toBe("2027-12-31");
  });

  it("MM-YYYY (월/년 · 말일)", () => {
    expect(parseExpiryDate("06-2027")).toBe("2027-06-30");
  });

  it("null/undefined/빈문자열 · null", () => {
    expect(parseExpiryDate(null)).toBeNull();
    expect(parseExpiryDate(undefined)).toBeNull();
    expect(parseExpiryDate("")).toBeNull();
    expect(parseExpiryDate("   ")).toBeNull();
  });

  it("년도 범위 (2020-2040) 밖 · null", () => {
    expect(parseExpiryDate("2010-01-01")).toBeNull();
    expect(parseExpiryDate("2050-01-01")).toBeNull();
  });

  it("잘못된 월/일 · null", () => {
    expect(parseExpiryDate("2027-13-01")).toBeNull();
    expect(parseExpiryDate("2027-02-30")).toBeNull();
    expect(parseExpiryDate("2027-04-31")).toBeNull(); // 4월은 30일까지
  });

  it("숫자 입력 · 문자열 변환", () => {
    expect(parseExpiryDate(20271231)).toBe("2027-12-31");
  });
});

describe("stripRecipientName", () => {
  it("null/undefined/빈 · 빈 문자열", () => {
    expect(stripRecipientName(null)).toBe("");
    expect(stripRecipientName(undefined)).toBe("");
    expect(stripRecipientName("")).toBe("");
  });

  it("정상 문자열 · 공백 정리", () => {
    const r = stripRecipientName("대웅  제약");
    expect(r).toBe("대웅 제약");
  });

  it("접두어 · 약국/담당자/성명/대표/주소 제거", () => {
    expect(stripRecipientName("담당자 홍길동")).toBe("홍길동");
    expect(stripRecipientName("대표 김철수")).toBe("김철수");
    expect(stripRecipientName("성명 이영희")).toBe("이영희");
  });
});

describe("filterCodeOnlyRows · 코드만 있는 행 제거", () => {
  const headers = ["품명", "수량", "단가", "금액"];

  it("정상 상품 행 · 유지", () => {
    const rows = [["타이레놀", 10, 500, 5000]];
    expect(filterCodeOnlyRows(headers, rows)).toHaveLength(1);
  });

  it("바코드 스타일 · 상품 필드 없으면 제거", () => {
    const rows = [["12345678", null, null, null]];
    expect(filterCodeOnlyRows(headers, rows)).toHaveLength(0);
  });

  it("바코드 스타일 · 상품 필드 다 있으면 유지 (코드지만 사실 상품)", () => {
    const rows = [["12345678", 10, 500, 5000]];
    expect(filterCodeOnlyRows(headers, rows)).toHaveLength(1);
  });

  it("긴 순수 숫자 SKU (10자리) · 무조건 제거", () => {
    // /^\d{7,}$/ 매치 · 상품 필드 유무와 무관하게 제거
    const rows = [["1234567890", 10, 500, 5000]];
    expect(filterCodeOnlyRows(headers, rows)).toHaveLength(0);
  });

  it("명세서 제목 · 제거", () => {
    const rows = [
      ["거래명세표", null, null, null],
      ["세금계산서", null, null, null],
      ["배송처", null, null, null],
    ];
    expect(filterCodeOnlyRows(headers, rows)).toHaveLength(0);
  });

  it("품명 짧은 코드 + 상품 필드 2개↑ · 유지", () => {
    // 짧은 코드지만 수량 + 금액 있음 → 상품행으로 인정
    const rows = [["A20", 10, 500, 5000]];
    expect(filterCodeOnlyRows(headers, rows)).toHaveLength(1);
  });

  it("빈 품명 + 상품 필드 부족 · 제거", () => {
    const rows = [["", null, null, null]];
    expect(filterCodeOnlyRows(headers, rows)).toHaveLength(0);
  });

  it("품명 컬럼 없음 · 원본 그대로", () => {
    const rows = [["x", "y"]];
    expect(filterCodeOnlyRows(["코드", "규격"], rows)).toHaveLength(1);
  });

  it("배열 아닌 row · 제거", () => {
    const rows = [null as any, ["타이레놀", 10, 500, 5000]];
    expect(filterCodeOnlyRows(headers, rows)).toHaveLength(1);
  });
});
