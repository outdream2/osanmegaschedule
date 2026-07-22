// server/ocr/pipeline/index.ts
// ONNX 파이프라인 조립 · 2026-07-14 리팩토링
//
// routes/ocr.ts 에서 함수를 주입받아 stages 를 조립.
// 이렇게 하면 순환 참조 없이 route 헬퍼(matchVendorSupplier 등) 를 stage 에서 사용 가능.

import type { OcrTemplate, Row, Stage } from "./types";
import { preprocessStage } from "./stages/01-preprocess";
import { ocrEngineStage } from "./stages/02-ocr-engine";
import { makeVendorMatchStage } from "./stages/03-vendor-match";
import { makeTemplateStage } from "./stages/04-template";
import { normalizeStage } from "./stages/05-normalize";
import { mathFillStage } from "./stages/06-math-fill";
import { filterStage } from "./stages/07-filter";
import { verifyStage } from "./stages/08-verify";
import { totalsStage } from "./stages/09-totals";
import { fallbackStage } from "./stages/10-fallback";
import { rearrangeParseStage } from "./stages/10b-rearrange";
import { makeLearnStage } from "./stages/11-learn";

export interface OnnxPipelineDeps {
  matchVendorSupplier: (s: string | null | undefined) => Promise<string | null>;
  findVendorInText: (t: string | null | undefined) => Promise<string | null>;
  findOcrTemplate: (hint: string | null | undefined, rawText?: string) => Promise<OcrTemplate | null>;
  applyColumnMapping: (headers: string[], rows: Row[], mapping: string[]) => { headers: string[]; rows: Row[] };
  applyTemplateHeaders: (detected: string[], template: string[]) => string[];
  upsertOcrTemplate: (supplier: string | null | undefined, headers: string[]) => Promise<void>;
}

// 2026-07-22 · raw 파이프라인 · preprocess + ocr-engine 만 · 파싱 스킵
//   용도: ONNX 로 rawText 만 뽑고 파싱은 별도 (로컬 재파싱 or Gemini 텍스트 파싱)
export function buildRawOnnxPipeline(): Stage[] {
  return [preprocessStage, ocrEngineStage];
}

// 2026-07-22 · post-parse 파이프라인 · OCR 이미 완료된 상태에서 파싱만 실행
//   rearrange 스테이지 제외 → 원래 default 흐름과 완전 동일한 결과
//   ctx 에는 raw 추출 결과 (headers/rows/meta/rawText) 가 이미 채워져 있어야 함
export function buildPostParsePipeline(deps: OnnxPipelineDeps): Stage[] {
  return [
    makeVendorMatchStage({
      matchVendorSupplier: deps.matchVendorSupplier,
      findVendorInText: deps.findVendorInText,
    }),
    makeTemplateStage({
      findOcrTemplate: deps.findOcrTemplate,
      applyColumnMapping: deps.applyColumnMapping,
      applyTemplateHeaders: deps.applyTemplateHeaders,
    }),
    // rearrange 는 제외 (default approach 는 rearrange 스킵) · 원본 흐름 유지
    normalizeStage,
    mathFillStage,
    filterStage,
    verifyStage,
    totalsStage,
    fallbackStage,
    makeLearnStage({ upsertOcrTemplate: deps.upsertOcrTemplate }),
  ];
}

export function buildOnnxPipeline(deps: OnnxPipelineDeps): Stage[] {
  return [
    preprocessStage,
    ocrEngineStage,
    makeVendorMatchStage({
      matchVendorSupplier: deps.matchVendorSupplier,
      findVendorInText: deps.findVendorInText,
    }),
    makeTemplateStage({
      findOcrTemplate: deps.findOcrTemplate,
      applyColumnMapping: deps.applyColumnMapping,
      applyTemplateHeaders: deps.applyTemplateHeaders,
    }),
    // rearrange 재추출 시 · rawText 재파싱 (when: approach==="rearrange") · normalize 앞
    //   → 재파싱 결과가 normalize/verify/totals 를 통과하도록 rearrange 를 초기에 배치
    rearrangeParseStage,
    normalizeStage,
    mathFillStage,
    filterStage,
    verifyStage,
    totalsStage,
    fallbackStage,
    makeLearnStage({ upsertOcrTemplate: deps.upsertOcrTemplate }),
  ];
}

export * from "./types";
export * from "./runner";
