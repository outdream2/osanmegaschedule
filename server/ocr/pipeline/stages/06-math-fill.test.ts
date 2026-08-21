// 2026-08-21 · pipeline stage 06 · math-fill · 수식 채움 + 컬럼 밀림 복구 + 크로스 검증
//   parse.autoFillMissingMathField·fixAmountsBySubtotal·repairColumnShift·crossValidateIntraPage mock
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../parse", () => ({
  autoFillMissingMathField: vi.fn(),
  fixAmountsBySubtotal: vi.fn(),
  repairColumnShift: vi.fn(),
  crossValidateIntraPage: vi.fn(),
}));

import { mathFillStage } from "./06-math-fill";
import {
  autoFillMissingMathField,
  fixAmountsBySubtotal,
  repairColumnShift,
  crossValidateIntraPage,
} from "../../parse";
import { makeInitialContext } from "../types";
import type { PageContext } from "../types";

function makeCtx(overrides: Partial<PageContext> = {}): PageContext {
  const base = makeInitialContext({ page: 1, rawB64: "", rawMime: "image/jpeg" });
  return { ...base, ...overrides };
}

describe("mathFillStage · 수식 채움 · 밀림 복구 · 크로스 검증", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Stage · name='math-fill'", () => {
    expect(mathFillStage.name).toBe("math-fill");
  });

  it("실행 순서 · autoFill → fixAmountsBySubtotal → repairColumnShift → crossValidate", async () => {
    (autoFillMissingMathField as any).mockReturnValue({ rows: [["a", 1]], filledCount: 0 });
    (fixAmountsBySubtotal as any).mockReturnValue([["a", 2]]);
    (repairColumnShift as any).mockReturnValue([["a", 3]]);
    (crossValidateIntraPage as any).mockReturnValue([["a", 4]]);

    const ctx = makeCtx({
      headers: ["h", "amt"],
      rows: [["a", 0]],
      meta: { total: 5000 } as any,
      rawText: "일부 텍스트",
    });
    const patch = await mathFillStage.run(ctx);

    // autoFill 이 먼저 호출됨 (early)
    expect(autoFillMissingMathField).toHaveBeenCalledWith(ctx.headers, ctx.rows, "일부 텍스트");
    // fixAmountsBySubtotal 은 autoFill 결과 rows 로 호출
    expect(fixAmountsBySubtotal).toHaveBeenCalledWith(ctx.headers, [["a", 1]], 5000);
    // repairColumnShift 는 fix 결과로 호출
    expect(repairColumnShift).toHaveBeenCalledWith(ctx.headers, [["a", 2]]);
    // cross 는 repair 결과로 호출
    expect(crossValidateIntraPage).toHaveBeenCalledWith(ctx.headers, [["a", 3]]);
    // 최종 반환
    expect(patch).toEqual({ rows: [["a", 4]] });
  });

  it("rawText 없음 · 빈 문자열로 대체", async () => {
    (autoFillMissingMathField as any).mockReturnValue({ rows: [], filledCount: 0 });
    (fixAmountsBySubtotal as any).mockReturnValue([]);
    (repairColumnShift as any).mockReturnValue([]);
    (crossValidateIntraPage as any).mockReturnValue([]);
    const ctx = makeCtx({ headers: ["h"], rows: [] });

    await mathFillStage.run(ctx);
    expect(autoFillMissingMathField).toHaveBeenCalledWith(ctx.headers, ctx.rows, "");
  });

  it("meta.total null · null 전달", async () => {
    (autoFillMissingMathField as any).mockReturnValue({ rows: [], filledCount: 0 });
    (fixAmountsBySubtotal as any).mockReturnValue([]);
    (repairColumnShift as any).mockReturnValue([]);
    (crossValidateIntraPage as any).mockReturnValue([]);
    const ctx = makeCtx({ headers: [], rows: [], meta: { total: null } as any });

    await mathFillStage.run(ctx);
    expect(fixAmountsBySubtotal).toHaveBeenCalledWith([], [], null);
  });

  it("filledCount > 0 · 콘솔 로그 (page)", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => { /* noop */ });
    (autoFillMissingMathField as any).mockReturnValue({ rows: [["a"]], filledCount: 5 });
    (fixAmountsBySubtotal as any).mockReturnValue([["a"]]);
    (repairColumnShift as any).mockReturnValue([["a"]]);
    (crossValidateIntraPage as any).mockReturnValue([["a"]]);
    const ctx = makeCtx({ page: 2, headers: ["h"], rows: [] });

    await mathFillStage.run(ctx);
    expect(spy).toHaveBeenCalled();
    const s = String(spy.mock.calls[0][0]);
    expect(s).toContain("[math-fill/early]");
    expect(s).toContain("page 2");
    expect(s).toContain("5개");
    spy.mockRestore();
  });

  it("filledCount == 0 · 조기 로그 없음", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => { /* noop */ });
    (autoFillMissingMathField as any).mockReturnValue({ rows: [], filledCount: 0 });
    (fixAmountsBySubtotal as any).mockReturnValue([]);
    (repairColumnShift as any).mockReturnValue([]);
    (crossValidateIntraPage as any).mockReturnValue([]);
    const ctx = makeCtx({ headers: [], rows: [] });

    await mathFillStage.run(ctx);
    // filledCount 0 → 로그 스킵
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
