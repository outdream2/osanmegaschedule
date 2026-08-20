// 2026-08-20 · productArrivals · Zod 스키마
import { describe, it, expect } from "vitest";
import { ArrivalItemSchema, CreateProductArrivalSchema } from "./productArrivals";

describe("ArrivalItemSchema", () => {
  const valid = {
    product_code: "8801234",
    product_name: "타이레놀",
    qty: 10,
  };

  it("최소 · 성공 · status default=pending", () => {
    const r = ArrivalItemSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe("pending");
  });

  it("status · match/mismatch/pending 만", () => {
    expect(ArrivalItemSchema.safeParse({ ...valid, status: "match" }).success).toBe(true);
    expect(ArrivalItemSchema.safeParse({ ...valid, status: "mismatch" }).success).toBe(true);
    expect(ArrivalItemSchema.safeParse({ ...valid, status: "invalid" }).success).toBe(false);
  });

  it("qty · 음수 · 실패 (nonnegative)", () => {
    const r = ArrivalItemSchema.safeParse({ ...valid, qty: -1 });
    expect(r.success).toBe(false);
  });

  it("qty · 0 · 성공", () => {
    const r = ArrivalItemSchema.safeParse({ ...valid, qty: 0 });
    expect(r.success).toBe(true);
  });

  it("supplier · null 허용", () => {
    const r = ArrivalItemSchema.safeParse({ ...valid, supplier: null });
    expect(r.success).toBe(true);
  });

  it("expiring · boolean 옵셔널", () => {
    expect(ArrivalItemSchema.safeParse({ ...valid, expiring: true }).success).toBe(true);
    expect(ArrivalItemSchema.safeParse({ ...valid, expiring: false }).success).toBe(true);
  });

  it("product_code · 50자 초과 · 실패", () => {
    const r = ArrivalItemSchema.safeParse({ ...valid, product_code: "x".repeat(51) });
    expect(r.success).toBe(false);
  });

  it("product_name · 200자 초과 · 실패", () => {
    const r = ArrivalItemSchema.safeParse({ ...valid, product_name: "x".repeat(201) });
    expect(r.success).toBe(false);
  });
});

describe("CreateProductArrivalSchema", () => {
  const item = { product_code: "8801234", product_name: "타이레놀", qty: 10 };

  it("items 1개 · 성공 · defaults", () => {
    const r = CreateProductArrivalSchema.safeParse({ items: [item] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.checked_by).toBe("익명");
  });

  it("items 빈 · 실패", () => {
    const r = CreateProductArrivalSchema.safeParse({ items: [] });
    expect(r.success).toBe(false);
  });

  it("checked_by · 커스텀", () => {
    const r = CreateProductArrivalSchema.safeParse({ checked_by: "홍길동", items: [item] });
    expect(r.success).toBe(true);
  });

  it("checked_by_id · number/string/null 허용", () => {
    expect(CreateProductArrivalSchema.safeParse({ checked_by_id: 1, items: [item] }).success).toBe(true);
    expect(CreateProductArrivalSchema.safeParse({ checked_by_id: "u1", items: [item] }).success).toBe(true);
    expect(CreateProductArrivalSchema.safeParse({ checked_by_id: null, items: [item] }).success).toBe(true);
  });

  it("note · 1000자 초과 · 실패", () => {
    const r = CreateProductArrivalSchema.safeParse({ note: "x".repeat(1001), items: [item] });
    expect(r.success).toBe(false);
  });
});
