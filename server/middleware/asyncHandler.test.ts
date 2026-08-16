// 2026-08-16 · 프레임워크 · asyncHandler 단위 테스트
import { describe, it, expect, vi } from "vitest";
import { asyncHandler } from "./asyncHandler";

function mockReqRes() {
  const req = {} as any;
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;
  const next = vi.fn();
  return { req, res, next };
}

describe("asyncHandler", () => {
  it("정상 async · next 미호출 · 응답 전달", async () => {
    const { req, res, next } = mockReqRes();
    const handler = asyncHandler(async (_req, r) => { r.json({ ok: true }); });
    await handler(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it("throw · next(err) 자동 전달", async () => {
    const { req, res, next } = mockReqRes();
    const err = new Error("boom");
    const handler = asyncHandler(async () => { throw err; });
    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.json).not.toHaveBeenCalled();
  });

  it("Promise reject · next(err) 자동 전달", async () => {
    const { req, res, next } = mockReqRes();
    const err = new Error("reject");
    const handler = asyncHandler(() => Promise.reject(err));
    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it("동기 함수도 Promise.resolve 로 감싸 next 전달", async () => {
    const { req, res, next } = mockReqRes();
    const handler = asyncHandler(async (_req, r) => { r.status(201).json({ id: 1 }); });
    await handler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 1 });
  });
});
