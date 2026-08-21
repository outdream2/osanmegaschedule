// 2026-08-21 · DayTimelineModal · types 상수 검증
//   DEFAULT_TONE · ZONE_ROWS · TYPE_ORDER · SKIP_TYPES
import { describe, it, expect } from "vitest";
import { DEFAULT_TONE, ZONE_ROWS, TYPE_ORDER, SKIP_TYPES } from "./types";

describe("DEFAULT_TONE · 기본 톤 (매핑 없을 때 폴백)", () => {
  it("6개 필드 정의", () => {
    expect(Object.keys(DEFAULT_TONE).sort()).toEqual(
      ["bg", "chipBg", "chipBorder", "chipText", "dot", "text"],
    );
  });

  it("bg · 슬레이트 톤 (#e2e8f0)", () => {
    expect(DEFAULT_TONE.bg).toBe("#e2e8f0");
  });

  it("text · 진한 슬레이트 (#334155)", () => {
    expect(DEFAULT_TONE.text).toBe("#334155");
  });

  it("dot · 슬레이트 400 (#94a3b8)", () => {
    expect(DEFAULT_TONE.dot).toBe("#94a3b8");
  });

  it("chipBg · 슬레이트 100 (#f1f5f9)", () => {
    expect(DEFAULT_TONE.chipBg).toBe("#f1f5f9");
  });

  it("모든 색상 · #RRGGBB 형식", () => {
    Object.values(DEFAULT_TONE).forEach(v => {
      expect(v).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

describe("ZONE_ROWS · 타임라인 구역 순서", () => {
  it("2개 · 카운터·매장", () => {
    expect(ZONE_ROWS).toEqual(["카운터", "매장"]);
  });

  it("타입 · readonly tuple", () => {
    expect(ZONE_ROWS).toHaveLength(2);
  });
});

describe("TYPE_ORDER · 근무유형 정렬 순서", () => {
  it("5개 근무유형 · 오픈=0 · 마감=4", () => {
    expect(TYPE_ORDER["오픈"]).toBe(0);
    expect(TYPE_ORDER["오전반차"]).toBe(1);
    expect(TYPE_ORDER["미들"]).toBe(2);
    expect(TYPE_ORDER["오후반차"]).toBe(3);
    expect(TYPE_ORDER["마감"]).toBe(4);
  });

  it("오픈 < 미들 < 마감 (시간대 순서)", () => {
    expect(TYPE_ORDER["오픈"]).toBeLessThan(TYPE_ORDER["미들"]);
    expect(TYPE_ORDER["미들"]).toBeLessThan(TYPE_ORDER["마감"]);
  });

  it("반차 삽입 · 오전반차는 오픈과 미들 사이", () => {
    expect(TYPE_ORDER["오픈"]).toBeLessThan(TYPE_ORDER["오전반차"]);
    expect(TYPE_ORDER["오전반차"]).toBeLessThan(TYPE_ORDER["미들"]);
  });

  it("정의되지 않은 타입 · undefined", () => {
    expect(TYPE_ORDER["없는타입"]).toBeUndefined();
  });
});

describe("SKIP_TYPES · 타임라인 스킵 대상 (Set)", () => {
  it("3개 · 휴무·월차·지정휴무", () => {
    expect(SKIP_TYPES.size).toBe(3);
    expect(SKIP_TYPES.has("휴무")).toBe(true);
    expect(SKIP_TYPES.has("월차")).toBe(true);
    expect(SKIP_TYPES.has("지정휴무")).toBe(true);
  });

  it("근무 타입 · 스킵 대상 아님", () => {
    expect(SKIP_TYPES.has("오픈")).toBe(false);
    expect(SKIP_TYPES.has("미들")).toBe(false);
    expect(SKIP_TYPES.has("마감")).toBe(false);
  });

  it("빈 문자열 · 스킵 대상 아님", () => {
    expect(SKIP_TYPES.has("")).toBe(false);
  });
});
