// 2026-08-21 · pipeline stage 07 · filter · code-only + metadata bleed 필터
//   parse.filterCodeOnlyRows + parse.filterMetadataBleedRows mock · 순서 · 로그
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../parse", () => ({
  filterCodeOnlyRows: vi.fn(),
  filterMetadataBleedRows: vi.fn(),
}));

import { filterStage } from "./07-filter";
import { filterCodeOnlyRows, filterMetadataBleedRows } from "../../parse";
import { makeInitialContext } from "../types";
import type { PageContext } from "../types";

function makeCtx(overrides: Partial<PageContext> = {}): PageContext {
  const base = makeInitialContext({ page: 1, rawB64: "", rawMime: "image/jpeg" });
  return { ...base, ...overrides };
}

describe("filterStage · 노이즈 · 메타 필터", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Stage · name='filter'", () => {
    expect(filterStage.name).toBe("filter");
  });

  it("filterCodeOnlyRows → filterMetadataBleedRows 순서", async () => {
    const codeOnly = [["a"], ["b"], ["c"]];
    const afterMeta = [["a"]];
    (filterCodeOnlyRows as any).mockReturnValue(codeOnly);
    (filterMetadataBleedRows as any).mockReturnValue(afterMeta);

    const ctx = makeCtx({
      headers: ["품명"],
      rows: [["a"], ["b"], ["c"], ["d"]],
      meta: { total: 1000 } as any,
    });
    const patch = await filterStage.run(ctx);

    expect(filterCodeOnlyRows).toHaveBeenCalledWith(ctx.headers, ctx.rows);
    // filterMetadataBleedRows 는 codeOnly 결과를 받아야 함
    expect(filterMetadataBleedRows).toHaveBeenCalledWith(ctx.headers, codeOnly, ctx.meta);
    expect(patch).toEqual({ rows: afterMeta });
  });

  it("메타 필터 결과 · patch.rows 만 반환", async () => {
    const filtered = [["only", "row"]];
    (filterCodeOnlyRows as any).mockReturnValue([["a"], ["b"]]);
    (filterMetadataBleedRows as any).mockReturnValue(filtered);

    const ctx = makeCtx({ headers: ["h1", "h2"], rows: [["a", 1], ["b", 2]] });
    const patch = await filterStage.run(ctx);
    expect(patch).toEqual({ rows: filtered });
  });

  it("codeOnly 필터가 모두 제거해도 · 후속 필터 여전히 실행", async () => {
    (filterCodeOnlyRows as any).mockReturnValue([]);
    (filterMetadataBleedRows as any).mockReturnValue([]);

    const ctx = makeCtx({ headers: ["h"], rows: [["a"]] });
    const patch = await filterStage.run(ctx);
    expect(filterMetadataBleedRows).toHaveBeenCalled();
    expect(patch.rows).toEqual([]);
  });

  it("meta.total 없어도 · undefined meta 로 호출 성공", async () => {
    (filterCodeOnlyRows as any).mockReturnValue([["a"]]);
    (filterMetadataBleedRows as any).mockReturnValue([["a"]]);
    const ctx = makeCtx({ headers: ["h"], rows: [["a"]] });
    // meta 자체는 { } 로 초기화
    await filterStage.run(ctx);
    expect(filterMetadataBleedRows).toHaveBeenCalled();
  });

  it("행 감소 시 · 콘솔 로그 (page/count)", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => { /* noop */ });
    (filterCodeOnlyRows as any).mockReturnValue([["a"], ["b"], ["c"], ["d"]]);
    (filterMetadataBleedRows as any).mockReturnValue([["a"]]);

    const ctx = makeCtx({ page: 3, headers: ["h"], rows: [] });
    await filterStage.run(ctx);
    // "[filter] page 3: 메타 노이즈 3행 제거"
    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls[0][0];
    expect(String(call)).toContain("page 3");
    expect(String(call)).toContain("3행 제거");
    spy.mockRestore();
  });

  it("행 감소 없음 · 로그 없음", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => { /* noop */ });
    (filterCodeOnlyRows as any).mockReturnValue([["a"]]);
    (filterMetadataBleedRows as any).mockReturnValue([["a"]]);
    const ctx = makeCtx({ headers: ["h"], rows: [] });
    await filterStage.run(ctx);
    // 감소 없음 → 로그 호출 안됨
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
