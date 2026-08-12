import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../../src/supabase/client";
import { scheduleService } from "../../services/scheduleService";
import { notificationsService } from "../../services/notificationsService";

const router = Router();

router.get("/api/leave-stats", async (req, res) => {
  const { year } = req.query;
  if (!year || typeof year !== "string") return res.status(400).json({ error: "year required" });
  try {
    const { data, error } = await supabase
      .from("schedules").select("employeeId").like("date", `${year}-%`).eq("type", "월차");
    if (error) throw new Error(error.message);
    const counts: Record<number, number> = {};
    for (const row of (data ?? [])) {
      const id = row.employeeId as number;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return res.json(counts);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

// T-SLIM E · 표준 shape 주석 · List endpoint
// 현재: res.json(array) · 직접 배열 반환 · 프론트 소비 패턴과 breaking 없이 유지
// 미래 v2: { rows: array, count: number } 로 전환 예정 (프론트 마이그레이션 후)
router.get("/api/leave-requests", async (req, res) => {
  const { employeeId, all } = req.query;
  try {
    let q = supabase.from("leave_requests").select("id, employee_id, employee_name, leave_type, start_date, end_date, reason, status, reviewer_note, created_at, reviewed_at").order("created_at", { ascending: false });
    if (all !== "true" && employeeId) q = q.eq("employee_id", Number(employeeId));
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return res.json(data ?? []);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

// 2026-08-12 · 남은 연차 잔여 계산 · GET /api/leave-balance?employeeId=X
//   · total   · employees.annual_leave_days (없으면 15 default)
//   · used    · leave_requests status=approved · 차감 규칙:
//               연차·월차 = (end-start+1) 일 · 반차/오전반차/오후반차 = 0.5일 · 병가/특별휴가 = 0일
//   · remaining = total - used
router.get("/api/leave-balance", async (req, res) => {
  const { employeeId } = req.query;
  if (!employeeId) return res.status(400).json({ error: "employeeId required" });
  try {
    const empIdNum = Number(employeeId);
    const { data: emp, error: empErr } = await supabase
      .from("employees").select("annual_leave_days").eq("id", empIdNum).maybeSingle();
    if (empErr) throw new Error(empErr.message);
    const total = Number(emp?.annual_leave_days ?? 15);

    const { data: rows, error: reqErr } = await supabase
      .from("leave_requests")
      .select("leave_type, start_date, end_date")
      .eq("employee_id", empIdNum).eq("status", "approved");
    if (reqErr) throw new Error(reqErr.message);

    let used = 0;
    for (const r of (rows ?? [])) {
      const t = String(r.leave_type ?? "");
      if (t === "병가" || t === "특별휴가") continue;
      if (t === "반차" || t === "오전반차" || t === "오후반차") { used += 0.5; continue; }
      // 연차·월차·기타 → 일수 계산 (end - start + 1)
      const s = new Date(String(r.start_date) + "T00:00:00");
      const e = new Date(String(r.end_date) + "T00:00:00");
      const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
      used += days;
    }

    return res.json({ total, used, remaining: Math.max(0, total - used) });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.get("/api/leave-requests/pending-count", async (_req, res) => {
  try {
    const { count, error } = await supabase
      .from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending");
    if (error) throw new Error(error.message);
    return res.json({ count: count ?? 0 });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.post("/api/leave-requests", async (req, res) => {
  const { employee_id, employee_name, leave_type, start_date, end_date, reason } = req.body ?? {};
  if (!employee_id || !employee_name || !leave_type || !start_date || !end_date) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  try {
    const { data, error } = await supabase.from("leave_requests").insert([{
      employee_id: Number(employee_id),
      employee_name,
      leave_type,
      start_date,
      end_date,
      reason: reason ?? "",
      status: "pending",
    }]).select().single();
    if (error) throw new Error(error.message);

    // 2026-08-13 · #107 · 컬럼 통일 · is_manager → level >= 9 (auth.ts 진실의 원천)
    const { data: managers } = await supabase.from("employees").select("id, push_subscription").gte("level", 9);
    if (managers) {
      await Promise.allSettled(managers
        .filter(m => m.push_subscription)
        .map(m => webpush.sendNotification(
          m.push_subscription as webpush.PushSubscription,
          JSON.stringify({
            title: "연차 신청 도착",
            body: `${employee_name}님이 ${leave_type}을(를) 신청했습니다.`,
            url: "/",
            tag: `leave-new-${data?.id}`,
          })
        ).catch(() => null))
      );
    }
    return res.status(201).json(data);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.put("/api/leave-requests/:id", async (req, res) => {
  const { status, reviewer_note } = req.body ?? {};
  if (!status || !["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
  }
  try {
    const { data, error } = await supabase
      .from("leave_requests")
      .update({ status, reviewer_note: reviewer_note ?? "", reviewed_at: new Date().toISOString() })
      .eq("id", req.params.id).select().single();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: "not found" });

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
          }))
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
        })
      ).catch(() => null);
    }

    if (status === "approved") {
      // 2026-08-13 · #107 · 관리자 판별 통일 · level >= 9
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
              }).catch(() => null)
            )
        );
      }
    }

    return res.json(data);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.delete("/api/leave-requests/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("leave_requests").delete().eq("id", req.params.id).eq("status", "pending");
    if (error) throw new Error(error.message);
    return res.json({ ok: true });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

export default router;
