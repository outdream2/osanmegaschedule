// 2026-08-20 · requireAuth · authorize · issueToken · refreshAccessToken · clearToken

// JWT_SECRET 자동 파생 위해 · module import 전 env 세팅 (vi.hoisted)
import { vi } from "vitest";
vi.hoisted(() => {
  process.env.JWT_SECRET = "test-jwt-secret-with-enough-length-1234567890";
});

import { describe, it, expect } from "vitest";
import {
  requireAuth,
  authorize,
  issueToken,
  refreshAccessToken,
  clearToken,
  getSession,
  type JwtPayload,
} from "./requireAuth";

// helpers
const makeReq = (opts: { path?: string; cookies?: Record<string, string>; headers?: Record<string, string> } = {}) => ({
  path: opts.path ?? "/api/test",
  method: "GET",
  originalUrl: opts.path ?? "/api/test",
  cookies: opts.cookies ?? {},
  headers: opts.headers ?? {},
});

const makeRes = () => {
  const cookies: Record<string, { value: string; opts: any }> = {};
  const cleared: Set<string> = new Set();
  const res: any = {
    _cookies: cookies,
    _cleared: cleared,
    _status: 200,
    _json: null,
    cookie: vi.fn((name: string, value: string, opts: any) => {
      cookies[name] = { value, opts };
      return res;
    }),
    clearCookie: vi.fn((name: string) => {
      cleared.add(name);
      return res;
    }),
    status: vi.fn((code: number) => {
      res._status = code;
      return res;
    }),
    json: vi.fn((body: any) => {
      res._json = body;
      return res;
    }),
  };
  return res;
};

const samplePayload: JwtPayload = {
  sub: 42,
  name: "홍길동",
  role: "admin",
  level: 9,
};

describe("issueToken · clearToken", () => {
  it("access + refresh 쿠키 발급 · mt_auth / mt_refresh", () => {
    const res = makeRes();
    const token = issueToken(res, samplePayload);
    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res._cookies.mt_auth).toBeDefined();
    expect(res._cookies.mt_refresh).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
  });

  it("access cookie · path=/", () => {
    const res = makeRes();
    issueToken(res, samplePayload);
    expect(res._cookies.mt_auth.opts.path).toBe("/");
    expect(res._cookies.mt_auth.opts.httpOnly).toBe(true);
    expect(res._cookies.mt_auth.opts.sameSite).toBe("lax");
  });

  it("refresh cookie · path=/api/auth 로 제한", () => {
    const res = makeRes();
    issueToken(res, samplePayload);
    expect(res._cookies.mt_refresh.opts.path).toBe("/api/auth");
  });

  it("clearToken · 두 쿠키 모두 clear", () => {
    const res = makeRes();
    clearToken(res);
    expect(res._cleared.has("mt_auth")).toBe(true);
    expect(res._cleared.has("mt_refresh")).toBe(true);
  });
});

