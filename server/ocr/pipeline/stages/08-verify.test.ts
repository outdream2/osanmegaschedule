// 2026-08-21 · pipeline stage 08 · verify · rawText 검증 + 최종 autoFill
//   parse.verifyRowsAgainstRawText + parse.autoFillMissingMathField mock
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../parse", () => ({
  verifyRowsAgainstRawText: vi.fn(),
  autoFillMissingMathField: vi.fn(),
}));

import { verifyStage } from "./08-verify";
import { verifyRowsAgainstRawText, autoFillMissingMathField } from "../../parse";
import { makeInitialContext } from "../types";
import type { PageContext } from "../types";

function makeCtx(overrides: Partial<PageContext> = {}): PageContext {
  const base = makeInitialContext({ page: 1, rawB64: "", rawMime: "image/jpeg" });
  return { ...base, ...overrides };
}

describe("verifyStage · rawText 검증 + 최종 autoFill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Stage · name='verify'", () => {
    expect(verifyStage.name).toBe("verify");
  });

  it("verifyRowsAgainstRawText → autoFillMissingMathField 순서", async () => {
    (verifyRowsAgainstRawText as any).mockReturnValue({ rows: [["a", 1]], correctedCount: 0 });
    (autoFillMissingMathField as any).mockReturnValue({ rows: [["a", 2]], filledCount: 0, fixedCount: 0 });

    const ctx = makeCtx({
      headers: ["h", "amt"],
      rows: [["a", 0]],
      rawText: "text",
    });
    const patch = await verifyStage.run(ctx);

    expect(verifyRowsAgainstRawText).toHaveBeenCalledWith(ctx.headers, ctx.rows, "text");
    expect(autoFillMissingMathField).toHaveBeenCalledWith(ctx.headers, [["a", 1]], "text");
    expect(patch).toEqual({ rows: [["a", 2]] });
  });

  it("rawText 없음 · 빈 문자열로 대체", async () => {
    (verifyRowsAgainstRawText as any).mockReturnValue({ rows: [], correctedCount: 0 });
    (autoFillMissingMathField as any).mockReturnValue({ rows: [], filledCount: 0, fixedCount: 0 });
    const ctx = makeCtx({ headers: [], rows: [] });

    await verifyStage.run(ctx);
    expect(verifyRowsAgainstRawText).toHaveBeenCalledWith([], [], "");
    expect(autoFillMissingMathField).toHaveBeenCalledWith([], [], "");
  });

  it("correctedCount > 0 · rawText 보정 로그", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => { /* noop */ });
    (verifyRowsAgainstRawText as any).mockReturnValue({ rows: [], correctedCount: 3 });
    (autoFillMissingMathField as any).mockReturnValue({ rows: [], filledCount: 0, fixedCount: 0 });
    const ctx = makeCtx({ page: 4, headers: [], rows: [] });

    await verifyStage.run(ctx);
    const s = String(spy.mock.calls[0][0]);
    expect(s).toContain("[verify/rawText]");
    expect(s).toContain("page 4");
    expect(s).toContain("3개");
    spy.mockRestore();
  });

  it("filledCount > 0 · autoFill 채움 로그", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => { /* noop */ });
    (verifyRowsAgainstRawText as any).mockReturnValue({ rows: [], correctedCount: 0 });
    (autoFillMissingMathField as any).mockReturnValue({ rows: [], filledCount: 2, fixedCount: 0 });
    const ctx = makeCtx({ headers: [], rows: [] });

    await verifyStage.run(ctx);
    const log = spy.mock.calls.find(c => String(c[0]).includes("[verify/autoFill]") && String(c[0]).includes("2개 자동 계산"));
    expect(log).toBeDefined();
    spy.mockRestore();
  });

  it("fixedCount > 0 · autoFill 오독 교체 로그", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => { /* noop */ });
    (verifyRowsAgainstRawText as any).mockReturnValue({ rows: [], correctedCount: 0 });
    (autoFillMissingMathField as any).mockReturnValue({ rows: [], filledCount: 0, fixedCount: 4 });
    const ctx = makeCtx({ headers: [], rows: [] });

    await verifyStage.run(ctx);
    const log = spy.mock.calls.find(c => String(c[0]).includes("[verify/autoFill]") && String(c[0]).includes("4개 rawText로"));
    expect(log).toBeDefined();
    spy.mockRestore();
  });

  it("모든 카운트 0 · 로그 없음", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => { /* noop */ });
    (verifyRowsAgainstRawText as any).mockReturnValue({ rows: [], correctedCount: 0 });
    (autoFillMissingMathField as any).mockReturnValue({ rows: [], filledCount: 0, fixedCount: 0 });
    const ctx = makeCtx({ headers: [], rows: [] });

    await verifyStage.run(ctx);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
