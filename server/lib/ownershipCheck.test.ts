// 2026-08-20 · ownershipCheck · session·admin·row 검증
// vi.hoisted · module import 전 · JWT_SECRET 사전 설정
import { vi } from "vitest";
vi.hoisted(() => {
  process.env.JWT_SECRET = "test-jwt-secret-for-ownership-check-1234567890";
});

import { describe, it, expect, beforeEach } from "vitest";

// supabase + getSession mock · vi.hoisted 로 factory 안전
const mocks = vi.hoisted(() => ({
  supabaseChain: {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  },
  getSession: vi.fn(),
}));

vi.mock("../../src/supabase/client", () => ({
  supabase: mocks.supabaseChain,
}));

vi.mock("../middleware/requireAuth", () => ({
  getSession: mocks.getSession,
}));

import { checkOwnershipOrAdmin } from "./ownershipCheck";

const mockSupabaseChain = mocks.supabaseChain;
const mockGetSession = mocks.getSession;

beforeEach(() => {
  mockSupabaseChain.from.mockReset().mockReturnValue(mockSupabaseChain);
  mockSupabaseChain.select.mockReset().mockReturnValue(mockSupabaseChain);
  mockSupabaseChain.eq.mockReset().mockReturnValue(mockSupabaseChain);
  mockSupabaseChain.maybeSingle.mockReset();
  mockGetSession.mockReset();
});

describe("checkOwnershipOrAdmin · 인증", () => {
  it("세션 없음 · 401 인증 필요", async () => {
    mockGetSession.mockReturnValue(null);
    const r = await checkOwnershipOrAdmin({} as any, { table: "leave_requests", id: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.error).toContain("인증");
    }
  });
});

describe("checkOwnershipOrAdmin · admin 바로 통과", () => {
  it("level >= 9 (기본 adminLevel) · row 조회 안 함 · ok=true·isAdmin=true", async () => {
    mockGetSession.mockReturnValue({ sub: 100, level: 9 });
    const r = await checkOwnershipOrAdmin({} as any, { table: "leave_requests", id: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.isAdmin).toBe(true);
      expect(r.row).toBeNull();
    }
    expect(mockSupabaseChain.from).not.toHaveBeenCalled();
  });

  it("커스텀 adminLevel=5 · level 5 는 admin", async () => {
    mockGetSession.mockReturnValue({ sub: 100, level: 5 });
    const r = await checkOwnershipOrAdmin({} as any, { table: "x", id: 1, adminLevel: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.isAdmin).toBe(true);
  });
});

describe("checkOwnershipOrAdmin · 본인 검증", () => {
  it("리소스 없음 (row null) · 404", async () => {
    mockGetSession.mockReturnValue({ sub: 100, level: 1 });
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    const r = await checkOwnershipOrAdmin({} as any, { table: "leave_requests", id: 999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it("DB 에러 · 500", async () => {
    mockGetSession.mockReturnValue({ sub: 100, level: 1 });
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: null, error: { message: "DB down" } });
    const r = await checkOwnershipOrAdmin({} as any, { table: "x", id: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(500);
      expect(r.error).toBe("DB down");
    }
  });

  it("본인 소유 · ok=true · isAdmin=false", async () => {
    mockGetSession.mockReturnValue({ sub: 100, level: 1 });
    mockSupabaseChain.maybeSingle.mockResolvedValue({
      data: { employee_id: 100, status: "pending" }, error: null,
    });
    const r = await checkOwnershipOrAdmin({} as any, { table: "x", id: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.isAdmin).toBe(false);
      expect(r.row).toEqual({ employee_id: 100, status: "pending" });
    }
  });

  it("타인 소유 · 403", async () => {
    mockGetSession.mockReturnValue({ sub: 100, level: 1 });
    mockSupabaseChain.maybeSingle.mockResolvedValue({
      data: { employee_id: 200, status: "pending" }, error: null,
    });
    const r = await checkOwnershipOrAdmin({} as any, { table: "x", id: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.error).toContain("본인");
    }
  });

  it("커스텀 ownerCol · created_by 로 비교", async () => {
    mockGetSession.mockReturnValue({ sub: 100, level: 1 });
    mockSupabaseChain.maybeSingle.mockResolvedValue({
      data: { created_by: 100 }, error: null,
    });
    const r = await checkOwnershipOrAdmin({} as any, { table: "x", id: 1, ownerCol: "created_by" });
    expect(r.ok).toBe(true);
  });

  it("커스텀 select 컬럼", async () => {
    mockGetSession.mockReturnValue({ sub: 100, level: 1 });
    mockSupabaseChain.maybeSingle.mockResolvedValue({
      data: { employee_id: 100 }, error: null,
    });
    await checkOwnershipOrAdmin({} as any, { table: "x", id: 1, select: "employee_id, custom_field" });
    expect(mockSupabaseChain.select).toHaveBeenCalledWith("employee_id, custom_field");
  });
});
