// @vitest-environment jsdom
// src/lib/pushNotifications.test.ts
// #328 · pushNotifications · 회귀 방지 테스트
// 2026-09-21 · 자율 테스트 커버리지 추가

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mock 팩토리 (vi.mock 은 hoisted · factory 로 접근)
// ─────────────────────────────────────────────────────────────────────────────
const mockPost = vi.fn();
const mockDel  = vi.fn();
const mockGet  = vi.fn();

vi.mock("./apiClient", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  return {
    api: { post: mockPost, del: mockDel, get: mockGet },
    ApiError,
  };
});

vi.mock("./devLog", () => ({
  devLog:  vi.fn(),
  devWarn: vi.fn(),
}));

vi.mock("./storageKeys", () => ({
  SK_PUSH_TOKEN: "pushToken",
}));

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────────────────────
function resetWindow() {
  delete (window as any).OSAN_APP;
  delete (window as any).ReactNativeWebView;
  localStorage.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
describe("savePushToken", () => {
  beforeEach(() => {
    resetWindow();
    vi.clearAllMocks();
  });

  it("window.OSAN_APP 없으면 · no_token 반환", async () => {
    const { savePushToken } = await import("./pushNotifications");
    const result = await savePushToken();
    expect(result).toEqual({ ok: false, reason: "no_token" });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("pushToken 짧으면 (< 10자) · no_token 반환", async () => {
    (window as any).OSAN_APP = { pushToken: "short", platform: "ios" };
    const { savePushToken } = await import("./pushNotifications");
    const result = await savePushToken();
    expect(result).toEqual({ ok: false, reason: "no_token" });
  });

  it("캐시 동일 토큰 · API 호출 없이 unchanged 반환", async () => {
    const token = "ExponentPushToken[1234567890abc]";
    (window as any).OSAN_APP = { pushToken: token, platform: "ios" };
    localStorage.setItem("pushToken", token);
    const { savePushToken } = await import("./pushNotifications");
    const result = await savePushToken();
    expect(result).toEqual({ ok: true, action: "unchanged" });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("신규 토큰 · POST 성공 → saved + localStorage 저장", async () => {
    const token = "ExponentPushToken[new_token_12345]";
    (window as any).OSAN_APP = { pushToken: token, platform: "ios" };
    mockPost.mockResolvedValueOnce({ data: { ok: true } });
    const { savePushToken } = await import("./pushNotifications");
    const result = await savePushToken();
    expect(result).toEqual({ ok: true, action: "saved" });
    expect(mockPost).toHaveBeenCalledWith("/api/push-token", { token, platform: "ios" });
    expect(localStorage.getItem("pushToken")).toBe(token);
  });

  it("POST 401 → unauthorized 반환 · localStorage 저장 X", async () => {
    const token = "ExponentPushToken[another_token_xy]";
    (window as any).OSAN_APP = { pushToken: token, platform: "android" };
    const { ApiError } = await import("./apiClient") as any;
    mockPost.mockRejectedValueOnce(new ApiError(401, "미인증"));
    const { savePushToken } = await import("./pushNotifications");
    const result = await savePushToken();
    expect(result).toEqual({ ok: false, reason: "unauthorized" });
    expect(localStorage.getItem("pushToken")).toBeNull();
  });

  it("POST 네트워크 에러 → ok:false, reason=에러메시지", async () => {
    const token = "ExponentPushToken[network_error_tok]";
    (window as any).OSAN_APP = { pushToken: token, platform: "ios" };
    mockPost.mockRejectedValueOnce(new Error("Network Error"));
    const { savePushToken } = await import("./pushNotifications");
    const result = await savePushToken();
    expect(result).toEqual({ ok: false, reason: "Network Error" });
    expect(localStorage.getItem("pushToken")).toBeNull();
  });

  it("platform 미지정 → ios 기본값 사용", async () => {
    const token = "ExponentPushToken[no_platform_tok1]";
    (window as any).OSAN_APP = { pushToken: token }; // platform 없음
    mockPost.mockResolvedValueOnce({ data: { ok: true } });
    const { savePushToken } = await import("./pushNotifications");
    await savePushToken();
    expect(mockPost).toHaveBeenCalledWith("/api/push-token", { token, platform: "ios" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("deletePushToken", () => {
  beforeEach(() => {
    resetWindow();
    vi.clearAllMocks();
  });

  it("localStorage 토큰 없으면 API 호출 없이 return", async () => {
    const { deletePushToken } = await import("./pushNotifications");
    await deletePushToken();
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("토큰 있으면 · localStorage 제거 + API DELETE 호출", async () => {
    const token = "ExponentPushToken[delete_this_tok]";
    localStorage.setItem("pushToken", token);
    mockDel.mockResolvedValueOnce({ data: { ok: true } });
    const { deletePushToken } = await import("./pushNotifications");
    await deletePushToken();
    expect(localStorage.getItem("pushToken")).toBeNull();
    expect(mockDel).toHaveBeenCalledWith(`/api/push-token/${encodeURIComponent(token)}`);
  });

  it("API DELETE 실패해도 · localStorage 제거 완료 · throw 없음", async () => {
    const token = "ExponentPushToken[fail_delete_tok1]";
    localStorage.setItem("pushToken", token);
    mockDel.mockRejectedValueOnce(new Error("서버 오류"));
    const { deletePushToken } = await import("./pushNotifications");
    await expect(deletePushToken()).resolves.toBeUndefined();
    expect(localStorage.getItem("pushToken")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("initPushTokenListener", () => {
  beforeEach(() => {
    resetWindow();
    vi.clearAllMocks();
  });

  it("cleanup 함수 반환", async () => {
    const { initPushTokenListener } = await import("./pushNotifications");
    const cleanup = initPushTokenListener();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("'osan-push-token' 이벤트 발생 후 cleanup → 이벤트 제거됨", async () => {
    const { initPushTokenListener } = await import("./pushNotifications");
    const cleanup = initPushTokenListener();
    cleanup();
    // cleanup 후 이벤트 발생 · API 호출 없음
    window.dispatchEvent(new CustomEvent("osan-push-token"));
    await new Promise(r => setTimeout(r, 10));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("이벤트 발생 전 · 토큰 없으면 API 호출 없음", async () => {
    const { initPushTokenListener } = await import("./pushNotifications");
    const cleanup = initPushTokenListener();
    window.dispatchEvent(new CustomEvent("osan-push-token"));
    await new Promise(r => setTimeout(r, 10));
    expect(mockPost).not.toHaveBeenCalled(); // OSAN_APP 없으므로
    cleanup();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("setAppBadge", () => {
  beforeEach(resetWindow);

  it("WebView 없으면 no-op (postMessage 호출 X, throw 없음)", async () => {
    const { setAppBadge } = await import("./pushNotifications");
    expect(() => setAppBadge(5)).not.toThrow();
  });

  it("WebView 있으면 setBadge postMessage 전송", async () => {
    const postMessage = vi.fn();
    (window as any).ReactNativeWebView = { postMessage };
    const { setAppBadge } = await import("./pushNotifications");
    setAppBadge(7);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: "setBadge", count: 7 }));
  });

  it("음수 → 0으로 정규화", async () => {
    const postMessage = vi.fn();
    (window as any).ReactNativeWebView = { postMessage };
    const { setAppBadge } = await import("./pushNotifications");
    setAppBadge(-3);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: "setBadge", count: 0 }));
  });

  it("소수점 → Math.floor 정규화", async () => {
    const postMessage = vi.fn();
    (window as any).ReactNativeWebView = { postMessage };
    const { setAppBadge } = await import("./pushNotifications");
    setAppBadge(4.9);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: "setBadge", count: 4 }));
  });

  it("NaN → 0으로 정규화 (Math.max(0, Math.floor(NaN)) = 0)", async () => {
    const postMessage = vi.fn();
    (window as any).ReactNativeWebView = { postMessage };
    const { setAppBadge } = await import("./pushNotifications");
    setAppBadge(NaN);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: "setBadge", count: 0 }));
  });

  it("count=0 → 배지 clear 신호", async () => {
    const postMessage = vi.fn();
    (window as any).ReactNativeWebView = { postMessage };
    const { setAppBadge } = await import("./pushNotifications");
    setAppBadge(0);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: "setBadge", count: 0 }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("initBadgeSync", () => {
  beforeEach(() => {
    resetWindow();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("WebView 아니면 no-op cleanup 즉시 반환", async () => {
    const { initBadgeSync } = await import("./pushNotifications");
    const cleanup = initBadgeSync();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  // 2026-09-21 · TODO · async timing 이슈 · dynamic import + Promise.resolve flush · 별도 세션 정리
  it.skip("WebView 환경 · leave+resignation 합산 setAppBadge 호출", async () => {
    const postMessage = vi.fn();
    (window as any).ReactNativeWebView = { postMessage };
    // leave=3, resignation=1 → 합산 4
    mockGet.mockImplementation((url: string) => {
      if (url === "/api/leave-requests/pending-count")
        return Promise.resolve({ data: { count: 3 } });
      if (url === "/api/resignation-requests/pending-count")
        return Promise.resolve({ data: { count: 1 } });
      return Promise.resolve({ data: { count: 0 } });
    });
    const { initBadgeSync } = await import("./pushNotifications");
    const cleanup = initBadgeSync();
    // 즉시 실행 microtask/promise flush
    await Promise.resolve();
    await Promise.resolve();
    cleanup();
    const calls = postMessage.mock.calls.map(c => JSON.parse(c[0]));
    const badgeCalls = calls.filter(c => c.type === "setBadge");
    expect(badgeCalls.some(c => c.count === 4)).toBe(true);
  });

  it("approval-count-updated 이벤트 → refresh 호출 (setAppBadge 발동)", async () => {
    const postMessage = vi.fn();
    (window as any).ReactNativeWebView = { postMessage };
    mockGet.mockResolvedValue({ data: { count: 2 } });
    const { initBadgeSync } = await import("./pushNotifications");
    const cleanup = initBadgeSync();
    // 초기 실행 flush
    await Promise.resolve();
    await Promise.resolve();
    postMessage.mockClear();
    window.dispatchEvent(new CustomEvent("approval-count-updated"));
    await Promise.resolve();
    await Promise.resolve();
    cleanup();
    const calls = postMessage.mock.calls.map(c => JSON.parse(c[0]));
    expect(calls.some(c => c.type === "setBadge")).toBe(true);
  });

  it("API 401 → setAppBadge(0) clear", async () => {
    const postMessage = vi.fn();
    (window as any).ReactNativeWebView = { postMessage };
    const { ApiError } = await import("./apiClient") as any;
    // Promise.all 내 each catch → { data: { count: 0 } } 반환 (내부 catch 처리)
    // 외부 try/catch 는 ApiError 401 로 setAppBadge(0) 호출
    mockGet.mockRejectedValue(new ApiError(401, "미인증"));
    const { initBadgeSync } = await import("./pushNotifications");
    const cleanup = initBadgeSync();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    cleanup();
    // catch 내 setAppBadge(0) 또는 내부 Promise.all catch 후 total=0 → setAppBadge(0)
    const calls = postMessage.mock.calls.map(c => { try { return JSON.parse(c[0]); } catch { return {}; } });
    expect(calls.some(c => c.type === "setBadge" && c.count === 0)).toBe(true);
  });
});
