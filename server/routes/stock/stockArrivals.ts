// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../../src/supabase/client";
import { notificationsService } from "../../services/notificationsService";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, forbidden, notFound, HttpError } from "../../middleware/errorHandler";

const router = Router();

async function broadcastPush(arrivalId: number, title: string, body: string | null) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn("[stock-arrivals] VAPID 키 미설정 — 푸시 브로드캐스트 건너뜀");
    return;
  }
  const payload = JSON.stringify({
    title: `입고 알림: ${title}`,
    body: body ?? title,
    url: "/",
    tag: `stock-arrival-${arrivalId}`,
  });
  const [empRes, anonRes] = await Promise.all([
    supabase.from("employees").select("push_subscription").not("push_subscription", "is", null),
    supabase.from("anon_push_subscriptions").select("id, subscription"),
  ]);
  if (empRes.error) console.warn("[stock-arrivals] 직원 구독 조회 실패:", empRes.error.message);
  if (anonRes.error) console.warn("[stock-arrivals] 비로그인 구독 조회 실패:", anonRes.error.message);

  let sent = 0;
  const expiredAnonIds: number[] = [];
  for (const e of empRes.data ?? []) {
    if (!e.push_subscription) continue;
    try { await webpush.sendNotification(e.push_subscription as webpush.PushSubscription, payload); sent++; }
    catch (err: any) { console.warn("[stock-arrivals] 직원 푸시 실패:", err.statusCode ?? err.message); }
  }
  for (const a of anonRes.data ?? []) {
    if (!a.subscription) continue;
    try {
      await webpush.sendNotification(a.subscription as webpush.PushSubscription, payload); sent++;
    } catch (err: any) {
      console.warn("[stock-arrivals] 비로그인 푸시 실패:", err.statusCode ?? err.message);
      if (err.statusCode === 410 || err.statusCode === 404) expiredAnonIds.push(a.id);
    }
  }
  console.log(`[stock-arrivals] 브로드캐스트 완료: ${sent}명 전송`);
  if (expiredAnonIds.length > 0) {
    await supabase.from("anon_push_subscriptions").delete().in("id", expiredAnonIds);
  }
}

// 예약 발송 스케줄러 (60초 폴링) · 원본 try/catch 유지 (setInterval 은 asyncHandler 부적용)
setInterval(async () => {
  try {
    const { data, error } = await supabase
      .from("stock_arrivals")
      .select("id, title, body")
      .not("scheduled_at", "is", null)
      .eq("broadcast_sent", false)
      .lte("scheduled_at", new Date().toISOString());
    if (error || !data?.length) return;
    for (const row of data) {
      await broadcastPush(row.id, row.title, row.body);
      notificationsService.notifyAllEmployees({
        title: `입고 알림: ${row.title}`,
        body: row.body ?? null,
        type: "info",
      }).catch(() => null);
      await supabase.from("stock_arrivals").update({ broadcast_sent: true }).eq("id", row.id);
      console.log(`[stock-arrivals] 예약 발송 완료: id=${row.id} "${row.title}"`);
    }
  } catch (err: any) {
    console.error("[stock-arrivals] 스케줄러 오류:", err.message);
  }
}, 60_000);

router.get("/api/vapid-public-key", asyncHandler(async (_req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) throw notFound("VAPID_PUBLIC_KEY 미설정");
  res.json({ publicKey });
}));

router.get("/api/stock-arrivals", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("stock_arrivals")
    .select("id, title, body, created_at, created_by_id, scheduled_at, broadcast_sent")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new HttpError(500, error.message);
  res.json(data ?? []);
}));

router.post("/api/stock-arrivals", authorize(3), asyncHandler(async (req, res) => {
  const { title, body, employeeId, send_now, scheduled_at } = req.body ?? {};
  if (!title || !employeeId) throw badRequest("title and employeeId required");
  const { data: emp, error: empErr } = await supabase
    .from("employees").select("level, name").eq("id", employeeId).single();
  if (empErr || !emp) throw forbidden("Unauthorized");
  if ((emp.level ?? 0) < 3) throw forbidden("Level 3+ required");

  const isScheduled = !!scheduled_at && new Date(scheduled_at) > new Date();
  const isSendNow = send_now === true && !isScheduled;

  const { data: arrival, error: insertErr } = await supabase
    .from("stock_arrivals")
    .insert({
      title,
      body: body ?? null,
      created_by_id: employeeId,
      scheduled_at: isScheduled ? scheduled_at : null,
      broadcast_sent: isSendNow,
    })
    .select()
    .single();
  if (insertErr) throw new HttpError(500, insertErr.message);

  if (isSendNow) {
    broadcastPush(arrival.id, title, body ?? null).catch(err =>
      console.error("[stock-arrivals] 브로드캐스트 오류:", err),
    );
    notificationsService.notifyAllEmployees({
      title: `입고 알림: ${title}`,
      body: body ?? null,
      type: "info",
    }).catch(() => null);
  }
  res.status(201).json(arrival);
}));

router.post("/api/stock-arrivals/:id/broadcast", authorize(5), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { employeeId } = req.body ?? {};
  if (!id) throw badRequest("id required");
  if (employeeId) {
    const { data: emp } = await supabase.from("employees").select("level").eq("id", employeeId).maybeSingle();
    if ((emp?.level ?? 0) < 3) throw forbidden("Level 3+ required");
  }
  const { data: row } = await supabase
    .from("stock_arrivals").select("id, title, body").eq("id", id).single();
  if (!row) throw notFound("Not found");
  await broadcastPush(row.id, row.title, row.body);
  notificationsService.notifyAllEmployees({
    title: `입고 알림: ${row.title}`,
    body: row.body ?? null,
    type: "info",
  }).catch(() => null);
  const { data: updated } = await supabase
    .from("stock_arrivals")
    .update({ broadcast_sent: true, scheduled_at: null })
    .eq("id", id).select().single();
  res.json(updated);
}));

router.patch("/api/stock-arrivals/:id", authorize(3), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { title, body, employeeId, scheduled_at } = req.body ?? {};
  if (!id) throw badRequest("id required");
  if (employeeId) {
    const { data: emp } = await supabase.from("employees").select("level").eq("id", employeeId).maybeSingle();
    if ((emp?.level ?? 0) < 3) throw forbidden("Level 3+ required");
  }
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (body !== undefined) updates.body = body ?? null;
  if ("scheduled_at" in req.body) {
    updates.scheduled_at = scheduled_at ?? null;
    if (scheduled_at && new Date(scheduled_at) > new Date()) {
      updates.broadcast_sent = false;
    }
  }
  const { data, error } = await supabase
    .from("stock_arrivals").update(updates).eq("id", id).select().single();
  if (error) throw new HttpError(500, error.message);
  res.json(data);
}));

router.delete("/api/stock-arrivals/:id", authorize(2), asyncHandler(async (req, res) => {
  const { employeeId } = req.body ?? {};
  const id = Number(req.params.id);
  if (!id) throw badRequest("id required");
  if (employeeId) {
    const { data: emp } = await supabase.from("employees").select("level").eq("id", employeeId).maybeSingle();
    if ((emp?.level ?? 0) < 3) throw forbidden("Level 3+ required");
  }
  const { error } = await supabase.from("stock_arrivals").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

router.post("/api/anon-push-subscribe", asyncHandler(async (req, res) => {
  const { subscription } = req.body ?? {};
  if (!subscription?.endpoint) throw badRequest("subscription with endpoint required");
  const { error } = await supabase
    .from("anon_push_subscriptions")
    .upsert({ endpoint: subscription.endpoint, subscription }, { onConflict: "endpoint" });
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

export default router;
