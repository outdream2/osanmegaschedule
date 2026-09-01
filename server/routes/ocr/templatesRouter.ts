// ocr/templatesRouter.ts — /api/ocr-templates CRUD
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";
import { UpsertOcrTemplateSchema } from "../../../src/shared/schemas/ocr";

const router = Router();

router.get("/api/ocr-templates", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase.from("ocr_templates").select("*").order("supplier_name");
  if (error) throw new HttpError(500, error.message);
  res.json({ templates: data ?? [] });
}));

router.post("/api/ocr-templates", authorize(5), validateBody(UpsertOcrTemplateSchema), asyncHandler(async (req, res) => {
  const { supplier_name, headers, column_mapping } = req.body;
  const payload: any = { supplier_name: supplier_name.trim(), headers, updated_at: new Date().toISOString() };
  if (Array.isArray(column_mapping)) {
    payload.column_mapping = column_mapping.map((v: any) => (v == null ? "" : String(v)));
  }
  const { data, error } = await supabase.from("ocr_templates")
    .upsert(payload, { onConflict: "supplier_name" })
    .select().single();
  if (error) throw new HttpError(500, error.message);
  res.json({ template: data });
}));

router.delete("/api/ocr-templates/:supplier_name", authorize(9), asyncHandler(async (req, res) => {
  const { error } = await supabase.from("ocr_templates").delete().eq("supplier_name", req.params.supplier_name);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

export default router;
