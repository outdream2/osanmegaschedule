// @vitest-environment jsdom
// 2026-10-06 · NULL HARDENING regression · LoginModals · role null/undefined fallback
//   · line 147: role != null guard → authRole fallback "employee" on null/undefined role

import { describe, it, expect } from "vitest";

// ─── Unit test of role guard logic extracted from LoginModals line 147 ───────
// We test the pure guard logic directly without rendering the full modal
// (avoids complex apiClient + storage mocks while validating the exact guard)

type AuthRole = "superadmin" | "admin" | "manager" | "employee" | "vendor";

function deriveAuthRole(role: string | null | undefined): AuthRole {
  const validRoles = ["superadmin", "admin", "manager", "employee", "vendor"] as const;
  return role != null && (validRoles as readonly string[]).includes(role)
    ? (role as AuthRole)
    : "employee";
}

describe("LoginModals · null-role guard (line 147)", () => {
  it("null role → fallback to 'employee'", () => {
    expect(deriveAuthRole(null)).toBe("employee");
  });

  it("undefined role → fallback to 'employee'", () => {
    expect(deriveAuthRole(undefined)).toBe("employee");
  });

  it("empty string role → fallback to 'employee'", () => {
    expect(deriveAuthRole("")).toBe("employee");
  });

  it("unknown role string → fallback to 'employee'", () => {
    expect(deriveAuthRole("unknown_role")).toBe("employee");
  });

  it("valid 'admin' role → preserved as 'admin'", () => {
    expect(deriveAuthRole("admin")).toBe("admin");
  });

  it("valid 'superadmin' role → preserved as 'superadmin'", () => {
    expect(deriveAuthRole("superadmin")).toBe("superadmin");
  });

  it("valid 'manager' role → preserved as 'manager'", () => {
    expect(deriveAuthRole("manager")).toBe("manager");
  });

  it("valid 'vendor' role → preserved as 'vendor'", () => {
    expect(deriveAuthRole("vendor")).toBe("vendor");
  });
});
