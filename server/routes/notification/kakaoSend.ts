// server/routes/notification/kakaoSend.ts
// 2026-08-29 · #176/#214 · 발주요청 · 물류팀장 카카오 알림톡 전송 API (뼈대)
//
// 프레임워크 준수:
//   · asyncHandler        · try/catch 자동 처리
//   · HttpError/badRequest · 표준 에러 응답
//   · authorize(3)         · 매니저(3) 이상 (물류·발주 담당)
//   · zod                  · 요청 body 스키마 검증
//
// 엔드포인트:
//   POST /api/notifications/kakao-send
//   body: { to: string · templateId: string · variables?: Record<string,string> · attachmentUrl?: string }
//   응답: { ok: boolean · reason?: string · messageId?: string }
//
// 현재 동작:
//   · KAKAO_API_KEY 미설정 시 · 200 + { ok: false, reason: "카카오 API 미구성" }
//   · 설정 시 · kakaoNotifyService 로 위임 (Solapi 등 벤더 호출)
//
// 향후 벤더 연결 지점 (사업자 등록 완료 후):
//   · Solapi (기존 · server/lib/notification/solapiClient.ts)
//   · NHN Cloud Notification (https://www.toast.com/service/notification/kakao-alimtalk)
//   · 알리고 (https://smartsms.aligo.in)
//   · Bizppurio (https://www.bizppurio.com)
//   → 위 중 하나 선택 후 · kakaoNotifyService.ts 내부만 교체 (이 라우트 파일은 변경 불필요)

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize } from "../../middleware/requireAuth";
import { badRequest } from "../../middleware/errorHandler";
import { sendKakaoAlimtalk, isKakaoConfigured } from "../../services/kakaoNotifyService";

const router = Router();

// ─────────────────────────────────────────────────────
// Zod 스키마 · body 검증
// ─────────────────────────────────────────────────────
const kakaoSendBodySchema = z.object({
  to: z
    .string()
    .trim()
    .min(9, "수신자 전화번호는 최소 9자 이상")
    .refine((v) => /^[0-9\-+ ]+$/.test(v), "전화번호 형식이 올바르지 않습니다 (숫자·하이픈만)"),
  templateId: z.string().trim().min(1, "templateId 는 필수입니다"),
  variables: z.record(z.string(), z.string()).optional(),
  attachmentUrl: z.string().url("attachmentUrl 은 유효한 URL 이어야 합니다").optional(),
});

// ─────────────────────────────────────────────────────
// POST /api/notifications/kakao-send · authorize(3) · 매니저 이상
// ─────────────────────────────────────────────────────
router.post(
  "/api/notifications/kakao-send",
  authorize(3),
  asyncHandler(async (req, res) => {
    const parsed = kakaoSendBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw badRequest(parsed.error.issues[0]?.message ?? "잘못된 요청 형식");
    }
    const { to, templateId, variables, attachmentUrl } = parsed.data;

    const result = await sendKakaoAlimtalk({
      to,
      templateId,
      vars: variables,
      attachment: attachmentUrl,
    });

    // 미구성/벤더 실패도 · 200 응답 · body 로 ok:false 전달 (프론트 배너 처리 용이)
    // (인증·검증 실패만 4xx · 실제 발송 실패는 200)
    res.json({
      ok: result.ok,
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.messageId ? { messageId: result.messageId } : {}),
    });
  }),
);

// ─────────────────────────────────────────────────────
// GET /api/notifications/kakao-send/status · 설정 여부 조회 (UI 배너용)
//   · 발주요청 화면에서 · "카톡 전송 미구성" 안내 표시할 때 사용
//   · authorize(3) 동일 (매니저 이상)
// ─────────────────────────────────────────────────────
router.get(
  "/api/notifications/kakao-send/status",
  authorize(3),
  asyncHandler(async (_req, res) => {
    const status = isKakaoConfigured();
    res.json({
      configured: status.configured,
      missing_env: status.missing,
      docs: "/docs/KAKAO_SETUP.md",
    });
  }),
);

export default router;
