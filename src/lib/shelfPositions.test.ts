// 2026-10-07 · 사용자 지시 · structured position compact label SSOT 테스트
//   · formatShelfZoneLabel / summarizeShelfZoneLabels
//   · 공유 normalization (normalizeShelfZoneLabel) 재사용 검증
//   · 기존 formatShelfDetail / formatShelfPositions / summarizeShelfPositions 테스트는 영향 없음

import { describe, it, expect } from "vitest";
import { formatShelfZoneLabel, summarizeShelfZoneLabels } from "./shelfPositions";

describe("formatShelfZoneLabel · structured position → compact label", () => {
  describe("매대 (N매대 + 알파벳)", () => {
    it("9매대 + A → 9A", () => {
      expect(formatShelfZoneLabel({ major: "9매대", middle: "A" })).toBe("9A");
    });
    it("12매대 + B → 12B", () => {
      expect(formatShelfZoneLabel({ major: "12매대", middle: "B" })).toBe("12B");
    });
    it("5매대 + Ａ (전각) → 5A", () => {
      expect(formatShelfZoneLabel({ major: "5매대", middle: "Ａ" })).toBe("5A");
    });
    it("1매대 + c (소문자) → 1C", () => {
      expect(formatShelfZoneLabel({ major: "1매대", middle: "c" })).toBe("1C");
    });
    it("9매대 alone → 9", () => {
      expect(formatShelfZoneLabel({ major: "9매대" })).toBe("9");
    });
  });

  describe("벽 (벽 + N / 벽N / 벽 N)", () => {
    it("벽 + 21 → 21", () => {
      expect(formatShelfZoneLabel({ major: "벽", middle: "21" })).toBe("21");
    });
    it("벽21 (combined, no middle) → 21", () => {
      expect(formatShelfZoneLabel({ major: "벽21" })).toBe("21");
    });
    it("벽 21 (공백 포함, combined) → 21", () => {
      expect(formatShelfZoneLabel({ major: "벽 21" })).toBe("21");
    });
    it("벽 alone → ''", () => {
      expect(formatShelfZoneLabel({ major: "벽" })).toBe("");
    });
  });

  describe("이름형 (뷰티/건기식 등)", () => {
    it("뷰티 + 1 → 뷰티1", () => {
      expect(formatShelfZoneLabel({ major: "뷰티", middle: "1" })).toBe("뷰티1");
    });
    it("뷰티1 alone → 뷰티1", () => {
      expect(formatShelfZoneLabel({ major: "뷰티1" })).toBe("뷰티1");
    });
    it("건기식 + 2 → 건기식2", () => {
      expect(formatShelfZoneLabel({ major: "건기식", middle: "2" })).toBe("건기식2");
    });
  });

  describe("NULL / EMPTY / middle only / major only", () => {
    it("둘 다 null → ''", () => {
      expect(formatShelfZoneLabel({ major: null, middle: null })).toBe("");
    });
    it("둘 다 undefined → ''", () => {
      expect(formatShelfZoneLabel({})).toBe("");
    });
    it("null position → ''", () => {
      expect(formatShelfZoneLabel(null)).toBe("");
      expect(formatShelfZoneLabel(undefined)).toBe("");
    });
    it("major only (이름형) → 이름 그대로", () => {
      expect(formatShelfZoneLabel({ major: "뷰티" })).toBe("뷰티");
    });
    it("middle only → middle 그대로", () => {
      expect(formatShelfZoneLabel({ middle: "A" })).toBe("A");
    });
  });

  describe("중분류 '전체' / 상세 (N열/N단) 무시", () => {
    it("매대 + '전체' → 매대 N 숫자만", () => {
      expect(formatShelfZoneLabel({ major: "9매대", middle: "전체" })).toBe("9");
    });
    it("벽 + '전체' → ''", () => {
      expect(formatShelfZoneLabel({ major: "벽", middle: "전체" })).toBe("");
    });
    it("매대 + '1열' → 매대 N 숫자만", () => {
      expect(formatShelfZoneLabel({ major: "5매대", middle: "1열" })).toBe("5");
    });
  });

  describe("alternative field names (zone/category 등)", () => {
    it("zone/category 필드명 지원 (zone_defs 호환)", () => {
      expect(formatShelfZoneLabel({ zone: "9매대", category: "A" })).toBe("9A");
    });
    it("large_category major alt + category middle alt", () => {
      expect(formatShelfZoneLabel({ large_category: "뷰티", category: "7" })).toBe("뷰티7");
    });
    it("major 가 zone 보다 우선", () => {
      expect(formatShelfZoneLabel({ major: "뷰티", zone: "9매대", middle: "1" })).toBe("뷰티1");
    });
    it("middle 이 category 보다 우선", () => {
      expect(formatShelfZoneLabel({ major: "9매대", middle: "A", category: "Z" })).toBe("9A");
    });
  });
});

describe("summarizeShelfZoneLabels · multiple positions", () => {
  it("3개 position · 숫자/벽/이름형 · canonical sort", () => {
    expect(
      summarizeShelfZoneLabels([
        { major: "9매대", middle: "A" },
        { major: "벽", middle: "21" },
        { major: "뷰티", middle: "1" },
      ]),
    ).toBe("9A · 21 · 뷰티1");
  });

  it("duplicate → dedupe", () => {
    expect(
      summarizeShelfZoneLabels([
        { major: "9매대", middle: "A" },
        { major: "9매대", middle: "A" },
        { major: "벽", middle: "21" },
      ]),
    ).toBe("9A · 21");
  });

  it("null/empty position 섞여 있음 → drop", () => {
    expect(
      summarizeShelfZoneLabels([
        { major: "9매대", middle: "A" },
        null,
        undefined,
        {},
        { major: "뷰티", middle: "1" },
      ]),
    ).toBe("9A · 뷰티1");
  });

  it("empty array → '-'", () => {
    expect(summarizeShelfZoneLabels([])).toBe("-");
  });

  it("null → '-'", () => {
    expect(summarizeShelfZoneLabels(null)).toBe("-");
    expect(summarizeShelfZoneLabels(undefined)).toBe("-");
  });

  it("전부 빈 결과 → '-'", () => {
    expect(summarizeShelfZoneLabels([{}, null, { major: null, middle: null }])).toBe("-");
  });

  it("숫자 접두사 사전식 sort", () => {
    expect(
      summarizeShelfZoneLabels([
        { major: "12매대", middle: "A" },
        { major: "3매대", middle: "B" },
        { major: "9매대", middle: "C" },
      ]),
    ).toBe("3B · 9C · 12A");
  });

  it("이름형 (숫자 접두 없음) 은 뒤로", () => {
    expect(
      summarizeShelfZoneLabels([
        { major: "뷰티", middle: "1" },
        { major: "9매대", middle: "A" },
        { major: "건기식", middle: "2" },
      ]),
    ).toBe("9A · 건기식2 · 뷰티1");
  });
});
