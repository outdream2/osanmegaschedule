// 2026-08-16 · employeeCategory 순수 함수 단위 테스트
import { describe, it, expect } from "vitest";
import {
  isPharmPosition, isLogisticsPosition, isWarehousePosition,
  isPartTimeEmployment, isOtherPosition,
  isPharmEmp, isOtherEmp, isStaffEmp,
} from "./employeeCategory";
import type { Employee } from "../types";

function mkEmp(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 1, name: "홍길동", position: "약사", employmentType: "정규직",
    hireDate: "2020-01-01", workplace: "매장1",
    ...(overrides as any),
  } as Employee;
}

describe("position 판별", () => {
  it("isPharmPosition · '약사' 만 true", () => {
    expect(isPharmPosition("약사")).toBe(true);
    expect(isPharmPosition("캐셔")).toBe(false);
    expect(isPharmPosition("")).toBe(false);
  });
  it("isLogisticsPosition · '물류' 포함", () => {
    expect(isLogisticsPosition("물류")).toBe(true);
    expect(isLogisticsPosition("물류팀")).toBe(true);
    expect(isLogisticsPosition("창고")).toBe(false);
  });
  it("isWarehousePosition · 물류 or '창고'", () => {
    expect(isWarehousePosition("물류")).toBe(true);
    expect(isWarehousePosition("창고")).toBe(true);
    expect(isWarehousePosition("캐셔")).toBe(false);
  });
  it("isPartTimeEmployment · '알바' 만", () => {
    expect(isPartTimeEmployment("알바")).toBe(true);
    expect(isPartTimeEmployment("정규직")).toBe(false);
  });
  it("isOtherPosition · '기타' or '알바' or employmentType='알바'", () => {
    expect(isOtherPosition("기타", "정규직")).toBe(true);
    expect(isOtherPosition("알바", "정규직")).toBe(true);
    expect(isOtherPosition("캐셔", "알바")).toBe(true);
    expect(isOtherPosition("캐셔", "정규직")).toBe(false);
  });
});

describe("Employee 객체 기반", () => {
  it("isPharmEmp · 약사 정규직", () => {
    expect(isPharmEmp(mkEmp({ position: "약사" }))).toBe(true);
    expect(isPharmEmp(mkEmp({ position: "캐셔" }))).toBe(false);
  });
  it("isOtherEmp · 알바 employmentType", () => {
    expect(isOtherEmp(mkEmp({ position: "캐셔", employmentType: "알바" }))).toBe(true);
    expect(isOtherEmp(mkEmp({ position: "기타" }))).toBe(true);
    expect(isOtherEmp(mkEmp({ position: "캐셔" }))).toBe(false);
  });
  it("isStaffEmp · 약사·기타·알바 제외", () => {
    expect(isStaffEmp(mkEmp({ position: "캐셔" }))).toBe(true);
    expect(isStaffEmp(mkEmp({ position: "약사" }))).toBe(false);
    expect(isStaffEmp(mkEmp({ position: "캐셔", employmentType: "알바" }))).toBe(false);
    expect(isStaffEmp(mkEmp({ position: "기타" }))).toBe(false);
  });
});
