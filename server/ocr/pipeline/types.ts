// server/ocr/pipeline/types.ts
// 파이프라인 타입 정의 (2026-07-14 리팩토링)
//
// 핵심: 각 stage 는 PageContext 를 받아 부분 업데이트 반환.
//   runner 가 patch 를 병합하며 진행 → imperative 가 declarative 로.

export type Cell = string | number | null;
export type Row = Cell[];

export interface OcrTemplate {
  supplier: string;
  headers: string[];
  column_mapping?: string[];
}

export interface OcrMeta {
  supplier?: string;
  recipient?: string;
  date?: string;
  subtotal?: number | null;
  supplyAmount?: number | null;
  vat?: number | null;
  total?: number | null;
  balancePrev?: number | null;
  balanceAfter?: number | null;
  discount?: number | null;
  summary_rows?: Array<{ label: string; amount: number }>;
  extraPairs?: Array<{ label: string; value: string }>;
  [key: string]: any;
}

export interface RawOcrResult {
  headers: string[];
  rows: Row[];
  meta: OcrMeta;
  rawText: string;
}

export interface StageLog {
  stage: string;
  timeMs?: number;
  skipped?: boolean;
  rowCount?: number;
  headers?: string[];
  note?: string;
  error?: string;
}

// 재추출 접근 방식 (2026-07-19 · 순환 재파싱)
//   default        = 표준 파이프라인 (첫 시도 · 기존 동작)
//   rearrange      = OCR 는 원본 rawText 를 재사용 · 파싱 로직 대안 (컬럼 오프셋/헤더 스킵/템플릿 무시/fallback 우선)
//   high-contrast  = preprocessHighContrast 강제 적용 후 OCR 재실행
//   gemini         = Gemini API 강제 사용 (엔진 override)
export type ReparseApproach = "default" | "rearrange" | "high-contrast" | "gemini";

export interface PageContext {
  // 입력
  page: number;                    // 1-indexed
  rawB64: string;
  rawMime: string;
  supplierHint?: string;
  // 재추출 접근 방식 (default 이외는 파이프라인 stage 별 분기)
  approach?: ReparseApproach;
  // 재추출 시 이전 결과의 rawText (rearrange 모드용 · OCR 스킵)
  cachedRawText?: string;

  // OCR 원본 (파이프라인 초기 stage 에서 채움)
  raw?: RawOcrResult;
  rawText: string;

  // 파이프라인 진행 상태
  headers: string[];
  rows: Row[];
  meta: OcrMeta;
  vendorMatched?: string;
  template?: OcrTemplate;

  // 원본 보관 (컬럼 매핑 UI 용)
  rawOcrHeaders?: string[];
  rawOcrSample?: Row[];

  // 진단
  startTs: number;
  diagnostics: StageLog[];
  errors: string[];
}

export interface Stage {
  name: string;
  // when: 조건 만족해야 실행 (기본 항상 실행)
  when?: (ctx: PageContext) => boolean;
  run(ctx: PageContext): Promise<Partial<PageContext>> | Partial<PageContext>;
}

export function makeInitialContext(args: {
  page: number;
  rawB64: string;
  rawMime: string;
  supplierHint?: string;
  approach?: ReparseApproach;
  cachedRawText?: string;
}): PageContext {
  return {
    page: args.page,
    rawB64: args.rawB64,
    rawMime: args.rawMime,
    supplierHint: args.supplierHint,
    approach: args.approach ?? "default",
    cachedRawText: args.cachedRawText,
    rawText: "",
    headers: [],
    rows: [],
    meta: {},
    startTs: Date.now(),
    diagnostics: [],
    errors: [],
  };
}
