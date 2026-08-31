// @vitest-environment jsdom
// 2026-08-19 · useZoneDefs · findZone · groupZonesBySection (순수 유틸)
// 2026-08-31 · #63 · zone-defs-updated 이벤트 · source 스킵 제거 검증
import { describe, it, expect, vi } from "vitest";
import { findZone, groupZonesBySection } from "./useZoneDefs";
import type { ZoneDef } from "../constants/displayZones";

const zones: ZoneDef[] = [
  { num: 1, label: "진열대 1", category: "감기약", section: "aisle" },
  { num: 22, label: "진열대 22", category: "의료기기", section: "aisle" },
  { num: 10, label: "벽면 10", category: "화장품", section: "top_wall" },
  { num: 23, label: "벽면 23", category: "건강식품", section: "bottom_wall" },
  { num: 40, label: "계산대", category: "결제", section: "wing" },
];

describe("findZone", () => {
  it("존재하는 num · zone 반환", () => {
    const z = findZone(zones, 22);
    expect(z).not.toBeUndefined();
    expect(z!.label).toBe("진열대 22");
  });

  it("존재하지 않는 num · undefined", () => {
    expect(findZone(zones, 999)).toBeUndefined();
  });

  it("빈 배열 · undefined", () => {
    expect(findZone([], 1)).toBeUndefined();
  });
});

describe("groupZonesBySection", () => {
  it("6 section 모두 초기화 · 빈 배열 있음", () => {
    const g = groupZonesBySection([]);
    expect(Object.keys(g).sort()).toEqual(
      ["aisle", "bottom_wall", "event", "left_wall", "top_wall", "wing"].sort()
    );
    expect(g.aisle).toEqual([]);
    expect(g.top_wall).toEqual([]);
  });

  it("section 별 그룹핑", () => {
    const g = groupZonesBySection(zones);
    expect(g.aisle.length).toBe(2);
    expect(g.aisle.map(z => z.num)).toEqual([1, 22]);
    expect(g.top_wall.length).toBe(1);
    expect(g.top_wall[0].num).toBe(10);
    expect(g.bottom_wall.length).toBe(1);
    expect(g.wing.length).toBe(1);
    expect(g.left_wall).toEqual([]);
    expect(g.event).toEqual([]);
  });
});

// 2026-08-31 · #63 · zone-defs-updated 이벤트 dispatch/listen 검증
//   · source 스킵 제거 · 모든 리스너가 event 수신 시 refetch 트리거
describe("zone-defs-updated 이벤트", () => {
  it("dispatchEvent · 모든 리스너 호출 (source 무관)", () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    window.addEventListener("zone-defs-updated", listener1);
    window.addEventListener("zone-defs-updated", listener2);
    // 다양한 source · 자기 자신 포함
    window.dispatchEvent(new CustomEvent("zone-defs-updated", { detail: { source: "instance-A" } }));
    window.dispatchEvent(new CustomEvent("zone-defs-updated", { detail: { source: "instance-B" } }));
    window.dispatchEvent(new CustomEvent("zone-defs-updated", { detail: { id: 1, source: "instance-A" } }));
    expect(listener1).toHaveBeenCalledTimes(3);
    expect(listener2).toHaveBeenCalledTimes(3);
    window.removeEventListener("zone-defs-updated", listener1);
    window.removeEventListener("zone-defs-updated", listener2);
  });
});
