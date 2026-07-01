import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();

router.get("/api/lunch-requests", async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("lunch_requests").select("*").eq("date", date).order("updated_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ requests: data ?? [] });
});

router.put("/api/lunch-requests", async (req, res) => {
  const { employee_id, employee_name, date, eating, memo } = req.body ?? {};
  if (!employee_id || !employee_name || !date || eating === undefined)
    return res.status(400).json({ error: "필수 항목 누락" });
  const { error } = await supabase.from("lunch_requests").upsert(
    { employee_id, employee_name, date, eating, memo: memo || null, updated_at: new Date().toISOString() },
    { onConflict: "employee_id,date" }
  );
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

router.delete("/api/lunch-requests", async (req, res) => {
  const { employee_id, date } = req.query;
  if (!employee_id || !date) return res.status(400).json({ error: "필수 파라미터 누락" });
  const { error } = await supabase
    .from("lunch_requests").delete()
    .eq("employee_id", Number(employee_id)).eq("date", date as string);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

export default router;
