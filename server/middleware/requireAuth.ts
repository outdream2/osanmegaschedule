// server/middleware/requireAuth.ts
// 2026-08-05 · T3 · API 인증 미들웨어
//
// 역할:
//   requireAuth        — 로그인(유효 JWT) 여부만 확인 · 미로그인 401
//   authorize(minLvl)  — 최소 level 체크 · 부족하면 403
//   issueToken(payload)— 로그인 성공 후 JWT 발급 헬퍼
//   clearToken(res)    — 로그아웃 시 쿠키 제거 헬퍼
//
// JWT 전달 방식:
//   1) httpOnly 쿠키 "mt_auth" (웹 브라우저 · 기본)
//   2) Authorization: Bearer <token> 헤더 (API 클라이언트 호환)
//
// 토큰 수명: 24h (rememberMe=true 인 경우 30d)

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";
const COOKIE_NAME = "mt_auth";
const DEFAULT_MAX_AGE = 24 * 60 * 60;     // 24h  (seconds)
const REMEMBER_MAX_AGE = 30 * 24 * 60 * 60; // 30d

if (!JWT_SECRET) {
  console.warn(
    "[requireAuth] WARNING: JWT_SECRET 환경변수가 설정되지 않았습니다. " +
    ".env 에 JWT_SECRET 를 추가하세요."
  );
}

export interface JwtPayload {
  sub: number;       // employee id
  name: string;
  role: string;
  level: number;
  rememberMe?: boolean;
}

// ─────────────────────────────────────────────────
// 헬퍼: 토큰 발급
// ─────────────────────────────────────────────────
export function issueToken(
  res: Response,
  payload: JwtPayload,
  rememberMe = false,
): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");
  const expiresIn = rememberMe ? "30d" : "24h";
  const maxAge = rememberMe ? REMEMBER_MAX_AGE : DEFAULT_MAX_AGE;
  const token = jwt.sign(payload, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: maxAge * 1000, // ms
    path: "/",
  });
  return token;
}

// ─────────────────────────────────────────────────
// 헬퍼: 쿠키 제거 (로그아웃)
// ─────────────────────────────────────────────────
export function clearToken(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

// ─────────────────────────────────────────────────
// 내부: 요청에서 JWT 추출 · 검증
// ─────────────────────────────────────────────────
function extractPayload(req: Request): JwtPayload | null {
  if (!JWT_SECRET) return null;

  // 1) httpOnly 쿠키 우선
  const cookieToken = req.cookies?.[COOKIE_NAME] as string | undefined;
  // 2) Authorization: Bearer <token> fallback
  const authHeader = req.headers["authorization"];
  const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  const token = cookieToken || bearerToken;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    return decoded as unknown as JwtPayload;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────
// 미들웨어: 로그인 확인 (level 무관)
// ─────────────────────────────────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const payload = extractPayload(req);
  if (!payload) {
    res.status(401).json({ error: "인증이 필요합니다. 다시 로그인해주세요.", code: "UNAUTHORIZED" });
    return;
  }
  // req 에 payload 첨부 — 이후 핸들러에서 req.authUser 로 참조 가능
  (req as any).authUser = payload;
  next();
}

// ─────────────────────────────────────────────────
// 미들웨어 팩토리: 최소 level 확인
// authorize(9) → 최고관리자만 / authorize(2) → manager 이상
// ─────────────────────────────────────────────────
export function authorize(minLevel: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const payload = extractPayload(req);
    if (!payload) {
      res.status(401).json({ error: "인증이 필요합니다. 다시 로그인해주세요.", code: "UNAUTHORIZED" });
      return;
    }
    (req as any).authUser = payload;
    if ((payload.level ?? 0) < minLevel) {
      res.status(403).json({ error: "권한이 부족합니다.", code: "FORBIDDEN" });
      return;
    }
    next();
  };
}
