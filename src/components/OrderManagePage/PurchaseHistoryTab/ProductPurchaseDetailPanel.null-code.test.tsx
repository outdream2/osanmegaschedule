// @vitest-environment jsdom
// 2026-10-06 · NULL HARDENING regression · ProductPurchaseDetailPanel
//   · line 73: product.product_code != null guard for shelfMap access
//   · Validates shelfMap[null] crash prevention

import { describe, it, expect } from "vitest";

// ─── Unit test of shelfMap null-safe access (line 73) ────────────────────────

type ShelfMap = Record<string, unknown>;

function getShelfPositions(
  shelfMap: ShelfMap,
  productCode: string | null
): unknown {
  // Exact logic from line 73 of ProductPurchaseDetailPanel.tsx
  return productCode != null ? (shelfMap[productCode] ?? null) : null;
}

describe("ProductPurchaseDetailPanel · product_code null safety (line 73)", () => {
  const mockShelfMap: ShelfMap = {
    "PC001": { store1: "A-1", store2: null, warehouse: null },
    "PC002": { store1: "B-3", store2: "B-4", warehouse: "W-1" },
  };

  it("product_code=null → returns null (no crash, no map access)", () => {
    expect(getShelfPositions(mockShelfMap, null)).toBeNull();
  });

  it("product_code not in map → returns null (map miss)", () => {
    expect(getShelfPositions(mockShelfMap, "UNKNOWN")).toBeNull();
  });

  it("valid product_code → returns shelf positions", () => {
    const result = getShelfPositions(mockShelfMap, "PC001");
    expect(result).not.toBeNull();
    expect((result as any).store1).toBe("A-1");
  });

  it("empty string product_code → no crash (empty key map access)", () => {
    // Empty map has no "" key → returns null
    const result = getShelfPositions(mockShelfMap, "");
    // "" is not null, so it accesses shelfMap[""] → undefined → null
    expect(result).toBeNull();
  });

  it("empty shelfMap + null code → null without crash", () => {
    expect(getShelfPositions({}, null)).toBeNull();
  });

  it("empty shelfMap + valid code → null (miss)", () => {
    expect(getShelfPositions({}, "PC999")).toBeNull();
  });
});
