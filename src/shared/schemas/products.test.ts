// 2026-08-23 · #177 Phase C/D · products Zod 스키마 · CreateProductSchema · UpdateProductSchema
import { describe, it, expect } from "vitest";
import { CreateProductSchema, UpdateProductSchema } from "./products";

describe("CreateProductSchema · 필수 필드", () => {
  it("product_code + product_name 만 있어도 통과", () => {
    const r = CreateProductSchema.safeParse({ product_code: "PC001", product_name: "타이레놀" });
    expect(r.success).toBe(true);
  });

  it("product_code 누락 · 실패", () => {
    const r = CreateProductSchema.safeParse({ product_name: "타이레놀" });
    expect(r.success).toBe(false);
  });

  it("product_name 누락 · 실패", () => {
    const r = CreateProductSchema.safeParse({ product_code: "PC001" });
    expect(r.success).toBe(false);
  });

  it("product_code 빈 문자열 · 실패 (min 1)", () => {
    const r = CreateProductSchema.safeParse({ product_code: "", product_name: "타이레놀" });
    expect(r.success).toBe(false);
  });

  it("product_name 빈 문자열 · 실패 (min 1)", () => {
    const r = CreateProductSchema.safeParse({ product_code: "PC001", product_name: "" });
    expect(r.success).toBe(false);
  });
});

describe("CreateProductSchema · optional 필드", () => {
  it("모든 필드 채워짐 · 통과", () => {
    const r = CreateProductSchema.safeParse({
      product_code: "PC001",
      product_name: "타이레놀",
      supplier: "코스트팜",
      category: "감기약",
      unit: "정",
      spec: "10정",
      barcode: "8801234567890",
      real_map: "12번",
      optimal_stock: 30,
      sale_price: 5000,
      purchase_price: 3500,
      brand: "타이레놀",
      manufacturer: "존슨앤존슨",
      note: "감기약",
      memo: "베스트셀러",
    });
    expect(r.success).toBe(true);
  });

  it("nullable · null 값 허용", () => {
    const r = CreateProductSchema.safeParse({
      product_code: "PC001",
      product_name: "타이레놀",
      supplier: null,
      optimal_stock: null,
    });
    expect(r.success).toBe(true);
  });

  it("optimal_stock 음수 · 실패", () => {
    const r = CreateProductSchema.safeParse({ product_code: "PC001", product_name: "X", optimal_stock: -1 });
    expect(r.success).toBe(false);
  });

  it("optimal_stock 소수 · 실패 (int 검증)", () => {
    const r = CreateProductSchema.safeParse({ product_code: "PC001", product_name: "X", optimal_stock: 1.5 });
    expect(r.success).toBe(false);
  });

  it("sale_price 음수 · 실패", () => {
    const r = CreateProductSchema.safeParse({ product_code: "PC001", product_name: "X", sale_price: -100 });
    expect(r.success).toBe(false);
  });

  it("product_code 51자 · 실패 (max 50)", () => {
    const r = CreateProductSchema.safeParse({ product_code: "A".repeat(51), product_name: "X" });
    expect(r.success).toBe(false);
  });

  it("product_name 201자 · 실패 (max 200)", () => {
    const r = CreateProductSchema.safeParse({ product_code: "PC001", product_name: "가".repeat(201) });
    expect(r.success).toBe(false);
  });
});

describe("UpdateProductSchema · partial · product_code 제외", () => {
  it("모든 필드 optional · 빈 객체도 통과", () => {
    const r = UpdateProductSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("product_name 만 변경 · 통과", () => {
    const r = UpdateProductSchema.safeParse({ product_name: "타이레놀 500mg" });
    expect(r.success).toBe(true);
  });

  it("product_code 필드 미지원 · 무시 (omit)", () => {
    const r = UpdateProductSchema.safeParse({ product_code: "NEW", product_name: "X" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as Record<string, unknown>).product_code).toBeUndefined();
    }
  });

  it("supplier null 로 변경 · 통과", () => {
    const r = UpdateProductSchema.safeParse({ supplier: null });
    expect(r.success).toBe(true);
  });

  it("optimal_stock 유효성 · 음수 실패", () => {
    const r = UpdateProductSchema.safeParse({ optimal_stock: -1 });
    expect(r.success).toBe(false);
  });
});
