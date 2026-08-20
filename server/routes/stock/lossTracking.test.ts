// 2026-08-20 · lossTracking · 순수 날짜/에러 유틸 검증
//   원본 파일: server/routes/stock/lossTracking.ts (todayYmd · isYmd · daysAgoYmd · isMissingRelation)
//   해당 헬퍼는 module-scoped 이므로 clientErrors 테스트와 동일 패턴으로
//   테스트 파일에 로직을 그대로 옮겨 검증 (source 파일 변경 없음)
import { describe, it, expect } from "vitest";

// ── 원본 로직 사본 (server/routes/stock/lossTracking.ts) ─────────────

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function daysAgoYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function isMissingRelation(err: any): boolean {
  const msg = String(err?.message ?? err ?? "");
  return /relation|does not exist|schema cache/i.test(msg);
}

// ─── tests ───────────────────────────────────────────────────────────

describe("todayYmd", () => {
  it("YYYY-MM-DD 형식 · 10자", () => {
    const s = todayYmd();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.length).toBe(10);
  });

  it("월/일 · 2자리 zero-pad", () => {
    const s = todayYmd();
    const [, m, d] = s.split("-");
    expect(m.length).toBe(2);
    expect(d.length).toBe(2);
    expect(Number(m)).toBeGreaterThanOrEqual(1);
    expect(Number(m)).toBeLessThanOrEqual(12);
    expect(Number(d)).toBeGreaterThanOrEqual(1);
    expect(Number(d)).toBeLessThanOrEqual(31);
  });
});

describe("isYmd · 정상", () => {
  it("2026-08-20 · 성공", () => expect(isYmd("2026-08-20")).toBe(true));
  it("1999-01-01 · 성공", () => expect(isYmd("1999-01-01")).toBe(true));
  it("2100-12-31 · 성공", () => expect(isYmd("2100-12-31")).toBe(true));
});

describe("isYmd · 실패", () => {
  it("null · 실패", () => expect(isYmd(null)).toBe(false));
  it("undefined · 실패", () => expect(isYmd(undefined)).toBe(false));
  it("number · 실패", () => expect(isYmd(20260820)).toBe(false));
  it("한자리 월/일 · 실패", () => expect(isYmd("2026-8-20")).toBe(false));
  it("공백 포함 · 실패", () => expect(isYmd(" 2026-08-20")).toBe(false));
  it("시각 붙음 · 실패", () => expect(isYmd("2026-08-20T00:00")).toBe(false));
  it("빈 문자열 · 실패", () => expect(isYmd("")).toBe(false));
});

describe("daysAgoYmd", () => {
  it("0일전 = 오늘", () => {
    expect(daysAgoYmd(0)).toBe(todayYmd());
  });

  it("YYYY-MM-DD 형식 유지", () => {
    expect(daysAgoYmd(30)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("7일전 · 오늘보다 이전", () => {
    const past = daysAgoYmd(7);
    expect(past < todayYmd()).toBe(true);
  });

  it("365일전 · 정확히 1년 차이 (윤년 오차 허용)", () => {
    const past = daysAgoYmd(365);
    const [ty] = todayYmd().split("-").map(Number);
    const [py] = past.split("-").map(Number);
    // 대부분 1년 차이 (윤년일 경우 하루 어긋날 수 있음)
    expect([ty - 1, ty]).toContain(py);
  });
});

describe("isMissingRelation", () => {
  it("relation does not exist · true", () => {
    expect(isMissingRelation({ message: 'relation "foo" does not exist' })).toBe(true);
  });

  it("schema cache · true", () => {
    expect(isMissingRelation({ message: "Could not find in schema cache" })).toBe(true);
  });

  it("does not exist 단독 · true", () => {
    expect(isMissingRelation("column does not exist")).toBe(true);
  });

  it("일반 SQL 에러 · false", () => {
    expect(isMissingRelation({ message: "syntax error" })).toBe(false);
  });

  it("null · false", () => {
    expect(isMissingRelation(null)).toBe(false);
  });

  it("undefined · false", () => {
    expect(isMissingRelation(undefined)).toBe(false);
  });

  it("빈 객체 · false", () => {
    expect(isMissingRelation({})).toBe(false);
  });

  it("대소문자 혼합 · true (i 플래그)", () => {
    expect(isMissingRelation({ message: "RELATION xxx DOES NOT EXIST" })).toBe(true);
  });
});
