// 2026-08-20 · envValidation · checkEnv / validateEnv
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkEnv, validateEnv } from "./envValidation";

const KEYS = [
  "SUPABASE_URL", "SUPABASE_KEY", "JWT_SECRET",
  "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT",
  "GEMINI_API_KEY", "CLOUDINARY_URL", "GOOGLE_APPLICATION_CREDENTIALS",
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("checkEnv · required 검증", () => {
  it("SUPABASE_URL + SUPABASE_KEY 존재 · ok=true", () => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_KEY = "test-key";
    const r = checkEnv();
    expect(r.ok).toBe(true);
    expect(r.missing).toHaveLength(0);
  });

  it("SUPABASE_URL 만 · ok=false · missing SUPABASE_KEY", () => {
    process.env.SUPABASE_URL = "x";
    const r = checkEnv();
    expect(r.ok).toBe(false);
    expect(r.missing.map(m => m.key)).toContain("SUPABASE_KEY");
  });

  it("SUPABASE_KEY 만 · ok=false · missing SUPABASE_URL", () => {
    process.env.SUPABASE_KEY = "x";
    const r = checkEnv();
    expect(r.ok).toBe(false);
    expect(r.missing.map(m => m.key)).toContain("SUPABASE_URL");
  });

  it("모두 미설정 · ok=false · 2개 missing", () => {
    const r = checkEnv();
    expect(r.ok).toBe(false);
    expect(r.missing.length).toBe(2);
  });

  it("빈 문자열 · 미설정으로 간주", () => {
    process.env.SUPABASE_URL = "";
    process.env.SUPABASE_KEY = "   ";
    const r = checkEnv();
    expect(r.ok).toBe(false);
  });
});

describe("checkEnv · recommended · warnings", () => {
  it("required 만족 · JWT_SECRET/VAPID 등 미설정 · warnings", () => {
    process.env.SUPABASE_URL = "x";
    process.env.SUPABASE_KEY = "x";
    const r = checkEnv();
    expect(r.ok).toBe(true);
    const w = r.warnings.map(x => x.key);
    expect(w).toContain("JWT_SECRET");
    expect(w).toContain("VAPID_PUBLIC_KEY");
    expect(w).toContain("GEMINI_API_KEY");
  });

  it("모든 recommended 설정 · warnings 0", () => {
    process.env.SUPABASE_URL = "x";
    process.env.SUPABASE_KEY = "x";
    process.env.JWT_SECRET = "x";
    process.env.VAPID_PUBLIC_KEY = "x";
    process.env.VAPID_PRIVATE_KEY = "x";
    process.env.VAPID_SUBJECT = "x";
    process.env.GEMINI_API_KEY = "x";
    process.env.CLOUDINARY_URL = "x";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "x";
    const r = checkEnv();
    expect(r.warnings).toHaveLength(0);
  });
});

describe("validateEnv · exit vs throw", () => {
  it("required 만족 · 정상 통과 (no throw)", () => {
    process.env.SUPABASE_URL = "x";
    process.env.SUPABASE_KEY = "x";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => validateEnv()).not.toThrow();
    spy.mockRestore();
  });

  it("required 미설정 · VITEST=true · throw (exit 대신)", () => {
    // VITEST env 이 자동 설정됨 · exit 대신 throw
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => validateEnv()).toThrow(/Missing required env/);
    spy.mockRestore();
  });

  it("required 미설정 · error 메시지 · SUPABASE_URL·KEY 포함", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      validateEnv();
    } catch (e) {
      expect((e as Error).message).toContain("SUPABASE_URL");
      expect((e as Error).message).toContain("SUPABASE_KEY");
    }
    spy.mockRestore();
  });
});
