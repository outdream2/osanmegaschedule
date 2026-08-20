// 2026-08-20 · employees · Zod 스키마
import { describe, it, expect } from "vitest";
import { CreateEmployeeSchema, UpdateEmployeeSchema } from "./employees";

describe("CreateEmployeeSchema · 필수 필드", () => {
  const valid = {
    name: "홍길동",
    position: "약사",
    employmentType: "정규직",
    hireDate: "2020-01-01",
    workplace: "매장1",
  };

  it("최소 필수 · 성공", () => {
    const r = CreateEmployeeSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("name 없음 · 실패", () => {
    const { name, ...rest } = valid;
    const r = CreateEmployeeSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("position 없음 · 실패", () => {
    const { position, ...rest } = valid;
    const r = CreateEmployeeSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("employmentType 없음 · 실패", () => {
    const { employmentType, ...rest } = valid;
    const r = CreateEmployeeSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("hireDate · 잘못된 형식 · 실패", () => {
    const r = CreateEmployeeSchema.safeParse({ ...valid, hireDate: "2020/01/01" });
    expect(r.success).toBe(false);
  });

  it("workplace 없음 · 실패", () => {
    const { workplace, ...rest } = valid;
    const r = CreateEmployeeSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });
});

describe("CreateEmployeeSchema · 길이 제한", () => {
  const base = {
    name: "홍길동",
    position: "약사",
    employmentType: "정규직",
    hireDate: "2020-01-01",
    workplace: "매장1",
  };

  it("name · 50자 초과 · 실패", () => {
    const r = CreateEmployeeSchema.safeParse({ ...base, name: "가".repeat(51) });
    expect(r.success).toBe(false);
  });

  it("position · 50자 초과 · 실패", () => {
    const r = CreateEmployeeSchema.safeParse({ ...base, position: "x".repeat(51) });
    expect(r.success).toBe(false);
  });

  it("description · 500자 초과 · 실패", () => {
    const r = CreateEmployeeSchema.safeParse({ ...base, description: "x".repeat(501) });
    expect(r.success).toBe(false);
  });

  it("address · 300자 초과 · 실패", () => {
    const r = CreateEmployeeSchema.safeParse({ ...base, address: "x".repeat(301) });
    expect(r.success).toBe(false);
  });

  it("phone · 30자 초과 · 실패", () => {
    const r = CreateEmployeeSchema.safeParse({ ...base, phone: "x".repeat(31) });
    expect(r.success).toBe(false);
  });
});

describe("CreateEmployeeSchema · 옵셔널 필드", () => {
  const base = {
    name: "홍길동",
    position: "약사",
    employmentType: "정규직",
    hireDate: "2020-01-01",
    workplace: "매장1",
  };

  it("rank · null 허용", () => {
    const r = CreateEmployeeSchema.safeParse({ ...base, rank: null });
    expect(r.success).toBe(true);
  });

  it("annual_leave_days · 0-365 범위", () => {
    expect(CreateEmployeeSchema.safeParse({ ...base, annual_leave_days: 15 }).success).toBe(true);
    expect(CreateEmployeeSchema.safeParse({ ...base, annual_leave_days: 0 }).success).toBe(true);
    expect(CreateEmployeeSchema.safeParse({ ...base, annual_leave_days: 365 }).success).toBe(true);
    expect(CreateEmployeeSchema.safeParse({ ...base, annual_leave_days: 366 }).success).toBe(false);
    expect(CreateEmployeeSchema.safeParse({ ...base, annual_leave_days: -1 }).success).toBe(false);
  });

  it("level · 0-9 범위", () => {
    expect(CreateEmployeeSchema.safeParse({ ...base, level: 5 }).success).toBe(true);
    expect(CreateEmployeeSchema.safeParse({ ...base, level: 0 }).success).toBe(true);
    expect(CreateEmployeeSchema.safeParse({ ...base, level: 9 }).success).toBe(true);
    expect(CreateEmployeeSchema.safeParse({ ...base, level: 10 }).success).toBe(false);
    expect(CreateEmployeeSchema.safeParse({ ...base, level: -1 }).success).toBe(false);
  });

  it("email · 형식 X · 실패", () => {
    const r = CreateEmployeeSchema.safeParse({ ...base, email: "not-email" });
    expect(r.success).toBe(false);
  });

  it("email · 빈 문자열 · 성공 (literal '')", () => {
    const r = CreateEmployeeSchema.safeParse({ ...base, email: "" });
    expect(r.success).toBe(true);
  });

  it("email · null · 성공", () => {
    const r = CreateEmployeeSchema.safeParse({ ...base, email: null });
    expect(r.success).toBe(true);
  });

  it("employee_number · 20자 초과 · 실패", () => {
    const r = CreateEmployeeSchema.safeParse({ ...base, employee_number: "1".repeat(21) });
    expect(r.success).toBe(false);
  });
});

describe("UpdateEmployeeSchema · 동일 shape", () => {
  it("Update = Create 동일 필수 검증", () => {
    const r = UpdateEmployeeSchema.safeParse({
      name: "홍길동",
      position: "약사",
      employmentType: "정규직",
      hireDate: "2020-01-01",
      workplace: "매장1",
    });
    expect(r.success).toBe(true);
  });

  it("빈 객체 · 실패 (partial 아님)", () => {
    const r = UpdateEmployeeSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
