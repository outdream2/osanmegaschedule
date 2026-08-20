// 2026-08-20 · supplierPayments · 순수 유틸 검증 (splitVat · toNumOrNull · isYmd · inferVatFromName · VALID_METHODS)
//   원본 파일: server/routes/purchase/supplierPayments.ts
//   module-scoped 헬퍼는 clientErrors 테스트와 동일 패턴으로 로직 사본 검증 (source 파일 변경 없음)
import { describe, it, expect } from "vitest";

// ── 원본 로직 사본 (server/routes/purchase/supplierPayments.ts) ────────

const VALID_METHODS = new Set(["transfer", "cash", "card", "check", "offset", "etc"]);

const toNumOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const isYmd = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

function splitVat(amount: number, vatIncluded: boolean | null): { vat: number; supply: number } {
  if (!Number.isFinite(amount) || amount <= 0) return { vat: 0, supply: 0 };
  const eff = vatIncluded === false ? false : true;
  if (eff) {
    const vat = Math.round(amount / 11);
    return { vat, supply: amount - vat };
  }
  const vat = Math.round(amount * 0.1);
  return { vat, supply: amount };
}

function inferVatFromName(name: string | null | undefined): boolean | null {
  if (!name) return null;
  return /vat\s*(미포함|별도|없음)/i.test(String(name)) ? false : null;
}

// ─── tests ───────────────────────────────────────────────────────────

describe("VALID_METHODS", () => {
  it("6개 결제수단", () => {
    expect(VALID_METHODS.size).toBe(6);
  });

  it("표준 수단 · transfer/cash/card/check/offset/etc", () => {
    expect(VALID_METHODS.has("transfer")).toBe(true);
    expect(VALID_METHODS.has("cash")).toBe(true);
    expect(VALID_METHODS.has("card")).toBe(true);
    expect(VALID_METHODS.has("check")).toBe(true);
    expect(VALID_METHODS.has("offset")).toBe(true);
    expect(VALID_METHODS.has("etc")).toBe(true);
  });

  it("정의되지 않은 수단 · false", () => {
    expect(VALID_METHODS.has("bitcoin")).toBe(false);
    expect(VALID_METHODS.has("")).toBe(false);
    expect(VALID_METHODS.has("TRANSFER")).toBe(false); // 대소문자 구분
  });
});

describe("toNumOrNull · 정상", () => {
  it("숫자 그대로", () => expect(toNumOrNull(1234)).toBe(1234));
  it("정수 문자열", () => expect(toNumOrNull("1234")).toBe(1234));
  it("소수 문자열", () => expect(toNumOrNull("12.5")).toBe(12.5));
  it("0", () => expect(toNumOrNull(0)).toBe(0));
  it("음수", () => expect(toNumOrNull(-100)).toBe(-100));
});

describe("toNumOrNull · null 반환", () => {
  it("null", () => expect(toNumOrNull(null)).toBe(null));
  it("undefined", () => expect(toNumOrNull(undefined)).toBe(null));
  it("빈 문자열", () => expect(toNumOrNull("")).toBe(null));
  it("NaN 문자열", () => expect(toNumOrNull("abc")).toBe(null));
  it("Infinity", () => expect(toNumOrNull(Infinity)).toBe(null));
  it("-Infinity", () => expect(toNumOrNull(-Infinity)).toBe(null));
});

describe("isYmd", () => {
  it("정상", () => expect(isYmd("2026-08-20")).toBe(true));
  it("잘못된 형식 · false", () => expect(isYmd("2026/08/20")).toBe(false));
  it("숫자 · false", () => expect(isYmd(20260820)).toBe(false));
  it("null · false", () => expect(isYmd(null)).toBe(false));
});

describe("splitVat · VAT 포함 (기본)", () => {
  it("11,000 · vatIncluded=true · vat=1000·supply=10000", () => {
    expect(splitVat(11000, true)).toEqual({ vat: 1000, supply: 10000 });
  });

  it("null → 기본 true 처리 · 11,000 · vat=1000", () => {
    expect(splitVat(11000, null)).toEqual({ vat: 1000, supply: 10000 });
  });

  it("110 · vat=10·supply=100", () => {
    expect(splitVat(110, true)).toEqual({ vat: 10, supply: 100 });
  });

  it("반올림 · 100 · vat=Round(100/11)=9·supply=91", () => {
    expect(splitVat(100, true)).toEqual({ vat: 9, supply: 91 });
  });
});

describe("splitVat · VAT 별도", () => {
  it("10,000 · vatIncluded=false · vat=1000·supply=10000", () => {
    expect(splitVat(10000, false)).toEqual({ vat: 1000, supply: 10000 });
  });

  it("반올림 · 105 · vat=Round(10.5)=11·supply=105", () => {
    expect(splitVat(105, false)).toEqual({ vat: 11, supply: 105 });
  });
});

describe("splitVat · 방어 (0/음수/NaN)", () => {
  it("0 · zeros", () => expect(splitVat(0, true)).toEqual({ vat: 0, supply: 0 }));
  it("음수 · zeros", () => expect(splitVat(-100, true)).toEqual({ vat: 0, supply: 0 }));
  it("NaN · zeros", () => expect(splitVat(NaN, true)).toEqual({ vat: 0, supply: 0 }));
  it("Infinity · zeros", () => expect(splitVat(Infinity, false)).toEqual({ vat: 0, supply: 0 }));
});

describe("inferVatFromName", () => {
  it("null · null", () => expect(inferVatFromName(null)).toBe(null));
  it("undefined · null", () => expect(inferVatFromName(undefined)).toBe(null));
  it("빈 문자열 · null", () => expect(inferVatFromName("")).toBe(null));
  it("일반 상호명 · null", () => expect(inferVatFromName("경방신약")).toBe(null));

  it("VAT미포함 표기 · false", () => {
    expect(inferVatFromName("경방신약 (VAT미포함)")).toBe(false);
  });

  it("VAT별도 표기 · false", () => {
    expect(inferVatFromName("에이비씨 vat별도")).toBe(false);
  });

  it("VAT없음 표기 · false", () => {
    expect(inferVatFromName("XYZ VAT 없음")).toBe(false);
  });

  it("대소문자 무관 · vat미포함 · false", () => {
    expect(inferVatFromName("xxx vat미포함")).toBe(false);
  });

  it("공백 있음 · vat  별도 · false", () => {
    expect(inferVatFromName("aa vat  별도")).toBe(false);
  });
});
