// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
// try/catch 7곳 · res.status(...).json({error}) 반복 제거
import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../../src/supabase/client";
import { scheduleService } from "../../services/scheduleService";
import { notificationsService } from "../../services/notificationsService";
import { checkOwnershipOrAdmin } from "../../lib/ownershipCheck";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, notFound, HttpError } from "../../middleware/errorHandler";

const router = Router();

router.get("/api/leave-stats", asyncHandler(async (req, res) => {
  const { year } = req.query;
  if (!year || typeof year !== "string") throw badRequest("year required");
  const { data, error } = await supabase
    .from("schedules").select("employeeId").like("date", `${year}-%`).eq("type", "월차");
  if (error) throw new HttpError(500, error.message);
  const counts: Record<number, number> = {};
  for (const row of (data ?? [])) {
    const id = row.employeeId as number;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  res.json(counts);
}));

// T-SLIM E · List endpoint · 현재 array 반환 · v2 { rows, count } 예정
router.get("/api/leave-requests", asyncHandler(async (req, res) => {
  const { employeeId, all } = req.query;
  let q = supabase.from("leave_requests")
    .select("id, employee_id, employee_name, leave_type, start_date, end_date, reason, status, reviewer_note, created_at, reviewed_at")
    .order("created_at", { ascending: false });
  if (all !== "true" && employeeId) q = q.eq("employee_id", Number(employeeId));
  const { data, error } = await q;
  if (error) throw new HttpError(500, error.message);
  res.json(data ?? []);
}));

// 남은 연차 잔여 계산
router.get("/api/leave-balance", asyncHandler(async (req, res) => {
  const { employeeId } = req.query;
  if (!employeeId) throw badRequest("employeeId required");
  const empIdNum = Number(employeeId);
  const { data: emp, error: empErr } = await supabase
    .from("employees").select("annual_leave_days").eq("id", empIdNum).maybeSingle();
  if (empErr) throw new HttpError(500, empErr.message);
  const total = Number(emp?.annual_leave_days ?? 15);

  const { data: rows, error: reqErr } = await supabase
    .from("leave_requests")
    .select("leave_type, start_date, end_date")
    .eq("employee_id", empIdNum).eq("status", "approved");
  if (reqErr) throw new HttpError(500, reqErr.message);

  let used = 0;
  for (const r of (rows ?? [])) {
    const t = String(r.leave_type ?? "");
    if (t === "병가" || t === "특별휴가") continue;
    if (t === "반차" || t === "오전반차" || t === "오후반차") { used += 0.5; continue; }
    const s = new Date(String(r.start_date) + "T00:00:00");
    const e = new Date(String(r.end_date) + "T00:00:00");
    const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
    used += days;
  }
  res.json({ total, used, remaining: Math.max(0, total - used) });
}));

router.get("/api/leave-requests/pending-count", asyncHandler(async (_req, res) => {
  const { count, error } = await supabase
    .from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending");
  if (error) throw new HttpError(500, error.message);
  res.json({ count: count ?? 0 });
}));

router.post("/api/leave-requests", asyncHandler(async (req, res) => {
  const { employee_id, employee_name, leave_type, start_date, end_date, reason } = req.body ?? {};
  if (!employee_id || !employee_name || !leave_type || !start_date || !end_date) throw badRequest("필수 항목이 누락되었습니다.");
  const { data, error } = await supabase.from("leave_requests").insert([{
    employee_id: Number(employee_id),
    employee_name,
    leave_type,
    start_date,
    end_date,
    reason: reason ?? "",
    status: "pending",
  }]).select().single();
  if (error) throw new HttpError(500, error.message);

  notificationsService.notifyAllAdmins({
    title: "연차 신청 도착",
    body: `${employee_name}님이 ${leave_type} (${start_date} ~ ${end_date}) 신청.`,
    type: "info",
    push: { url: "/", tag: `leave-new-${data?.id}` },
  }).catch(() => null);
  res.status(201).json(data);
}));

router.put("/api/leave-requests/:id", asyncHandler(async (req, res) => {
  const { status, reviewer_note } = req.body ?? {};
  if (!status || !["approved", "rejected"].includes(status)) throw badRequest("status must be 'approved' or 'rejected'");
  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status, reviewer_note: reviewer_note ?? "", reviewed_at: new Date().toISOString() })
    .eq("id", req.params.id).select().single();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw notFound();

  const label = status === "approved" ? "승인" : "반려";

  if (status === "approved") {
    const scheduleType = ["오전반차", "오후반차"].includes(data.leave_type) ? data.leave_type : "월차";
    const dates: string[] = [];
    const cur = new Date(data.start_date + "T00:00:00");
    const end = new Date(data.end_date + "T00:00:00");
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    if (dates.length > 0) {
      await scheduleService.batchUpdateSchedules(
        dates.map(date => ({
          employeeId: data.employee_id,
          date,
          type: scheduleType,
          workingHours: "",
          actualHours: "",
          memo: `연차 승인 (${data.leave_type})`,
        })),
      ).catch(() => null);
    }
  }

  const { data: emp } = await supabase.from("employees").select("push_subscription").eq("id", data.employee_id).maybeSingle();

  await notificationsService.create({
    employee_id: data.employee_id,
    title: `연차 신청 ${label}`,
    body: `${data.leave_type} (${data.start_date} ~ ${data.end_date}) 신청이 ${label}되었습니다.${reviewer_note ? ` — ${reviewer_note}` : ""}`,
    type: status === "approved" ? "success" : "alert",
  }).catch(() => null);

  if (emp?.push_subscription) {
    await webpush.sendNotification(
      emp.push_subscription as webpush.PushSubscription,
      JSON.stringify({
        title: `연차 신청 ${label}`,
        body: `${data.leave_type} 신청이 ${label}되었습니다.${reviewer_note ? ` (${reviewer_note})` : ""}`,
        url: "/",
        tag: `leave-reviewed-${data.id}`,
      }),
    ).catch(() => null);
  }

  if (status === "approved") {
    const { data: managers } = await supabase.from("employees").select("id").gte("level", 9);
    if (managers && managers.length > 0) {
      await Promise.all(
        managers
          .filter(m => m.id !== data.employee_id)
          .map(m =>
            notificationsService.create({
              employee_id: m.id,
              title: "연차 자동 반영",
              body: `${data.employee_name}님의 ${data.leave_type} (${data.start_date} ~ ${data.end_date})이 승인되어 스케줄에 반영되었습니다.`,
              type: "info",
            }).catch(() => null),
          ),
      );
    }
  }
  res.json(data);
}));

// #112-E1 Phase 2 · 본인 or 관리자만 삭제
router.delete("/api/leave-requests/:id", asyncHandler(async (req, res) => {
  const check = await checkOwnershipOrAdmin(req, { table: "leave_requests", id: req.params.id });
  if (check.ok !== true) throw new HttpError(check.status, check.error);
  if (!check.isAdmin && check.row?.status !== "pending") throw badRequest("승인/거절된 요청은 삭제할 수 없습니다");
  const { error } = await supabase.from("leave_requests").delete().eq("id", req.params.id).eq("status", "pending");
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

export default router;
