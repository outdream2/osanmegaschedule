// 2026-08-16 · 프레임워크 · Express 전역 에러 핸들러
// 마지막 미들웨어로 등록 · asyncHandler 로 throw 된 에러 캐치 · 표준 응답
//   · Zod ZodError · 400 + 첫 issue message
//   · HttpError { status, code } · 명시된 status
//   · 그 외 · 500 + 개발 모드만 스택 노출
import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** 편의 · 자주 쓰는 에러 factory */
export const badRequest = (msg: string, code?: string) => new HttpError(400, msg, code);
export const unauthorized = (msg = "인증이 필요합니다") => new HttpError(401, msg, "UNAUTHORIZED");
export const forbidden = (msg = "권한이 부족합니다") => new HttpError(403, msg, "FORBIDDEN");
export const notFound = (msg = "찾을 수 없습니다") => new HttpError(404, msg, "NOT_FOUND");

export const errorHandler: ErrorRequestHandler = (err, req: Request, res: Response, _next: NextFunction) => {
  const isDev = process.env.NODE_ENV !== "production";
  if (err instanceof ZodError) {
    const msg = err.issues[0]?.message ?? "잘못된 요청 형식";
    console.warn(`[400 ZodError] ${req.method} ${req.originalUrl} · ${msg}`);
    return res.status(400).json({ error: msg, code: "VALIDATION" });
  }
  if (err instanceof HttpError) {
    if (err.status >= 500) console.error(`[${err.status}] ${req.method} ${req.originalUrl} · ${err.message}`);
    else console.warn(`[${err.status}] ${req.method} ${req.originalUrl} · ${err.message}`);
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  // 알 수 없는 에러 · 500
  const message = err?.message ?? "서버 오류";
  console.error(`[500] ${req.method} ${req.originalUrl} · ${message}`, isDev ? err?.stack : "");
  return res.status(500).json({ error: message, ...(isDev ? { stack: err?.stack?.split("\n").slice(0, 5) } : {}) });
};
