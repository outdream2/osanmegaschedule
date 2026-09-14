// @vitest-environment jsdom
// 2026-09-14 · orderRequestsApi · 프리미티브 테스트
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

import {
  listOrderRequests,
  createOrderRequest,
  bulkSendOrderRequests,
} from "./orderRequestsApi";
import { api } from "./apiClient";

describe("listOrderRequests · GET /api/order-requests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("전체 리스트 반환", async () => {
    (api.get as any).mockResolvedValueOnce({
      data: [
        { id: "1", product_code: "PC001", product_name: "타이레놀", current_stock: 5, optimal_stock: 20, requested_at: "2026-09-14T10:00:00Z" },
      ],
    });
    const list = await listOrderRequests();
    expect(list).toHaveLength(1);
    expect(list[0].product_code).toBe("PC001");
    expect(api.get).toHaveBeenCalledWith("/api/order-requests");
  });

  it("Array 아닌 응답 · 빈 배열", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    const list = await listOrderRequests();
    expect(list).toEqual([]);
  });
});

describe("createOrderRequest · POST /api/order-requests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requested_at 자동 세팅", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    await createOrderRequest({
      product_code: "PC001",
      product_name: "타이레놀",
      current_stock: 5,
      order_qty: 15,
    });
    const [url, body] = (api.post as any).mock.calls[0];
    expect(url).toBe("/api/order-requests");
    expect(body.product_code).toBe("PC001");
    expect(body.requested_at).toBeDefined();
    // ISO 8601 format check
    expect(body.requested_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("사용자 명시 requested_at · override", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    await createOrderRequest({
      product_code: "PC001",
      product_name: "타이레놀",
      requested_at: "2026-01-01T00:00:00Z",
    });
    const [, body] = (api.post as any).mock.calls[0];
    expect(body.requested_at).toBe("2026-01-01T00:00:00Z");
  });
});

describe("bulkSendOrderRequests · POST /api/order-requests/bulk-send", () => {
  beforeEach(() => vi.clearAllMocks());

  it("응답 반환", async () => {
    (api.post as any).mockResolvedValueOnce({
      data: { ok: true, sent: 3, failed: 0 },
    });
    const result = await bulkSendOrderRequests({
      order_request_ids: [1, 2, 3],
      notify_logistics_leader: true,
    });
    expect(result.ok).toBe(true);
    expect(result.sent).toBe(3);
  });

  it("빈 응답 · 빈 객체", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    const result = await bulkSendOrderRequests({ order_request_ids: [] });
    expect(result).toEqual({});
  });
});
