// 2026-08-21 · pipeline stage 04 · template-apply · OCR 템플릿 자동 적용
//   deps injection · findOcrTemplate · applyColumnMapping · applyTemplateHeaders
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeTemplateStage } from "./04-template";
import { makeInitialContext } from "../types";
import type { PageContext } from "../types";

function makeCtx(overrides: Partial<PageContext> = {}): PageContext {
  const base = makeInitialContext({ page: 1, rawB64: "", rawMime: "image/jpeg" });
  return { ...base, ...overrides };
}

function makeDeps() {
  return {
    findOcrTemplate: vi.fn(),
    applyColumnMapping: vi.fn(),
    applyTemplateHeaders: vi.fn(),
  };
}

describe("makeTemplateStage · Stage 팩토리", () => {
  it("Stage · name='template-apply'", () => {
    const stage = makeTemplateStage(makeDeps());
    expect(stage.name).toBe("template-apply");
  });
});

describe("makeTemplateStage · rearrange 모드 스킵", () => {
  it("approach='rearrange' · findOcrTemplate 미호출 · template undefined", async () => {
    const deps = makeDeps();
    const stage = makeTemplateStage(deps);
    const ctx = makeCtx({ approach: "rearrange", headers: ["h"], rows: [["a"]] });
    const patch = await stage.run(ctx);
    expect(deps.findOcrTemplate).not.toHaveBeenCalled();
    expect(patch).toEqual({ template: undefined });
  });
});

describe("makeTemplateStage · 템플릿 없음", () => {
  it("findOcrTemplate null · template undefined", async () => {
    const deps = makeDeps();
    deps.findOcrTemplate.mockResolvedValue(null);
    const stage = makeTemplateStage(deps);
    const ctx = makeCtx({ headers: ["품명"], rows: [["a"]], supplierHint: "동아" });
    const patch = await stage.run(ctx);
    expect(deps.findOcrTemplate).toHaveBeenCalledWith("동아", ctx.rawText);
    expect(patch).toEqual({ template: undefined });
  });

  it("supplierHint 없음 · vendorMatched 로 fallback", async () => {
    const deps = makeDeps();
    deps.findOcrTemplate.mockResolvedValue(null);
    const stage = makeTemplateStage(deps);
    const ctx = makeCtx({ headers: ["h"], rows: [["a"]], vendorMatched: "메가팜" });
    await stage.run(ctx);
    expect(deps.findOcrTemplate).toHaveBeenCalledWith("메가팜", ctx.rawText);
  });

  it("supplierHint 빈 문자열 · vendorMatched 사용", async () => {
    const deps = makeDeps();
    deps.findOcrTemplate.mockResolvedValue(null);
    const stage = makeTemplateStage(deps);
    const ctx = makeCtx({ headers: ["h"], rows: [], supplierHint: "  ", vendorMatched: "메가팜" });
    await stage.run(ctx);
    expect(deps.findOcrTemplate).toHaveBeenCalledWith("메가팜", ctx.rawText);
  });
});

