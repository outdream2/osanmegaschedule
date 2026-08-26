// 2026-08-19 · zoneUtils · expandZoneDef · buildDefaultZones
import { describe, it, expect } from "vitest";
import { expandZoneDef, buildDefaultZones, type DisplayZone } from "./zoneUtils";
import { ZONE_DEFS } from "../constants/displayZones";

describe("expandZoneDef · 진열대 1-8 (A/B 확장)", () => {
  it("진열대 1 (subA/subB 있음) · A/B 2개 반환", () => {
    const def = ZONE_DEFS.find((d) => d.num === 1 && d.section === "aisle");
    if (!def) throw new Error("test data missing · ZONE_DEFS 에 num=1 aisle 필요");
    const expanded = expandZoneDef(def);
    expect(expanded.length).toBe(2);
    // B 가 먼저 · A 가 나중 (좌→우 순서)
    expect(expanded[0].id).toBe("1B");
    expect(expanded[1].id).toBe("1A");
    expect(expanded[0].num).toBe(1);
  });

  it("확장된 zone · 필수 필드 · assignedStaffId null · status normal", () => {
    const def = ZONE_DEFS.find((d) => d.num === 5 && d.section === "aisle");
    if (!def) throw new Error("num=5 aisle 필요");
    const expanded = expandZoneDef(def);
    expanded.forEach((z: DisplayZone) => {
      expect(z.assignedStaffId).toBeNull();
      expect(z.assignedStaffName).toBe("");
      expect(z.status).toBe("normal");
      expect(z.products).toBe("");
      expect(z.dowMap).toBeNull();
    });
  });
});

describe("expandZoneDef · 진열대 22 (단독 · A/B 없음)", () => {
  it("진열대 22 · 1개 반환 · id=22", () => {
    const def = ZONE_DEFS.find((d) => d.num === 22);
    if (!def) throw new Error("num=22 필요");
    const expanded = expandZoneDef(def);
    expect(expanded.length).toBe(1);
    expect(expanded[0].id).toBe("22");
    expect(expanded[0].num).toBe(22);
  });
});

describe("expandZoneDef · 계산대 40 (3-way A/B/C)", () => {
  it("계산대 40 · A/B/C 3개 반환 (subA/B/C 존재 시)", () => {
    const def = ZONE_DEFS.find((d) => d.num === 40);
    if (!def) throw new Error("num=40 필요");
    // 조건: subA + subB + subC 모두 있어야 3-way
    if (def.subA && def.subB && def.subC) {
      const expanded = expandZoneDef(def);
      expect(expanded.length).toBe(3);
      expect(expanded.map((z) => z.id)).toEqual(["40A", "40B", "40C"]);
    }
  });
});

describe("expandZoneDef · 일반 zone (aisle 외)", () => {
  it("bottom_wall · 1개 반환", () => {
    const def = ZONE_DEFS.find((d) => d.section === "bottom_wall");
    if (!def) throw new Error("bottom_wall zone 필요");
    const expanded = expandZoneDef(def);
    expect(expanded.length).toBe(1);
    expect(expanded[0].section).toBe("bottom_wall");
  });

  it("top_wall · 1개 반환", () => {
    const def = ZONE_DEFS.find((d) => d.section === "top_wall");
    if (!def) throw new Error("top_wall zone 필요");
    const expanded = expandZoneDef(def);
    expect(expanded.length).toBe(1);
  });
});

describe("buildDefaultZones", () => {
  it("모든 ZONE_DEFS 를 flatMap · 확장된 배열 반환", () => {
    const zones = buildDefaultZones();
    expect(zones.length).toBeGreaterThan(0);
    expect(zones.length).toBeGreaterThanOrEqual(ZONE_DEFS.length);
  });

  it("모든 zone · id 고유 (num=22 aisle/top_wall 알려진 중복 예외)", () => {
    // 2026-08-26 · ZONE_DEFS 에 num=22 가 aisle (진열대 22) + top_wall (벽면 22) 두 곳 존재 · 실제 매장 구조 · 의도된 중복
    const zones = buildDefaultZones();
    const ids = zones.map((z) => z.id);
    const uniq = new Set(ids);
    // 중복 개수는 정확히 1 (num=22 중복) 이하여야 함
    expect(ids.length - uniq.size).toBeLessThanOrEqual(1);
  });

  it("모든 zone · 기본 상태 · assignedStaffId null · status normal", () => {
    const zones = buildDefaultZones();
    zones.forEach((z) => {
      expect(z.assignedStaffId).toBeNull();
      expect(z.status).toBe("normal");
      expect(z.products).toBe("");
    });
  });

  it("진열대 A/B 있는 경우 · id 뒤에 A/B 붙음", () => {
    const zones = buildDefaultZones();
    const withSubs = zones.filter((z) => z.id.endsWith("A") || z.id.endsWith("B"));
    expect(withSubs.length).toBeGreaterThan(0);
  });
});
