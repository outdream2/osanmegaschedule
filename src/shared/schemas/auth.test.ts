// 2026-08-16 · shared 스키마 단위 테스트
import { describe, it, expect } from "vitest";
import { LoginSchema, VendorLoginSchema, SetPasswordSchema, ChangePasswordSchema } from "./auth";

describe("LoginSchema", () => {
  it("정상 · password + rememberMe", () => {
    const r = LoginSchema.safeParse({ employee_id: "01012345678", password: "1234", rememberMe: true });
    expect(r.success).toBe(true);
  });
  it("password 빈 문자열 · fail (min 1)", () => {
    const r = LoginSchema.safeParse({ employee_id: "01012345678", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("비밀번호");
  });
  it("password 없음 · fail (undefined)", () => {
    const r = LoginSchema.safeParse({ employee_id: "01012345678" });
    expect(r.success).toBe(false);
  });
  it("employee_id 는 optional · number 도 허용", () => {
    const r = LoginSchema.safeParse({ employee_id: 123, password: "abcd" });
    expect(r.success).toBe(true);
  });
  it("password max 200 초과 · fail", () => {
    const r = LoginSchema.safeParse({ password: "x".repeat(201) });
    expect(r.success).toBe(false);
  });
});

describe("VendorLoginSchema", () => {
  it("phone + password · 정상", () => {
    const r = VendorLoginSchema.safeParse({ phone: "01012345678", password: "01012345678xx" });
    expect(r.success).toBe(true);
  });
  it("phone 빈 · fail", () => {
    const r = VendorLoginSchema.safeParse({ phone: "", password: "x" });
    expect(r.success).toBe(false);
  });
});

describe("SetPasswordSchema", () => {
  it("정상 · employeeId + password", () => {
    const r = SetPasswordSchema.safeParse({ employeeId: 1, password: "1234" });
    expect(r.success).toBe(true);
  });
  it("password 3자 · fail (최소 4자)", () => {
    const r = SetPasswordSchema.safeParse({ employeeId: 1, password: "123" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("4자");
  });
});

describe("ChangePasswordSchema", () => {
  it("정상 · 현재+새 비밀번호", () => {
    const r = ChangePasswordSchema.safeParse({
      employeeId: 1, currentPassword: "old", newPassword: "newpass",
    });
    expect(r.success).toBe(true);
  });
  it("newPassword 3자 · fail", () => {
    const r = ChangePasswordSchema.safeParse({
      employeeId: 1, currentPassword: "old", newPassword: "abc",
    });
    expect(r.success).toBe(false);
  });
});
