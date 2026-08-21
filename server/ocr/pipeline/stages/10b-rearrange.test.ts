// 2026-08-21 · pipeline stage 10b · rearrange-parse · rawText 재배치 파서
//   approach=rearrange 전용 · 헤더 감지 + 컬럼 재배치
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../parse", () => ({
  fallbackParseRowsFromRawText: vi.fn(),
  detectHeaderLineInRawText: vi.fn(),
}));

import { rearrangeParseStage } from "./10b-rearrange";
import { fallbackParseRowsFromRawText, detectHeaderLineInRawText } from "../../parse";
import { makeInitialContext } from "../types";
import type { PageContext } from "../types";

function makeCtx(overrides: Partial<PageContext> = {}): PageContext {
  const base = makeInitialContext({ page: 1, rawB64: "", rawMime: "image/jpeg" });
  return { ...base, ...overrides };
}

describe("rearrangeParseStage · approach=rearrange 재파싱", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Stage · name='rearrange-parse'", () => {
    expect(rearrangeParseStage.name).toBe("rearrange-parse");
  });

  it("when · approach='rearrange' + rawText 30자+ · true", () => {
    const ctx = makeCtx({
      approach: "rearrange",
      rawText: "a".repeat(50),
    });
    expect(rearrangeParseStage.when?.(ctx)).toBe(true);
  });

  it("when · approach='default' · false", () => {
    const ctx = makeCtx({
      approach: "default",
      rawText: "a".repeat(100),
    });
    expect(rearrangeParseStage.when?.(ctx)).toBe(false);
  });

  it("when · rawText 30자 이하 · false", () => {
    const ctx = makeCtx({
      approach: "rearrange",
      rawText: "짧은 텍스트",
    });
    expect(rearrangeParseStage.when?.(ctx)).toBe(false);
  });

  it("when · approach=high-contrast · false", () => {
    const ctx = makeCtx({
      approach: "high-contrast",
      rawText: "a".repeat(100),
    });
    expect(rearrangeParseStage.when?.(ctx)).toBe(false);
  });

  it("run · REARRANGED_HEADERS 반환 (품명·규격·수량·단가·금액·유통기한)", async () => {
    (detectHeaderLineInRawText as any).mockReturnValue({ linePosition: 0, headers: [] });
    (fallbackParseRowsFromRawText as any).mockReturnValue({ headers: [], rows: [] });
    const ctx = makeCtx({ rawText: "line1\nline2\nline3", approach: "rearrange" });
    const patch = await rearrangeParseStage.run(ctx);
    expect(patch.headers).toEqual(["품명", "규격", "수량", "단가", "금액", "유통기한"]);
  });

  it("run · REMAP 로직 · 기본 index → 재배치 index", async () => {
    // 기본 파서 결과: [품명, 수량, 단가, 금액, 규격, 유통기한]
    // 재배치: 품명(0)→0, 수량(1)→2, 단가(2)→3, 금액(3)→4, 규격(4)→1, 유통기한(5)→5
    (detectHeaderLineInRawText as any).mockReturnValue(null);
    (fallbackParseRowsFromRawText as any).mockReturnValue({
      headers: ["품명", "수량", "단가", "금액", "규격", "유통기한"],
      rows: [["타이레놀", 10, 500, 5000, "500mg", "20260101"]],
    });
    const ctx = makeCtx({ rawText: "some raw text ".repeat(20), approach: "rearrange" });
    const patch = await rearrangeParseStage.run(ctx);

    // rearranged: [품명, 규격, 수량, 단가, 금액, 유통기한]
    expect(patch.rows?.[0]).toEqual(["타이레놀", "500mg", 10, 500, 5000, "20260101"]);
  });

  it("run · 헤더 라인 감지 후 · 이후 라인만 focused", async () => {
    (detectHeaderLineInRawText as any).mockReturnValue({ linePosition: 2, headers: ["품명"] });
    (fallbackParseRowsFromRawText as any).mockReturnValue({ headers: [], rows: [] });
    const ctx = makeCtx({
      rawText: "메타1\n메타2\n헤더라인\n상품1\n상품2",
      approach: "rearrange",
    });
    await rearrangeParseStage.run(ctx);
    // fallbackParseRowsFromRawText 는 헤더 라인 이후 (position=2 다음)를 받음
    const callArgs = (fallbackParseRowsFromRawText as any).mock.calls[0][0];
    expect(callArgs).toBe("상품1\n상품2");
  });

  it("run · 헤더 라인 감지 실패 · 전체 rawText 사용", async () => {
    (detectHeaderLineInRawText as any).mockReturnValue(null);
    (fallbackParseRowsFromRawText as any).mockReturnValue({ headers: [], rows: [] });
    const ctx = makeCtx({
      rawText: "line1\nline2\nline3",
      approach: "rearrange",
    });
    await rearrangeParseStage.run(ctx);
    const callArgs = (fallbackParseRowsFromRawText as any).mock.calls[0][0];
    // linePosition -1 → slice(0) → 전체
    expect(callArgs).toBe("line1\nline2\nline3");
  });

  it("run · 로그 · page + 헤더라인 + focused 길이", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => { /* noop */ });
    (detectHeaderLineInRawText as any).mockReturnValue({ linePosition: 1, headers: [] });
    (fallbackParseRowsFromRawText as any).mockReturnValue({ headers: [], rows: [["a", 1]] });
    const ctx = makeCtx({ page: 5, rawText: "a\nb\nc", approach: "rearrange" });
    await rearrangeParseStage.run(ctx);
    const s = String(spy.mock.calls[0][0]);
    expect(s).toContain("[rearrange-parse]");
    expect(s).toContain("page 5");
    expect(s).toContain("헤더라인=1");
    spy.mockRestore();
  });

  it("run · 짧은 행 · 초과 인덱스 무시 (out-of-bounds 안전)", async () => {
    (detectHeaderLineInRawText as any).mockReturnValue(null);
    // 3개짜리 짧은 row
    (fallbackParseRowsFromRawText as any).mockReturnValue({
      headers: [],
      rows: [["품명만", 10, 500]],
    });
    const ctx = makeCtx({ rawText: "long enough raw text ".repeat(10), approach: "rearrange" });
    const patch = await rearrangeParseStage.run(ctx);
    // 3개만 remap · 나머지 null
    expect(patch.rows?.[0]).toEqual(["품명만", null, 10, 500, null, null]);
  });
});
