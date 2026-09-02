// 2026-08-20 · schedules · Zod 스키마
import { describe, it, expect } from "vitest";
import { UpsertScheduleSchema, BatchScheduleSchema, CopyScheduleSchema } from "./schedules";

describe("UpsertScheduleSchema", () => {
  const valid = { employeeId: 1, date: "2026-08-20", type: "M" };

  it("최소 · 성공 · defaults", () => {
    const r = UpsertScheduleSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.workingHours).toBe("");
      expect(r.data.actualHours).toBe("");
      expect(r.data.memo).toBe("");
    }
  });

  it("type · 빈 문자열 · 성공 (삭제 신호)", () => {
    const r = UpsertScheduleSchema.safeParse({ ...valid, type: "" });
    expect(r.success).toBe(true);
  });

  it("employeeId · string · 실패 (number 만)", () => {
    const r = UpsertScheduleSchema.safeParse({ ...valid, employeeId: "1" });
    expect(r.success).toBe(false);
  });

  it("date · 형식 X · 실패", () => {
    const r = UpsertScheduleSchema.safeParse({ ...valid, date: "20260820" });
    expect(r.success).toBe(false);
  });

  it("type · 20자 초과 · 실패", () => {
    const r = UpsertScheduleSchema.safeParse({ ...valid, type: "x".repeat(21) });
    expect(r.success).toBe(false);
  });

  it("memo · 500자 초과 · 실패", () => {
    const r = UpsertScheduleSchema.safeParse({ ...valid, memo: "x".repeat(501) });
    expect(r.success).toBe(false);
  });
});

describe("BatchScheduleSchema", () => {
  const item = { employeeId: 1, date: "2026-08-20", type: "M" };

  it("items 1개+ · 성공", () => {
    const r = BatchScheduleSchema.safeParse({ items: [item] });
    expect(r.success).toBe(true);
  });

  it("items 여러개 · 성공", () => {
    const r = BatchScheduleSchema.safeParse({ items: [item, { ...item, date: "2026-08-21" }] });
    expect(r.success).toBe(true);
  });

  it("items 빈 배열 · 실패", () => {
    const r = BatchScheduleSchema.safeParse({ items: [] });
    expect(r.success).toBe(false);
  });

  it("items 없음 · 실패", () => {
    const r = BatchScheduleSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("CopyScheduleSchema", () => {
  // 2026-09-03 · #60 fix · targetYear/Month · controller (targetYear·targetMonth) 형식
  const valid = { targetYear: 2026, targetMonth: 9 };

  it("정상 · 성공", () => {
    const r = CopyScheduleSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("연도 범위 · 2020-2100", () => {
    expect(CopyScheduleSchema.safeParse({ ...valid, targetYear: 2019 }).success).toBe(false);
    expect(CopyScheduleSchema.safeParse({ ...valid, targetYear: 2020 }).success).toBe(true);
    expect(CopyScheduleSchema.safeParse({ ...valid, targetYear: 2100 }).success).toBe(true);
    expect(CopyScheduleSchema.safeParse({ ...valid, targetYear: 2101 }).success).toBe(false);
  });

  it("월 범위 · 1-12", () => {
    expect(CopyScheduleSchema.safeParse({ ...valid, targetMonth: 0 }).success).toBe(false);
    expect(CopyScheduleSchema.safeParse({ ...valid, targetMonth: 1 }).success).toBe(true);
    expect(CopyScheduleSchema.safeParse({ ...valid, targetMonth: 12 }).success).toBe(true);
    expect(CopyScheduleSchema.safeParse({ ...valid, targetMonth: 13 }).success).toBe(false);
  });

  it("문자열 자동 변환 (union transform)", () => {
    expect(CopyScheduleSchema.safeParse({ targetYear: "2026", targetMonth: "9" }).success).toBe(true);
  });
});
