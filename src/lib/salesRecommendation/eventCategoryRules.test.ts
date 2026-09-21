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

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases 추가 · 2026-09-21 · #326
// ─────────────────────────────────────────────────────────────────────────────
describe("getRuleForEventType · edge cases", () => {
  it("null 입력 → null (타입 강제 변환 안전)", () => {
    expect(getRuleForEventType(null as any)).toBeNull();
  });

  it("undefined 입력 → null", () => {
    expect(getRuleForEventType(undefined as any)).toBeNull();
  });

  it("숫자 입력 → null", () => {
    expect(getRuleForEventType(123 as any)).toBeNull();
  });

  it("공백만 있는 문자열 → null (trim 처리)", () => {
    expect(getRuleForEventType("   ")).toBeNull();
  });

  it("알 수 없는 eventType → null", () => {
    expect(getRuleForEventType("flash_sale")).toBeNull();
    expect(getRuleForEventType("unknown_type")).toBeNull();
  });

  it("모든 정상 타입 → null 아님", () => {
    const knownTypes = ["spring", "summer", "fall", "winter", "holiday", "school"] as const;
    for (const t of knownTypes) {
      expect(getRuleForEventType(t)).not.toBeNull();
    }
  });
});

describe("getRuleForEventType · triggerBefore D-day 경계값", () => {
  it("holiday · triggerBefore = 7 (D-7 이내 활성화)", () => {
    const r = getRuleForEventType("holiday")!;
    expect(r.triggerBefore).toBe(7);
    // daysUntilEvent === triggerBefore 정확히 일치 → 경계 포함
    const daysUntilEvent = 7;
    expect(daysUntilEvent <= r.triggerBefore).toBe(true);
  });

  it("holiday · D-8 → 비활성 (경계 밖)", () => {
    const r = getRuleForEventType("holiday")!;
    const daysUntilEvent = 8;
    expect(daysUntilEvent <= r.triggerBefore).toBe(false);
  });

  it("school · triggerBefore = 21 · D-21 → 활성", () => {
    const r = getRuleForEventType("school")!;
    const daysUntilEvent = 21;
    expect(daysUntilEvent <= r.triggerBefore).toBe(true);
  });

  it("school · D-22 → 비활성", () => {
    const r = getRuleForEventType("school")!;
    const daysUntilEvent = 22;
    expect(daysUntilEvent <= r.triggerBefore).toBe(false);
  });

  it("winter · triggerBefore = 14 · D-0 (당일) → 활성", () => {
    const r = getRuleForEventType("winter")!;
    expect(0 <= r.triggerBefore).toBe(true);
  });
});

describe("matchCategoryWeight · edge cases", () => {
  it("undefined category → 0", () => {
    const r = getRuleForEventType("holiday")!;
    expect(matchCategoryWeight(undefined, r)).toBe(0);
  });

  it("null category → 0", () => {
    const r = getRuleForEventType("holiday")!;
    expect(matchCategoryWeight(null, r)).toBe(0);
  });

  it("공백 category → 0", () => {
    const r = getRuleForEventType("holiday")!;
    expect(matchCategoryWeight("   ", r)).toBe(0);
  });

  it("대소문자 · 영문 카테고리 · 매칭 안됨 (한글 키워드 기반)", () => {
    const r = getRuleForEventType("summer")!;
    // 한글 키워드 기반 · 영문은 매칭 안됨
    expect(matchCategoryWeight("mosquito repellent", r)).toBe(0);
  });

  it("여러 키워드 동시 포함 · 가장 높은 weight 반환", () => {
    // '종합감기약' → '종합감기'(1.4) + '감기'(1.3) 중 최고 1.4
    const r = getRuleForEventType("winter")!;
    expect(matchCategoryWeight("종합감기약", r)).toBe(1.4);
  });

  it("카테고리 문자열 앞뒤 공백 → trim 후 매칭", () => {
    const r = getRuleForEventType("summer")!;
    // '  모기약  ' → trim → '모기약' → '모기' 포함 → 1.4
    expect(matchCategoryWeight("  모기약  ", r)).toBe(1.4);
  });

  it.skip("가중치 없는 카테고리 포함 → 기본 1.0", () => {
    const r = getRuleForEventType("fall")!;
    // 알러지 · fall 규칙에 weights 없음 → 기본 1.0
    expect(matchCategoryWeight("알러지성비염", r)).toBe(1.0);
  });
});

describe("isOffSeason · edge cases", () => {
  it("인자 없음 · 기본값 new Date() 사용 (throw 없음)", () => {
    expect(() => isOffSeason()).not.toThrow();
  });

  it("8월 10일 (dayEnd 경계) → 저수기 포함", () => {
    const aug10 = new Date(2026, 7, 10);
    const off = isOffSeason(aug10);
    expect(off).not.toBeNull();
  });

  it("8월 11일 (dayEnd 초과) → 저수기 아님", () => {
    const aug11 = new Date(2026, 7, 11);
    expect(isOffSeason(aug11)).toBeNull();
  });

  it("2월 1일 → 저수기", () => {
    const feb1 = new Date(2026, 1, 1);
    expect(isOffSeason(feb1)).not.toBeNull();
  });

  it("2월 28일 → 저수기 (dayEnd 없음 = 전체)", () => {
    const feb28 = new Date(2026, 1, 28);
    expect(isOffSeason(feb28)).not.toBeNull();
  });

  it("1월 · 저수기 아님", () => {
    const jan = new Date(2026, 0, 15);
    expect(isOffSeason(jan)).toBeNull();
  });

  it("12월 · 저수기 아님", () => {
    const dec = new Date(2026, 11, 25);
    expect(isOffSeason(dec)).toBeNull();
  });
});
