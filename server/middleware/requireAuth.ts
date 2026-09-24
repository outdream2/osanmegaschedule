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
import crypto from "crypto";
import logger from "../lib/logger";
import type { AuthedRequest } from "../types/auth";

/**
 * 2026-08-18 · JWT_SECRET 자동 파생 (프로젝트 내 해결)
 *   1순위 · process.env.JWT_SECRET (명시적 설정 · 우선)
 *   2순위 · SUPABASE_KEY 로부터 HMAC-SHA256 파생 (deterministic · 재배포 유지)
 *   3순위 · 모두 없으면 빈 문자열 (부팅 warn · 인증 비활성)
 *
 * 파생 이유:
 *   · Render 대시보드에 JWT_SECRET 추가 없이 배포 성공
 *   · SUPABASE_KEY 는 이미 필수 env (동일 보안 수준)
 *   · deterministic → 재배포·재시작 시 토큰 유효성 유지
 *   · HMAC-SHA256 · 32바이트 · 강력한 secret
 *   · 명시적으로 JWT_SECRET 설정 시 · 그 값 우선 (rotate 가능)
 */
function deriveJwtSecret(): string {
  const explicit = process.env.JWT_SECRET;
  if (explicit && explicit.trim().length >= 16) return explicit;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (supabaseKey && supabaseKey.trim().length >= 16) {
    // HMAC-SHA256(SUPABASE_KEY, "mt-jwt-v1") · 32바이트 hex (64자)
    return crypto.createHmac("sha256", supabaseKey).update("mt-jwt-v1").digest("hex");
  }
  return "";
}

const JWT_SECRET = deriveJwtSecret();
const COOKIE_NAME = "mt_auth";               // Access token (짧게 · API 호출용)
const REFRESH_COOKIE_NAME = "mt_refresh";    // 2026-08-16 · #112-S10 · Refresh token (길게 · access 갱신용)

// ─────────────────────────────────────────────────
// 2026-09-01 · SSO jti 재사용 방지 · 인메모리 캐시 (Redis-less)
//   · SSO 토큰 소비 시 jti 를 5분 TTL 캐시에 저장
//   · 동일 jti 두 번째 소비 시 401
//   · Map<jti, expiresAt> · 만료된 항목 자동 정리
// ─────────────────────────────────────────────────
const _consumedSsoJtis = new Map<string, number>(); // jti → expiresAt (ms)
const SSO_JTI_TTL_MS = 5 * 60 * 1000; // 5분

/** SSO jti 소비 여부 확인 + 등록. 이미 소비된 jti 면 true 반환 (재사용 = 공격) */
export function consumeSsoJti(jti: string): boolean {
  const now = Date.now();
  // 만료된 항목 정리 (메모리 누수 방지)
  for (const [k, exp] of _consumedSsoJtis) {
    if (now > exp) _consumedSsoJtis.delete(k);
  }
  if (_consumedSsoJtis.has(jti)) return true; // 이미 소비됨
  _consumedSsoJtis.set(jti, now + SSO_JTI_TTL_MS);
  return false;
}

// 2026-08-16 · #112-S10 · Access + Refresh 분리
// 2026-09-24 · 앱 세션 유지 · 사용자 지시 · Option A (RTR) · 최신 트렌드 표준
//   Access · 15분 (짧게 · 탈취 시 노출 최소)
//   Refresh (web) · 30일 · 회전 (rolling)
//   Refresh (mobile-app) · 90일 · 회전 (rolling · X-Client-Type: mobile-app 헤더 감지)
//   회전 (RTR) · refresh 사용 시마다 · 새 refresh 발급 · 실질 무한 세션 · 미사용 90일 만료
const ACCESS_MAX_AGE = 15 * 60;              // 15분 (seconds)
const REFRESH_MAX_AGE_WEB = 30 * 24 * 60 * 60;      // 30일 (웹)
const REFRESH_MAX_AGE_MOBILE = 90 * 24 * 60 * 60;   // 90일 (앱)
const REFRESH_MAX_AGE = REFRESH_MAX_AGE_WEB;        // default (기존 export 호환)
const DEFAULT_MAX_AGE = ACCESS_MAX_AGE;      // 하위호환 export
const REMEMBER_MAX_AGE = REFRESH_MAX_AGE;

