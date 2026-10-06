// 2026-08-16 · asyncHandler + HttpError + validateBody + shared 스키마/DTO
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { getSession, authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/zodValidate";
import { badRequest, forbidden, unauthorized, HttpError } from "../../middleware/errorHandler";
import { UpsertLunchRequestSchema } from "../../../src/shared/schemas/lunch";
import type { LunchRequestsResponse, LunchAttendanceResponse } from "../../../src/shared/dtos/lunch";
// 2026-10-07 · Phase 2 · OFF SSOT · shared isOffType + isHalfDayType 사용
//   · 이전: 하드코드 ["휴무","월차","지정휴무","결근","오전반차","오후반차"]
//   · 이후: shared OFF_TYPES ∪ HALF_DAY_TYPES (점심 신청 가능 판정)
import { isOffType, isHalfDayType } from "../../../src/shared/schedule/offTypes";

const router = Router();

// 특정 날짜 출근 현황
router.get("/api/lunch-attendance", asyncHandler(async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
  const { data: employees, error: empErr } = await supabase.from("employees").select("id, name, position").order("id");
  if (empErr) throw new HttpError(500, empErr.message);
  const { data: schedules, error: schErr } = await supabase.from("schedules").select("employeeId, type, date").eq("date", date);
  if (schErr) throw new HttpError(500, schErr.message);
  const schedMap = new Map<number, string>();
  for (const s of (schedules ?? [])) schedMap.set(s.employeeId, s.type);
  // 2026-10-07 · Phase 2 · OFF SSOT · 완전 OFF (지정휴무 포함) + 반차 모두 "점심 식사 미대상"
  const working = (employees ?? []).filter(e => {
    const t = schedMap.get(e.id);
    return t && !isOffType(t) && !isHalfDayType(t);
  });
  const pharmacistCount = working.filter(e => e.position === "약사").length;
  const staffCount = working.length - pharmacistCount;
  const body: LunchAttendanceResponse = { working, pharmacistCount, staffCount, totalCount: working.length };
  res.json(body);
}));

router.get("/api/lunch-requests", asyncHandler(async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("lunch_requests")
    .select("id, employee_id, employee_name, date, eating, memo, updated_at")
    .eq("date", date).order("updated_at", { ascending: true });
  if (error) throw new HttpError(500, error.message);
  const body: LunchRequestsResponse = { requests: (data ?? []) as any, count: (data ?? []).length };
  res.json(body);
}));

router.put("/api/lunch-requests", authorize(1), validateBody(UpsertLunchRequestSchema), asyncHandler(async (req, res) => {
  const { employee_id, employee_name, date, eating, memo } = req.body;
  const { error } = await supabase.from("lunch_requests").upsert(
    { employee_id, employee_name, date, eating, memo: memo || null, updated_at: new Date().toISOString() },
    { onConflict: "employee_id,date" },
  );
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

// 본인 or 관리자만 lunch 삭제
router.delete("/api/lunch-requests", authorize(1), asyncHandler(async (req, res) => {
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
