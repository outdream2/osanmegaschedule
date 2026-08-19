// 2026-08-19 · format · 통화/날짜 포맷 유틸 · null-safe · 컴팩트 표기
import { describe, it, expect } from "vitest";
import {
  fmtWonCompact,
  fmtWon,
  fmtWonNoUnit,
  fmtWonFull,
  fmtDateShort,
  fmtDateYMD,
  fmtDateMD,
  fmtDateSlice,
} from "./format";

describe("fmtWonCompact · 원화 컴팩트", () => {
  it("1억 이상 · X.X억", () => {
    expect(fmtWonCompact(100_000_000)).toBe("1.0억");
    expect(fmtWonCompact(150_000_000)).toBe("1.5억");
    expect(fmtWonCompact(2_500_000_000)).toBe("25.0억");
  });

  it("1만 이상 · X.X만", () => {
    expect(fmtWonCompact(10_000)).toBe("1.0만");
    expect(fmtWonCompact(35_000)).toBe("3.5만");
    expect(fmtWonCompact(9_999_999)).toBe("1000.0만");
  });

  it("1만 미만 · X,XXX원", () => {
    expect(fmtWonCompact(9999)).toBe("9,999원");
    expect(fmtWonCompact(500)).toBe("500원");
    expect(fmtWonCompact(0)).toBe("0원");
  });
});

describe("fmtWon · null-safe", () => {
  it("null/undefined · -", () => {
    expect(fmtWon(null)).toBe("-");
    expect(fmtWon(undefined)).toBe("-");
  });

  it("NaN · -", () => {
    expect(fmtWon(NaN)).toBe("-");
  });

  it("정상 값 · fmtWonCompact 위임", () => {
    expect(fmtWon(150_000_000)).toBe("1.5억");
    expect(fmtWon(35_000)).toBe("3.5만");
    expect(fmtWon(500)).toBe("500원");
  });
});

describe("fmtWonNoUnit · 단위 접미사 없음", () => {
  it("0 · '0'", () => {
    expect(fmtWonNoUnit(0)).toBe("0");
  });

  it("NaN · '0'", () => {
    expect(fmtWonNoUnit(NaN)).toBe("0");
  });

  it("1억 이상 · X.X억", () => {
    expect(fmtWonNoUnit(100_000_000)).toBe("1.0억");
  });

  it("1만 이상 · X.X만", () => {
    expect(fmtWonNoUnit(50_000)).toBe("5.0만");
  });

  it("1만 미만 · X,XXX (원 없음)", () => {
    expect(fmtWonNoUnit(9999)).toBe("9,999");
  });
});

describe("fmtWonFull · 풀 포맷 + 원 접미사", () => {
  it("0 · '0'", () => {
    expect(fmtWonFull(0)).toBe("0");
  });

  it("NaN · '-'", () => {
    expect(fmtWonFull(NaN)).toBe("-");
  });

  it("정상 값 · X,XXX원 (반올림)", () => {
    expect(fmtWonFull(1000)).toBe("1,000원");
    expect(fmtWonFull(1234567)).toBe("1,234,567원");
    expect(fmtWonFull(999.7)).toBe("1,000원"); // 반올림
  });
});

describe("fmtDateShort · M/D", () => {
  it("정상 · M/D", () => {
    expect(fmtDateShort("2026-08-06T10:30:00Z")).toMatch(/^\d{1,2}\/\d{1,2}$/);
    expect(fmtDateShort("2026-01-05")).toBe("1/5");
    expect(fmtDateShort("2026-12-31")).toBe("12/31");
  });

  it("null/undefined/empty · '-'", () => {
    expect(fmtDateShort(null)).toBe("-");
    expect(fmtDateShort(undefined)).toBe("-");
    expect(fmtDateShort("")).toBe("-");
  });

  it("잘못된 date · '-'", () => {
    expect(fmtDateShort("invalid-date")).toBe("-");
  });
});

describe("fmtDateYMD · YYYY.MM.DD", () => {
  it("ISO · YYYY.MM.DD zero-padded", () => {
    expect(fmtDateYMD("2026-08-06")).toBe("2026.08.06");
    expect(fmtDateYMD("2026-01-01")).toBe("2026.01.01");
    expect(fmtDateYMD("2026-12-31")).toBe("2026.12.31");
  });

  it("null/undefined/empty · '-'", () => {
    expect(fmtDateYMD(null)).toBe("-");
    expect(fmtDateYMD(undefined)).toBe("-");
    expect(fmtDateYMD("")).toBe("-");
  });

  it("잘못된 date · '-'", () => {
    expect(fmtDateYMD("invalid")).toBe("-");
  });
});

describe("fmtDateMD · M/D HH:MM", () => {
  it("정상 ISO · M/D HH:MM 형식", () => {
    const result = fmtDateMD("2026-08-06T10:30:00");
    expect(result).toMatch(/^\d{1,2}\/\d{1,2} \d{2}:\d{2}$/);
  });

  it("null/empty · '-'", () => {
    expect(fmtDateMD(null)).toBe("-");
    expect(fmtDateMD(undefined)).toBe("-");
    expect(fmtDateMD("")).toBe("-");
  });

  it("잘못된 date · '-'", () => {
    expect(fmtDateMD("bad")).toBe("-");
  });
});

describe("fmtDateSlice · YYYY-MM-DD 슬라이스", () => {
  it("앞 10자 잘라냄", () => {
    expect(fmtDateSlice("2026-08-06T10:30:00")).toBe("2026-08-06");
    expect(fmtDateSlice("2026-08-06")).toBe("2026-08-06");
  });

  it("null/undefined/empty · '-'", () => {
    expect(fmtDateSlice(null)).toBe("-");
    expect(fmtDateSlice(undefined)).toBe("-");
    expect(fmtDateSlice("")).toBe("-");
  });

  it("짧은 문자열 · 그대로", () => {
    expect(fmtDateSlice("2026-08")).toBe("2026-08");
  });
});
