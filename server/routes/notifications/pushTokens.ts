// server/routes/notifications/pushTokens.ts
// #328 · iOS 앱 Expo 푸시 알림 · 토큰 CRUD + test endpoint
// 2026-09-21 · 사용자 지시 · WebView 앱 v1.0.1 · 앱 개발자 가이드 수령
//
// Endpoints:
//   POST   /api/push-token          · body { token, platform } · authorize(1) · upsert (reassign 지원)
//   DELETE /api/push-token/:token   · authorize(1) · 본인 토큰 삭제 (로그아웃 시)
//   POST   /api/push-token/test     · authorize(1) · 본인에게 테스트 알림 발송
//
// 프레임워크: asyncHandler + HttpError + validateBody(Zod) + authorize

import { Router } from "express";
import { z } from "zod";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize } from "../../middleware/requireAuth";
import { validateBody } from "../../middleware/zodValidate";
import { badRequest, HttpError } from "../../middleware/errorHandler";
import { sendPush } from "../../services/expoPushService";
import logger from "../../lib/logger";
import type { AuthedRequest } from "../../types/auth";

const router = Router();

// ─────────────────────────────────────────────────
// Zod 스키마
// ─────────────────────────────────────────────────
const RegisterTokenSchema = z.object({
  token: z.string().min(10, "token 필수").max(500, "token 이 너무 깁니다"),
  platform: z.enum(["ios", "android", "web"]),
});

// ─────────────────────────────────────────────────
// POST /api/push-token
// · body { token, platform }
// · 로그인한 유저의 token 등록 (upsert)
// · token 이 다른 user 에게 이미 있으면 · 소유권 이전 (앱 재설치 · 유저 전환)
// ─────────────────────────────────────────────────
router.post(
  "/api/push-token",
  authorize(1),
  validateBody(RegisterTokenSchema),
  asyncHandler(async (req, res) => {
    const authUser = (req as AuthedRequest).authUser;
    const userId = Number(authUser?.sub ?? 0);
    if (!userId) throw new HttpError(401, "인증 정보 없음", "UNAUTHORIZED");
    const { token, platform } = req.body as { token: string; platform: string };

    // 1) 기존 token 존재 확인
    const { data: existing, error: fetchErr } = await supabase
      .from("push_tokens")
      .select("id, user_id")
      .eq("token", token)
      .maybeSingle();
    if (fetchErr) throw new HttpError(500, fetchErr.message);

    if (existing) {
      // 존재 · user_id 갱신 (재할당) + active=true + last_used_at 갱신
      const { error: updErr } = await supabase
        .from("push_tokens")
        .update({
          user_id: userId,
          platform,
          active: true,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updErr) throw new HttpError(500, updErr.message);
      const reassigned = Number(existing.user_id) !== userId;
      logger.debug(`[PUSH-TOKEN] ${reassigned ? "reassign" : "refresh"} · user=${userId} · platform=${platform} · token=${token.slice(0, 32)}...`);
      res.json({ ok: true, action: reassigned ? "reassigned" : "refreshed" });
      return;
    }

    // 신규 삽입
    const { error: insErr } = await supabase.from("push_tokens").insert({
      user_id: userId,
      token,
      platform,
      active: true,
    });
    if (insErr) throw new HttpError(500, insErr.message);
    logger.debug(`[PUSH-TOKEN] insert · user=${userId} · platform=${platform} · token=${token.slice(0, 32)}...`);
    res.json({ ok: true, action: "created" });
  }),
);

// ─────────────────────────────────────────────────
// DELETE /api/push-token/:token
// · 로그아웃 시 · 본인 토큰만 삭제 가능
// ─────────────────────────────────────────────────
router.delete(
  "/api/push-token/:token",
  authorize(1),
  asyncHandler(async (req, res) => {
    const authUser = (req as AuthedRequest).authUser;
    const userId = Number(authUser?.sub ?? 0);
    if (!userId) throw new HttpError(401, "인증 정보 없음", "UNAUTHORIZED");
    const token = String(req.params.token ?? "");
    if (!token) throw badRequest("token required");

    // 본인 소유 토큰만 삭제 (admin 은 전체 삭제 가능)
    let q = supabase.from("push_tokens").delete().eq("token", token);
    if (Number(authUser?.level ?? 0) < 9) {
      q = q.eq("user_id", userId);
    }
    const { error } = await q;
    if (error) throw new HttpError(500, error.message);
    logger.debug(`[PUSH-TOKEN] delete · user=${userId} · token=${token.slice(0, 32)}...`);
    res.json({ ok: true });
  }),
);

// ─────────────────────────────────────────────────
// POST /api/push-token/test
// · 본인에게 테스트 알림 발송 (admin 이 다른 사용자도 지정 가능)
// ─────────────────────────────────────────────────
const TestPushSchema = z.object({
  targetUserId: z.number().int().positive().optional(),
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
});

router.post(
  "/api/push-token/test",
  authorize(1),
  validateBody(TestPushSchema),
  asyncHandler(async (req, res) => {
    const authUser = (req as AuthedRequest).authUser;
    const userId = Number(authUser?.sub ?? 0);
    if (!userId) throw new HttpError(401, "인증 정보 없음", "UNAUTHORIZED");
    const { targetUserId, title, body } = req.body as {
      targetUserId?: number;
      title?: string;
      body?: string;
    };
    // admin (lv>=9) 만 다른 유저 지정 가능
    let sendTo = userId;
    if (typeof targetUserId === "number") {
      if (Number(authUser?.level ?? 0) < 9 && targetUserId !== userId) {
        throw new HttpError(403, "다른 사용자에게 발송할 권한이 없습니다", "FORBIDDEN");
      }
      sendTo = targetUserId;
    }

    const result = await sendPush({
      userId: sendTo,
      title: title ?? "테스트 알림",
      body: body ?? "Expo 푸시 알림이 정상 작동합니다.",
      url: "/",
    });
    res.json({ ok: true, result });
  }),
);

export default router;
