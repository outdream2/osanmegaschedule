// ocr/aliasesRouter.ts — /api/ocr-supplier-aliases CRUD
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { resetSupplierAliasCache } from "../../productCache";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";
import { UpsertOcrSupplierAliasSchema } from "../../../src/shared/schemas/ocr";

const router = Router();

router.get("/api/ocr-supplier-aliases", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase.from("ocr_supplier_aliases").select("*").order("created_at", { ascending: false });
  if (error) throw new HttpError(500, error.message);
  res.json({ aliases: data ?? [] });
}));

router.post("/api/ocr-supplier-aliases", authorize(5), validateBody(UpsertOcrSupplierAliasSchema), asyncHandler(async (req, res) => {
  const { alias, supplier_name } = req.body;
  const aliasNorm = alias.trim();
  const nameNorm = supplier_name.trim();

  const { data: existing } = await supabase
    .from("ocr_supplier_aliases").select("id").eq("alias", aliasNorm).limit(1);
  let result;
  if (existing?.[0]) {
    const { data, error } = await supabase.from("ocr_supplier_aliases")
      .update({ supplier_name: nameNorm })
      .eq("id", existing[0].id).select().single();
    if (error) throw new HttpError(500, error.message);
    result = data;
  } else {
    const { data, error } = await supabase.from("ocr_supplier_aliases")
      .insert({ alias: aliasNorm, supplier_name: nameNorm }).select().single();
    if (error) throw new HttpError(500, error.message);
    result = data;
  }
  resetSupplierAliasCache();
  res.json({ alias: result });
}));

router.patch("/api/ocr-supplier-aliases/:id", authorize(5), validateBody(UpsertOcrSupplierAliasSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { alias, supplier_name } = req.body;
  const { data, error } = await supabase.from("ocr_supplier_aliases")
    .update({ alias: alias.trim(), supplier_name: supplier_name.trim() })
    .eq("id", id).select().single();
  if (error) throw new HttpError(500, error.message);
  resetSupplierAliasCache();
  res.json({ alias: data });
}));

router.delete("/api/ocr-supplier-aliases/:id", authorize(9), asyncHandler(async (req, res) => {
  const { error } = await supabase.from("ocr_supplier_aliases").delete().eq("id", Number(req.params.id));
  if (error) throw new HttpError(500, error.message);
  resetSupplierAliasCache();
  res.json({ ok: true });
}));

export default router;
