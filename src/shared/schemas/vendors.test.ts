// 2026-08-20 · vendors · Zod 스키마
import { describe, it, expect } from "vitest";
import { CreateVendorSchema, UpdateVendorSchema } from "./vendors";

describe("CreateVendorSchema", () => {
  it("최소 필드 · company_name 만 · 성공", () => {
    const r = CreateVendorSchema.safeParse({ company_name: "한독약품" });
    expect(r.success).toBe(true);
  });

  it("모든 필드 · 성공", () => {
    const r = CreateVendorSchema.safeParse({
      company_name: "한독약품",
      contact_name: "김철수",
      phone: "010-1234-5678",
      email: "test@example.com",
      category: "위탁",
      note: "메모",
      business_number: "123-45-67890",
    });
    expect(r.success).toBe(true);
  });

  it("company_name 없음 · 실패", () => {
    const r = CreateVendorSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("company_name · 빈 · 실패", () => {
    const r = CreateVendorSchema.safeParse({ company_name: "" });
    expect(r.success).toBe(false);
  });

  it("company_name · 100자 초과 · 실패", () => {
    const r = CreateVendorSchema.safeParse({ company_name: "x".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("email · 형식 X · 실패", () => {
    const r = CreateVendorSchema.safeParse({ company_name: "x", email: "not-email" });
    expect(r.success).toBe(false);
  });

  it("email · 빈 문자열 · 성공 (or literal '')", () => {
    const r = CreateVendorSchema.safeParse({ company_name: "x", email: "" });
    expect(r.success).toBe(true);
  });

  it("email · null · 성공", () => {
    const r = CreateVendorSchema.safeParse({ company_name: "x", email: null });
    expect(r.success).toBe(true);
  });

  it("contact_name · 50자 초과 · 실패", () => {
    const r = CreateVendorSchema.safeParse({ company_name: "x", contact_name: "가".repeat(51) });
    expect(r.success).toBe(false);
  });

  it("phone · null 허용", () => {
    const r = CreateVendorSchema.safeParse({ company_name: "x", phone: null });
    expect(r.success).toBe(true);
  });

  it("category · 옵셔널", () => {
    const r = CreateVendorSchema.safeParse({ company_name: "x", category: "선결제" });
    expect(r.success).toBe(true);
  });

  it("note · 500자 초과 · 실패", () => {
    const r = CreateVendorSchema.safeParse({ company_name: "x", note: "x".repeat(501) });
    expect(r.success).toBe(false);
  });

  it("business_number · 20자 초과 · 실패", () => {
    const r = CreateVendorSchema.safeParse({ company_name: "x", business_number: "1".repeat(21) });
    expect(r.success).toBe(false);
  });
});

describe("UpdateVendorSchema (partial)", () => {
  it("빈 객체 · 성공 (모든 필드 옵셔널)", () => {
    const r = UpdateVendorSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("부분 업데이트 · 성공", () => {
    const r = UpdateVendorSchema.safeParse({ phone: "010-9999-8888" });
    expect(r.success).toBe(true);
  });

  it("company_name 도 옵셔널 (partial)", () => {
    const r = UpdateVendorSchema.safeParse({ note: "수정" });
    expect(r.success).toBe(true);
  });

  it("email · 잘못된 형식 · 실패 (partial 이라도 검증)", () => {
    const r = UpdateVendorSchema.safeParse({ email: "not-email" });
    expect(r.success).toBe(false);
  });
});
