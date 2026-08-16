// 2026-08-16 · 프레임워크 · Zod body/query/params 검증 미들웨어
// 사용:
//   const LoginSchema = z.object({ phone: z.string().min(1), password: z.string().min(4) });
//   router.post("/api/auth/login", validateBody(LoginSchema), async (req, res) => {
//     const { phone, password } = req.body; // 이미 검증됨 · 타입 안전
//   });
import type { RequestHandler } from "express";
import { ZodError, type ZodSchema } from "zod";

/** 첫 issue 메시지 반환 · 사용자 노출용 */
export function firstZodError(err: ZodError): string {
  return err.issues[0]?.message ?? "잘못된 요청 형식";
}

/** Body 검증 · req.body 를 parsed 로 교체 (타입 안전) */
export const validateBody = <T>(schema: ZodSchema<T>): RequestHandler => (req, _res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return next(parsed.error); // errorHandler 가 ZodError · 400 자동
  (req as any).body = parsed.data;
  next();
};

/** Query 검증 */
export const validateQuery = <T>(schema: ZodSchema<T>): RequestHandler => (req, _res, next) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return next(parsed.error);
  (req as any).query = parsed.data;
  next();
};

/** Params 검증 */
export const validateParams = <T>(schema: ZodSchema<T>): RequestHandler => (req, _res, next) => {
  const parsed = schema.safeParse(req.params);
  if (!parsed.success) return next(parsed.error);
  (req as any).params = parsed.data;
  next();
};
