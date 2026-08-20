// 2026-08-20 · employeeContracts · Zod 스키마
import { describe, it, expect } from "vitest";
import { CreateEmployeeContractSchema } from "./employeeContracts";

describe("CreateEmployeeContractSchema", () => {
  const valid = {
    employee_name: "홍길동",
    pdf_data_url: "data:application/pdf;base64,xxx",
  };

  it("최소 · 성공", () => {
    const r = CreateEmployeeContractSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("employee_name 없음 · 실패", () => {
    const r = CreateEmployeeContractSchema.safeParse({ pdf_data_url: "x" });
    expect(r.success).toBe(false);
  });

  it("pdf_data_url 없음 · 실패", () => {
    const r = CreateEmployeeContractSchema.safeParse({ employee_name: "x" });
    expect(r.success).toBe(false);
  });

  it("pdf_data_url · 빈 · 실패", () => {
    const r = CreateEmployeeContractSchema.safeParse({ ...valid, pdf_data_url: "" });
    expect(r.success).toBe(false);
  });

  it("employee_name · 50자 초과 · 실패", () => {
    const r = CreateEmployeeContractSchema.safeParse({ ...valid, employee_name: "가".repeat(51) });
    expect(r.success).toBe(false);
  });

  it("모든 옵셔널 · null 허용", () => {
    const r = CreateEmployeeContractSchema.safeParse({
      ...valid,
      employee_id: null,
      contract_type: null,
      start_date: null,
      end_date: null,
      approved_by: null,
      approved_by_id: null,
      contract_start: null,
      contract_end: null,
      probation_end_date: null,
      employee_number: null,
      working_hours: null,
      annual_leave_days: null,
    });
    expect(r.success).toBe(true);
  });

  it("employee_id · number/string 양쪽", () => {
    expect(CreateEmployeeContractSchema.safeParse({ ...valid, employee_id: 1 }).success).toBe(true);
    expect(CreateEmployeeContractSchema.safeParse({ ...valid, employee_id: "u1" }).success).toBe(true);
  });

  it("annual_leave_days · number/string 양쪽 (하위 호환)", () => {
    expect(CreateEmployeeContractSchema.safeParse({ ...valid, annual_leave_days: 15 }).success).toBe(true);
    expect(CreateEmployeeContractSchema.safeParse({ ...valid, annual_leave_days: "15" }).success).toBe(true);
  });

  it("working_hours · 200자 초과 · 실패", () => {
    const r = CreateEmployeeContractSchema.safeParse({ ...valid, working_hours: "x".repeat(201) });
    expect(r.success).toBe(false);
  });

  it("employee_number · 20자 초과 · 실패", () => {
    const r = CreateEmployeeContractSchema.safeParse({ ...valid, employee_number: "1".repeat(21) });
    expect(r.success).toBe(false);
  });
});