// 2026-09-24 · 사용자 지시 · 클라이언트 유형 감지 · X-Client-Type 헤더
//   · web (default) · 30일 refresh
//   · mobile-app · 90일 refresh · 앱 무한 세션 (회전 · 사용 시마다 갱신)
function detectClientType(req: Request): "web" | "mobile-app" {
  const h = String(req.headers["x-client-type"] ?? "").toLowerCase().trim();
  if (h === "mobile-app" || h === "app" || h === "mobile") return "mobile-app";
  const ua = String(req.headers["user-agent"] ?? "");
  if (/osan-app|osanmega-app/i.test(ua)) return "mobile-app";
  return "web";
}

if (!JWT_SECRET) {
  logger.warn("[requireAuth] WARNING: JWT_SECRET 없음 + SUPABASE_KEY 도 없음 · 인증 비활성. SUPABASE_KEY 설정 시 자동 파생 됩니다.");
} else if (!process.env.JWT_SECRET) {
  logger.info("[requireAuth] JWT_SECRET · SUPABASE_KEY 로부터 자동 파생 (HMAC-SHA256). 명시적 설정 원하면 process.env.JWT_SECRET 에 값 지정.");
}

export interface JwtPayload {
  sub: number;       // employee id
  name: string;
  role: string;
  level: number;
  rememberMe?: boolean;
  /** 2026-08-16 · S10 · "refresh" 이면 refresh token · 그 외 access */
  typ?: "access" | "refresh" | "sso";
  /** 2026-09-01 · SSO jti 재사용 방지 */
  jti?: string;
}

// ─────────────────────────────────────────────────
// 헬퍼: 토큰 발급 · 2026-08-16 · Access + Refresh 두 쿠키 동시 발급
//   Access · 15분 · API 호출용 (mt_auth)
//   Refresh · 30일 · /api/auth/refresh 로 access 재발급 (mt_refresh)
// ─────────────────────────────────────────────────
export function issueToken(
  res: Response,
  payload: JwtPayload,
  _rememberMe = false,
  req?: Request,
): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");
  // 2026-09-24 · 사용자 지시 · Option A · 클라 유형별 refresh 수명 결정
  const clientType = req ? detectClientType(req) : "web";
  const refreshMaxAge = clientType === "mobile-app" ? REFRESH_MAX_AGE_MOBILE : REFRESH_MAX_AGE_WEB;
  const refreshExpiresIn = clientType === "mobile-app" ? "90d" : "30d";
  const accessPayload: JwtPayload = { ...payload, typ: "access" };
  const refreshPayload: JwtPayload = { ...payload, typ: "refresh" };
  const accessToken = jwt.sign(accessPayload, JWT_SECRET, { algorithm: "HS256", expiresIn: "15m" });
  const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, { algorithm: "HS256", expiresIn: refreshExpiresIn });
  const secure = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, accessToken, {
    httpOnly: true, secure, sameSite: "lax",
    maxAge: ACCESS_MAX_AGE * 1000, path: "/",
  });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true, secure, sameSite: "lax",
    maxAge: refreshMaxAge * 1000, path: "/api/auth", // refresh 는 auth 경로만
  });
  return accessToken;
}

/** 2026-08-16 · S10 · Refresh token 만 검증 → 새 access token 재발급
 *  2026-09-24 · 사용자 지시 · Option A (RTR) · refresh 도 회전 · rolling window 진짜 구현
 *   · 이전 · refresh 30일 · 로그인 후 30일 정확히 만료 (rolling X · comment 오류)
 *   · 이후 · 매 refresh 마다 · 새 refresh 발급 · 사용 시점 기준 재계산 · 미사용 만료
 *   · 모바일 앱 · 90일 · 매 사용 시 90일 재갱신 · 실질 무한 세션
 */
