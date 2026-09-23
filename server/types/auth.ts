// server/types/auth.ts
// P2-2 · AuthUser · AuthedRequest 공통 타입 SSOT
// 모든 route 파일이 (req as any).authUser 대신 이 타입을 사용한다.

import type { Request } from "express";

/** JWT payload 로 채워지는 인증된 사용자 정보 */
export interface AuthUser {
  sub: number;
  name: string;
  role: string;
  level: number;
  rememberMe?: boolean;
  typ?: "access" | "refresh" | "sso";
  jti?: string;
}

/** requireAuth / authorize 미들웨어가 주입하는 확장 Request */
export interface AuthedRequest extends Request {
  authUser?: AuthUser;
}
