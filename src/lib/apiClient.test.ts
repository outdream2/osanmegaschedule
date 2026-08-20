// @vitest-environment jsdom
// 2026-08-20 · apiClient · ApiError · SESSION_EXPIRED_EVENT · onSessionExpired
import { describe, it, expect, vi } from "vitest";
import { ApiError, SESSION_EXPIRED_EVENT, onSessionExpired } from "./apiClient";

describe("ApiError · Error 확장 클래스", () => {
  it("status/message 필수 · instanceof Error 통과", () => {
    const err = new ApiError(500, "서버 오류");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.message).toBe("서버 오류");
    expect(err.name).toBe("ApiError");
  });

  it("code 옵셔널 · 지정 시 반영", () => {
    const err = new ApiError(400, "잘못된 요청", "BAD_REQUEST");
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("data 옵셔널 · 서버 응답 원본 보관", () => {
    const err = new ApiError(422, "검증 실패", "VALIDATION", { fields: ["name"] });
    expect(err.data).toEqual({ fields: ["name"] });
  });

  it("code/data 미지정 · undefined", () => {
    const err = new ApiError(404, "없음");
    expect(err.code).toBeUndefined();
    expect(err.data).toBeUndefined();
  });

  it("catch 에서 · instanceof 체크", () => {
    try {
      throw new ApiError(401, "인증 실패");
    } catch (e) {
      expect(e instanceof ApiError).toBe(true);
      if (e instanceof ApiError) {
        expect(e.status).toBe(401);
      }
    }
  });
});

describe("SESSION_EXPIRED_EVENT · onSessionExpired", () => {
  it("상수 · 문자열", () => {
    expect(SESSION_EXPIRED_EVENT).toBe("api-session-expired");
  });

  it("리스너 등록 · unsubscribe 함수 반환", () => {
    const fn = vi.fn();
    const unsub = onSessionExpired(fn);
    expect(typeof unsub).toBe("function");
    // 이벤트 발신
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    expect(fn).toHaveBeenCalledTimes(1);
    // unsubscribe
    unsub();
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    expect(fn).toHaveBeenCalledTimes(1); // 증가 X
  });

  it("여러 리스너 · 모두 호출", () => {
    const f1 = vi.fn();
    const f2 = vi.fn();
    const u1 = onSessionExpired(f1);
    const u2 = onSessionExpired(f2);
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    expect(f1).toHaveBeenCalledTimes(1);
    expect(f2).toHaveBeenCalledTimes(1);
    u1();
    u2();
  });
});
