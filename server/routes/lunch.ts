import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();

// 특정 날짜 출근 현황: 당일 schedule type이 휴무/공휴일/연차/경조사가 아닌 직원
router.get("/api/lunch-attendance", async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
  const [year, monthStr] = date.split("-");
  const OFF_TYPES = ["휴무", "월차", "지정휴무", "결근", "오전반차", "오후반차"];

  const { data: employees, error: empErr } = await supabase
    .from("employees").select("id, name, position").order("id");
  if (empErr) return res.status(500).json({ error: empErr.message });

  const { data: schedules, error: schErr } = await supabase
    .from("schedules").select("employeeId, type, date")
    .eq("date", date);
  if (schErr) return res.status(500).json({ error: schErr.message });

  const schedMap = new Map<number, string>();
  for (const s of (schedules ?? [])) schedMap.set(s.employeeId, s.type);

  const working = (employees ?? []).filter(e => {
    const t = schedMap.get(e.id);
    return t && !OFF_TYPES.includes(t);
  });

  const pharmacistCount = working.filter(e => e.position === "약사").length;
  const staffCount = working.filter(e => e.position !== "약사").length;
  return res.json({ working, pharmacistCount, staffCount, totalCount: working.length });
});

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
