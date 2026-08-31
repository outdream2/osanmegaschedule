// 2026-08-16 · 프레임워크 · 통일 API 클라이언트 (fetch/axios 5종 혼용 → 1종)
// 사용:
//   import { api } from "../../lib/apiClient";
//   const { data } = await api.get<Employee[]>("/api/employees");
//   const { data } = await api.post<{ ok: true }>("/api/x", body);
//   try { await api.del("/api/x/1"); } catch (e) { if (e instanceof ApiError) { ... } }
//
// 이점:
//   - withCredentials 자동
//   - 401 감지 → refresh 자동 시도 → 실패시 이벤트 dispatch
//   - 에러 shape 통일 · ApiError { status, message, code? }
//   - Zod 스키마로 응답 검증 옵션 (validate)
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import type { ZodSchema } from "zod";
import { SK_AUTH_SESSION } from "./storageKeys";

/** 통일 API 에러 · try/catch 에서 instanceof 로 판별 */
export class ApiError extends Error {
  status: number;
  code?: string;
  data?: unknown;
  constructor(status: number, message: string, code?: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/** 세션 만료 이벤트 · App 최상단에서 리스너 → onLogout() 호출 */
export const SESSION_EXPIRED_EVENT = "api-session-expired";
export function onSessionExpired(listener: () => void): () => void {
  window.addEventListener(SESSION_EXPIRED_EVENT, listener);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
}
function fireSessionExpired(): void {
  try { window.dispatchEvent(new CustomEvent<null>(SESSION_EXPIRED_EVENT)); } catch { /* silent */ }
}

// ── Refresh 자동 갱신 (main.tsx 의 interceptor 와 동일 원리 · 여기서 통합) ─────
let refreshInFlight: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
      return res.ok;
    } catch {
      return false;
    } finally {
      setTimeout(() => { refreshInFlight = null; }, 0);
    }
  })();
  return refreshInFlight;
}

// ── 2026-08-31 · 서버 다운 감지 · 사용자 지시 · 서버 작동 안 하면 · 로그인 화면 강제 이동
//   · status 0 (네트워크 실패) · 502/503/504 (게이트웨이 오류) 감지
//   · 연속 2회 실패 시 · /api/health ping · 실패면 · SESSION_EXPIRED 발화
//   · 미로그인 (localStorage 세션 없음) 시 skip · App.tsx guard 재사용
let consecutiveNetworkFailures = 0;
let serverDownCheckInFlight: Promise<void> | null = null;

async function checkServerAlive(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { method: "GET", credentials: "omit", cache: "no-store" });
    return res.ok;
  } catch { return false; }
}

function isNetworkOrGatewayError(status: number, err: any): boolean {
  // status 0 · axios 는 네트워크 오류 시 · response 없음 · status 0 반환
  if (status === 0) return true;
  // 502·503·504 · gateway 오류 · 서버 다운 신호
  if (status === 502 || status === 503 || status === 504) return true;
  // AxiosError · code === "ERR_NETWORK" · "ECONNABORTED" · timeout
  const code = err?.code;
  if (code === "ERR_NETWORK" || code === "ECONNABORTED" || code === "ETIMEDOUT") return true;
  return false;
}

async function handlePotentialServerDown(status: number, err: any): Promise<void> {
  if (!isNetworkOrGatewayError(status, err)) {
    // 정상 응답 · 카운터 리셋
    consecutiveNetworkFailures = 0;
    return;
  }
  // 미로그인 시 skip (loop 방지 · App.tsx guard 와 동일 원칙)
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(SK_AUTH_SESSION) : null;
  if (!stored) return;
  consecutiveNetworkFailures++;
  if (consecutiveNetworkFailures < 2) return;
  // 연속 2회 실패 · health check 로 확인
  if (serverDownCheckInFlight) return;
  serverDownCheckInFlight = (async () => {
    try {
      const alive = await checkServerAlive();
      if (!alive) {
        console.warn("[apiClient] 서버 다운 감지 · 로그인 화면 이동");
        fireSessionExpired();
      } else {
        // health 는 살아있음 · 카운터 리셋
        consecutiveNetworkFailures = 0;
      }
    } finally {
      setTimeout(() => { serverDownCheckInFlight = null; }, 3000);
    }
  })();
  await serverDownCheckInFlight;
}

