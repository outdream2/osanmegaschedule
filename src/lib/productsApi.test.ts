// @vitest-environment jsdom
// 2026-09-14 · productsApi · 프리미티브 테스트
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

import {
  getProductsMap,
  getProductByCode,
  patchProduct,
  createProduct,
  getPurchaseHistoryMap,
  listExpiryImminentProducts,
  listHiddenProducts,
  getShelfPositionsMap,
  patchProductShelfPositions,
  searchProducts,
} from "./productsApi";
import { api } from "./apiClient";

describe("getProductsMap", () => {
  beforeEach(() => vi.clearAllMocks());

  it("파라미터 없음 · base URL", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { PC001: {} } });
    await getProductsMap();
    expect(api.get).toHaveBeenCalledWith("/api/products-map");
  });

  it("include_inactive + include_hidden · query 반영", async () => {
    (api.get as any).mockResolvedValueOnce({ data: {} });
    await getProductsMap({ include_inactive: true, include_hidden: true });
    expect(api.get).toHaveBeenCalledWith("/api/products-map?include_inactive=1&include_hidden=1");
  });

  it("null 응답 · 빈 객체", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    expect(await getProductsMap()).toEqual({});
  });
});

describe("getProductByCode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("encodeURIComponent 자동", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { product_code: "P C001" } });
    await getProductByCode("P C001");
    expect(api.get).toHaveBeenCalledWith("/api/products/P%20C001");
  });

  it("null 응답 · null 반환", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    expect(await getProductByCode("X")).toBeNull();
  });
});

describe("patchProduct", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PATCH · body 전달", async () => {
    (api.patch as any).mockResolvedValueOnce({ data: null });
    await patchProduct("PC001", { location: "3A" });
    expect(api.patch).toHaveBeenCalledWith("/api/products/PC001", { location: "3A" });
  });
});

describe("createProduct", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST · input 전달", async () => {
    (api.post as any).mockResolvedValueOnce({ data: { ok: true, product_code: "PC001" } });
    const r = await createProduct({ product_name: "타이레놀", product_code: "PC001" });
    expect(r.ok).toBe(true);
    expect(r.product_code).toBe("PC001");
  });
});

describe("getPurchaseHistoryMap", () => {
  beforeEach(() => vi.clearAllMocks());

  it("codes · limit query", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { history: { PC001: {} } } });
    await getPurchaseHistoryMap(["PC001", "PC002"], 5);
    expect(api.get).toHaveBeenCalledWith("/api/products/purchase-history?codes=PC001%2CPC002&limit=5");
  });

  it("빈 codes · 빈 객체 즉시 반환 (API 호출 없음)", async () => {
    const result = await getPurchaseHistoryMap([]);
    expect(result).toEqual({});
    expect(api.get).not.toHaveBeenCalled();
  });

  it("direct map response · normalize", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { PC001: { qty: 5 } } });
    const r: any = await getPurchaseHistoryMap(["PC001"]);
    expect(r.PC001).toEqual({ qty: 5 });
  });
});

describe("listExpiryImminentProducts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("배열 응답", async () => {
    (api.get as any).mockResolvedValueOnce({ data: [{ product_code: "PC001" }] });
    const list: any = await listExpiryImminentProducts();
    expect(list).toHaveLength(1);
  });

  it("Array 아닌 응답 · 빈 배열", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    expect(await listExpiryImminentProducts()).toEqual([]);
  });
});

describe("getShelfPositionsMap · patchProductShelfPositions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET map · 빈 응답 · 빈 객체", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    expect(await getShelfPositionsMap()).toEqual({});
  });

  it("PATCH · shelf_positions body 감쌈", async () => {
    (api.patch as any).mockResolvedValueOnce({ data: null });
    await patchProductShelfPositions("PC001", { store1: "332", warehouse1: "105" });
    expect(api.patch).toHaveBeenCalledWith("/api/products/PC001/shelf-positions", {
      shelf_positions: { store1: "332", warehouse1: "105" },
    });
  });
});

describe("listHiddenProducts · searchProducts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hidden GET", async () => {
    (api.get as any).mockResolvedValueOnce({ data: [] });
    await listHiddenProducts();
    expect(api.get).toHaveBeenCalledWith("/api/products/hidden");
  });

  it("search · q + limit query", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { items: [] } });
    await searchProducts("타이레놀", 500);
    expect(api.get).toHaveBeenCalledWith("/api/products-search?q=%ED%83%80%EC%9D%B4%EB%A0%88%EB%86%80&limit=500");
  });
});
