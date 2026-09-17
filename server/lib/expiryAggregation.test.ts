// server/lib/expiryAggregation.test.ts
// 2026-09-18 · 유통기한 3소스 UNION + MIN 집계 · 회귀 테스트
import { describe, it, expect } from "vitest";
import { mergeMinExpiry, aggregateExpirySources } from "./expiryAggregation";

describe("mergeMinExpiry", () => {
  it("빈 rows · map 변화 없음", () => {
    const map = new Map<string, string>();
    mergeMinExpiry([], map);
    mergeMinExpiry(null, map);
    mergeMinExpiry(undefined, map);
    expect(map.size).toBe(0);
  });

  it("단일 소스 · 각 product 최소 date 저장", () => {
    const map = new Map<string, string>();
    mergeMinExpiry([
      { product_code: "P1", expiry_date: "2026-12-01" },
      { product_code: "P1", expiry_date: "2026-06-01" }, // 더 이른 것
      { product_code: "P2", expiry_date: "2026-09-15" },
    ], map);
    expect(map.get("P1")).toBe("2026-06-01");
    expect(map.get("P2")).toBe("2026-09-15");
  });

  it("null/빈 필드 · 스킵 · 다른 항목은 저장", () => {
    const map = new Map<string, string>();
    mergeMinExpiry([
      { product_code: null, expiry_date: "2026-01-01" },       // code 없음 · 스킵
      { product_code: "P1", expiry_date: null },                // date 없음 · 스킵
      { product_code: "P1", expiry_date: "" },                  // date 빈 문자열 · 스킵
      { product_code: "P2", expiry_date: "2026-03-15" },        // 정상
    ], map);
    expect(map.has("P1")).toBe(false);
    expect(map.get("P2")).toBe("2026-03-15");
  });

  it("타임스탬프 · 앞 10자 자동 절단 (YYYY-MM-DD)", () => {
    const map = new Map<string, string>();
    mergeMinExpiry([
      { product_code: "P1", expiry_date: "2026-09-11T08:30:00Z" },
    ], map);
    expect(map.get("P1")).toBe("2026-09-11");
  });

  it("잘못된 포맷 · 스킵 (regex 검증)", () => {
    const map = new Map<string, string>();
    mergeMinExpiry([
      { product_code: "P1", expiry_date: "2026/09/11" },   // slash 구분
      { product_code: "P2", expiry_date: "invalid" },       // 완전 무효
      { product_code: "P3", expiry_date: "2026-09-11" },    // 정상
    ], map);
    expect(map.has("P1")).toBe(false);
    expect(map.has("P2")).toBe(false);
    expect(map.get("P3")).toBe("2026-09-11");
  });

  it("기존 map 유지 · 병합 · 더 이른 것만 갱신", () => {
    const map = new Map([["P1", "2026-08-01"], ["P2", "2026-09-01"]]);
    mergeMinExpiry([
      { product_code: "P1", expiry_date: "2026-05-01" }, // 더 이름 · 갱신
      { product_code: "P2", expiry_date: "2026-11-01" }, // 더 나중 · 유지
      { product_code: "P3", expiry_date: "2026-07-01" }, // 신규
    ], map);
    expect(map.get("P1")).toBe("2026-05-01");
    expect(map.get("P2")).toBe("2026-09-01");
    expect(map.get("P3")).toBe("2026-07-01");
  });
});

describe("aggregateExpirySources · 3소스 통합", () => {
  it("3소스 UNION · 각 product_code · 전체 소스 최소값", () => {
    // 시나리오 · 유통기한 3소스 · SSOT + legacy 2개
    const inventoryChecks = [
      { product_code: "P1", expiry_date: "2026-12-01" }, // P1 · SSOT
      { product_code: "P2", expiry_date: "2026-11-01" }, // P2 · SSOT
    ];
    const productsLegacy = [
      { product_code: "P1", expiry_date: "2026-08-01" }, // P1 · legacy · 더 이름
      { product_code: "P3", expiry_date: "2026-10-01" }, // P3 · legacy only
    ];
    const purchaseDetailsLegacy = [
      { product_code: "P2", expiry_date: "2026-09-01" }, // P2 · purchase legacy · 더 이름
      { product_code: "P4", expiry_date: "2026-07-15" }, // P4 · purchase only
    ];
    const map = aggregateExpirySources([inventoryChecks, productsLegacy, purchaseDetailsLegacy]);
    expect(map.get("P1")).toBe("2026-08-01");  // legacy 승
    expect(map.get("P2")).toBe("2026-09-01");  // purchase 승
    expect(map.get("P3")).toBe("2026-10-01");  // legacy only
    expect(map.get("P4")).toBe("2026-07-15");  // purchase only
    expect(map.size).toBe(4);
  });

  it("빈 소스 · 다른 소스 정상 처리", () => {
    const map = aggregateExpirySources([null, [], undefined, [
      { product_code: "P1", expiry_date: "2026-09-11" },
    ]]);
    expect(map.get("P1")).toBe("2026-09-11");
    expect(map.size).toBe(1);
  });
});
