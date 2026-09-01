// 2026-08-16 · 프레임워크 · 클라이언트 에러 수집 · audit 로 통합
// POST /api/client-errors · { errors: [{ message, source, stack, url, ua, timestamp }] }
// 로그 파일 · logs/audit-*.log (winston · client_error 이벤트)
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/zodValidate";
import { audit, auditContext } from "../../lib/auditLogger";

const router = Router();

const ClientErrorSchema = z.object({
  errors: z.array(z.object({
    message: z.string().max(2000),
    source: z.string().max(50),
    stack: z.string().max(4000).optional(),
    url: z.string().max(500),
    ua: z.string().max(500),
    timestamp: z.number(),
  })).max(20),
});

// 2026-08-27 · client-errors 는 · 로그인 이전 브라우저 에러도 접수 · authorize 미적용 (익명 로그) · audit:no-authorize
router.post("/api/client-errors", validateBody(ClientErrorSchema), asyncHandler(async (req, res) => {
  const { errors } = req.body;
  const ctx = auditContext(req);
  for (const err of errors) {
    audit("CLIENT_ERROR", {
      ...ctx,
      message: err.message,
      source: err.source,
      url: err.url,
      stack: err.stack?.split("\n").slice(0, 10).join("\n"), // stack 앞 10줄
      clientTimestamp: err.timestamp,
    }, "warn");
  }
  res.json({ ok: true, received: errors.length });
}));

export default router;
