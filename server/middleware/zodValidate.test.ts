// 2026-08-20 · zodValidate 미들웨어 · body/query/params
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { firstZodError, validateBody, validateQuery, validateParams } from "./zodValidate";

const TestSchema = z.object({
  name: z.string().min(1, "name required"),
  age: z.number().min(0).max(150),
});

function mockReq(body?: any, query?: any, params?: any): any {
  return { body, query, params };
}

describe("firstZodError", () => {
  it("첫 issue 메시지 반환", () => {
    const r = TestSchema.safeParse({ name: "", age: 30 });
    if (!r.success) {
      expect(firstZodError(r.error)).toBe("name required");
    }
  });

  it("issues 없으면 · 기본 메시지", () => {
    // ZodError with empty issues (edge case)
    const err = { issues: [] } as any;
    expect(firstZodError(err)).toBe("잘못된 요청 형식");
  });
});

describe("validateBody", () => {
  it("성공 · req.body 를 parsed data 로 교체 · next() 호출", () => {
    const mw = validateBody(TestSchema);
    const req = mockReq({ name: "홍길동", age: 30 });
    const res: any = {};
    const next = vi.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: "홍길동", age: 30 });
  });

  it("실패 · ZodError 를 next(err) 로 전달", () => {
    const mw = validateBody(TestSchema);
    const req = mockReq({ name: "", age: 30 });
    const next = vi.fn();
    mw(req, {} as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    // next 인자 = ZodError
    expect(next.mock.calls[0][0]).toBeDefined();
    expect(next.mock.calls[0][0].name).toBe("ZodError");
  });

  it("타입 강제 변환 (Zod coerce 없으면 그대로)", () => {
    const mw = validateBody(TestSchema);
    const req = mockReq({ name: "x", age: "30" }); // string
    const next = vi.fn();
    mw(req, {} as any, next);
    // TestSchema.age = number · string 실패
    expect(next.mock.calls[0][0]?.name).toBe("ZodError");
  });
});

describe("validateQuery", () => {
  it("성공 · req.query 교체", () => {
    const mw = validateQuery(TestSchema);
    const req = mockReq(undefined, { name: "x", age: 5 });
    const next = vi.fn();
    mw(req, {} as any, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.query).toEqual({ name: "x", age: 5 });
  });

  it("실패 · next(err)", () => {
    const mw = validateQuery(TestSchema);
    const req = mockReq(undefined, { name: "x" }); // age 없음
    const next = vi.fn();
    mw(req, {} as any, next);
    expect(next.mock.calls[0][0]?.name).toBe("ZodError");
  });
});

describe("validateParams", () => {
  const ParamsSchema = z.object({ id: z.string().regex(/^\d+$/, "id 숫자") });

  it("성공 · req.params 교체", () => {
    const mw = validateParams(ParamsSchema);
    const req = mockReq(undefined, undefined, { id: "42" });
    const next = vi.fn();
    mw(req, {} as any, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.params).toEqual({ id: "42" });
  });

  it("실패 · next(ZodError)", () => {
    const mw = validateParams(ParamsSchema);
    const req = mockReq(undefined, undefined, { id: "abc" });
    const next = vi.fn();
    mw(req, {} as any, next);
    expect(next.mock.calls[0][0]?.name).toBe("ZodError");
  });
});
