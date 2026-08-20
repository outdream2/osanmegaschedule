// 2026-08-20 · solapiClient · SolAPI (카카오 알림톡) 설정 상태 + 상태 조회 API
//   · getSolApiStatus · 환경변수 설정 여부 판정
//   · handleSolApiStatus · Express 핸들러 · JSON 응답 검증
//   · sendAlimtalk 은 solapi SDK 필요 · unconfigured 상태만 verifying
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getSolApiStatus, handleSolApiStatus, sendAlimtalk } from "./solapiClient";

// env 스냅샷·복구 헬퍼
const ENV_KEYS = [
  "SOLAPI_API_KEY", "SOLAPI_API_SECRET", "SOLAPI_SENDER_PHONE",
  "SOLAPI_KAKAO_PFID", "SOLAPI_KAKAO_TEMPLATE_ORDER",
];

function snapshotEnv() {
  const snap: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}
function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}
function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

describe("getSolApiStatus", () => {
  let snap: Record<string, string | undefined>;
  beforeEach(() => { snap = snapshotEnv(); clearEnv(); });
  afterEach(() => restoreEnv(snap));

  it("전체 미설정 · configured=false · missing 4개", () => {
    const r = getSolApiStatus();
    expect(r.configured).toBe(false);
    expect(r.missing).toEqual([
      "SOLAPI_API_KEY",
      "SOLAPI_API_SECRET",
      "SOLAPI_SENDER_PHONE",
      "SOLAPI_KAKAO_PFID",
    ]);
  });

  it("일부 설정 · missing 3개", () => {
    process.env.SOLAPI_API_KEY = "k1";
    const r = getSolApiStatus();
    expect(r.configured).toBe(false);
    expect(r.missing).toEqual([
      "SOLAPI_API_SECRET",
      "SOLAPI_SENDER_PHONE",
      "SOLAPI_KAKAO_PFID",
    ]);
  });

  it("전체 설정 · configured=true · missing=[]", () => {
    process.env.SOLAPI_API_KEY = "k1";
    process.env.SOLAPI_API_SECRET = "s1";
    process.env.SOLAPI_SENDER_PHONE = "01000000000";
    process.env.SOLAPI_KAKAO_PFID = "pf1";
    const r = getSolApiStatus();
    expect(r.configured).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("TEMPLATE_ORDER 는 필수 아님 · 없어도 configured=true", () => {
    process.env.SOLAPI_API_KEY = "k1";
    process.env.SOLAPI_API_SECRET = "s1";
    process.env.SOLAPI_SENDER_PHONE = "01000000000";
    process.env.SOLAPI_KAKAO_PFID = "pf1";
    // TEMPLATE_ORDER 없음 · 여전히 true
    delete process.env.SOLAPI_KAKAO_TEMPLATE_ORDER;
    expect(getSolApiStatus().configured).toBe(true);
  });

  it("빈 문자열 · 미설정으로 판정", () => {
    process.env.SOLAPI_API_KEY = "";
    process.env.SOLAPI_API_SECRET = "s1";
    process.env.SOLAPI_SENDER_PHONE = "01000000000";
    process.env.SOLAPI_KAKAO_PFID = "pf1";
    const r = getSolApiStatus();
    expect(r.configured).toBe(false);
    expect(r.missing).toContain("SOLAPI_API_KEY");
  });
});

describe("handleSolApiStatus · Express handler", () => {
  let snap: Record<string, string | undefined>;
  beforeEach(() => { snap = snapshotEnv(); clearEnv(); });
  afterEach(() => restoreEnv(snap));

  function mockRes() {
    const json = vi.fn();
    return { json, status: vi.fn(() => ({ json })) } as any;
  }

  it("res.json 호출 · provider·configured·missing_env·docs·envVars 포함", () => {
    const req = {} as any;
    const res = mockRes();
    handleSolApiStatus(req, res);
    expect(res.json).toHaveBeenCalledOnce();
    const body = res.json.mock.calls[0][0];
    expect(body.provider).toBe("solapi");
    expect(body.configured).toBe(false);
    expect(body.missing_env).toContain("SOLAPI_API_KEY");
    expect(body.docs).toBeDefined();
    expect(body.envVars).toBeInstanceOf(Array);
    expect(body.envVars.length).toBe(5);
  });

  it("envVars · required=true 4개 · optional 1개", () => {
    const req = {} as any;
    const res = mockRes();
    handleSolApiStatus(req, res);
    const body = res.json.mock.calls[0][0];
    const requiredCount = body.envVars.filter((v: any) => v.required).length;
    const optionalCount = body.envVars.filter((v: any) => !v.required).length;
    expect(requiredCount).toBe(4);
    expect(optionalCount).toBe(1);
  });

  it("docs · signup/pricing/kakao_channel/guide URL 포함", () => {
    const req = {} as any;
    const res = mockRes();
    handleSolApiStatus(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.docs.signup).toContain("solapi.com");
    expect(body.docs.pricing).toContain("solapi.com");
    expect(body.docs.kakao_channel).toContain("kakao");
    expect(body.docs.guide).toContain("solapi");
  });

  it("설정 완료 · configured=true 반영", () => {
    process.env.SOLAPI_API_KEY = "k1";
    process.env.SOLAPI_API_SECRET = "s1";
    process.env.SOLAPI_SENDER_PHONE = "01000000000";
    process.env.SOLAPI_KAKAO_PFID = "pf1";
    const req = {} as any;
    const res = mockRes();
    handleSolApiStatus(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.configured).toBe(true);
    expect(body.missing_env).toEqual([]);
  });
});

describe("sendAlimtalk · 미설정 시 에러", () => {
  let snap: Record<string, string | undefined>;
  beforeEach(() => { snap = snapshotEnv(); clearEnv(); });
  afterEach(() => restoreEnv(snap));

  it("credentials 없음 · throw · 필요 env 나열", async () => {
    await expect(sendAlimtalk({
      to: "01012345678",
      templateId: "T1",
    })).rejects.toThrow(/SolAPI 미설정.*SOLAPI_API_KEY/);
  });
});
