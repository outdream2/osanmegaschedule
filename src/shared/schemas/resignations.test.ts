// 2026-08-20 · resignations · Zod 스키마
import { describe, it, expect } from "vitest";
import { CreateResignationSchema, ReviewResignationSchema } from "./resignations";

describe("CreateResignationSchema", () => {
  const valid = {
    employee_id: 1,
    employee_name: "홍길동",
    last_work_date: "2026-08-31",
    reason: "개인 사유",
  };

  it("최소 · 성공", () => {
    const r = CreateResignationSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("employee_name 없음 · 실패", () => {
    const { employee_name, ...rest } = valid;
    const r = CreateResignationSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("last_work_date · 형식 X · 실패", () => {
    const r = CreateResignationSchema.safeParse({ ...valid, last_work_date: "20260831" });
    expect(r.success).toBe(false);
  });

  it("reason 없음 · 실패", () => {
    const { reason, ...rest } = valid;
    const r = CreateResignationSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("reason · 빈 · 실패", () => {
    const r = CreateResignationSchema.safeParse({ ...valid, reason: "" });
    expect(r.success).toBe(false);
  });

  it("reason · 500자 초과 · 실패", () => {
    const r = CreateResignationSchema.safeParse({ ...valid, reason: "x".repeat(501) });
    expect(r.success).toBe(false);
  });

  it("reason_detail · 2000자 초과 · 실패", () => {
    const r = CreateResignationSchema.safeParse({ ...valid, reason_detail: "x".repeat(2001) });
    expect(r.success).toBe(false);
  });

  it("handover_notes · 5000자 초과 · 실패", () => {
    const r = CreateResignationSchema.safeParse({ ...valid, handover_notes: "x".repeat(5001) });
    expect(r.success).toBe(false);
  });

  it("position · null 허용", () => {
    const r = CreateResignationSchema.safeParse({ ...valid, position: null });
    expect(r.success).toBe(true);
  });

  it("hire_date · 형식 · 옵셔널·null 허용", () => {
    expect(CreateResignationSchema.safeParse({ ...valid, hire_date: null }).success).toBe(true);
    expect(CreateResignationSchema.safeParse({ ...valid, hire_date: "2020-01-01" }).success).toBe(true);
    expect(CreateResignationSchema.safeParse({ ...valid, hire_date: "20200101" }).success).toBe(false);
  });

  it("signature_data_url · null/문자열 · 옵셔널", () => {
    expect(CreateResignationSchema.safeParse({ ...valid, signature_data_url: null }).success).toBe(true);
    expect(CreateResignationSchema.safeParse({ ...valid, signature_data_url: "data:image/png;base64,xxx" }).success).toBe(true);
  });
});

describe("ReviewResignationSchema", () => {
  it("status · approved/rejected/withdrawn", () => {
    expect(ReviewResignationSchema.safeParse({ status: "approved" }).success).toBe(true);
    expect(ReviewResignationSchema.safeParse({ status: "rejected" }).success).toBe(true);
    expect(ReviewResignationSchema.safeParse({ status: "withdrawn" }).success).toBe(true);
    expect(ReviewResignationSchema.safeParse({ status: "pending" }).success).toBe(false);
  });

  it("status 없음 · 실패", () => {
    expect(ReviewResignationSchema.safeParse({}).success).toBe(false);
  });

  it("reject_reason · 500자 초과 · 실패", () => {
    const r = ReviewResignationSchema.safeParse({ status: "rejected", reject_reason: "x".repeat(501) });
    expect(r.success).toBe(false);
  });

  it("approved_by / approved_by_id · 옵셔널", () => {
    const r = ReviewResignationSchema.safeParse({
      status: "approved", approved_by: "관리자", approved_by_id: 1,
    });
    expect(r.success).toBe(true);
  });
});
