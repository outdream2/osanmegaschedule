// 2026-08-20 · reservation · Zod 스키마
import { describe, it, expect } from "vitest";
import { CreateReservationSchema } from "./reservation";

describe("CreateReservationSchema", () => {
  const valid = {
    date: "2026-08-20",
    time: "14:00",
    company: "한독약품",
    contactName: "김철수",
    phone: "010-1234-5678",
    purpose: "신제품 소개",
  };

  it("정상 · parse 성공", () => {
    const r = CreateReservationSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("date · 형식 X · 실패", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, date: "20260820" });
    expect(r.success).toBe(false);
  });

  it("time · 빈 · 실패", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, time: "" });
    expect(r.success).toBe(false);
  });

  it("company · 빈 · 실패", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, company: "" });
    expect(r.success).toBe(false);
  });

  it("company · 100자 초과 · 실패", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, company: "x".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("contactName · 빈 · 실패", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, contactName: "" });
    expect(r.success).toBe(false);
  });

  it("contactName · 50자 초과 · 실패", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, contactName: "x".repeat(51) });
    expect(r.success).toBe(false);
  });

  it("phone · 빈 · 실패", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, phone: "" });
    expect(r.success).toBe(false);
  });

  it("phone · 30자 초과 · 실패", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, phone: "x".repeat(31) });
    expect(r.success).toBe(false);
  });

  it("purpose · 빈 · 실패", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, purpose: "" });
    expect(r.success).toBe(false);
  });

  it("purpose · 200자 초과 · 실패", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, purpose: "x".repeat(201) });
    expect(r.success).toBe(false);
  });

  it("note · 옵셔널 · 없어도 성공", () => {
    const r = CreateReservationSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("note · null 허용", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, note: null });
    expect(r.success).toBe(true);
  });

  it("note · 500자 초과 · 실패", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, note: "x".repeat(501) });
    expect(r.success).toBe(false);
  });

  it("vendorId · 옵셔널 · number 만", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, vendorId: 42 });
    expect(r.success).toBe(true);
  });

  it("vendorId · string · 실패", () => {
    const r = CreateReservationSchema.safeParse({ ...valid, vendorId: "42" });
    expect(r.success).toBe(false);
  });
});
