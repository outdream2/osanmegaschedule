// @vitest-environment jsdom
// 2026-08-20 · zoneLabels · setZoneMappings/getZoneLabel/getZoneIdByNumber/getZoneSubLabel
import { describe, it, expect, beforeEach } from "vitest";
import {
  setZoneMappings,
  getZoneMappings,
  getZoneLabel,
  getZoneIdByNumber,
  getZoneSubLabel,
} from "./zoneLabels";

const sample = [
  { zoneId: "1A", number: 1, subLabel: "감기약" },
  { zoneId: "1B", number: 2, subLabel: "진통제" },
  { zoneId: "9", number: 9 },
];

beforeEach(() => {
  setZoneMappings([]); // reset
});

describe("setZoneMappings / getZoneMappings", () => {
  it("빈 배열 · 반환도 빈 배열", () => {
    setZoneMappings([]);
    expect(getZoneMappings()).toEqual([]);
  });

  it("매핑 설정 · number 기준 오름차순 정렬", () => {
    setZoneMappings([
      { zoneId: "9", number: 9 },
      { zoneId: "1A", number: 1 },
      { zoneId: "1B", number: 2 },
    ]);
    const map = getZoneMappings();
    expect(map.map(m => m.number)).toEqual([1, 2, 9]);
  });

  it("반환 · 복사 · 원본 mutation 없음", () => {
    setZoneMappings(sample);
    const m1 = getZoneMappings();
    m1.push({ zoneId: "X", number: 99 });
    const m2 = getZoneMappings();
    expect(m2.length).toBe(3);
  });
});

describe("getZoneLabel · zoneId → 번호", () => {
  it("매핑 있음 · 번호 문자열", () => {
    setZoneMappings(sample);
    expect(getZoneLabel("1A")).toBe("1");
    expect(getZoneLabel("1B")).toBe("2");
    expect(getZoneLabel("9")).toBe("9");
  });

  it("매핑 없음 · zoneId 그대로 fallback", () => {
    setZoneMappings([]);
    expect(getZoneLabel("2A")).toBe("2A");
  });

  it("number 입력 · 문자열 변환 후 매칭", () => {
    setZoneMappings(sample);
    expect(getZoneLabel(9)).toBe("9");
  });

  it("null/undefined · 빈 문자열", () => {
    expect(getZoneLabel(null)).toBe("");
    expect(getZoneLabel(undefined)).toBe("");
  });

  it("빈 문자열 · 빈 문자열", () => {
    expect(getZoneLabel("")).toBe("");
  });

  it("앞뒤 공백 · trim", () => {
    setZoneMappings(sample);
    expect(getZoneLabel("  1A  ")).toBe("1");
  });
});

describe("getZoneIdByNumber · 역방향 조회", () => {
  it("number → zoneId", () => {
    setZoneMappings(sample);
    expect(getZoneIdByNumber(1)).toBe("1A");
    expect(getZoneIdByNumber(2)).toBe("1B");
    expect(getZoneIdByNumber(9)).toBe("9");
  });

  it("string number 도 허용", () => {
    setZoneMappings(sample);
    expect(getZoneIdByNumber("1")).toBe("1A");
  });

  it("매핑 없음 · null", () => {
    setZoneMappings([]);
    expect(getZoneIdByNumber(99)).toBeNull();
  });

  it("null/undefined · null", () => {
    expect(getZoneIdByNumber(null)).toBeNull();
    expect(getZoneIdByNumber(undefined)).toBeNull();
  });
});

describe("getZoneSubLabel", () => {
  it("subLabel 있음 · 반환", () => {
    setZoneMappings(sample);
    expect(getZoneSubLabel("1A")).toBe("감기약");
    expect(getZoneSubLabel("1B")).toBe("진통제");
  });

  it("subLabel 없음 · 빈 문자열", () => {
    setZoneMappings(sample);
    expect(getZoneSubLabel("9")).toBe("");
  });

  it("null/undefined · 빈 문자열", () => {
    expect(getZoneSubLabel(null)).toBe("");
    expect(getZoneSubLabel(undefined)).toBe("");
  });
});

describe("setZoneMappings · CustomEvent 발신", () => {
  it("dispatch zone-labels-changed", () => {
    let fired = false;
    const handler = () => { fired = true; };
    window.addEventListener("zone-labels-changed", handler);
    setZoneMappings(sample);
    expect(fired).toBe(true);
    window.removeEventListener("zone-labels-changed", handler);
  });
});
