// 2026-08-16 · 프레임워크 · 클라이언트 에러 리포터 (Sentry 통합 준비)
// 사용:
//   main.tsx 최상단에서 installErrorReporter() 1회 호출
//   window.error + unhandledrejection · 콘솔 + 서버 /api/client-errors (배치)
//   환경변수 VITE_SENTRY_DSN 있으면 Sentry 로도 전송 (없으면 no-op)
//
// 원칙:
//   - fail-soft · 리포터 자체가 앱을 깨뜨리지 않아야 함
//   - batch · 초당 여러 에러 몰아서 1회 POST
//   - 노이즈 필터 · 크로스오리진 error / chunk load 에러 등 무시 옵션

interface ClientErrorPayload {
  message: string;
  source: string;             // "error" | "unhandledrejection" | "custom"
  stack?: string;
  url: string;                // 발생 페이지
  ua: string;
  timestamp: number;
}

const queue: ClientErrorPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_MS = 2000;
const MAX_QUEUE = 20;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, FLUSH_MS);
}

async function flush(): Promise<void> {
  // 2026-08-21 · Framework Phase 3 · fetch 유지 · errorReporter 는 저수준 · window.error 핸들러 안
  //   apiClient 사용 시 · 401 → SESSION_EXPIRED_EVENT dispatch → 무한 루프 위험
  //   fire-and-forget + swallow catch 이미 안전 · 의도적 예외 (audit 화이트리스트)
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ errors: batch }),
    });
  } catch { /* silent · 네트워크 죽어도 앱은 계속 */ }
}

function enqueue(payload: ClientErrorPayload): void {
  if (queue.length >= MAX_QUEUE) return; // 오버플로 방지
  queue.push(payload);
  scheduleFlush();
}

/** 커스텀 에러 리포트 · try/catch 에서 명시 호출 가능 */
export function reportError(err: unknown, source = "custom"): void {
  try {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    enqueue({
      message,
      source,
      stack,
      url: location.href,
      ua: navigator.userAgent,
      timestamp: Date.now(),
    });
  } catch { /* silent */ }
}

let installed = false;
/** 부팅 시 1회 · window.error + unhandledrejection 리스너 등록 */
export function installErrorReporter(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    // 크로스오리진 스크립트 에러는 message 만 있고 stack 없음 · 무시
    if (!event.message || event.message === "Script error.") return;
    // Chunk load 실패 · ErrorBoundary 가 처리하므로 여기선 warn 만
    if (/Loading chunk|Failed to fetch dynamically imported module/i.test(event.message)) {
      console.warn("[errorReporter] chunk load error:", event.message);
      return;
    }
    enqueue({
      message: event.message,
      source: "error",
      stack: event.error?.stack,
      url: location.href,
      ua: navigator.userAgent,
      timestamp: Date.now(),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? "unhandledrejection");
    // ApiError · 401 refresh 실패 등 · 앱이 이미 처리하는 케이스 무시
    if (typeof reason === "object" && reason && (reason as any).name === "ApiError" && (reason as any).status === 401) return;
    enqueue({
      message,
      source: "unhandledrejection",
      stack: reason instanceof Error ? reason.stack : undefined,
      url: location.href,
      ua: navigator.userAgent,
      timestamp: Date.now(),
    });
  });

  // 페이지 언로드 시 남은 큐 즉시 flush (beacon 사용)
  window.addEventListener("beforeunload", () => {
    if (queue.length === 0) return;
    try {
      const blob = new Blob([JSON.stringify({ errors: queue.splice(0) })], { type: "application/json" });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/client-errors", blob);
    } catch { /* silent */ }
  });

  // Sentry 통합 · VITE_SENTRY_DSN 있으면 활성화 · 배포 환경에서만
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (dsn) {
    void initSentry(dsn);
  }
}

// Sentry · dynamic import · dev bundle 에 안 실림 · DSN 있는 배포에서만 로드
async function initSentry(dsn: string): Promise<void> {
  try {
    const Sentry = await import("@sentry/browser");
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      // 노이즈 필터 (errorReporter 와 중복 방지)
      ignoreErrors: ["Script error.", "Loading chunk", "Failed to fetch dynamically imported module"],
    });
    console.info("[errorReporter] Sentry 초기화 완료 · env=%s", import.meta.env.MODE);
  } catch (err) {
    console.warn("[errorReporter] Sentry 초기화 실패 · 자체 리포터만 사용:", err);
  }
}

/** Sentry 통합 시 사용 · report 대신 이걸로 Sentry captureException */
export async function reportToSentry(err: unknown, context?: Record<string, unknown>): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/browser");
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch { /* silent */ }
}
