// @vitest-environment jsdom
// 2026-09-14 · inventoryChecksApi · 프리미티브 테스트 · 3 API 함수
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./apiClient", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

import {
  saveInventoryCheck,
  saveBulkInventoryChecks,
  listInventoryChecks,
} from "./inventoryChecksApi";
import { api } from "./apiClient";

describe("saveInventoryCheck · POST /api/inventory-checks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("payload 그대로 POST", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    await saveInventoryCheck({
      product_code: "PC001",
      product_name: "타이레놀",
      warehouse1_stock: 10,
      store1_stock: 5,
    });
    expect(api.post).toHaveBeenCalledWith("/api/inventory-checks", {
      product_code: "PC001",
      product_name: "타이레놀",
      warehouse1_stock: 10,
      store1_stock: 5,
    });
  });

  it("shelf_positions · JSONB 병합 payload", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    await saveInventoryCheck({
      product_code: "PC001",
      shelf_positions: { store1: "332", warehouse1: "105" },
    });
    expect(api.post).toHaveBeenCalledWith("/api/inventory-checks", {
      product_code: "PC001",
      shelf_positions: { store1: "332", warehouse1: "105" },
    });
  });

  it("expiry_date · null 리셋 허용", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    await saveInventoryCheck({ product_code: "PC001", expiry_date: null });
    expect(api.post).toHaveBeenCalledWith("/api/inventory-checks", {
      product_code: "PC001",
      expiry_date: null,
    });
  });
});

describe("saveBulkInventoryChecks · POST /api/inventory-checks/bulk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("items 배열 · 결과 반환", async () => {
    (api.post as any).mockResolvedValueOnce({
      data: { saved: 3, failed: 0, downgraded: false },
    });
    const result = await saveBulkInventoryChecks({
      checked_by: "홍길동",
      items: [
        { product_code: "PC001", warehouse1_stock: 10 },
        { product_code: "PC002", store1_stock: 5 },
      ],
    });
    expect(result.saved).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.downgraded).toBe(false);
  });

  it("빈 응답 · 빈 객체 반환 (안전 default)", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    const result = await saveBulkInventoryChecks({
      checked_by: "홍길동",
      items: [],
    });
    expect(result).toEqual({});
  });
});

describe("listInventoryChecks · GET /api/inventory-checks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("params 없음 · 전체 리스트", async () => {
    (api.get as any).mockResolvedValueOnce({
      data: [
        { id: 1, product_code: "PC001", warehouse1_stock: 10 },
        { id: 2, product_code: "PC002", store1_stock: 5 },
      ],
    });
    const list = await listInventoryChecks();
    expect(list).toHaveLength(2);
    expect(api.get).toHaveBeenCalledWith("/api/inventory-checks");
  });

  it("product_code 필터 · query 반영", async () => {
    (api.get as any).mockResolvedValueOnce({ data: [{ id: 1, product_code: "PC001" }] });
    await listInventoryChecks({ product_code: "PC001" });
    expect(api.get).toHaveBeenCalledWith("/api/inventory-checks?product_code=PC001");
  });

  it("product_code · encodeURIComponent 자동 (URLSearchParams)", async () => {
    (api.get as any).mockResolvedValueOnce({ data: [] });
    await listInventoryChecks({ product_code: "P&C 001" });
    // URLSearchParams: & → %26, space → +, 나머지 자동 encoding
    expect(api.get).toHaveBeenCalledWith("/api/inventory-checks?product_code=P%26C+001");
  });

  it("Array 아닌 응답 · 빈 배열 반환 (안전 default)", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    const list = await listInventoryChecks();
    expect(list).toEqual([]);
  });
});
