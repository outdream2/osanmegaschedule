import { Router } from "express";
import { supabase } from "../../src/supabase/client";
import { getProductMap, getSynonymMap, resetSynonymCache } from "../productCache";
import { mergeAdjacentHeaders, normalizeInvoiceCols, extractSpecFromName, fixAmounts, sanitizeOcrMeta } from "../ocr/parse";
import { callGeminiOcr, callMistralOcr, getGeminiKeys, getMistralKeys, geminiState } from "../ocr/llm";
import { ensureOcrServer, callEasyOcrServer } from "../ocr/easyocr";
import { invoiceMatchScore, makeMatchResult, norm, bigramSim } from "../ocr/match";
import type { GeminiResult } from "../ocr/schema";

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

    const matches = names.map((name: string) => {
      if (!name?.trim()) return { input: name, matched: null };

      const synCode = synonymMap.get(name.trim().toLowerCase());
      if (synCode) {
        const sp = map[synCode] ?? products.find(p => p.code === synCode);
        if (sp) return makeMatchResult(name, sp, 100);
      }

      let best = null as (typeof products)[0] | null;
      let bestScore = 0;
      for (const p of products) {
        const s = invoiceMatchScore(name, p);
        if (s > bestScore) { bestScore = s; best = p; }
      }
      if (!best || bestScore < 25) return { input: name, matched: null, score: bestScore };
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
    const { data, error } = await supabase.from("ocr_synonyms")
      .upsert(
        { alias: alias.trim().toLowerCase(), product_code: product_code.trim(), supply: supply?.trim() ?? null },
        { onConflict: "alias" }
      )
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

router.post("/api/ocr", async (req, res) => {
  const { images, engine: reqEngine = "gemini" } = req.body ?? {};
  const engine = reqEngine as string;

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
          const pre  = mergeAdjacentHeaders(raw.headers ?? [], raw.rows ?? []);
          const normalized = normalizeInvoiceCols(pre.headers, pre.rows);
          const spec = extractSpecFromName(normalized.headers, normalized.rows);
          const rows = fixAmounts(spec.headers, spec.rows);
          console.log(`[OCR/EasyOCR] page ${i + 1}: 헤더=${JSON.stringify(spec.headers)}, 행=${rows.length}`);
          return { page: i + 1, headers: spec.headers, rows, meta: sanitizeOcrMeta(raw.meta ?? {}), rawText: raw.rawText ?? "" };
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

        let rawText = "";
        let quotaCount = 0;
        let lastError = "";

        for (let k = 0; k < keys.length; k++) {
          const ki = (startIdx + k) % keys.length;
          const apiKey = keys[ki];
          if (failedKeys.has(apiKey)) { quotaCount++; continue; }
          const r = await callGeminiOcr(b64, mimeType, apiKey);
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
            const r = await callMistralOcr(b64, mimeType, mKey);
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

        const pre  = mergeAdjacentHeaders(parsed.headers ?? [], parsed.rows ?? []);
        const normalized = normalizeInvoiceCols(pre.headers, pre.rows);
        const spec = extractSpecFromName(normalized.headers, normalized.rows);
        const rows = fixAmounts(spec.headers, spec.rows);
        const cleanMeta = sanitizeOcrMeta(parsed.meta ?? {});
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
