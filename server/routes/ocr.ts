import { Router } from "express";
import { supabase } from "../../src/supabase/client";
import { getProductMap, getSynonymMap, resetSynonymCache } from "../productCache";
import { cleanCellValues, mergeAdjacentHeaders, normalizeInvoiceCols, extractSpecFromName, repairColumnShift, fixAmountsBySubtotal, crossValidateIntraPage, sanitizeOcrMeta } from "../ocr/parse";
import { callGeminiOcr, callMistralOcr, getGeminiKeys, getMistralKeys, geminiState } from "../ocr/llm";
import { ensureOcrServer, callEasyOcrServer } from "../ocr/easyocr";
import { invoiceMatchScore, makeMatchResult, norm, bigramSim } from "../ocr/match";
import type { GeminiResult } from "../ocr/schema";

function buildTemplatePrompt(supplierName: string, headers: string[]): string {
  return `[공급처 템플릿 — 최우선 적용]\n이 명세서는 "${supplierName}" 공급처 양식입니다.\n표의 컬럼 순서를 정확히 다음과 같이 지정합니다:\n${headers.map((h, i) => `  ${i + 1}번 컬럼 → "${h}"`).join("\n")}\n이 매핑 외의 추론·재배열은 절대 하지 마세요.`;
}

const router = Router();

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

    if (isCandidateMode) {
      const name = req.body.name as string;
      const topN = Math.min(Number(req.body.topN) || 10, 30);
      const supplierHint = (req.body.supplier as string | undefined)?.trim() ?? "";

      const nameLC = name.trim().toLowerCase();
      const synKeyCompound = supplierHint ? `${supplierHint.toLowerCase()}|${nameLC}` : null;
      const synCode = (synKeyCompound && synonymMap.get(synKeyCompound)) ?? synonymMap.get(nameLC);
      if (synCode) {
        const sp = map[synCode] ?? products.find(p => p.code === synCode);
        if (sp) return res.json({ candidates: [makeMatchResult(name, sp, 100).matched] });
      }

      const pool = (() => {
        if (!supplierHint) return products;
        const sh = norm(supplierHint);
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

      const supplierHint = (supplierHints[i] ?? "").trim();
      const nameLC = name.trim().toLowerCase();
      const synKeyCompound = supplierHint ? `${supplierHint.toLowerCase()}|${nameLC}` : null;
      const synCode = (synKeyCompound && synonymMap.get(synKeyCompound)) ?? synonymMap.get(nameLC);
      if (synCode) {
        const sp = map[synCode] ?? products.find(p => p.code === synCode);
        if (sp) return makeMatchResult(name, sp, 100);
      }

      const pool = (() => {
        if (!supplierHint) return products;
        const sh = norm(supplierHint);
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
    const { alias, product_code, supply } = req.body ?? {};
    if (!alias?.trim() || !product_code?.trim()) return res.status(400).json({ error: "alias, product_code 필요" });
    const aliasNorm  = alias.trim().toLowerCase();
    const codeNorm   = product_code.trim();
    const supplyNorm = supply?.trim() ?? null;

    // 상품코드 기준: 같은 product_code로 이미 등록된 행이 있으면 alias + supply 업데이트
    const { data: existRows } = await supabase
      .from("ocr_synonyms").select("id").eq("product_code", codeNorm).limit(1);
    const existById = existRows?.[0] ?? null;
    if (existById) {
      const { data, error } = await supabase.from("ocr_synonyms")
        .update({ alias: aliasNorm, supply: supplyNorm })
        .eq("id", existById.id)
        .select().single();
      if (error) throw new Error(error.message);
      resetSynonymCache();
      return res.json({ synonym: data });
    }

    // 없으면 alias 기준 upsert (동일 alias → product_code 덮어쓰기)
    const { data, error } = await supabase.from("ocr_synonyms")
      .upsert({ alias: aliasNorm, product_code: codeNorm, supply: supplyNorm }, { onConflict: "alias" })
      .select().single();
    if (error) throw new Error(error.message);
    resetSynonymCache();
    res.json({ synonym: data });
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
          const rows0 = repairColumnShift(spec.headers, spec.rows);
          const rows1 = fixAmountsBySubtotal(spec.headers, rows0, cleanMeta.total ?? null);
          const rows  = crossValidateIntraPage(spec.headers, rows1);
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

    if (engine === "gemini") {
      const keys = getGeminiKeys();
      const failedKeys = new Set<string>();
      for (let i = 0; i < images.length; i++) {
        const { data: b64, mimeType } = images[i] as { data: string; mimeType: string };
        const startIdx = keys.length > 0 ? geminiState.roundRobinIdx % keys.length : 0;
        console.log(`[OCR/Gemini] page ${i + 1}/${images.length} — 키 ${startIdx + 1}번부터 순환 (총 ${keys.length}개)`);

        const hint = supplierHints[i] ?? "";
        const tmplHeaders = hint ? templateMap.get(hint) : undefined;
        const templatePrompt = tmplHeaders ? buildTemplatePrompt(hint, tmplHeaders) : undefined;
        if (templatePrompt) console.log(`[OCR/Template] page ${i + 1}: 프롬프트 힌트 적용`);

        let rawText = "";
        let quotaCount = 0;
        let lastError = "";

        for (let k = 0; k < keys.length; k++) {
          const ki = (startIdx + k) % keys.length;
          const apiKey = keys[ki];
          if (failedKeys.has(apiKey)) { quotaCount++; continue; }
          const r = await callGeminiOcr(b64, mimeType, apiKey, undefined, templatePrompt);
          if (r.ok) {
            rawText = r.text;
            geminiState.roundRobinIdx = ki;
            console.log(`[OCR/Gemini] page ${i + 1}: 키 ${ki + 1} 성공`);
            break;
          }
          const fail = r as Extract<GeminiResult, { ok: false }>;
          lastError = fail.error;
          if (fail.quota) quotaCount++;
          if (fail.quota || fail.error.includes("API_KEY_INVALID") || fail.error.includes("not valid")) {
            failedKeys.add(apiKey);
          }
          console.warn(`[OCR/Gemini] 키 ${ki + 1}/${keys.length} 실패: ${fail.error}`);
        }

        if (!rawText) {
          const mistralKeys = getMistralKeys();
          for (const mKey of mistralKeys) {
            const r = await callMistralOcr(b64, mimeType, mKey, templatePrompt);
            if (r.ok) { rawText = r.text; console.log(`[OCR/Mistral] page ${i + 1}: 성공`); break; }
            console.warn(`[OCR/Mistral] 실패: ${(r as Extract<GeminiResult, { ok: false }>).error}`);
          }
          if (!rawText) {
            const errMsg = quotaCount === keys.length
              ? `Gemini 키 ${keys.length}개 모두 할당량 초과입니다. 내일 다시 시도하거나 새 키를 발급하세요.`
              : `Gemini OCR 실패: ${lastError}`;
            return res.status(500).json({ error: errMsg });
          }
        }

        let parsed: any;
        try { parsed = JSON.parse(rawText); }
        catch {
          pages.push({ page: i + 1, headers: ["원문 응답"], rows: [[rawText]], meta: {}, rawText });
          continue;
        }

        const cleaned = cleanCellValues(parsed.headers ?? [], parsed.rows ?? []);
        const pre  = mergeAdjacentHeaders(cleaned.headers, cleaned.rows);
        const normalized = normalizeInvoiceCols(pre.headers, pre.rows);
        const spec = extractSpecFromName(normalized.headers, normalized.rows);
        const cleanMeta = sanitizeOcrMeta(parsed.meta ?? {});
        const rows0 = repairColumnShift(spec.headers, spec.rows);
        const rows1 = fixAmountsBySubtotal(spec.headers, rows0, cleanMeta.total ?? null);
        const rows  = crossValidateIntraPage(spec.headers, rows1);
        process.stdout.write(`\n[OCR 결과] page ${i + 1}\n  헤더: ${JSON.stringify(spec.headers)}\n  행 수: ${rows.length}\n  메타: ${JSON.stringify(cleanMeta)}\n`);
        pages.push({ page: i + 1, headers: spec.headers, rows, meta: cleanMeta, rawText });
      }
    }

    return res.json({ pages, engine });
  } catch (err: any) {
    console.error("[OCR] error:", err?.message);
    res.status(500).json({ error: err?.message ?? "OCR 처리 중 오류" });
  }
});

export default router;
