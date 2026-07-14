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
import { makeLearnStage } from "./stages/11-learn";

export interface OnnxPipelineDeps {
  matchVendorSupplier: (s: string | null | undefined) => Promise<string | null>;
  findVendorInText: (t: string | null | undefined) => Promise<string | null>;
  findOcrTemplate: (hint: string | null | undefined, rawText?: string) => Promise<OcrTemplate | null>;
  applyColumnMapping: (headers: string[], rows: Row[], mapping: string[]) => { headers: string[]; rows: Row[] };
  applyTemplateHeaders: (detected: string[], template: string[]) => string[];
  upsertOcrTemplate: (supplier: string | null | undefined, headers: string[]) => Promise<void>;
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
