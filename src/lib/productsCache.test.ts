// @vitest-environment jsdom
// 2026-08-19 · productsCache · prefetch/getProductsMap/lookupProduct/isProductsLoaded/updateCachedProduct
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  // 모듈 캐시 리셋 · 각 테스트에서 새로 import
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const sampleMap = {
  "8801234": { code: "8801234", name: "타이레놀 500mg", spec: "30정" },
  "8809999": { code: "8809999", name: "이바네정 20mg", spec: "10정" },
};

describe("productsCache · 초기 상태", () => {
  it("isProductsLoaded · 초기 false", async () => {
    mockFetch.mockResolvedValue(okResponse({}));
    const { isProductsLoaded } = await import("./productsCache");
    expect(isProductsLoaded()).toBe(false);
  });

  it("lookupProduct · 로드 전 · null", async () => {
    mockFetch.mockResolvedValue(okResponse({}));
    const { lookupProduct } = await import("./productsCache");
    expect(lookupProduct("8801234")).toBeNull();
  });
});

describe("productsCache · prefetch/getProductsMap", () => {
  it("prefetchProducts · fetch 호출 · products.json", async () => {
    mockFetch.mockResolvedValue(okResponse(sampleMap));
    const { prefetchProducts } = await import("./productsCache");
    prefetchProducts();
    expect(mockFetch).toHaveBeenCalledWith("/products.json");
  });

  it("getProductsMap · 로드된 값 반환", async () => {
    mockFetch.mockResolvedValue(okResponse(sampleMap));
    const { getProductsMap } = await import("./productsCache");
    const map = await getProductsMap();
    expect(map["8801234"].name).toBe("타이레놀 500mg");
  });

  it("getProductsMap 두번 호출 · 두번째는 캐시 반환 · fetch 재호출 없음", async () => {
    mockFetch.mockResolvedValue(okResponse(sampleMap));
    const { getProductsMap } = await import("./productsCache");
    // 첫 번째 호출 · fetch 발생 · resolve
    await getProductsMap();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // 두 번째 호출 · 캐시(_map) 유효 · fetch 재호출 없음
    await getProductsMap();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("fetch 실패 · 빈 객체 반환 · promise 리셋", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    const { prefetchProducts, getProductsMap } = await import("./productsCache");
    prefetchProducts();
    const map = await getProductsMap();
    expect(map).toEqual({});
  });
});

describe("lookupProduct · 코드 조회", () => {
  it("정확 매칭", async () => {
    mockFetch.mockResolvedValue(okResponse(sampleMap));
    const { getProductsMap, lookupProduct } = await import("./productsCache");
    await getProductsMap();
    const p = lookupProduct("8801234");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("타이레놀 500mg");
  });

  it("앞뒤 공백 · trim 후 매칭", async () => {
    mockFetch.mockResolvedValue(okResponse(sampleMap));
    const { getProductsMap, lookupProduct } = await import("./productsCache");
    await getProductsMap();
    const p = lookupProduct("  8801234  ");
    expect(p?.name).toBe("타이레놀 500mg");
  });

  it("leading zero 제거 fallback", async () => {
    mockFetch.mockResolvedValue(okResponse(sampleMap));
    const { getProductsMap, lookupProduct } = await import("./productsCache");
    await getProductsMap();
    // '008801234' 는 원본에 없음 · 앞 0 제거 후 '8801234' 매칭
    const p = lookupProduct("008801234");
    expect(p?.name).toBe("타이레놀 500mg");
  });

  it("존재하지 않는 코드 · null", async () => {
    mockFetch.mockResolvedValue(okResponse(sampleMap));
    const { getProductsMap, lookupProduct } = await import("./productsCache");
    await getProductsMap();
    expect(lookupProduct("9999999")).toBeNull();
  });
});

describe("isProductsLoaded", () => {
  it("로드 후 · true", async () => {
    mockFetch.mockResolvedValue(okResponse(sampleMap));
    const { getProductsMap, isProductsLoaded } = await import("./productsCache");
    await getProductsMap();
    expect(isProductsLoaded()).toBe(true);
  });
});

describe("updateCachedProduct", () => {
  it("정확 매칭 · 필드 병합", async () => {
    mockFetch.mockResolvedValue(okResponse(sampleMap));
    const { getProductsMap, updateCachedProduct, lookupProduct } = await import("./productsCache");
    await getProductsMap();
    updateCachedProduct("8801234", { spec: "60정", newField: "test" });
    const p = lookupProduct("8801234");
    expect(p!.spec).toBe("60정");
    expect(p!.newField).toBe("test");
    expect(p!.name).toBe("타이레놀 500mg"); // 다른 필드 유지
  });

  it("로드 전 · no-op", async () => {
    mockFetch.mockResolvedValue(okResponse({}));
    const { updateCachedProduct } = await import("./productsCache");
    // 로드 안 됨 · 에러 없이 무시
    expect(() => updateCachedProduct("8801234", { spec: "x" })).not.toThrow();
  });

  it("leading zero · 원본·stripped 양쪽 업데이트", async () => {
    const map = {
      "8801234": { code: "8801234", name: "A", spec: "" },
    };
    mockFetch.mockResolvedValue(okResponse(map));
    const { getProductsMap, updateCachedProduct, lookupProduct } = await import("./productsCache");
    await getProductsMap();
    updateCachedProduct("008801234", { spec: "updated" });
    // stripped '8801234' 업데이트
    expect(lookupProduct("8801234")?.spec).toBe("updated");
  });
});

// 2026-08-23 · #179 · addCachedProduct · 미등록 상품 등록 후 로컬 캐시 즉시 삽입
describe("addCachedProduct", () => {
  it("로드 전 · 새 캐시 생성 · 항목 삽입", async () => {
    mockFetch.mockResolvedValue(okResponse({}));
    const { addCachedProduct, lookupProduct } = await import("./productsCache");
    addCachedProduct("NEW001", { name: "신규상품" });
    expect(lookupProduct("NEW001")?.name).toBe("신규상품");
  });

  it("로드 후 · 기존 캐시에 추가", async () => {
    mockFetch.mockResolvedValue(okResponse(sampleMap));
    const { getProductsMap, addCachedProduct, lookupProduct } = await import("./productsCache");
    await getProductsMap();
    addCachedProduct("NEW002", { name: "신규상품2", spec: "10정" });
    expect(lookupProduct("NEW002")?.name).toBe("신규상품2");
    // 기존 항목 유지
    expect(lookupProduct("8801234")?.name).toBe("타이레놀 500mg");
  });

  it("빈 코드 · 무시 (no-op)", async () => {
    mockFetch.mockResolvedValue(okResponse({}));
    const { addCachedProduct, lookupProduct } = await import("./productsCache");
    addCachedProduct("", { name: "X" });
    expect(lookupProduct("")).toBeNull();
  });

  it("leading zero · 원본+stripped 양쪽 삽입", async () => {
    mockFetch.mockResolvedValue(okResponse({}));
    const { addCachedProduct, lookupProduct } = await import("./productsCache");
    addCachedProduct("00PC001", { name: "테스트" });
    // 원본 코드로 lookup
    expect(lookupProduct("00PC001")?.name).toBe("테스트");
    // stripped 코드로도 lookup 가능
    expect(lookupProduct("PC001")?.name).toBe("테스트");
  });

  it("info 없이 · 기본값 (name 빈 문자열)", async () => {
    mockFetch.mockResolvedValue(okResponse({}));
    const { addCachedProduct, lookupProduct } = await import("./productsCache");
    addCachedProduct("MIN001", {});
    const p = lookupProduct("MIN001");
    expect(p?.code).toBe("MIN001");
    expect(p?.name).toBe("");
    expect(p?.spec).toBe("");
  });
});
