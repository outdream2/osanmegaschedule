// ocr/parseRouter.ts — POST /api/ocr/parse-local · POST /api/ocr/parse-gemini
import { Router } from "express";
import { buildOnnxPipeline, runPipeline, makeInitialContext } from "../../ocr/pipeline";
import { getGeminiKeys, geminiState } from "../../ocr/llm";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/zodValidate";
import { HttpError, badRequest } from "../../middleware/errorHandler";
import { z } from "zod";

const ParseLocalSchema = z.object({
  pages: z.array(z.object({
    page: z.number().int(),
    rawText: z.string().max(100000),
    headers: z.array(z.string()).optional(),
    rows: z.array(z.unknown()).optional(),
    meta: z.unknown().optional(),
    supplierHint: z.string().max(200).optional(),
  })).min(1),
});

const ParseGeminiSchema = z.object({
  pages: z.array(z.object({
    page: z.number().int(),
    rawText: z.string().max(100000),
  })).min(1),
});
import {
  matchVendorSupplier, findVendorInText,
  findOcrTemplate, applyColumnMapping, applyTemplateHeaders, upsertOcrTemplate,
} from "./helpers";

const router = Router();

// 2026-07-22 · 로컬 파싱 · raw OCR 결과 → 로컬 파이프라인 (vendor-match/normalize/verify/totals)
//   입력: { pages: [{page, rawText, headers, rows, meta, supplierHint?}, ...] }
//   출력: { pages: [{page, headers, rows, meta, rawText}, ...] }
router.post("/api/ocr/parse-local", authorize(5), validateBody(ParseLocalSchema), asyncHandler(async (req, res) => {
  const reqStart = Date.now();
  const { buildPostParsePipeline } = await import("../../ocr/pipeline");
  const { pages } = req.body as {
    pages: Array<{
      page: number; rawText: string;
      headers?: string[]; rows?: any[][]; meta?: any;
      supplierHint?: string;
    }>
  };
  if (!Array.isArray(pages) || pages.length === 0) {
    throw badRequest("pages 배열이 비어있음");
  }
  console.log(`\n╔══ [parse-local] 요청 · ${pages.length} 페이지 ══`);
  pages.forEach(pg => console.log(`║ page ${pg.page}: rawText=${(pg.rawText ?? "").length}자 · rawHeaders=${(pg.headers ?? []).length}개 · rawRows=${(pg.rows ?? []).length}개 · hint="${pg.supplierHint ?? "-"}"`));

  const pipeline = buildPostParsePipeline({
    matchVendorSupplier, findVendorInText, findOcrTemplate,
    applyColumnMapping, applyTemplateHeaders, upsertOcrTemplate,
  });
  const out: any[] = [];
  const summaries: Array<{ page: number; rows: number; supplier: string; total: any; timeMs: number }> = [];

  for (const pg of pages) {
    const pgStart = Date.now();
    const ctx = makeInitialContext({
      page: pg.page,
      rawB64: "",
      rawMime: "image/jpeg",
      supplierHint: (pg.supplierHint ?? "").trim() || undefined,
      approach: "default",
    });
    ctx.rawText = pg.rawText ?? "";
    ctx.headers = Array.isArray(pg.headers) ? pg.headers : [];
    ctx.rows = Array.isArray(pg.rows) ? pg.rows : [];
    ctx.meta = pg.meta ?? {};
    ctx.raw = {
      headers: ctx.headers.slice(),
      rows: ctx.rows.map(r => r.slice()),
      meta: { ...ctx.meta },
      rawText: ctx.rawText,
    };
    await runPipeline(pipeline, ctx, { page: pg.page });
    if (!ctx.headers || ctx.headers.length === 0) {
      ctx.headers = ["품명", "규격", "수량", "단가", "금액", "유통기한", "비고"];
    }
    if (!ctx.rows || ctx.rows.length === 0) {
      ctx.rows = [new Array(ctx.headers.length).fill(null)];
    }
    const pageTime = Date.now() - pgStart;
    summaries.push({
      page: pg.page, rows: ctx.rows.length,
      supplier: String(ctx.meta?.supplier ?? "미상"),
      total: ctx.meta?.total ?? null, timeMs: pageTime,
    });
    out.push({
      page: ctx.page, headers: ctx.headers, rows: ctx.rows, meta: ctx.meta,
      rawText: pg.rawText, _localParsed: true,
    });
    console.log(`║ ✓ page ${pg.page}: ${pageTime}ms · ${ctx.rows.length}행 · supplier="${summaries[summaries.length - 1].supplier}"`);
  }
  console.log(`╚══ [parse-local] 완료 · 총 ${Date.now() - reqStart}ms\n`);
  res.json({ pages: out, _diag: { totalTimeMs: Date.now() - reqStart, summaries } });
}));

