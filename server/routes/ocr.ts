import { Router } from "express";
import { supabase } from "../../src/supabase/client";
import { getProductMap, getSynonymMap, resetSynonymCache, getSupplierAliasMap, resetSupplierAliasCache } from "../productCache";
import { cleanCellValues, mergeAdjacentHeaders, normalizeInvoiceCols, extractSpecFromName, repairColumnShift, fixAmountsBySubtotal, crossValidateIntraPage, sanitizeOcrMeta, filterCodeOnlyRows } from "../ocr/parse";
import { callGeminiOcr, callMistralOcr, getGeminiKeys, getMistralKeys, geminiState, extractSupplierFromImage } from "../ocr/llm";
import { preprocessImageForOcr } from "../ocr/preprocess";
import { ensureOcrServer, callEasyOcrServer } from "../ocr/easyocr";
import { invoiceMatchScore, makeMatchResult, norm, normSupplier, bigramSim } from "../ocr/match";
import type { GeminiResult } from "../ocr/schema";

function buildTemplatePrompt(supplierName: string, headers: string[]): string {
  return `[공급처 템플릿 — 최우선 적용]\n이 명세서는 "${supplierName}" 공급처 양식입니다.\n표의 컬럼 순서를 정확히 다음과 같이 지정합니다:\n${headers.map((h, i) => `  ${i + 1}번 컬럼 → "${h}"`).join("\n")}\n이 매핑 외의 추론·재배열은 절대 하지 마세요.`;
}

const router = Router();

// Gemini 키 중 이번 서버 세션에서 영구 제외된 키 (할당량 초과 or 인증 실패)
const sessionDeadKeys = new Set<string>();

router.get("/api/health", (_req, res) => res.json({ ok: true }));

router.get("/api/ocr-ping", (_req, res) => {
  const keys = getGeminiKeys();
  const mKeys = getMistralKeys();
  res.json({ ok: true, gemini: keys.length > 0, geminiKeyCount: keys.length, mistral: mKeys.length > 0, mistralKeyCount: mKeys.length });
});

