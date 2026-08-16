// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";

const router = Router();

const STAFF_LIST = (process.env.STAFF_IDS ?? "1:대표,2:이사,3:부장")
  .split(",").map(e => { const [id, name] = e.split(":"); return { id: parseInt(id.trim()), name: name?.trim() ?? "" }; })
  .filter(s => !isNaN(s.id) && s.id > 0);
const OFF_TYPES = ["휴무", "월차", "지정휴무", "오전반차", "오후반차"];

router.get("/api/staff-availability", asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") throw badRequest("date query param required");
  const { data, error } = await supabase
    .from("schedules")
    .select("employeeId, type")
    .eq("date", date)
    .in("employeeId", STAFF_LIST.map(s => s.id));
  if (error) throw new HttpError(500, error.message);
  const result = STAFF_LIST.map(({ id, name }) => {
    const row = (data ?? []).find((r: any) => r.employeeId === id);
    const scheduleType: string | null = row?.type ?? null;
    return { employeeId: id, name, scheduleType, isOff: scheduleType ? OFF_TYPES.includes(scheduleType) : false };
  });
  res.json(result);
}));

router.get("/api/staff-monthly", asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) throw badRequest("year and month required");
  const monthStr = String(month).padStart(2, "0");
  const datePrefix = `${year}-${monthStr}-`;
  const { data, error } = await supabase
    .from("schedules")
    .select("employeeId, date, type")
    .like("date", `${datePrefix}%`)
    .in("employeeId", STAFF_LIST.map(s => s.id));
  if (error) throw new HttpError(500, error.message);
  const result: Record<string, string[]> = {};
  for (const row of (data ?? [])) {
    if (!OFF_TYPES.includes(row.type)) continue;
    const staff = STAFF_LIST.find(s => s.id === row.employeeId);
    if (!staff) continue;
    if (!result[row.date]) result[row.date] = [];
    result[row.date].push(staff.name);
  }
  res.json(result);
}));

export default router;
