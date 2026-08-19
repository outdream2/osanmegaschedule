// 2026-08-19 · productClassify · classifyProduct · matchClassFilter · CLASS_FILTER_LABEL · CLASS_FILTER_RANGE
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

describe("classifyProduct · 기본 분류", () => {
  it("1-9 · 상비약 (stationery)", () => {
    expect(classifyProduct("1")).toBe("stationery");
    expect(classifyProduct("5A")).toBe("stationery");
    expect(classifyProduct("9B")).toBe("stationery");
  });

  it("10 이상 · 일반약 (general)", () => {
    expect(classifyProduct("10")).toBe("general");
    expect(classifyProduct("15A")).toBe("general");
    expect(classifyProduct("42")).toBe("general");
    expect(classifyProduct("100Z")).toBe("general");
  });

  it("null/undefined/empty · unknown", () => {
    expect(classifyProduct(null)).toBe("unknown");
    expect(classifyProduct(undefined)).toBe("unknown");
    expect(classifyProduct("")).toBe("unknown");
  });

  it("숫자 없음 · unknown", () => {
    expect(classifyProduct("ABC")).toBe("unknown");
    expect(classifyProduct("X")).toBe("unknown");
  });

  it("0 · unknown (구역 없음)", () => {
    expect(classifyProduct("0")).toBe("unknown");
  });
});

describe("classifyProduct · 다중 구역 (첫 구역만)", () => {
  it("슬래시 · 첫 구역 사용", () => {
    expect(classifyProduct("1A/10B")).toBe("stationery");
    expect(classifyProduct("10/1")).toBe("general");
  });

  it("하이픈 · 첫 구역 사용", () => {
    expect(classifyProduct("5-15")).toBe("stationery");
  });

  it("공백 · 첫 구역 사용", () => {
    expect(classifyProduct("3 20")).toBe("stationery");
  });

  it("언더스코어 · 첫 구역 사용", () => {
    expect(classifyProduct("2_11")).toBe("stationery");
  });
});

describe("matchClassFilter", () => {
  it("all · 모두 true", () => {
    expect(matchClassFilter("1", "all")).toBe(true);
    expect(matchClassFilter("10", "all")).toBe(true);
    expect(matchClassFilter(null, "all")).toBe(true);
  });

  it("stationery · 1-9 만 true", () => {
    expect(matchClassFilter("5", "stationery")).toBe(true);
    expect(matchClassFilter("10", "stationery")).toBe(false);
    expect(matchClassFilter(null, "stationery")).toBe(false);
  });

  it("general · 10+ 만 true", () => {
    expect(matchClassFilter("15", "general")).toBe(true);
    expect(matchClassFilter("5", "general")).toBe(false);
    expect(matchClassFilter(null, "general")).toBe(false);
  });
});

describe("CLASS_FILTER_LABEL · 상수", () => {
  it("한글 라벨", () => {
    expect(CLASS_FILTER_LABEL.all).toBe("전체");
    expect(CLASS_FILTER_LABEL.stationery).toBe("상비약");
    expect(CLASS_FILTER_LABEL.general).toBe("일반약");
  });
});

describe("CLASS_FILTER_RANGE · 정적 (deprecated)", () => {
  it("범위 표시", () => {
    expect(CLASS_FILTER_RANGE.all).toBe("");
    expect(CLASS_FILTER_RANGE.stationery).toBe("(1-9)");
    expect(CLASS_FILTER_RANGE.general).toBe("(10-)");
  });
});

describe("getClassFilterRange · 동적 (getZoneMappings 사용)", () => {
  it("all · 빈 문자열", () => {
    expect(getClassFilterRange("all")).toBe("");
  });

  it("stationery · 고정 (1-9)", () => {
    expect(getClassFilterRange("stationery")).toBe("(1-9)");
  });

  it("general · 10-max (매핑된 최대 번호)", () => {
    // mock 에서 최대 45
    expect(getClassFilterRange("general")).toBe("(10-45)");
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