describe("requireAuth 미들웨어", () => {
  it("/api/ 아닌 경로 · 인증 skip · next 호출", () => {
    const req = makeReq({ path: "/index.html" });
    const res = makeRes();
    const next = vi.fn();
    requireAuth(req as any, res as any, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("/api/ · 쿠키·헤더 없음 · 401", () => {
    const req = makeReq({ path: "/api/foo" });
    const res = makeRes();
    const next = vi.fn();
    requireAuth(req as any, res as any, next);
    expect(res._status).toBe(401);
    expect(res._json.code).toBe("UNAUTHORIZED");
    expect(next).not.toHaveBeenCalled();
  });

  it("/api/ · 유효 쿠키 · next 호출 + authUser 세팅", () => {
    const res1 = makeRes();
    issueToken(res1, samplePayload);
    const token = res1._cookies.mt_auth.value;

    const req = makeReq({ path: "/api/foo", cookies: { mt_auth: token } }) as any;
    const res = makeRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.authUser).toBeDefined();
    expect(req.authUser.sub).toBe(42);
  });

  it("/api/ · Bearer 헤더 · next 호출", () => {
    const res1 = makeRes();
    issueToken(res1, samplePayload);
    const token = res1._cookies.mt_auth.value;

    const req = makeReq({
      path: "/api/foo",
      headers: { authorization: `Bearer ${token}` },
    }) as any;
    const res = makeRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("/api/ · 잘못된 토큰 · 401", () => {
    const req = makeReq({ path: "/api/foo", cookies: { mt_auth: "invalid-token" } });
    const res = makeRes();
    const next = vi.fn();
    requireAuth(req as any, res as any, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("authorize(minLevel)", () => {
  it("미인증 · 401", () => {
    const mw = authorize(2);
    const req = makeReq({ path: "/api/x" });
    const res = makeRes();
    const next = vi.fn();
    mw(req as any, res as any, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("level 부족 · 403", () => {
    const res1 = makeRes();
    issueToken(res1, { ...samplePayload, level: 1 });
    const token = res1._cookies.mt_auth.value;

    const mw = authorize(9);
    const req = makeReq({ path: "/api/x", cookies: { mt_auth: token } });
    const res = makeRes();
    const next = vi.fn();
    mw(req as any, res as any, next);
    expect(res._status).toBe(403);
    expect(res._json.code).toBe("FORBIDDEN");
    expect(next).not.toHaveBeenCalled();
  });

  it("level 충족 · next 호출", () => {
    const res1 = makeRes();
    issueToken(res1, { ...samplePayload, level: 9 });
    const token = res1._cookies.mt_auth.value;

    const mw = authorize(9);
    const req = makeReq({ path: "/api/x", cookies: { mt_auth: token } });
    const res = makeRes();
    const next = vi.fn();
    mw(req as any, res as any, next);
    expect(next).toHaveBeenCalled();
  });

  it("level 딱 minLevel 인 경우 · 허용", () => {
    const res1 = makeRes();
    issueToken(res1, { ...samplePayload, level: 5 });
    const token = res1._cookies.mt_auth.value;

    const mw = authorize(5);
    const req = makeReq({ path: "/api/x", cookies: { mt_auth: token } });
    const res = makeRes();
    const next = vi.fn();
    mw(req as any, res as any, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("refreshAccessToken", () => {
  it("refresh 쿠키 없음 · null", () => {
    const req = makeReq({});
    const res = makeRes();
    expect(refreshAccessToken(req as any, res as any)).toBeNull();
  });

  it("refresh 토큰 유효 · 새 access 발급 + payload 반환", () => {
    const res1 = makeRes();
    issueToken(res1, samplePayload);
    const refresh = res1._cookies.mt_refresh.value;

    const req = makeReq({ cookies: { mt_refresh: refresh } });
    const res = makeRes();
    const result = refreshAccessToken(req as any, res as any);
    expect(result).not.toBeNull();
    expect(result!.sub).toBe(42);
    expect(res._cookies.mt_auth).toBeDefined();
  });

  it("access 토큰을 refresh 쿠키로 사용 · typ 불일치 · null", () => {
    const res1 = makeRes();
    issueToken(res1, samplePayload);
    const access = res1._cookies.mt_auth.value;

    const req = makeReq({ cookies: { mt_refresh: access } });
    const res = makeRes();
    expect(refreshAccessToken(req as any, res as any)).toBeNull();
  });

  it("잘못된 refresh 토큰 · null", () => {
    const req = makeReq({ cookies: { mt_refresh: "bad" } });
    const res = makeRes();
    expect(refreshAccessToken(req as any, res as any)).toBeNull();
  });
});

describe("getSession", () => {
  it("유효 쿠키 · payload 반환", () => {
    const res1 = makeRes();
    issueToken(res1, samplePayload);
    const token = res1._cookies.mt_auth.value;

    const req = makeReq({ cookies: { mt_auth: token } });
    const session = getSession(req as any);
    expect(session).not.toBeNull();
    expect(session!.sub).toBe(42);
  });

  it("쿠키 없음 · null", () => {
    const req = makeReq({});
    expect(getSession(req as any)).toBeNull();
  });
});
