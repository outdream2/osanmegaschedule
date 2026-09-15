// apps/sync-agent/src/main/auth.ts
// 2026-09-15 · Phase 2 · 서버 로그인 flow (email + password → JWT)
//   · 웹 서버 · POST /api/auth/login · JWT 반환
//   · 토큰 · safeStorage 로 암호화 · config.json 에 저장
//   · axios 인터셉터 · 자동 401 재로그인 (재로그인 실패 시 · logout)

import axios, { AxiosInstance } from "axios";
import { loadConfig, patchConfig, encryptToken, decryptToken, clearAuth } from "./config";

let apiClient: AxiosInstance | null = null;

/** 로그인 후 · axios 인스턴스 반환 · 쿠키 자동 첨부 (웹앱과 동일 방식) */
export function getApiClient(): AxiosInstance {
  if (apiClient) return apiClient;
  const cfg = loadConfig();
  apiClient = axios.create({
    baseURL: cfg.server.baseUrl,
    timeout: 60_000,
    headers: { "Content-Type": "application/json" },
  });

  // Request · 저장된 쿠키 자동 첨부 (encryptedToken 필드 · 실제 · Cookie 문자열)
  apiClient.interceptors.request.use((config) => {
    const c = loadConfig();
    if (c.auth.encryptedToken) {
      const cookie = decryptToken(c.auth.encryptedToken);
      if (cookie) {
        (config.headers as any).Cookie = cookie;
        console.log(`[auth] Cookie 첨부 · ${cookie.slice(0, 60)}...`);
      } else {
        console.warn("[auth] 쿠키 복호화 실패");
      }
    } else {
      console.warn("[auth] 저장된 쿠키 없음 · 로그인 필요");
    }
    return config;
  });

  // Response · 401 · refresh 시도 · 실패 시 · clearAuth
  //   · 웹앱 · /api/auth/refresh · mt_refresh 쿠키 검증 · 새 mt_auth 발급
  apiClient.interceptors.response.use(
    (res) => res,
    async (err) => {
      const original = err.config;
      // 이미 재시도한 요청 · 무한 루프 방지
      if (err.response?.status === 401 && original && !original._retried) {
        console.warn("[auth] 401 응답 · refresh 시도");
        original._retried = true;
        try {
          await tryRefresh();
          // 새 쿠키 · 재적용 · 원 요청 재시도
          const c = loadConfig();
          if (c.auth.encryptedToken) {
            const cookie = decryptToken(c.auth.encryptedToken);
            if (cookie) original.headers.Cookie = cookie;
          }
          return apiClient!.request(original);
        } catch (refreshErr) {
          console.warn("[auth] refresh 실패 · clearAuth");
          clearAuth();
        }
      }
      return Promise.reject(err);
    }
  );

  return apiClient;
}

/** Refresh token · 서버 /api/auth/refresh · 새 access token 발급 */
async function tryRefresh(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.auth.encryptedToken) throw new Error("저장된 쿠키 없음");
  const cookie = decryptToken(cfg.auth.encryptedToken);
  if (!cookie) throw new Error("쿠키 복호화 실패");
  console.log("[auth] refresh · /api/auth/refresh · POST");
  const response = await axios.post(
    `${cfg.server.baseUrl}/api/auth/refresh`,
    {},
    { headers: { Cookie: cookie }, timeout: 30_000 }
  );
  const setCookie = response.headers["set-cookie"];
  if (!setCookie || setCookie.length === 0) {
    throw new Error("refresh 응답 · 쿠키 없음");
  }
  // 기존 쿠키 · 새로 발급된 mt_auth 로 교체 · mt_refresh 는 유지
  const existingCookies = new Map<string, string>();
  cookie.split(";").forEach(c => {
    const [name, ...rest] = c.trim().split("=");
    if (name) existingCookies.set(name, rest.join("="));
  });
  for (const c of setCookie) {
    const [nameValue] = c.split(";");
    const [name, ...rest] = nameValue.trim().split("=");
    if (name && rest.length > 0) existingCookies.set(name, rest.join("="));
  }
  const newCookieString = Array.from(existingCookies.entries())
    .map(([n, v]) => `${n}=${v}`)
    .join("; ");
  const encrypted = encryptToken(newCookieString);
  if (encrypted) {
    patchConfig({ auth: { encryptedToken: encrypted } });
    console.log("[auth] refresh 성공 · 새 access 저장");
  }
}

/** 로그인 · 서버 /api/auth/login · 핸드폰번호 + 비밀번호 · JWT httpOnly 쿠키 저장
 *   · 웹앱과 동일 · employee_id 필드 = phone 번호
 *   · Response · Set-Cookie 헤더 · 쿠키 문자열 저장 · 다음 요청에 사용
 */
export async function login(phone: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const cfg = loadConfig();
    const url = `${cfg.server.baseUrl}/api/auth/login`;
    // employee_id · 서버 스키마 이름 · 실제로는 phone 번호
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (!cleanPhone) {
      return { ok: false, error: "핸드폰번호를 입력해주세요" };
    }
    const response = await axios.post(url, {
      employee_id: cleanPhone,
      password,
      rememberMe: true,
    }, {
      timeout: 30_000,
      // 쿠키 응답 확인용 · Set-Cookie 헤더는 · Node axios · response.headers 로 접근
    });

    const data = response.data ?? {};
    // Set-Cookie 헤더에서 · JWT 토큰 쿠키 추출
    const setCookie = response.headers["set-cookie"];
    console.log(`[auth] login · Set-Cookie 헤더 개수: ${setCookie?.length ?? 0}`);
    if (setCookie) {
      for (const c of setCookie) {
        console.log(`[auth] · ${c.slice(0, 80)}...`);
      }
    }
    if (!setCookie || setCookie.length === 0) {
      return { ok: false, error: "서버 응답 · 쿠키 없음 · 인증 실패" };
    }
    // 모든 쿠키 조합 · Cookie 헤더 형식으로 저장
    const cookieString = setCookie
      .map((c: string) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
    console.log(`[auth] 저장할 쿠키 문자열: ${cookieString.slice(0, 100)}`);

    const encrypted = encryptToken(cookieString);
    if (!encrypted) {
      return { ok: false, error: "쿠키 암호화 실패" };
    }

    // 서버 응답 · { id, name, role, level, rank }
    const employeeId: number | undefined = typeof data?.id === "number" ? data.id : undefined;
    const role: string | undefined = data?.role ?? undefined;
    const level: number | undefined = typeof data?.level === "number" ? data.level : undefined;

    // 관리자 레벨 검증 · lv9 미만이면 · 임포트 endpoint 접근 불가
    if (level == null || level < 9) {
      return { ok: false, error: `관리자 계정 (lv9) 만 임포트 가능합니다 (현재 lv ${level ?? "?"})` };
    }

    patchConfig({
      auth: {
        email: data?.name ? `${data.name} (${cleanPhone})` : cleanPhone,  // 표시용
        encryptedToken: encrypted,
        employeeId,
        role,
        level,
      },
    });
    // API client · 새 config 반영 위해 · reset
    apiClient = null;
    return { ok: true };
  } catch (err: any) {
    const message = err.response?.data?.error?.message
      ?? err.response?.data?.message
      ?? err.response?.data?.error
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