export function refreshAccessToken(req: Request, res: Response): JwtPayload | null {
  if (!JWT_SECRET) return null;
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (!refreshToken) return null;
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET, { algorithms: ["HS256"] }) as unknown as JwtPayload;
    if (decoded.typ !== "refresh") return null;
    // 2026-09-24 · 클라 유형별 refresh 수명 · rolling window 재계산
    const clientType = detectClientType(req);
    const refreshMaxAge = clientType === "mobile-app" ? REFRESH_MAX_AGE_MOBILE : REFRESH_MAX_AGE_WEB;
    const refreshExpiresIn = clientType === "mobile-app" ? "90d" : "30d";
    // 새 access token 발급
    const accessPayload: JwtPayload = { sub: decoded.sub, name: decoded.name, role: decoded.role, level: decoded.level, typ: "access" };
    const accessToken = jwt.sign(accessPayload, JWT_SECRET, { algorithm: "HS256", expiresIn: "15m" });
    // 2026-09-24 · 회전 · 새 refresh token 발급 · 매 사용 시 rolling 갱신
    const refreshPayload: JwtPayload = { sub: decoded.sub, name: decoded.name, role: decoded.role, level: decoded.level, typ: "refresh" };
    const newRefreshToken = jwt.sign(refreshPayload, JWT_SECRET, { algorithm: "HS256", expiresIn: refreshExpiresIn });
    const secure = process.env.NODE_ENV === "production";
    res.cookie(COOKIE_NAME, accessToken, {
      httpOnly: true, secure, sameSite: "lax",
      maxAge: ACCESS_MAX_AGE * 1000, path: "/",
    });
    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, {
      httpOnly: true, secure, sameSite: "lax",
      maxAge: refreshMaxAge * 1000, path: "/api/auth",
    });
    return accessPayload;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────
// 헬퍼: 쿠키 제거 (로그아웃) · access + refresh 둘 다
// ─────────────────────────────────────────────────
export function clearToken(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
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
// 2026-08-05 T3 근본 픽스 · app.use(requireAuth, router) 는 requireAuth 를 `/` 에 mount 함
//   → 요청 모든 경로 (SPA 루트, sw.js, assets, /api/* 등) 에 적용되던 버그
//   해결: /api/ 로 시작하지 않는 요청 (SPA·정적자원·서비스워커) 은 skip
//         공개 /api 경로 (/api/auth/, /api/products.json 등 authRouter 마운트) 는 그 라우터에서 처리됨
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // 정적 자원 / SPA / 서비스워커 등 · /api/ 접두어 없으면 인증 skip (Vite·express.static 이 응답)
  if (!req.path.startsWith("/api/")) {
    return next();
  }
  const payload = extractPayload(req);
  if (!payload) {
    const hasCookie = !!req.cookies?.[COOKIE_NAME];
    const hasHeader = typeof req.headers["authorization"] === "string";
    const secretSet = !!JWT_SECRET;
    logger.warn(`[requireAuth 401] ${req.method} ${req.originalUrl} · cookie=${hasCookie} · authHeader=${hasHeader} · secretSet=${secretSet}`);
    res.status(401).json({ error: "인증이 필요합니다. 다시 로그인해주세요.", code: "UNAUTHORIZED" });
    return;
  }
  (req as AuthedRequest).authUser = payload;
  next();
}

// ─────────────────────────────────────────────────
// 헬퍼: 요청에서 JWT payload 반환 (외부용 · null 이면 미인증)
// ─────────────────────────────────────────────────
export function getSession(req: Request): JwtPayload | null {
  return extractPayload(req);
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
    (req as AuthedRequest).authUser = payload;
    if ((payload.level ?? 0) < minLevel) {
      res.status(403).json({ error: "권한이 부족합니다.", code: "FORBIDDEN" });
      return;
    }
    next();
  };
}
