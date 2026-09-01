// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../../src/supabase/client";
import { notificationsService } from "../../services/notificationsService";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize } from "../../middleware/requireAuth";
import { badRequest, notFound, HttpError } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";
import { z } from "zod";
import {
  PushSubscribeSchema,
  PushSendSchema,
  ReadAllNotificationsSchema,
  CreateNotificationSchema,
} from "../../../src/shared/schemas/notifications";

const router = Router();

router.post("/api/push-subscribe", authorize(1), validateBody(PushSubscribeSchema), asyncHandler(async (req, res) => {
  const { employeeId, subscription } = req.body;
  const { error } = await supabase.from("employees").update({ push_subscription: subscription }).eq("id", employeeId);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

router.post("/api/push-send", authorize(5), validateBody(PushSendSchema), asyncHandler(async (req, res) => {
  const { employeeId, title, body, url } = req.body;
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

router.patch("/api/notifications/:id/read", authorize(1), validateBody(z.object({})), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) throw badRequest("invalid id");
  await notificationsService.markRead(id);
  res.json({ ok: true });
}));

router.post("/api/notifications/read-all", authorize(1), validateBody(ReadAllNotificationsSchema), asyncHandler(async (req, res) => {
  const { employeeId } = req.body;
  await notificationsService.markAllRead(employeeId);
  res.json({ ok: true });
}));

router.post("/api/notifications", authorize(5), validateBody(CreateNotificationSchema), asyncHandler(async (req, res) => {
  const { employee_id, title, body, type } = req.body;
  const data = await notificationsService.create({ employee_id, title, body, type: type as any });
  res.status(201).json(data);
}));

export default router;
