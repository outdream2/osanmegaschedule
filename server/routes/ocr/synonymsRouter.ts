// ocr/synonymsRouter.ts — /api/ocr-synonyms CRUD
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { resetSynonymCache } from "../../productCache";
import { normSupplier } from "../../ocr/match";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError, badRequest } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";
import { UpsertOcrSynonymSchema, CancelOcrSynonymSchema } from "../../../src/shared/schemas/ocr";

const router = Router();

router.get("/api/ocr-synonyms", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase.from("ocr_synonyms").select("*").order("created_at", { ascending: false });
  if (error) throw new HttpError(500, error.message);
  res.json({ synonyms: data ?? [] });
}));

router.post("/api/ocr-synonyms", authorize(5), validateBody(UpsertOcrSynonymSchema), asyncHandler(async (req, res) => {
  const { prod_name_old, prod_name_new, supplier_old, supplier_new, product_code } = req.body;
  if (!prod_name_old?.trim()) throw badRequest("prod_name_old 필요");
  const nameOldNorm = prod_name_old.trim().toLowerCase();
  const codeNorm = product_code?.trim() || null;
  const supplierNewNorm = supplier_new?.trim() ? normSupplier(supplier_new.trim()) : null;
  const supplierOldNorm = supplier_old?.trim() || null;
  const nameNewVal = prod_name_new?.trim() || null;

  const { data: existing } = await supabase
    .from("ocr_synonyms").select("id").eq("prod_name_old", nameOldNorm).limit(1);
  if (existing?.[0]) {
    const { data, error } = await supabase.from("ocr_synonyms")
      .update({ product_code: codeNorm, supplier_new: supplierNewNorm, prod_name_new: nameNewVal, supplier_old: supplierOldNorm })
      .eq("id", existing[0].id)
      .select().single();
    if (error) throw new HttpError(500, error.message);
    resetSynonymCache();
    return res.json({ synonym: data });
  }

  const { data, error } = await supabase.from("ocr_synonyms")
    .insert({ prod_name_old: nameOldNorm, prod_name_new: nameNewVal, product_code: codeNorm, supplier_new: supplierNewNorm, supplier_old: supplierOldNorm })
    .select().single();
  if (error) throw new HttpError(500, error.message);
  resetSynonymCache();
  res.json({ synonym: data });
}));

router.patch("/api/ocr-synonyms/:id", authorize(5), validateBody(UpsertOcrSynonymSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { prod_name_old, prod_name_new, product_code, supplier_old, supplier_new } = req.body;
  if (!prod_name_old?.trim() || !product_code?.trim()) throw badRequest("prod_name_old, product_code 필요");
  const { data, error } = await supabase.from("ocr_synonyms")
    .update({
      prod_name_old: prod_name_old.trim().toLowerCase(),
      prod_name_new: prod_name_new?.trim() || null,
      product_code: product_code.trim(),
      supplier_new: supplier_new?.trim() ? normSupplier(supplier_new.trim()) : null,
      supplier_old: supplier_old?.trim() || null,
    })
    .eq("id", id).select().single();
  if (error) throw new HttpError(500, error.message);
  resetSynonymCache();
  res.json({ synonym: data });
}));

// DELETE by prod_name_old (pre-existing synonyms without known ID) — must be before /:id
router.delete("/api/ocr-synonyms/by-name", authorize(5), asyncHandler(async (req, res) => {
  const { prod_name_old } = req.body ?? {};
  if (!prod_name_old?.trim()) throw badRequest("prod_name_old 필요");
  const nameOldNorm = prod_name_old.trim().toLowerCase();
  const { error } = await supabase.from("ocr_synonyms").delete().eq("prod_name_old", nameOldNorm);
  if (error) throw new HttpError(500, error.message);
  resetSynonymCache();
  res.json({ ok: true });
}));

// 2차 보정 취소: 삭제 대신 cancelled=true 마킹 (재적용 방지 + 관리 가능)
router.post("/api/ocr-synonyms/cancel-by-name", authorize(5), validateBody(CancelOcrSynonymSchema), asyncHandler(async (req, res) => {
  const { prod_name_old, product_code } = req.body;
  if (!prod_name_old?.trim()) throw badRequest("prod_name_old 필요");
  const nameOldNorm = prod_name_old.trim().toLowerCase();
  const { data: exist, error: findErr } = await supabase
    .from("ocr_synonyms").select("id").eq("prod_name_old", nameOldNorm).limit(1);
  if (findErr) {
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
      resetSynonymCache();
      return res.json({ ok: true, fallback: "insert_failed" });
    }
  }
  resetSynonymCache();
  res.json({ ok: true });
}));

// 취소 항목 복원 (cancelled=false)
router.post("/api/ocr-synonyms/restore/:id", authorize(5), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { error } = await supabase.from("ocr_synonyms")
    .update({ cancelled: false, cancelled_at: null }).eq("id", id);
  if (error) throw new HttpError(500, error.message);
  resetSynonymCache();
  res.json({ ok: true });
}));

router.delete("/api/ocr-synonyms/:id", authorize(9), asyncHandler(async (req, res) => {
  const { error } = await supabase.from("ocr_synonyms").delete().eq("id", Number(req.params.id));
  if (error) throw new HttpError(500, error.message);
  resetSynonymCache();
  res.json({ ok: true });
}));

export default router;
