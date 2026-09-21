// src/lib/salesRecommendation/eventCategoryRules.test.ts
// 2026-09-21 · #326 · SSOT 규칙 · 회귀 방지 테스트
import { describe, it, expect } from "vitest";
import {
  EVENT_CATEGORY_RULES,
  OFF_SEASON_RANGES,
  getRuleForEventType,
  matchCategoryWeight,
  isOffSeason,
} from "./eventCategoryRules";

describe("eventCategoryRules · SSOT", () => {
  it("모든 이벤트 타입 규칙 존재 (custom 제외)", () => {
    const types = EVENT_CATEGORY_RULES.map(r => r.eventType).sort();
    expect(types).toEqual(["fall", "holiday", "school", "spring", "summer", "winter"]);
  });

  it("각 규칙 · triggerBefore ≥ 1 · categories 비어있지 않음 · reason 존재", () => {
    for (const r of EVENT_CATEGORY_RULES) {
      expect(r.triggerBefore).toBeGreaterThanOrEqual(1);
      expect(r.categories.length).toBeGreaterThan(0);
      expect(r.reason.length).toBeGreaterThan(5);
    }
  });

  it("holiday · triggerBefore = 7", () => {
    const r = getRuleForEventType("holiday");
    expect(r?.triggerBefore).toBe(7);
    expect(r?.categories).toContain("해열");
  });

  it("school · triggerBefore = 21 (수험생 미리 준비)", () => {
    const r = getRuleForEventType("school");
    expect(r?.triggerBefore).toBe(21);
  });

  it("custom · 규칙 없음 → null", () => {
    expect(getRuleForEventType("custom")).toBeNull();
  });

  it("대소문자 무관", () => {
    expect(getRuleForEventType("HOLIDAY")).not.toBeNull();
    expect(getRuleForEventType("Winter")).not.toBeNull();
  });

  it("Unknown type → null", () => {
    expect(getRuleForEventType("foobar")).toBeNull();
    expect(getRuleForEventType("")).toBeNull();
  });
});

describe("matchCategoryWeight · 부분 매칭", () => {
  it("holiday · 종합감기약 → 감기 키워드 매칭 · weight 1.2", () => {
    const r = getRuleForEventType("holiday")!;
    expect(matchCategoryWeight("종합감기약", r)).toBe(1.2);
  });

  it("winter · 종합감기약 → 종합감기 (1.4) · 감기 (1.3) 중 최고 · 1.4", () => {
    const r = getRuleForEventType("winter")!;
    expect(matchCategoryWeight("종합감기약", r)).toBe(1.4);
  });

  it("summer · 모기약 → 1.4", () => {
    const r = getRuleForEventType("summer")!;
    expect(matchCategoryWeight("모기약", r)).toBe(1.4);
  });

  it("spring · 종합영양제 → 종합영양 (1.0) · 영양제 (1.2) 중 최고 · 1.2", () => {
    const r = getRuleForEventType("spring")!;
    expect(matchCategoryWeight("종합영양제", r)).toBe(1.2);
  });

  it("weight 없는 카테고리 · 기본 1.0", () => {
    const r = getRuleForEventType("summer")!;
    // '냉장의약품' · weights 미지정 · 1.0
    expect(matchCategoryWeight("냉장의약품", r)).toBe(1.0);
  });

  it("매칭 안됨 · 0", () => {
    const r = getRuleForEventType("holiday")!;
    expect(matchCategoryWeight("샴푸", r)).toBe(0);
    expect(matchCategoryWeight("", r)).toBe(0);
    expect(matchCategoryWeight(null, r)).toBe(0);
  });
});

describe("OFF_SEASON_RANGES · 저수기", () => {
  it("2월 · 저수기 판정", () => {
    const feb = new Date(2026, 1, 15); // month index 1 = 2월
    const off = isOffSeason(feb);
    expect(off).not.toBeNull();
    expect(off?.label).toContain("2월");
  });

  it("8월 1~10일 · 저수기 판정", () => {
    const aug5 = new Date(2026, 7, 5);
    const off = isOffSeason(aug5);
    expect(off).not.toBeNull();
    expect(off?.label).toContain("8월");
  });

  it("8월 11일 이후 · 저수기 아님", () => {
    const aug15 = new Date(2026, 7, 15);
    expect(isOffSeason(aug15)).toBeNull();
  });

  it("3월 · 저수기 아님", () => {
    const mar = new Date(2026, 2, 15);
    expect(isOffSeason(mar)).toBeNull();
  });

  it("모든 저수기 · label·reason 존재", () => {
    for (const r of OFF_SEASON_RANGES) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.reason.length).toBeGreaterThan(5);
    }
  });
});