router.post("/api/ocr-match", async (req, res) => {
  try {
    const { names } = req.body ?? {};
    const isCandidateMode = typeof req.body?.name === "string" && req.body?.topN;
    if (!isCandidateMode && !Array.isArray(names)) return res.status(400).json({ error: "names 배열 필요" });

    const map = await getProductMap();
    const products = Object.values(map);
    const synonymMap = await getSynonymMap();
    const supplierAliasMap = await getSupplierAliasMap();

    // 공급사 별칭 보정 헬퍼
    const resolveSupplier = (hint: string): string => {
      if (!hint) return hint;
      const aliased = supplierAliasMap.get(normSupplier(hint));
      return aliased ?? hint;
    };

    if (isCandidateMode) {
      const name = req.body.name as string;
      const topN = Math.min(Number(req.body.topN) || 10, 30);
      const rawHint = (req.body.supplier as string | undefined)?.trim() ?? "";
      const supplierHint = resolveSupplier(rawHint);

      const nameLC = name.trim().toLowerCase();
      const synKeyCompound = supplierHint ? `${normSupplier(supplierHint)}|${nameLC}` : null;
      const synCode = (synKeyCompound && synonymMap.get(synKeyCompound)) ?? synonymMap.get(nameLC);
      if (synCode) {
        const sp = map[synCode] ?? products.find(p => p.code === synCode);
        if (sp) return res.json({ candidates: [makeMatchResult(name, sp, 100).matched] });
      }

      const pool = (() => {
        if (!supplierHint) return products;
        const sh = normSupplier(supplierHint);
        const filtered = products.filter(p => {
          if (!p.supplier) return false;
          const sp = norm(String(p.supplier));
          return sp === sh || sp.includes(sh) || sh.includes(sp) || bigramSim(sp, sh) >= 40;
        });
        return filtered.length > 0 ? filtered : products;
      })();

      const scored = pool
        .map(p => ({ p, score: invoiceMatchScore(name, p) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);

      return res.json({
        candidates: scored.map(({ p, score }) => ({
          code: p.code, name: p.name, spec: p.spec, score,
          supplier:    p.supplier    != null ? String(p.supplier)    : null,
          masterPrice: p.purchase_price != null ? Number(p.purchase_price) : null,
          salePrice:   p.sale_price     != null ? Number(p.sale_price)     : null,
          profitRate:  p.profit_rate    != null ? Number(p.profit_rate)    : null,
          expiryDate:  p.expiry_date    != null ? String(p.expiry_date)    : null,
        })),
      });
    }

    const supplierHints: string[] = Array.isArray(req.body?.suppliers) ? req.body.suppliers : [];

    const matches = names.map((name: string, i: number) => {
      if (!name?.trim()) return { input: name, matched: null };

      const supplierHint = resolveSupplier((supplierHints[i] ?? "").trim());
      const nameLC = name.trim().toLowerCase();
      const synKeyCompound = supplierHint ? `${normSupplier(supplierHint)}|${nameLC}` : null;
      const synCode = (synKeyCompound && synonymMap.get(synKeyCompound)) ?? synonymMap.get(nameLC);
      if (synCode) {
        const sp = map[synCode] ?? products.find(p => p.code === synCode);
        if (sp) return makeMatchResult(name, sp, 100);
      }

      const pool = (() => {
        if (!supplierHint) return products;
        const sh = normSupplier(supplierHint);
        const filtered = products.filter(p => {
          if (!p.supplier) return false;
          const sp = norm(String(p.supplier));
          return sp === sh || sp.includes(sh) || sh.includes(sp) || bigramSim(sp, sh) >= 40;
        });
        return filtered.length > 0 ? filtered : products;
      })();

      let best = null as (typeof products)[0] | null;
      let bestScore = 0;
      for (const p of pool) {
        const s = invoiceMatchScore(name, p);
        if (s > bestScore) { bestScore = s; best = p; }
      }
      if (!best || bestScore < 25) {
        console.log(`[MATCH-MISS] score=${bestScore ?? 0} ocr="${name}" best="${best?.name ?? "-"}"`);
        return { input: name, matched: null, score: bestScore };
      }
      if (bestScore < 70) {
        console.log(`[MATCH-LOW] score=${bestScore} ocr="${name}" → db="${best.name}"`);
      }
      return {
        input: name,
        matched: {
          code: best.code,
          name: best.name,
          spec: best.spec,
          score: bestScore,
          masterPrice:  best.purchase_price != null ? Number(best.purchase_price)  : null,
          salePrice:    best.sale_price      != null ? Number(best.sale_price)      : null,
          profitRate:   best.profit_rate     != null ? Number(best.profit_rate)     : null,
          expiryDate:   best.expiry_date     != null ? String(best.expiry_date)     : null,
        },
      };
    });

    res.json({ matches });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/ocr-synonyms", async (_req, res) => {
  try {
    const { data, error } = await supabase.from("ocr_synonyms").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ synonyms: data ?? [] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/ocr-synonyms", async (req, res) => {
  try {
    const { prod_name_old, prod_name_new, supplier_old, supplier_new, product_code } = req.body ?? {};
    if (!prod_name_old?.trim() || !product_code?.trim()) return res.status(400).json({ error: "prod_name_old, product_code 필요" });
    const nameOldNorm     = prod_name_old.trim().toLowerCase();
    const codeNorm        = product_code.trim();
    const supplierNewNorm = supplier_new?.trim() ? normSupplier(supplier_new.trim()) : null;
    const supplierOldNorm = supplier_old?.trim() || null;
    const nameNewVal      = prod_name_new?.trim() || null;

    // prod_name_old 기준 기존 행 조회
    const { data: existing } = await supabase
      .from("ocr_synonyms").select("id").eq("prod_name_old", nameOldNorm).limit(1);
    if (existing?.[0]) {
      const { data, error } = await supabase.from("ocr_synonyms")
        .update({ product_code: codeNorm, supplier_new: supplierNewNorm, prod_name_new: nameNewVal, supplier_old: supplierOldNorm })
        .eq("id", existing[0].id)
        .select().single();
      if (error) throw new Error(error.message);
      resetSynonymCache();
      return res.json({ synonym: data });
    }

    // 새로 삽입
    const { data, error } = await supabase.from("ocr_synonyms")
      .insert({ prod_name_old: nameOldNorm, prod_name_new: nameNewVal, product_code: codeNorm, supplier_new: supplierNewNorm, supplier_old: supplierOldNorm })
      .select().single();
    if (error) throw new Error(error.message);
    resetSynonymCache();
    res.json({ synonym: data });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/api/ocr-synonyms/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { prod_name_old, prod_name_new, product_code, supplier_old, supplier_new } = req.body ?? {};
    if (!prod_name_old?.trim() || !product_code?.trim()) return res.status(400).json({ error: "prod_name_old, product_code 필요" });
    const { data, error } = await supabase.from("ocr_synonyms")
      .update({
        prod_name_old: prod_name_old.trim().toLowerCase(),
        prod_name_new: prod_name_new?.trim() || null,
        product_code: product_code.trim(),
        supplier_new: supplier_new?.trim() ? normSupplier(supplier_new.trim()) : null,
        supplier_old: supplier_old?.trim() || null,
      })
      .eq("id", id).select().single();
    if (error) throw new Error(error.message);
    resetSynonymCache();
    res.json({ synonym: data });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE by prod_name_old (for pre-existing synonyms without a known ID) — must be before /:id
router.delete("/api/ocr-synonyms/by-name", async (req, res) => {
  try {
    const { prod_name_old } = req.body ?? {};
    if (!prod_name_old?.trim()) return res.status(400).json({ error: "prod_name_old 필요" });
    const nameOldNorm = prod_name_old.trim().toLowerCase();
    const { error } = await supabase.from("ocr_synonyms").delete().eq("prod_name_old", nameOldNorm);
    if (error) throw new Error(error.message);
    resetSynonymCache();
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 2차 보정 ✕ 취소: 삭제 대신 cancelled=true 마킹 (재적용 방지 + 관리 가능)
// 마이그레이션(20260705_ocr_synonyms_cancelled.sql)이 적용되어야 정상 동작.
// 미적용 시에는 400 응답 대신 delete로 폴백.
router.post("/api/ocr-synonyms/cancel-by-name", async (req, res) => {
  try {
    const { prod_name_old, product_code } = req.body ?? {};
    if (!prod_name_old?.trim()) return res.status(400).json({ error: "prod_name_old 필요" });
    const nameOldNorm = prod_name_old.trim().toLowerCase();
    // 존재하면 cancelled=true로 업데이트, 없으면 새 레코드 삽입 (cancelled=true)
    const { data: exist, error: findErr } = await supabase
      .from("ocr_synonyms").select("id").eq("prod_name_old", nameOldNorm).limit(1);
    if (findErr) {
      // cancelled 컬럼 미존재 등 스키마 오류 시 delete로 폴백
      await supabase.from("ocr_synonyms").delete().eq("prod_name_old", nameOldNorm);
      resetSynonymCache();
      return res.json({ ok: true, fallback: "delete" });
    }
    if (exist && exist.length > 0) {
      const { error } = await supabase.from("ocr_synonyms")
        .update({ cancelled: true, cancelled_at: new Date().toISOString() })
        .eq("id", exist[0].id);
      if (error) {
        await supabase.from("ocr_synonyms").delete().eq("prod_name_old", nameOldNorm);
        resetSynonymCache();
        return res.json({ ok: true, fallback: "delete" });
      }
    } else {
      const codeToUse = String(product_code ?? "").trim() || "__cancelled__";
      const { error } = await supabase.from("ocr_synonyms").insert([{
        prod_name_old: nameOldNorm,
        product_code: codeToUse,
        cancelled: true,
        cancelled_at: new Date().toISOString(),
      }]);
      if (error) {
        // 마이그레이션 미적용 시 조용히 성공 처리 (기록 실패해도 UX는 유지)
        resetSynonymCache();
        return res.json({ ok: true, fallback: "insert_failed" });
      }
    }
    resetSynonymCache();
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 취소 항목 복원 (cancelled=false)
router.post("/api/ocr-synonyms/restore/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { error } = await supabase.from("ocr_synonyms")
      .update({ cancelled: false, cancelled_at: null }).eq("id", id);
    if (error) throw new Error(error.message);
    resetSynonymCache();
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/api/ocr-synonyms/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("ocr_synonyms").delete().eq("id", Number(req.params.id));
    if (error) throw new Error(error.message);
    resetSynonymCache();
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── 공급사 별칭 CRUD ──────────────────────────────────────────────────────────
router.get("/api/ocr-supplier-aliases", async (_req, res) => {
  try {
    const { data, error } = await supabase.from("ocr_supplier_aliases").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ aliases: data ?? [] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/ocr-supplier-aliases", async (req, res) => {
  try {
    const { alias, supplier_name } = req.body ?? {};
    if (!alias?.trim() || !supplier_name?.trim()) return res.status(400).json({ error: "alias, supplier_name 필요" });
    const aliasNorm = alias.trim();
    const nameNorm  = supplier_name.trim();

    const { data: existing } = await supabase
      .from("ocr_supplier_aliases").select("id").eq("alias", aliasNorm).limit(1);
    let result;
    if (existing?.[0]) {
      const { data, error } = await supabase.from("ocr_supplier_aliases")
        .update({ supplier_name: nameNorm })
        .eq("id", existing[0].id).select().single();
      if (error) throw new Error(error.message);
      result = data;
    } else {
      const { data, error } = await supabase.from("ocr_supplier_aliases")
        .insert({ alias: aliasNorm, supplier_name: nameNorm }).select().single();
      if (error) throw new Error(error.message);
      result = data;
    }
    resetSupplierAliasCache();
    res.json({ alias: result });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/api/ocr-supplier-aliases/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { alias, supplier_name } = req.body ?? {};
    if (!alias?.trim() || !supplier_name?.trim()) return res.status(400).json({ error: "alias, supplier_name 필요" });
    const { data, error } = await supabase.from("ocr_supplier_aliases")
      .update({ alias: alias.trim(), supplier_name: supplier_name.trim() })
      .eq("id", id).select().single();
    if (error) throw new Error(error.message);
    resetSupplierAliasCache();
    res.json({ alias: data });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/api/ocr-supplier-aliases/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("ocr_supplier_aliases").delete().eq("id", Number(req.params.id));
    if (error) throw new Error(error.message);
    resetSupplierAliasCache();
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/api/ocr-templates", async (_req, res) => {
  try {
    const { data, error } = await supabase.from("ocr_templates").select("*").order("supplier_name");
    if (error) throw new Error(error.message);
    res.json({ templates: data ?? [] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/ocr-templates", async (req, res) => {
  try {
    const { supplier_name, headers } = req.body ?? {};
    if (!supplier_name?.trim() || !Array.isArray(headers)) return res.status(400).json({ error: "supplier_name, headers 필요" });
    const { data, error } = await supabase.from("ocr_templates")
      .upsert({ supplier_name: supplier_name.trim(), headers, updated_at: new Date().toISOString() }, { onConflict: "supplier_name" })
      .select().single();
    if (error) throw new Error(error.message);
    res.json({ template: data });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/api/ocr-templates/:supplier_name", async (req, res) => {
  try {
    const { error } = await supabase.from("ocr_templates").delete().eq("supplier_name", req.params.supplier_name);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/ocr", async (req, res) => {
  const { images, engine: reqEngine = "gemini" } = req.body ?? {};
  const engine = reqEngine as string;
  const supplierHints: string[] = Array.isArray(req.body?.supplierHints) ? req.body.supplierHints : [];
  // 요청 스코프 로컬 키 인덱스 — 동시 요청 간 race 방지
  // 시작값만 전역 geminiState에서 읽고, 이후는 로컬에서만 관리
  const keysAtStart = getGeminiKeys();
  let reqLocalKeyIdx = keysAtStart.length > 0 ? geminiState.currentKeyIdx % keysAtStart.length : 0;
  const templateMap = new Map<string, string[]>();
  const uniqueHints = [...new Set(supplierHints.filter(Boolean))];
  if (uniqueHints.length > 0) {
    const { data: tmpls } = await supabase.from("ocr_templates").select("supplier_name, headers").in("supplier_name", uniqueHints);
    (tmpls ?? []).forEach((t: any) => templateMap.set(t.supplier_name, t.headers));
  }

  if (!Array.isArray(images) || images.length === 0)
    return res.status(400).json({ error: "images 배열이 필요합니다." });
  if (engine === "gemini" && getGeminiKeys().length === 0 && getMistralKeys().length === 0)
    return res.status(400).json({ error: "GEMINI_API_KEY 또는 MISTRAL_API_KEY가 설정되지 않았습니다. .env에 추가하세요." });

  if (engine === "paddle") {
    try {
      await ensureOcrServer();
      const pages = await Promise.all(
        (images as { data: string; mimeType: string }[]).map(async ({ data: b64, mimeType }, i) => {
          console.log(`[OCR/EasyOCR] page ${i + 1}/${images.length}`);
          const raw = await callEasyOcrServer(b64, mimeType);
          const cleaned = cleanCellValues(raw.headers ?? [], raw.rows ?? []);
          const pre  = mergeAdjacentHeaders(cleaned.headers, cleaned.rows);
          const normalized = normalizeInvoiceCols(pre.headers, pre.rows);
          const spec = extractSpecFromName(normalized.headers, normalized.rows);
          const cleanMeta = sanitizeOcrMeta(raw.meta ?? {});
          const rows0 = fixAmountsBySubtotal(spec.headers, spec.rows, cleanMeta.total ?? null);
          const rows1 = repairColumnShift(spec.headers, rows0);
          const rows2 = crossValidateIntraPage(spec.headers, rows1);
          const rows  = filterCodeOnlyRows(spec.headers, rows2);
          console.log(`[OCR/EasyOCR] page ${i + 1}: 헤더=${JSON.stringify(spec.headers)}, 행=${rows.length}`);
          return { page: i + 1, headers: spec.headers, rows, meta: cleanMeta, rawText: raw.rawText ?? "" };
        })
      );
      return res.json({ pages, engine });
    } catch (err: any) {
      console.error("[OCR/EasyOCR] error:", err?.message);
      return res.status(500).json({ error: err?.message ?? "EasyOCR 처리 중 오류" });
    }
  }

  try {
    const pages: any[] = [];
    // 페이지별 상세 처리 트레이스 (진단 로그용)
    const pageTraces: any[] = [];

    if (engine === "gemini") {
      const keys = getGeminiKeys();

      for (let i = 0; i < images.length; i++) {
        const { data: rawB64, mimeType: rawMime } = images[i] as { data: string; mimeType: string };
        const pageStartTs = Date.now();
        const trace: any = {
          page: i + 1,
          startedAt: new Date(pageStartTs).toISOString(),
          originalBytes: Math.round(rawB64.length * 0.75),  // base64 → byte 근사
          preprocessing: null,
          supplierExtract: null,
          templateApplied: null,
          keyAttempts: [],
          rawTextLength: 0,
          parsePipeline: null,
          totalMs: 0,
        };

        // 이미지 전처리: 업스케일 + 도장 제거 + 그레이스케일 정규화
        const preT0 = Date.now();
        const { b64, mimeType } = await preprocessImageForOcr(rawB64, rawMime);
        trace.preprocessing = {
          timeMs: Date.now() - preT0,
          originalMime: rawMime,
          processedMime: mimeType,
          processedBytes: Math.round(b64.length * 0.75),
          sizeRatio: Number(((b64.length / rawB64.length) || 1).toFixed(3)),
        };

        // 공급처 힌트가 없으면 1차 경량 추출 → 템플릿 조회
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
              // 추출된 공급처로 템플릿 조회
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

        // ── Gemini (sticky key, 세션 내 dead key 제외 · 요청 로컬 인덱스) ──
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

        // ── 3순위: Mistral fallback ──────────────────────────────────────────
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
            Array.isArray(parsed.rows)    ? parsed.rows    : [],
          );
          const pre        = mergeAdjacentHeaders(cleaned.headers, cleaned.rows);
          const normalized = normalizeInvoiceCols(pre.headers, pre.rows);
          const spec       = extractSpecFromName(normalized.headers, normalized.rows);
          const cleanMeta  = sanitizeOcrMeta(parsed.meta ?? {});
          const rows0 = fixAmountsBySubtotal(spec.headers, spec.rows, cleanMeta.total ?? null);
          const rows1 = repairColumnShift(spec.headers, rows0);
          const rows2 = crossValidateIntraPage(spec.headers, rows1);
          const rows  = filterCodeOnlyRows(spec.headers, rows2);

          // 파이프라인 각 단계 추적
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
          // 잔고 후보 진단 로그 — "합계액/총합계/잔고" 등 키워드 발견 시 어디에 있는지 표시
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
          pageData = { page: i + 1, headers: spec.headers, rows, meta: cleanMeta, rawText, supplierHintUsed: hint || undefined };
        } catch (parseErr: any) {
          console.error(`[OCR/parse-error] page ${i + 1}:`, parseErr?.stack ?? parseErr?.message);
          trace.parseError = String(parseErr?.message ?? parseErr);
          pageData = { page: i + 1, headers: ["원문 응답"], rows: [[rawText]], meta: {}, rawText };
        }
        trace.totalMs = Date.now() - pageStartTs;
        pageTraces.push(trace);
        pages.push(pageData);
      }
    }

    // ── 상세 진단 로그: 페이지별·행별 품질 지표 계산 ─────────────────────────
    // 목적: 추출이 실패했을 때 어느 단계·어느 셀에서 문제가 있었는지 즉시 파악.
    const diagnostics = pages.map((pg: any) => {
      const H: string[] = pg.headers ?? [];
      const rows: any[][] = pg.rows ?? [];
      // 표준 컬럼 인덱스
      const idx = (re: RegExp) => H.findIndex(h => re.test(String(h).replace(/\s+/g, "")));
      const iName  = idx(/품명|품목|상품명|제품명/);
      const iSpec  = idx(/규격|사양/);
      const iQty   = idx(/수량|매수/);
      const iPrice = idx(/단가/);
      const iAmt   = idx(/^금액$|공급가액|매출액/);
      const iVat   = idx(/세액|부가세/);

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
        // "1.000" → 1000 (콤마-점 오독)
        if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseInt(s.replace(/\./g, ""), 10);
        const n = parseFloat(s);
        return isFinite(n) ? n : 0;
      };

      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        if (!Array.isArray(row)) continue;
        const name  = iName  >= 0 ? String(row[iName]  ?? "").trim() : "";
        const qty   = iQty   >= 0 ? toNum(row[iQty])   : 0;
        const price = iPrice >= 0 ? toNum(row[iPrice]) : 0;
        const amt   = iAmt   >= 0 ? toNum(row[iAmt])   : 0;
        const issues: string[] = [];

        if (!name) { missingName++; issues.push("품명 없음"); }
        if (iQty   >= 0 && qty   === 0) { missingQty++;    issues.push("수량 0/없음"); }
        if (iPrice >= 0 && price === 0) { missingPrice++;  issues.push("단가 0/없음"); }
        if (iAmt   >= 0 && amt   === 0) { missingAmount++; issues.push("금액 0/없음"); }

        // 이상치 감지 (한국 거래명세서 통계적 범위)
        if (qty   > 0 && qty   > 100000)      { outlierQty++;    issues.push(`수량 과대(${qty})`); }
        if (price > 0 && price > 10_000_000)  { outlierPrice++;  issues.push(`단가 과대(${price})`); }
        if (amt   > 0 && amt   > 100_000_000) { outlierAmount++; issues.push(`금액 과대(${amt})`); }

        // 행의 모든 셀 값 (진단용) + 다른 수량 후보 (X × 단가 ≈ 금액 을 만족하는 값)
        const allCells = row.map((v, ci) => ({ col: ci, header: H[ci] ?? `col${ci}`, value: v }));
        let qtyCandidates: Array<{ col: number; header: string; value: number }> = [];
        if (price > 0 && amt > 0) {
          const targetQty = amt / price;
          qtyCandidates = allCells
            .map(c => ({ ...c, num: toNum(c.value) }))
            .filter(c => c.col !== iQty && c.num > 0 && Math.abs(c.num - targetQty) <= Math.max(1, targetQty * 0.02))
            .map(c => ({ col: c.col, header: c.header, value: c.num }));
        }

        // 수량 × 단가 ≠ 금액 검증
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
          rowIssues.push({
            row: ri + 1,
            product: name,
            issues: [...issues],
            qty, price, amount: amt, expected,
            allCells,           // 진단: 이 행의 모든 셀 원본 값
            qtyCandidates,      // 진단: (X × 단가 ≈ 금액)을 만족하는 다른 컬럼 후보 (자동 교정 후보)
          });
        }
      }

      // 페이지 합계 검증
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
        columnMap: {
          품명: iName, 규격: iSpec, 수량: iQty, 단가: iPrice, 금액: iAmt, 세액: iVat,
        },
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

    // 최신 OCR 결과를 파일로 저장 (진단용) — logs/ocr-last.json + logs/ocr-<timestamp>.json
    // 비동기 저장으로 이벤트 루프 블로킹 방지
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const logsDir = path.join(process.cwd(), "logs");
      await fs.mkdir(logsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      // 페이지 진단과 처리 트레이스를 병합
      const diagnosticsMerged = diagnostics.map((d, di) => ({
        ...d,
        trace: pageTraces[di] ?? null,
      }));
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
      const summaryPayload  = JSON.stringify(summary, null, 2);
      await Promise.all([
        fs.writeFile(path.join(logsDir, "ocr-last.json"), detailedPayload),
        fs.writeFile(path.join(logsDir, `ocr-${timestamp}.json`), detailedPayload),
        fs.writeFile(path.join(logsDir, "ocr-last-summary.json"), summaryPayload),
      ]);
      // 최대 20개 유지
      const files = (await fs.readdir(logsDir)).filter(f => /^ocr-\d/.test(f)).sort();
      while (files.length > 20) {
        const f = files.shift();
        if (f) await fs.unlink(path.join(logsDir, f)).catch(() => {});
      }
      // 콘솔 요약 출력 — 다음 개선 방안 착수 시 즉시 확인 가능
      console.log(`[OCR/diag] ${pages.length}페이지 처리 완료:
  - 추출 행 수: ${summary.totals.rowsExtracted}
  - 소계 불일치 페이지: ${summary.totals.totalMismatchPages}/${pages.length}
  - 수량×단가≠금액 행: ${summary.totals.qtyPriceAmtMismatches}
  - 필드 누락 총계: ${summary.totals.missingFieldTotal}
  → 자세한 분석: logs/ocr-last-summary.json`);
    } catch (logErr: any) {
      console.warn("[OCR/log-save]", logErr?.message);
    }
    return res.json({ pages, engine });
  } catch (err: any) {
    console.error("[OCR] error:", err?.message);
    res.status(500).json({ error: err?.message ?? "OCR 처리 중 오류" });
  }
});

// 최신 OCR 결과 조회 (진단용) — logs/ocr-last.json 반환
router.get("/api/ocr/last-log", async (_req, res) => {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const p = path.join(process.cwd(), "logs", "ocr-last.json");
    if (!fs.existsSync(p)) return res.status(404).json({ error: "저장된 OCR 로그 없음" });
    const data = fs.readFileSync(p, "utf-8");
    res.type("application/json").send(data);
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// 공급사명 + 금액으로 OCR 결과에서 항목 검색 (진단용)
router.get("/api/ocr/search-balance", async (req, res) => {
  try {
    const supplier = String(req.query.supplier ?? "").trim();
    const amount = req.query.amount ? Number(req.query.amount) : null;
    const fs = await import("fs");
    const path = await import("path");
    const p = path.join(process.cwd(), "logs", "ocr-last.json");
    if (!fs.existsSync(p)) return res.status(404).json({ error: "저장된 OCR 로그 없음. OCR을 한 번 실행하세요." });
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    const matches: any[] = [];
    for (const page of data.pages ?? []) {
      const supp = page.meta?.supplier ?? "";
      if (supplier && !String(supp).includes(supplier)) continue;
      const hits: any = { page: page.page, supplier: supp, hits: [] as any[] };
      (page.headers ?? []).forEach((h: string, hi: number) => {
        if (/합\s*계\s*액|총\s*합\s*계|합\s*계|잔\s*고|잔\s*액|미\s*수|공\s*급\s*가|매\s*입\s*총\s*계/.test(String(h ?? ""))) {
          const values = (page.rows ?? []).map((r: any[]) => r?.[hi]).filter((v: any) => v != null);
          hits.hits.push({ type: "header", col: hi, label: h, values });
        }
      });
      (page.rows ?? []).forEach((r: any[], ri: number) => {
        r?.forEach((c: any, ci: number) => {
          if (typeof c === "string" && /합\s*계\s*액|총\s*합\s*계|합\s*계|잔\s*고|잔\s*액|미\s*수|공\s*급\s*가|매\s*입\s*총\s*계/.test(c)) {
            hits.hits.push({ type: "cell", row: ri, col: ci, label: c, rowFull: r });
          }
          if (amount != null && typeof c === "number" && Math.abs(c - amount) < 1) {
            hits.hits.push({ type: "amount-match", row: ri, col: ci, value: c, rowFull: r });
          }
        });
      });
      if (hits.hits.length) matches.push(hits);
    }
    res.json({ query: { supplier, amount }, matches });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// ── 공급사 잔고 기록 ──────────────────────────────────────────────────────────
router.get("/api/supplier-balances", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("supplier_balances")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ balances: data ?? [] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/supplier-balances", async (req, res) => {
  try {
    const { supplier_name, invoice_date, balance } = req.body ?? {};
    if (!supplier_name?.trim() || balance == null) return res.status(400).json({ error: "supplier_name, balance 필요" });
    const { data, error } = await supabase
      .from("supplier_balances")
      .insert({ supplier_name: supplier_name.trim(), invoice_date: invoice_date ?? null, balance: Number(balance) })
      .select().single();
    if (error) throw new Error(error.message);
    res.json({ balance: data });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/api/supplier-balances/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("supplier_balances").delete().eq("id", Number(req.params.id));
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
