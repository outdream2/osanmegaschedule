// @vitest-environment jsdom
// 2026-09-14 · stockArrivalsApi · 프리미티브 테스트
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

import {
  listStockArrivals,
  createStockArrival,
  patchStockArrival,
  deleteStockArrival,
} from "./stockArrivalsApi";
import { api } from "./apiClient";

const sample = {
  id: 1,
  title: "입고 알림",
  body: "내용",
  created_at: "2026-09-14T10:00:00Z",
  created_by_id: 42,
  scheduled_at: null,
  broadcast_sent: false,
};

describe("listStockArrivals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("리스트 반환", async () => {
    (api.get as any).mockResolvedValueOnce({ data: [sample] });
    const list = await listStockArrivals();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("입고 알림");
  });

  it("Array 아닌 응답 · 빈 배열", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    expect(await listStockArrivals()).toEqual([]);
  });
});

describe("createStockArrival", () => {
  beforeEach(() => vi.clearAllMocks());

  it("send_now · POST", async () => {
    (api.post as any).mockResolvedValueOnce({ data: sample });
    const result = await createStockArrival({
      title: "입고 알림",
      body: "내용",
      employeeId: 42,
      send_now: true,
    });
    expect(api.post).toHaveBeenCalledWith("/api/stock-arrivals", {
      title: "입고 알림",
      body: "내용",
      employeeId: 42,
      send_now: true,
    });
    expect(result?.id).toBe(1);
  });

  it("scheduled_at · 예약 발송", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    await createStockArrival({
      title: "예약",
      employeeId: 42,
      scheduled_at: "2026-09-15T10:00:00Z",
    });
    const [, body] = (api.post as any).mock.calls[0];
    expect(body.scheduled_at).toBe("2026-09-15T10:00:00Z");
  });
});

describe("patchStockArrival", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PATCH · id · payload", async () => {
    (api.patch as any).mockResolvedValueOnce({ data: sample });
    await patchStockArrival(1, { title: "수정", employeeId: 42 });
    expect(api.patch).toHaveBeenCalledWith("/api/stock-arrivals/1", {
      title: "수정",
      employeeId: 42,
    });
  });
});

describe("deleteStockArrival", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DELETE · employeeId · body", async () => {
    (api.del as any).mockResolvedValueOnce({});
    await deleteStockArrival(1, 42);
    expect(api.del).toHaveBeenCalledWith("/api/stock-arrivals/1", {
      data: { employeeId: 42 },
    });
  });
});
