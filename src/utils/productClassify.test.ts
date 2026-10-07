// 2026-08-19 · productClassify · classifyProduct · matchClassFilter · CLASS_FILTER_LABEL · CLASS_FILTER_RANGE
// 2026-10-07 · 사용자 지시 · 신규 규칙 재정의 (매대/벽/뷰티 명시 매칭)
// 2026-10-07 v3 · 사용자 지시 · includes 기반 유연 매칭 (뷰티·벽) + 라벨 "뷰티" + 1-9매대 A/B 제한 완화
import { describe, it, expect, vi } from "vitest";
import {
  classifyProduct,
  matchClassFilter,
  CLASS_FILTER_LABEL,
  CLASS_FILTER_RANGE,
  getClassFilterRange,
  REAL_MAP_ZONE_REGEX,
} from "./productClassify";

// getZoneMappings mock · getClassFilterRange 는 constants 의존
vi.mock("../constants/zoneLabels", () => ({
  getZoneMappings: () => [
    { number: 1, name: "A" }, { number: 5, name: "B" },
    { number: 10, name: "C" }, { number: 25, name: "D" }, { number: 45, name: "E" },
  ],
}));

describe("classifyProduct · v3 규칙 (2026-10-07)", () => {
  describe("뷰티 포함 → cosmetics (어디든 includes)", () => {
    it("ERP raw '뷰티>N번>...' → cosmetics", () => {
      expect(classifyProduct("뷰티>2번>전체>전체")).toBe("cosmetics");
      expect(classifyProduct("뷰티>7번>전체>전체")).toBe("cosmetics");
    });
    it("Transformed '뷰티N' / 'N뷰티' / '프리미엄뷰티' → cosmetics", () => {
      expect(classifyProduct("뷰티1")).toBe("cosmetics");
      expect(classifyProduct("뷰티7")).toBe("cosmetics");
      expect(classifyProduct("프리미엄뷰티")).toBe("cosmetics");
    });
    it("중간 포함 'A매대/뷰티3' → cosmetics (어디든)", () => {
      expect(classifyProduct("A매대/뷰티3")).toBe("cosmetics");
    });
    it("'뷰티' 단독 → cosmetics", () => {
      expect(classifyProduct("뷰티")).toBe("cosmetics");
    });
  });

  describe("벽 포함 → general (어디든 includes)", () => {
    it("ERP raw '벽>N>...' / '벽' 단독 → general", () => {
      expect(classifyProduct("벽>21>전체>전체")).toBe("general");
      expect(classifyProduct("벽>45>전체>전체")).toBe("general");
      expect(classifyProduct("벽")).toBe("general");
    });
    it("중간 포함 'A매대/벽7' / 'A/벽7' → general", () => {
      expect(classifyProduct("A매대/벽7")).toBe("general");
      expect(classifyProduct("A/벽7")).toBe("general");
    });
    it("Transformed 숫자만 10+ → general", () => {
      expect(classifyProduct("22")).toBe("general");
      expect(classifyProduct("100")).toBe("general");
    });
  });

  describe("1-9매대 → stationery (섹터 무관 · A/B 제한 완화)", () => {
    it("ERP raw 'N매대>섹터>...' → stationery (어디든 N=1~9)", () => {
      expect(classifyProduct("1매대")).toBe("stationery");
      expect(classifyProduct("1매대>Ａ>3열>전체")).toBe("stationery");
      expect(classifyProduct("5매대>C>...")).toBe("stationery");
      expect(classifyProduct("9매대>뒤>...")).toBe("stationery");
      expect(classifyProduct("6매대>A>3열>전체")).toBe("stationery");
    });
    it("Transformed 'NA' / 'NB' (N=1~9) → stationery", () => {
      expect(classifyProduct("1A")).toBe("stationery");
      expect(classifyProduct("9B")).toBe("stationery");
      expect(classifyProduct("5A")).toBe("stationery");
    });
  });

  describe("10+매대 → general (섹터 무관)", () => {
    it("ERP raw '10+매대>...' → general", () => {
      expect(classifyProduct("10매대")).toBe("general");
      expect(classifyProduct("22매대>A>전체>전체")).toBe("general");
      expect(classifyProduct("38매대>C>전체>전체")).toBe("general");
    });
    it("Transformed 숫자 10+ → general", () => {
      expect(classifyProduct("10")).toBe("general");
      expect(classifyProduct("22")).toBe("general");
    });
  });

  describe("미분류 (unknown)", () => {
    it("null/undefined/empty → unknown", () => {
      expect(classifyProduct(null)).toBe("unknown");
      expect(classifyProduct(undefined)).toBe("unknown");
      expect(classifyProduct("")).toBe("unknown");
    });
    it("냉장고 · 물약 · 기타 → unknown", () => {
      expect(classifyProduct("냉장고")).toBe("unknown");
      expect(classifyProduct("냉장고>1>전체>전체")).toBe("unknown");
      expect(classifyProduct("물약")).toBe("unknown");
      expect(classifyProduct("기타")).toBe("unknown");
    });
    it("숫자 없음 · 매대·벽·뷰티 없음 → unknown", () => {
      expect(classifyProduct("ABC")).toBe("unknown");
      expect(classifyProduct("X")).toBe("unknown");
    });
  });

  describe("우선순위 · 뷰티 > 벽 > 매대 > 숫자단독", () => {
    it("'뷰티/벽' → cosmetics (뷰티 우선)", () => {
      expect(classifyProduct("뷰티/벽")).toBe("cosmetics");
    });
    it("'벽/1매대' → general (벽 우선)", () => {
      expect(classifyProduct("벽/1매대")).toBe("general");
    });
    it("'1매대/뷰티' → cosmetics (뷰티 우선)", () => {
      expect(classifyProduct("1매대/뷰티")).toBe("cosmetics");
    });
  });
});

