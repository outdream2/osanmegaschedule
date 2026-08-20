// 2026-08-20 · contractClauses · CLAUSE_KEYS/CLAUSE_KEY_SET/normalizeContent 검증
//   원본 파일: server/routes/staff/contractClauses.ts
//   module-scoped · 로직 사본 검증 (source 파일 변경 없음)
import { describe, it, expect } from "vitest";

// ── 원본 로직 사본 (server/routes/staff/contractClauses.ts) ─────────

const CLAUSE_KEYS = [
  "wageClauses",
  "workTimeClauses",
  "holidayClauses",
  "disciplineClauses",
  "etcClauses",
  "privacyClauses",
] as const;

const CLAUSE_KEY_SET = new Set<string>(CLAUSE_KEYS);

const MAX_ITEM_LEN = 4000;
const MAX_ITEMS = 200;

function normalizeContent(input: any): string[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_ITEMS) return null;
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") return null;
    if (v.length > MAX_ITEM_LEN) return null;
    out.push(v);
  }
  return out;
}

// ─── tests ───────────────────────────────────────────────────────────

describe("CLAUSE_KEYS", () => {
  it("정확히 6종", () => {
    expect(CLAUSE_KEYS.length).toBe(6);
  });

  it("필수 그룹 6개 모두 포함", () => {
    expect(CLAUSE_KEYS).toContain("wageClauses");
    expect(CLAUSE_KEYS).toContain("workTimeClauses");
    expect(CLAUSE_KEYS).toContain("holidayClauses");
    expect(CLAUSE_KEYS).toContain("disciplineClauses");
    expect(CLAUSE_KEYS).toContain("etcClauses");
    expect(CLAUSE_KEYS).toContain("privacyClauses");
  });

  it("중복 없음", () => {
    expect(new Set(CLAUSE_KEYS).size).toBe(CLAUSE_KEYS.length);
  });

  it("모두 camelCase · Clauses 접미사", () => {
    CLAUSE_KEYS.forEach((k) => expect(k).toMatch(/^[a-z][a-zA-Z]*Clauses$/));
  });
});

describe("CLAUSE_KEY_SET", () => {
  it("has() 로 빠른 조회", () => {
    expect(CLAUSE_KEY_SET.has("wageClauses")).toBe(true);
    expect(CLAUSE_KEY_SET.has("unknownClauses")).toBe(false);
  });

  it("CLAUSE_KEYS 와 동일 크기", () => {
    expect(CLAUSE_KEY_SET.size).toBe(CLAUSE_KEYS.length);
  });
});

describe("normalizeContent · 정상", () => {
  it("빈 배열 · []", () => {
    expect(normalizeContent([])).toEqual([]);
  });

  it("문자열 배열 · 그대로", () => {
    expect(normalizeContent(["조항1", "조항2"])).toEqual(["조항1", "조항2"]);
  });

  it("200개 (경계) · 성공", () => {
    const arr = Array.from({ length: 200 }, (_, i) => `c${i}`);
    expect(normalizeContent(arr)).toHaveLength(200);
  });

  it("4000자 (경계) · 성공", () => {
    const s = "x".repeat(4000);
    expect(normalizeContent([s])).toEqual([s]);
  });
});

describe("normalizeContent · null 반환 (거부)", () => {
  it("배열 아님 · null", () => {
    expect(normalizeContent("string")).toBe(null);
    expect(normalizeContent(123)).toBe(null);
    expect(normalizeContent({ a: 1 })).toBe(null);
    expect(normalizeContent(null)).toBe(null);
    expect(normalizeContent(undefined)).toBe(null);
  });

  it("201개 · null (MAX_ITEMS=200 초과)", () => {
    const arr = Array.from({ length: 201 }, (_, i) => `c${i}`);
    expect(normalizeContent(arr)).toBe(null);
  });

  it("4001자 항목 · null (MAX_ITEM_LEN=4000 초과)", () => {
    expect(normalizeContent(["x".repeat(4001)])).toBe(null);
  });

  it("문자열 아닌 원소 포함 · null", () => {
    expect(normalizeContent(["ok", 123])).toBe(null);
    expect(normalizeContent(["ok", null])).toBe(null);
    expect(normalizeContent(["ok", { x: 1 }])).toBe(null);
  });
});
