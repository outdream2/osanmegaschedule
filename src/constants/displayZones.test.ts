// 2026-08-20 · displayZones · ZONE_DEFS · parseRealMapValue · getZoneCategoryBySide · SECTION_LABEL
import { describe, it, expect } from "vitest";
import {
  ZONE_DEFS,
  ZONES_STORAGE_KEY,
  SECTION_LABEL,
  parseRealMapValue,
  getZoneCategoryBySide,
  type ZoneDef,
} from "./displayZones";

describe("ZONE_DEFS", () => {
  it("모든 zone · num/label/category/section 필수", () => {
    ZONE_DEFS.forEach((z) => {
      expect(z.num).toBeGreaterThan(0);
      expect(z.label).toBeTruthy();
      expect(z.category).toBeTruthy();
      expect(z.section).toBeTruthy();
    });
  });

  it("22번 · aisle · 최상단 단독", () => {
    const zone22 = ZONE_DEFS.find(z => z.num === 22);
    expect(zone22).toBeDefined();
    expect(zone22!.section).toBe("aisle");
    expect(zone22!.subA).toBeUndefined();
    expect(zone22!.subB).toBeUndefined();
  });

  it("1~8번 진열대 · aisle · subA/subB 양쪽 정의", () => {
    for (let i = 1; i <= 8; i++) {
      const zone = ZONE_DEFS.find(z => z.num === i && z.section === "aisle");
      if (zone) {
        expect(zone.subA).toBeTruthy();
        expect(zone.subB).toBeTruthy();
      }
    }
  });

  // 2026-08-26 · 사용자 지시 · 계산대 40 · A/B/C 분할 제거 · 단일 구역
  it("40번 계산대 · 단일 구역 (subA/B/C 없음)", () => {
    const zone40 = ZONE_DEFS.find(z => z.num === 40);
    expect(zone40).toBeDefined();
    expect(zone40!.subA).toBeUndefined();
    expect(zone40!.subB).toBeUndefined();
    expect(zone40!.subC).toBeUndefined();
    expect(zone40!.label).toBe("계산대");
  });

  it("section · aisle/bottom_wall/top_wall/wing/event 만", () => {
    const validSections = new Set(["aisle", "bottom_wall", "top_wall", "left_wall", "wing", "event"]);
    ZONE_DEFS.forEach((z) => {
      expect(validSections.has(z.section)).toBe(true);
    });
  });
});

describe("ZONES_STORAGE_KEY · v4", () => {
  it("현재 버전 · megatown_display_zones_v4", () => {
    expect(ZONES_STORAGE_KEY).toBe("megatown_display_zones_v4");
  });
});

describe("SECTION_LABEL · 한글 라벨", () => {
  it("6 section 매핑", () => {
    expect(SECTION_LABEL.top_wall).toBe("상단 벽면");
    expect(SECTION_LABEL.aisle).toBe("중앙 진열대");
    expect(SECTION_LABEL.left_wall).toBe("좌측 벽면");
    expect(SECTION_LABEL.bottom_wall).toBe("하단 벽면");
    expect(SECTION_LABEL.wing).toBe("우측 윙");
    expect(SECTION_LABEL.event).toBe("이벤트존");
  });
});

describe("parseRealMapValue", () => {
  it("정상 · A/B 서브존 파싱", () => {
    expect(parseRealMapValue("1번 진열대 1A")).toEqual({ num: 1, side: "A" });
    expect(parseRealMapValue("5번 진열대 5B")).toEqual({ num: 5, side: "B" });
  });

  it("서브존 없음 · side=null (레거시)", () => {
    expect(parseRealMapValue("1번 진열대 1")).toEqual({ num: 1, side: null });
  });

  it("파싱 실패 · null", () => {
    expect(parseRealMapValue("잘못된 값")).toBeNull();
    expect(parseRealMapValue("진열대")).toBeNull();
  });

  it("null/undefined/empty · null", () => {
    expect(parseRealMapValue(null)).toBeNull();
    expect(parseRealMapValue(undefined)).toBeNull();
    expect(parseRealMapValue("")).toBeNull();
  });

  it("앞뒤 공백 · trim", () => {
    expect(parseRealMapValue("  10번 벽면 10  ")).toEqual({ num: 10, side: null });
  });
});

describe("getZoneCategoryBySide", () => {
  const zoneWithSubs: ZoneDef = {
    num: 8, label: "진열대 8",
    category: "통합 카테고리",
    subA: "칫솔",
    subB: "반창고",
    section: "aisle",
  };

  const zoneNoSubs: ZoneDef = {
    num: 22, label: "진열대 22",
    category: "의료기기",
    section: "aisle",
  };

  it("side=A · subA 반환", () => {
    expect(getZoneCategoryBySide(zoneWithSubs, "A")).toBe("칫솔");
  });

  it("side=B · subB 반환", () => {
    expect(getZoneCategoryBySide(zoneWithSubs, "B")).toBe("반창고");
  });

  it("side=null · zone.category 반환", () => {
    expect(getZoneCategoryBySide(zoneWithSubs, null)).toBe("통합 카테고리");
  });

  it("side undefined · zone.category 반환", () => {
    expect(getZoneCategoryBySide(zoneWithSubs)).toBe("통합 카테고리");
  });

  it("subA/subB 없는 zone · side 무시 · zone.category 반환", () => {
    expect(getZoneCategoryBySide(zoneNoSubs, "A")).toBe("의료기기");
    expect(getZoneCategoryBySide(zoneNoSubs, "B")).toBe("의료기기");
  });
});