describe("matchClassFilter", () => {
  it("all · 모두 true", () => {
    expect(matchClassFilter("1A", "all")).toBe(true);
    expect(matchClassFilter("21", "all")).toBe(true);
    expect(matchClassFilter(null, "all")).toBe(true);
  });

  it("stationery · 1-9매대 만 true", () => {
    expect(matchClassFilter("5A", "stationery")).toBe(true);
    expect(matchClassFilter("1매대", "stationery")).toBe(true);
    expect(matchClassFilter("21", "stationery")).toBe(false);
    expect(matchClassFilter("뷰티1", "stationery")).toBe(false);
    expect(matchClassFilter(null, "stationery")).toBe(false);
  });

  it("general · 벽 or 10+ 만 true", () => {
    expect(matchClassFilter("15", "general")).toBe(true);
    expect(matchClassFilter("벽>21>전체>전체", "general")).toBe(true);
    expect(matchClassFilter("5A", "general")).toBe(false);
    expect(matchClassFilter("뷰티1", "general")).toBe(false);
    expect(matchClassFilter(null, "general")).toBe(false);
  });

  it("cosmetics · 뷰티 포함 만 true", () => {
    expect(matchClassFilter("뷰티1", "cosmetics")).toBe(true);
    expect(matchClassFilter("뷰티>2번>전체>전체", "cosmetics")).toBe(true);
    expect(matchClassFilter("A매대/뷰티3", "cosmetics")).toBe(true);
    expect(matchClassFilter("5A", "cosmetics")).toBe(false);
    expect(matchClassFilter("21", "cosmetics")).toBe(false);
  });
});

describe("CLASS_FILTER_LABEL · 상수 (v3 · 뷰티)", () => {
  it("한글 라벨", () => {
    expect(CLASS_FILTER_LABEL.all).toBe("전체");
    expect(CLASS_FILTER_LABEL.stationery).toBe("상비약");
    expect(CLASS_FILTER_LABEL.general).toBe("일반약");
    expect(CLASS_FILTER_LABEL.cosmetics).toBe("뷰티");
    expect(CLASS_FILTER_LABEL.unknown).toBe("미분류");
  });
});

describe("CLASS_FILTER_RANGE · 정적 (deprecated · v3 호환)", () => {
  it("범위 표시", () => {
    expect(CLASS_FILTER_RANGE.all).toBe("");
    expect(CLASS_FILTER_RANGE.stationery).toBe("(1-9매대)");
    expect(CLASS_FILTER_RANGE.general).toBe("(벽/10+)");
    expect(CLASS_FILTER_RANGE.cosmetics).toBe("");
    expect(CLASS_FILTER_RANGE.unknown).toBe("");
  });
});

describe("getClassFilterRange · 동적 (getZoneMappings 사용)", () => {
  it("all · 빈 문자열", () => {
    expect(getClassFilterRange("all")).toBe("");
  });

  it("stationery · 고정 (1-9매대)", () => {
    expect(getClassFilterRange("stationery")).toBe("(1-9매대)");
  });

  it("general · 벽/10-max (매핑된 최대 번호)", () => {
    // mock 에서 최대 45
    expect(getClassFilterRange("general")).toBe("(벽/10-45)");
  });

  it("cosmetics · 빈 문자열", () => {
    expect(getClassFilterRange("cosmetics")).toBe("");
  });
});

describe("REAL_MAP_ZONE_REGEX", () => {
  it("숫자 앞부분 매칭", () => {
    const m1 = "10A".match(REAL_MAP_ZONE_REGEX);
    expect(m1?.[1]).toBe("10");
    const m2 = "5B".match(REAL_MAP_ZONE_REGEX);
    expect(m2?.[1]).toBe("5");
  });

  it("숫자 없음 · null", () => {
    expect("ABC".match(REAL_MAP_ZONE_REGEX)).toBeNull();
  });
});