// 2026-07-22 · Gemini 텍스트 파싱 · rawText → Gemini → 표준 거래명세서 JSON
//   입력: { pages: [{page, rawText}, ...] }
//   출력: { pages: [{page, headers, rows, meta, rawText}, ...] }
router.post("/api/ocr/parse-gemini", authorize(5), validateBody(ParseGeminiSchema), asyncHandler(async (req, res) => {
  const reqStart = Date.now();
  const { callGeminiTextParse } = await import("../../ocr/geminiTextParse");
  const { getGeminiKeys: _gk, geminiState: _gs, parseGeminiText } = await import("../../ocr/gemini");
  void parseGeminiText; // silence unused
  const { pages } = req.body as { pages: Array<{ page: number; rawText: string }> };
  if (!Array.isArray(pages) || pages.length === 0) {
    throw badRequest("pages 배열이 비어있음");
  }
  const keys = getGeminiKeys();
  console.log(`\n╔══ [parse-gemini] 요청 · ${pages.length} 페이지 · 키 ${keys.length}개 ══`);
  pages.forEach(pg => console.log(`║ page ${pg.page}: rawText=${(pg.rawText ?? "").length}자`));
  if (keys.length === 0) {
    console.error(`║ ✗ Gemini API 키 없음 (.env 의 GEMINI_API_KEY 확인)`);
    console.log(`╚══════════════════════\n`);
    throw new HttpError(500, "Gemini API 키 없음 · .env 의 GEMINI_API_KEY 확인");
  }
  const out: any[] = [];
  const summaries: Array<{ page: number; status: string; rows: number; supplier: string; total: any; timeMs: number; error?: string }> = [];

  for (const pg of pages) {
    const pgStart = Date.now();
    let outPage: any = { page: pg.page, headers: [], rows: [], meta: {}, rawText: pg.rawText };
    let status = "ok";
    let errMsg: string | undefined;
    const localKeyIdx = geminiState.currentKeyIdx % Math.max(1, keys.length);

    for (let attempt = 0; attempt < keys.length; attempt++) {
      const kidx = (localKeyIdx + attempt) % keys.length;
      const key = keys[kidx];
      try {
        const result = await callGeminiTextParse(pg.rawText, key);
        if (result.ok) {
          let parsed: any = {};
          try { parsed = JSON.parse(result.text); } catch { /* 파싱 실패 시 빈 객체 */ }
          if (Array.isArray(parsed.headers) && Array.isArray(parsed.rows)) {
            outPage = { ...outPage, headers: parsed.headers, rows: parsed.rows, meta: parsed.meta ?? {} };
            status = "ok";
            errMsg = undefined;
            break;
          }
          status = "empty";
          errMsg = "Gemini 응답 비어있음";
        } else {
          status = "error";
          const failResult = result as { ok: false; quota: boolean; error: string };
          errMsg = failResult.error;
          if (failResult.quota) {
            console.warn(`[parse-gemini] key[${kidx}] 할당량 초과 · 다음 키 시도`);
            continue;
          }
          break;
        }
      } catch (e: any) {
        status = "error";
        errMsg = e?.message ?? "unknown";
        if (/quota|rate.?limit|429/i.test(String(errMsg))) {
          console.warn(`[parse-gemini] key[${kidx}] 할당량 초과 · 다음 키 시도`);
          continue;
        }
        break;
      }
    }
    if (!outPage.headers?.length) outPage.headers = ["품명", "규격", "수량", "단가", "금액", "유통기한", "비고"];
    if (!outPage.rows?.length) outPage.rows = [new Array(outPage.headers.length).fill(null)];
    summaries.push({
      page: pg.page, status, rows: outPage.rows.length,
      supplier: String(outPage.meta?.supplier ?? "미상"),
      total: outPage.meta?.total ?? null,
      timeMs: Date.now() - pgStart, error: errMsg,
    });
    out.push(outPage);
  }
  console.log(`╠══ [parse-gemini] 완료 · 총 ${Date.now() - reqStart}ms ══`);
  summaries.forEach(s => console.log(`║ p${s.page}: ${s.status} · ${s.rows}행 · ${s.supplier} · ${s.total ?? "?"}${s.error ? ` · ERR=${s.error}` : ""}`));
  console.log(`╚══════════════════════\n`);
  res.json({ pages: out, _diag: { totalTimeMs: Date.now() - reqStart, summaries } });
}));

export default router;
