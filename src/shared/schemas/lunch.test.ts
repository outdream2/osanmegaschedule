// 2026-08-20 · lunch · Zod 스키마
import { describe, it, expect } from "vitest";
import { UpsertLunchRequestSchema } from "./lunch";

describe("UpsertLunchRequestSchema", () => {
  const valid = {
    employee_id: 1,
    employee_name: "홍길동",
    date: "2026-08-20",
    eating: true,
  };

  it("정상 · parse 성공", () => {
    const r = UpsertLunchRequestSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("employee_id · string 도 허용", () => {
    const r = UpsertLunchRequestSchema.safeParse({ ...valid, employee_id: "1" });
    expect(r.success).toBe(true);
  });

  it("eating=false · 성공", () => {
    const r = UpsertLunchRequestSchema.safeParse({ ...valid, eating: false });
    expect(r.success).toBe(true);
  });

  it("eating 필수", () => {
    const { eating, ...rest } = valid;
    const r = UpsertLunchRequestSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("date · 형식 X · 실패", () => {
    const r = UpsertLunchRequestSchema.safeParse({ ...valid, date: "20260820" });
    expect(r.success).toBe(false);
  });

  it("employee_name · 빈 · 실패", () => {
    const r = UpsertLunchRequestSchema.safeParse({ ...valid, employee_name: "" });
    expect(r.success).toBe(false);
  });

  it("employee_name · 50자 초과 · 실패", () => {
    const r = UpsertLunchRequestSchema.safeParse({ ...valid, employee_name: "가".repeat(51) });
    expect(r.success).toBe(false);
  });

  it("memo · 옵셔널 · 없어도 성공", () => {
    const r = UpsertLunchRequestSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("memo · null 허용", () => {
    const r = UpsertLunchRequestSchema.safeParse({ ...valid, memo: null });
    expect(r.success).toBe(true);
  });

  it("memo · 200자 초과 · 실패", () => {
    const r = UpsertLunchRequestSchema.safeParse({ ...valid, memo: "x".repeat(201) });
    expect(r.success).toBe(false);
  });
});
