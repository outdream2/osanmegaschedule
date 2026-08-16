// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../../src/supabase/client";
import { notificationsService } from "../../services/notificationsService";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, notFound, HttpError } from "../../middleware/errorHandler";

const router = Router();

router.post("/api/push-subscribe", asyncHandler(async (req, res) => {
  const { employeeId, subscription } = req.body ?? {};
  if (!employeeId || !subscription) throw badRequest("employeeId and subscription are required");
  const { error } = await supabase.from("employees").update({ push_subscription: subscription }).eq("id", employeeId);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

router.post("/api/push-send", asyncHandler(async (req, res) => {
  const { employeeId, title, body, url } = req.body ?? {};
  if (!employeeId) throw badRequest("employeeId is required");
  const { data, error } = await supabase
    .from("employees").select("push_subscription, name").eq("id", employeeId).single();
  if (error || !data) throw notFound("Employee not found");
  if (!data.push_subscription) return res.json({ ok: false, reason: "no_subscription" });
  const payload = JSON.stringify({
    title: title ?? "진열 보충 요청",
    body: body ?? `${data.name}님께 새로운 진열 보충 요청이 도착했습니다.`,
    url: url ?? "/",
    tag: `req-${employeeId}-${Date.now()}`,
  });
  try {
    await webpush.sendNotification(data.push_subscription as webpush.PushSubscription, payload);
  } catch (err: any) {
    if ((err as any).statusCode === 410) {
      await supabase.from("employees").update({ push_subscription: null }).eq("id", employeeId);
      return res.json({ ok: false, reason: "subscription_expired" });
    }
    throw new HttpError(500, err.message);
  }
  res.json({ ok: true });
}));

// T-SLIM E · 표준 shape 주석 · List endpoint
// 현재: res.json(array) · 직접 배열 반환 · 프론트 소비 패턴과 breaking 없이 유지
// 미래 v2: { rows: array, count: number } 로 전환 예정 (프론트 마이그레이션 후)
router.get("/api/notifications", asyncHandler(async (req, res) => {
  const employeeId = parseInt(req.query.employeeId as string);
  if (!employeeId) throw badRequest("employeeId required");
  const limit = Math.min(parseInt((req.query.limit as string) ?? "30"), 100);
  const data = await notificationsService.getForEmployee(employeeId, limit);
  res.json(data);
}));

router.patch("/api/notifications/:id/read", asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) throw badRequest("invalid id");
  await notificationsService.markRead(id);
  res.json({ ok: true });
}));

router.post("/api/notifications/read-all", asyncHandler(async (req, res) => {
  const { employeeId } = req.body as { employeeId?: number };
  if (!employeeId) throw badRequest("employeeId required");
  await notificationsService.markAllRead(employeeId);
  res.json({ ok: true });
}));

router.post("/api/notifications", asyncHandler(async (req, res) => {
  const { employee_id, title, body, type } = req.body as {
    employee_id?: number; title?: string; body?: string; type?: string;
  };
  if (!employee_id || !title) throw badRequest("employee_id and title required");
  const data = await notificationsService.create({ employee_id, title, body, type: type as any });
  res.status(201).json(data);
}));

export default router;
