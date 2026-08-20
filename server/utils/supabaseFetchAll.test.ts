// 2026-08-20 · supabaseFetchAll · 페이지 loop 로 1000행 캡 우회
import { describe, it, expect, vi } from "vitest";
import { fetchAllWithRange } from "./supabaseFetchAll";

const makeQueryFactory = (pages: any[][], error?: string) => {
  let call = 0;
  return () => ({
    range: vi.fn().mockImplementation(async (from: number, to: number) => {
      if (error) return { data: null, error: { message: error } };
      const page = pages[call++] ?? [];
      // 검증용 · from/to 반영 (호출자가 정확히 지정하는지 확인)
      return { data: page.slice(0, to - from + 1), error: null };
    }),
  });
};

describe("fetchAllWithRange", () => {
  it("단일 페이지 · 100행 · 즉시 return", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const rs = await fetchAllWithRange(makeQueryFactory([rows]), 5000);
    expect(rs).toHaveLength(100);
    expect(rs[0]).toEqual({ id: 0 });
  });

  it("정확히 페이지사이즈 · 1000행 · 다음 페이지 요청·빈 배열·중단", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const rs = await fetchAllWithRange(makeQueryFactory([page1, []]), 5000);
    expect(rs).toHaveLength(1000);
  });

  it("여러 페이지 loop · 2500행 (3 페이지)", async () => {
    const p1 = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const p2 = Array.from({ length: 1000 }, (_, i) => ({ id: 1000 + i }));
    const p3 = Array.from({ length: 500 }, (_, i) => ({ id: 2000 + i }));
    const rs = await fetchAllWithRange(makeQueryFactory([p1, p2, p3]), 5000);
    expect(rs).toHaveLength(2500);
    expect(rs[2499]).toEqual({ id: 2499 });
  });

  it("maxRows 상한 · 정확히 잘라서 반환", async () => {
    const p1 = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const p2 = Array.from({ length: 1000 }, (_, i) => ({ id: 1000 + i }));
    const rs = await fetchAllWithRange(makeQueryFactory([p1, p2]), 1500);
    expect(rs).toHaveLength(1500);
  });

  it("error · throw", async () => {
    await expect(fetchAllWithRange(makeQueryFactory([], "DB down"), 5000)).rejects.toThrow("DB down");
  });

  it("빈 결과 · 빈 배열", async () => {
    const rs = await fetchAllWithRange(makeQueryFactory([[]]), 5000);
    expect(rs).toEqual([]);
  });

  it("커스텀 pageSize · 100씩 페이지", async () => {
    const p1 = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const p2 = Array.from({ length: 50 }, (_, i) => ({ id: 100 + i }));
    const rs = await fetchAllWithRange(makeQueryFactory([p1, p2]), 300, 100);
    expect(rs).toHaveLength(150);
  });
});
