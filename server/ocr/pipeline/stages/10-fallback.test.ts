// 2026-08-21 · pipeline stage 10 · fallback-parse · rawText 폴백 파서 + 중복 병합
//   fallbackParseRowsFromRawText mock · 항상 실행 · Jaccard 중복 감지
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../parse", () => ({
  fallbackParseRowsFromRawText: vi.fn(),
}));

import { fallbackStage } from "./10-fallback";
import { fallbackParseRowsFromRawText } from "../../parse";
import { makeInitialContext } from "../types";
import type { PageContext } from "../types";

function makeCtx(overrides: Partial<PageContext> = {}): PageContext {
  const base = makeInitialContext({ page: 1, rawB64: "", rawMime: "image/jpeg" });
  return { ...base, ...overrides };
}

describe("fallbackStage · rawText 폴백 파서 + 병합", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Stage · name='fallback-parse'", () => {
    expect(fallbackStage.name).toBe("fallback-parse");
  });

  it("when · rawText 30자+ · true", () => {
    const ctx = makeCtx({ rawText: "a".repeat(50) });
    expect(fallbackStage.when?.(ctx)).toBe(true);
  });

  it("when · rawText 없음 · false", () => {
    const ctx = makeCtx();
    expect(fallbackStage.when?.(ctx)).toBe(false);
  });

  it("when · rawText 30자 이하 · false", () => {
    const ctx = makeCtx({ rawText: "짧음" });
    expect(fallbackStage.when?.(ctx)).toBe(false);
  });

  it("fallback 결과 0행 · 빈 patch 반환", async () => {
    (fallbackParseRowsFromRawText as any).mockReturnValue({ headers: [], rows: [] });
    const ctx = makeCtx({
      headers: ["품명"],
      rows: [["기존"]],
      rawText: "some text",
    });
    const patch = await fallbackStage.run(ctx);
    expect(patch).toEqual({});
  });

  it("rows 비어있음 · fallback headers · rows 로 시작", async () => {
    (fallbackParseRowsFromRawText as any).mockReturnValue({
      headers: ["품명", "수량"],
      rows: [["신상품", 10]],
    });
    const ctx = makeCtx({
      headers: [],
      rows: [],
      rawText: "some text",
    });
    const patch = await fallbackStage.run(ctx);
    // headers 없음 → fallback headers 로 승격
    expect(patch.headers).toEqual(["품명", "수량"]);
    // remap: fallback headers → headers · 동일하므로 [신상품, 10]
    expect(patch.rows).toEqual([["신상품", 10]]);
  });

  it("기존 rows 있음 · 중복 없는 새 상품 · 병합", async () => {
    (fallbackParseRowsFromRawText as any).mockReturnValue({
      headers: ["품명", "수량"],
      rows: [["새상품", 5]],
    });
    const ctx = makeCtx({
      headers: ["품명", "수량"],
      rows: [["기존상품", 10]],
      rawText: "some text",
    });
    const patch = await fallbackStage.run(ctx);
    expect(patch.rows).toEqual([["기존상품", 10], ["새상품", 5]]);
  });

  it("품명 빈 문자열 · 스킵", async () => {
    (fallbackParseRowsFromRawText as any).mockReturnValue({
      headers: ["품명"],
      rows: [["", 1], [null, 2]],
    });
    const ctx = makeCtx({
      headers: ["품명"],
      rows: [],
      rawText: "some text",
    });
    const patch = await fallbackStage.run(ctx);
    // 모두 빈 품명 → newRows 0개 → 빈 patch
    expect(patch).toEqual({});
  });

  it("substring 중복 · 스킵 (norm 후 3자+)", async () => {
    (fallbackParseRowsFromRawText as any).mockReturnValue({
      headers: ["품명"],
      rows: [["타이레놀정500mg"]],  // substring 매칭
    });
    const ctx = makeCtx({
      headers: ["품명"],
      rows: [["타이레놀정"]],  // 기존 · 5자
      rawText: "some text",
    });
    const patch = await fallbackStage.run(ctx);
    // "타이레놀정" 이 "타이레놀정500mg" 안에 포함 → 중복
    expect(patch).toEqual({});
  });

  it("한글 3-gram Jaccard >= 0.4 · 중복 판정", async () => {
    (fallbackParseRowsFromRawText as any).mockReturnValue({
      headers: ["품명"],
      rows: [["대웅타이레놀정오백밀리그램"]],
    });
    const ctx = makeCtx({
      headers: ["품명"],
      rows: [["타이레놀정오백밀리그램대웅"]],  // 어순 다름 · 겹치는 3-gram 많음
      rawText: "some text",
    });
    const patch = await fallbackStage.run(ctx);
    // 3-gram 셋 겹침 > 0.4 → 중복
    expect(patch).toEqual({});
  });

  it("완전히 다른 상품명 · 병합", async () => {
    (fallbackParseRowsFromRawText as any).mockReturnValue({
      headers: ["품명"],
      rows: [["게보린정"]],
    });
    const ctx = makeCtx({
      headers: ["품명"],
      rows: [["타이레놀"]],
      rawText: "some text",
    });
    const patch = await fallbackStage.run(ctx);
    expect(patch.rows).toHaveLength(2);
  });

  it("headers 없고 fallback headers 도 없음 · 빈 remap · 병합만 시도", async () => {
    (fallbackParseRowsFromRawText as any).mockReturnValue({
      headers: [],
      rows: [["신상품"]],
    });
    const ctx = makeCtx({
      headers: [],
      rows: [],
      rawText: "some text",
    });
    const patch = await fallbackStage.run(ctx);
    // headers 도 fallbackHeaders 도 비었으니 remap 은 빈 배열 반환
    // headers 유지 (fallbackHeaders.length===0 이므로 승격 조건 X)
    expect(patch.headers).toEqual([]);
    expect(patch.rows).toEqual([[]]);
  });

  it("병합 시 · 콘솔 로그 (page + count)", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => { /* noop */ });
    (fallbackParseRowsFromRawText as any).mockReturnValue({
      headers: ["품명"],
      rows: [["신상품A"], ["신상품B"]],
    });
    const ctx = makeCtx({
      page: 7,
      headers: ["품명"],
      rows: [["기존"]],
      rawText: "text",
    });
    await fallbackStage.run(ctx);
    const s = String(spy.mock.calls[0][0]);
    expect(s).toContain("[fallback-parse]");
    expect(s).toContain("page 7");
    expect(s).toContain("2행 추가");
    spy.mockRestore();
  });
});
