// ocr/matchRouter.ts — GET /api/health · GET /api/ocr-ping · POST /api/ocr-match
import { Router } from "express";
import { getProductMap, getSynonymMap, getSupplierAliasMap } from "../../productCache";
import { saveMatchDiagnostic, type RowMatchTrace, type MatchDiagnostic } from "../../ocr/diagnostics";
import { invoiceMatchScore, makeMatchResult, normSupplier, bigramSim } from "../../ocr/match";
import { getGeminiKeys, getMistralKeys } from "../../ocr/llm";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/zodValidate";
import { badRequest } from "../../middleware/errorHandler";
import { z } from "zod";

const OcrMatchSchema = z.object({
  names: z.array(z.unknown()).optional(),
  name: z.string().max(300).optional(),
  topN: z.number().int().min(1).max(30).optional(),
  supplier: z.string().max(200).optional(),
});

const router = Router();

router.get("/api/health", asyncHandler(async (_req, res) => { res.json({ ok: true }); }));

router.get("/api/ocr-ping", asyncHandler(async (_req, res) => {
  const keys = getGeminiKeys();
  const mKeys = getMistralKeys();
  res.json({ ok: true, gemini: keys.length > 0, geminiKeyCount: keys.length, mistral: mKeys.length > 0, mistralKeyCount: mKeys.length });
}));

router.post("/api/ocr-match", authorize(5), validateBody(OcrMatchSchema), asyncHandler(async (req, res) => {
  const { names } = req.body ?? {};
  const isCandidateMode = typeof req.body?.name === "string" && req.body?.topN;
  if (!isCandidateMode && !Array.isArray(names)) throw badRequest("names 배열 필요");

  const map = await getProductMap();
  const products = Object.values(map);
  const synonymMap = await getSynonymMap();
  const supplierAliasMap = await getSupplierAliasMap();

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
        const sp = normSupplier(String(p.supplier));
        return sp === sh || sp.includes(sh) || sh.includes(sp) || bigramSim(sp, sh) >= 30;
      });
      return filtered.length >= 5 ? filtered : products;
    })();

    const scored = pool
      .map(p => ({ p, score: invoiceMatchScore(name, p) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    return res.json({
      candidates: scored.map(({ p, score }) => ({
        code: p.code, name: p.name, spec: p.spec, score,
        supplier: p.supplier != null ? String(p.supplier) : null,
        masterPrice: p.purchase_price != null ? Number(p.purchase_price) : null,
        salePrice: p.sale_price != null ? Number(p.sale_price) : null,
        profitRate: p.profit_rate != null ? Number(p.profit_rate) : null,
        expiryDate: p.expiry_date != null ? String(p.expiry_date) : null,
      })),
    });
  }

  const supplierHints: string[] = Array.isArray(req.body?.suppliers) ? req.body.suppliers : [];
  const matchTraces: RowMatchTrace[] = [];

  const matches = names.map((name: string, i: number) => {
    if (!name?.trim()) {
      matchTraces.push({ rowIdx: i, ocrName: String(name ?? ""), supplierHint: null, bestScore: 0, bestCandidate: null, bestCode: null, matched: false, reason: "empty-name" });
      return { input: name, matched: null };
    }

    const supplierHint = resolveSupplier((supplierHints[i] ?? "").trim());
    const nameLC = name.trim().toLowerCase();
    const synKeyCompound = supplierHint ? `${normSupplier(supplierHint)}|${nameLC}` : null;
    const synCode = (synKeyCompound && synonymMap.get(synKeyCompound)) ?? synonymMap.get(nameLC);
    if (synCode) {
      const sp = map[synCode] ?? products.find(p => p.code === synCode);
      if (sp) {
        matchTraces.push({ rowIdx: i, ocrName: name, supplierHint, bestScore: 100, bestCandidate: sp.name, bestCode: sp.code, matched: true, reason: "synonym-hit" });
        return makeMatchResult(name, sp, 100);
      }
    }

    const pool = (() => {
      if (!supplierHint) return products;
      const sh = normSupplier(supplierHint);
      const filtered = products.filter(p => {
        if (!p.supplier) return false;
        const sp = normSupplier(String(p.supplier));
        return sp === sh || sp.includes(sh) || sh.includes(sp) || bigramSim(sp, sh) >= 30;
      });
      return filtered.length >= 5 ? filtered : products;
    })();

    const scoredAll = pool.map(p => ({ p, score: invoiceMatchScore(name, p) }));
    scoredAll.sort((a, b) => b.score - a.score);
    const top3 = scoredAll.slice(0, 3).map(({ p, score }) => ({ name: p.name, code: p.code, score }));
    const best = scoredAll[0]?.p ?? null;
    const bestScore = scoredAll[0]?.score ?? 0;
    const commonTrace = { rowIdx: i, ocrName: name, supplierHint, bestScore, bestCandidate: best?.name ?? null, bestCode: best?.code ?? null, top3Candidates: top3 };

    if (!best || bestScore < 20) {
      console.log(`[MATCH-MISS] score=${bestScore ?? 0} ocr="${name}" best="${best?.name ?? "-"}"`);
      matchTraces.push({ ...commonTrace, matched: false, reason: bestScore < 20 ? "score-too-low" : "no-candidate" });
      return { input: name, matched: null, score: bestScore };
    }
    if (bestScore < 70) console.log(`[MATCH-LOW] score=${bestScore} ocr="${name}" → db="${best.name}"`);
    matchTraces.push({ ...commonTrace, matched: true, reason: bestScore >= 95 ? "high-confidence" : bestScore >= 70 ? "medium-confidence" : "low-confidence" });
    return {
      input: name,
      matched: {
        code: best.code, name: best.name, spec: best.spec, score: bestScore,
        masterPrice: best.purchase_price != null ? Number(best.purchase_price) : null,
        salePrice: best.sale_price != null ? Number(best.sale_price) : null,
        profitRate: best.profit_rate != null ? Number(best.profit_rate) : null,
        expiryDate: best.expiry_date != null ? String(best.expiry_date) : null,
      },
    };
  });

  const diag: MatchDiagnostic = {
    ts: new Date().toISOString(),
    totalRows: matchTraces.length,
    matched: matchTraces.filter(r => r.matched).length,
    missed: matchTraces.filter(r => !r.matched).length,
    lowScore: matchTraces.filter(r => r.matched && r.bestScore < 70).length,
    perfectMatch: matchTraces.filter(r => r.bestScore >= 95).length,
    supplierHints: [...new Set(supplierHints.filter(Boolean))],
    rows: matchTraces,
  };
  void saveMatchDiagnostic(diag);
  res.json({ matches });
}));

export default router;
