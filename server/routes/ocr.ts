import { Router } from "express";
import { supabase } from "../../src/supabase/client";
import { getProductMap, getSynonymMap, resetSynonymCache, getSupplierAliasMap, resetSupplierAliasCache } from "../productCache";
import { cleanCellValues, mergeAdjacentHeaders, normalizeInvoiceCols, extractSpecFromName, repairColumnShift, fixAmountsBySubtotal, crossValidateIntraPage, sanitizeOcrMeta } from "../ocr/parse";
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

      for (let i = 0; i < images.length; i++) {
        const { data: rawB64, mimeType: rawMime } = images[i] as { data: string; mimeType: string };

        // 이미지 전처리: 업스케일 + 도장 제거 + 그레이스케일 정규화
        const { b64, mimeType } = await preprocessImageForOcr(rawB64, rawMime);

        // 공급처 힌트가 없으면 1차 경량 추출 → 템플릿 조회
        let hint = supplierHints[i] ?? "";
        if (!hint && keys.length > 0) {
          const extractKey = keys[geminiState.currentKeyIdx % keys.length];
          if (!sessionDeadKeys.has(extractKey)) {
            const extracted = await extractSupplierFromImage(b64, mimeType, extractKey);
            if (extracted) {
              hint = extracted;
              console.log(`[OCR/2pass] page ${i + 1}: 공급처 1차 추출 → "${extracted}"`);
              // 추출된 공급처로 템플릿 조회
              const cleanedName = extracted.replace(/\(주\)|\(株\)|주식회사|（주）/g, "").trim();
              const { data: tmplData } = await supabase.from("ocr_templates")
                .select("supplier_name, headers").ilike("supplier_name", `%${cleanedName}%`).limit(1);
              if (tmplData?.[0]) templateMap.set(hint, tmplData[0].headers);
            }
          }
        }
        const tmplHeaders = hint ? templateMap.get(hint) : undefined;
        const templatePrompt = tmplHeaders ? buildTemplatePrompt(hint, tmplHeaders) : undefined;
        if (templatePrompt) console.log(`[OCR/Template] page ${i + 1}: 템플릿 "${hint}" 적용`);

        // ── Gemini (sticky key, 세션 내 dead key 제외) ──────────────────────
        let rawText = "";
        let lastError = "";

        const startIdx = keys.length > 0 ? geminiState.currentKeyIdx % keys.length : 0;
        console.log(`[OCR/Gemini] page ${i + 1}/${images.length} — 키 ${startIdx + 1}번부터 (총 ${keys.length}개)`);

        for (let k = 0; k < keys.length; k++) {
          const ki = (startIdx + k) % keys.length;
          const apiKey = keys[ki];
          if (sessionDeadKeys.has(apiKey)) continue;

          const r = await callGeminiOcr(b64, mimeType, apiKey, undefined, templatePrompt);
          if (r.ok) {
            rawText = r.text;
            geminiState.currentKeyIdx = ki;
            console.log(`[OCR/Gemini] page ${i + 1}: 키 ${ki + 1} 성공`);
            break;
          }
          const fail = r as Extract<GeminiResult, { ok: false }>;
          lastError = fail.error;
          if (fail.quota || fail.error.includes("UNAUTHENTICATED") || fail.error.includes("API_KEY_INVALID") || fail.error.includes("not valid")) {
            sessionDeadKeys.add(apiKey);
            geminiState.currentKeyIdx = (ki + 1) % keys.length;
            console.warn(`[OCR/Gemini] 키 ${ki + 1} 세션 제외 (할당량 초과 또는 인증 실패)`);
          } else {
            geminiState.currentKeyIdx = (ki + 1) % keys.length;
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

        const cleaned = cleanCellValues(parsed.headers ?? [], parsed.rows ?? []);
        const pre  = mergeAdjacentHeaders(cleaned.headers, cleaned.rows);
        const normalized = normalizeInvoiceCols(pre.headers, pre.rows);
        const spec = extractSpecFromName(normalized.headers, normalized.rows);
        const cleanMeta = sanitizeOcrMeta(parsed.meta ?? {});
        // 합계금액 우선 보정 → 컬럼 시프트 복원 → 자릿수 교차검증
        const rows0 = fixAmountsBySubtotal(spec.headers, spec.rows, cleanMeta.total ?? null);
        const rows1 = repairColumnShift(spec.headers, rows0);
        const rows  = crossValidateIntraPage(spec.headers, rows1);
        // 최종 합계 검증 로그
        const aI = spec.headers.indexOf("금액");
        if (aI >= 0 && cleanMeta.total) {
          const finalSum = rows.reduce((s, r) => s + (typeof r[aI] === "number" ? (r[aI] as number) : 0), 0);
          if (Math.abs(finalSum - cleanMeta.total) > 1) {
            console.warn(`[OCR/합계불일치] page ${i + 1} — 합계 ${cleanMeta.total} vs 행합 ${finalSum} (차이 ${finalSum - cleanMeta.total})`);
          }
        }
        // 1차 추출된 공급처가 있고 meta.supplier가 비어있으면 채워줌
        if (hint && !cleanMeta.supplier) cleanMeta.supplier = hint;
        process.stdout.write(`\n[OCR 결과] page ${i + 1}\n  헤더: ${JSON.stringify(spec.headers)}\n  행 수: ${rows.length}\n  메타: ${JSON.stringify(cleanMeta)}\n`);
        pages.push({ page: i + 1, headers: spec.headers, rows, meta: cleanMeta, rawText, supplierHintUsed: hint || undefined });
      }
    }

    return res.json({ pages, engine });
  } catch (err: any) {
    console.error("[OCR] error:", err?.message);
    res.status(500).json({ error: err?.message ?? "OCR 처리 중 오류" });
  }
});

export default router;
