// 2026-08-23 · #178 · vendorPassword · deriveVendorPassword · verifyVendorPassword
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  deriveVendorPassword,
  verifyVendorPassword,
  getVendorPwSuffix,
  normalizePhone,
  DEFAULT_VENDOR_PW_SUFFIX,
} from "./vendorPassword";

describe("vendorPassword", () => {
  const originalEnv = process.env.VENDOR_PW_SUFFIX;
  beforeEach(() => { delete process.env.VENDOR_PW_SUFFIX; });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VENDOR_PW_SUFFIX;
    else process.env.VENDOR_PW_SUFFIX = originalEnv;
  });

  it("DEFAULT_VENDOR_PW_SUFFIX · '00'", () => {
    expect(DEFAULT_VENDOR_PW_SUFFIX).toBe("00");
  });

  it("normalizePhone · 하이픈/공백 제거 · 숫자만", () => {
    expect(normalizePhone("010-1234-5678")).toBe("01012345678");
    expect(normalizePhone(" 010 1234 5678 ")).toBe("01012345678");
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
    expect(normalizePhone("")).toBe("");
  });

  it("getVendorPwSuffix · env 미설정 시 · DEFAULT (00)", () => {
    delete process.env.VENDOR_PW_SUFFIX;
    expect(getVendorPwSuffix()).toBe("00");
  });

  it("getVendorPwSuffix · env 설정 시 · env 값", () => {
    process.env.VENDOR_PW_SUFFIX = "99";
    expect(getVendorPwSuffix()).toBe("99");
  });

  it("deriveVendorPassword · phone + default suffix (00)", () => {
    delete process.env.VENDOR_PW_SUFFIX;
    expect(deriveVendorPassword("010-1234-5678")).toBe("0101234567800");
  });

  it("deriveVendorPassword · 명시 suffix override", () => {
    expect(deriveVendorPassword("01012345678", "77")).toBe("0101234567877");
  });

  it("deriveVendorPassword · phone 정규화 (하이픈 제거)", () => {
    expect(deriveVendorPassword("010-1234-5678", "00")).toBe("0101234567800");
  });

  it("verifyVendorPassword · 일치 시 true", () => {
    expect(verifyVendorPassword("010-1234-5678", "0101234567800", "00")).toBe(true);
  });

  it("verifyVendorPassword · 불일치 시 false", () => {
    expect(verifyVendorPassword("010-1234-5678", "0101234567811", "00")).toBe(false);
  });

  it("verifyVendorPassword · 사용자 입력 정규화 (공백 · 하이픈 허용)", () => {
    expect(verifyVendorPassword("01012345678", "010 1234 5678 00", "00")).toBe(true);
  });

  it("verifyVendorPassword · 빈 입력 시 false", () => {
    expect(verifyVendorPassword("01012345678", "", "00")).toBe(false);
    expect(verifyVendorPassword("01012345678", "   ", "00")).toBe(false);
  });

  it("verifyVendorPassword · env suffix 사용 시 (override 없음)", () => {
    process.env.VENDOR_PW_SUFFIX = "42";
    expect(verifyVendorPassword("01012345678", "0101234567842")).toBe(true);
    expect(verifyVendorPassword("01012345678", "0101234567800")).toBe(false);
  });
});
