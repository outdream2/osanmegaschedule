import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../src/supabase/client";

const router = Router();

router.get("/api/stock-arrivals", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("stock_arrivals")
      .select("id, title, body, created_at, created_by_id")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return res.json(data ?? []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/api/stock-arrivals", async (req, res) => {
  const { title, body, employeeId } = req.body ?? {};
  if (!title || !employeeId) return res.status(400).json({ error: "title and employeeId required" });
  try {
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("level, name")
      .eq("id", employeeId)
      .single();
    if (empErr || !emp) return res.status(403).json({ error: "Unauthorized" });
    if ((emp.level ?? 0) < 3) return res.status(403).json({ error: "Level 3+ required" });

    const { data: arrival, error: insertErr } = await supabase
      .from("stock_arrivals")
      .insert({ title, body: body ?? null, created_by_id: employeeId })
      .select()
      .single();
    if (insertErr) throw new Error(insertErr.message);

    // Broadcast push (fire-and-forget)
    const payload = JSON.stringify({
      title: `입고 알림: ${title}`,
      body: body ?? title,
      url: "/",
      tag: `stock-arrival-${arrival.id}`,
    });
    (async () => {
      const [{ data: emps }, { data: anons }] = await Promise.all([
        supabase.from("employees").select("push_subscription").not("push_subscription", "is", null),
        supabase.from("anon_push_subscriptions").select("id, subscription"),
      ]);
      const expiredAnonIds: number[] = [];
      for (const e of emps ?? []) {
        if (!e.push_subscription) continue;
        try { await webpush.sendNotification(e.push_subscription as webpush.PushSubscription, payload); } catch (_) {}
      }
      for (const a of anons ?? []) {
        if (!a.subscription) continue;
        try {
          await webpush.sendNotification(a.subscription as webpush.PushSubscription, payload);
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) expiredAnonIds.push(a.id);
        }
      }
      if (expiredAnonIds.length > 0) {
        await supabase.from("anon_push_subscriptions").delete().in("id", expiredAnonIds);
      }
    })().catch(() => {});

    return res.status(201).json(arrival);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/api/anon-push-subscribe", async (req, res) => {
  const { subscription } = req.body ?? {};
  if (!subscription?.endpoint) return res.status(400).json({ error: "subscription with endpoint required" });
  try {
    const { error } = await supabase
      .from("anon_push_subscriptions")
      .upsert({ endpoint: subscription.endpoint, subscription }, { onConflict: "endpoint" });
    if (error) throw new Error(error.message);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
