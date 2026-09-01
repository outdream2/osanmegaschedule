// ocr/coreRouter.ts — POST /api/ocr (Gemini·ONNX·스트리밍 · 원본 유지)
// ⚠ Gemini 코드·SSE 스트리밍·sessionDeadKeys — 절대 수정 금지
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { ocrConfig } from "../../config/ocrConfig";
import { computeFieldMatchSummary, logFieldMatchSummary } from "../../ocr/fieldMatchLog";
import {
  cleanCellValues, mergeAdjacentHeaders, normalizeInvoiceCols, extractSpecFromName,
  repairColumnShift, fixAmountsBySubtotal, crossValidateIntraPage, sanitizeOcrMeta,
  filterCodeOnlyRows, filterMetadataBleedRows, validateCellTypes,
  detectSuspiciousEqualPriceAmount, extractCommonMetadataLines,
} from "../../ocr/parse";
import { buildOnnxPipeline, runPipeline, makeInitialContext } from "../../ocr/pipeline";
import { callGeminiOcr, callMistralOcr, getGeminiKeys, getMistralKeys, geminiState, extractSupplierFromImage } from "../../ocr/llm";
import { preprocessImageForOcr, preprocessHighContrast } from "../../ocr/preprocess";
import type { GeminiResult } from "../../ocr/schema";
import {
  matchVendorSupplier, findVendorInText, findOcrTemplate,
  applyColumnMapping, applyTemplateHeaders, upsertOcrTemplate,
  buildTemplatePrompt, addToRawCache, getRawCacheTexts,
} from "./helpers";

const router = Router();

// Gemini 키 중 이번 서버 세션에서 영구 제외된 키 (할당량 초과 or 인증 실패)
const sessionDeadKeys = new Set<string>();

