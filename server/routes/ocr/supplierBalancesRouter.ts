// ocr/supplierBalancesRouter.ts — /api/supplier-balances CRUD
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";
import { CreateSupplierBalanceSchema } from "../../../src/shared/schemas/ocr";

const router = Router();

router.get("/api/supplier-balances", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("supplier_balances")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new HttpError(500, error.message);
  res.json({ balances: data ?? [] });
}));

router.post("/api/supplier-balances", authorize(5), validateBody(CreateSupplierBalanceSchema), asyncHandler(async (req, res) => {
  const { supplier_name, invoice_date, balance } = req.body;
  const { data, error } = await supabase
    .from("supplier_balances")
    .insert({ supplier_name: supplier_name.trim(), invoice_date: invoice_date ?? null, balance: Number(balance) })
    .select().single();
  if (error) throw new HttpError(500, error.message);
  res.json({ balance: data });
}));

router.delete("/api/supplier-balances/:id", authorize(5), asyncHandler(async (req, res) => {
  const { error } = await supabase.from("supplier_balances").delete().eq("id", Number(req.params.id));
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

export default router;
