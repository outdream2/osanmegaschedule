// @vitest-environment jsdom
// 2026-09-14 · settingsApi · KV 저장·조회 프리미티브 테스트
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

import { getSetting, saveSetting } from "./settingsApi";
import { api } from "./apiClient";

describe("getSetting · GET /api/settings?key=...", () => {
  beforeEach(() => vi.clearAllMocks());

  it("값 반환", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: 30 } });
    const v = await getSetting<number>("optimal_stock_period_days");
    expect(v).toBe(30);
    expect(api.get).toHaveBeenCalledWith("/api/settings?key=optimal_stock_period_days");
  });

  it("value 없음 · null", async () => {
    (api.get as any).mockResolvedValueOnce({ data: {} });
    const v = await getSetting<number>("nonexistent");
    expect(v).toBeNull();
  });

  it("key · encodeURIComponent", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { value: "x" } });
    await getSetting("break_timeline_2026-09-14");
    expect(api.get).toHaveBeenCalledWith("/api/settings?key=break_timeline_2026-09-14");
  });
});

describe("saveSetting · POST /api/settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("key/value POST", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    await saveSetting("sidebar_enabled", true);
    expect(api.post).toHaveBeenCalledWith("/api/settings", {
      key: "sidebar_enabled",
      value: true,
    });
  });

  it("복잡 value · JSON 그대로", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    await saveSetting("break_timeline_2026-09-14", [{ id: 1, start: "10:00" }]);
    expect(api.post).toHaveBeenCalledWith("/api/settings", {
      key: "break_timeline_2026-09-14",
      value: [{ id: 1, start: "10:00" }],
    });
  });
});
