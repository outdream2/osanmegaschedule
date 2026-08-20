// 2026-08-20 · clientErrors · Zod 스키마 검증 · POST /api/client-errors
import { describe, it, expect } from "vitest";
import { z } from "zod";

// 라우터의 Zod 스키마와 동일 (기능 검증)
const ClientErrorSchema = z.object({
  errors: z.array(z.object({
    message: z.string().max(2000),
    source: z.string().max(50),
    stack: z.string().max(4000).optional(),
    url: z.string().max(500),
    ua: z.string().max(500),
    timestamp: z.number(),
  })).max(20),
});

describe("ClientErrorSchema · 정상", () => {
  it("최소 필수 필드 · 성공", () => {
    const r = ClientErrorSchema.safeParse({
      errors: [{
        message: "TypeError: Cannot read property x of undefined",
        source: "error",
        url: "http://example.com/page",
        ua: "Mozilla/5.0",
        timestamp: 1_700_000_000_000,
      }],
    });
    expect(r.success).toBe(true);
  });

  it("stack 포함 · 성공", () => {
    const r = ClientErrorSchema.safeParse({
      errors: [{
        message: "Error",
        source: "unhandledrejection",
        stack: "at foo (bar.js:10)",
        url: "http://x/",
        ua: "UA",
        timestamp: 1,
      }],
    });
    expect(r.success).toBe(true);
  });

  it("빈 배열 · 성공", () => {
    const r = ClientErrorSchema.safeParse({ errors: [] });
    expect(r.success).toBe(true);
  });

  it("20개 · 성공 (경계)", () => {
    const errors = Array.from({ length: 20 }, (_, i) => ({
      message: `e${i}`, source: "error", url: "u", ua: "ua", timestamp: 1,
    }));
    expect(ClientErrorSchema.safeParse({ errors }).success).toBe(true);
  });
});

describe("ClientErrorSchema · 실패", () => {
  it("21개 · 실패 (MAX 20)", () => {
    const errors = Array.from({ length: 21 }, (_, i) => ({
      message: `e${i}`, source: "error", url: "u", ua: "ua", timestamp: 1,
    }));
    expect(ClientErrorSchema.safeParse({ errors }).success).toBe(false);
  });

  it("message · 2000자 초과 · 실패", () => {
    const r = ClientErrorSchema.safeParse({
      errors: [{ message: "x".repeat(2001), source: "e", url: "u", ua: "ua", timestamp: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it("source · 50자 초과 · 실패", () => {
    const r = ClientErrorSchema.safeParse({
      errors: [{ message: "e", source: "s".repeat(51), url: "u", ua: "ua", timestamp: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it("stack · 4000자 초과 · 실패", () => {
    const r = ClientErrorSchema.safeParse({
      errors: [{ message: "e", source: "e", stack: "s".repeat(4001), url: "u", ua: "ua", timestamp: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it("url · 500자 초과 · 실패", () => {
    const r = ClientErrorSchema.safeParse({
      errors: [{ message: "e", source: "e", url: "u".repeat(501), ua: "ua", timestamp: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it("timestamp · 문자열 · 실패", () => {
    const r = ClientErrorSchema.safeParse({
      errors: [{ message: "e", source: "e", url: "u", ua: "ua", timestamp: "now" as any }],
    });
    expect(r.success).toBe(false);
  });

  it("errors 없음 · 실패", () => {
    expect(ClientErrorSchema.safeParse({}).success).toBe(false);
  });

  it("errors 배열 아님 · 실패", () => {
    expect(ClientErrorSchema.safeParse({ errors: "x" }).success).toBe(false);
  });
});
