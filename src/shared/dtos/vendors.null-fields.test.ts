// 2026-10-06 · NULL HARDENING regression · VendorContact nullable fields
//   · STEP 3 · API NULL boundary test (DB write X · mock fixture)
//   · Validates Vendor DTO nullable field handling without DB interaction

import { describe, it, expect } from "vitest";
import type { Vendor } from "./vendors";

// ─── Mock fixture helpers ────────────────────────────────────────────────────

function makeMinimalVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 1,
    company_name: "테스트공급사",
    contact_name: null,
    phone: null,
    email: null,
    business_number: null,
    category: null,
    address: null,
    memo: null,
    ...overrides,
  };
}

// ─── Simulate display logic that consumers apply to nullable fields ────────────

function displayPhone(v: Vendor): string {
  return v.phone ?? "-";
}

function displayEmail(v: Vendor): string {
  return v.email ?? "-";
}

function displayContactName(v: Vendor): string {
  return v.contact_name ?? "-";
}

function displayCtCode(v: Vendor): string | null {
  return v.ct_code ?? null;
}

function displayBalance(v: Vendor): number {
  return v.balance ?? 0;
}

describe("Vendor DTO · nullable field boundary (no DB write)", () => {
  it("minimal vendor · all nullable fields null · no crash", () => {
    const v = makeMinimalVendor();
    expect(() => displayPhone(v)).not.toThrow();
    expect(() => displayEmail(v)).not.toThrow();
    expect(() => displayContactName(v)).not.toThrow();
    expect(() => displayCtCode(v)).not.toThrow();
    expect(() => displayBalance(v)).not.toThrow();
  });

  it("phone null → display fallback '-'", () => {
    expect(displayPhone(makeMinimalVendor({ phone: null }))).toBe("-");
  });

  it("phone provided → display raw value", () => {
    expect(displayPhone(makeMinimalVendor({ phone: "010-1234-5678" }))).toBe("010-1234-5678");
  });

  it("email null → display fallback '-'", () => {
    expect(displayEmail(makeMinimalVendor({ email: null }))).toBe("-");
  });

  it("contact_name null → display fallback '-'", () => {
    expect(displayContactName(makeMinimalVendor({ contact_name: null }))).toBe("-");
  });

  it("ERP ct_code null (Stage A optional) → display null", () => {
    expect(displayCtCode(makeMinimalVendor({ ct_code: null }))).toBeNull();
  });

  it("ERP ct_code provided → display raw value", () => {
    expect(displayCtCode(makeMinimalVendor({ ct_code: "CT12345" }))).toBe("CT12345");
  });

  it("balance undefined → display 0", () => {
    const v = makeMinimalVendor(); // balance not set → undefined
    expect(displayBalance(v)).toBe(0);
  });

  it("balance 0 explicitly → display 0", () => {
    expect(displayBalance(makeMinimalVendor({ balance: 0 }))).toBe(0);
  });

  it("balance positive → display raw value", () => {
    expect(displayBalance(makeMinimalVendor({ balance: 150000 }))).toBe(150000);
  });

  it("ERP Stage A optional fields all undefined · still valid Vendor", () => {
    const v = makeMinimalVendor();
    // All ERP Stage A fields are optional; no error accessing them
    expect(v.ct_code).toBeUndefined();
    expect(v.corp_name_view).toBeUndefined();
    expect(v.corp_biz_no).toBeUndefined();
    expect(v.payment_date).toBeUndefined();
  });

  it("payment_date null (numeric nullable) · no crash", () => {
    const v = makeMinimalVendor({ payment_date: null });
    expect(v.payment_date).toBeNull();
  });
});
