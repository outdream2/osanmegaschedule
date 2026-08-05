import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../src/supabase/client";
import { scheduleService } from "../../src/services/scheduleService";
import { notificationsService } from "../../src/services/notificationsService";

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

router.get("/api/leave-requests", async (req, res) => {
  const { employeeId, all } = req.query;
  try {
    let q = supabase.from("leave_requests").select("*").order("created_at", { ascending: false });
    if (all !== "true" && employeeId) q = q.eq("employee_id", Number(employeeId));
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return res.json(data ?? []);
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

    const { data: managers } = await supabase.from("employees").select("id, push_subscription").eq("is_manager", true);
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
      const { data: managers } = await supabase.from("employees").select("id").gte("level", 2);
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
