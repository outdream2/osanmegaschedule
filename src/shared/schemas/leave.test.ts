// 2026-08-20 · leave · Zod 스키마 검증
import { describe, it, expect } from "vitest";
import { CreateLeaveRequestSchema, ReviewLeaveRequestSchema } from "./leave";

describe("CreateLeaveRequestSchema", () => {
  const valid = {
    employee_id: 1,
    employee_name: "홍길동",
    leave_type: "월차",
    start_date: "2026-08-20",
    end_date: "2026-08-20",
    reason: "가족 여행",
  };

  it("정상 · parse 성공", () => {
    const r = CreateLeaveRequestSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("employee_id · string 도 허용", () => {
    const r = CreateLeaveRequestSchema.safeParse({ ...valid, employee_id: "1" });
    expect(r.success).toBe(true);
  });

  it("employee_name · 빈 문자열 · 실패", () => {
    const r = CreateLeaveRequestSchema.safeParse({ ...valid, employee_name: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain("필수");
    }
  });

  it("employee_name · 50자 초과 · 실패", () => {
    const r = CreateLeaveRequestSchema.safeParse({ ...valid, employee_name: "가".repeat(51) });
    expect(r.success).toBe(false);
  });

  it("leave_type · 빈 문자열 · 실패", () => {
    const r = CreateLeaveRequestSchema.safeParse({ ...valid, leave_type: "" });
    expect(r.success).toBe(false);
  });

  it("start_date · 형식 X · 실패", () => {
    const r = CreateLeaveRequestSchema.safeParse({ ...valid, start_date: "2026/08/20" });
    expect(r.success).toBe(false);
  });

  it("end_date · 형식 X · 실패", () => {
    const r = CreateLeaveRequestSchema.safeParse({ ...valid, end_date: "invalid" });
    expect(r.success).toBe(false);
  });

  it("reason · 옵셔널 · 없어도 성공", () => {
    const { reason, ...rest } = valid;
    const r = CreateLeaveRequestSchema.safeParse(rest);
    expect(r.success).toBe(true);
  });

  it("reason · 500자 초과 · 실패", () => {
    const r = CreateLeaveRequestSchema.safeParse({ ...valid, reason: "x".repeat(501) });
    expect(r.success).toBe(false);
  });
});

describe("ReviewLeaveRequestSchema", () => {
  it("status=approved · 성공", () => {
    const r = ReviewLeaveRequestSchema.safeParse({ status: "approved" });
    expect(r.success).toBe(true);
  });

  it("status=rejected · 성공", () => {
    const r = ReviewLeaveRequestSchema.safeParse({ status: "rejected" });
    expect(r.success).toBe(true);
  });

  it("status=other · 실패", () => {
    const r = ReviewLeaveRequestSchema.safeParse({ status: "pending" });
    expect(r.success).toBe(false);
  });

  it("status 없음 · 실패", () => {
    const r = ReviewLeaveRequestSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("reviewer_note · 옵셔널", () => {
    const r = ReviewLeaveRequestSchema.safeParse({ status: "approved", reviewer_note: "OK" });
    expect(r.success).toBe(true);
  });

  it("reviewer_note · 500자 초과 · 실패", () => {
    const r = ReviewLeaveRequestSchema.safeParse({ status: "approved", reviewer_note: "x".repeat(501) });
    expect(r.success).toBe(false);
  });
});
