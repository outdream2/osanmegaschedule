// apps/sync-agent/src/main/auth.ts
// 2026-09-15 · Phase 2 · 서버 로그인 flow (email + password → JWT)
//   · 웹 서버 · POST /api/auth/login · JWT 반환
//   · 토큰 · safeStorage 로 암호화 · config.json 에 저장
//   · axios 인터셉터 · 자동 401 재로그인 (재로그인 실패 시 · logout)

import axios, { AxiosInstance } from "axios";
import { loadConfig, patchConfig, encryptToken, decryptToken, clearAuth } from "./config";

let apiClient: AxiosInstance | null = null;

/** 로그인 후 · axios 인스턴스 반환 (interceptor · 자동 토큰 첨부) */
export function getApiClient(): AxiosInstance {
  if (apiClient) return apiClient;
  const cfg = loadConfig();
  apiClient = axios.create({
    baseURL: cfg.server.baseUrl,
    timeout: 60_000,
    headers: { "Content-Type": "application/json" },
  });

  // Request · 자동 토큰 첨부
  apiClient.interceptors.request.use((config) => {
    const c = loadConfig();
    if (c.auth.encryptedToken) {
      const token = decryptToken(c.auth.encryptedToken);
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Response · 401 · 자동 clearAuth
  apiClient.interceptors.response.use(
    (res) => res,
    async (err) => {
      if (err.response?.status === 401) {
        console.warn("[auth] 401 응답 · 토큰 만료 · clearAuth");
        clearAuth();
      }
      return Promise.reject(err);
    }
  );

  return apiClient;
}

/** 로그인 · 서버 /api/auth/login · JWT 저장 */
export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const cfg = loadConfig();
    const url = `${cfg.server.baseUrl}/api/auth/login`;
    const { data } = await axios.post(url, { email, password }, { timeout: 30_000 });
    const token = data?.token ?? data?.access_token ?? data?.accessToken;
    if (!token) {
      return { ok: false, error: "서버 응답 · 토큰 없음" };
    }
    const encrypted = encryptToken(token);
    if (!encrypted) {
      return { ok: false, error: "토큰 암호화 실패" };
    }
    // 서버 응답 · user·employee 정보 추출 (upload API managerId 쿼리용)
    const user = data?.user ?? data?.employee ?? {};
    const employeeId: number | undefined = user?.employeeId ?? user?.employee_id ?? user?.id ?? undefined;
    const role: string | undefined = user?.role ?? undefined;
    const level: number | undefined = user?.level ?? undefined;
    // 관리자 레벨 검증 · lv9 미만이면 · 임포트 endpoint 접근 불가
    if (level != null && level < 9 && role !== "admin" && role !== "superadmin") {
      return { ok: false, error: "관리자 계정 (lv9) 만 임포트 가능합니다" };
    }
    patchConfig({
      auth: { email, encryptedToken: encrypted, employeeId, role, level },
    });
    // API client · 새 config 반영 위해 · reset
    apiClient = null;
    return { ok: true };
  } catch (err: any) {
    const message = err.response?.data?.error?.message
      ?? err.response?.data?.message
      ?? err.message
      ?? "로그인 실패";
    return { ok: false, error: message };
  }
}

/** 로그아웃 · 토큰 삭제 */
export function logout(): void {
  clearAuth();
  apiClient = null;
}

/** 서버 URL 변경 시 · client reset */
export function resetApiClient(): void {
  apiClient = null;
}
