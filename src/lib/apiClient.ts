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
