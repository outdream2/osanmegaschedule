// 2026-08-16 · 프레임워크 · pagination 단위 테스트
import { describe, it, expect } from "vitest";
import { parsePagination, paginatedResponse } from "./pagination";

function mockReq(query: Record<string, string>): any {
  return { query };
}

describe("parsePagination", () => {
  it("기본값 · page=1 · limit=50 · maxLimit=200", () => {
    const p = parsePagination(mockReq({}));
    expect(p).toEqual({ page: 1, limit: 50, offset: 0, from: 0, to: 49 });
  });

  it("커스텀 default limit", () => {
    const p = parsePagination(mockReq({}), { limit: 20 });
    expect(p.limit).toBe(20);
    expect(p.to).toBe(19);
  });

  it("page=3, limit=10 → offset 20 · range 20~29", () => {
    const p = parsePagination(mockReq({ page: "3", limit: "10" }));
    expect(p).toEqual({ page: 3, limit: 10, offset: 20, from: 20, to: 29 });
  });

  it("maxLimit 초과 시 · maxLimit 로 clamp", () => {
    const p = parsePagination(mockReq({ limit: "9999" }), { maxLimit: 100 });
    expect(p.limit).toBe(100);
  });

  it("page < 1 · 1 로 clamp", () => {
    const p = parsePagination(mockReq({ page: "0" }));
    expect(p.page).toBe(1);
  });

  it("invalid 값 → default 로 대체", () => {
    const p = parsePagination(mockReq({ page: "abc", limit: "xyz" }));
    expect(p.page).toBe(1);
    expect(p.limit).toBe(50);
  });
});

describe("paginatedResponse", () => {
  it("total 있음 · hasMore true", () => {
    const p = parsePagination(mockReq({ page: "1", limit: "10" }));
    const r = paginatedResponse([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 25, p);
    expect(r).toEqual({ items: expect.any(Array), total: 25, page: 1, limit: 10, hasMore: true });
  });

  it("total 있음 · 마지막 페이지 · hasMore false", () => {
    const p = parsePagination(mockReq({ page: "3", limit: "10" }));
    const r = paginatedResponse([1, 2, 3, 4, 5], 25, p);
    expect(r.hasMore).toBe(false);
    expect(r.total).toBe(25);
  });

  it("total null · items.length 로 fallback", () => {
    const p = parsePagination(mockReq({}));
    const r = paginatedResponse([1, 2, 3], null, p);
    expect(r.total).toBe(3);
    expect(r.hasMore).toBe(false);
  });
});
