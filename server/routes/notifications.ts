import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../src/supabase/client";
import { notificationsService } from "../../src/services/notificationsService";

const router = Router();

router.post("/api/push-subscribe", async (req, res) => {
  const { employeeId, subscription } = req.body ?? {};
  if (!employeeId || !subscription) return res.status(400).json({ error: "employeeId and subscription are required" });
  try {
    const { error } = await supabase.from("employees").update({ push_subscription: subscription }).eq("id", employeeId);
    if (error) throw new Error(error.message);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/api/push-send", async (req, res) => {
  const { employeeId, title, body, url } = req.body ?? {};
  if (!employeeId) return res.status(400).json({ error: "employeeId is required" });
  try {
    const { data, error } = await supabase
      .from("employees").select("push_subscription, name").eq("id", employeeId).single();
    if (error || !data) return res.status(404).json({ error: "Employee not found" });
    if (!data.push_subscription) return res.status(200).json({ ok: false, reason: "no_subscription" });
    const payload = JSON.stringify({
      title: title ?? "진열 보충 요청",
      body: body ?? `${data.name}님께 새로운 진열 보충 요청이 도착했습니다.`,
      url: url ?? "/",
      tag: `req-${employeeId}-${Date.now()}`,
    });
    await webpush.sendNotification(data.push_subscription as webpush.PushSubscription, payload);
    return res.json({ ok: true });
  } catch (err: any) {
    if ((err as any).statusCode === 410) {
      await supabase.from("employees").update({ push_subscription: null }).eq("id", employeeId);
      return res.json({ ok: false, reason: "subscription_expired" });
    }
    return res.status(500).json({ error: err.message });
  }
});

router.get("/api/notifications", async (req, res) => {
  const employeeId = parseInt(req.query.employeeId as string);
  if (!employeeId) return res.status(400).json({ error: "employeeId required" });
  const limit = Math.min(parseInt((req.query.limit as string) ?? "30"), 100);
  try {
    const data = await notificationsService.getForEmployee(employeeId, limit);
    return res.json(data);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.patch("/api/notifications/:id/read", async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });
  try {
    await notificationsService.markRead(id);
    return res.json({ ok: true });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.post("/api/notifications/read-all", async (req, res) => {
  const { employeeId } = req.body as { employeeId?: number };
  if (!employeeId) return res.status(400).json({ error: "employeeId required" });
  try {
    await notificationsService.markAllRead(employeeId);
    return res.json({ ok: true });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.post("/api/notifications", async (req, res) => {
  const { employee_id, title, body, type } = req.body as {
    employee_id?: number; title?: string; body?: string; type?: string;
  };
  if (!employee_id || !title) return res.status(400).json({ error: "employee_id and title required" });
  try {
    const data = await notificationsService.create({ employee_id, title, body, type: type as any });
    return res.status(201).json(data);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

export default router;
