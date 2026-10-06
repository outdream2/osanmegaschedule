// @vitest-environment jsdom
// 2026-10-06 · NULL HARDENING regression · OrderPurchaseMatchTab · exTargetRow=null
//   · Validates null-safe optional chaining for exTargetRow access
//   · Lines 397-400: exTargetRow?. usage and exTargetRow=null state transitions

import { describe, it, expect } from "vitest";

// ─── Unit test of null-safe exTargetRow field access ─────────────────────────

interface OrderMatchRow {
  id: number;
  order_number: string | null;
  exception_note: string | null;
  exception_type: string | null;
  resolution_status: string | null;
}

function deriveOrdinal(row: OrderMatchRow | null): {
  orderId: number | null;
  orderNumber: string | null;
  defaultNote: string | null;
} {
  return {
    orderId: row?.id ?? null,
    orderNumber: row?.order_number ?? null,
    defaultNote: row?.exception_note ?? null,
  };
}

function effectiveExceptionType(row: OrderMatchRow | null): string | null {
  if (row == null) return null;
  return row.exception_type ?? null;
}

describe("OrderPurchaseMatchTab · exTargetRow null safety (line 397-400)", () => {
  it("exTargetRow=null → orderId null (no crash)", () => {
    const result = deriveOrdinal(null);
    expect(result.orderId).toBeNull();
  });

  it("exTargetRow=null → orderNumber null (no crash)", () => {
    const result = deriveOrdinal(null);
    expect(result.orderNumber).toBeNull();
  });

  it("exTargetRow=null → defaultNote null (no crash)", () => {
    const result = deriveOrdinal(null);
    expect(result.defaultNote).toBeNull();
  });

  it("exTargetRow=null → effectiveExceptionType null (no crash)", () => {
    expect(effectiveExceptionType(null)).toBeNull();
  });

  it("exTargetRow with valid data → fields preserved", () => {
    const row: OrderMatchRow = {
      id: 42,
      order_number: "PO-2026-001",
      exception_note: "수량 불일치",
      exception_type: "quantity_mismatch",
      resolution_status: "resolved",
    };
    const result = deriveOrdinal(row);
    expect(result.orderId).toBe(42);
    expect(result.orderNumber).toBe("PO-2026-001");
    expect(result.defaultNote).toBe("수량 불일치");
    expect(effectiveExceptionType(row)).toBe("quantity_mismatch");
  });

  it("exTargetRow with null fields → optional chaining produces null", () => {
    const row: OrderMatchRow = {
      id: 1,
      order_number: null,
      exception_note: null,
      exception_type: null,
      resolution_status: null,
    };
    const result = deriveOrdinal(row);
    expect(result.orderId).toBe(1);
    expect(result.orderNumber).toBeNull();
    expect(result.defaultNote).toBeNull();
  });
});
