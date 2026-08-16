// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용 · slim
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { getSession } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, forbidden, unauthorized, HttpError } from "../../middleware/errorHandler";

const router = Router();
const OFF_TYPES = ["휴무", "월차", "지정휴무", "결근", "오전반차", "오후반차"];

// 특정 날짜 출근 현황
router.get("/api/lunch-attendance", asyncHandler(async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
  const { data: employees, error: empErr } = await supabase.from("employees").select("id, name, position").order("id");
  if (empErr) throw new HttpError(500, empErr.message);
  const { data: schedules, error: schErr } = await supabase.from("schedules").select("employeeId, type, date").eq("date", date);
  if (schErr) throw new HttpError(500, schErr.message);
  const schedMap = new Map<number, string>();
  for (const s of (schedules ?? [])) schedMap.set(s.employeeId, s.type);
  const working = (employees ?? []).filter(e => {
    const t = schedMap.get(e.id);
    return t && !OFF_TYPES.includes(t);
  });
  const pharmacistCount = working.filter(e => e.position === "약사").length;
  const staffCount = working.length - pharmacistCount;
  res.json({ working, pharmacistCount, staffCount, totalCount: working.length });
}));

router.get("/api/lunch-requests", asyncHandler(async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("lunch_requests")
    .select("id, employee_id, employee_name, date, eating, memo, updated_at")
    .eq("date", date).order("updated_at", { ascending: true });
  if (error) throw new HttpError(500, error.message);
  res.json({ requests: data ?? [], count: (data ?? []).length });
}));

router.put("/api/lunch-requests", asyncHandler(async (req, res) => {
  const { employee_id, employee_name, date, eating, memo } = req.body ?? {};
  if (!employee_id || !employee_name || !date || eating === undefined) throw badRequest("필수 항목 누락");
  const { error } = await supabase.from("lunch_requests").upsert(
    { employee_id, employee_name, date, eating, memo: memo || null, updated_at: new Date().toISOString() },
    { onConflict: "employee_id,date" },
  );
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

// 본인 or 관리자만 lunch 삭제
router.delete("/api/lunch-requests", asyncHandler(async (req, res) => {
  const session = getSession(req);
  if (!session) throw unauthorized();
  const { employee_id, date } = req.query;
  if (!employee_id || !date) throw badRequest("필수 파라미터 누락");
  const empIdNum = Number(employee_id);
  const isAdmin = (session.level ?? 0) >= 9;
  if (!isAdmin && session.sub !== empIdNum) throw forbidden("본인 신청만 삭제 가능합니다");
  const { error } = await supabase.from("lunch_requests").delete().eq("employee_id", empIdNum).eq("date", date as string);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

export default router;
