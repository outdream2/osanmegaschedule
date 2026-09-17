// src/lib/dateFormat.test.ts
// 2026-09-18 · shortDate 유틸 · YY/M/D 포맷 검증
import { describe, it, expect } from "vitest";
import { shortDate } from "./dateFormat";

describe("shortDate", () => {
  it("표준 ISO YYYY-MM-DD → YY/M/D (leading zero 제거)", () => {
    expect(shortDate("2026-09-11")).toBe("26/9/11");
    expect(shortDate("2026-01-01")).toBe("26/1/1");
    expect(shortDate("2025-12-31")).toBe("25/12/31");
  });

  it("타임스탬프 (T·Z 포함) → 앞 10자만 파싱", () => {
    expect(shortDate("2026-09-11T08:30:00.000Z")).toBe("26/9/11");
    expect(shortDate("2026-09-11 08:30:00")).toBe("26/9/11");
  });

  it("null / undefined / 빈 문자열 → 빈 문자열", () => {
    expect(shortDate(null)).toBe("");
    expect(shortDate(undefined)).toBe("");
    expect(shortDate("")).toBe("");
  });

  it("잘못된 포맷 · 파싱 실패 → 원본 첫 10자 반환 (안전)", () => {
    expect(shortDate("invalid-date")).toBe("invalid-da");
    expect(shortDate("2026/09/11")).toBe("2026/09/11"); // '-' 구분 아님
  });

  it("숫자만 (leading zero) · 정상 파싱", () => {
    expect(shortDate("2026-05-05")).toBe("26/5/5");
    expect(shortDate("2026-10-10")).toBe("26/10/10");
  });
});
