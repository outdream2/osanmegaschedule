// @vitest-environment jsdom
// 2026-09-14 · permissionsApi · 페이지 권한 프리미티브 테스트
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

import { getPagePermissions, savePagePermissions } from "./permissionsApi";
import { api } from "./apiClient";

describe("getPagePermissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /api/permissions · 응답 반환", async () => {
    (api.get as any).mockResolvedValueOnce({
      data: { schedule: { read: 1, write: 3 } },
    });
    const perms = await getPagePermissions();
    expect(perms.schedule).toEqual({ read: 1, write: 3 });
  });

  it("빈 응답 · 빈 객체", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    const perms = await getPagePermissions();
    expect(perms).toEqual({});
  });
});

describe("savePagePermissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST /api/permissions · permissions·employeeId", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    await savePagePermissions({ schedule: { read: 1, write: 3 } } as any, 42);
    expect(api.post).toHaveBeenCalledWith("/api/permissions", {
      permissions: { schedule: { read: 1, write: 3 } },
      employeeId: 42,
    });
  });

  it("employeeId 없음 · undefined 전달", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    await savePagePermissions({} as any);
    expect(api.post).toHaveBeenCalledWith("/api/permissions", {
      permissions: {},
      employeeId: undefined,
    });
  });
});
