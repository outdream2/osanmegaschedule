// 2026-08-21 · pipeline/index · 파이프라인 팩토리 조립 검증
//   buildRawOnnxPipeline · buildPostParsePipeline · buildOnnxPipeline
import { describe, it, expect, vi } from "vitest";
import {
  buildRawOnnxPipeline,
  buildPostParsePipeline,
  buildOnnxPipeline,
} from "./index";

function makeDeps() {
  return {
    matchVendorSupplier: vi.fn(),
    findVendorInText: vi.fn(),
    findOcrTemplate: vi.fn(),
    applyColumnMapping: vi.fn(),
    applyTemplateHeaders: vi.fn(),
    upsertOcrTemplate: vi.fn(),
  };
}

describe("buildRawOnnxPipeline · raw 추출 전용", () => {
  it("2 stages · preprocess + ocr-engine", () => {
    const pipeline = buildRawOnnxPipeline();
    expect(pipeline).toHaveLength(2);
    expect(pipeline[0].name).toBe("preprocess");
    expect(pipeline[1].name).toBe("ocr-engine");
  });

  it("파싱 stage 없음 · normalize/verify/totals 제외", () => {
    const pipeline = buildRawOnnxPipeline();
    const names = pipeline.map(s => s.name);
    expect(names).not.toContain("normalize");
    expect(names).not.toContain("verify");
    expect(names).not.toContain("totals");
    expect(names).not.toContain("fallback-parse");
  });
});

describe("buildPostParsePipeline · post-parse 전용", () => {
  it("9 stages · vendor-match 부터 learn-template", () => {
    const pipeline = buildPostParsePipeline(makeDeps());
    expect(pipeline).toHaveLength(9);
    expect(pipeline[0].name).toBe("vendor-match");
    expect(pipeline[pipeline.length - 1].name).toBe("learn-template");
  });

  it("preprocess · ocr-engine 없음 (이미 완료 상태 기대)", () => {
    const pipeline = buildPostParsePipeline(makeDeps());
    const names = pipeline.map(s => s.name);
    expect(names).not.toContain("preprocess");
    expect(names).not.toContain("ocr-engine");
  });

  it("rearrange-parse 없음 (default 흐름 유지)", () => {
    const pipeline = buildPostParsePipeline(makeDeps());
    const names = pipeline.map(s => s.name);
    expect(names).not.toContain("rearrange-parse");
  });

  it("순서 · vendor-match → template-apply → normalize → math-fill → filter → verify → totals → fallback-parse → learn-template", () => {
    const pipeline = buildPostParsePipeline(makeDeps());
    const names = pipeline.map(s => s.name);
    expect(names).toEqual([
      "vendor-match",
      "template-apply",
      "normalize",
      "math-fill",
      "filter",
      "verify",
      "totals",
      "fallback-parse",
      "learn-template",
    ]);
  });
});

describe("buildOnnxPipeline · 전체 흐름", () => {
  it("12 stages · preprocess → learn-template", () => {
    const pipeline = buildOnnxPipeline(makeDeps());
    expect(pipeline).toHaveLength(12);
    expect(pipeline[0].name).toBe("preprocess");
    expect(pipeline[pipeline.length - 1].name).toBe("learn-template");
  });

  it("전체 순서 검증", () => {
    const pipeline = buildOnnxPipeline(makeDeps());
    const names = pipeline.map(s => s.name);
    expect(names).toEqual([
      "preprocess",
      "ocr-engine",
      "vendor-match",
      "template-apply",
      "rearrange-parse",
      "normalize",
      "math-fill",
      "filter",
      "verify",
      "totals",
      "fallback-parse",
      "learn-template",
    ]);
  });

  it("rearrange-parse 는 template-apply 다음 · normalize 앞", () => {
    const pipeline = buildOnnxPipeline(makeDeps());
    const names = pipeline.map(s => s.name);
    const rIdx = names.indexOf("rearrange-parse");
    const tIdx = names.indexOf("template-apply");
    const nIdx = names.indexOf("normalize");
    expect(rIdx).toBe(tIdx + 1);
    expect(rIdx).toBe(nIdx - 1);
  });

  it("deps · 팩토리 stage 는 deps 함수 참조 (분리)", () => {
    const deps = makeDeps();
    const pipeline = buildOnnxPipeline(deps);
    // vendor-match · template-apply · learn-template 은 팩토리로 생성됨
    // 각각 실행하지 않아도 형식은 검증 가능
    const factoryStages = pipeline.filter(s =>
      ["vendor-match", "template-apply", "learn-template"].includes(s.name),
    );
    expect(factoryStages).toHaveLength(3);
  });
});