// ── 공통 request · axios 래핑 · 401 자동 refresh · 에러 정규화 ────────────────
interface RequestOptions<T = unknown> extends AxiosRequestConfig {
  /** 응답을 Zod 로 검증 · 실패 시 ApiError(500, "VALIDATION") */
  validate?: ZodSchema<T>;
  /** true 시 · 401 refresh 시도 skip (login/refresh 등에 사용) */
  skipRefresh?: boolean;
}

async function request<T = unknown>(config: RequestOptions<T>): Promise<{ data: T; status: number; headers: Record<string, string> }> {
  const cfg: AxiosRequestConfig & { __retried?: boolean } = {
    withCredentials: true,
    ...config,
  };
  try {
    const res: AxiosResponse<unknown> = await axios(cfg);
    const rawData = res.data;
    let data: T;
    if (config.validate) {
      const parsed = config.validate.safeParse(rawData);
      if (!parsed.success) {
        throw new ApiError(500, parsed.error.issues[0]?.message ?? "응답 형식 오류", "VALIDATION", rawData);
      }
      data = parsed.data;
    } else {
      data = rawData as T;
    }
    return { data, status: res.status, headers: (res.headers ?? {}) as Record<string, string> };
  } catch (err: any) {
    const status: number = err?.response?.status ?? 0;
    const url: string = String(cfg.url ?? "");
    // 401 자동 refresh + 재시도 (login/refresh 자체엔 skip)
    if (status === 401 && !cfg.__retried && !config.skipRefresh && !url.startsWith("/api/auth/")) {
      cfg.__retried = true;
      const ok = await tryRefresh();
      if (ok) return request<T>({ ...config, __retried: true } as RequestOptions<T> & { __retried: boolean });
      fireSessionExpired();
    }
    // 2026-08-31 · 서버 다운 감지 · /api/health 및 /api/auth/ 는 skip (재귀 방지)
    if (!url.startsWith("/api/health") && !url.startsWith("/api/auth/")) {
      // fire-and-forget · 응답 throw 는 그대로
      handlePotentialServerDown(status, err).catch(() => { /* silent */ });
    }
    // 서버 표준 응답 { error, code } 정규화
    if (err instanceof ApiError) throw err;
    const body = err?.response?.data;
    const message = body?.error ?? err?.message ?? "네트워크 오류";
    const code = body?.code;
    throw new ApiError(status || 0, String(message), code, body);
  }
}

// ── Public API · 편의 메서드 ─────────────────────────────────────────────────
interface Api {
  get: <T = unknown>(url: string, opts?: Omit<RequestOptions<T>, "url" | "method">) => Promise<{ data: T; status: number; headers: Record<string, string> }>;
  post: <T = unknown>(url: string, body?: unknown, opts?: Omit<RequestOptions<T>, "url" | "method" | "data">) => Promise<{ data: T; status: number; headers: Record<string, string> }>;
  put: <T = unknown>(url: string, body?: unknown, opts?: Omit<RequestOptions<T>, "url" | "method" | "data">) => Promise<{ data: T; status: number; headers: Record<string, string> }>;
  patch: <T = unknown>(url: string, body?: unknown, opts?: Omit<RequestOptions<T>, "url" | "method" | "data">) => Promise<{ data: T; status: number; headers: Record<string, string> }>;
  del: <T = unknown>(url: string, opts?: Omit<RequestOptions<T>, "url" | "method">) => Promise<{ data: T; status: number; headers: Record<string, string> }>;
  raw: typeof request;
}

export const api: Api = {
  get:   (url, opts) => request({ ...opts, url, method: "GET" }),
  post:  (url, body, opts) => request({ ...opts, url, method: "POST", data: body }),
  put:   (url, body, opts) => request({ ...opts, url, method: "PUT", data: body }),
  patch: (url, body, opts) => request({ ...opts, url, method: "PATCH", data: body }),
  del:   (url, opts) => request({ ...opts, url, method: "DELETE" }),
  raw:   request,
};
