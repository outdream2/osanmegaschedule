// 2026-08-16 · 서버·클라 공유 · 인증 도메인 응답 DTO
// 서버: server/routes/auth/auth.ts 각 endpoint 응답
// 클라: 로그인/vendor-login/refresh/me · 응답 타입 판별

/** POST /api/auth/login · 성공 응답 */
export interface LoginResponse {
  id: number;
  name: string;
  role: string;        // "employee" | "manager" | "superadmin"
  level: number;
  rank: string | null;
}

/** POST /api/auth/vendor-login · 성공 응답 */
export interface VendorLoginResponse {
  id: number;
  name: string;
  contactName: string;
  role: "vendor";
  level: 0;
}

/** POST /api/auth/refresh · 성공 응답 (access 재발급 · 사용자 정보 재확인) */
export interface RefreshResponse {
  id: number;
  name: string;
  role: string;
  level: number;
}

/** 로그아웃/set-password/change-password · 공통 { ok: true } */
export type AuthOkResponse = { ok: true };
