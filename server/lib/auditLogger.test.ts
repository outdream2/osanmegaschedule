// 2026-08-20 · auditLogger · auditContext (pure helper)
// Note · audit() 는 winston 파일 시스템 side effect · 테스트 어려움 · auditContext 만
import { describe, it, expect } from "vitest";
import { auditContext } from "./auditLogger";

describe("auditContext · IP/UA 추출", () => {
  it("x-forwarded-for 우선", () => {
    const req = {
      headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1", "user-agent": "Chrome" },
      socket: { remoteAddress: "10.0.0.99" },
    };
    const ctx = auditContext(req);
    // 첫 번째 IP · trim
    expect(ctx.ip).toBe("203.0.113.1");
    expect(ctx.ua).toBe("Chrome");
  });

  it("x-forwarded-for 없음 · socket.remoteAddress fallback", () => {
    const req = {
      headers: { "user-agent": "Mozilla" },
      socket: { remoteAddress: "127.0.0.1" },
    };
    const ctx = auditContext(req);
    expect(ctx.ip).toBe("127.0.0.1");
  });

  it("모두 없음 · req.ip · unknown 순", () => {
    const req = { headers: {}, ip: "192.168.1.1" };
    const ctx = auditContext(req);
    expect(ctx.ip).toBe("192.168.1.1");
  });

  it("완전 없음 · 'unknown'", () => {
    const req = { headers: {} };
    const ctx = auditContext(req);
    expect(ctx.ip).toBe("unknown");
    expect(ctx.ua).toBe("unknown");
  });

  it("User-Agent · 200자 slice", () => {
    const longUa = "x".repeat(300);
    const req = { headers: { "user-agent": longUa } };
    const ctx = auditContext(req);
    expect(ctx.ua.length).toBe(200);
  });

  it("null/undefined req · 안전 처리", () => {
    expect(() => auditContext(null)).not.toThrow();
    expect(() => auditContext(undefined)).not.toThrow();
    const ctx = auditContext(null);
    expect(ctx.ip).toBe("unknown");
    expect(ctx.ua).toBe("unknown");
  });

  it("빈 x-forwarded-for · 빈 문자열 반환 (?? 는 empty string 은 fallback 안 함)", () => {
    // 참고 · ?? 연산자는 null/undefined 만 fallback · empty string 유지
    const req = {
      headers: { "x-forwarded-for": "" },
      socket: { remoteAddress: "10.0.0.5" },
    };
    const ctx = auditContext(req);
    // 실제 동작 · 빈 문자열 그대로 String() → "" → split(",")[0] → ""
    expect(ctx.ip).toBe("");
  });
});
