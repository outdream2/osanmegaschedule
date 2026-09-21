// 2026-08-16 · 프레임워크 · errorHandler + HttpError 단위 테스트
// 2026-09-21 · winston logger 마이그레이션 · console → logger mock 으로 변경
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z, ZodError } from "zod";

// winston logger mock · P1-4 이후 · errorHandler 는 logger 사용
vi.mock("../lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import loggerMod from "../lib/logger";
const logger: any = loggerMod;

import {
  HttpError, badRequest, unauthorized, forbidden, notFound, errorHandler,
} from "./errorHandler";

function mockReqRes() {
  const req = { method: "GET", originalUrl: "/api/x" } as any;
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;
  const next = vi.fn();
  return { req, res, next };
}

describe("HttpError · factory", () => {
  it("badRequest · 400", () => {
    const e = badRequest("bad");
    expect(e).toBeInstanceOf(HttpError);
    expect(e.status).toBe(400);
    expect(e.message).toBe("bad");
  });
  it("unauthorized · 401 · code UNAUTHORIZED · default msg", () => {
    const e = unauthorized();
    expect(e.status).toBe(401);
    expect(e.code).toBe("UNAUTHORIZED");
    expect(e.message).toBe("인증이 필요합니다");
  });
  it("forbidden · 403 · code FORBIDDEN", () => {
    expect(forbidden("no").code).toBe("FORBIDDEN");
    expect(forbidden("no").status).toBe(403);
  });
  it("notFound · 404 · code NOT_FOUND", () => {
    expect(notFound().code).toBe("NOT_FOUND");
    expect(notFound().status).toBe(404);
  });
  it("HttpError 직접 · 자유 status·code", () => {
    const e = new HttpError(409, "dup", "DUP");
    expect(e.status).toBe(409);
    expect(e.code).toBe("DUP");
  });
});

describe("errorHandler", () => {
  beforeEach(() => {
    logger.warn.mockReset();
    logger.error.mockReset();
    logger.info.mockReset();
    logger.debug.mockReset();
  });

  it("HttpError 400 · status + error + code", () => {
    const { req, res, next } = mockReqRes();
    errorHandler(badRequest("bad", "X"), req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "bad", code: "X" });
  });

  it("HttpError 500 · logger.error 사용", () => {
    const { req, res, next } = mockReqRes();
    errorHandler(new HttpError(500, "boom"), req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(logger.error).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("HttpError 4xx · logger.warn 사용", () => {
    const { req, res, next } = mockReqRes();
    errorHandler(unauthorized(), req, res, next);
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("ZodError → 400 · code VALIDATION · 첫 issue message", () => {
    const { req, res, next } = mockReqRes();
    const schema = z.object({ name: z.string().min(1, "이름 필수") });
    const parsed = schema.safeParse({ name: "" });
    if (parsed.success) throw new Error("expected zod fail");
    errorHandler(parsed.error as ZodError, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "이름 필수", code: "VALIDATION" });
  });

  it("일반 Error → 500 · error.message 포함", () => {
    const { req, res, next } = mockReqRes();
    errorHandler(new Error("unknown"), req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "unknown" }));
  });
});
