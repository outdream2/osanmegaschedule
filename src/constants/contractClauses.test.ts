// 2026-08-20 · contractClauses · 상수 검증
import { describe, it, expect } from "vitest";
import {
  DISCIPLINE_REASONS,
  HOLIDAY_CLAUSES,
  WAGE_CLAUSES,
  WAGE_CLAUSE_EXTRA,
  ETC_ITEMS,
  PRIVACY_ITEMS,
} from "./contractClauses";

describe("DISCIPLINE_REASONS", () => {
  it("13개 조항", () => {
    expect(DISCIPLINE_REASONS).toHaveLength(13);
  });

  it("모든 항목 · 비어있지 않음", () => {
    DISCIPLINE_REASONS.forEach((r) => {
      expect(r.length).toBeGreaterThan(0);
    });
  });

  it("첫 조항 · 부정 및 허위", () => {
    expect(DISCIPLINE_REASONS[0]).toContain("부정 및 허위");
  });

  it("직장 내 괴롭힘 · 포함", () => {
    expect(DISCIPLINE_REASONS.some((r) => r.includes("괴롭힘"))).toBe(true);
  });
});

describe("HOLIDAY_CLAUSES", () => {
  it("4개 조항", () => {
    expect(HOLIDAY_CLAUSES).toHaveLength(4);
  });

  it("주휴일 · 일요일 명시", () => {
    expect(HOLIDAY_CLAUSES[0]).toContain("주휴일은 일요일");
  });

  it("근로자의 날 · 유급휴일", () => {
    expect(HOLIDAY_CLAUSES[1]).toContain("근로자의 날");
    expect(HOLIDAY_CLAUSES[1]).toContain("유급휴일");
  });

  it("토요일 · 무급휴무일", () => {
    expect(HOLIDAY_CLAUSES[2]).toContain("토요일");
    expect(HOLIDAY_CLAUSES[2]).toContain("무급휴무일");
  });

  it("공휴일 규정 · 5인 미만 예외 명시", () => {
    expect(HOLIDAY_CLAUSES[3]).toContain("공휴일");
    expect(HOLIDAY_CLAUSES[3]).toContain("5인 미만");
  });
});

describe("WAGE_CLAUSES", () => {
  it("5개 조항", () => {
    expect(WAGE_CLAUSES).toHaveLength(5);
  });

  it("포괄임금 · 연장·휴일 포함 명시", () => {
    expect(WAGE_CLAUSES[0]).toContain("연장");
    expect(WAGE_CLAUSES[0]).toContain("휴일");
  });

  it("연차휴가수당 · 포괄 지급 동의", () => {
    expect(WAGE_CLAUSES[2]).toContain("연차휴가수당");
  });

  it("모든 조항 · 비어있지 않음", () => {
    WAGE_CLAUSES.forEach((c) => expect(c.length).toBeGreaterThan(30));
  });
});

describe("WAGE_CLAUSE_EXTRA", () => {
  it("지각 · 조퇴 · 결근 · 공제 언급", () => {
    expect(WAGE_CLAUSE_EXTRA).toContain("지각");
    expect(WAGE_CLAUSE_EXTRA).toContain("조퇴");
    expect(WAGE_CLAUSE_EXTRA).toContain("결근");
    expect(WAGE_CLAUSE_EXTRA).toContain("공제");
  });
});

describe("ETC_ITEMS", () => {
  it("5개 항목", () => {
    expect(ETC_ITEMS).toHaveLength(5);
  });

  it("임금 지급방법 · 통장 입금", () => {
    expect(ETC_ITEMS[0]).toContain("임금");
    expect(ETC_ITEMS[0]).toContain("통장");
  });

  it("퇴사 30일 전 통보", () => {
    expect(ETC_ITEMS[2]).toContain("30일");
    expect(ETC_ITEMS[2]).toContain("사직서");
  });
});

describe("PRIVACY_ITEMS", () => {
  it("4분류", () => {
    expect(PRIVACY_ITEMS).toHaveLength(4);
  });

  it("성명 · 주민번호 · 주소 · 연락처", () => {
    expect(PRIVACY_ITEMS[0]).toContain("성명");
    expect(PRIVACY_ITEMS[0]).toContain("주민번호");
    expect(PRIVACY_ITEMS[0]).toContain("주소");
  });

  it("학력 · 근무경력 · 금융정보", () => {
    expect(PRIVACY_ITEMS[1]).toContain("학력");
    expect(PRIVACY_ITEMS[1]).toContain("금융정보");
  });

  it("CCTV · 화상영상", () => {
    expect(PRIVACY_ITEMS[3]).toContain("CCTV");
  });
});
