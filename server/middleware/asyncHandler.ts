// 2026-08-16 · 프레임워크 · Express async 핸들러 wrapper
// 사용: router.get("/api/x", asyncHandler(async (req, res) => { ... throw ... }))
//   throw · errorHandler 미들웨어로 자동 전달 · 각 route try/catch 제거
import type { Request, Response, NextFunction, RequestHandler } from "express";

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