describe("makeTemplateStage · column_mapping 우선 적용", () => {
  beforeEach(() => vi.clearAllMocks());

  it("column_mapping 있음 · applyColumnMapping 호출 · headers/rows 갱신", async () => {
    const deps = makeDeps();
    const tmpl = { supplier: "동아", headers: ["품명", "수량"], column_mapping: ["품명", "수량"] };
    deps.findOcrTemplate.mockResolvedValue(tmpl);
    deps.applyColumnMapping.mockReturnValue({
      headers: ["품명", "수량"],
      rows: [["a", 1]],
    });
    const stage = makeTemplateStage(deps);
    const ctx = makeCtx({
      headers: ["원본1", "원본2"],
      rows: [["v1", "v2"]],
      supplierHint: "동아",
    });
    const patch = await stage.run(ctx);
    expect(deps.applyColumnMapping).toHaveBeenCalledWith(
      ["원본1", "원본2"],
      [["v1", "v2"]],
      ["품명", "수량"],
    );
    expect(patch.headers).toEqual(["품명", "수량"]);
    expect(patch.rows).toEqual([["a", 1]]);
    expect(patch.template).toBe(tmpl);
  });

  it("column_mapping 모두 '제외' · fallback (applyTemplateHeaders 로)", async () => {
    const deps = makeDeps();
    const tmpl = { supplier: "동아", headers: ["품명"], column_mapping: ["제외", "제외"] };
    deps.findOcrTemplate.mockResolvedValue(tmpl);
    deps.applyTemplateHeaders.mockReturnValue(["품명"]);
    const stage = makeTemplateStage(deps);
    const ctx = makeCtx({ headers: ["원본"], rows: [["v"]], supplierHint: "동아" });
    await stage.run(ctx);
    // column_mapping 은 모두 '제외' → some(v && !=='제외') === false → applyColumnMapping 호출 안됨
    expect(deps.applyColumnMapping).not.toHaveBeenCalled();
    expect(deps.applyTemplateHeaders).toHaveBeenCalled();
  });

  it("column_mapping 길이 불일치 · 경고 후 적용", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => { /* noop */ });
    const deps = makeDeps();
    deps.findOcrTemplate.mockResolvedValue({
      supplier: "동아",
      headers: ["h1"],
      column_mapping: ["품명", "수량", "단가"],  // 3개
    });
    deps.applyColumnMapping.mockReturnValue({ headers: ["품명"], rows: [] });
    const stage = makeTemplateStage(deps);
    const ctx = makeCtx({ headers: ["원본1", "원본2"], rows: [], supplierHint: "동아" });  // 2개
    await stage.run(ctx);
    // 매핑(3) ≠ 원본(2) · 경고 로그
    expect(spy).toHaveBeenCalled();
    const s = String(spy.mock.calls[0][0]);
    expect(s).toContain("매핑(3)");
    expect(s).toContain("원본(2)");
    // 그래도 적용
    expect(deps.applyColumnMapping).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("makeTemplateStage · applyTemplateHeaders fallback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("column_mapping 없음 · headers 있음 · applyTemplateHeaders 호출", async () => {
    const deps = makeDeps();
    const tmpl = { supplier: "동아", headers: ["품명", "수량"] };
    deps.findOcrTemplate.mockResolvedValue(tmpl);
    deps.applyTemplateHeaders.mockReturnValue(["품명", "수량"]);
    const stage = makeTemplateStage(deps);
    const ctx = makeCtx({ headers: ["원본1", "원본2"], rows: [["v1", "v2"]], supplierHint: "동아" });
    const patch = await stage.run(ctx);
    expect(deps.applyTemplateHeaders).toHaveBeenCalledWith(
      ["원본1", "원본2"],
      ["품명", "수량"],
    );
    expect(patch.headers).toEqual(["품명", "수량"]);
    expect(patch.template).toBe(tmpl);
  });

  it("applyTemplateHeaders · 동일 참조 반환 · headers 변경 없음", async () => {
    const deps = makeDeps();
    const originalHeaders = ["원본1"];
    deps.findOcrTemplate.mockResolvedValue({ supplier: "s", headers: ["h"] });
    deps.applyTemplateHeaders.mockReturnValue(originalHeaders);  // same ref
    const stage = makeTemplateStage(deps);
    const ctx = makeCtx({ headers: originalHeaders, rows: [], supplierHint: "s" });
    const patch = await stage.run(ctx);
    expect(patch.headers).toBe(originalHeaders);
  });

  it("headers 비어있음 · applyTemplateHeaders 호출 안 함", async () => {
    const deps = makeDeps();
    deps.findOcrTemplate.mockResolvedValue({ supplier: "s", headers: ["h"] });
    const stage = makeTemplateStage(deps);
    const ctx = makeCtx({ headers: [], rows: [], supplierHint: "s" });
    await stage.run(ctx);
    expect(deps.applyTemplateHeaders).not.toHaveBeenCalled();
  });
});