router.post("/api/ocr", async (req, res) => {
  const { images, engine: reqEngine = "gemini" } = req.body ?? {};
  const parseMode: "auto" | "raw" = req.body?.parseMode === "raw" ? "raw" : "auto";
  const rawApproach = String(req.query.approach ?? "default");
  const approach = (["default", "rearrange", "high-contrast", "gemini"].includes(rawApproach)
    ? rawApproach
    : "default") as "default" | "rearrange" | "high-contrast" | "gemini";
  const engine = (approach === "gemini" ? "gemini" : (reqEngine as string));
  const cachedRawTexts: string[] = Array.isArray(req.body?.cachedRawTexts) ? req.body.cachedRawTexts : [];
  const supplierHints: string[] = Array.isArray(req.body?.supplierHints) ? req.body.supplierHints : [];
  const keysAtStart = getGeminiKeys();
  let reqLocalKeyIdx = keysAtStart.length > 0 ? geminiState.currentKeyIdx % keysAtStart.length : 0;
  const templateMap = new Map<string, string[]>();
  const uniqueHints = [...new Set(supplierHints.filter(Boolean))];
  if (uniqueHints.length > 0) {
    const { data: tmpls } = await supabase.from("ocr_templates").select("supplier_name, headers").in("supplier_name", uniqueHints);
    (tmpls ?? []).forEach((t: any) => templateMap.set(t.supplier_name, t.headers));
  }

  // ── SSE 스트리밍 모드 (2026-07-19) ────────────────────────────────────────
  const streamMode = req.query.stream === "1" || req.query.stream === "true";
  let sseKeepAlive: NodeJS.Timeout | null = null;
  const totalPagesReq = Array.isArray(images) ? images.length : 0;
  if (streamMode) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Content-Encoding", "identity");
    (res as any).flushHeaders?.();
    sseKeepAlive = setInterval(() => {
      try { res.write(`: ping ${Date.now()}\n\n`); } catch { /* ignore */ }
    }, 20000);
    req.on("close", () => {
      if (sseKeepAlive) { clearInterval(sseKeepAlive); sseKeepAlive = null; }
    });
  }
  const sseWrite = (event: string, data: any) => {
    if (!streamMode) return;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e: any) {
      console.warn(`[OCR/SSE] write 실패 (${event}):`, e?.message);
    }
  };
  const sseEnd = () => {
    if (!streamMode) return;
    if (sseKeepAlive) { clearInterval(sseKeepAlive); sseKeepAlive = null; }
    try { res.end(); } catch { /* ignore */ }
  };
  const sendJson = (status: number, payload: any): any => {
    if (streamMode) {
      if (status >= 400) sseWrite("error", payload);
      else sseWrite("done", payload);
      sseEnd();
      return;
    }
    return res.status(status).json(payload);
  };

  if (!Array.isArray(images) || images.length === 0)
    return sendJson(400, { error: "images 배열이 필요합니다." });
  if (engine === "gemini" && getGeminiKeys().length === 0 && getMistralKeys().length === 0)
    return sendJson(400, { error: "GEMINI_API_KEY 또는 MISTRAL_API_KEY가 설정되지 않았습니다. .env에 추가하세요." });

  if (streamMode) sseWrite("start", { total: totalPagesReq, engine });

  console.log(`[OCR] 요청 엔진: ${engine}`);

  // AI 파이프라인용 raw 데이터 로그 저장 (진단용)
  const saveLocalOcrLog = async (engineName: "onnx", pageDiagnostics: any[]) => {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const logsDir = path.join(process.cwd(), "logs");
      await fs.mkdir(logsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const payload = JSON.stringify({
        ts: new Date().toISOString(),
        engine: engineName,
        pageCount: pageDiagnostics.length,
        diagnostics: pageDiagnostics,
      }, null, 2);

      const compareLines: string[] = [];
      const dt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      const engineLabel = "🤖 AI 모델 (ONNX)";
      compareLines.push(`════════════════════════════════════════════════════════════════════════════════`);
      compareLines.push(`  OCR ↔ 1차보정테이블 비교 · ${engineLabel} · ${dt}`);
      compareLines.push(`════════════════════════════════════════════════════════════════════════════════`);

      for (const d of pageDiagnostics) {
        compareLines.push(``);
        compareLines.push(`─── 페이지 ${d.page} (${(d.timeMs / 1000).toFixed(2)}초) ──────────────────────────────────`);
        const rawKey = "rawFromOnnx";
        const rawInfo = d[rawKey] ?? {};
        const finalInfo = d.final ?? {};
        compareLines.push(``);
        compareLines.push(`로 : ${JSON.stringify(rawInfo.headers ?? [])}`);
        compareLines.push(`[1차보정 헤더]  : ${JSON.stringify(finalInfo.headers ?? [])}`);
        compareLines.push(`[원본 행 수]    : ${rawInfo.rowCount ?? 0}`);
        compareLines.push(`[1차보정 행 수] : ${finalInfo.rowCount ?? 0}`);
        const m = finalInfo.meta ?? {};
        compareLines.push(`[공급자]         : ${m.supplier ?? "-"}`);
        compareLines.push(`[일자]           : ${m.date ?? "-"}`);
        compareLines.push(`[소계]           : ${m.subtotal?.toLocaleString() ?? "-"}`);
        compareLines.push(`[공급가액]      : ${m.supplyAmount?.toLocaleString() ?? "-"}`);
        compareLines.push(`[세액/부가세]   : ${m.vat?.toLocaleString() ?? "-"}`);
        compareLines.push(`[합계/총합계]   : ${m.total?.toLocaleString() ?? "-"}`);
        if (m.balancePrev != null) compareLines.push(`[전잔액]        : ${m.balancePrev.toLocaleString()}`);
        if (m.balanceAfter != null) compareLines.push(`[누적잔액]      : ${m.balanceAfter.toLocaleString()}`);
        compareLines.push(``);
        compareLines.push(`  ┌─ 원본 OCR 행 (상위 5개) ─────────────────────────────────────────`);
        for (let i = 0; i < (rawInfo.rowsPreview ?? []).length; i++) {
          const row = rawInfo.rowsPreview[i];
          const preview = row.map((c: any) => c == null ? "-" : String(c).slice(0, 25)).join(" | ");
          compareLines.push(`  │ #${i + 1}: ${preview}`);
        }
        compareLines.push(`  └─────────────────────────────────────────────────────────────────`);
        compareLines.push(``);
        compareLines.push(`  ┌─ 1차보정 행 (상위 5개) ──────────────────────────────────────────`);
        for (let i = 0; i < (finalInfo.rowsPreview ?? []).length; i++) {
          const row = finalInfo.rowsPreview[i];
          const preview = row.map((c: any) => c == null ? "-" : String(c).slice(0, 25)).join(" | ");
          compareLines.push(`  │ #${i + 1}: ${preview}`);
        }
        compareLines.push(`  └─────────────────────────────────────────────────────────────────`);
        const susp = d.suspiciousEqualPriceAmount ?? [];
        if (susp.length > 0) {
          compareLines.push(``);
          compareLines.push(`  ⚠️  단가=금액 의심 행 ${susp.length}개 (페이지 통계 벗어남 · 보정 X · 진단만)`);
          susp.slice(0, 10).forEach((s: any) => {
            compareLines.push(`     · 행#${s.rowIdx}: ${s.reason}`);
          });
        }
        if (rawInfo.rawTextPreview) {
          compareLines.push(``);
          compareLines.push(`[Raw Text (500자 미리보기)]`);
          compareLines.push(String(rawInfo.rawTextPreview).slice(0, 500));
        }
      }
      compareLines.push(``);
      compareLines.push(`════════════════════════════════════════════════════════════════════════════════`);
      compareLines.push(`  다음: RawOcrTable 에서 매칭 → logs/ocr-match-summary.txt 확인`);
      compareLines.push(`════════════════════════════════════════════════════════════════════════════════`);
      const compareText = compareLines.join("\n");

      await Promise.all([
        fs.writeFile(path.join(logsDir, "ocr-last.json"), payload),
        fs.writeFile(path.join(logsDir, `ocr-${engineName}-last.json`), payload),
        fs.writeFile(path.join(logsDir, `ocr-${timestamp}.json`), payload),
        fs.writeFile(path.join(logsDir, `ocr-compare-${engineName}-last.txt`), compareText),
      ]);
      console.log("\n" + compareText + "\n");
      const files = (await fs.readdir(logsDir)).filter(f => /^ocr-\d/.test(f)).sort();
      while (files.length > 30) {
        const f = files.shift();
        if (f) await fs.unlink(path.join(logsDir, f)).catch(() => { });
      }
    } catch (e: any) {
      console.warn(`[OCR/${engineName}] 로그 저장 실패 (무시):`, e?.message);
    }
  };

  // ── ONNX (PP-OCRv5 한국어) ───────────────────────────────────────────────
  if (engine === "onnx" || approach === "rearrange") {
    try {
      const pages: any[] = [];
      const diagnostics: any[] = [];
      const imgs = images as { data: string; mimeType: string }[];

      const { buildRawOnnxPipeline } = await import("../../ocr/pipeline");
      const pipeline = parseMode === "raw"
        ? buildRawOnnxPipeline()
        : buildOnnxPipeline({
            matchVendorSupplier,
            findVendorInText,
            findOcrTemplate,
            applyColumnMapping,
            applyTemplateHeaders,
            upsertOcrTemplate,
          });
      console.log(`[OCR/ONNX] parseMode=${parseMode} · ${parseMode === "raw" ? "추출만 (파싱 스킵)" : "전체 파이프라인"}`);

      for (let i = 0; i < imgs.length; i++) {
        const startTs = Date.now();
        const { data: rawB64, mimeType: rawMime } = imgs[i];
        console.log(`[OCR/ONNX] page ${i + 1}/${imgs.length}`);
        try {
          const ctx = makeInitialContext({
            page: i + 1,
            rawB64,
            rawMime,
            supplierHint: (supplierHints[i] ?? "").trim() || undefined,
            approach,
            cachedRawText: cachedRawTexts[i],
          });
          await runPipeline(pipeline, ctx, { page: i + 1 });
          if (!ctx.headers || ctx.headers.length === 0) {
            let recovered = false;
            const sup = String(ctx.meta?.supplier ?? "").trim();
            if (sup) {
              try {
                const tmpl = await supabase.from("ocr_templates")
                  .select("supplier_name, headers").ilike("supplier_name", `%${sup.replace(/[()\s(주)㈜]/g, "")}%`).limit(1);
                const arr = tmpl.data?.[0]?.headers;
                if (Array.isArray(arr) && arr.length > 0) {
                  ctx.headers = arr;
                  recovered = true;
                  console.log(`[safety-net/headers] page ${ctx.page}: 공급사 "${sup}" ocr_templates 에서 헤더 ${arr.length}개 복원`);
                }
              } catch (e: any) {
                console.warn(`[safety-net/headers] ocr_templates 조회 실패:`, e?.message);
              }
            }
            if (!recovered) {
              ctx.headers = ["품명", "규격", "수량", "단가", "금액", "유통기한", "비고"];
              console.warn(`[safety-net/headers] page ${ctx.page}: 헤더 비어있음 → 표준 헤더 강제 주입 (공급사="${sup || "미상"}", 템플릿 없음)`);
            }
          }
          if (!ctx.rows || ctx.rows.length === 0) {
            const firstLine = (ctx.rawText ?? "")
              .split(/\r?\n/)
              .find(ln => /[가-힣]{3,}/.test(ln));
            const emptyRow = new Array(ctx.headers.length).fill(null);
            if (firstLine) {
              const nameIdx = ctx.headers.indexOf("품명");
              if (nameIdx >= 0) emptyRow[nameIdx] = firstLine.trim().slice(0, 40);
            }
            ctx.rows = [emptyRow];
            console.warn(`[safety-net/rows] page ${ctx.page}: rows 비어있음 → 폴백 1행 생성 (품명="${emptyRow[0] ?? ""}")`);
          }
          try {
            const summary = computeFieldMatchSummary(ctx.page, ctx.headers, ctx.rows, ctx.meta);
            logFieldMatchSummary(summary);
          } catch (e: any) {
            console.warn(`[fieldMatch/page ${ctx.page}] 요약 실패:`, e?.message);
          }
          const rawTextCap = ocrConfig.rawCacheTextCap;
          const rawTextPreviewLen = ocrConfig.logRawTextPreviewLength;
          const rowsPreviewCount = ocrConfig.logRowsPreviewCount;
          const includeStages = ocrConfig.logStageDiagnostics;
          const onnxPageData = {
            page: ctx.page,
            headers: ctx.headers,
            rows: ctx.rows,
            meta: ctx.meta,
            rawText: Number.isFinite(rawTextCap) ? (ctx.rawText ?? "").slice(0, rawTextCap) : ctx.rawText,
            supplierHintUsed: ctx.template?.supplier ?? ctx.supplierHint,
            rawOcrHeaders: ctx.rawOcrHeaders ?? [],
            rawOcrSample: ctx.rawOcrSample ?? [],
          };
          pages.push(onnxPageData);
          sseWrite("page", { index: i, total: imgs.length, page: onnxPageData });
          diagnostics.push({
            page: ctx.page,
            timeMs: Date.now() - startTs,
            rawFromOnnx: {
              headers: ctx.raw?.headers ?? [],
              rowCount: (ctx.raw?.rows ?? []).length,
              rowsPreview: (ctx.raw?.rows ?? []).slice(0, rowsPreviewCount),
              meta: ctx.raw?.meta ?? {},
              rawTextPreview: (ctx.raw?.rawText ?? "").slice(0, rawTextPreviewLen),
            },
            final: { headers: ctx.headers, rowCount: ctx.rows.length, meta: ctx.meta, rowsPreview: ctx.rows.slice(0, rowsPreviewCount) },
            stages: includeStages ? ctx.diagnostics : [],
            errors: ctx.errors,
            suspiciousEqualPriceAmount: detectSuspiciousEqualPriceAmount(ctx.headers, ctx.rows),
          });
          ctx.raw = undefined;
          ctx.rawB64 = "";
        } catch (pageErr: any) {
          console.error(`[OCR/ONNX] page ${i + 1} 처리 실패 · 빈 페이지로 대체:`, pageErr?.message);
          console.error(`  stack:`, pageErr?.stack);
          const errPage = { page: i + 1, headers: ["품명", "규격", "수량", "단가", "금액", "비고"], rows: [], meta: {}, rawText: "", supplierHintUsed: undefined, _error: pageErr?.message };
          pages.push(errPage);
          diagnostics.push({ page: i + 1, timeMs: Date.now() - startTs, error: pageErr?.message });
          sseWrite("page", { index: i, total: imgs.length, page: errPage, error: pageErr?.message });
        }
        if (ocrConfig.forceGcAfterDispose && typeof (global as any).gc === "function") {
          (global as any).gc();
        }
        {
          const mu = process.memoryUsage();
          console.log(`[OCR/mem] page ${i + 1} 완료 · rss=${(mu.rss / 1024 / 1024).toFixed(0)}MB · heap=${(mu.heapUsed / 1024 / 1024).toFixed(0)}MB`);
        }
      }
      const currentRawTexts = pages.map(p => p.rawText ?? "").filter(t => t.length > 30);
      currentRawTexts.forEach(t => addToRawCache(t));
      const commonPool = [...currentRawTexts, ...getRawCacheTexts().filter(t => !currentRawTexts.includes(t))];
      if (commonPool.length >= 2) {
        const commonLines = extractCommonMetadataLines(commonPool, 0.5);
        if (commonLines.length > 0) {
          console.log(`[OCR/ONNX/commonMeta] 공통 라인 ${commonLines.length}개 검출 (풀 ${commonPool.length}개):`);
          commonLines.slice(0, 10).forEach(c => console.log(`   · "${c}"`));
          for (const p of pages) {
            const beforeCnt = p.rows.length;
            const filtered = filterMetadataBleedRows(p.headers, p.rows, p.meta, commonLines);
            if (filtered.length < beforeCnt) {
              console.log(`[OCR/ONNX/commonMeta] page ${p.page}: 공통라인 기반 ${beforeCnt - filtered.length}행 추가 제거`);
              p.rows = filtered;
            }
          }
        }
      }
      await saveLocalOcrLog("onnx", diagnostics);
      if (streamMode) {
        sseWrite("done", { ok: true, total: pages.length, engine });
        sseEnd();
        return;
      }
      return res.json({ pages, engine });
    } catch (err: any) {
      console.error("[OCR/ONNX] error:", err?.message);
      console.error("[OCR/ONNX] stack:", err?.stack);
      if (streamMode) {
        sseWrite("error", { error: err?.message ?? "ONNX(PP-OCRv5 한국어) 처리 중 오류" });
        sseEnd();
        return;
      }
      return res.status(500).json({ error: err?.message ?? "ONNX(PP-OCRv5 한국어) 처리 중 오류" });
    }
  }

  try {
    const pages: any[] = [];
    const pageTraces: any[] = [];

    if (engine === "gemini") {
      const keys = getGeminiKeys();

      for (let i = 0; i < images.length; i++) {
        const { data: rawB64, mimeType: rawMime } = images[i] as { data: string; mimeType: string };
        const pageStartTs = Date.now();
        const trace: any = {
          page: i + 1,
          startedAt: new Date(pageStartTs).toISOString(),
          originalBytes: Math.round(rawB64.length * 0.75),
          preprocessing: null,
          supplierExtract: null,
          templateApplied: null,
          keyAttempts: [],
          rawTextLength: 0,
          parsePipeline: null,
          totalMs: 0,
        };

        const preT0 = Date.now();
        const { b64, mimeType } = approach === "high-contrast"
          ? await preprocessHighContrast(rawB64)
          : await preprocessImageForOcr(rawB64, rawMime);
        if (approach === "high-contrast") console.log(`[OCR/Gemini] page ${i + 1}: high-contrast 강제 (재추출 approach)`);
        trace.preprocessing = {
          timeMs: Date.now() - preT0,
          originalMime: rawMime,
          processedMime: mimeType,
          processedBytes: Math.round(b64.length * 0.75),
          sizeRatio: Number(((b64.length / rawB64.length) || 1).toFixed(3)),
        };

        let hint = supplierHints[i] ?? "";
        const hintProvided = !!hint;
        if (!hint && keys.length > 0) {
          const extractKey = keys[reqLocalKeyIdx % keys.length];
          if (!sessionDeadKeys.has(extractKey)) {
            const exT0 = Date.now();
            const extracted = await extractSupplierFromImage(b64, mimeType, extractKey);
            trace.supplierExtract = {
              tried: true, timeMs: Date.now() - exT0, result: extracted ?? null,
              keyIdx: reqLocalKeyIdx % keys.length,
            };
            if (extracted) {
              hint = extracted;
              console.log(`[OCR/2pass] page ${i + 1}: 공급처 1차 추출 → "${extracted}"`);
              const cleanedName = extracted.replace(/\(주\)|\(株\)|주식회사|（주）/g, "").trim();
              const { data: tmplData } = await supabase.from("ocr_templates")
                .select("supplier_name, headers").ilike("supplier_name", `%${cleanedName}%`).limit(1);
              if (tmplData?.[0]) templateMap.set(hint, tmplData[0].headers);
            }
          } else {
            trace.supplierExtract = { tried: false, reason: "key dead" };
          }
        } else if (hintProvided) {
          trace.supplierExtract = { tried: false, reason: "hint provided", hint };
        }
        const tmplHeaders = hint ? templateMap.get(hint) : undefined;
        const templatePrompt = tmplHeaders ? buildTemplatePrompt(hint, tmplHeaders) : undefined;
        if (templatePrompt) {
          console.log(`[OCR/Template] page ${i + 1}: 템플릿 "${hint}" 적용`);
          trace.templateApplied = { supplier: hint, headers: tmplHeaders };
        }

        let rawText = "";
        let lastError = "";
        const startIdx = keys.length > 0 ? reqLocalKeyIdx % keys.length : 0;
        console.log(`[OCR/Gemini] page ${i + 1}/${images.length} — 키 ${startIdx + 1}번부터 (총 ${keys.length}개)`);

        for (let k = 0; k < keys.length; k++) {
          const ki = (startIdx + k) % keys.length;
          const apiKey = keys[ki];
          if (sessionDeadKeys.has(apiKey)) {
            trace.keyAttempts.push({ keyIdx: ki, skipped: "dead" });
            continue;
          }
          const attT0 = Date.now();
          const r = await callGeminiOcr(b64, mimeType, apiKey, undefined, templatePrompt);
          const attMs = Date.now() - attT0;
          if (r.ok) {
            rawText = r.text;
            reqLocalKeyIdx = ki;
            geminiState.currentKeyIdx = ki;
            trace.keyAttempts.push({ keyIdx: ki, ok: true, timeMs: attMs, textLen: r.text.length });
            trace.rawTextLength = r.text.length;
            console.log(`[OCR/Gemini] page ${i + 1}: 키 ${ki + 1} 성공 (${attMs}ms)`);
            break;
          }
          const fail = r as Extract<GeminiResult, { ok: false }>;
          lastError = fail.error;
          trace.keyAttempts.push({ keyIdx: ki, ok: false, timeMs: attMs, quota: fail.quota, errorPreview: fail.error.slice(0, 100) });
          if (fail.quota || fail.error.includes("UNAUTHENTICATED") || fail.error.includes("API_KEY_INVALID") || fail.error.includes("not valid")) {
            sessionDeadKeys.add(apiKey);
            reqLocalKeyIdx = (ki + 1) % keys.length;
            console.warn(`[OCR/Gemini] 키 ${ki + 1} 세션 제외 (할당량 초과 또는 인증 실패)`);
          } else {
            reqLocalKeyIdx = (ki + 1) % keys.length;
            console.warn(`[OCR/Gemini] 키 ${ki + 1}/${keys.length} 실패: ${fail.error}`);
          }
        }

        if (!rawText) {
          const mistralKeys = getMistralKeys();
          for (const mKey of mistralKeys) {
            const r = await callMistralOcr(b64, mimeType, mKey, templatePrompt);
            if (r.ok) { rawText = r.text; console.log(`[OCR/Mistral] page ${i + 1}: 성공`); break; }
            console.warn(`[OCR/Mistral] 실패: ${(r as Extract<GeminiResult, { ok: false }>).error}`);
          }
        }

        if (!rawText) {
          const deadCount = keys.filter(k => sessionDeadKeys.has(k)).length;
          const errMsg = deadCount === keys.length
            ? `Gemini 키 ${keys.length}개 모두 할당량 초과 또는 인증 실패. 새 키를 추가하거나 내일 재시도하세요.`
            : `OCR 실패: ${lastError}`;
          if (streamMode) {
            sseWrite("error", { error: errMsg, page: i + 1 });
            sseEnd();
            return;
          }
          return res.status(500).json({ error: errMsg });
        }

        let parsed: any;
        try { parsed = JSON.parse(rawText); }
        catch {
          pages.push({ page: i + 1, headers: ["원문 응답"], rows: [[rawText]], meta: {}, rawText });
          continue;
        }

        let pageData: any;
        try {
          const rawHeadersOrig = Array.isArray(parsed.headers) ? [...parsed.headers] : [];
          const rawRowsCount = Array.isArray(parsed.rows) ? parsed.rows.length : 0;
          const cleaned = cleanCellValues(
            Array.isArray(parsed.headers) ? parsed.headers : [],
            Array.isArray(parsed.rows) ? parsed.rows : [],
          );
          const pre = mergeAdjacentHeaders(cleaned.headers, cleaned.rows);
          const normalized = normalizeInvoiceCols(pre.headers, pre.rows);
          const spec = extractSpecFromName(normalized.headers, normalized.rows);
          const validated = validateCellTypes(spec.headers, spec.rows);
          if (validated.issues.length > 0) console.log(`[OCR/Gemini/validate] page ${i + 1}: ${validated.issues.length}개 셀 보정`);
          const cleanMeta = sanitizeOcrMeta(parsed.meta ?? {});
          const rows0 = fixAmountsBySubtotal(validated.headers, validated.rows, cleanMeta.total ?? null);
          const rows1 = repairColumnShift(validated.headers, rows0);
          const rows2 = crossValidateIntraPage(validated.headers, rows1);
          const rows3 = filterCodeOnlyRows(validated.headers, rows2);
          const beforeMeta = rows3.length;
          const rows = filterMetadataBleedRows(validated.headers, rows3, cleanMeta);
          if (rows.length < beforeMeta) console.log(`[OCR/Gemini] page ${i + 1}: 메타 노이즈 ${beforeMeta - rows.length}행 제거`);
          const suspicious = detectSuspiciousEqualPriceAmount(spec.headers, rows);
          if (suspicious.length > 0) {
            console.log(`[OCR/Gemini/suspicious] page ${i + 1}: ${suspicious.length}개 의심 행 (단가=금액 · 페이지 통계 벗어남)`);
            suspicious.slice(0, 5).forEach(s => console.log(`  · 행#${s.rowIdx}: ${s.reason}`));
          }
          trace.parsePipeline = {
            rawHeadersFromGemini: rawHeadersOrig,
            rawRowsCount,
            afterClean: { headers: cleaned.headers, rowCount: cleaned.rows.length },
            afterMergeHeaders: { headers: pre.headers, rowCount: pre.rows.length },
            afterNormalize: { headers: normalized.headers, rowCount: normalized.rows.length },
            afterSpec: { headers: spec.headers, rowCount: spec.rows.length },
            afterFixAmounts: { rowCount: rows0.length, changed: rows0.length !== spec.rows.length },
            afterRepairShift: { rowCount: rows1.length, changed: JSON.stringify(rows1) !== JSON.stringify(rows0) },
            afterCrossValidate: { rowCount: rows2.length, changed: JSON.stringify(rows2) !== JSON.stringify(rows1) },
            afterFilterCode: { rowCount: rows.length, filtered: rows2.length - rows.length },
            suspiciousEqualPriceAmount: suspicious,
            finalMeta: cleanMeta,
          };
          const aI = spec.headers.indexOf("금액");
          if (aI >= 0 && cleanMeta.total) {
            const finalSum = rows.reduce((s, r) => s + (typeof r[aI] === "number" ? (r[aI] as number) : 0), 0);
            if (Math.abs(finalSum - cleanMeta.total) > 1) {
              console.warn(`[OCR/합계불일치] page ${i + 1} — 합계 ${cleanMeta.total} vs 행합 ${finalSum}`);
            }
          }
          if (hint && !cleanMeta.supplier) cleanMeta.supplier = hint;
          process.stdout.write(`\n[OCR 결과] page ${i + 1}\n  헤더: ${JSON.stringify(spec.headers)}\n  행 수: ${rows.length}\n  메타: ${JSON.stringify(cleanMeta)}\n`);
          try {
            const BAL_KW = /합\s*계\s*액|총\s*합\s*계|합\s*계|잔\s*고|잔\s*액|미\s*수|공\s*급\s*가|매\s*입\s*총\s*계/;
            const hdrHits: string[] = [];
            spec.headers.forEach((h: string, hi: number) => {
              if (BAL_KW.test(String(h ?? ""))) hdrHits.push(`컬럼[${hi}]="${h}"`);
            });
            const rowHits: string[] = [];
            rows.forEach((r: any[], ri: number) => {
              r.forEach((c: any, ci: number) => {
                if (typeof c === "string" && BAL_KW.test(c)) {
                  const near = r.slice(Math.max(0, ci - 1), ci + 3).map(v => JSON.stringify(v)).join(", ");
                  rowHits.push(`행[${ri}][${ci}]="${c}" 인접={${near}}`);
                }
              });
            });
            if (hdrHits.length || rowHits.length) {
              console.log(`[OCR/잔고진단] page ${i + 1} (공급사=${cleanMeta.supplier ?? "-"})`);
              hdrHits.forEach(h => console.log(`  헤더: ${h}`));
              rowHits.forEach(h => console.log(`  ${h}`));
            }
          } catch (_diagErr) { /* ignore */ }
          pageData = { page: i + 1, headers: validated.headers, rows, meta: cleanMeta, rawText, supplierHintUsed: hint || undefined };
        } catch (parseErr: any) {
          console.error(`[OCR/parse-error] page ${i + 1}:`, parseErr?.stack ?? parseErr?.message);
          trace.parseError = String(parseErr?.message ?? parseErr);
          pageData = { page: i + 1, headers: ["원문 응답"], rows: [[rawText]], meta: {}, rawText };
        }
        trace.totalMs = Date.now() - pageStartTs;
        pageTraces.push(trace);
        pages.push(pageData);
        sseWrite("page", { index: i, total: images.length, page: pageData });

        if (pageData?.headers?.length && pageData?.meta?.supplier) {
          void upsertOcrTemplate(pageData.meta.supplier, pageData.headers);
        }
      }
    }

    const diagnostics = pages.map((pg: any) => {
      const H: string[] = pg.headers ?? [];
      const rows: any[][] = pg.rows ?? [];
      const idx = (re: RegExp) => H.findIndex(h => re.test(String(h).replace(/\s+/g, "")));
      const iName = idx(/품명|품목|상품명|제품명/);
      const iSpec = idx(/규격|사양/);
      const iQty = idx(/수량|매수/);
      const iPrice = idx(/단가/);
      const iAmt = idx(/^금액$|공급가액|매출액/);
      const iVat = idx(/세액|부가세/);

      let qtyPriceAmtMismatch = 0;
      let missingName = 0;
      let missingQty = 0;
      let missingPrice = 0;
      let missingAmount = 0;
      let outlierAmount = 0;
      let outlierQty = 0;
      let outlierPrice = 0;
      const rowIssues: Array<any> = [];

      const toNum = (v: any): number => {
        if (typeof v === "number") return v;
        const s = String(v ?? "").replace(/,/g, "").trim();
        if (!s) return 0;
        if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseInt(s.replace(/\./g, ""), 10);
        const n = parseFloat(s);
        return isFinite(n) ? n : 0;
      };

      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        if (!Array.isArray(row)) continue;
        const name = iName >= 0 ? String(row[iName] ?? "").trim() : "";
        const qty = iQty >= 0 ? toNum(row[iQty]) : 0;
        const price = iPrice >= 0 ? toNum(row[iPrice]) : 0;
        const amt = iAmt >= 0 ? toNum(row[iAmt]) : 0;
        const issues: string[] = [];

        if (!name) { missingName++; issues.push("품명 없음"); }
        if (iQty >= 0 && qty === 0) { missingQty++; issues.push("수량 0/없음"); }
        if (iPrice >= 0 && price === 0) { missingPrice++; issues.push("단가 0/없음"); }
        if (iAmt >= 0 && amt === 0) { missingAmount++; issues.push("금액 0/없음"); }

        if (qty > 0 && qty > 100000) { outlierQty++; issues.push(`수량 과대(${qty})`); }
        if (price > 0 && price > 10_000_000) { outlierPrice++; issues.push(`단가 과대(${price})`); }
        if (amt > 0 && amt > 100_000_000) { outlierAmount++; issues.push(`금액 과대(${amt})`); }

        const allCells = row.map((v, ci) => ({ col: ci, header: H[ci] ?? `col${ci}`, value: v }));
        let qtyCandidates: Array<{ col: number; header: string; value: number }> = [];
        if (price > 0 && amt > 0) {
          const targetQty = amt / price;
          qtyCandidates = allCells
            .map(c => ({ ...c, num: toNum(c.value) }))
            .filter(c => c.col !== iQty && c.num > 0 && Math.abs(c.num - targetQty) <= Math.max(1, targetQty * 0.02))
            .map(c => ({ col: c.col, header: c.header, value: c.num }));
        }

        let mismatch = false;
        let expected: number | undefined;
        if (qty > 0 && price > 0 && amt > 0) {
          expected = qty * price;
          const drift = Math.abs(expected - amt) / Math.max(expected, amt);
          if (drift > 0.02) {
            mismatch = true;
            qtyPriceAmtMismatch++;
            issues.push(`수량×단가 불일치: ${qty}×${price}=${expected} vs 금액 ${amt}`);
          }
        }

        if ((mismatch || issues.length > 0) && rowIssues.length < 30) {
          rowIssues.push({ row: ri + 1, product: name, issues: [...issues], qty, price, amount: amt, expected, allCells, qtyCandidates });
        }
      }

      const rowAmountSum = rows.reduce((s, r) => {
        const a = iAmt >= 0 ? (typeof r[iAmt] === "number" ? r[iAmt] : parseFloat(String(r[iAmt] ?? "").replace(/,/g, "")) || 0) : 0;
        return s + a;
      }, 0);
      const statedTotal = Number(pg.meta?.total ?? 0);
      const totalMismatch = statedTotal > 0 && Math.abs(rowAmountSum - statedTotal) > 1;

      return {
        page: pg.page,
        supplier: pg.meta?.supplier ?? null,
        supplierHintUsed: pg.supplierHintUsed ?? null,
        date: pg.meta?.date ?? null,
        headers: H,
        columnMap: { 품명: iName, 규격: iSpec, 수량: iQty, 단가: iPrice, 금액: iAmt, 세액: iVat },
        stats: {
          rowCount: rows.length,
          statedTotal,
          rowAmountSum,
          totalMismatch,
          totalDrift: statedTotal > 0 ? Math.round(((rowAmountSum - statedTotal) / statedTotal) * 10000) / 100 : null,
          qtyPriceAmtMismatch,
          missingName, missingQty, missingPrice, missingAmount,
          outlierQty, outlierPrice, outlierAmount,
        },
        rowIssues,
        rawTextPreview: pg.rawText ? String(pg.rawText).slice(0, 500) : null,
      };
    });

    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const logsDir = path.join(process.cwd(), "logs");
      await fs.mkdir(logsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const diagnosticsMerged = diagnostics.map((d, di) => ({ ...d, trace: pageTraces[di] ?? null }));
      const summary = {
        ts: new Date().toISOString(),
        engine,
        pageCount: pages.length,
        totals: {
          rowsExtracted: diagnostics.reduce((s, d) => s + d.stats.rowCount, 0),
          totalMismatchPages: diagnostics.filter(d => d.stats.totalMismatch).length,
          qtyPriceAmtMismatches: diagnostics.reduce((s, d) => s + d.stats.qtyPriceAmtMismatch, 0),
          missingFieldTotal: diagnostics.reduce((s, d) => s + d.stats.missingName + d.stats.missingQty + d.stats.missingPrice + d.stats.missingAmount, 0),
          totalTimeMs: pageTraces.reduce((s, t) => s + (t.totalMs ?? 0), 0),
          keyRotationCount: pageTraces.reduce((s, t) => s + (t.keyAttempts?.filter((a: any) => a.ok === false).length ?? 0), 0),
        },
        diagnostics: diagnosticsMerged,
      };
      const detailedPayload = JSON.stringify({ ...summary, pages }, null, 2);
      const summaryPayload = JSON.stringify(summary, null, 2);
      await Promise.all([
        fs.writeFile(path.join(logsDir, "ocr-last.json"), detailedPayload),
        fs.writeFile(path.join(logsDir, `ocr-${timestamp}.json`), detailedPayload),
        fs.writeFile(path.join(logsDir, "ocr-last-summary.json"), summaryPayload),
      ]);
      const files = (await fs.readdir(logsDir)).filter(f => /^ocr-\d/.test(f)).sort();
      while (files.length > 20) {
        const f = files.shift();
        if (f) await fs.unlink(path.join(logsDir, f)).catch(() => { });
      }
      console.log(`[OCR/diag] ${pages.length}페이지 처리 완료:
  - 추출 행 수: ${summary.totals.rowsExtracted}
  - 소계 불일치 페이지: ${summary.totals.totalMismatchPages}/${pages.length}
  - 수량×단가≠금액 행: ${summary.totals.qtyPriceAmtMismatches}
  - 필드 누락 총계: ${summary.totals.missingFieldTotal}
  → 자세한 분석: logs/ocr-last-summary.json`);
    } catch (logErr: any) {
      console.warn("[OCR/log-save]", logErr?.message);
    }
    if (streamMode) {
      sseWrite("done", { ok: true, total: pages.length, engine });
      sseEnd();
      return;
    }
    return res.json({ pages, engine });
  } catch (err: any) {
    console.error("[OCR] error:", err?.message);
    console.error("[OCR] stack:", err?.stack);
    if (streamMode) {
      sseWrite("error", { error: err?.message ?? "OCR 처리 중 오류" });
      sseEnd();
      return;
    }
    res.status(500).json({ error: err?.message ?? "OCR 처리 중 오류" });
  }
});

export default router;
